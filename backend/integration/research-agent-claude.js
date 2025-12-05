// ===================================================================
// RESEARCH AGENT - Claude Native Tool Calling
// ===================================================================
//
// Refactored research agent using native Claude tool_use.
// - Uses internal search engine (DesktopSearchEngine)
// - Native tool_use/tool_result for context management
// - Thinking output via progressCallback (native frontend)
//
// ===================================================================

const https = require('https');
const { URL } = require('url');
const DesktopSearchEngine = require('../search/desktop-search-engine');
const { log: appLog } = require('../../utils/logger');
const {
  RESEARCH_TOOLS_CLAUDE,
  executeResearchTool,
  formatToolResult
} = require('./research-tools');

function log(level, fn, msg, details = {}) {
  appLog('RESEARCH-CLAUDE', level, fn, msg, details);
  console.log(`[RESEARCH-CLAUDE] ${fn}: ${msg}`, details);
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
// CLAUDE API CALL (STREAMING)
// ===================================
async function callClaude({ baseUrl, apiKey, model, system, messages, tools, onTextChunk }) {
  return new Promise((resolve, reject) => {
    let endpoint;
    try {
      let normalizedBase = baseUrl;
      if (!normalizedBase.includes('/v1')) {
        normalizedBase = normalizedBase.replace(/\/?$/, '/v1');
      }
      endpoint = new URL(normalizedBase.replace(/\/?$/, '') + '/messages');
    } catch (error) {
      reject(new Error(`Invalid base URL: ${baseUrl}`));
      return;
    }
    
    const body = JSON.stringify({
      model,
      max_tokens: 4096,
      system,
      messages,
      tools,
      stream: true
    });
    
    const req = https.request({
      method: 'POST',
      hostname: endpoint.hostname,
      port: endpoint.port || 443,
      path: endpoint.pathname,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        let errorData = '';
        res.on('data', chunk => errorData += chunk);
        res.on('end', () => reject(new Error(`HTTP ${res.statusCode}: ${errorData.slice(0, 500)}`)));
        return;
      }
      
      const fullResponse = {
        content: [],
        stop_reason: null,
        usage: { input_tokens: 0, output_tokens: 0 }
      };
      
      let currentContentBlock = null;
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
            
            switch (event.type) {
              case 'message_start':
                if (event.message?.usage) {
                  fullResponse.usage.input_tokens = event.message.usage.input_tokens || 0;
                }
                break;
                
              case 'content_block_start':
                currentContentBlock = event.content_block;
                if (currentContentBlock.type === 'text') {
                  currentContentBlock.text = '';
                } else if (currentContentBlock.type === 'tool_use') {
                  currentContentBlock.input = '';
                }
                break;
                
              case 'content_block_delta':
                if (event.delta?.type === 'text_delta' && currentContentBlock?.type === 'text') {
                  const textDelta = event.delta.text || '';
                  currentContentBlock.text += textDelta;
                  if (onTextChunk && textDelta) onTextChunk(textDelta);
                } else if (event.delta?.type === 'input_json_delta' && currentContentBlock?.type === 'tool_use') {
                  currentContentBlock.input += event.delta.partial_json || '';
                }
                break;
                
              case 'content_block_stop':
                if (currentContentBlock) {
                  if (currentContentBlock.type === 'tool_use' && typeof currentContentBlock.input === 'string') {
                    try {
                      currentContentBlock.input = JSON.parse(currentContentBlock.input || '{}');
                    } catch {
                      currentContentBlock.input = {};
                    }
                  }
                  fullResponse.content.push(currentContentBlock);
                }
                currentContentBlock = null;
                break;
                
              case 'message_delta':
                if (event.delta?.stop_reason) {
                  fullResponse.stop_reason = event.delta.stop_reason;
                }
                if (event.usage?.output_tokens) {
                  fullResponse.usage.output_tokens = event.usage.output_tokens;
                }
                break;
            }
          } catch (e) {
            log(2, 'callClaude', 'Parse error', { error: e.message });
          }
        }
      });
      
      res.on('end', () => resolve(fullResponse));
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
  log(1, 'processResearchRequest', 'Starting', { sessionId, model, filesCount: files.length });
  
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
    
    // Call Claude
    let response;
    try {
      response = await callClaude({
        baseUrl,
        apiKey,
        model,
        system: RESEARCH_SYSTEM_PROMPT,
        messages: session.conversationHistory,
        tools: RESEARCH_TOOLS_CLAUDE,
        onTextChunk: null // Text streaming handled by final response
      });
    } catch (error) {
      log(3, 'processResearchRequest', 'API Error', { error: error.message });
      if (progressCallback) {
        progressCallback({ type: 'error', content: error.message });
      }
      break;
    }
    
    // Track usage
    if (response.usage) {
      usageBreakdown.push({
        stage: `iteration-${iteration + 1}`,
        usage: response.usage,
        model
      });
    }
    
    // Add assistant response to history
    session.conversationHistory.push({
      role: 'assistant',
      content: response.content
    });
    
    // Extract text and tool_use blocks
    const textBlocks = response.content.filter(b => b.type === 'text');
    const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');
    
    // No tool calls = final response
    if (toolUseBlocks.length === 0) {
      finalResponse = textBlocks.map(b => b.text).join('\n');
      log(1, 'processResearchRequest', 'Final response received');
      break;
    }
    
    // Execute ALL tool calls in this iteration
    const toolResults = [];
    const iterationResults = [];
    let iterationCommentary = '';
    
    for (const toolUse of toolUseBlocks) {
      const toolName = toolUse.name;
      const params = toolUse.input || {};
      
      log(1, 'processResearchRequest', `Tool call: ${toolName}`, { params });
      
      // Check if this is synthesis call
      if (params.is_synthesis === true) {
        log(1, 'processResearchRequest', 'Synthesis requested');
        finalResponse = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
        break;
      }
      
      // Use AI's short commentary
      const commentary = params.commentary || params.query || params.pattern || params.file_name || toolName;
      if (!iterationCommentary) {
        iterationCommentary = commentary;
      }
      
      // Update thinking toggle
      if (progressCallback) {
        progressCallback({
          type: 'searching',
          data: { summarizedQuery: commentary }
        });
      }
      
      // Execute tool
      const result = await executeResearchTool(toolName, params, session.searchEngine);
      const formattedResult = formatToolResult(toolName, result);
      
      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
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
      const combinedContent = iterationResults.map(r => 
        `${r.commentary}:\n${r.formattedResult.substring(0, 300)}`
      ).join('\n\n---\n\n');
      
      progressCallback({
        type: 'thinking_log',
        entry: {
          stage: iterationCommentary,
          text: combinedContent.substring(0, 1000)
        }
      });
      
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
    
    // Add tool results to conversation
    session.conversationHistory.push({
      role: 'user',
      content: toolResults
    });
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
