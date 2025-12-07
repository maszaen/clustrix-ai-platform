/**
 * API Service - Direct calls to AI providers
 * React Native compatible streaming using EventSource polyfill
 */

export const DEFAULT_PROVIDERS = {
  openai: { baseUrl: 'https://api.openai.com/v1', name: 'OpenAI' },
  anthropic: { baseUrl: 'https://api.anthropic.com/v1', name: 'Anthropic' },
  google: { baseUrl: 'https://generativelanguage.googleapis.com/v1beta', name: 'Google Gemini' },
  gemini: { baseUrl: 'https://generativelanguage.googleapis.com/v1beta', name: 'Google Gemini' },
  openrouter: { baseUrl: 'https://openrouter.ai/api/v1', name: 'OpenRouter' },
  groq: { baseUrl: 'https://api.groq.com/openai/v1', name: 'Groq' },
  megallm: { baseUrl: 'https://api.megallm.net/v1', name: 'MegaLLM' },
  custom: { baseUrl: '', name: 'Custom' },
};

function formatMessagesOpenAI(messages) {
  return messages.map(m => ({ role: m.role, content: m.content }));
}

function formatMessagesAnthropic(messages) {
  const formatted = [];
  let systemPrompt = null;
  
  for (const m of messages) {
    if (m.role === 'system') {
      systemPrompt = m.content;
    } else {
      formatted.push({ role: m.role, content: m.content });
    }
  }
  
  if (formatted.length > 4) {
    for (let i = 0; i < formatted.length - 2; i++) {
      formatted[i] = {
        ...formatted[i],
        content: [{
          type: 'text',
          text: formatted[i].content,
          cache_control: { type: 'ephemeral' }
        }]
      };
    }
  }
  
  return { messages: formatted, system: systemPrompt };
}

function formatMessagesGemini(messages) {
  const contents = [];
  let systemInstruction = null;
  
  for (const m of messages) {
    if (m.role === 'system') {
      systemInstruction = m.content;
    } else {
      contents.push({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      });
    }
  }
  
  return { contents, systemInstruction };
}

/**
 * Stream chat - main entry point
 */
export async function streamChat({ messages, model, provider, baseUrl, apiKey, onChunk, onThink, onDone, onError }) {
  const providerLower = (provider || '').toLowerCase();
  const base = baseUrl || DEFAULT_PROVIDERS[providerLower]?.baseUrl || DEFAULT_PROVIDERS.openai.baseUrl;
  
  try {
    if (providerLower === 'google' || providerLower === 'gemini') {
      return streamGeminiChunked({ messages, model, baseUrl: base, apiKey, onChunk, onThink, onDone, onError });
    }
    
    if (providerLower === 'anthropic') {
      return streamAnthropicChunked({ messages, model, baseUrl: base, apiKey, onChunk, onThink, onDone, onError });
    }
    
    return streamOpenAIChunked({ messages, model, baseUrl: base, apiKey, onChunk, onThink, onDone, onError });
  } catch (error) {
    onError?.(error.message);
  }
}

/**
 * OpenAI streaming with XMLHttpRequest for real-time chunks
 * Supports native reasoning_content for o1/o3 models
 */
function streamOpenAIChunked({ messages, model, baseUrl, apiKey, onChunk, onThink, onDone, onError }) {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${baseUrl}/chat/completions`);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Authorization', `Bearer ${apiKey}`);
    
    let buffer = '';
    let lastProcessedIndex = 0;
    let thinkingBuffer = '';
    let isThinking = false;
    
    xhr.onprogress = () => {
      const newData = xhr.responseText.slice(lastProcessedIndex);
      lastProcessedIndex = xhr.responseText.length;
      buffer += newData;
      
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6);
        if (data === '[DONE]') continue;
        
        try {
          const json = JSON.parse(data);
          
          // Native OpenAI reasoning (o1/o3 models)
          let reasoning = json.choices?.[0]?.delta?.reasoning_content 
            || json.choices?.[0]?.delta?.reasoning 
            || json.choices?.[0]?.delta?.thoughts
            || json.delta?.thinking
            || '';
          if (Array.isArray(reasoning)) reasoning = reasoning.map(p => p?.text ?? p).join('');
          if (reasoning) onThink?.(reasoning);
          
          // Regular content
          const content = json.choices?.[0]?.delta?.content || '';
          if (content) {
            // Fallback: parse <think> tags
            const result = parseThinking(content, isThinking, thinkingBuffer);
            isThinking = result.stillThinking;
            thinkingBuffer = result.stillThinking ? result.thinking : '';
            if (result.text) onChunk?.(result.text);
            if (result.thinking && !result.stillThinking) onThink?.(result.thinking);
          }
        } catch {}
      }
    };
    
    xhr.onload = () => {
      onDone?.();
      resolve();
    };
    
    xhr.onerror = () => {
      onError?.(xhr.statusText || 'Network error');
      resolve();
    };
    
    xhr.send(JSON.stringify({
      model,
      messages: formatMessagesOpenAI(messages),
      stream: true,
    }));
  });
}

/**
 * Anthropic streaming with XMLHttpRequest
 */
function streamAnthropicChunked({ messages, model, baseUrl, apiKey, onChunk, onThink, onDone, onError }) {
  return new Promise((resolve) => {
    const { messages: formatted, system } = formatMessagesAnthropic(messages);
    
    const body = {
      model,
      messages: formatted,
      max_tokens: 8192,
      stream: true,
    };
    
    if (system) {
      body.system = [{
        type: 'text',
        text: system,
        cache_control: { type: 'ephemeral' }
      }];
    }
    
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${baseUrl}/messages`);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('x-api-key', apiKey);
    xhr.setRequestHeader('anthropic-version', '2023-06-01');
    xhr.setRequestHeader('anthropic-beta', 'prompt-caching-2024-07-31');
    
    let buffer = '';
    let lastProcessedIndex = 0;
    let isThinkingBlock = false;
    let thinkingBuffer = '';
    
    xhr.onprogress = () => {
      const newData = xhr.responseText.slice(lastProcessedIndex);
      lastProcessedIndex = xhr.responseText.length;
      buffer += newData;
      
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const json = JSON.parse(line.slice(6));
          
          if (json.type === 'content_block_start' && json.content_block?.type === 'thinking') {
            isThinkingBlock = true;
          }
          
          if (json.type === 'content_block_delta') {
            const content = json.delta?.text || json.delta?.thinking || '';
            if (content) {
              if (isThinkingBlock) {
                // Stream thinking content in real-time
                onThink?.(content);
              } else {
                onChunk?.(content);
              }
            }
          }
          
          if (json.type === 'content_block_stop') {
            isThinkingBlock = false;
          }
        } catch {}
      }
    };
    
    xhr.onload = () => {
      onDone?.();
      resolve();
    };
    
    xhr.onerror = () => {
      onError?.(xhr.statusText || 'Network error');
      resolve();
    };
    
    xhr.send(JSON.stringify(body));
  });
}

/**
 * Gemini streaming with XMLHttpRequest and alt=sse
 * Supports native thinking (thought: true) for Gemini 2.5 Pro / 2.0 Flash Thinking
 */
function streamGeminiChunked({ messages, model, baseUrl, apiKey, onChunk, onThink, onDone, onError }) {
  return new Promise((resolve) => {
    const { contents, systemInstruction } = formatMessagesGemini(messages);
    const url = `${baseUrl}/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`;
    
    // Check if model supports native thinking
    const modelLower = model.toLowerCase();
    const isThinkingModel = modelLower.includes('thinking') || modelLower.includes('2.5-pro') || modelLower.includes('2.5-flash');
    
    const body = { 
      contents,
      generationConfig: { maxOutputTokens: 8192 },
    };
    
    // Enable thinking for supported models
    if (isThinkingModel) {
      body.generationConfig.thinkingConfig = {
        thinkingBudget: modelLower.includes('2.5-pro') ? 16384 : 8192,
        includeThoughts: true
      };
    }
    
    if (systemInstruction) {
      body.systemInstruction = { parts: [{ text: systemInstruction }] };
    }
    
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('Content-Type', 'application/json');
    
    let buffer = '';
    let lastProcessedIndex = 0;
    let thinkingBuffer = '';
    let isThinking = false;
    
    xhr.onprogress = () => {
      const newData = xhr.responseText.slice(lastProcessedIndex);
      lastProcessedIndex = xhr.responseText.length;
      buffer += newData;
      
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const json = JSON.parse(line.slice(6));
          const parts = json.candidates?.[0]?.content?.parts || [];
          
          for (const part of parts) {
            // Native Gemini thinking: { thought: true, text: "..." }
            if (part.thought === true && part.text) {
              onThink?.(part.text);
            } else if (part.text) {
              let text = part.text;
              
              // Fallback: parse <think> tags or *(Internal Reasoning: ...)* pattern
              const internalMatch = text.match(/\*\(Internal Reasoning:\s*([\s\S]*?)\)\*/i);
              if (internalMatch) {
                onThink?.(internalMatch[1].trim());
                text = text.replace(/\*\(Internal Reasoning:\s*[\s\S]*?\)\*/gi, '').trim();
              }
              
              // Also check for <think> tags
              const result = parseThinking(text, isThinking, thinkingBuffer);
              isThinking = result.stillThinking;
              thinkingBuffer = result.stillThinking ? result.thinking : '';
              if (result.text) onChunk?.(result.text);
              if (result.thinking && !result.stillThinking) onThink?.(result.thinking);
            }
          }
        } catch {}
      }
    };
    
    xhr.onload = () => {
      onDone?.();
      resolve();
    };
    
    xhr.onerror = () => {
      onError?.(xhr.statusText || 'Network error');
      resolve();
    };
    
    xhr.send(JSON.stringify(body));
  });
}

function parseThinking(chunk, wasThinking, buffer) {
  let text = '';
  let thinking = buffer;
  let stillThinking = wasThinking;

  const thinkStart = /<think(?:ing)?>/i;
  const thinkEnd = /<\/think(?:ing)?>/i;

  if (!stillThinking && thinkStart.test(chunk)) {
    stillThinking = true;
    chunk = chunk.replace(thinkStart, '');
  }

  if (stillThinking) {
    if (thinkEnd.test(chunk)) {
      const parts = chunk.split(thinkEnd);
      thinking += parts[0];
      text = parts.slice(1).join('');
      stillThinking = false;
    } else {
      thinking += chunk;
    }
  } else {
    text = chunk;
  }

  return { text, thinking, stillThinking };
}

/**
 * Non-streaming chat (for title generation)
 */
export async function chat({ messages, model, provider, baseUrl, apiKey }) {
  const providerLower = (provider || '').toLowerCase();
  const base = baseUrl || DEFAULT_PROVIDERS[providerLower]?.baseUrl;
  
  if (providerLower === 'google' || providerLower === 'gemini') {
    const { contents, systemInstruction } = formatMessagesGemini(messages);
    const url = `${base}/models/${model}:generateContent?key=${apiKey}`;
    const body = { contents };
    if (systemInstruction) body.systemInstruction = { parts: [{ text: systemInstruction }] };
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(await response.text());
    const json = await response.json();
    return json.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }
  
  if (providerLower === 'anthropic') {
    const { messages: formatted, system } = formatMessagesAnthropic(messages);
    const url = `${base}/messages`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model, messages: formatted, system, max_tokens: 1024 }),
    });
    if (!response.ok) throw new Error(await response.text());
    const json = await response.json();
    return json.content?.[0]?.text || '';
  }
  
  const url = `${base}/chat/completions`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages: formatMessagesOpenAI(messages) }),
  });
  if (!response.ok) throw new Error(await response.text());
  const json = await response.json();
  return json.choices?.[0]?.message?.content || '';
}

export async function generateTitle(content, model, provider, baseUrl, apiKey) {
  const messages = [
    { role: 'system', content: 'Generate a short title (max 6 words) for this conversation. Reply with just the title, no quotes.' },
    { role: 'user', content: content.slice(0, 500) }
  ];
  
  try {
    return await chat({ messages, model, provider, baseUrl, apiKey });
  } catch {
    return 'New Chat';
  }
}
