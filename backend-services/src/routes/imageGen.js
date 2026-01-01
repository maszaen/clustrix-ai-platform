/**
 * Image Generation API Route
 * 
 * Handles chat with image generation capabilities
 * Uses AI to decide when to generate images based on user requests
 */

const express = require('express');
const router = express.Router();
const { getModelConfig } = require('../config/models');
const { calculateCost } = require('../config/pricing');
const { checkProviderTokenLimit, trackProviderTokens } = require('../middleware/rateLimit');

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
    
    // Check provider token limit BEFORE making request
    const providerLimitError = checkProviderTokenLimit(req.user.uid, config.provider);
    if (providerLimitError) {
      return res.status(429).json(providerLimitError);
    }
    
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
    let totalInputTokens = Math.ceil(JSON.stringify(messages).length / 4);
    let totalOutputTokens = 0;
    let fullContent = '';
    
    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      let response;
      
      switch (config.provider) {
        case 'gemini':
        case 'google':
          response = await callGeminiWithImageTool(config, conversationMessages, { temperature, max_tokens }, stream ? res : null);
          break;
        case 'anthropic':
          response = await callClaudeWithImageTool(config, conversationMessages, { temperature, max_tokens }, stream ? res : null);
          break;
        default:
          response = await callOpenAIWithImageTool(config, conversationMessages, { temperature, max_tokens }, stream ? res : null);
          break;
      }
      
      const assistantMessage = response.message;
      conversationMessages.push(assistantMessage);
      
      // Accumulate tokens
      if (response.usage) {
        totalInputTokens += response.usage.prompt_tokens || response.usage.input_tokens || 0;
        totalOutputTokens += response.usage.completion_tokens || response.usage.output_tokens || 0;
      } else {
        totalOutputTokens += Math.ceil((assistantMessage.content || '').length / 4);
      }
      fullContent += assistantMessage.content || '';
      
      // NOTE: Content is already streamed in real-time inside callXXXWithImageTool functions
      
      // Check if done (no tool calls)
      if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
        // Track success
        trackRequest({
          userId: req.user?.uid,
          userEmail: req.user?.email,
          deviceName: req.headers['x-device-name'],
          model: config.modelId,
          provider: config.provider,
          messages,
          responsePreview: fullContent,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          duration: Date.now() - startTime,
          success: true,
          mode: 'image-gen',
        });
        
        // Track provider token usage for rate limiting
        trackProviderTokens(req.user?.uid, config.provider, totalInputTokens + totalOutputTokens);
        
        if (stream) {
          // Send usage event before [DONE] so frontend can display token count + cost
          const cost = calculateCost(config.modelId, totalInputTokens, totalOutputTokens);
          res.write(`data: ${JSON.stringify({ 
            usage: { 
              prompt_tokens: totalInputTokens, 
              completion_tokens: totalOutputTokens,
              total_tokens: totalInputTokens + totalOutputTokens,
              cost: cost,
            } 
          })}\n\n`);
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
    
    // Max iterations reached - still track as success
    trackRequest({
      userId: req.user?.uid,
      userEmail: req.user?.email,
      deviceName: req.headers['x-device-name'],
      model: config.modelId,
      provider: config.provider,
      messages,
      responsePreview: fullContent + ' [MAX_ITERATIONS]',
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      duration: Date.now() - startTime,
      success: true,
      mode: 'image-gen',
    });
    
    // Track provider token usage for rate limiting (even on max iterations)
    trackProviderTokens(req.user?.uid, config.provider, totalInputTokens + totalOutputTokens);
    
    if (stream) {
      // Send usage event before [DONE]
      res.write(`data: ${JSON.stringify({ 
        usage: { 
          prompt_tokens: totalInputTokens, 
          completion_tokens: totalOutputTokens,
          total_tokens: totalInputTokens + totalOutputTokens,
        } 
      })}\n\n`);
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

async function callOpenAIWithImageTool(config, messages, options, res) {
  const url = `${config.baseUrl}/chat/completions`;
  
  const body = {
    model: config.modelId,
    messages,
    tools: [IMAGE_GENERATION_TOOL],
    tool_choice: 'auto',
    stream: true,
    stream_options: { include_usage: true },
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
  
  // Stream and accumulate like mobile
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullContent = '';
  let toolCallsMap = {};
  let usageData = null;
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data:')) continue;
      
      const jsonStr = trimmed.slice(5).trim();
      if (!jsonStr || jsonStr === '[DONE]') continue;
      
      try {
        const data = JSON.parse(jsonStr);
        const delta = data.choices?.[0]?.delta;
        
        if (delta?.content) {
          fullContent += delta.content;
          res?.write(`data: ${JSON.stringify({ choices: [{ delta: { content: delta.content } }] })}\n\n`);
        }
        
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            if (!toolCallsMap[idx]) {
              toolCallsMap[idx] = { id: '', type: 'function', function: { name: '', arguments: '' } };
            }
            if (tc.id) toolCallsMap[idx].id = tc.id;
            if (tc.function?.name) toolCallsMap[idx].function.name += tc.function.name;
            if (tc.function?.arguments) toolCallsMap[idx].function.arguments += tc.function.arguments;
          }
        }
        
        if (data.usage) usageData = data.usage;
      } catch (e) {}
    }
  }
  
  const toolCalls = Object.values(toolCallsMap).filter(tc => tc.id && tc.function.name);
  
  return {
    message: {
      role: 'assistant',
      content: fullContent,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    },
    usage: usageData,
  };
}

async function callClaudeWithImageTool(config, messages, options, res) {
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
    stream: true,
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
  
  // Stream and accumulate like mobile
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const fullResponse = { content: [], usage: {} };
  let currentBlock = null;
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      
      const jsonStr = trimmed.slice(5).trim();
      if (!jsonStr) continue;
      
      try {
        const event = JSON.parse(jsonStr);
        
        switch (event.type) {
          case 'content_block_start':
            currentBlock = { ...event.content_block };
            if (currentBlock.type === 'text') currentBlock.text = '';
            if (currentBlock.type === 'tool_use') currentBlock.input = '';
            break;
            
          case 'content_block_delta':
            if (event.delta?.type === 'text_delta' && currentBlock?.type === 'text') {
              const text = event.delta.text || '';
              currentBlock.text += text;
              if (text && res) {
                res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`);
              }
            } else if (event.delta?.type === 'input_json_delta' && currentBlock?.type === 'tool_use') {
              currentBlock.input += event.delta.partial_json || '';
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
            if (event.usage) fullResponse.usage = event.usage;
            break;
        }
      } catch (e) {}
    }
  }
  
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
  
  return {
    message: {
      role: 'assistant',
      content: textContent,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    },
    usage: fullResponse.usage,
  };
}

async function callGeminiWithImageTool(config, messages, options, res) {
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
  
  // Use streaming endpoint like mobile
  const url = `${config.baseUrl}/models/${config.modelId}:streamGenerateContent?key=${config.apiKey}&alt=sse`;
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
  
  // Stream and accumulate like mobile
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullContent = '';
  const functionCalls = [];
  let usageData = null;
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      
      const jsonStr = trimmed.slice(5).trim();
      if (!jsonStr) continue;
      
      try {
        const data = JSON.parse(jsonStr);
        const parts = data.candidates?.[0]?.content?.parts || [];
        
        for (const part of parts) {
          if (part.text) {
            fullContent += part.text;
            res?.write(`data: ${JSON.stringify({ choices: [{ delta: { content: part.text } }] })}\n\n`);
          }
          
          if (part.functionCall) {
            functionCalls.push(part.functionCall);
          }
        }
        
        if (data.usageMetadata) {
          usageData = data.usageMetadata;
        }
      } catch (e) {}
    }
  }
  
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
      content: fullContent,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    },
    usage: usageData,
  };
}

module.exports = router;
