const { randomUUID } = require('crypto');

const DEFAULT_URLS = {
  anthropic: 'https://api.anthropic.com/v1', google: 'https://generativelanguage.googleapis.com/v1beta',
  gemini: 'https://generativelanguage.googleapis.com/v1beta', openai: 'https://api.openai.com/v1',
  openrouter: 'https://openrouter.ai/api/v1', deepseek: 'https://api.deepseek.com/v1',
  bigmodel: 'https://open.bigmodel.cn/api/paas/v4',
};

/** Route by configured endpoint/protocol, never by model-name substrings. */
function resolveProvider({ provider = 'openrouter', baseUrl, protocol, outputTokenField, streamUsage = true }) {
  provider = provider.toLowerCase();
  const url = new URL(baseUrl || DEFAULT_URLS[provider] || DEFAULT_URLS.openai);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported API URL protocol.');
  if (url.username || url.password) throw new Error('Do not put credentials in the API URL.');
  if (!protocol) {
    if (/\/responses\/?$/.test(url.pathname)) protocol = 'responses';
    else if (/\/chat\/completions\/?$/.test(url.pathname)) protocol = 'openai';
    else if (/\/messages\/?$/.test(url.pathname)) protocol = 'anthropic';
    else if (url.hostname === 'openrouter.ai' || /\/openai\/?$/.test(url.pathname)) protocol = 'openai';
    else if (url.hostname === 'api.anthropic.com' || provider === 'anthropic') protocol = 'anthropic';
    else if (url.hostname === 'generativelanguage.googleapis.com' || ['google', 'gemini'].includes(provider)) protocol = 'gemini';
    else protocol = 'openai';
  }
  if (!['openai', 'anthropic', 'gemini', 'responses'].includes(protocol)) throw new Error('Unknown agent API protocol.');
  outputTokenField = outputTokenField || (url.hostname === 'api.openai.com' ? 'max_completion_tokens' : 'max_tokens');
  if (!['max_tokens', 'max_completion_tokens'].includes(outputTokenField)) throw new Error('Invalid outputTokenField.');
  return { protocol, url, outputTokenField, streamUsage };
}

/** Join API paths while preserving gateway prefixes and query parameters. */
function endpoint(config, model) {
  const url = new URL(config.url);
  let base = url.pathname.replace(/\/$/, '');
  if (config.protocol === 'gemini') {
    if (!/\/v\d+(beta\d*)?$/.test(base)) base += '/v1beta';
    url.pathname = `${base}/models/${encodeURIComponent(model.replace(/^models\//, ''))}:streamGenerateContent`;
    url.searchParams.set('alt', 'sse');
  } else {
    const suffix = { openai: '/chat/completions', anthropic: '/messages', responses: '/responses' }[config.protocol];
    if (!base && ['api.openai.com', 'api.anthropic.com'].includes(url.hostname)) base = '/v1';
    if (!base.endsWith(suffix)) base += suffix;
    url.pathname = base;
  }
  return url;
}

/** Serialize canonical turns; preserve native opaque reasoning/signature blocks verbatim. */
function buildRequest(config, { model, apiKey, system, messages, tools, maxOutputTokens = 8192 }) {
  const headers = { 'Content-Type': 'application/json' };
  const { protocol } = config;
  let body;
  if (protocol === 'anthropic') {
    headers['x-api-key'] = apiKey || '';
    headers['anthropic-version'] = '2023-06-01';
    const native = messages.map(m => m.role === 'tool'
      ? { role: 'user', content: m.results.map(r => ({ type: 'tool_result', tool_use_id: r.id, content: r.content, is_error: !!r.error })) }
      : { role: m.role, content: m.raw || m.content });
    body = { model, system, messages: native, max_tokens: maxOutputTokens, stream: true,
      tools: tools.map(t => ({ name: t.name, description: t.description, input_schema: t.parameters })) };
  } else if (protocol === 'gemini') {
    headers['x-goog-api-key'] = apiKey || '';
    body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.map(m => m.role === 'tool'
        ? { role: 'user', parts: m.results.map(r => ({ functionResponse: { ...(r.nativeId ? { id: r.nativeId } : {}), name: r.name, response: { output: r.content, error: !!r.error } } })) }
        : { role: m.role === 'assistant' ? 'model' : 'user', parts: m.raw || [{ text: m.content }] }),
      tools: [{ functionDeclarations: tools.map(t => ({ name: t.name, description: t.description, parametersJsonSchema: t.parameters })) }],
      generationConfig: { maxOutputTokens },
    };
  } else if (protocol === 'responses') {
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    body = { model, instructions: system, stream: true, store: false, include: ['reasoning.encrypted_content'], max_output_tokens: maxOutputTokens,
      input: messages.flatMap(m => m.role === 'tool'
        ? m.results.map(r => ({ type: 'function_call_output', call_id: r.id, output: r.content }))
        : m.raw || [{ role: m.role, content: m.content }]),
      tools: tools.map(t => ({ type: 'function', ...t, strict: false })),
    };
  } else {
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    body = { model, stream: true, stream_options: { include_usage: true },
      messages: [{ role: 'system', content: system }, ...messages.flatMap(m => m.role === 'tool'
        ? m.results.map(r => ({ role: 'tool', tool_call_id: r.id, content: r.content }))
        : [m.raw || { role: m.role, content: m.content }])],
      tools: tools.map(t => ({ type: 'function', function: t })), tool_choice: 'auto',
    };
    body[config.outputTokenField || 'max_tokens'] = maxOutputTokens;
    if (config.streamUsage === false) delete body.stream_options;
    // No guessed temperature/reasoning settings: new reasoning models often reject them.
  }
  if (!tools.length) {
    delete body.tools;
    delete body.tool_choice;
  }
  return { url: endpoint(config, model), headers, body };
}

/** Decode SSE across arbitrary UTF-8/CRLF chunk boundaries, including an unterminated last frame. */
async function consumeSSE(body, onEvent) {
  const decoder = new TextDecoder();
  let buffer = '';
  const dispatch = frame => {
    const data = frame.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).replace(/^ /, '')).join('\n');
    if (data && data !== '[DONE]') onEvent(JSON.parse(data));
  };
  for await (const bytes of body) {
    buffer += decoder.decode(bytes, { stream: true });
    if (buffer.length > 8 * 1024 * 1024) throw new Error('API stream frame exceeds limit.');
    let match;
    while ((match = /\r?\n\r?\n/.exec(buffer))) {
      dispatch(buffer.slice(0, match.index));
      buffer = buffer.slice(match.index + match[0].length);
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) dispatch(buffer);
}

/** Accumulate complete tool arguments before execution and retain provider reasoning state. */
function accumulator(protocol, onText = () => {}) {
  let content = '';
  let raw;
  let finishReason;
  let usage = {};
  let complete = false;
  const calls = new Map();
  const blocks = [];
  let reasoning = '';
  const reasoningDetails = new Map();
  let accumulatedBytes = 0;
  const text = value => { if (value) { content += value; onText(value); } };
  return {
    event(event) {
      accumulatedBytes += Buffer.byteLength(JSON.stringify(event));
      if (accumulatedBytes > 8 * 1024 * 1024) throw new Error('Model response exceeds the 8 MiB safety limit.');
      if (event.error || event.type === 'error') throw new Error(event.error?.message || 'Provider stream failed.');
      if (protocol === 'openai') {
        if (event.usage) usage = event.usage;
        const choice = event.choices?.[0];
        const delta = choice?.delta;
        if (choice?.finish_reason) { finishReason = choice.finish_reason; complete = true; }
        if (!delta) return;
        text(delta.content);
        reasoning += delta.reasoning_content || '';
        // OpenRouter reasoning models may require encrypted reasoning_details on the next turn.
        for (const detail of delta.reasoning_details || []) {
          const key = detail.index ?? detail.id ?? reasoningDetails.size;
          const previous = reasoningDetails.get(key);
          if (!previous) reasoningDetails.set(key, { ...detail });
          else {
            for (const [field, value] of Object.entries(detail)) {
              previous[field] = ['text', 'summary', 'data'].includes(field) ? (previous[field] || '') + value : value;
            }
          }
        }
        for (const part of delta.tool_calls || []) {
          const index = part.index ?? 0;
          const call = calls.get(index) || { id: '', name: '', arguments: '' };
          if (part.id) call.id = part.id;
          call.name += part.function?.name || '';
          call.arguments += part.function?.arguments || '';
          calls.set(index, call);
        }
      } else if (protocol === 'anthropic') {
        if (event.type === 'message_start') usage = event.message?.usage || {};
        if (event.type === 'content_block_start') {
          blocks[event.index] = { ...event.content_block };
          if (event.content_block.type === 'tool_use') calls.set(event.index, { id: event.content_block.id, name: event.content_block.name, arguments: '' });
          if (event.content_block.type === 'text') text(event.content_block.text);
        }
        if (event.type === 'content_block_delta') {
          const block = blocks[event.index];
          const delta = event.delta;
          if (!block) throw new Error('Invalid content block index.');
          if (delta.type === 'text_delta') { block.text += delta.text; text(delta.text); }
          if (delta.type === 'thinking_delta') block.thinking = (block.thinking || '') + delta.thinking;
          if (delta.type === 'signature_delta') block.signature = (block.signature || '') + delta.signature;
          if (delta.type === 'input_json_delta') calls.get(event.index).arguments += delta.partial_json;
        }
        if (event.type === 'message_delta') { usage = { ...usage, ...event.usage }; finishReason = event.delta?.stop_reason || finishReason; }
        if (event.type === 'message_stop') complete = true;
      } else if (protocol === 'gemini') {
        if (event.usageMetadata) usage = event.usageMetadata;
        const candidate = event.candidates?.[0];
        if (event.promptFeedback?.blockReason) throw new Error(`Provider blocked request: ${event.promptFeedback.blockReason}`);
        if (candidate?.finishReason) { finishReason = candidate.finishReason; complete = true; }
        for (const part of candidate?.content?.parts || []) {
          blocks.push(part); // Includes thoughtSignature; do not reconstruct functionCall parts.
          if (part.text && !part.thought) text(part.text);
          if (part.functionCall) {
            const fc = part.functionCall;
            const id = fc.id || `call_${randomUUID()}`;
            calls.set(calls.size, { id, nativeId: fc.id, name: fc.name, arguments: JSON.stringify(fc.args || {}) });
          }
        }
      } else {
        if (event.type === 'response.output_text.delta') text(event.delta);
        if (event.type === 'response.completed') {
          raw = event.response.output;
          usage = event.response.usage || {};
          complete = true;
          finishReason = 'stop';
          for (const item of raw || []) {
            if (item.type === 'function_call') calls.set(calls.size, { id: item.call_id, name: item.name, arguments: item.arguments });
          }
        }
        if (['response.failed', 'response.incomplete'].includes(event.type)) throw new Error(`Response incomplete: ${event.response?.incomplete_details?.reason || event.response?.error?.message || event.type}`);
      }
    },
    finish() {
      if (!complete) throw new Error('Provider stream ended before completion; no tools were executed.');
      const allowedStops = { openai: ['stop', 'tool_calls'], anthropic: ['end_turn', 'tool_use', 'stop_sequence'], gemini: ['STOP'], responses: ['stop'] };
      if (!allowedStops[protocol].includes(finishReason)) {
        throw new Error(`Provider stopped with ${finishReason}; no partial tool calls were executed.`);
      }
      const normalized = [...calls.values()];
      const ids = new Set();
      for (const call of normalized) {
        if (!call.id || !call.name || ids.has(call.id)) throw new Error('Provider returned invalid/duplicate tool call IDs.');
        ids.add(call.id);
      }
      if (protocol === 'openai') {
        raw = { role: 'assistant', content: content || null };
        if (reasoning) raw.reasoning_content = reasoning;
        if (reasoningDetails.size) raw.reasoning_details = [...reasoningDetails.values()];
        if (normalized.length) raw.tool_calls = normalized.map(c => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.arguments } }));
      } else if (protocol === 'anthropic') {
        for (const [index, call] of calls) {
          // A malformed argument remains a recoverable tool error, while raw history stays valid JSON.
          try { blocks[index].input = JSON.parse(call.arguments || JSON.stringify(blocks[index].input || {})); }
          catch { blocks[index].input = {}; }
          if (!call.arguments) call.arguments = JSON.stringify(blocks[index].input);
        }
        raw = blocks;
      } else if (protocol === 'gemini') raw = blocks;
      return { role: 'assistant', content, calls: normalized, raw, usage, finishReason };
    },
  };
}

/** Abortable streaming API request. Retry transient HTTP failures only before any response is consumed. */
async function callProvider(config, options, { signal, onText, fetchImpl = globalThis.fetch, timeoutMs = 180000 } = {}) {
  const request = buildRequest(config, options);
  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController();
    const abort = () => controller.abort(signal?.reason);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    const timeout = setTimeout(() => controller.abort(new Error('Model request timed out.')), timeoutMs);
    try {
      const response = await fetchImpl(request.url, { method: 'POST', headers: request.headers, body: JSON.stringify(request.body), signal: controller.signal });
      if (!response.ok) {
        // Do not echo the remote body: providers/proxies can include credentials and prompts there.
        await response.body?.cancel();
        if ([429, 500, 502, 503, 504].includes(response.status) && attempt < 2) {
          const retryAfter = Number(response.headers.get('retry-after'));
          await delay(Math.min(10000, Math.max(500 * 2 ** attempt, Number.isFinite(retryAfter) ? retryAfter * 1000 : 0)), controller.signal);
          continue;
        }
        throw new Error(`Model API HTTP ${response.status}. Check endpoint, key, model and tool-calling support.`);
      }
      const result = accumulator(config.protocol, onText);
      await consumeSSE(response.body, event => result.event(event));
      return result.finish();
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
    }
  }
}

/** Abort-aware backoff, with listener cleanup on both completion and cancellation. */
function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(new Error('Cancelled.')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
}

module.exports = { resolveProvider, endpoint, buildRequest, consumeSSE, accumulator, callProvider };
