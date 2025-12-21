/**
 * Agentic Tools Service - Tools for mobile AI agents
 * 
 * Architecture follows backend/codes pattern:
 * 1. Tool definitions for AI function calling
 * 2. Tool execution functions
 * 3. Integration with chat streaming
 * 
 * For mobile, we only support:
 * - Web Search (real-time information)
 * - Image Generation (DALL-E, Stability, Replicate)
 * 
 * No memory system needed - AI caches context automatically per session.
 */

import { DEFAULT_PROVIDERS } from './api';

// ===================================================================
// TOOL DEFINITIONS - For AI function calling (OpenAI format)
// ===================================================================

export const WEB_SEARCH_TOOL = {
  type: 'function',
  function: {
    name: 'web_search',
    description: `Search the web for current information. Use when you need:
- Up-to-date information (news, prices, weather, stocks)
- Recent events or announcements
- Information that may have changed since training data
- User explicitly asks to search

IMPORTANT: Provide 1-4 varied queries for better coverage.

EXAMPLE:
User: "What's the latest on AI?"
queries: ["latest AI news December 2024", "recent AI breakthroughs", "AI industry updates today"]`,
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

export const IMAGE_GENERATION_TOOL = {
  type: 'function',
  function: {
    name: 'generate_image',
    description: `Generate an image from text description. Use ONLY when user explicitly requests image creation:
- "create an image of..."
- "generate a picture of..."
- "draw..."
- "make an image..."

DO NOT use for analyzing existing images or general questions about images.

STYLE OPTIONS: realistic, artistic, cartoon, sketch, anime, 3d, watercolor, oil, pixel, minimalist
SIZE OPTIONS: 1024x1024 (square), 1792x1024 (landscape), 1024x1792 (portrait)`,
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Detailed description of image to generate. Be specific about style, colors, composition.',
        },
        style: {
          type: 'string',
          enum: ['realistic', 'artistic', 'cartoon', 'sketch', 'anime', '3d', 'watercolor', 'oil', 'pixel', 'minimalist'],
          description: 'Style preset to apply.',
        },
        size: {
          type: 'string',
          enum: ['1024x1024', '1792x1024', '1024x1792'],
          description: 'Image dimensions. Default is square.',
        },
        commentary: {
          type: 'string',
          description: 'Brief explanation shown to user (e.g., "Creating your sunset image")',
        },
      },
      required: ['prompt'],
    },
  },
};

// Claude/Anthropic format
export const WEB_SEARCH_TOOL_CLAUDE = {
  name: 'web_search',
  description: WEB_SEARCH_TOOL.function.description,
  input_schema: WEB_SEARCH_TOOL.function.parameters,
};

export const IMAGE_GENERATION_TOOL_CLAUDE = {
  name: 'generate_image',
  description: IMAGE_GENERATION_TOOL.function.description,
  input_schema: IMAGE_GENERATION_TOOL.function.parameters,
};

// Gemini format
export const WEB_SEARCH_TOOL_GEMINI = {
  name: 'web_search',
  description: WEB_SEARCH_TOOL.function.description,
  parameters: WEB_SEARCH_TOOL.function.parameters,
};

export const IMAGE_GENERATION_TOOL_GEMINI = {
  name: 'generate_image',
  description: IMAGE_GENERATION_TOOL.function.description,
  parameters: IMAGE_GENERATION_TOOL.function.parameters,
};

/**
 * Get tools array for AI provider
 * @param {string} provider - 'openai' | 'anthropic' | 'google' | etc
 * @param {Object} enabledTools - { webSearch: boolean, imageGeneration: boolean }
 */
export function getAgenticTools(provider, enabledTools = { webSearch: true, imageGeneration: true }) {
  if (!provider) throw new Error('Provider is required for getAgenticTools');
  const providerLower = provider.toLowerCase();
  const tools = [];

  if (providerLower === 'anthropic' || providerLower === 'claude') {
    // Anthropic format
    if (enabledTools.webSearch) tools.push(WEB_SEARCH_TOOL_CLAUDE);
    if (enabledTools.imageGeneration) tools.push(IMAGE_GENERATION_TOOL_CLAUDE);
  } else if (providerLower === 'google' || providerLower === 'gemini') {
    // Gemini format (wrapped in functionDeclarations)
    const functions = [];
    if (enabledTools.webSearch) functions.push(WEB_SEARCH_TOOL_GEMINI);
    if (enabledTools.imageGeneration) functions.push(IMAGE_GENERATION_TOOL_GEMINI);
    if (functions.length > 0) {
      tools.push({ functionDeclarations: functions });
    }
  } else {
    // OpenAI format (default)
    if (enabledTools.webSearch) tools.push(WEB_SEARCH_TOOL);
    if (enabledTools.imageGeneration) tools.push(IMAGE_GENERATION_TOOL);
  }

  return tools;
}

// ===================================================================
// WEB SEARCH EXECUTION
// ===================================================================

/**
 * Execute web search using configured provider
 * @param {Object} input - { queries: string[], commentary?: string }
 * @param {Object} config - { provider, apiKey, googleCseId? }
 */
export async function executeWebSearch(input, config) {
  const { queries } = input;

  if (!Array.isArray(queries) || queries.length === 0) {
    return { success: false, output: 'Error: At least one search query is required' };
  }

  if (queries.length > 4) {
    return { success: false, output: 'Error: Maximum 4 queries allowed' };
  }

  if (!config?.apiKey) {
    return {
      success: false,
      output: 'Error: Search API key not configured. Go to Settings > Agentic Tools to add your API key.',
    };
  }

  const provider = (config.provider || 'tavily').toLowerCase();
  
  // Add current date to queries for up-to-date results
  const today = new Date();
  const dateString = today.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

  try {
    let allResults = [];

    for (const query of queries) {
      // Append date to query for current results
      const queryWithDate = `${query} ${dateString}`;
      let results;

      if (provider === 'tavily') {
        results = await searchTavily(queryWithDate, config.apiKey);
      } else if (provider === 'google') {
        results = await searchGoogle(queryWithDate, config.apiKey, config.googleCseId);
      } else {
        // Default: SerpAPI
        results = await searchSerpAPI(queryWithDate, config.apiKey);
      }

      allResults = [...allResults, ...results];
    }

    // Deduplicate by URL
    const seen = new Set();
    const uniqueResults = allResults.filter(r => {
      if (!r.link || seen.has(r.link)) return false;
      seen.add(r.link);
      return true;
    });

    // Format output for AI
    const output = formatSearchOutput(uniqueResults);

    return {
      success: true,
      output,
      results: uniqueResults.slice(0, 10),
    };
  } catch (error) {
    return {
      success: false,
      output: `Search error: ${error.message}`,
    };
  }
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
      include_answer: true,
      include_raw_content: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Tavily error: ${response.status}`);
  }

  const data = await response.json();
  const results = (data.results || []).map(r => ({
    title: r.title,
    link: r.url,
    snippet: r.content,
    source: 'tavily',
  }));

  // Tavily provides AI-generated answer
  if (data.answer) {
    results.unshift({
      title: 'AI Summary',
      link: '',
      snippet: data.answer,
      source: 'tavily_answer',
    });
  }

  return results;
}

async function searchSerpAPI(query, apiKey) {
  const url = new URL('https://serpapi.com/search.json');
  url.searchParams.set('q', query);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('engine', 'google');
  url.searchParams.set('num', '5');

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(`SerpAPI error: ${response.status}`);
  }

  const data = await response.json();

  return (data.organic_results || []).map(r => ({
    title: r.title,
    link: r.link,
    snippet: r.snippet,
    source: 'serpapi',
  }));
}

async function searchGoogle(query, apiKey, cseId) {
  if (!cseId) {
    throw new Error('Google CSE ID is required');
  }

  const url = new URL('https://www.googleapis.com/customsearch/v1');
  url.searchParams.set('q', query);
  url.searchParams.set('key', apiKey);
  url.searchParams.set('cx', cseId);
  url.searchParams.set('num', '5');

  const response = await fetch(url.toString());

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `Google API error: ${response.status}`);
  }

  const data = await response.json();

  return (data.items || []).map(r => ({
    title: r.title,
    link: r.link,
    snippet: r.snippet,
    source: 'google',
  }));
}

function formatSearchOutput(results) {
  if (results.length === 0) {
    return 'No search results found.';
  }

  const lines = ['## Web Search Results\n'];

  results.slice(0, 8).forEach((r, i) => {
    if (r.source === 'tavily_answer') {
      lines.push('### AI Summary');
      lines.push(r.snippet);
      lines.push('');
    } else {
      lines.push(`### ${i + 1}. ${r.title || 'Untitled'}`);
      if (r.link) lines.push(`URL: ${r.link}`);
      if (r.snippet) lines.push(r.snippet);
      lines.push('');
    }
  });

  return lines.join('\n');
}

// ===================================================================
// IMAGE GENERATION EXECUTION
// ===================================================================

// ===================================================================
// IMAGE GENERATION EXECUTION - Uses user's selected provider ONLY
// ===================================================================

// Provider image generation support map (2025 latest)
const IMAGE_GEN_SUPPORT = {
  openai: { 
    supported: true, 
    defaultModel: 'gpt-image-1.5',
    models: ['gpt-image-1.5', 'gpt-image-1', 'dall-e-3', 'dall-e-2'] 
  },
  google: { 
    supported: true, 
    defaultModel: 'imagen-4.0-generate-001',
    models: ['imagen-4.0-generate-001', 'imagen-3.0-generate-002', 'gemini-2.5-flash-image'] 
  },
  gemini: { 
    supported: true, 
    defaultModel: 'imagen-4.0-generate-001',
    models: ['imagen-4.0-generate-001', 'imagen-3.0-generate-002', 'gemini-2.5-flash-image'] 
  },
  xai: {
    supported: true,
    defaultModel: 'grok-2-image-1212',
    models: ['grok-2-image-1212']
  },
  zhipu: {
    supported: true,
    defaultModel: 'cogview-4',
    models: ['cogview-4', 'cogview-3-flash']
  },
  bigmodel: {
    supported: true,
    defaultModel: 'cogview-4-250304',
    models: ['cogview-4-250304', 'cogview-3-flash']
  },
  anthropic: { supported: false, reason: 'Anthropic/Claude does not support native image generation.' },
  mistral: { supported: false, reason: 'Mistral does not have native image generation API.' },
  deepseek: { supported: false, reason: 'DeepSeek Janus Pro is local-only, no hosted API.' },
  perplexity: { supported: false, reason: 'Perplexity does not support image generation.' },
  cerebras: { supported: false, reason: 'Cerebras does not support image generation.' },
  groq: { supported: false, reason: 'Groq does not support image generation.' },
  openrouter: { supported: false, reason: 'OpenRouter is a proxy - image generation depends on the underlying model.' },
  megallm: { supported: false, reason: 'MegaLLM is a proxy, image generation not supported.' },
};

/**
 * Execute image generation using user's selected provider
 * NO FALLBACK - uses provider user selected only
 * 
 * @param {Object} input - { prompt, style?, size? }
 * @param {Object} config - { provider, apiKey, model? }
 */
export async function executeImageGeneration(input, config) {
  const { prompt, style, size } = input;

  if (!prompt || prompt.trim().length === 0) {
    return { success: false, output: 'Error: Image prompt is required' };
  }

  if (!config?.apiKey) {
    return {
      success: false,
      output: 'Error: API key not configured for your provider.',
    };
  }

  if (!config.provider) {
    return { success: false, output: 'Error: Provider not specified. Check your settings.' };
  }
  const providerLower = config.provider.toLowerCase();
  
  // Check if provider supports image generation
  const support = IMAGE_GEN_SUPPORT[providerLower];
  if (!support?.supported) {
    const reason = support?.reason || `Provider "${config.provider}" does not support image generation.`;
    return {
      success: false,
      output: `Error: ${reason}\n\nSupported providers for image generation:\n- OpenAI (DALL-E 3)\n- Google/Gemini (Imagen 3)`,
    };
  }

  // Enhance prompt with style
  const stylePrompts = {
    realistic: 'photorealistic, highly detailed, professional photography, 8k resolution',
    artistic: 'artistic, painterly, expressive, vibrant colors, creative',
    cartoon: 'cartoon style, animated, colorful, playful, illustration',
    sketch: 'pencil sketch, hand-drawn, black and white, detailed linework',
    anime: 'anime style, Japanese animation, vibrant, detailed',
    '3d': '3D render, CGI, realistic lighting, high quality 3D model',
    watercolor: 'watercolor painting, soft colors, artistic, flowing',
    oil: 'oil painting, classical art style, textured, rich colors',
    pixel: 'pixel art, retro, 16-bit style, nostalgic',
    minimalist: 'minimalist, clean, simple, modern design',
  };

  const enhancedPrompt = style && stylePrompts[style.toLowerCase()]
    ? `${prompt}, ${stylePrompts[style.toLowerCase()]}`
    : prompt;

  try {
    let result;

    if (providerLower === 'openai') {
      result = await generateWithOpenAI(enhancedPrompt, size, config);
    } else if (providerLower === 'google' || providerLower === 'gemini') {
      result = await generateWithGemini(enhancedPrompt, size, config);
    } else if (providerLower === 'xai') {
      result = await generateWithXAI(enhancedPrompt, size, config);
    } else if (providerLower === 'zhipu' || providerLower === 'bigmodel') {
      result = await generateWithZhipu(enhancedPrompt, size, config);
    } else {
      return {
        success: false,
        output: `Error: No image generation implementation for provider "${config.provider}".`,
      };
    }

    return {
      success: true,
      output: `Image generated successfully!\n\nPrompt: "${prompt}"${style ? `\nStyle: ${style}` : ''}\n\nIMPORTANT: The image is already displayed in the UI. Do NOT include markdown image links, placeholders like [Image], or say "here is the image". Simply acknowledge the image was created and continue the conversation naturally.`,
      imageUrl: result.url,
      imageBase64: result.base64,
      prompt,
      style,
    };
  } catch (error) {
    return {
      success: false,
      output: `Image generation error: ${error.message}`,
    };
  }
}

/**
 * Generate image with OpenAI DALL-E / GPT Image
 */
async function generateWithOpenAI(prompt, size, config) {
  // Model from user's imageModel setting (resolved in streamImageGenChat)
  const model = config.model;
  if (!model) {
    throw new Error('No image model specified. Configure in Settings > Image Model.');
  }
  
  const imageSize = size || '1024x1024';
  
  // Use user's baseUrl or get from DEFAULT_PROVIDERS
  const baseUrl = config.baseUrl || DEFAULT_PROVIDERS.openai?.baseUrl || 'https://api.openai.com/v1';

  const response = await fetch(`${baseUrl}/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model,
      prompt,
      n: 1,
      size: imageSize,
      response_format: 'url',
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `OpenAI error: ${response.status}`);
  }

  const data = await response.json();
  const imageData = data.data?.[0];

  if (!imageData) {
    throw new Error('No image generated');
  }

  return {
    url: imageData.url,
    base64: imageData.b64_json,
  };
}

/**
 * Generate image with Google Gemini Imagen
 */
async function generateWithGemini(prompt, size, config) {
  // Model from user's imageModel setting (resolved in streamImageGenChat)
  const model = config.model;
  if (!model) {
    throw new Error('No image model specified. Configure in Settings > Image Model.');
  }
  
  // Use user's baseUrl or get from DEFAULT_PROVIDERS
  const baseUrl = config.baseUrl || DEFAULT_PROVIDERS.google?.baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
  const url = `${baseUrl}/models/${model}:predict?key=${config.apiKey}`;

  // Map size to aspect ratio
  let aspectRatio = '1:1';
  if (size === '1792x1024') aspectRatio = '16:9';
  else if (size === '1024x1792') aspectRatio = '9:16';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      instances: [{ prompt }],
      parameters: {
        sampleCount: 1,
        aspectRatio,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `Gemini error: ${response.status}`);
  }

  const data = await response.json();
  const prediction = data.predictions?.[0];

  if (!prediction?.bytesBase64Encoded) {
    throw new Error('No image generated from Gemini');
  }

  return {
    base64: prediction.bytesBase64Encoded,
    url: null,
  };
}

/**
 * Generate image with xAI Grok (Aurora)
 * API: https://api.x.ai/v1/images/generations
 */
async function generateWithXAI(prompt, size, config) {
  const model = config.model;
  if (!model) {
    throw new Error('No image model specified. Configure in Settings > Image Model.');
  }
  
  const baseUrl = config.baseUrl || DEFAULT_PROVIDERS.xai?.baseUrl || 'https://api.x.ai/v1';
  
  const response = await fetch(`${baseUrl}/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model,
      prompt,
      n: 1,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `xAI error: ${response.status}`);
  }

  const data = await response.json();
  const imageData = data.data?.[0];

  if (!imageData?.url && !imageData?.b64_json) {
    throw new Error('No image generated from xAI');
  }

  return {
    url: imageData.url,
    base64: imageData.b64_json,
  };
}

/**
 * Generate image with Zhipu/BigModel CogView
 * API: https://open.bigmodel.cn/api/paas/v4/images/generations
 */
async function generateWithZhipu(prompt, size, config) {
  const model = config.model;
  if (!model) {
    throw new Error('No image model specified. Configure in Settings > Image Model.');
  }
  
  // Zhipu/BigModel use same API - check provider to get correct default
  const providerLower = (config.provider || '').toLowerCase();
  const defaultBase = providerLower === 'zhipu' 
    ? DEFAULT_PROVIDERS.zhipu?.baseUrl 
    : DEFAULT_PROVIDERS.bigmodel?.baseUrl;
  const baseUrl = config.baseUrl || defaultBase || 'https://open.bigmodel.cn/api/paas/v4';
  
  // Map size to CogView format
  let imageSize = '1024x1024';
  if (size === '1792x1024') imageSize = '1920x1080';
  else if (size === '1024x1792') imageSize = '1080x1920';
  
  const response = await fetch(`${baseUrl}/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model,
      prompt,
      size: imageSize,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `Zhipu error: ${response.status}`);
  }

  const data = await response.json();
  const imageData = data.data?.[0];

  if (!imageData?.url && !imageData?.b64_json) {
    throw new Error('No image generated from CogView');
  }

  return {
    url: imageData.url,
    base64: imageData.b64_json,
  };
}

// ===================================================================
// UNIFIED TOOL EXECUTOR
// ===================================================================

/**
 * Execute a tool by name (follows backend/codes/code-agent-openai.js pattern)
 * @param {string} toolName - Tool function name
 * @param {Object} input - Tool input parameters
 * @param {Object} config - Tool configuration from settings
 * @returns {Promise<{success: boolean, output: string, data?: any}>}
 */
export async function executeTool(toolName, input, config) {
  switch (toolName) {
    case 'web_search':
      return executeWebSearch(input, config.webSearch);

    case 'generate_image':
      return executeImageGeneration(input, config.imageGeneration);

    default:
      return {
        success: false,
        output: `Unknown tool: ${toolName}. Available tools: web_search, generate_image`,
      };
  }
}

/**
 * Parse tool calls from AI response (OpenAI format)
 * @param {Object} message - Assistant message with tool_calls
 * @returns {Array} - Array of { id, name, input }
 */
export function parseToolCalls(message) {
  if (!message?.tool_calls || !Array.isArray(message.tool_calls)) {
    return [];
  }

  return message.tool_calls.map(tc => {
    let input = {};
    try {
      input = JSON.parse(tc.function?.arguments || '{}');
    } catch (e) {
      console.warn('Failed to parse tool arguments:', tc.function?.arguments);
    }

    return {
      id: tc.id,
      name: tc.function?.name,
      input,
      commentary: input.commentary || null,
    };
  });
}

/**
 * Parse tool calls from Anthropic/Claude response
 * @param {Object} content - Content block with type: 'tool_use'
 * @returns {Object} - { id, name, input }
 */
export function parseClaudeToolCall(content) {
  if (content?.type !== 'tool_use') {
    return null;
  }

  return {
    id: content.id,
    name: content.name,
    input: content.input || {},
    commentary: content.input?.commentary || null,
  };
}

/**
 * Parse tool calls from Gemini response
 * @param {Object} part - FunctionCall part
 * @returns {Object} - { id, name, input }
 */
export function parseGeminiToolCall(part) {
  if (!part?.functionCall) {
    return null;
  }

  return {
    id: `gemini_${Date.now()}`, // Gemini doesn't provide IDs
    name: part.functionCall.name,
    input: part.functionCall.args || {},
    commentary: part.functionCall.args?.commentary || null,
  };
}

/**
 * Format tool result for sending back to AI (OpenAI format)
 * Also includes name for Gemini/Claude compatibility when needed
 * @param {string} toolCallId - Tool call ID
 * @param {Object} result - Execution result
 * @param {string} [toolName] - Tool name (optional, for Gemini)
 */
export function formatToolResult(toolCallId, result, toolName = null) {
  return {
    role: 'tool',
    tool_call_id: toolCallId,
    name: toolName, // For Gemini compatibility
    content: result.output || 'Tool executed with no output.',
  };
}

/**
 * Format tool result for Anthropic/Claude
 */
export function formatClaudeToolResult(toolCallId, result) {
  return {
    type: 'tool_result',
    tool_use_id: toolCallId,
    content: result.output || 'Tool executed with no output.',
  };
}

/**
 * Format tool result for Gemini
 */
export function formatGeminiToolResult(toolName, result) {
  return {
    functionResponse: {
      name: toolName,
      response: {
        result: result.output || 'Tool executed with no output.',
      },
    },
  };
}

// ===================================================================
// CLAUDE STREAMING WITH TOOLS (Native Anthropic format)
// ===================================================================

/**
 * Call Claude API with tools (STREAMING like desktop)
 * Uses native Anthropic tool_use / tool_result format
 */
async function callClaudeWithTools({ messages, model, provider, baseUrl, apiKey, tools, onChunk, onThink, signal }) {
  const base = baseUrl || DEFAULT_PROVIDERS.anthropic?.baseUrl || 'https://api.anthropic.com/v1';
  
  // Extract system prompt and format messages for Claude
  let systemPrompt = '';
  const claudeMessages = [];
  
  for (const m of messages) {
    if (m.role === 'system') {
      systemPrompt = m.content;
    } else if (m.role === 'tool') {
      // Convert OpenAI tool result to Claude format
      claudeMessages.push({
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: m.tool_call_id,
          content: m.content,
        }],
      });
    } else if (m.role === 'assistant' && m.tool_calls) {
      // Convert OpenAI tool_calls to Claude tool_use
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
  
  // Convert OpenAI tools to Claude format
  const claudeTools = tools.map(t => ({
    name: t.function?.name || t.name,
    description: t.function?.description || t.description,
    input_schema: t.function?.parameters || t.input_schema || t.parameters,
  }));
  
  const body = {
    model,
    max_tokens: 4096,
    system: systemPrompt,
    messages: claudeMessages,
    tools: claudeTools,
    stream: true,
  };
  
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    
    if (signal) {
      if (signal.aborted) return reject(new Error('Aborted'));
      signal.addEventListener('abort', () => { xhr.abort(); reject(new Error('Aborted')); });
    }
    
    xhr.open('POST', `${base}/messages`);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('x-api-key', apiKey);
    xhr.setRequestHeader('anthropic-version', '2023-06-01');
    
    // Accumulate response
    const fullResponse = { content: [], stop_reason: null, usage: {} };
    let currentBlock = null;
    let buffer = '';
    let lastIdx = 0;
    
    xhr.onprogress = () => {
      buffer += xhr.responseText.slice(lastIdx);
      lastIdx = xhr.responseText.length;
      
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr) continue;
        
        try {
          const event = JSON.parse(jsonStr);
          
          switch (event.type) {
            case 'content_block_start':
              currentBlock = event.content_block;
              if (currentBlock.type === 'text') currentBlock.text = '';
              if (currentBlock.type === 'tool_use') currentBlock.input = '';
              break;
              
            case 'content_block_delta':
              if (event.delta?.type === 'text_delta' && currentBlock?.type === 'text') {
                const text = event.delta.text || '';
                currentBlock.text += text;
                if (text && onChunk) onChunk(text);
              } else if (event.delta?.type === 'input_json_delta' && currentBlock?.type === 'tool_use') {
                currentBlock.input += event.delta.partial_json || '';
              } else if (event.delta?.type === 'thinking_delta' && onThink) {
                onThink(event.delta.thinking || '');
              }
              break;
              
            case 'content_block_stop':
              if (currentBlock) {
                if (currentBlock.type === 'tool_use' && typeof currentBlock.input === 'string') {
                  try { currentBlock.input = JSON.parse(currentBlock.input || '{}'); } catch { currentBlock.input = {}; }
                }
                fullResponse.content.push(currentBlock);
              }
              currentBlock = null;
              break;
              
            case 'message_delta':
              if (event.delta?.stop_reason) fullResponse.stop_reason = event.delta.stop_reason;
              if (event.usage) fullResponse.usage = event.usage;
              break;
          }
        } catch {}
      }
    };
    
    xhr.onload = () => {
      if (xhr.status >= 400) {
        let msg = `Claude error: ${xhr.status}`;
        try { msg = JSON.parse(xhr.responseText).error?.message || msg; } catch {}
        return reject(new Error(msg));
      }
      
      // Convert Claude response to OpenAI-like format
      const toolCalls = fullResponse.content
        .filter(c => c.type === 'tool_use')
        .map(c => ({
          id: c.id,
          type: 'function',
          function: { name: c.name, arguments: JSON.stringify(c.input || {}) },
        }));
      
      const textContent = fullResponse.content
        .filter(c => c.type === 'text')
        .map(c => c.text)
        .join('');
      
      resolve({
        message: {
          role: 'assistant',
          content: textContent,
          tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        },
        finishReason: fullResponse.stop_reason,
        usage: fullResponse.usage,
      });
    };
    
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.send(JSON.stringify(body));
  });
}

// ===================================================================
// GEMINI STREAMING WITH TOOLS (Native Google format)
// ===================================================================

/**
 * Call Gemini API with tools (STREAMING like desktop)
 * Uses native functionCall / functionResponse format
 */
async function callGeminiWithTools({ messages, model, provider, baseUrl, apiKey, tools, onChunk, onThink, signal }) {
  const base = baseUrl || DEFAULT_PROVIDERS.google?.baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
  
  // Build contents in Gemini format
  let systemInstruction = '';
  const contents = [];
  
  for (const m of messages) {
    if (m.role === 'system') {
      systemInstruction = m.content;
    } else if (m.role === 'tool') {
      // Convert tool result to Gemini functionResponse
      contents.push({
        role: 'function',
        parts: [{
          functionResponse: {
            name: m.name || 'tool_response',
            response: { result: m.content },
          },
        }],
      });
    } else if (m.role === 'assistant' && m.tool_calls) {
      // Convert tool calls to Gemini functionCall
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
  
  // Convert tools to Gemini functionDeclarations format
  // Handle both OpenAI format and already-formatted Gemini tools
  let geminiTools = [];
  
  for (const t of tools) {
    if (t.functionDeclarations) {
      // Already in Gemini format (from getAgenticTools for Gemini provider)
      geminiTools.push(t);
    } else if (t.function?.name || t.name) {
      // OpenAI format - convert to Gemini
      geminiTools.push({
        functionDeclarations: [{
          name: t.function?.name || t.name,
          description: t.function?.description || t.description,
          parameters: t.function?.parameters || t.parameters,
        }]
      });
    }
  }
  
  const url = `${base}/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`;
  const body = {
    contents,
    tools: geminiTools.length > 0 ? geminiTools : undefined,
    systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
    generationConfig: { maxOutputTokens: 8192 },
  };
  
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    
    if (signal) {
      if (signal.aborted) return reject(new Error('Aborted'));
      signal.addEventListener('abort', () => { xhr.abort(); reject(new Error('Aborted')); });
    }
    
    xhr.open('POST', url);
    xhr.setRequestHeader('Content-Type', 'application/json');
    
    let accumulatedText = '';
    const functionCalls = [];
    let finishReason = 'STOP';
    let usageData = null;
    let buffer = '';
    let lastIdx = 0;
    
    xhr.onprogress = () => {
      buffer += xhr.responseText.slice(lastIdx);
      lastIdx = xhr.responseText.length;
      
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr) continue;
        
        try {
          const event = JSON.parse(jsonStr);
          const candidate = event.candidates?.[0];
          
          if (candidate?.content?.parts) {
            for (const part of candidate.content.parts) {
              if (part.thought && part.text && onThink) {
                onThink(part.text);
              } else if (part.text) {
                accumulatedText += part.text;
                if (onChunk) onChunk(part.text);
              }
              if (part.functionCall) {
                functionCalls.push(part.functionCall);
              }
            }
          }
          if (candidate?.finishReason) finishReason = candidate.finishReason;
          if (event.usageMetadata) usageData = event.usageMetadata;
        } catch {}
      }
    };
    
    xhr.onload = () => {
      if (xhr.status >= 400) {
        let msg = `Gemini error: ${xhr.status}`;
        try { msg = JSON.parse(xhr.responseText).error?.message || msg; } catch {}
        return reject(new Error(msg));
      }
      
      // Convert to OpenAI-like format
      const toolCalls = functionCalls.map((fc, i) => ({
        id: `gemini_${Date.now()}_${i}`,
        type: 'function',
        function: { name: fc.name, arguments: JSON.stringify(fc.args || {}) },
      }));
      
      resolve({
        message: {
          role: 'assistant',
          content: accumulatedText,
          tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        },
        finishReason,
        usage: usageData,
      });
    };
    
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.send(JSON.stringify(body));
  });
}

// ===================================================================
// AGENTIC CHAT STREAMING
// ===================================================================

/**
 * Stream agentic chat with tool calling support (Web Search mode)
 * 
 * agenticMode = Web Search only
 * For image generation, use streamImageGenChat() instead
 * 
 * Flow:
 * 1. Send request to AI with web_search tool
 * 2. If AI returns tool_calls, execute them
 * 3. Send tool results back to AI
 * 4. Repeat until AI responds without tool_calls
 * 
 * @param {Object} params - Streaming parameters
 */
export async function streamAgenticChat({
  messages,
  model,
  provider,
  baseUrl,
  apiKey,
  agenticConfig,
  onChunk,
  onThink,
  onToolCall,
  onToolResult,
  onDone,
  onError,
  signal,
}) {
  if (!provider) {
    onError?.('Provider not specified. Check your settings.');
    return;
  }
  const providerLower = provider.toLowerCase();
  const MAX_ITERATIONS = 50; // Match Electron
  
  // For agentic mode, only enable web search tool (allow missing key for AI feedback)
  const tools = getAgenticTools(providerLower, { webSearch: true, imageGeneration: false });
  
  // Working copy of conversation
  let conversationMessages = [...messages];
  let totalUsage = null;
  
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    if (signal?.aborted) {
      break;
    }
    
    // Rate limit between iterations
    if (iteration > 0) {
      await new Promise(r => setTimeout(r, 1000));
    }
    
    try {
      // Select streaming handler based on provider (like desktop routing)
      let response;
      const callParams = {
        messages: conversationMessages,
        model,
        provider,
        baseUrl,
        apiKey,
        tools,
        onChunk,
        onThink,
        signal,
      };
      
      if (providerLower === 'anthropic' || model.toLowerCase().includes('claude')) {
        response = await callClaudeWithTools(callParams);
      } else if (providerLower === 'google' || providerLower === 'gemini' || model.toLowerCase().includes('gemini')) {
        response = await callGeminiWithTools(callParams);
      } else {
        // OpenAI and compatible (OpenRouter, Groq, xAI, DeepSeek, etc.)
        response = await callOpenAIWithTools(callParams);
      }
      
      if (!response) {
        onError?.('Empty response from API');
        return;
      }
      
      // Merge usage
      if (response.usage) {
        if (!totalUsage) totalUsage = { prompt_tokens: 0, completion_tokens: 0 };
        totalUsage.prompt_tokens += response.usage.prompt_tokens || 0;
        totalUsage.completion_tokens += response.usage.completion_tokens || 0;
      }
      
      const assistantMessage = response.message;
      
      // Add assistant response to conversation
      conversationMessages.push(assistantMessage);
      
      // If no tool calls, we're done
      if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
        onDone?.({ usage: totalUsage });
        return;
      }
      
      // Execute tool calls
      const toolCalls = parseToolCalls(assistantMessage);
      
      for (const toolCall of toolCalls) {
        const commentary = toolCall.commentary || getDefaultCommentary(toolCall.name, toolCall.input);
        
        // Notify UI about tool execution
        onToolCall?.({
          id: toolCall.id,
          name: toolCall.name,
          input: toolCall.input,
          commentary: commentary,
        });

        // 1. Stream COMMAND INPUT tag
        const inputPayload = JSON.stringify({
            command: toolCall.name,
            args: toolCall.input,
            commentary: commentary
        });
        onChunk(`<!--command-input-->${inputPayload}<!--/command-input-->`);
        
        // Execute the tool (only web_search for agentic mode)
        const result = await executeWebSearch(toolCall.input, agenticConfig.webSearch);
        
        // 2. Stream COMMAND OUTPUT tag
        const outputPayload = JSON.stringify({
            success: result.success,
            output: result.output
        });
        onChunk(`<!--command-output-->${outputPayload}<!--/command-output-->`);
        
        // Notify UI about result
        // Notify UI about result (success or failure)
        onToolResult?.({
          id: toolCall.id,
          name: toolCall.name,
          input: toolCall.input, // Pass input to frontend
          success: result.success,
          output: result.output,
          data: result,
        });
        
        // Add tool result to conversation (include name for Gemini)
        conversationMessages.push(formatToolResult(toolCall.id, result, toolCall.name));
      }
      
    } catch (error) {
      console.error('[AGENTIC-CHAT] Loop error:', error);
      onError?.(error.message || 'Agentic chat error');
      return;
    }
  }
  
  // Max iterations reached
  console.warn('[AGENTIC-CHAT] Max iterations reached');
  onDone?.({ usage: totalUsage });
}

/**
 * Stream chat with image generation capability
 * generateImage mode = AI can generate images using generate_image tool
 * 
 * USES USER'S SELECTED PROVIDER ONLY - NO FALLBACK
 */
export async function streamImageGenChat({
  messages,
  model,
  provider,
  baseUrl,
  apiKey,
  imageModel, // 'auto' or specific model like 'dall-e-3'
  onChunk,
  onThink,
  onToolCall,
  onToolResult,
  onDone,
  onError,
  signal,
}) {
  if (!provider) {
    onError?.('Provider not specified. Check your settings.');
    return;
  }
  
  // 1. Determine Effective Provider based on Image Model Setting FIRST
  // "USE SETTINGS FIRST" - user preference overrides current chat provider
  let providerLower = provider.toLowerCase();
  
  if (imageModel && imageModel !== 'auto') {
    // If specific model selected, find which provider owns it
    // Iterate over all providers in IMAGE_GEN_SUPPORT
    const ownerProvider = Object.keys(IMAGE_GEN_SUPPORT).find(key => 
      IMAGE_GEN_SUPPORT[key].models?.includes(imageModel)
    );
    
    // If we found a provider for this model, switch to it
    if (ownerProvider) {
      providerLower = ownerProvider;
    }
  }

  const MAX_ITERATIONS = 50; // Matched with Electron backend
  
  // Check if (effective) user's provider supports image generation
  const support = IMAGE_GEN_SUPPORT[providerLower];
  if (!support?.supported) {
    const reason = support?.reason || `Your current provider "${provider}" does not support image generation.`;
    onError?.(`${reason}\n\nSupported providers:\n- OpenAI (GPT Image 1.5, DALL-E 3)\n- Google/Gemini (Imagen 4)`);
    return;
  }
  
  // Determine which image model to use
  const resolvedImageModel = (!imageModel || imageModel === 'auto') 
    ? support.defaultModel 
    : imageModel;
  
  const tools = getAgenticTools(providerLower, { webSearch: false, imageGeneration: true });
  
  let conversationMessages = [...messages];
  let totalUsage = null;
  
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    if (signal?.aborted) break;
    
    if (iteration > 0) {
      await new Promise(r => setTimeout(r, 1000));
    }
    
    try {
      // Select streaming handler based on provider (like desktop routing)
      let response;
      const callParams = {
        messages: conversationMessages,
        model,
        provider,
        baseUrl,
        apiKey,
        tools,
        onChunk,
        onThink,
        signal,
      };
      
      if (providerLower === 'anthropic' || model.toLowerCase().includes('claude')) {
        response = await callClaudeWithTools(callParams);
      } else if (providerLower === 'google' || providerLower === 'gemini' || model.toLowerCase().includes('gemini')) {
        response = await callGeminiWithTools(callParams);
      } else {
        // OpenAI and compatible
        response = await callOpenAIWithTools(callParams);
      }
      
      if (!response) {
        onError?.('Empty response from API');
        return;
      }
      
      if (response.usage) {
        if (!totalUsage) totalUsage = { prompt_tokens: 0, completion_tokens: 0 };
        totalUsage.prompt_tokens += response.usage.prompt_tokens || 0;
        totalUsage.completion_tokens += response.usage.completion_tokens || 0;
      }
      
      const assistantMessage = response.message;
      conversationMessages.push(assistantMessage);
      
      if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
        onDone?.({ usage: totalUsage });
        return;
      }
      
      const toolCalls = parseToolCalls(assistantMessage);
      
      for (const toolCall of toolCalls) {
        const commentary = toolCall.commentary || getDefaultCommentary(toolCall.name, toolCall.input);
        
        onToolCall?.({
          id: toolCall.id,
          name: toolCall.name,
          input: toolCall.input,
          commentary: commentary,
        });

        // 1. Stream COMMAND INPUT tag
        const inputPayload = JSON.stringify({
            command: toolCall.name,
            args: toolCall.input,
            commentary: commentary
        });
        onChunk(`<!--command-input-->${inputPayload}<!--/command-input-->`);
        
        // Execute image generation - effective provider/model already set in logic above
        let result;
        try {
          if (toolCall.name === 'generate_image') {
              result = await executeImageGeneration(
                {
                  prompt: toolCall.input.prompt,
                  style: toolCall.input.style,
                  size: toolCall.input.size,
                },
                {
                  provider: providerLower,
                  apiKey: apiKey,
                  baseUrl: baseUrl,
                  model: resolvedImageModel,
                }
              );
          } else {
             result = { success: false, output: `Unknown tool: ${toolCall.name}` };
          }
        } catch (error) {
          result = { success: false, output: `Tool execution failed: ${error.message}` };
        }
        
        // Notify UI about result (success or failure)
        // 2. Stream COMMAND OUTPUT tag
        const outputPayload = JSON.stringify({
            success: result.success,
            output: result.output
        });
        onChunk(`<!--command-output-->${outputPayload}<!--/command-output-->`);

        // Notify UI about result (success or failure)
        onToolResult?.({
          id: toolCall.id,
          name: toolCall.name,
          input: toolCall.input,
          success: result.success,
          output: result.output,
          data: result
        });
        
        conversationMessages.push(formatToolResult(toolCall.id, result, toolCall.name));
      }
      
    } catch (error) {
      console.error('[IMAGE-GEN] Loop error:', error);
      onError?.(error.message || 'Image generation error');
      return;
    }
  }
  
  console.warn('[IMAGE-GEN] Max iterations reached');
  onDone?.({ usage: totalUsage });
}

/**
 * Make OpenAI-compatible API call with tools (STREAMING like desktop)
 * Works with: OpenAI, OpenRouter, Groq, Zhipu, BigModel, xAI, etc.
 * 
 * Flow matches Electron desktop:
 * 1. Stream text content to UI in real-time
 * 2. Accumulate tool_calls as they arrive
 * 3. Return full message after stream completes
 */
async function callOpenAIWithTools({ messages, model, provider, baseUrl, apiKey, tools, onChunk, onThink, signal }) {
  // Use user's baseUrl or get default from provider
  const providerLower = (provider || '').toLowerCase();
  const base = baseUrl || DEFAULT_PROVIDERS[providerLower]?.baseUrl;
  
  if (!base) {
    throw new Error(`No baseUrl configured for provider "${provider}". Check your settings.`);
  }
  
  const body = {
    model,
    messages: messages.map(m => {
      if (m.tool_calls) {
        return { role: m.role, content: m.content || null, tool_calls: m.tool_calls };
      }
      if (m.role === 'tool') {
        return { role: 'tool', tool_call_id: m.tool_call_id, content: m.content };
      }
      return { role: m.role, content: m.content };
    }),
    tools,
    tool_choice: 'auto',
    stream: true, // STREAMING enabled like desktop
  };
  
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    
    if (signal) {
      if (signal.aborted) return reject(new Error('Aborted'));
      signal.addEventListener('abort', () => {
        xhr.abort();
        reject(new Error('Aborted'));
      });
    }
    
    xhr.open('POST', `${base}/chat/completions`);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Authorization', `Bearer ${apiKey}`);
    
    // Accumulate full response while streaming (like desktop callOpenAIAPI)
    const fullMessage = {
      role: 'assistant',
      content: '',
      tool_calls: []
    };
    const toolCallBuffers = new Map(); // index -> { id, type, function: { name, arguments } }
    let finishReason = null;
    let buffer = '';
    let lastProcessedIndex = 0;
    let usageData = null;
    
    xhr.onprogress = () => {
      const newData = xhr.responseText.slice(lastProcessedIndex);
      lastProcessedIndex = xhr.responseText.length;
      buffer += newData;
      
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
          
          // Stream text content to UI immediately (core desktop behavior)
          if (delta.content) {
            fullMessage.content += delta.content;
            if (onChunk) onChunk(delta.content);
          }
          
          // Handle reasoning/thinking content
          const reasoning = delta.reasoning_content || delta.reasoning || delta.thoughts || '';
          if (reasoning && onThink) {
            onThink(reasoning);
          }
          
          // Accumulate tool calls (streamed in chunks)
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index;
              if (!toolCallBuffers.has(idx)) {
                toolCallBuffers.set(idx, {
                  id: tc.id || '',
                  type: 'function',
                  function: { name: '', arguments: '' }
                });
              }
              const buf = toolCallBuffers.get(idx);
              if (tc.id) buf.id = tc.id;
              if (tc.function?.name) buf.function.name += tc.function.name;
              if (tc.function?.arguments) buf.function.arguments += tc.function.arguments;
            }
          }
          
          // Capture finish reason
          if (event.choices?.[0]?.finish_reason) {
            finishReason = event.choices[0].finish_reason;
          }
          
          // Capture usage if provided
          if (event.usage) {
            usageData = event.usage;
          }
        } catch (e) {
          // Ignore parse errors for malformed chunks
        }
      }
    };
    
    xhr.onload = () => {
      if (xhr.status && xhr.status >= 400) {
        let errorMsg = `API error: ${xhr.status}`;
        try {
          const errData = JSON.parse(xhr.responseText);
          errorMsg = errData.error?.message || errorMsg;
        } catch {}
        return reject(new Error(errorMsg));
      }
      
      // Convert tool call buffers to array (like desktop)
      if (toolCallBuffers.size > 0) {
        fullMessage.tool_calls = Array.from(toolCallBuffers.values());
      } else {
        delete fullMessage.tool_calls;
      }
      
      resolve({
        message: fullMessage,
        finishReason,
        usage: usageData,
      });
    };
    
    xhr.onerror = () => {
      reject(new Error('Network error'));
    };
    
    xhr.send(JSON.stringify(body));
  });
}

/**
 * Get default commentary for tool calls
 */
function getDefaultCommentary(toolName, input) {
  switch (toolName) {
    case 'web_search':
      const queries = input.queries || [];
      return `Searching: "${queries.slice(0, 2).join('", "')}"${queries.length > 2 ? '...' : ''}`;
    case 'generate_image':
      const promptPreview = (input.prompt || '').substring(0, 50);
      return `Generating image: "${promptPreview}${(input.prompt || '').length > 50 ? '...' : ''}"`;
    default:
      return `Executing ${toolName}...`;
  }
}


