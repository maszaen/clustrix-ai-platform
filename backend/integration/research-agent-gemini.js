// ===================================================================
// RESEARCH AGENT - Gemini Native Tool Calling
// ===================================================================
//
// Refactored research agent using native Gemini function calling.
// - Uses internal search engine (DesktopSearchEngine)
// - Native functionCall/functionResponse for context management
// - Thinking output via progressCallback (native frontend)
//
// ===================================================================

const https = require('https');
const { URL } = require('url');
const DesktopSearchEngine = require('../search/desktop-search-engine');
const { log: appLog } = require('../../utils/logger');
const {
  RESEARCH_TOOLS_GEMINI,
  executeResearchTool,
  formatToolResult
} = require('./research-tools');

function log(level, fn, msg, details = {}) {
  appLog('RESEARCH-GEMINI', level, fn, msg, details);
  console.log(`[RESEARCH-GEMINI] ${fn}: ${msg}`, details);
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
// GEMINI API CALL (STREAMING)
// ===================================
async function callGemini({ baseUrl, apiKey, model, contents, tools, systemInstruction, onTextChunk }) {
  return new Promise((resolve, reject) => {
    let endpoint;
    let isOpenAICompatible = false;
    
    try {
      if (baseUrl.includes('/v1/') && !baseUrl.includes('/v1beta/')) {
        isOpenAICompatible = true;
        endpoint = new URL(baseUrl.replace(/\/?$/, '') + '/chat/completions');
      } else {
        let normalizedBase = baseUrl.replace(/\/?$/, '');
        if (!normalizedBase.includes('/v1beta')) {
          normalizedBase += '/v1beta';
        }
        endpoint = new URL(`${normalizedBase}/models/${model}:streamGenerateContent`);
        endpoint.searchParams.set('key', apiKey);
        endpoint.searchParams.set('alt', 'sse');
      }
    } catch (error) {
      reject(new Error(`Invalid base URL: ${baseUrl}`));
      return;
    }
    
    let body, headers;
    
    if (isOpenAICompatible) {
      const messages = [
        { role: 'system', content: systemInstruction },
        ...contents.map(c => ({
          role: c.role === 'model' ? 'assistant' : c.role,
          content: c.parts?.map(p => p.text || '').join('') || ''
        }))
      ];
      
      body = JSON.stringify({
        model,
        messages,
        tools: tools?.[0]?.functionDeclarations?.map(fn => ({
          type: 'function',
          function: fn
        })),
        tool_choice: 'auto',
        stream: true
      });
      
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(body)
      };
    } else {
      body = JSON.stringify({
        contents,
        tools,
        systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
        generationConfig: { maxOutputTokens: 8192, temperature: 0.7 }
      });
      
      headers = {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      };
    }
    
    const req = https.request({
      method: 'POST',
      hostname: endpoint.hostname,
      port: endpoint.port || 443,
      path: endpoint.pathname + endpoint.search,
      headers
    }, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        let errorData = '';
        res.on('data', chunk => errorData += chunk);
        res.on('end', () => reject(new Error(`HTTP ${res.statusCode}: ${errorData.slice(0, 500)}`)));
        return;
      }
      
      const fullResponse = {
        candidates: [{
          content: { role: 'model', parts: [] },
          finishReason: 'STOP'
        }],
        usageMetadata: { promptTokenCount: 0, candidatesTokenCount: 0 }
      };
      
      let accumulatedText = '';
      const functionCalls = [];
      let buffer = '';
      
      res.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;
          
          try {
            const event = JSON.parse(jsonStr);
            
            if (isOpenAICompatible) {
              const delta = event.choices?.[0]?.delta;
              if (delta?.content) {
                accumulatedText += delta.content;
                if (onTextChunk) onTextChunk(delta.content);
              }
              if (event.choices?.[0]?.finish_reason) {
                fullResponse.candidates[0].finishReason = 
                  event.choices[0].finish_reason === 'tool_calls' ? 'TOOL_CALLS' : 'STOP';
              }
            } else {
              const candidate = event.candidates?.[0];
              if (candidate?.content?.parts) {
                for (const part of candidate.content.parts) {
                  if (part.text) {
                    accumulatedText += part.text;
                    if (onTextChunk) onTextChunk(part.text);
                  }
                  if (part.functionCall) {
                    functionCalls.push(part.functionCall);
                  }
                }
              }
              if (candidate?.finishReason) {
                fullResponse.candidates[0].finishReason = candidate.finishReason;
              }
              if (event.usageMetadata) {
                fullResponse.usageMetadata = event.usageMetadata;
              }
            }
          } catch (e) {
            log(2, 'callGemini', 'Parse error', { error: e.message });
          }
        }
      });
      
      res.on('end', () => {
        if (accumulatedText) {
          fullResponse.candidates[0].content.parts.push({ text: accumulatedText });
        }
        for (const fc of functionCalls) {
          fullResponse.candidates[0].content.parts.push({ functionCall: fc });
        }
        resolve(fullResponse);
      });
    });
    
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ===================================
// BUILD GEMINI CONTENTS
// ===================================
function buildContents(conversationHistory) {
  const contents = [];
  
  for (const msg of conversationHistory) {
    if (msg.role === 'user') {
      if (Array.isArray(msg.parts)) {
        contents.push(msg);
      } else {
        contents.push({
          role: 'user',
          parts: [{ text: msg.content || msg.text || '' }]
        });
      }
    } else if (msg.role === 'model' || msg.role === 'assistant') {
      if (Array.isArray(msg.parts)) {
        contents.push({ role: 'model', parts: msg.parts });
      } else {
        contents.push({
          role: 'model',
          parts: [{ text: msg.content || msg.text || '' }]
        });
      }
    } else if (msg.role === 'function') {
      contents.push({
        role: 'user',
        parts: [{
          functionResponse: {
            name: msg.name,
            response: { result: msg.content || msg.output || '' }
          }
        }]
      });
    }
  }
  
  return contents;
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
    
    // Build contents
    const contents = buildContents(session.conversationHistory);
    
    // Call Gemini
    let response;
    try {
      response = await callGemini({
        baseUrl,
        apiKey,
        model,
        contents,
        tools: RESEARCH_TOOLS_GEMINI,
        systemInstruction: RESEARCH_SYSTEM_PROMPT,
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
    if (response.usageMetadata) {
      usageBreakdown.push({
        stage: `iteration-${iteration + 1}`,
        usage: {
          prompt_tokens: response.usageMetadata.promptTokenCount,
          completion_tokens: response.usageMetadata.candidatesTokenCount
        },
        model
      });
    }
    
    const candidate = response.candidates?.[0];
    if (!candidate?.content?.parts) {
      log(2, 'processResearchRequest', 'No content in response');
      break;
    }
    
    // Add assistant response to history
    session.conversationHistory.push({
      role: 'model',
      parts: candidate.content.parts
    });
    
    // Extract text and function calls
    const textParts = candidate.content.parts.filter(p => p.text);
    const functionCalls = candidate.content.parts.filter(p => p.functionCall);
    
    // No function calls = final response
    if (functionCalls.length === 0) {
      finalResponse = textParts.map(p => p.text).join('\n');
      log(1, 'processResearchRequest', 'Final response received');
      break;
    }
    
    // Execute ALL function calls in this iteration
    const iterationResults = [];
    let iterationCommentary = '';
    
    for (const fc of functionCalls) {
      const toolName = fc.functionCall.name;
      const params = fc.functionCall.args || {};
      
      log(1, 'processResearchRequest', `Tool call: ${toolName}`, { params });
      
      // Check if this is synthesis call
      if (params.is_synthesis === true) {
        log(1, 'processResearchRequest', 'Synthesis requested');
        finalResponse = textParts.map(p => p.text).join('\n');
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
      
      // Add function response to conversation
      session.conversationHistory.push({
        role: 'function',
        name: toolName,
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
