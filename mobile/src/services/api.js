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
          const content = json.choices?.[0]?.delta?.content || '';
          if (content) {
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
                thinkingBuffer += content;
              } else {
                onChunk?.(content);
              }
            }
          }
          
          if (json.type === 'content_block_stop') {
            if (isThinkingBlock && thinkingBuffer) {
              onThink?.(thinkingBuffer);
              thinkingBuffer = '';
            }
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
 */
function streamGeminiChunked({ messages, model, baseUrl, apiKey, onChunk, onThink, onDone, onError }) {
  return new Promise((resolve) => {
    const { contents, systemInstruction } = formatMessagesGemini(messages);
    const url = `${baseUrl}/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`;
    
    const body = { 
      contents,
      generationConfig: { maxOutputTokens: 8192 },
    };
    
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
          const content = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
          
          if (content) {
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
