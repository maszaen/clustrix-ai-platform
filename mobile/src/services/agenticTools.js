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
  const providerLower = (provider || 'openai').toLowerCase();
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

  try {
    let allResults = [];

    for (const query of queries) {
      let results;

      if (provider === 'tavily') {
        results = await searchTavily(query, config.apiKey);
      } else if (provider === 'google') {
        results = await searchGoogle(query, config.apiKey, config.googleCseId);
      } else {
        // Default: SerpAPI
        results = await searchSerpAPI(query, config.apiKey);
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

/**
 * Execute image generation using configured provider
 * @param {Object} input - { prompt, style?, size?, commentary? }
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
      output: 'Error: Image generation API key not configured. Go to Settings > Agentic Tools.',
    };
  }

  const provider = (config.provider || 'openai').toLowerCase();

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

    if (provider === 'stability') {
      result = await generateWithStability(enhancedPrompt, size, config);
    } else if (provider === 'replicate') {
      result = await generateWithReplicate(enhancedPrompt, size, config);
    } else {
      // Default: OpenAI DALL-E
      result = await generateWithOpenAI(enhancedPrompt, size, config);
    }

    return {
      success: true,
      output: `Image generated successfully!\n\nPrompt: "${prompt}"${style ? `\nStyle: ${style}` : ''}`,
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

async function generateWithOpenAI(prompt, size, config) {
  const model = config.model || 'dall-e-3';
  const imageSize = size || '1024x1024';

  const response = await fetch('https://api.openai.com/v1/images/generations', {
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

async function generateWithStability(prompt, size, config) {
  const model = config.model || 'stable-diffusion-xl-1024-v1-0';

  let width = 1024,
    height = 1024;
  if (size === '1792x1024') {
    width = 1792;
    height = 1024;
  } else if (size === '1024x1792') {
    width = 1024;
    height = 1792;
  }

  const response = await fetch(`https://api.stability.ai/v1/generation/${model}/text-to-image`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
      Accept: 'application/json',
    },
    body: JSON.stringify({
      text_prompts: [{ text: prompt, weight: 1 }],
      cfg_scale: 7,
      width,
      height,
      samples: 1,
      steps: 30,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `Stability AI error: ${response.status}`);
  }

  const data = await response.json();
  const artifact = data.artifacts?.[0];

  if (!artifact) {
    throw new Error('No image generated');
  }

  return {
    base64: artifact.base64,
    url: null,
  };
}

async function generateWithReplicate(prompt, size, config) {
  const model = config.model || 'stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b';

  let width = 1024,
    height = 1024;
  if (size === '1792x1024') {
    width = 1792;
    height = 1024;
  } else if (size === '1024x1792') {
    width = 1024;
    height = 1792;
  }

  // Create prediction
  const createResponse = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Token ${config.apiKey}`,
    },
    body: JSON.stringify({
      version: model.split(':')[1] || model,
      input: { prompt, width, height },
    }),
  });

  if (!createResponse.ok) {
    const error = await createResponse.json().catch(() => ({}));
    throw new Error(error.detail || `Replicate error: ${createResponse.status}`);
  }

  const prediction = await createResponse.json();

  // Poll for result (max 60 seconds)
  const maxAttempts = 30;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 2000));

    const pollResponse = await fetch(prediction.urls.get, {
      headers: { Authorization: `Token ${config.apiKey}` },
    });

    if (!pollResponse.ok) {
      throw new Error('Failed to poll prediction status');
    }

    const status = await pollResponse.json();

    if (status.status === 'succeeded') {
      const imageUrl = Array.isArray(status.output) ? status.output[0] : status.output;
      return { url: imageUrl, base64: null };
    }

    if (status.status === 'failed') {
      throw new Error(status.error || 'Image generation failed');
    }
  }

  throw new Error('Image generation timed out');
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
 * @param {string} toolCallId - Tool call ID
 * @param {Object} result - Execution result
 */
export function formatToolResult(toolCallId, result) {
  return {
    role: 'tool',
    tool_call_id: toolCallId,
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
  const providerLower = (provider || 'openai').toLowerCase();
  const MAX_ITERATIONS = 10;
  
  // For agentic mode, only enable web search tool
  const hasWebSearchKey = agenticConfig?.webSearch?.apiKey;
  
  if (!hasWebSearchKey) {
    onError?.('Web search API key not configured. Go to Settings > Agentic Tools to add your API key.');
    return;
  }
  
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
      // Make API call with tools
      const response = await callOpenAIWithTools({
        messages: conversationMessages,
        model,
        baseUrl,
        apiKey,
        tools,
        onChunk,
        onThink,
      });
      
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
        // Notify UI about tool execution
        onToolCall?.({
          id: toolCall.id,
          name: toolCall.name,
          input: toolCall.input,
          commentary: toolCall.commentary || getDefaultCommentary(toolCall.name, toolCall.input),
        });
        
        // Execute the tool (only web_search for agentic mode)
        const result = await executeWebSearch(toolCall.input, agenticConfig.webSearch);
        
        // Notify UI about result
        onToolResult?.({
          id: toolCall.id,
          name: toolCall.name,
          success: result.success,
          output: result.output,
          data: result,
        });
        
        // Add tool result to conversation
        conversationMessages.push(formatToolResult(toolCall.id, result));
      }
      
    } catch (error) {
      onError?.(error.message || 'Agentic chat error');
      return;
    }
  }
  
  // Max iterations reached
  onError?.('Maximum search iterations reached. Please try a simpler request.');
}

/**
 * Execute image generation request
 * Uses user's main provider first (if OpenAI), then falls back to configured image API
 * 
 * @param {Object} params - Generation parameters
 */
export async function executeImageGenerationWithFallback({
  prompt,
  style,
  size,
  mainProvider,
  mainApiKey,
  agenticConfig,
  providerApiKeys,
}) {
  // Priority order for image generation:
  // 1. User's selected provider (if OpenAI)
  // 2. OpenAI from providerApiKeys
  // 3. Configured image gen API in agenticTools settings
  
  const providerLower = (mainProvider || '').toLowerCase();
  
  // Try 1: User's main provider if it's OpenAI
  if ((providerLower === 'openai' || providerLower.includes('openai')) && mainApiKey) {
    try {
      const result = await executeImageGeneration(
        { prompt, style, size },
        { provider: 'openai', apiKey: mainApiKey, model: 'dall-e-3' }
      );
      if (result.success) return result;
    } catch (e) {
      console.warn('Main provider image gen failed:', e.message);
    }
  }
  
  // Try 2: OpenAI from saved provider keys
  if (providerApiKeys?.openai) {
    try {
      const result = await executeImageGeneration(
        { prompt, style, size },
        { provider: 'openai', apiKey: providerApiKeys.openai, model: 'dall-e-3' }
      );
      if (result.success) return result;
    } catch (e) {
      console.warn('OpenAI provider image gen failed:', e.message);
    }
  }
  
  // Try 3: Configured image generation API
  if (agenticConfig?.imageGeneration?.apiKey) {
    return executeImageGeneration(
      { prompt, style, size },
      agenticConfig.imageGeneration
    );
  }
  
  return {
    success: false,
    output: 'No image generation API available. Use OpenAI or configure an image generation API in Settings > Agentic Tools.',
  };
}

/**
 * Stream chat with image generation capability
 * generateImage mode = AI can generate images using generate_image tool
 */
export async function streamImageGenChat({
  messages,
  model,
  provider,
  baseUrl,
  apiKey,
  agenticConfig,
  providerApiKeys,
  onChunk,
  onThink,
  onToolCall,
  onToolResult,
  onDone,
  onError,
  signal,
}) {
  const providerLower = (provider || 'openai').toLowerCase();
  const MAX_ITERATIONS = 5; // Image gen needs fewer iterations
  
  // Check if we have any image generation capability
  const hasOpenAI = providerLower === 'openai' || !!providerApiKeys?.openai;
  const hasConfiguredImageGen = !!agenticConfig?.imageGeneration?.apiKey;
  
  if (!hasOpenAI && !hasConfiguredImageGen) {
    onError?.('No image generation API available. Use OpenAI provider or configure image API in Settings > Agentic Tools.');
    return;
  }
  
  const tools = getAgenticTools(providerLower, { webSearch: false, imageGeneration: true });
  
  let conversationMessages = [...messages];
  let totalUsage = null;
  
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    if (signal?.aborted) break;
    
    if (iteration > 0) {
      await new Promise(r => setTimeout(r, 1000));
    }
    
    try {
      const response = await callOpenAIWithTools({
        messages: conversationMessages,
        model,
        baseUrl,
        apiKey,
        tools,
        onChunk,
        onThink,
      });
      
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
        onToolCall?.({
          id: toolCall.id,
          name: toolCall.name,
          input: toolCall.input,
          commentary: toolCall.commentary || getDefaultCommentary(toolCall.name, toolCall.input),
        });
        
        // Execute image generation with fallback logic
        const result = await executeImageGenerationWithFallback({
          prompt: toolCall.input.prompt,
          style: toolCall.input.style,
          size: toolCall.input.size,
          mainProvider: provider,
          mainApiKey: apiKey,
          agenticConfig,
          providerApiKeys,
        });
        
        onToolResult?.({
          id: toolCall.id,
          name: toolCall.name,
          success: result.success,
          output: result.output,
          data: result,
        });
        
        conversationMessages.push(formatToolResult(toolCall.id, result));
      }
      
    } catch (error) {
      onError?.(error.message || 'Image generation error');
      return;
    }
  }
  
  onError?.('Maximum iterations reached.');
}

/**
 * Make OpenAI API call with tools (non-streaming for tool calls)
 */
async function callOpenAIWithTools({ messages, model, baseUrl, apiKey, tools, onChunk, onThink }) {
  const base = baseUrl || 'https://api.openai.com/v1';
  
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
    stream: false,
  };
  
  const response = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `API error: ${response.status}`);
  }
  
  const data = await response.json();
  const choice = data.choices?.[0];
  
  if (!choice) {
    throw new Error('No response from API');
  }
  
  // Send text content to UI
  if (choice.message?.content && onChunk) {
    onChunk(choice.message.content);
  }
  
  return {
    message: choice.message,
    finishReason: choice.finish_reason,
    usage: data.usage || null,
  };
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


