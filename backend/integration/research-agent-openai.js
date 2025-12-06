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
function getSystemPrompt() {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { 
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
  });
  
  const prompt = `You are Clustrix Research Assistant. You MUST use tools to gather information before answering.

CURRENT DATE: ${dateStr}

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

  console.log('[RESEARCH-OPENAI] getSystemPrompt: Generated', { dateStr, promptLength: prompt.length });
  console.log('[RESEARCH-OPENAI] SYSTEM_PROMPT:\n', prompt);
  return prompt;
}

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
    
    // Build request body - only include tools if provided
    const requestBody = {
      model,
      messages,
      stream: true
    };
    if (tools) {
      requestBody.tools = tools;
      requestBody.tool_choice = "auto";
    }
    
    const body = JSON.stringify(requestBody);
    
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
  console.log('[RESEARCH-OPENAI] processResearchRequest: ========== STARTING ==========');
  console.log('[RESEARCH-OPENAI] processResearchRequest: Input params', { 
    sessionId, 
    model, 
    baseUrl,
    hasApiKey: !!apiKey,
    filesCount: files.length,
    hasSearchConfig: !!searchApiConfig,
    hasProgressCallback: !!progressCallback,
    userQueryLength: userQuery.length,
    userQueryPreview: userQuery.substring(0, 100)
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
    { role: 'system', content: getSystemPrompt() },
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
    console.log('[RESEARCH-OPENAI] processResearchRequest: ========== ITERATION', iteration + 1, '==========');
    
    if (shouldCancel && shouldCancel()) {
      console.log('[RESEARCH-OPENAI] processResearchRequest: Cancelled by user');
      break;
    }
    
    if (iteration > 0) await new Promise(r => setTimeout(r, 500));
    
    console.log('[RESEARCH-OPENAI] processResearchRequest: Conversation history length', session.conversationHistory.length);
    console.log('[RESEARCH-OPENAI] processResearchRequest: MESSAGES:', JSON.stringify(session.conversationHistory, null, 2));
    
    // Call OpenAI
    let response;
    try {
      console.log('[RESEARCH-OPENAI] processResearchRequest: Calling OpenAI API...');
      response = await callOpenAI({
        baseUrl,
        apiKey,
        model,
        messages: session.conversationHistory,
        tools: RESEARCH_TOOLS_OPENAI,
        onTextChunk: null
      });
      console.log('[RESEARCH-OPENAI] processResearchRequest: OpenAI API call complete');
      console.log('[RESEARCH-OPENAI] processResearchRequest: RAW RESPONSE:', JSON.stringify(response, null, 2));
    } catch (error) {
      console.log('[RESEARCH-OPENAI] processResearchRequest: API ERROR', { error: error.message, stack: error.stack });
      if (progressCallback) {
        progressCallback({ type: 'error', content: error.message });
      }
      break;
    }
    
    const assistantMsg = response.message;
    session.conversationHistory.push(assistantMsg);
    
    console.log('[RESEARCH-OPENAI] processResearchRequest: Response analysis', {
      hasContent: !!assistantMsg.content,
      contentLength: assistantMsg.content?.length || 0,
      hasToolCalls: !!assistantMsg.tool_calls,
      toolCallsCount: assistantMsg.tool_calls?.length || 0,
      contentPreview: assistantMsg.content?.substring(0, 200) || 'none'
    });
    
    // No tool calls = final response
    if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
      finalResponse = assistantMsg.content || '';
      console.log('[RESEARCH-OPENAI] processResearchRequest: Final response (no tools)', { responseLength: finalResponse.length });
      break;
    }
    
    // Check if any tool call is synthesis
    const synthesisCall = assistantMsg.tool_calls.find(tc => {
      try {
        const args = JSON.parse(tc.function.arguments);
        return args.is_synthesis === true;
      } catch { return false; }
    });
    if (synthesisCall) {
      console.log('[RESEARCH-OPENAI] processResearchRequest: SYNTHESIS CALL DETECTED');
      
      // Build summary from all tool results in conversation history
      const findings = [];
      for (const msg of session.conversationHistory) {
        if (msg.role === 'tool') {
          findings.push(msg.content.substring(0, 2000));
        }
      }
      const summaryText = findings.join('\n\n---\n\n');
      console.log('[RESEARCH-OPENAI] processResearchRequest: Built findings summary', { findingsCount: findings.length, summaryLength: summaryText.length });
      
      // Create synthesis prompt for NEW agent call
      const synthesisPrompt = `Based on the research findings below, provide a comprehensive answer to the user's question.

USER QUESTION: ${userQuery}

RESEARCH FINDINGS:
${summaryText}

INSTRUCTIONS:
- Synthesize all findings into a clear, comprehensive response
- Use the user's language (Indonesian if they asked in Indonesian)
- Cite sources with [Title](URL) format
- Be thorough but concise
- Structure your response with clear sections if needed`;

      console.log('[RESEARCH-OPENAI] processResearchRequest: Calling NEW agent for synthesis...');
      
      // Send thinking status for synthesis
      if (progressCallback) {
        progressCallback({
          type: 'searching',
          data: { summarizedQuery: 'Synthesizing findings...' }
        });
      }
      
      // Call OpenAI with FRESH context (no tools, just synthesis)
      try {
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        
        const synthesisResponse = await callOpenAI({
          baseUrl,
          apiKey,
          model,
          messages: [
            { role: 'system', content: `You are a research assistant. Your task is to synthesize research findings into a comprehensive answer. Current date: ${dateStr}` },
            { role: 'user', content: synthesisPrompt }
          ],
          tools: null, // No tools for synthesis
          onTextChunk: progressCallback ? (chunk) => {
            progressCallback({ type: 'content', content: chunk });
          } : null
        });
        
        finalResponse = synthesisResponse.message?.content || '';
        console.log('[RESEARCH-OPENAI] processResearchRequest: Synthesis complete', { responseLength: finalResponse.length });
      } catch (synthError) {
        console.log('[RESEARCH-OPENAI] processResearchRequest: Synthesis error', { error: synthError.message });
        // Fallback to content from research phase
        finalResponse = assistantMsg.content || '';
      }
      
      break; // Exit the main iteration loop
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
      
      console.log('[RESEARCH-OPENAI] processResearchRequest: TOOL CALL', { toolName, params });
      
      // Use query/pattern as short title (NOT commentary which is too long)
      const shortTitle = params.query || params.pattern || params.file_name || params.url || toolName;
      if (!iterationCommentary) {
        iterationCommentary = shortTitle;
      }
      
      // Update thinking toggle with short title
      if (progressCallback) {
        progressCallback({
          type: 'searching',
          data: { summarizedQuery: shortTitle }
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
        commentary: params.commentary || '',
        count: Array.isArray(result.data) ? result.data.length : (result.success ? 1 : 0)
      });
    }
    
    // ONE thinking update per iteration
    // Title = short query/keyword, Content = tool output
    if (progressCallback && iterationResults.length > 0) {
      const combinedContent = iterationResults.map(r => 
        r.formattedResult.substring(0, 400)
      ).join('\n\n');
      
      progressCallback({
        type: 'thinking_log',
        entry: {
          stage: iterationCommentary,  // Short title (query keyword)
          text: combinedContent.substring(0, 1200)  // Tool output
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
