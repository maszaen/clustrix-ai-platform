// ===================================================================
// RESEARCH AGENT - OpenAI Native Tool Calling
// ===================================================================
//
// Refactored research agent using native OpenAI tool calling.
// - Uses internal search engine (DesktopSearchEngine)
// - Native tool_calls/tool results for context management
// - Thinking output via progressCallback (native frontend)
//
// ===================================================================

const https = require('https');
const { URL } = require('url');
const DesktopSearchEngine = require('../search/desktop-search-engine');
const { log: appLog } = require('../../utils/logger');
const {
  RESEARCH_TOOLS_OPENAI,
  executeResearchTool,
  formatToolResult
} = require('./research-tools');

function log(level, fn, msg, details = {}) {
  appLog('RESEARCH-OPENAI', level, fn, msg, details);
  // Also console.log for immediate visibility
  console.log(`[RESEARCH-OPENAI] ${fn}: ${msg}`, details);
}

// ===================================
// SYSTEM PROMPT
// ===================================
const RESEARCH_SYSTEM_PROMPT = `You are Clustrix Research Assistant. You MUST use tools to gather information before answering.

CRITICAL: You MUST call at least one tool before providing your final answer. Never answer directly without using tools first.

AVAILABLE TOOLS:
- web_search: Search the internet (use for current events, facts, research)
- fetch_webpage: Get detailed content from URLs
- search_files: Search patterns in uploaded files
- analyze_file: Analyze file structure
- list_files: List uploaded files

WORKFLOW (MANDATORY):
1. ALWAYS start by using tools to gather information
2. Use 2-4 tool calls to ensure comprehensive research
3. Only after gathering data, provide your final answer

RULES:
- NEVER skip tool usage - always research first
- If files are uploaded, use search_files or analyze_file
- If no files, use web_search
- Cite sources with [Title](URL) format
- Use the user's language (Indonesian/English)`;

// ===================================
// SESSION STATE
// ===================================
const researchSessions = new Map();

function getSession(sessionId) {
  if (!researchSessions.has(sessionId)) {
    researchSessions.set(sessionId, {
      searchEngine: new DesktopSearchEngine(null),
      conversationHistory: [],
      lastUsed: Date.now()
    });
  }
  const session = researchSessions.get(sessionId);
  session.lastUsed = Date.now();
  return session;
}

// ===================================
// OPENAI API CALL (STREAMING)
// ===================================
async function callOpenAI({ baseUrl, apiKey, model, messages, tools, onTextChunk }) {
  return new Promise((resolve, reject) => {
    const endpoint = new URL(baseUrl.replace(/\/?$/, '') + '/chat/completions');
    
    const body = JSON.stringify({
      model,
      messages,
      tools,
      tool_choice: "auto",
      stream: true
    });
    
    const req = https.request({
      method: 'POST',
      hostname: endpoint.hostname,
      port: endpoint.port || 443,
      path: endpoint.pathname,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        let errorData = '';
        res.on('data', chunk => errorData += chunk);
        res.on('end', () => reject(new Error(`HTTP ${res.statusCode}: ${errorData.slice(0, 500)}`)));
        return;
      }
      
      const fullMessage = { role: 'assistant', content: '', tool_calls: [] };
      const toolCallBuffers = new Map();
      let finishReason = null;
      let buffer = '';
      
      res.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr || jsonStr === '[DONE]') continue;
          
          try {
            const event = JSON.parse(jsonStr);
            const delta = event.choices?.[0]?.delta;
            if (!delta) continue;
            
            if (delta.content) {
              fullMessage.content += delta.content;
              if (onTextChunk) onTextChunk(delta.content);
            }
            
            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index;
                if (!toolCallBuffers.has(idx)) {
                  toolCallBuffers.set(idx, { id: '', type: 'function', function: { name: '', arguments: '' } });
                }
                const buf = toolCallBuffers.get(idx);
                if (tc.id) buf.id = tc.id;
                if (tc.function?.name) buf.function.name += tc.function.name;
                if (tc.function?.arguments) buf.function.arguments += tc.function.arguments;
              }
            }
            
            if (event.choices?.[0]?.finish_reason) {
              finishReason = event.choices[0].finish_reason;
            }
          } catch (e) {
            log(2, 'callOpenAI', 'Parse error', { error: e.message });
          }
        }
      });
      
      res.on('end', () => {
        if (toolCallBuffers.size > 0) {
          fullMessage.tool_calls = Array.from(toolCallBuffers.values());
        } else {
          delete fullMessage.tool_calls;
        }
        resolve({ message: fullMessage, finish_reason: finishReason });
      });
    });
    
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ===================================
// MAIN AGENT FUNCTION
// ===================================
async function processResearchRequest({
  sessionId,
  userQuery,
  baseUrl,
  apiKey,
  model,
  files = [],
  searchApiConfig = null,
  progressCallback = null,
  shouldCancel = null
}) {
  log(1, 'processResearchRequest', 'Starting', { 
    sessionId, 
    model, 
    baseUrl,
    hasApiKey: !!apiKey,
    filesCount: files.length,
    hasSearchConfig: !!searchApiConfig,
    hasProgressCallback: !!progressCallback
  });
  
  const session = getSession(sessionId);
  const usageBreakdown = [];
  
  // Load files into search engine
  if (files.length > 0) {
    session.searchEngine.loadProjectFiles(files);
  }
  // CRITICAL: Set search config BEFORE any web search
  // This ensures SerpAPI/Google is used, not DuckDuckGo fallback
  if (searchApiConfig) {
    log(1, 'processResearchRequest', 'Setting search config', { 
      provider: searchApiConfig.provider,
      hasSerpKey: !!searchApiConfig.serpApiKey,
      hasGoogleKey: !!searchApiConfig.googleApiKey
    });
    session.searchEngine.setSearchConfig(searchApiConfig);
  } else {
    log(2, 'processResearchRequest', 'No search config provided - web search may use fallback');
  }
  
  // Reset conversation for new request
  session.conversationHistory = [
    { role: 'system', content: RESEARCH_SYSTEM_PROMPT },
    { role: 'user', content: userQuery }
  ];
  
  const MAX_ITERATIONS = 15;
  let finalResponse = '';
  
  // Send initial searching status (like old agent)
  if (progressCallback) {
    progressCallback({
      type: 'searching',
      data: { summarizedQuery: `Analyzing: "${userQuery.substring(0, 50)}${userQuery.length > 50 ? '...' : ''}"` }
    });
  }
  
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    if (shouldCancel && shouldCancel()) {
      log(1, 'processResearchRequest', 'Cancelled');
      break;
    }
    
    if (iteration > 0) await new Promise(r => setTimeout(r, 500));
    
    log(1, 'processResearchRequest', `Iteration ${iteration + 1}`);
    
    // Call OpenAI
    let response;
    try {
      response = await callOpenAI({
        baseUrl,
        apiKey,
        model,
        messages: session.conversationHistory,
        tools: RESEARCH_TOOLS_OPENAI,
        onTextChunk: null // Text streaming handled by final response
      });
    } catch (error) {
      log(3, 'processResearchRequest', 'API Error', { error: error.message });
      if (progressCallback) {
        progressCallback({ type: 'error', content: error.message });
      }
      break;
    }
    
    const assistantMsg = response.message;
    session.conversationHistory.push(assistantMsg);
    
    log(1, 'processResearchRequest', 'API response received', {
      hasContent: !!assistantMsg.content,
      contentLength: assistantMsg.content?.length || 0,
      hasToolCalls: !!assistantMsg.tool_calls,
      toolCallsCount: assistantMsg.tool_calls?.length || 0
    });
    
    // No tool calls = final response
    if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
      finalResponse = assistantMsg.content || '';
      log(1, 'processResearchRequest', 'Final response (no tools)', { responseLength: finalResponse.length });
      break;
    }
    
    // Execute ALL tool calls in this iteration
    const iterationResults = [];
    let iterationCommentary = '';  // Short commentary for thinking toggle
    
    for (const toolCall of assistantMsg.tool_calls) {
      const toolName = toolCall.function.name;
      let params;
      try {
        params = JSON.parse(toolCall.function.arguments);
      } catch {
        params = {};
      }
      
      log(1, 'processResearchRequest', `Tool call: ${toolName}`, { params });
      
      // Check if this is synthesis call
      if (params.is_synthesis === true) {
        log(1, 'processResearchRequest', 'Synthesis requested, ending iteration loop');
        finalResponse = assistantMsg.content || '';
        break;
      }
      
      // Use AI's short commentary for thinking toggle
      const commentary = params.commentary || params.query || params.pattern || params.file_name || toolName;
      if (!iterationCommentary) {
        iterationCommentary = commentary;  // Use first tool's commentary
      }
      
      // Update thinking toggle with commentary (short text)
      if (progressCallback) {
        progressCallback({
          type: 'searching',
          data: { summarizedQuery: commentary }  // This updates thinking toggle text
        });
      }
      
      // Execute tool
      const result = await executeResearchTool(toolName, params, session.searchEngine);
      const formattedResult = formatToolResult(toolName, result);
      
      // Add tool result to conversation
      session.conversationHistory.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: formattedResult
      });
      
      iterationResults.push({
        toolName,
        result,
        formattedResult,
        commentary,
        count: Array.isArray(result.data) ? result.data.length : (result.success ? 1 : 0)
      });
    }
    
    // ONE thinking update per iteration
    if (progressCallback && iterationResults.length > 0) {
      // Title = short commentary (first tool's commentary)
      // Content = all tool outputs combined
      const combinedContent = iterationResults.map(r => 
        `${r.commentary}:\n${r.formattedResult.substring(0, 300)}`
      ).join('\n\n---\n\n');
      
      progressCallback({
        type: 'thinking_log',
        entry: {
          stage: iterationCommentary,  // Short title for thinking-update-title
          text: combinedContent.substring(0, 1000)  // Tool outputs for thinking-update-content
        }
      });
      
      // Send reading_complete
      const totalCount = iterationResults.reduce((sum, r) => sum + r.count, 0);
      progressCallback({
        type: 'reading_complete',
        data: {
          pageCount: totalCount,
          actionType: iterationCommentary,
          actionIndex: iteration,
          success: iterationResults.every(r => r.result.success)
        }
      });
    }
  }
  
  log(1, 'processResearchRequest', 'Complete', { 
    historyLength: session.conversationHistory.length,
    responseLength: finalResponse.length
  });
  
  return {
    response: finalResponse,
    usageBreakdown
  };
}

module.exports = {
  processResearchRequest
};
