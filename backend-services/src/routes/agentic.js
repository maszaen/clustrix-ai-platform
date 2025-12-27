/**
 * Agentic Chat API Route
 * 
 * Handles chat with web search capabilities (Agentic Mode)
 * Loops: AI -> Tool Calls -> Execute -> Respond
 */

const express = require('express');
const router = express.Router();
const { getModelConfig } = require('../config/models');

// ===================================================================
// TOOL DEFINITIONS
// ===================================================================

// Get current date for context
function formatISODateInTimeZone(now, timeZone) {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return dtf.format(now);
}

const dateISO = formatISODateInTimeZone(new Date(), 'UTC');

const WEB_SEARCH_TOOL = {
  type: 'function',
  function: {
    name: 'web_search',
    description: `Search the web for current information. Use when you need:
- Up-to-date information (news, prices, weather, stocks)
- Recent events or announcements
- Information that may have changed since training data
- User explicitly asks to search

DATE CONTEXT: ${dateISO}
- Use this to anchor at least 1 query with "today", "this week", or the current month/year.

IMPORTANT: WEB SEARCH TOOL CALL RULES (FIELD + QUERY QUALITY)
- NEVER put web_search payload/JSON in response/content. Tool args go ONLY in the tool/function_call field.
- Use web_search when info may be time-sensitive or changed (news, prices, weather, stocks), or user asks to search.
- Always pass queries as an array of 1–4 strings (min 1, max 4). No other required fields.
- Queries MUST be varied and specific: include different phrasings, key entities, and time anchors (month/year or "today").
- Do not include explanations inside queries. Put brief user-facing text only in commentary.
- After tool results: answer in plain language in response/content (no tool JSON), citing the findings.
- If user explicitly says "don't browse/search", do NOT call web_search.
- Do not follow message history formatting; logs may be post-processed.
- Provide 1-4 varied queries for better coverage.

EXAMPLE:
User: "What's the latest on AI?"
queries: ["latest AI news December 2025", "recent AI breakthroughs", "AI industry updates today"]`,
    parameters: {
      type: 'object',
      properties: {
        queries: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          maxItems: 4,
          description: 'Search queries (1-4). Use specific, varied queries.',
        },
        commentary: {
          type: 'string',
          description: 'Brief explanation shown to user (e.g., "Looking up current weather")',
        },
      },
      required: ['queries'],
    },
  },
};

// Claude format
const WEB_SEARCH_TOOL_CLAUDE = {
  name: 'web_search',
  description: WEB_SEARCH_TOOL.function.description,
  input_schema: WEB_SEARCH_TOOL.function.parameters,
};

// Gemini format
const WEB_SEARCH_TOOL_GEMINI = {
  functionDeclarations: [{
    name: 'web_search',
    description: WEB_SEARCH_TOOL.function.description,
    parameters: WEB_SEARCH_TOOL.function.parameters,
  }],
};

// ===================================================================
// WEB SEARCH EXECUTION
// ===================================================================

async function executeWebSearch(input, config) {
  const { queries } = input;
  if (!queries || !Array.isArray(queries) || queries.length === 0) {
    return { success: false, output: 'No queries provided' };
  }

  const results = [];
  
  for (const query of queries.slice(0, 4)) {
    try {
      let searchResults;
      
      if (config.tavilyApiKey) {
        searchResults = await searchTavily(query, config.tavilyApiKey);
      } else if (config.serpApiKey) {
        searchResults = await searchSerpAPI(query, config.serpApiKey);
      } else if (config.googleApiKey && config.googleCseId) {
        searchResults = await searchGoogle(query, config.googleApiKey, config.googleCseId);
      } else {
        return { success: false, output: 'No search API configured. Set TAVILY_API_KEY, SERP_API_KEY, or GOOGLE_API_KEY + GOOGLE_CSE_ID in .env' };
      }
      
      results.push(...searchResults);
    } catch (err) {
      console.error(`[SEARCH] Error for query "${query}":`, err.message);
    }
  }

  if (results.length === 0) {
    return { success: false, output: 'No search results found' };
  }

  return {
    success: true,
    output: formatSearchOutput(results),
    data: { results },
  };
}

async function searchTavily(query, apiKey) {
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: 'basic',
      max_results: 5,
    }),
  });

  if (!response.ok) {
    throw new Error(`Tavily error: ${response.status}`);
  }

  const data = await response.json();
  return (data.results || []).map(r => ({
    title: r.title,
    url: r.url,
    snippet: r.content?.slice(0, 300),
  }));
}

async function searchSerpAPI(query, apiKey) {
  const url = `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${apiKey}&num=5`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`SerpAPI error: ${response.status}`);
  }

  const data = await response.json();
  return (data.organic_results || []).slice(0, 5).map(r => ({
    title: r.title,
    url: r.link,
    snippet: r.snippet?.slice(0, 300),
  }));
}

async function searchGoogle(query, apiKey, cseId) {
  const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cseId}&q=${encodeURIComponent(query)}&num=5`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Google CSE error: ${response.status}`);
  }

  const data = await response.json();
  return (data.items || []).slice(0, 5).map(r => ({
    title: r.title,
    url: r.link,
    snippet: r.snippet?.slice(0, 300),
  }));
}

function formatSearchOutput(results) {
  if (results.length === 0) return 'No results found.';
  
  return results.slice(0, 10).map((r, i) => 
    `[${i + 1}] ${r.title}\n${r.url}\n${r.snippet || ''}`
  ).join('\n\n');
}

// Helper to generate default commentary for tool calls
function getDefaultCommentary(toolName, input) {
  if (toolName === 'web_search' && input.queries) {
    return `Searching: ${input.queries[0] || '...'}`;
  }
  if (toolName === 'generate_image' && input.prompt) {
    return `Generating: ${input.prompt.slice(0, 50)}...`;
  }
  return `Executing ${toolName || 'tool'}...`;
}

// ===================================================================
// AGENTIC CHAT HANDLERS
// ===================================================================

const { trackRequest } = require('../services/analytics');

const MAX_ITERATIONS = 10;

/**
 * POST /api/agentic
 * 
 * Body: { model, messages, stream?, temperature?, max_tokens? }
 */
router.post('/', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { model, messages, stream = true, temperature, max_tokens } = req.body;
    
    if (!model) {
      return res.status(400).json({ error: 'Model is required', code: 'MISSING_MODEL' });
    }
    
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required', code: 'MISSING_MESSAGES' });
    }
    
    const config = getModelConfig(model);
    if (!config) {
      return res.status(400).json({ 
        error: `Model "${model}" is not available on Clustrix Cloud`, 
        code: 'MODEL_NOT_AVAILABLE' 
      });
    }
    
    console.log(`[AGENTIC] User ${req.user.email} requesting ${model} (${config.provider})`);
    
    // Search config from env
    const searchConfig = {
      tavilyApiKey: process.env.TAVILY_API_KEY,
      serpApiKey: process.env.SERP_API_KEY,
      googleApiKey: process.env.GOOGLE_SEARCH_API_KEY,
      googleCseId: process.env.GOOGLE_CSE_ID,
    };
    
    // Check if search is configured
    if (!searchConfig.tavilyApiKey && !searchConfig.serpApiKey && !(searchConfig.googleApiKey && searchConfig.googleCseId)) {
      return res.status(400).json({
        error: 'Web search not configured. Set TAVILY_API_KEY, SERP_API_KEY, or GOOGLE_SEARCH_API_KEY + GOOGLE_CSE_ID',
        code: 'SEARCH_NOT_CONFIGURED',
      });
    }
    
    // Setup streaming
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
    }
    
    // Agentic loop
    let conversationMessages = [...messages];
    
    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      let response;
      
      switch (config.provider) {
        case 'gemini':
          response = await callGeminiWithTools(config, conversationMessages, { temperature, max_tokens });
          break;
        case 'anthropic':
          response = await callClaudeWithTools(config, conversationMessages, { temperature, max_tokens });
          break;
        default:
          response = await callOpenAIWithTools(config, conversationMessages, { temperature, max_tokens });
          break;
      }
      
      const assistantMessage = response.message;
      conversationMessages.push(assistantMessage);
      
      // Stream content
      if (stream && assistantMessage.content) {
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: assistantMessage.content } }] })}\n\n`);
      }
      
      // Check if done (no tool calls)
      if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
        if (stream) {
          res.write('data: [DONE]\n\n');
          res.end();
        } else {
          res.json({ choices: [{ message: assistantMessage }], usage: response.usage });
        }
        return;
      }
      
      // Execute tool calls
      for (const toolCall of assistantMessage.tool_calls) {
        let input = {};
        try { input = JSON.parse(toolCall.function?.arguments || '{}'); } catch {}
        
        const commentary = input.commentary || getDefaultCommentary(toolCall.function?.name, input);
        
        // 1. Stream COMMAND INPUT tag (exact mobile format)
        if (stream) {
          const inputPayload = JSON.stringify({
            command: toolCall.function?.name,
            args: input,
            commentary: commentary,
          });
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: `<!--command-input-->${inputPayload}<!--/command-input-->` } }] })}\n\n`);
        }
        
        // Execute search
        const result = await executeWebSearch(input, searchConfig);
        
        // 2. Stream COMMAND OUTPUT tag (exact mobile format)
        if (stream) {
          const outputPayload = JSON.stringify({
            success: result.success,
            output: result.output,
          });
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: `<!--command-output-->${outputPayload}<!--/command-output-->` } }] })}\n\n`);
          
          // Send tool_result event to trigger client's handleToolResult (shows waiting for iteration loader)
          res.write(`data: ${JSON.stringify({ 
            tool_result: { 
              id: toolCall.id,
              name: toolCall.function?.name,
              success: result.success,
            } 
          })}\n\n`);
        }
        
        // Add result to conversation
        conversationMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          name: toolCall.function?.name,
          content: result.output,
        });
      }
    }
    
    // Max iterations reached
    if (stream) {
      res.write('data: [DONE]\n\n');
      res.end();
    } else {
      res.json({ error: 'Max iterations reached', code: 'MAX_ITERATIONS' });
    }
    
  } catch (err) {
    console.error('[AGENTIC ERROR]', err);
    
    // Track error
    trackRequest({
      userId: req.user?.uid,
      userEmail: req.user?.email,
      deviceName: req.headers['x-device-name'],
      model: req.body?.model || 'unknown',
      provider: 'unknown',
      messages: req.body?.messages || [],
      responsePreview: err.message,
      duration: Date.now() - startTime,
      success: false,
      errorMessage: err.message,
      mode: 'agentic',
    });
    
    if (!res.headersSent) {
      res.status(500).json({ error: err.message, code: 'AGENTIC_ERROR' });
    } else {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
  }
});

// ===================================================================
// PROVIDER-SPECIFIC TOOL CALLING
// ===================================================================

async function callOpenAIWithTools(config, messages, options) {
  const url = `${config.baseUrl}/chat/completions`;
  
  const body = {
    model: config.modelId,
    messages,
    tools: [WEB_SEARCH_TOOL],
    tool_choice: 'auto',
    stream: false, // Non-streaming for tool loop simplicity
  };
  
  if (options.temperature !== undefined) body.temperature = options.temperature;
  if (options.max_tokens !== undefined) body.max_tokens = options.max_tokens;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`${config.provider} API error: ${error}`);
  }
  
  const data = await response.json();
  const choice = data.choices?.[0];
  
  return {
    message: {
      role: 'assistant',
      content: choice?.message?.content || '',
      tool_calls: choice?.message?.tool_calls,
    },
    usage: data.usage,
  };
}

async function callClaudeWithTools(config, messages, options) {
  const url = `${config.baseUrl}/messages`;
  
  // Convert messages to Claude format
  let systemPrompt = '';
  const claudeMessages = [];
  
  for (const m of messages) {
    if (m.role === 'system') {
      systemPrompt = m.content;
    } else if (m.role === 'tool') {
      claudeMessages.push({
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: m.tool_call_id,
          content: m.content,
        }],
      });
    } else if (m.role === 'assistant' && m.tool_calls) {
      const content = [];
      if (m.content) content.push({ type: 'text', text: m.content });
      for (const tc of m.tool_calls) {
        let input = {};
        try { input = JSON.parse(tc.function?.arguments || '{}'); } catch {}
        content.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.function?.name,
          input,
        });
      }
      claudeMessages.push({ role: 'assistant', content });
    } else {
      claudeMessages.push({ role: m.role, content: m.content });
    }
  }
  
  const body = {
    model: config.modelId,
    max_tokens: options.max_tokens || 4096,
    system: systemPrompt,
    messages: claudeMessages,
    tools: [WEB_SEARCH_TOOL_CLAUDE],
  };
  
  if (options.temperature !== undefined) body.temperature = options.temperature;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${error}`);
  }
  
  const data = await response.json();
  
  // Convert Claude response to OpenAI format
  const toolCalls = (data.content || [])
    .filter(c => c.type === 'tool_use')
    .map(c => ({
      id: c.id,
      type: 'function',
      function: { name: c.name, arguments: JSON.stringify(c.input || {}) },
    }));
  
  const textContent = (data.content || [])
    .filter(c => c.type === 'text')
    .map(c => c.text)
    .join('');
  
  return {
    message: {
      role: 'assistant',
      content: textContent,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    },
    usage: data.usage,
  };
}

async function callGeminiWithTools(config, messages, options) {
  // Build contents in Gemini format
  let systemInstruction = '';
  const contents = [];
  
  for (const m of messages) {
    if (m.role === 'system') {
      systemInstruction = m.content;
    } else if (m.role === 'tool') {
      contents.push({
        role: 'function',
        parts: [{
          functionResponse: {
            name: m.name || 'web_search',
            response: { result: m.content },
          },
        }],
      });
    } else if (m.role === 'assistant' && m.tool_calls) {
      const parts = [];
      if (m.content) parts.push({ text: m.content });
      for (const tc of m.tool_calls) {
        let args = {};
        try { args = JSON.parse(tc.function?.arguments || '{}'); } catch {}
        parts.push({ functionCall: { name: tc.function?.name, args } });
      }
      contents.push({ role: 'model', parts });
    } else {
      contents.push({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      });
    }
  }
  
  const url = `${config.baseUrl}/models/${config.modelId}:generateContent?key=${config.apiKey}`;
  const body = {
    contents,
    tools: [WEB_SEARCH_TOOL_GEMINI],
    systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
    generationConfig: {
      temperature: options.temperature,
      maxOutputTokens: options.max_tokens,
    },
  };
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${error}`);
  }
  
  const data = await response.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  
  // Extract text and function calls
  const textParts = parts.filter(p => p.text).map(p => p.text).join('');
  const functionCalls = parts.filter(p => p.functionCall);
  
  const toolCalls = functionCalls.map((fc, i) => ({
    id: `gemini_${Date.now()}_${i}`,
    type: 'function',
    function: {
      name: fc.functionCall.name,
      arguments: JSON.stringify(fc.functionCall.args || {}),
    },
  }));
  
  return {
    message: {
      role: 'assistant',
      content: textParts,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    },
    usage: data.usageMetadata,
  };
}

module.exports = router;
