/**
 * Image Generation API Route
 * 
 * Handles chat with image generation capabilities
 * Uses AI to decide when to generate images based on user requests
 */

const express = require('express');
const router = express.Router();
const { getModelConfig } = require('../config/models');

// ===================================================================
// IMAGE GENERATION SUPPORT MAP
// ===================================================================

const IMAGE_GEN_SUPPORT = {
  openai: { 
    supported: true, 
    defaultModel: 'gpt-image-1',
    models: ['gpt-image-1', 'dall-e-3', 'dall-e-2'],
    baseUrl: 'https://api.openai.com/v1',
  },
  google: { 
    supported: true, 
    defaultModel: 'imagen-3.0-generate-002',
    models: ['imagen-3.0-generate-002', 'imagen-3.0-generate-001'],
  },
  gemini: { 
    supported: true, 
    defaultModel: 'imagen-3.0-generate-002',
    models: ['imagen-3.0-generate-002', 'imagen-3.0-generate-001'],
  },
  xai: { 
    supported: true, 
    defaultModel: 'grok-2-image',
    models: ['grok-2-image', 'aurora'],
    baseUrl: 'https://api.x.ai/v1',
  },
  zhipu: { 
    supported: true, 
    defaultModel: 'cogview-4-250304',
    models: ['cogview-4-250304', 'cogview-3-flash'],
  },
  bigmodel: { 
    supported: true, 
    defaultModel: 'cogview-4-250304',
    models: ['cogview-4-250304', 'cogview-3-flash'],
  },
  anthropic: { supported: false, reason: 'Claude does not support image generation.' },
  deepseek: { supported: false, reason: 'DeepSeek does not support image generation.' },
  mistral: { supported: false, reason: 'Mistral does not support image generation.' },
  cerebras: { supported: false, reason: 'Cerebras does not support image generation.' },
  groq: { supported: false, reason: 'Groq does not support image generation.' },
  openrouter: { supported: false, reason: 'OpenRouter image support depends on underlying model.' },
};

// ===================================================================
// TOOL DEFINITION
// ===================================================================

const IMAGE_GENERATION_TOOL = {
  type: 'function',
  function: {
    name: 'generate_image',
    description: `Generate an image from text description. Use ONLY when user explicitly requests image creation:
- "create an image of..."
- "generate a picture of..."
- "draw..."
- "make an image..."

IMPORTANT: TOOL CALLS MUST BE IN THE TOOL FIELD

- NEVER write tool JSON/payload in the assistant response/content field.
- If using a tool: emit ONLY a tool invocation (name + args) in the tool/function_call field.
- Keep response/content empty or user-facing text only (no JSON, no "calling tool…").
- Do not follow message history formatting; logs may be post-processed.
- Only call generate_image on explicit "create/generate/draw/make an image" requests.
- generate_image args allowed ONLY: prompt (required), style, size, commentary. No extra keys.
- DO NOT use for analyzing existing images or general questions about images.

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

// Claude format
const IMAGE_GENERATION_TOOL_CLAUDE = {
  name: 'generate_image',
  description: IMAGE_GENERATION_TOOL.function.description,
  input_schema: IMAGE_GENERATION_TOOL.function.parameters,
};

// Gemini format
const IMAGE_GENERATION_TOOL_GEMINI = {
  functionDeclarations: [{
    name: 'generate_image',
    description: IMAGE_GENERATION_TOOL.function.description,
    parameters: IMAGE_GENERATION_TOOL.function.parameters,
  }],
};

// ===================================================================
// IMAGE GENERATION EXECUTION
// ===================================================================

async function executeImageGeneration(input, config) {
  const { prompt, style, size = '1024x1024' } = input;
  
  if (!prompt) {
    return { success: false, output: 'No prompt provided' };
  }
  
  // Enhance prompt with style if provided
  const fullPrompt = style ? `${prompt}, in ${style} style` : prompt;
  
  try {
    let result;
    
    switch (config.provider) {
      case 'openai':
        result = await generateWithOpenAI(fullPrompt, size, config);
        break;
      case 'google':
      case 'gemini':
        result = await generateWithGemini(fullPrompt, size, config);
        break;
      case 'xai':
        result = await generateWithXAI(fullPrompt, size, config);
        break;
      case 'zhipu':
      case 'bigmodel':
        result = await generateWithZhipu(fullPrompt, size, config);
        break;
      default:
        return { 
          success: false, 
          output: `Provider "${config.provider}" does not support image generation`,
        };
    }
    
    return {
      success: true,
      output: `Image generated successfully. URL: ${result.url || '[base64 data]'}`,
      data: result,
    };
    
  } catch (err) {
    console.error('[IMAGE GEN] Error:', err.message);
    return { success: false, output: `Image generation failed: ${err.message}` };
  }
}

async function generateWithOpenAI(prompt, size, config) {
  const url = `${config.baseUrl || 'https://api.openai.com/v1'}/images/generations`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.imageModel || 'gpt-image-1',
      prompt,
      n: 1,
      size,
      response_format: 'b64_json',
    }),
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `OpenAI error: ${response.status}`);
  }
  
  const data = await response.json();
  const imageData = data.data?.[0];
  
  if (!imageData?.b64_json && !imageData?.url) {
    throw new Error('No image generated');
  }
  
  return {
    base64: imageData.b64_json,
    url: imageData.url,
  };
}

async function generateWithGemini(prompt, size, config) {
  const model = config.imageModel || 'imagen-3.0-generate-002';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${config.apiKey}`;
  
  // Parse size
  let width = 1024, height = 1024;
  if (size === '1792x1024') { width = 1792; height = 1024; }
  else if (size === '1024x1792') { width = 1024; height = 1792; }
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instances: [{ prompt }],
      parameters: {
        sampleCount: 1,
        aspectRatio: width > height ? '16:9' : height > width ? '9:16' : '1:1',
      },
    }),
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `Gemini error: ${response.status}`);
  }
  
  const data = await response.json();
  const imageData = data.predictions?.[0];
  
  if (!imageData?.bytesBase64Encoded) {
    throw new Error('No image generated from Imagen');
  }
  
  return {
    base64: imageData.bytesBase64Encoded,
    mimeType: imageData.mimeType || 'image/png',
  };
}

async function generateWithXAI(prompt, size, config) {
  const url = 'https://api.x.ai/v1/images/generations';
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.imageModel || 'grok-2-image',
      prompt,
      n: 1,
      response_format: 'b64_json',
    }),
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `xAI error: ${response.status}`);
  }
  
  const data = await response.json();
  const imageData = data.data?.[0];
  
  if (!imageData?.b64_json && !imageData?.url) {
    throw new Error('No image generated from Grok');
  }
  
  return {
    base64: imageData.b64_json,
    url: imageData.url,
  };
}

async function generateWithZhipu(prompt, size, config) {
  const url = 'https://open.bigmodel.cn/api/paas/v4/images/generations';
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.imageModel || 'cogview-4-250304',
      prompt,
      size,
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
// IMAGE GENERATION CHAT HANDLER
// ===================================================================

const { trackRequest } = require('../services/analytics');

const MAX_ITERATIONS = 5;

/**
 * POST /api/image-gen
 * 
 * Body: { model, messages, imageModel?, stream?, temperature?, max_tokens? }
 */
router.post('/', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { model, messages, imageModel, stream = true, temperature, max_tokens } = req.body;
    
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
    
    // Check if provider supports image generation
    const support = IMAGE_GEN_SUPPORT[config.provider];
    if (!support?.supported) {
      const reason = support?.reason || `Provider "${config.provider}" does not support image generation.`;
      return res.status(400).json({
        error: `${reason}\n\nSupported providers: OpenAI, Google/Gemini, xAI`,
        code: 'IMAGE_GEN_NOT_SUPPORTED',
      });
    }
    
    console.log(`[IMAGE-GEN] User ${req.user.email} requesting ${model} (${config.provider})`);
    
    // Image generation config
    const imageConfig = {
      provider: config.provider,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      imageModel: imageModel || support.defaultModel,
    };
    
    // Setup streaming
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
    }
    
    // Agentic loop for image generation
    let conversationMessages = [...messages];
    
    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      let response;
      
      switch (config.provider) {
        case 'gemini':
        case 'google':
          response = await callGeminiWithImageTool(config, conversationMessages, { temperature, max_tokens });
          break;
        case 'anthropic':
          response = await callClaudeWithImageTool(config, conversationMessages, { temperature, max_tokens });
          break;
        default:
          response = await callOpenAIWithImageTool(config, conversationMessages, { temperature, max_tokens });
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
        
        const commentary = input.commentary || `Generating: ${(input.prompt || '').slice(0, 50)}...`;
        
        // 1. Stream COMMAND INPUT tag (exact mobile format)
        if (stream) {
          const inputPayload = JSON.stringify({
            command: toolCall.function?.name,
            args: input,
            commentary: commentary,
          });
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: `<!--command-input-->${inputPayload}<!--/command-input-->` } }] })}\n\n`);
        }
        
        // Execute image generation
        const result = await executeImageGeneration(input, imageConfig);
        
        // 2. Stream COMMAND OUTPUT tag (exact mobile format)
        // NOTE: Do NOT include imageBase64 here - it's too large and will cause token overflow
        // when the message is stored and sent back in subsequent calls
        if (stream) {
          const outputPayload = JSON.stringify({
            success: result.success,
            output: result.output,
          });
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: `<!--command-output-->${outputPayload}<!--/command-output-->` } }] })}\n\n`);
          
          // Send image data in a separate event for display (not stored in message content)
          if (result.data?.base64 || result.data?.url) {
            res.write(`data: ${JSON.stringify({ 
              image_result: { 
                imageUrl: result.data?.url || null,
                imageBase64: result.data?.base64 || null,
                prompt: input.prompt,
                style: input.style,
              } 
            })}\n\n`);
          }
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
    console.error('[IMAGE-GEN ERROR]', err);
    
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
      mode: 'image-gen',
    });
    
    if (!res.headersSent) {
      res.status(500).json({ error: err.message, code: 'IMAGE_GEN_ERROR' });
    } else {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
  }
});

// ===================================================================
// PROVIDER-SPECIFIC TOOL CALLING (with Image Tool)
// ===================================================================

async function callOpenAIWithImageTool(config, messages, options) {
  const url = `${config.baseUrl}/chat/completions`;
  
  const body = {
    model: config.modelId,
    messages,
    tools: [IMAGE_GENERATION_TOOL],
    tool_choice: 'auto',
    stream: false,
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

async function callClaudeWithImageTool(config, messages, options) {
  const url = `${config.baseUrl}/messages`;
  
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
    tools: [IMAGE_GENERATION_TOOL_CLAUDE],
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

async function callGeminiWithImageTool(config, messages, options) {
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
            name: m.name || 'generate_image',
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
    tools: [IMAGE_GENERATION_TOOL_GEMINI],
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
