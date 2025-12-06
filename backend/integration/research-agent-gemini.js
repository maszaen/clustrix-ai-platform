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

  console.log('[RESEARCH-GEMINI] getSystemPrompt: Generated system prompt', { dateStr, promptLength: prompt.length });
  console.log('[RESEARCH-GEMINI] SYSTEM_PROMPT:\n', prompt);
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
// GEMINI API CALL (STREAMING)
// ===================================
async function callGemini({ baseUrl, apiKey, model, contents, tools, systemInstruction, onTextChunk, onThinkingChunk }) {
  console.log('[RESEARCH-GEMINI] callGemini: Starting API call', { 
    baseUrl, 
    model, 
    contentsLength: contents.length,
    hasTools: !!tools,
    hasSystemInstruction: !!systemInstruction
  });
  
  return new Promise((resolve, reject) => {
    let endpoint;
    let isOpenAICompatible = false;
    
    try {
      if (baseUrl.includes('/v1/') && !baseUrl.includes('/v1beta/')) {
        isOpenAICompatible = true;
        endpoint = new URL(baseUrl.replace(/\/?$/, '') + '/chat/completions');
        console.log('[RESEARCH-GEMINI] callGemini: Using OpenAI-compatible endpoint', { endpoint: endpoint.href });
      } else {
        let normalizedBase = baseUrl.replace(/\/?$/, '');
        if (!normalizedBase.includes('/v1beta')) {
          normalizedBase += '/v1beta';
        }
        endpoint = new URL(`${normalizedBase}/models/${model}:streamGenerateContent`);
        endpoint.searchParams.set('key', apiKey);
        endpoint.searchParams.set('alt', 'sse');
        console.log('[RESEARCH-GEMINI] callGemini: Using Gemini native endpoint', { endpoint: endpoint.href });
      }
    } catch (error) {
      console.log('[RESEARCH-GEMINI] callGemini: Invalid base URL', { baseUrl, error: error.message });
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
      // Build request body for Gemini native
      const requestBody = {
        contents,
        systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
        generationConfig: { 
          maxOutputTokens: 8192, 
          temperature: 0.7,
          // Enable thinking output for Gemini 2.5 Pro
          thinkingConfig: {
            includeThoughts: true
          }
        }
      };
      // Only include tools if provided
      if (tools) {
        requestBody.tools = tools;
      }
      body = JSON.stringify(requestBody);
      
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
            console.log('[RESEARCH-GEMINI] callGemini: RAW SSE EVENT:', JSON.stringify(event, null, 2));
            
            if (isOpenAICompatible) {
              const delta = event.choices?.[0]?.delta;
              if (delta?.content) {
                accumulatedText += delta.content;
                console.log('[RESEARCH-GEMINI] callGemini: OpenAI text chunk', { chunkLength: delta.content.length });
                if (onTextChunk) onTextChunk(delta.content);
              }
              if (event.choices?.[0]?.finish_reason) {
                fullResponse.candidates[0].finishReason = 
                  event.choices[0].finish_reason === 'tool_calls' ? 'TOOL_CALLS' : 'STOP';
                console.log('[RESEARCH-GEMINI] callGemini: OpenAI finish reason', { reason: event.choices[0].finish_reason });
              }
            } else {
              const candidate = event.candidates?.[0];
              if (candidate?.content?.parts) {
                console.log('[RESEARCH-GEMINI] callGemini: Gemini parts received', { partsCount: candidate.content.parts.length });
                for (const part of candidate.content.parts) {
                  console.log('[RESEARCH-GEMINI] callGemini: Processing part', { 
                    hasText: !!part.text, 
                    hasThought: !!part.thought,
                    hasFunctionCall: !!part.functionCall,
                    partKeys: Object.keys(part)
                  });
                  
                  // Check if this is a thinking part (thought=true means text is thinking content)
                  if (part.thought === true && part.text) {
                    console.log('[RESEARCH-GEMINI] callGemini: NATIVE THINKING DETECTED', { textLength: part.text.length, preview: part.text.substring(0, 200) });
                    if (onThinkingChunk) onThinkingChunk(part.text);
                    // Don't add thinking to accumulated response, skip to next part
                    continue;
                  }
                  
                  // Regular text content (not thinking)
                  if (part.text) {
                    accumulatedText += part.text;
                    console.log('[RESEARCH-GEMINI] callGemini: Text chunk', { textLength: part.text.length, preview: part.text.substring(0, 100) });
                    if (onTextChunk) onTextChunk(part.text);
                  }
                  
                  if (part.functionCall) {
                    console.log('[RESEARCH-GEMINI] callGemini: Function call detected', { name: part.functionCall.name, args: part.functionCall.args });
                    functionCalls.push(part.functionCall);
                  }
                }
              }
              // Also check for thoughts at candidate level
              if (candidate?.groundingMetadata?.thoughtsText) {
                console.log('[RESEARCH-GEMINI] callGemini: GROUNDING THOUGHTS DETECTED', { thoughtsLength: candidate.groundingMetadata.thoughtsText.length });
                if (onThinkingChunk) onThinkingChunk(candidate.groundingMetadata.thoughtsText);
              }
              if (candidate?.finishReason) {
                fullResponse.candidates[0].finishReason = candidate.finishReason;
                console.log('[RESEARCH-GEMINI] callGemini: Gemini finish reason', { reason: candidate.finishReason });
              }
              if (event.usageMetadata) {
                fullResponse.usageMetadata = event.usageMetadata;
                console.log('[RESEARCH-GEMINI] callGemini: Usage metadata', event.usageMetadata);
              }
            }
          } catch (e) {
            console.log('[RESEARCH-GEMINI] callGemini: Parse error', { error: e.message, jsonStr: jsonStr.substring(0, 200) });
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
        console.log('[RESEARCH-GEMINI] callGemini: Response complete', {
          textLength: accumulatedText.length,
          functionCallsCount: functionCalls.length,
          finishReason: fullResponse.candidates[0].finishReason,
          usage: fullResponse.usageMetadata
        });
        console.log('[RESEARCH-GEMINI] callGemini: FULL RESPONSE:', JSON.stringify(fullResponse, null, 2));
        resolve(fullResponse);
      });
    });
    
    req.on('error', (err) => {
      console.log('[RESEARCH-GEMINI] callGemini: Request error', { error: err.message });
      reject(err);
    });
    console.log('[RESEARCH-GEMINI] callGemini: Sending request body', { bodyLength: body.length });
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
  console.log('[RESEARCH-GEMINI] processResearchRequest: ========== STARTING ==========');
  console.log('[RESEARCH-GEMINI] processResearchRequest: Input params', { 
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
    console.log('[RESEARCH-GEMINI] processResearchRequest: Loading files', { count: files.length, names: files.map(f => f.name) });
    session.searchEngine.loadProjectFiles(files);
  }
  
  // CRITICAL: Set search config BEFORE any web search
  if (searchApiConfig) {
    console.log('[RESEARCH-GEMINI] processResearchRequest: Setting search config', { 
      provider: searchApiConfig.provider,
      hasSerpKey: !!searchApiConfig.serpApiKey,
      hasGoogleKey: !!searchApiConfig.googleApiKey
    });
    session.searchEngine.setSearchConfig(searchApiConfig);
  } else {
    console.log('[RESEARCH-GEMINI] processResearchRequest: WARNING - No search config provided');
  }
  
  // Reset conversation for new request
  session.conversationHistory = [
    { role: 'user', content: userQuery }
  ];
  console.log('[RESEARCH-GEMINI] processResearchRequest: Conversation initialized', { historyLength: session.conversationHistory.length });
  
  const MAX_ITERATIONS = 15;
  let finalResponse = '';
  
  // Send initial searching status
  if (progressCallback) {
    console.log('[RESEARCH-GEMINI] processResearchRequest: Sending initial searching status');
    progressCallback({
      type: 'searching',
      data: { summarizedQuery: `Analyzing: "${userQuery.substring(0, 50)}${userQuery.length > 50 ? '...' : ''}"` }
    });
  }
  
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    console.log('[RESEARCH-GEMINI] processResearchRequest: ========== ITERATION', iteration + 1, '==========');
    
    if (shouldCancel && shouldCancel()) {
      console.log('[RESEARCH-GEMINI] processResearchRequest: Cancelled by user');
      break;
    }
    
    if (iteration > 0) await new Promise(r => setTimeout(r, 500));
    
    // Build contents
    const contents = buildContents(session.conversationHistory);
    console.log('[RESEARCH-GEMINI] processResearchRequest: Built contents', { contentsLength: contents.length });
    console.log('[RESEARCH-GEMINI] processResearchRequest: CONTENTS:', JSON.stringify(contents, null, 2));
    
    // Call Gemini
    let response;
    try {
      console.log('[RESEARCH-GEMINI] processResearchRequest: Calling Gemini API...');
      response = await callGemini({
        baseUrl,
        apiKey,
        model,
        contents,
        tools: RESEARCH_TOOLS_GEMINI,
        systemInstruction: getSystemPrompt(),
        onTextChunk: progressCallback ? (chunk) => {
          // Stream text content to UI
          progressCallback({ type: 'content', content: chunk });
        } : null,
        onThinkingChunk: progressCallback ? (chunk) => {
          console.log('[RESEARCH-GEMINI] processResearchRequest: NATIVE THINKING CHUNK RECEIVED', { chunkLength: chunk.length, preview: chunk.substring(0, 200) });
          progressCallback({
            type: 'thinking_stream',
            content: chunk
          });
        } : null
      });
      console.log('[RESEARCH-GEMINI] processResearchRequest: Gemini API call complete');
    } catch (error) {
      console.log('[RESEARCH-GEMINI] processResearchRequest: API ERROR', { error: error.message, stack: error.stack });
      if (progressCallback) {
        progressCallback({ type: 'error', content: error.message });
      }
      break;
    }
    
    // Track usage
    if (response.usageMetadata) {
      console.log('[RESEARCH-GEMINI] processResearchRequest: Usage', response.usageMetadata);
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
      console.log('[RESEARCH-GEMINI] processResearchRequest: No content in response, breaking');
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
    
    console.log('[RESEARCH-GEMINI] processResearchRequest: Response analysis', {
      textPartsCount: textParts.length,
      functionCallsCount: functionCalls.length,
      textPreview: textParts.length > 0 ? textParts[0].text.substring(0, 200) : 'none'
    });
    
    // No function calls = final response (synthesis phase)
    if (functionCalls.length === 0) {
      finalResponse = textParts.map(p => p.text).join('\n');
      console.log('[RESEARCH-GEMINI] processResearchRequest: SYNTHESIS COMPLETE - No more function calls');
      console.log('[RESEARCH-GEMINI] processResearchRequest: Final response length', finalResponse.length);
      break;
    }
    
    // Check if any function call is synthesis
    const synthesisCall = functionCalls.find(fc => fc.functionCall.args?.is_synthesis === true);
    if (synthesisCall) {
      console.log('[RESEARCH-GEMINI] processResearchRequest: SYNTHESIS CALL DETECTED');
      
      // Build summary from all findings in conversation history
      const findings = [];
      for (const msg of session.conversationHistory) {
        if (msg.role === 'function') {
          findings.push(`[${msg.name}]: ${msg.content.substring(0, 2000)}`);
        }
      }
      const summaryText = findings.join('\n\n---\n\n');
      console.log('[RESEARCH-GEMINI] processResearchRequest: Built findings summary', { findingsCount: findings.length, summaryLength: summaryText.length });
      
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

      console.log('[RESEARCH-GEMINI] processResearchRequest: Calling NEW agent for synthesis...');
      
      // Send thinking status for synthesis
      if (progressCallback) {
        progressCallback({
          type: 'searching',
          data: { summarizedQuery: 'Synthesizing findings...' }
        });
      }
      
      // Call Gemini with FRESH context (no tools, just synthesis)
      try {
        const synthesisResponse = await callGemini({
          baseUrl,
          apiKey,
          model,
          contents: [{ role: 'user', parts: [{ text: synthesisPrompt }] }],
          tools: null, // No tools for synthesis
          systemInstruction: `You are a research assistant. Your task is to synthesize research findings into a comprehensive answer. Current date: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`,
          onTextChunk: progressCallback ? (chunk) => {
            progressCallback({ type: 'content', content: chunk });
          } : null,
          onThinkingChunk: progressCallback ? (chunk) => {
            console.log('[RESEARCH-GEMINI] processResearchRequest: SYNTHESIS THINKING CHUNK', { chunkLength: chunk.length });
            progressCallback({ type: 'thinking_stream', content: chunk });
          } : null
        });
        
        // Track synthesis usage
        if (synthesisResponse.usageMetadata) {
          usageBreakdown.push({
            stage: 'synthesis',
            usage: {
              prompt_tokens: synthesisResponse.usageMetadata.promptTokenCount,
              completion_tokens: synthesisResponse.usageMetadata.candidatesTokenCount
            },
            model
          });
        }
        
        const synthCandidate = synthesisResponse.candidates?.[0];
        if (synthCandidate?.content?.parts) {
          finalResponse = synthCandidate.content.parts
            .filter(p => p.text)
            .map(p => p.text)
            .join('\n');
        }
        
        console.log('[RESEARCH-GEMINI] processResearchRequest: Synthesis complete', { responseLength: finalResponse.length });
      } catch (synthError) {
        console.log('[RESEARCH-GEMINI] processResearchRequest: Synthesis error', { error: synthError.message });
        // Fallback to text from research phase
        finalResponse = textParts.map(p => p.text).join('\n');
      }
      
      break; // Exit the main iteration loop
    }
    
    // Execute each function call - ONE thinking-update per tool
    console.log('[RESEARCH-GEMINI] processResearchRequest: Executing', functionCalls.length, 'function calls');
    
    for (const fc of functionCalls) {
      const toolName = fc.functionCall.name;
      const params = fc.functionCall.args || {};
      
      console.log('[RESEARCH-GEMINI] processResearchRequest: TOOL CALL', { toolName, params });
      
      // Title = query/pattern (short keyword)
      const shortTitle = params.query || params.pattern || params.file_name || params.url || toolName;
      const commentary = params.commentary || '';
      
      console.log('[RESEARCH-GEMINI] processResearchRequest: Tool metadata', { shortTitle, commentary });
      
      // Update thinking toggle
      if (progressCallback) {
        console.log('[RESEARCH-GEMINI] processResearchRequest: Sending searching status', { summarizedQuery: shortTitle });
        progressCallback({
          type: 'searching',
          data: { summarizedQuery: shortTitle }
        });
      }
      
      // Execute tool
      console.log('[RESEARCH-GEMINI] processResearchRequest: Executing tool', toolName);
      const result = await executeResearchTool(toolName, params, session.searchEngine);
      const formattedResult = formatToolResult(toolName, result);
      
      console.log('[RESEARCH-GEMINI] processResearchRequest: Tool result', { 
        success: result.success, 
        dataLength: Array.isArray(result.data) ? result.data.length : 'N/A',
        formattedResultLength: formattedResult.length
      });
      
      // Add function response to conversation
      session.conversationHistory.push({
        role: 'function',
        name: toolName,
        content: formattedResult
      });
      
      // ONE thinking-update per tool
      if (progressCallback) {
        console.log('[RESEARCH-GEMINI] processResearchRequest: Sending thinking_log', { stage: shortTitle, text: commentary });
        progressCallback({
          type: 'thinking_log',
          entry: {
            stage: shortTitle,
            text: commentary
          }
        });
        
        const resultCount = Array.isArray(result.data) ? result.data.length : (result.success ? 1 : 0);
        console.log('[RESEARCH-GEMINI] processResearchRequest: Sending reading_complete', { pageCount: resultCount });
        progressCallback({
          type: 'reading_complete',
          data: {
            pageCount: resultCount,
            actionType: shortTitle,
            actionIndex: iteration,
            success: result.success
          }
        });
      }
    }
  }
  
  console.log('[RESEARCH-GEMINI] processResearchRequest: ========== COMPLETE ==========');
  console.log('[RESEARCH-GEMINI] processResearchRequest: Final stats', { 
    historyLength: session.conversationHistory.length,
    responseLength: finalResponse.length,
    usageBreakdownCount: usageBreakdown.length
  });
  console.log('[RESEARCH-GEMINI] processResearchRequest: FINAL RESPONSE:\n', finalResponse);
  
  return {
    response: finalResponse,
    usageBreakdown
  };
}

module.exports = {
  processResearchRequest
};
