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
function getSystemPrompt() {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { 
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
  });
  
  const promptText = `You are Clustrix Research Assistant. You MUST use tools to gather information before answering.

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

  console.log('[RESEARCH-CLAUDE] getSystemPrompt: Generated', { dateStr, promptLength: promptText.length });
  
  // Return as array with cache_control (same as coding agent)
  return [
    {
      type: 'text',
      text: promptText,
      cache_control: { type: 'ephemeral' }
    }
  ];
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
    
    // Build request body - only include tools if provided
    const requestBody = {
      model,
      max_tokens: 4096,
      system,
      messages,
      stream: true
    };
    if (tools) {
      requestBody.tools = tools;
    }
    
    const body = JSON.stringify(requestBody);
    
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
  console.log('[RESEARCH-CLAUDE] processResearchRequest: ========== STARTING ==========');
  console.log('[RESEARCH-CLAUDE] processResearchRequest: Input params', { 
    sessionId, 
    model, 
    baseUrl,
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
    console.log('[RESEARCH-CLAUDE] processResearchRequest: Loading files', { count: files.length });
    session.searchEngine.loadProjectFiles(files);
  }
  
  // CRITICAL: Set search config BEFORE any web search
  if (searchApiConfig) {
    console.log('[RESEARCH-CLAUDE] processResearchRequest: Setting search config', { 
      provider: searchApiConfig.provider,
      hasSerpKey: !!searchApiConfig.serpApiKey,
      hasGoogleKey: !!searchApiConfig.googleApiKey
    });
    session.searchEngine.setSearchConfig(searchApiConfig);
  } else {
    console.log('[RESEARCH-CLAUDE] processResearchRequest: WARNING - No search config provided');
  }
  
  // Reset conversation for new request
  session.conversationHistory = [
    { role: 'user', content: userQuery }
  ];
  console.log('[RESEARCH-CLAUDE] processResearchRequest: Conversation initialized');
  
  const MAX_ITERATIONS = 15;
  let finalResponse = '';
  
  // Send initial searching status
  if (progressCallback) {
    console.log('[RESEARCH-CLAUDE] processResearchRequest: Sending initial searching status');
    progressCallback({
      type: 'searching',
      data: { summarizedQuery: `Analyzing: "${userQuery.substring(0, 50)}${userQuery.length > 50 ? '...' : ''}"` }
    });
  }
  
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    console.log('[RESEARCH-CLAUDE] processResearchRequest: ========== ITERATION', iteration + 1, '==========');
    
    if (shouldCancel && shouldCancel()) {
      console.log('[RESEARCH-CLAUDE] processResearchRequest: Cancelled by user');
      break;
    }
    
    if (iteration > 0) await new Promise(r => setTimeout(r, 500));
    
    // Call Claude
    let response;
    try {
      console.log('[RESEARCH-CLAUDE] processResearchRequest: Calling Claude API...');
      console.log('[RESEARCH-CLAUDE] processResearchRequest: MESSAGES:', JSON.stringify(session.conversationHistory, null, 2));
      response = await callClaude({
        baseUrl,
        apiKey,
        model,
        system: getSystemPrompt(),
        messages: session.conversationHistory,
        tools: RESEARCH_TOOLS_CLAUDE,
        onTextChunk: null
      });
      console.log('[RESEARCH-CLAUDE] processResearchRequest: Claude API call complete');
      console.log('[RESEARCH-CLAUDE] processResearchRequest: RAW RESPONSE:', JSON.stringify(response, null, 2));
    } catch (error) {
      console.log('[RESEARCH-CLAUDE] processResearchRequest: API ERROR', { error: error.message, stack: error.stack });
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
      console.log('[RESEARCH-CLAUDE] processResearchRequest: Final response (no tools)', { responseLength: finalResponse.length });
      break;
    }
    
    // Check if any tool call is synthesis
    const synthesisCall = toolUseBlocks.find(tu => tu.input?.is_synthesis === true);
    if (synthesisCall) {
      console.log('[RESEARCH-CLAUDE] processResearchRequest: SYNTHESIS CALL DETECTED');
      
      // Build summary from all tool results in conversation history
      const findings = [];
      for (const msg of session.conversationHistory) {
        if (msg.role === 'user' && Array.isArray(msg.content)) {
          for (const block of msg.content) {
            if (block.type === 'tool_result') {
              findings.push(block.content.substring(0, 2000));
            }
          }
        }
      }
      const summaryText = findings.join('\n\n---\n\n');
      console.log('[RESEARCH-CLAUDE] processResearchRequest: Built findings summary', { findingsCount: findings.length, summaryLength: summaryText.length });
      
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

      console.log('[RESEARCH-CLAUDE] processResearchRequest: Calling NEW agent for synthesis...');
      
      // Send thinking status for synthesis
      if (progressCallback) {
        progressCallback({
          type: 'searching',
          data: { summarizedQuery: 'Synthesizing findings...' }
        });
      }
      
      // Call Claude with FRESH context (no tools, just synthesis)
      try {
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        
        const synthesisResponse = await callClaude({
          baseUrl,
          apiKey,
          model,
          system: `You are a research assistant. Your task is to synthesize research findings into a comprehensive answer. Current date: ${dateStr}`,
          messages: [{ role: 'user', content: synthesisPrompt }],
          tools: null, // No tools for synthesis
          onTextChunk: progressCallback ? (chunk) => {
            progressCallback({ type: 'content', content: chunk });
          } : null
        });
        
        // Track synthesis usage
        if (synthesisResponse.usage) {
          usageBreakdown.push({
            stage: 'synthesis',
            usage: synthesisResponse.usage,
            model
          });
        }
        
        const synthTextBlocks = synthesisResponse.content?.filter(b => b.type === 'text') || [];
        finalResponse = synthTextBlocks.map(b => b.text).join('\n');
        
        console.log('[RESEARCH-CLAUDE] processResearchRequest: Synthesis complete', { responseLength: finalResponse.length });
      } catch (synthError) {
        console.log('[RESEARCH-CLAUDE] processResearchRequest: Synthesis error', { error: synthError.message });
        // Fallback to text from research phase
        finalResponse = textBlocks.map(b => b.text).join('\n');
      }
      
      break; // Exit the main iteration loop
    }
    
    // Execute ALL tool calls in this iteration
    const toolResults = [];
    const iterationResults = [];
    let iterationCommentary = '';
    
    for (const toolUse of toolUseBlocks) {
      const toolName = toolUse.name;
      const params = toolUse.input || {};
      
      console.log('[RESEARCH-CLAUDE] processResearchRequest: TOOL CALL', { toolName, params });
      
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
      
      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
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
