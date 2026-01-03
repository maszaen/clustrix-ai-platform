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

import { DEFAULT_PROVIDERS, normalizeUsage } from './api';
import * as FileSystem from 'expo-file-system/legacy';

// ===================================================================
// TOOL DEFINITIONS - For AI function calling (OpenAI format)
// ===================================================================

function formatISODateInTimeZone(now, timeZone) {
  // en-CA reliably yields YYYY-MM-DD ordering with these options.
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return dtf.format(now); // "YYYY-MM-DD"
}

// Get current date for context
const dateISO = formatISODateInTimeZone(new Date(), 'UTC');

export const WEB_SEARCH_TOOL = {
  type: 'function',
  function: {
    name: 'web_search',
    description: `Search the web for current information. Use for: up-to-date news, prices, weather, stocks, recent events, or when user asks to search. DATE: ${dateISO}. Provide 1-4 varied, specific queries with time anchors (month/year). Put tool args ONLY in function_call field, not in response content. After results: answer in plain language citing findings.`,
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
    description: `Generate an image from text description. Use ONLY when user explicitly requests: "create/generate/draw/make an image". Put tool args ONLY in function_call field, not in response content. Styles: realistic, artistic, cartoon, sketch, anime, 3d, watercolor, oil, pixel, minimalist. Sizes: 1024x1024 (square), 1792x1024 (landscape), 1024x1792 (portrait).`,
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

// Reattach file tool - allows AI to recall previously attached files
export const REATTACH_FILE_TOOL = {
  type: 'function',
  function: {
    name: 'reattach_file',
    description: `Retrieve a previously attached file by filename. Use after calling list_attachments to get available files. Returns file content for analysis.`,
    parameters: {
      type: 'object',
      properties: {
        filename: {
          type: 'string',
          description: 'Exact filename from list_attachments result',
        },
        commentary: {
          type: 'string',
          description: 'Brief explanation shown to user (e.g., "Recalling your image")',
        },
      },
      required: ['filename'],
    },
  },
};

// List attachments tool - AI can query available files in session
export const LIST_ATTACHMENTS_TOOL = {
  type: 'function',
  function: {
    name: 'list_attachments',
    description: `Call this FIRST when user references a file they sent earlier (e.g., "that image", "the file", "explain that photo"). Returns list of available filenames to use with reattach_file.`,
    parameters: {
      type: 'object',
      properties: {
        commentary: {
          type: 'string',
          description: 'Brief explanation (e.g., "Checking available files")',
        },
      },
      required: [],
    },
  },
};

// ===================================================================
// REMINDER TOOL DEFINITIONS
// ===================================================================

// View reminder tool - see all scheduled reminders
export const VIEW_REMINDER_TOOL = {
  type: 'function',
  function: {
    name: 'view_reminder',
    description: `View all scheduled reminders for the current user. Returns a list of reminders with their titles, messages, and scheduled dates.`,
    parameters: {
      type: 'object',
      properties: {
        commentary: {
          type: 'string',
          description: 'Brief explanation (e.g., "Checking your reminders")',
        },
      },
      required: [],
    },
  },
};

// Set reminder tool - schedule a new notification
export const SET_REMINDER_TOOL = {
  type: 'function',
  function: {
    name: 'set_reminder',
    description: `Schedule a new reminder notification. The notification will appear at the specified time even if the app is closed. Use for: scheduling follow-ups, subscription reminders, task deadlines, or any time-based alerts the user requests. You MUST provide both a title AND a notification body - create engaging notification text that will grab the user's attention.`,
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Short title for the reminder (e.g., "Subscription Reminder", "Meeting with John")',
        },
        message: {
          type: 'string',
          description: 'Detailed description/notes for the reminder (stored for reference)',
        },
        notificationTitle: {
          type: 'string',
          description: 'Title shown in the push notification (e.g., "⏰ Time for your meeting!")',
        },
        notificationBody: {
          type: 'string',
          description: 'Body text shown in the push notification - make it engaging and actionable (e.g., "Your meeting with John starts now. Don\'t forget the quarterly report!")',
        },
        scheduledDate: {
          type: 'string',
          description: 'ISO 8601 date string for when the reminder should trigger (e.g., "2026-01-15T09:00:00+07:00"). Must be in the future.',
        },
        commentary: {
          type: 'string',
          description: 'Brief explanation shown to user (e.g., "Setting reminder for January 15th")',
        },
      },
      required: ['title', 'notificationTitle', 'notificationBody', 'scheduledDate'],
    },
  },
};


// Remove reminder tool - permanently delete a reminder
export const REMOVE_REMINDER_TOOL = {
  type: 'function',
  function: {
    name: 'remove_reminder',
    description: `Permanently delete a scheduled reminder. This completely removes the reminder from the system. Use view_reminder first to get the reminder ID. Use this when user wants to DELETE a reminder, not just complete it.`,
    parameters: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The unique ID of the reminder to delete (from view_reminder results)',
        },
        commentary: {
          type: 'string',
          description: 'Brief explanation shown to user (e.g., "Deleting your reminder")',
        },
      },
      required: ['id'],
    },
  },
};

// Complete reminder tool - mark as done without deleting
export const COMPLETE_REMINDER_TOOL = {
  type: 'function',
  function: {
    name: 'complete_reminder',
    description: `Mark a reminder as completed. The reminder will be marked as done but NOT deleted - it will still be visible in the user's reminder history but greyed out. Use view_reminder first to get the reminder ID. Use this when user says they've done something or finished a task.`,
    parameters: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The unique ID of the reminder to mark as complete (from view_reminder results)',
        },
        commentary: {
          type: 'string',
          description: 'Brief explanation shown to user (e.g., "Marking reminder as complete")',
        },
      },
      required: ['id'],
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

export const REATTACH_FILE_TOOL_CLAUDE = {
  name: 'reattach_file',
  description: REATTACH_FILE_TOOL.function.description,
  input_schema: REATTACH_FILE_TOOL.function.parameters,
};

export const LIST_ATTACHMENTS_TOOL_CLAUDE = {
  name: 'list_attachments',
  description: LIST_ATTACHMENTS_TOOL.function.description,
  input_schema: LIST_ATTACHMENTS_TOOL.function.parameters,
};

// Reminder tools - Claude format
export const VIEW_REMINDER_TOOL_CLAUDE = {
  name: 'view_reminder',
  description: VIEW_REMINDER_TOOL.function.description,
  input_schema: VIEW_REMINDER_TOOL.function.parameters,
};

export const SET_REMINDER_TOOL_CLAUDE = {
  name: 'set_reminder',
  description: SET_REMINDER_TOOL.function.description,
  input_schema: SET_REMINDER_TOOL.function.parameters,
};

export const REMOVE_REMINDER_TOOL_CLAUDE = {
  name: 'remove_reminder',
  description: REMOVE_REMINDER_TOOL.function.description,
  input_schema: REMOVE_REMINDER_TOOL.function.parameters,
};

export const COMPLETE_REMINDER_TOOL_CLAUDE = {
  name: 'complete_reminder',
  description: COMPLETE_REMINDER_TOOL.function.description,
  input_schema: COMPLETE_REMINDER_TOOL.function.parameters,
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

export const REATTACH_FILE_TOOL_GEMINI = {
  name: 'reattach_file',
  description: REATTACH_FILE_TOOL.function.description,
  parameters: REATTACH_FILE_TOOL.function.parameters,
};

export const LIST_ATTACHMENTS_TOOL_GEMINI = {
  name: 'list_attachments',
  description: LIST_ATTACHMENTS_TOOL.function.description,
  parameters: LIST_ATTACHMENTS_TOOL.function.parameters,
};

// Reminder tools - Gemini format
export const VIEW_REMINDER_TOOL_GEMINI = {
  name: 'view_reminder',
  description: VIEW_REMINDER_TOOL.function.description,
  parameters: VIEW_REMINDER_TOOL.function.parameters,
};

export const SET_REMINDER_TOOL_GEMINI = {
  name: 'set_reminder',
  description: SET_REMINDER_TOOL.function.description,
  parameters: SET_REMINDER_TOOL.function.parameters,
};

export const REMOVE_REMINDER_TOOL_GEMINI = {
  name: 'remove_reminder',
  description: REMOVE_REMINDER_TOOL.function.description,
  parameters: REMOVE_REMINDER_TOOL.function.parameters,
};

export const COMPLETE_REMINDER_TOOL_GEMINI = {
  name: 'complete_reminder',
  description: COMPLETE_REMINDER_TOOL.function.description,
  parameters: COMPLETE_REMINDER_TOOL.function.parameters,
};

/**
 * Get tools array for AI provider
 * @param {string} provider - 'openai' | 'anthropic' | 'google' | etc
 * @param {Object} enabledTools - { webSearch: boolean, imageGeneration: boolean, attachmentTools: boolean, reminderTools: boolean }
 */
export function getAgenticTools(provider, enabledTools = { webSearch: true, imageGeneration: true, attachmentTools: true, reminderTools: true }) {
  if (!provider) throw new Error('Provider is required for getAgenticTools');
  const providerLower = provider.toLowerCase();
  const tools = [];

  if (providerLower === 'anthropic' || providerLower === 'claude') {
    // Anthropic format
    if (enabledTools.webSearch) tools.push(WEB_SEARCH_TOOL_CLAUDE);
    if (enabledTools.imageGeneration) tools.push(IMAGE_GENERATION_TOOL_CLAUDE);
    if (enabledTools.attachmentTools) {
      tools.push(LIST_ATTACHMENTS_TOOL_CLAUDE);
      tools.push(REATTACH_FILE_TOOL_CLAUDE);
    }
    if (enabledTools.reminderTools) {
      tools.push(VIEW_REMINDER_TOOL_CLAUDE);
      tools.push(SET_REMINDER_TOOL_CLAUDE);
      tools.push(COMPLETE_REMINDER_TOOL_CLAUDE);
      tools.push(REMOVE_REMINDER_TOOL_CLAUDE);
    }
  } else if (providerLower === 'google' || providerLower === 'gemini') {
    // Gemini format (wrapped in functionDeclarations)
    const functions = [];
    if (enabledTools.webSearch) functions.push(WEB_SEARCH_TOOL_GEMINI);
    if (enabledTools.imageGeneration) functions.push(IMAGE_GENERATION_TOOL_GEMINI);
    if (enabledTools.attachmentTools) {
      functions.push(LIST_ATTACHMENTS_TOOL_GEMINI);
      functions.push(REATTACH_FILE_TOOL_GEMINI);
    }
    if (enabledTools.reminderTools) {
      functions.push(VIEW_REMINDER_TOOL_GEMINI);
      functions.push(SET_REMINDER_TOOL_GEMINI);
      functions.push(COMPLETE_REMINDER_TOOL_GEMINI);
      functions.push(REMOVE_REMINDER_TOOL_GEMINI);
    }
    if (functions.length > 0) {
      tools.push({ functionDeclarations: functions });
    }
  } else {
    // OpenAI format (default)
    if (enabledTools.webSearch) tools.push(WEB_SEARCH_TOOL);
    if (enabledTools.imageGeneration) tools.push(IMAGE_GENERATION_TOOL);
    if (enabledTools.attachmentTools) {
      tools.push(LIST_ATTACHMENTS_TOOL);
      tools.push(REATTACH_FILE_TOOL);
    }
    if (enabledTools.reminderTools) {
      tools.push(VIEW_REMINDER_TOOL);
      tools.push(SET_REMINDER_TOOL);
      tools.push(COMPLETE_REMINDER_TOOL);
      tools.push(REMOVE_REMINDER_TOOL);
    }
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
// REATTACH FILE EXECUTION
// ===================================================================

/**
 * Execute list attachments - return list of available files in session
 * Queries database directly to find ALL attachments regardless of loaded messages
 * @param {Object} input - { commentary?: string }
 * @param {Object} config - { sessionId: string } - Session ID to query
 * @returns {Promise<{success: boolean, output: string, files: Array}>}
 */
export async function executeListAttachments(input, config) {
  const { sessionId } = config;
  
  if (!sessionId) {
    return {
      success: false,
      output: 'Session ID not available.',
      files: [],
    };
  }
  
  // Import dynamically to avoid circular dependency
  const { getSessionAttachments } = await import('../database/db.js');
  
  try {
    const attachments = await getSessionAttachments(sessionId);
    
    if (attachments.length === 0) {
      return {
        success: true,
        output: 'No files were attached in this session.',
        files: [],
      };
    }
    
    const fileList = attachments.map(a => {
      const type = a.type === 'image' ? 'Image' : 'File';
      return `- ${type}: "${a.name}"${a.mimeType ? ` (${a.mimeType})` : ''}`;
    }).join('\n');
    
    return {
      success: true,
      output: `Available files in this session:\n${fileList}`,
      files: attachments.map(a => ({ name: a.name, type: a.type, mimeType: a.mimeType })),
    };
  } catch (error) {
    return {
      success: false,
      output: `Error querying attachments: ${error.message}`,
      files: [],
    };
  }
}

/**
 * Execute reattach file - recall a previously attached file by filename
 * Queries database directly to find attachment regardless of loaded messages
 * @param {Object} input - { filename: string, commentary?: string }
 * @param {Object} config - { sessionId: string } - Session ID to query
 * @returns {Promise<{success: boolean, output: string, base64?: string, textContent?: string}>}
 */
export async function executeReattachFile(input, config) {
  const { filename } = input;
  const { sessionId } = config;
  
  if (!filename) {
    return { success: false, output: 'Filename is required.' };
  }
  
  if (!sessionId) {
    return { success: false, output: 'Session ID not available.' };
  }
  
  // Import dynamically to avoid circular dependency
  const { getSessionAttachments } = await import('../database/db.js');
  
  try {
    const attachments = await getSessionAttachments(sessionId);
    
    // Find attachment by filename (case-insensitive)
    const attachment = attachments.find(a => 
      a.name?.toLowerCase() === filename.toLowerCase()
    );
    
    if (!attachment) {
      const available = attachments.map(a => a.name).join(', ') || 'none';
      return { 
        success: false, 
        output: `File "${filename}" not found. Available files: ${available}` 
      };
    }
    
    // For text files, return textContent if available
    if (attachment.textContent) {
      return {
        success: true,
        output: `[File: ${attachment.name}]\n${attachment.textContent}\n[End File]`,
        textContent: attachment.textContent,
      };
    }
    
    // For images/binary files, re-encode from URI if available
    if (attachment.uri) {
      // Check if URI is a data URI (already base64)
      if (attachment.uri.startsWith('data:')) {
        const base64Match = attachment.uri.match(/base64,(.+)$/);
        if (base64Match) {
          return {
            success: true,
            output: `Image "${attachment.name}" recalled successfully.`,
            base64: base64Match[1],
            mimeType: attachment.mimeType,
          };
        }
      }
      
      // Try to read from file URI
      const fileInfo = await FileSystem.getInfoAsync(attachment.uri);
      if (fileInfo.exists) {
        const base64 = await FileSystem.readAsStringAsync(attachment.uri, {
          encoding: 'base64',
        });
        return {
          success: true,
          output: `File "${attachment.name}" recalled successfully.`,
          base64,
          mimeType: attachment.mimeType,
        };
      }
    }
    
    // Check if attachment has base64 stored directly
    if (attachment.base64) {
      return {
        success: true,
        output: `File "${attachment.name}" recalled successfully.`,
        base64: attachment.base64,
        mimeType: attachment.mimeType,
      };
    }
    
    return {
      success: false,
      output: `File "${attachment.name}" exists in history but content is no longer available. The file may have been deleted from device.`,
    };
  } catch (error) {
    return {
      success: false,
      output: `Error recalling file "${attachment.name}": ${error.message}`,
    };
  }
}

// ===================================================================
// REMINDER TOOL EXECUTION
// ===================================================================

/**
 * Execute view_reminder - get all reminders for current user
 * @param {Object} input - { commentary?: string }
 * @param {Object} config - { userId: string }
 * @returns {Promise<{success: boolean, output: string, reminders: Array}>}
 */
export async function executeViewReminder(input, config) {
  const { userId } = config;
  
  if (!userId) {
    return {
      success: false,
      output: 'User authentication required to view reminders. Please log in.',
      reminders: [],
    };
  }
  
  try {
    const { getActiveReminders, cleanupPastReminders } = await import('../database/db.js');
    
    // Clean up past reminders first
    const cleanedCount = await cleanupPastReminders(userId);
    if (cleanedCount > 0) {
      console.log(`[REMINDER] Cleaned up ${cleanedCount} past reminders`);
    }
    
    // Get ACTIVE reminders only (excludes completed)
    const reminders = await getActiveReminders(userId);
    
    if (reminders.length === 0) {
      return {
        success: true,
        output: 'You have no scheduled reminders.',
        reminders: [],
      };
    }
    
    // Format for display
    const lines = reminders.map((r, i) => {
      const date = new Date(r.scheduledDate);
      const formattedDate = date.toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
      return `${i + 1}. **${r.title}**\n   📅 ${formattedDate}\n   💬 ${r.message}\n   🔑 ID: \`${r.id}\``;
    });
    
    return {
      success: true,
      output: `You have ${reminders.length} scheduled reminder(s):\n\n${lines.join('\n\n')}`,
      reminders,
    };
  } catch (error) {
    return {
      success: false,
      output: `Error retrieving reminders: ${error.message}`,
      reminders: [],
    };
  }
}

/**
 * Execute set_reminder - schedule a new notification
 * @param {Object} input - { title, message, notificationTitle, notificationBody, scheduledDate, commentary? }
 * @param {Object} config - { userId: string }
 * @returns {Promise<{success: boolean, output: string, reminder?: Object}>}
 */
export async function executeSetReminder(input, config) {
  const { title, message, notificationTitle, notificationBody, scheduledDate } = input;
  const { userId } = config;
  
  if (!userId) {
    return {
      success: false,
      output: 'User authentication required to set reminders. Please log in.',
    };
  }
  
  if (!title || !scheduledDate) {
    return {
      success: false,
      output: 'Missing required fields: title and scheduledDate are required.',
    };
  }
  
  // Validate date
  const triggerDate = new Date(scheduledDate);
  if (isNaN(triggerDate.getTime())) {
    return {
      success: false,
      output: `Invalid date format: "${scheduledDate}". Please use ISO 8601 format (e.g., 2026-01-15T09:00:00+07:00).`,
    };
  }
  
  if (triggerDate.getTime() <= Date.now()) {
    return {
      success: false,
      output: 'Scheduled date must be in the future.',
    };
  }
  
  try {
    const { saveReminder } = await import('../database/db.js');
    
    // Use AI-provided notification title/body, fallback to reminder title/message
    const finalNotifTitle = notificationTitle || title;
    const finalNotifBody = notificationBody || message || title;
    
    // Try to schedule notification via @notifee (graceful fallback if not available)
    let notificationId = '';
    let notificationScheduled = false;
    
    try {
      const { scheduleNotification } = await import('./notifications.js');
      const scheduleResult = await scheduleNotification({
        title: finalNotifTitle,
        message: finalNotifBody,
        scheduledDate: triggerDate,
        metadata: { userId },
      });
      
      if (scheduleResult.success) {
        notificationId = scheduleResult.notificationId;
        notificationScheduled = true;
      } else {
        console.warn('[REMINDER] Notification scheduling failed:', scheduleResult.error);
      }
    } catch (notifError) {
      console.warn('[REMINDER] @notifee not available, saving reminder without notification:', notifError.message);
    }
    
    // Generate reminder ID
    const reminderId = `reminder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Save to database (regardless of notification success)
    const reminder = {
      id: reminderId,
      userId,
      title,
      message: message || title,
      scheduledDate: triggerDate.toISOString(),
      notificationId: notificationId,
      metadata: { 
        notificationTitle: finalNotifTitle,
        notificationBody: finalNotifBody,
      },
    };
    
    await saveReminder(reminder);
    
    // Format date for display
    const formattedDate = triggerDate.toLocaleString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
    
    const notifNote = notificationScheduled 
      ? "\n\nYou'll receive a notification at that time, even if the app is closed."
      : "\n\n⚠️ Note: Push notifications are not configured. Reminder saved but won't trigger a notification.";
    
    return {
      success: true,
      output: `✅ Reminder set successfully!\n\n**${title}**\n📅 ${formattedDate}${message ? `\n💬 ${message}` : ''}\n\n🔔 Notification: "${finalNotifTitle}"${notifNote}`,
      reminder,
    };
  } catch (error) {
    return {
      success: false,
      output: `Error setting reminder: ${error.message}`,
    };
  }
}

/**
 * Execute remove_reminder - cancel a scheduled reminder
 * @param {Object} input - { id, commentary? }
 * @param {Object} config - { userId: string }
 * @returns {Promise<{success: boolean, output: string}>}
 */
export async function executeRemoveReminder(input, config) {
  const { id } = input;
  const { userId } = config;
  
  if (!userId) {
    return {
      success: false,
      output: 'User authentication required to remove reminders. Please log in.',
    };
  }
  
  if (!id) {
    return {
      success: false,
      output: 'Reminder ID is required. Use view_reminder to see available reminders.',
    };
  }
  
  try {
    const { getReminder, deleteReminder } = await import('../database/db.js');
    
    // Get reminder to validate ownership and get notificationId
    const reminder = await getReminder(id, userId);
    
    if (!reminder) {
      return {
        success: false,
        output: `Reminder with ID "${id}" not found or doesn't belong to you.`,
      };
    }
    
    // Try to cancel notification in OS (graceful fallback if not available)
    if (reminder.notificationId) {
      try {
        const { cancelNotification } = await import('./notifications.js');
        await cancelNotification(reminder.notificationId);
      } catch (notifError) {
        console.warn('[REMINDER] Could not cancel notification:', notifError.message);
      }
    }
    
    // Delete from database
    await deleteReminder(id, userId);
    
    return {
      success: true,
      output: `🗑️ Reminder "${reminder.title}" has been permanently deleted.`,
    };
  } catch (error) {
    return {
      success: false,
      output: `Error removing reminder: ${error.message}`,
    };
  }
}

/**
 * Execute complete_reminder - mark a reminder as done (does NOT delete)
 * @param {Object} input - { id, commentary? }
 * @param {Object} config - { userId: string }
 * @returns {Promise<{success: boolean, output: string}>}
 */
export async function executeCompleteReminder(input, config) {
  const { id } = input;
  const { userId } = config;
  
  if (!userId) {
    return {
      success: false,
      output: 'User authentication required to complete reminders. Please log in.',
    };
  }
  
  if (!id) {
    return {
      success: false,
      output: 'Reminder ID is required. Use view_reminder to see available reminders.',
    };
  }
  
  try {
    const { getReminder, completeReminder } = await import('../database/db.js');
    
    // Get reminder to validate ownership
    const reminder = await getReminder(id, userId);
    
    if (!reminder) {
      return {
        success: false,
        output: `Reminder with ID "${id}" not found or doesn't belong to you.`,
      };
    }
    
    if (reminder.isCompleted) {
      return {
        success: true,
        output: `Reminder "${reminder.title}" is already marked as complete.`,
      };
    }
    
    // Cancel notification in OS (no longer needed)
    if (reminder.notificationId) {
      try {
        const { cancelNotification } = await import('./notifications.js');
        await cancelNotification(reminder.notificationId);
      } catch (notifError) {
        console.warn('[REMINDER] Could not cancel notification:', notifError.message);
      }
    }
    
    // Mark as completed (NOT delete)
    await completeReminder(id, userId);
    
    return {
      success: true,
      output: `✅ Reminder "${reminder.title}" has been marked as complete!\n\nThe reminder is now in your completed history.`,
    };
  } catch (error) {
    return {
      success: false,
      output: `Error completing reminder: ${error.message}`,
    };
  }
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

    case 'reattach_file':
      return executeReattachFile(input, config.reattachFile);

    case 'view_reminder':
      return executeViewReminder(input, config.reminder);

    case 'set_reminder':
      return executeSetReminder(input, config.reminder);

    case 'complete_reminder':
      return executeCompleteReminder(input, config.reminder);

    case 'remove_reminder':
      return executeRemoveReminder(input, config.reminder);

    default:
      return {
        success: false,
        output: `Unknown tool: ${toolName}. Available tools: web_search, generate_image, reattach_file, view_reminder, set_reminder, complete_reminder, remove_reminder`,
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
        
        // Build part with functionCall
        const part = { functionCall: { name: tc.function?.name, args } };
        
        // Include thoughtSignature if present (required for Gemini 3)
        if (tc._geminiThoughtSignature) {
          part.thoughtSignature = tc._geminiThoughtSignature;
        }
        
        parts.push(part);
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
  
  // Build tool config for Gemini
  const toolConfig = geminiTools.length > 0 ? {
    functionCallingConfig: {
      mode: 'AUTO',
    }
  } : undefined;
  
  const body = {
    contents,
    tools: geminiTools.length > 0 ? geminiTools : undefined,
    toolConfig,
    systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
    generationConfig: { 
      maxOutputTokens: 8192,
    },
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
    const functionCalls = []; // Will store { functionCall, thoughtSignature }
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
                // Capture thoughtSignature if present (required for Gemini 3)
                functionCalls.push({
                  functionCall: part.functionCall,
                  thoughtSignature: part.thoughtSignature || null,
                });
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
      
      // Convert to OpenAI-like format, preserving Gemini-specific data
      const toolCalls = functionCalls.map((fc, i) => ({
        id: `gemini_${Date.now()}_${i}`,
        type: 'function',
        function: { name: fc.functionCall.name, arguments: JSON.stringify(fc.functionCall.args || {}) },
        // Preserve thoughtSignature for Gemini tool result handling
        _geminiThoughtSignature: fc.thoughtSignature,
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
  useCloud,
  idToken,
  userEmail,
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
  
  // For agentic mode, enable web search + attachment tools + reminder tools
  const tools = getAgenticTools(providerLower, { 
    webSearch: true, 
    imageGeneration: false,
    attachmentTools: true,  // Always enable - AI can query and will get empty list if none
    reminderTools: true,    // Always enable - requires userId for execution
  });
  
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

      // ==== CLOUD MODE ROUTING ====
      if (useCloud) {
        // Use dedicated cloud agentic endpoint
        const { streamCloudAgentic } = await import('./clustrixCloud');
        
        // Query attachments from database for cloud endpoint (it can't access local DB)
        let sessionAttachments = [];
        if (agenticConfig?.sessionId) {
          try {
            const { getSessionAttachments } = await import('../database/db.js');
            const rawAttachments = await getSessionAttachments(agenticConfig.sessionId);
            
            // Populate base64 content for each attachment from URI/file system
            // Backend needs this because it can't access mobile's local files
            sessionAttachments = await Promise.all(rawAttachments.map(async (att) => {
              // Skip if already has base64 or textContent
              if (att.base64 || att.textContent) {
                return att;
              }
              
              // Try to read base64 from URI
              if (att.uri) {
                try {
                  // Data URI already contains base64
                  if (att.uri.startsWith('data:')) {
                    const base64Match = att.uri.match(/base64,(.+)$/);
                    if (base64Match) {
                      return { ...att, base64: base64Match[1] };
                    }
                  }
                  
                  // File URI - read from file system
                  const fileInfo = await FileSystem.getInfoAsync(att.uri);
                  if (fileInfo.exists) {
                    const base64 = await FileSystem.readAsStringAsync(att.uri, {
                      encoding: 'base64',
                    });
                    return { ...att, base64 };
                  }
                } catch (readErr) {
                  console.warn(`[AGENTIC] Failed to read file ${att.name}:`, readErr.message);
                }
              }
              
              return att;
            }));
          } catch (e) {
            console.warn('[AGENTIC] Failed to load session attachments for cloud:', e.message);
          }
        }
        
        // Delegate to cloud endpoint - it handles the full agentic loop server-side
        return streamCloudAgentic({
          idToken: idToken || apiKey,
          model,
          messages: conversationMessages,
          sessionAttachments, // Pass attachments for list_attachments and reattach_file tools
          signal,
          onChunk,
          onThink,
          onToolCall,
          onToolResult,
          onDone,
          onError,
          userEmail,
        });
      } else if (providerLower === 'anthropic' || model.toLowerCase().includes('claude')) {
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
      
      // Merge usage - normalize across providers (Gemini, Anthropic, OpenAI formats)
      if (response.usage) {
        const normalized = normalizeUsage(provider, response.usage);
        if (normalized) {
          if (!totalUsage) totalUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
          totalUsage.prompt_tokens += normalized.prompt_tokens || 0;
          totalUsage.completion_tokens += normalized.completion_tokens || 0;
          totalUsage.total_tokens += normalized.total_tokens || 0;
        }
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

        // Internal tools that shouldn't show OUTPUT in CommandBlock
        const isInternalTool = ['list_attachments', 'reattach_file'].includes(toolCall.name);

        // 1. Stream COMMAND INPUT tag (always - shows CommandBlock header)
        const inputPayload = JSON.stringify({
            command: toolCall.name,
            args: toolCall.input,
            commentary: commentary
        });
        onChunk(`<!--command-input-->${inputPayload}<!--/command-input-->`);
        
        // Execute the tool
        let result;
        if (toolCall.name === 'web_search') {
          result = await executeWebSearch(toolCall.input, agenticConfig.webSearch);
        } else if (toolCall.name === 'list_attachments') {
          result = await executeListAttachments(toolCall.input, { 
            sessionId: agenticConfig.sessionId 
          });
        } else if (toolCall.name === 'reattach_file') {
          result = await executeReattachFile(toolCall.input, { 
            sessionId: agenticConfig.sessionId 
          });
          
          // If reattach was successful and has base64, inject it into next message as attachment
          if (result.success && (result.base64 || result.textContent)) {
            // Format tool result to include the file content for AI to see
            const fileContent = result.textContent || 
              `[Image: ${toolCall.input.filename} - Base64 content available]`;
            result.output = fileContent;
          }
        } else if (toolCall.name === 'view_reminder') {
          result = await executeViewReminder(toolCall.input, { 
            userId: agenticConfig.userId 
          });
        } else if (toolCall.name === 'set_reminder') {
          result = await executeSetReminder(toolCall.input, { 
            userId: agenticConfig.userId 
          });
        } else if (toolCall.name === 'complete_reminder') {
          result = await executeCompleteReminder(toolCall.input, { 
            userId: agenticConfig.userId 
          });
        } else if (toolCall.name === 'remove_reminder') {
          result = await executeRemoveReminder(toolCall.input, { 
            userId: agenticConfig.userId 
          });
        } else {
          result = { success: false, output: `Unknown tool: ${toolCall.name}` };
        }
        
        // 2. Stream COMMAND OUTPUT tag (always - marks CommandBlock as complete)
        // Note: CommandBlock.js hides output section for internal tools (list_attachments, reattach_file)
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
  useCloud,
  idToken,
  userEmail,
  imageModel,
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
      // ==== CLOUD MODE CHECK ====
      if (useCloud) {
        // Use dedicated cloud image gen endpoint
        const { streamCloudImageGen } = await import('./clustrixCloud');
        
        return streamCloudImageGen({
          idToken: idToken || apiKey,
          model,
          messages: conversationMessages,
          imageModel: resolvedImageModel,
          signal,
          onChunk,
          onToolCall,
          onToolResult,
          onDone,
          onError,
          userEmail,
        });
      }

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
      
      // Merge usage - normalize across providers (Gemini, Anthropic, OpenAI formats)
      if (response.usage) {
        const normalized = normalizeUsage(provider, response.usage);
        if (normalized) {
          if (!totalUsage) totalUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
          totalUsage.prompt_tokens += normalized.prompt_tokens || 0;
          totalUsage.completion_tokens += normalized.completion_tokens || 0;
          totalUsage.total_tokens += normalized.total_tokens || 0;
        }
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
    case 'view_reminder':
      return 'Checking your reminders...';
    case 'set_reminder':
      return `Setting reminder: "${input.title || 'Reminder'}"`;
    case 'complete_reminder':
      return 'Marking reminder as complete...';
    case 'remove_reminder':
      return 'Deleting reminder...';
    case 'list_attachments':
      return 'Checking available files...';
    case 'reattach_file':
      return `Recalling: ${input.filename || 'file'}`;
    default:
      return `Executing ${toolName}...`;
  }
}


