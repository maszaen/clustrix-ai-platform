/**
 * Chat API Route
 * 
 * Proxy chat requests to AI providers
 * Handles streaming responses
 */

const express = require('express');
const router = express.Router();
const { getModelConfig } = require('../config/models');
const { trackRequest } = require('../services/analytics');
const { 
  parseThinkingFromResponse,
  createThinkingParserState,
  parseThinkingPatterns
} = require('../utils/thinkingParser');

/**
 * POST /api/chat
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
    
    // Get model configuration
    const config = getModelConfig(model);
    if (!config) {
      return res.status(400).json({ 
        error: `Model "${model}" is not available on Clustrix Cloud`, 
        code: 'MODEL_NOT_AVAILABLE' 
      });
    }
    
    console.log(`[CHAT] User ${req.user.email} requesting ${model} (${config.provider})`);
    
    // Store response data for analytics
    req.analyticsData = {
      startTime,
      model,
      provider: config.provider,
      messages,
    };
    
    // Route to appropriate provider
    switch (config.provider) {
      case 'google':  // Gemini models use 'google' as provider in models.js
        await handleGeminiChat(req, res, config, messages, { temperature, max_tokens, stream });
        break;
      case 'anthropic':
        await handleAnthropicChat(req, res, config, messages, { temperature, max_tokens, stream });
        break;
      default:
        // OpenAI-compatible providers (openai, groq, mistral, deepseek, xai, openrouter)
        await handleOpenAIChat(req, res, config, messages, { temperature, max_tokens, stream });
        break;
    }
    
  } catch (err) {
    console.error('[CHAT ERROR]', err);
    
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
      mode: 'chat',
    });
    
    if (!res.headersSent) {
      res.status(500).json({ error: err.message, code: 'CHAT_ERROR' });
    }
  }
});

/**
 * Handle OpenAI-compatible chat (OpenAI, Groq, Mistral, DeepSeek, xAI, OpenRouter)
 */
async function handleOpenAIChat(req, res, config, messages, options) {
  const url = `${config.baseUrl}/chat/completions`;
  
  const body = {
    model: config.modelId,
    messages,
    stream: options.stream,
    stream_options: options.stream ? { include_usage: true } : undefined,
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
  
  if (options.stream) {
    // Stream response
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';
    let usageData = null;
    let buffer = ''; // Buffer for split lines
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        
        // Append chunk to buffer and split by newlines
        buffer += chunk;
        const lines = buffer.split('\n');
        
        // Process all complete lines, keep the last one in buffer (might be incomplete)
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          if (line.trim() === 'data: [DONE]') continue;
          
          try {
            const data = JSON.parse(line.slice(6));
            
            // Extract thinking (reasoning_content, reasoning, thoughts, etc.)
            const delta = data.choices?.[0]?.delta;
            const reasoning = delta?.reasoning_content || delta?.reasoning || delta?.thoughts || delta?.thinking;
            
            if (reasoning) {
              // Forward reasoning/thinking to mobile as standard 'thoughts' field (mobile expects this)
              res.write(`data: ${JSON.stringify({ choices: [{ delta: { thoughts: reasoning, thinking: reasoning, reasoning_content: reasoning } }] })}\n\n`);
              // Also track for admin logs? Current parser separates it from content, but native fields don't go into content usually.
              // So we should append to fullContent IF we want parser to find it, OR handle it separately.
              // Let's rely on parser for now: append to fullContent wrapped in tags? No, cleaner to track separately?
              // The current trackRequest uses `parseThinkingFromResponse(fullContent)`.
              // If native thinking is NOT in content, trackRequest won't see it.
              // BUT, for now let's just forward to mobile. Admin logs for native thinking might be a future improvement.
              // WAIT! User said "RESPONSE DI PANEL KADANG GA PAS".
              // If I don't log thinking, the panel will just show response. That's actually GOOD (requested behavior).
            }
            
            // Extract content
            const content = delta?.content || '';
            if (content) {
              fullContent += content;
              res.write(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`);
            }
            
            // Capture usage
            if (data.usage) {
              usageData = data.usage;
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
    } finally {
      res.end();
      
      // Parse thinking from response
      const parsed = parseThinkingFromResponse(fullContent);
      
      // Track success request with actual usage
      const inputTokens = usageData?.prompt_tokens || Math.ceil(JSON.stringify(messages).length / 4);
      const outputTokens = usageData?.completion_tokens || Math.ceil(fullContent.length / 4);
      
      trackRequest({
        userId: req.user?.uid,
        userEmail: req.user?.email,
        deviceName: req.headers['x-device-name'],
        model: config.modelId,
        provider: config.provider,
        messages,
        responsePreview: parsed.response || fullContent,
        thinkingPreview: parsed.thinking,
        inputTokens,
        outputTokens,
        duration: Date.now() - req.analyticsData?.startTime,
        success: true,
        mode: 'chat',
      });
    }
  } else {
    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content;
    const parsed = parseThinkingFromResponse(rawContent);
    
    // Track non-streaming request
    const inputTokens = data.usage?.prompt_tokens || Math.ceil(JSON.stringify(messages).length / 4);
    const outputTokens = data.usage?.completion_tokens || 0;
    
    trackRequest({
      userId: req.user?.uid,
      userEmail: req.user?.email,
      deviceName: req.headers['x-device-name'],
      model: config.modelId,
      provider: config.provider,
      messages,
      responsePreview: parsed.response || rawContent,
      thinkingPreview: parsed.thinking,
      inputTokens,
      outputTokens,
      duration: Date.now() - req.analyticsData?.startTime,
      success: true,
      mode: 'chat',
    });
    
    res.json(data);
  }
}

/**
 * Handle Gemini chat
 */
async function handleGeminiChat(req, res, config, messages, options) {
  // Convert to Gemini format
  const geminiMessages = messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
  
  // Extract system prompt
  const systemPrompt = messages.find(m => m.role === 'system')?.content || '';
  
  const endpoint = options.stream ? 'streamGenerateContent' : 'generateContent';
  const url = `${config.baseUrl}/models/${config.modelId}:${endpoint}?key=${config.apiKey}${options.stream ? '&alt=sse' : ''}`;
  
  const body = {
    contents: geminiMessages,
    systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
    // Base generation config
    generationConfig: {
      maxOutputTokens: options.max_tokens || 8192,
    },
  };

  // Configure thinking for supported models
  // STRICTLY MIMIC MOBILE: Override generationConfig for thinking models to avoid conflicts (e.g. temperature)
  const modelLower = config.modelId.toLowerCase();
  const isThinkingModel = modelLower.includes('thinking') || modelLower.includes('2.5-pro') || modelLower.includes('2.5-flash');
  
  if (isThinkingModel) {
    // Mobile app sets specific config for thinking
    body.generationConfig = {
      maxOutputTokens: 8192, // Enforce sufficient tokens for thinking
      thinkingConfig: {
        thinkingBudget: modelLower.includes('2.5-pro') ? 16384 : 8192,
        includeThoughts: true
      }
    };
  } else {
    // Non-thinking models get temperature
    if (options.temperature !== undefined) {
      body.generationConfig.temperature = options.temperature;
    }
  }
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${error}`);
  }
  
  if (options.stream) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';
    let usageData = null;
    let buffer = '';
    let parserState = createThinkingParserState();
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const text = decoder.decode(value, { stream: true });
        buffer += text;
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep partial line
        
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          
          try {
            const data = JSON.parse(line.slice(6));
            
            // Handle native Gemini thinking (thought: true) or text parts
            const parts = data.candidates?.[0]?.content?.parts || [];
            
            for (const part of parts) {
              // 1. Native thinking part (Gemini 2.5 Pro / Flash Thinking native mode)
              if (part.thought === true && part.text) {
                 res.write(`data: ${JSON.stringify({ choices: [{ delta: { thoughts: part.text, thinking: part.text, reasoning_content: part.text } }] })}\n\n`);
                 // Native thoughts are separate, so we don't append to fullContent (clean response)
              } else if (part.text) {
                // 2. Text part - Use Stateful Parsing for Tags/Regex 
                // This handles <think>...</think>, *(Internal Reasoning: ...)*, etc across chunks
                const parsed = parseThinkingPatterns(part.text, parserState);
                
                // Update state for next chunk
                parserState.partialTag = parsed.partialTag;
                parserState.insideThinkingBlock = parsed.insideThinkingBlock;
                parserState.currentBlockType = parsed.currentBlockType;
                parserState.hasSeenContent = parsed.hasSeenContent; // Should this update state? yes returned object has it.

                // Send thinking content found in this chunk
                if (parsed.thinkingText) {
                   res.write(`data: ${JSON.stringify({ choices: [{ delta: { thoughts: parsed.thinkingText, thinking: parsed.thinkingText, reasoning_content: parsed.thinkingText } }] })}\n\n`);
                }
                
                // Send cleaned content (real response)
                if (parsed.cleanedContent) {
                   res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: parsed.cleanedContent } }] })}\n\n`);
                   fullContent += parsed.cleanedContent;
                }
              }
            }

            // 3. Metadata thinking check (from main.js logic)
            const candidateThoughts = data.candidates?.[0]?.groundingMetadata?.thoughts ||
                                      data.candidates?.[0]?.thoughts ||
                                      data.modelThoughts;
            
            if (candidateThoughts) {
               const thoughtText = typeof candidateThoughts === 'string' 
                 ? candidateThoughts 
                 : JSON.stringify(candidateThoughts);
               
               if (thoughtText) {
                 res.write(`data: ${JSON.stringify({ choices: [{ delta: { thoughts: thoughtText, thinking: thoughtText, reasoning_content: thoughtText } }] })}\n\n`);
               }
            }

            // Capture usage metadata (Gemini sends it in chunks)
            if (data.usageMetadata) {
              usageData = data.usageMetadata;
            }
          } catch {}
        }
      }
      
      // Send usage event before [DONE]
      if (usageData) {
        res.write(`data: ${JSON.stringify({ usage: usageData })}\n\n`);
      }
      res.write('data: [DONE]\n\n');
    } finally {
      res.end();
      
      // Parse thinking from response
      const parsed = parseThinkingFromResponse(fullContent);
      
      // Track success request with actual usage
      const inputTokens = usageData?.promptTokenCount || Math.ceil(JSON.stringify(messages).length / 4);
      const outputTokens = usageData?.candidatesTokenCount || Math.ceil(fullContent.length / 4);
      
      trackRequest({
        userId: req.user?.uid,
        userEmail: req.user?.email,
        deviceName: req.headers['x-device-name'],
        model: config.modelId,
        provider: config.provider,
        messages,
        responsePreview: parsed.response || fullContent,
        thinkingPreview: parsed.thinking,
        inputTokens,
        outputTokens,
        duration: Date.now() - req.analyticsData?.startTime,
        success: true,
        mode: 'chat',
      });
    }
  } else {
    const data = await response.json();
    const rawContent = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const parsed = parseThinkingFromResponse(rawContent);
    
    // Track non-streaming request
    const inputTokens = data.usageMetadata?.promptTokenCount || Math.ceil(JSON.stringify(messages).length / 4);
    const outputTokens = data.usageMetadata?.candidatesTokenCount || Math.ceil(rawContent.length / 4);
    
    trackRequest({
      userId: req.user?.uid,
      userEmail: req.user?.email,
      deviceName: req.headers['x-device-name'],
      model: config.modelId,
      provider: config.provider,
      messages,
      responsePreview: parsed.response || rawContent,
      thinkingPreview: parsed.thinking,
      inputTokens,
      outputTokens,
      duration: Date.now() - req.analyticsData?.startTime,
      success: true,
      mode: 'chat',
    });
    
    res.json({
      choices: [{ message: { role: 'assistant', content } }],
      usage: data.usageMetadata,
    });
  }
}

/**
 * Handle Anthropic chat
 */
async function handleAnthropicChat(req, res, config, messages, options) {
  const url = `${config.baseUrl}/messages`;
  
  // Extract system prompt
  const systemPrompt = messages.find(m => m.role === 'system')?.content;
  const chatMessages = messages.filter(m => m.role !== 'system');
  
  const body = {
    model: config.modelId,
    messages: chatMessages,
    system: systemPrompt,
    stream: options.stream,
    max_tokens: options.max_tokens || 4096,
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
  
  if (options.stream) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';
    let usageData = null;
    let buffer = '';
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const text = decoder.decode(value, { stream: true });
        buffer += text;
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          if (line.trim() === 'data: [DONE]') continue;
          
          try {
            const data = JSON.parse(line.slice(6));
             
            if (data.type === 'content_block_delta') {
              const delta = data.delta;
              
              if (delta?.type === 'thinking_delta' && delta.thinking) {
                 // Forward native thinking to mobile
                 fullContent += delta.thinking; // Log it all, parser fixes it later
                 res.write(`data: ${JSON.stringify({ choices: [{ delta: { thoughts: delta.thinking, thinking: delta.thinking } }] })}\n\n`);
              } else {
                 const content = delta?.text || '';
                 if (content) {
                   fullContent += content;
                   res.write(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`);
                 }
              }
            }
            
            // Capture usage (Anthropic sends it in message_delta or message_stop)
            if (data.usage) {
              usageData = data.usage;
            } else if (data.type === 'message_delta' && data.usage) {
              usageData = { ...usageData, ...data.usage };
            }
          } catch {}
        }
      }
      
      // Send usage event before [DONE]
      if (usageData) {
        res.write(`data: ${JSON.stringify({ usage: usageData })}\n\n`);
      }
      res.write('data: [DONE]\n\n');
    } finally {
      res.end();
      
      // Parse thinking from response
      const parsed = parseThinkingFromResponse(fullContent);
      
      // Track success request with actual usage
      const inputTokens = usageData?.input_tokens || Math.ceil(JSON.stringify(messages).length / 4);
      const outputTokens = usageData?.output_tokens || Math.ceil(fullContent.length / 4);
      
      trackRequest({
        userId: req.user?.uid,
        userEmail: req.user?.email,
        deviceName: req.headers['x-device-name'],
        model: config.modelId,
        provider: config.provider,
        messages,
        responsePreview: parsed.response || fullContent,
        thinkingPreview: parsed.thinking,
        inputTokens,
        outputTokens,
        duration: Date.now() - req.analyticsData?.startTime,
        success: true,
        mode: 'chat',
      });
    }
  } else {
    const data = await response.json();
    const rawContent = data.content?.[0]?.text || '';
    const parsed = parseThinkingFromResponse(rawContent);
    
    // Track non-streaming request
    const inputTokens = data.usage?.input_tokens || Math.ceil(JSON.stringify(messages).length / 4);
    const outputTokens = data.usage?.output_tokens || Math.ceil(rawContent.length / 4);
    
    trackRequest({
      userId: req.user?.uid,
      userEmail: req.user?.email,
      deviceName: req.headers['x-device-name'],
      model: config.modelId,
      provider: config.provider,
      messages,
      responsePreview: parsed.response || rawContent,
      thinkingPreview: parsed.thinking,
      inputTokens,
      outputTokens,
      duration: Date.now() - req.analyticsData?.startTime,
      success: true,
      mode: 'chat',
    });
    
    res.json({
      choices: [{ message: { role: 'assistant', content } }],
      usage: data.usage,
    });
  }
}

module.exports = router;
