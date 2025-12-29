/**
 * Chat API Route
 * 
 * Proxy chat requests to AI providers
 * Handles streaming responses
 */

const express = require('express');
const router = express.Router();
const { getModelConfig } = require('../config/models');
const { calculateCost } = require('../config/pricing');
const { trackRequest } = require('../services/analytics');
const { 
  parseThinkingFromResponse,
  createThinkingParserState,
  parseThinkingPatterns
} = require('../utils/thinkingParser');
const { checkProviderTokenLimit, trackProviderTokens } = require('../middleware/rateLimit');

/**
 * Convert OpenAI-style content to Gemini parts format
 * Handles both string content and multimodal array content
 */
function convertToGeminiParts(content) {
  // Simple string content
  if (typeof content === 'string') {
    return [{ text: content }];
  }
  
  // Multimodal array content (OpenAI format)
  if (Array.isArray(content)) {
    const parts = [];
    
    for (const item of content) {
      if (item.type === 'text' && item.text) {
        // Text part
        parts.push({ text: item.text });
      } else if (item.type === 'image_url' && item.image_url?.url) {
        // Image part - convert from data URL to Gemini inline_data format
        const url = item.image_url.url;
        
        if (url.startsWith('data:')) {
          // Parse data URL: data:mime/type;base64,DATA
          const matches = url.match(/^data:([^;]+);base64,(.+)$/);
          if (matches) {
            const mimeType = matches[1];
            const base64Data = matches[2];
            
            parts.push({
              inline_data: {
                mime_type: mimeType,
                data: base64Data,
              }
            });
          }
        } else {
          // External URL - use file_data (Gemini supports this for some URLs)
          parts.push({
            file_data: {
              mime_type: 'image/jpeg', // Default, Gemini will detect
              file_uri: url,
            }
          });
        }
      }
    }
    
    // Ensure at least one part exists
    return parts.length > 0 ? parts : [{ text: '' }];
  }
  
  // Fallback
  return [{ text: String(content || '') }];
}

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
    
    // Check provider token limit BEFORE making request
    const providerLimitError = checkProviderTokenLimit(req.user.uid, config.provider);
    if (providerLimitError) {
      return res.status(429).json(providerLimitError);
    }
    
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
      case 'perplexity':
        // Perplexity has built-in web search, use non-streaming for search_results
        await handlePerplexityChat(req, res, config, messages, { temperature, max_tokens });
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
 * Handle Perplexity chat - Non-streaming with built-in web search
 * Perplexity returns search_results and citations in response
 */
async function handlePerplexityChat(req, res, config, messages, options) {
  const startTime = Date.now();
  const url = `${config.baseUrl}/chat/completions`;
  
  const body = {
    model: config.modelId,
    messages,
    stream: false, // Perplexity search_results only available in non-streaming
    ...(options.temperature !== undefined && { temperature: options.temperature }),
    ...(options.max_tokens && { max_tokens: options.max_tokens }),
  };
  
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
    throw new Error(`Perplexity API error: ${error}`);
  }
  
  const data = await response.json();
  
  // Extract content
  const content = data.choices?.[0]?.message?.content || '';
  
  // Extract Perplexity-specific search results and citations
  const searchResults = data.search_results || [];
  const citations = data.citations || [];
  
  // Parse thinking from content
  const parsed = parseThinkingFromResponse(content);
  
  // Calculate usage and cost
  const inputTokens = data.usage?.prompt_tokens || 0;
  const outputTokens = data.usage?.completion_tokens || 0;
  const cost = calculateCost(config.modelId, inputTokens, outputTokens);
  
  // Track request
  trackRequest({
    userId: req.user?.uid,
    userEmail: req.user?.email,
    deviceName: req.headers['x-device-name'],
    model: config.modelId,
    provider: config.provider,
    messages,
    responsePreview: parsed.response || content,
    thinkingPreview: parsed.thinking || '',
    inputTokens,
    outputTokens,
    duration: Date.now() - startTime,
    success: true,
    mode: 'chat',
  });
  
  // Track provider token usage
  trackProviderTokens(req.user?.uid, config.provider, inputTokens + outputTokens);
  
  // Return response with search_results for UI
  res.json({
    ...data,
    // Ensure search_results and citations are included for mobile UI
    search_results: searchResults,
    citations: citations,
    usage: {
      ...data.usage,
      cost,
    },
  });
}

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
      // Send usage event with cost before ending stream
      if (usageData) {
        const inputTokens = usageData.prompt_tokens || 0;
        const outputTokens = usageData.completion_tokens || 0;
        const cost = calculateCost(config.modelId, inputTokens, outputTokens);
        
        res.write(`data: ${JSON.stringify({ 
          usage: {
            prompt_tokens: inputTokens,
            completion_tokens: outputTokens,
            total_tokens: inputTokens + outputTokens,
            cost: cost,
          }
        })}\n\n`);
      }
      res.write('data: [DONE]\n\n');
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
      
      // Track provider token usage for rate limiting
      trackProviderTokens(req.user?.uid, config.provider, inputTokens + outputTokens);
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
    
    // Track provider token usage for rate limiting
    trackProviderTokens(req.user?.uid, config.provider, inputTokens + outputTokens);
    
    res.json(data);
  }
}

/**
 * Handle Gemini chat
 */
async function handleGeminiChat(req, res, config, messages, options) {
  // Convert to Gemini format - handle multimodal content
  const geminiMessages = messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: convertToGeminiParts(m.content),
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
        const inputTokens = usageData.promptTokenCount || 0;
        const outputTokens = usageData.candidatesTokenCount || 0;
        const cost = calculateCost(config.modelId, inputTokens, outputTokens);
        
        res.write(`data: ${JSON.stringify({ 
          usage: {
            prompt_tokens: inputTokens,
            completion_tokens: outputTokens,
            total_tokens: inputTokens + outputTokens,
            cost: cost,
          }
        })}\n\n`);
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
      
      // Track provider token usage for rate limiting
      trackProviderTokens(req.user?.uid, config.provider, inputTokens + outputTokens);
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
    
    // Track provider token usage for rate limiting
    trackProviderTokens(req.user?.uid, config.provider, inputTokens + outputTokens);
    
    res.json({
      choices: [{ message: { role: 'assistant', content } }],
      usage: data.usageMetadata,
    });
  }
}

/**
 * Convert OpenAI-style content to Anthropic format
 * Anthropic uses different structure for images
 */
function convertToAnthropicContent(content) {
  // Simple string content
  if (typeof content === 'string') {
    return content;
  }
  
  // Multimodal array content (OpenAI format -> Anthropic format)
  if (Array.isArray(content)) {
    const parts = [];
    
    for (const item of content) {
      if (item.type === 'text' && item.text) {
        // Text part - same format
        parts.push({ type: 'text', text: item.text });
      } else if (item.type === 'image_url' && item.image_url?.url) {
        // Image part - convert from OpenAI to Anthropic format
        const url = item.image_url.url;
        
        if (url.startsWith('data:')) {
          // Parse data URL: data:mime/type;base64,DATA
          const matches = url.match(/^data:([^;]+);base64,(.+)$/);
          if (matches) {
            const mediaType = matches[1];
            const base64Data = matches[2];
            
            parts.push({
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: base64Data,
              }
            });
          }
        } else {
          // External URL - Anthropic supports URL directly
          parts.push({
            type: 'image',
            source: {
              type: 'url',
              url: url,
            }
          });
        }
      }
    }
    
    return parts.length > 0 ? parts : content;
  }
  
  return content;
}

/**
 * Handle Anthropic chat
 */
async function handleAnthropicChat(req, res, config, messages, options) {
  const url = `${config.baseUrl}/messages`;
  
  // Extract system prompt (handle multimodal system prompt)
  const systemMsg = messages.find(m => m.role === 'system');
  const systemPrompt = systemMsg ? (typeof systemMsg.content === 'string' ? systemMsg.content : systemMsg.content) : undefined;
  
  // Convert messages to Anthropic format
  const chatMessages = messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role,
      content: convertToAnthropicContent(m.content),
    }));
  
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
        const inputTokens = usageData.input_tokens || 0;
        const outputTokens = usageData.output_tokens || 0;
        const cost = calculateCost(config.modelId, inputTokens, outputTokens);
        
        res.write(`data: ${JSON.stringify({ 
          usage: {
            prompt_tokens: inputTokens,
            completion_tokens: outputTokens,
            total_tokens: inputTokens + outputTokens,
            cost: cost,
          }
        })}\n\n`);
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
      
      // Track provider token usage for rate limiting
      trackProviderTokens(req.user?.uid, config.provider, inputTokens + outputTokens);
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
    
    // Track provider token usage for rate limiting
    trackProviderTokens(req.user?.uid, config.provider, inputTokens + outputTokens);
    
    res.json({
      choices: [{ message: { role: 'assistant', content } }],
      usage: data.usage,
    });
  }
}

module.exports = router;
