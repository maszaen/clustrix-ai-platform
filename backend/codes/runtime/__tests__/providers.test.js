const { resolveProvider, endpoint, buildRequest, consumeSSE, accumulator, callProvider } = require('../providers');

const options = { model: 'any-new-model', apiKey: 'secret', system: 'instructions', messages: [{ role: 'user', content: 'task' }], tools: [{ name: 'read_file', description: 'read', parameters: { type: 'object', properties: { file: { type: 'string' } }, required: ['file'] } }] };

test.each(['anthropic/claude-new', 'google/gemini-new', 'unknown-2030-model'])('gateway protocol is independent of model name: %s', model => {
  const config = resolveProvider({ provider: 'openrouter', model });
  expect(config.protocol).toBe('openai');
  expect(endpoint(config, model).href).toBe('https://openrouter.ai/api/v1/chat/completions');
});

test('native endpoints, compatible endpoints, Responses and local HTTP join correctly', () => {
  expect(resolveProvider({ provider: 'anthropic' }).protocol).toBe('anthropic');
  expect(resolveProvider({ provider: 'gemini' }).protocol).toBe('gemini');
  expect(resolveProvider({ provider: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai' }).protocol).toBe('openai');
  const config = resolveProvider({ baseUrl: 'http://localhost:1234/v1/chat/completions?x=1' });
  expect(endpoint(config, 'new').href).toBe('http://localhost:1234/v1/chat/completions?x=1');
  expect(resolveProvider({ baseUrl: 'https://api.openai.com/v1/responses' }).protocol).toBe('responses');
  expect(() => resolveProvider({ baseUrl: 'file:///tmp/key' })).toThrow();
  expect(() => resolveProvider({ baseUrl: 'https://user:pass@example.com' })).toThrow();
});

test('request formats preserve tool result pairing and native opaque reasoning', () => {
  const raw = [{ type: 'thinking', thinking: 'internal', signature: 'signed' }, { type: 'tool_use', id: 'a', name: 'read_file', input: { file: 'a' } }];
  const messages = [...options.messages, { role: 'assistant', raw, calls: [{ id: 'a' }] }, { role: 'tool', results: [{ id: 'a', name: 'read_file', content: 'file', error: true }] }];
  const built = buildRequest(resolveProvider({ provider: 'anthropic' }), { ...options, messages });
  expect(built.body.messages[1].content).toBe(raw);
  expect(built.body.messages[2].content[0]).toMatchObject({ tool_use_id: 'a', is_error: true });
  expect(built.headers['x-api-key']).toBe('secret');
  expect(built.body.max_tokens).toBe(8192);
});

test('SSE parsing survives one-byte UTF8 chunks, CRLF, comments and final frame without newline', async () => {
  const bytes = Buffer.from(': ping\r\n\r\ndata: {"text":"héllo 🌍"}\r\n\r\ndata:{"last":true}');
  async function* stream() { for (const byte of bytes) yield Buffer.from([byte]); }
  const events = [];
  await consumeSSE(stream(), e => events.push(e));
  expect(events).toEqual([{ text: 'héllo 🌍' }, { last: true }]);
});

test('OpenAI reconstructs interleaved tools, reasoning and usage from terminal delta', () => {
  const acc = accumulator('openai');
  acc.event({ choices: [{ delta: { reasoning_content: 'reason', tool_calls: [{ index: 0, id: 'one', function: { name: 'read_', arguments: '{"file":' } }, { index: 1, id: 'two', function: { name: 'list_files', arguments: '{}' } }] } }] });
  acc.event({ choices: [{ delta: { tool_calls: [{ index: 0, function: { name: 'file', arguments: '"a"}' } }] } }] });
  acc.event({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] });
  acc.event({ choices: [], usage: { prompt_tokens: 10, completion_tokens: 5 } });
  const result = acc.finish();
  expect(result.calls[0]).toEqual({ id: 'one', name: 'read_file', arguments: '{"file":"a"}' });
  expect(result.raw.reasoning_content).toBe('reason');
  expect(result.usage.prompt_tokens).toBe(10);
});

test('truncated, failed, duplicated and length-limited streams never execute tools', () => {
  const acc = accumulator('openai');
  expect(() => acc.finish()).toThrow('before completion');
  acc.event({ choices: [{ finish_reason: 'length' }] });
  expect(() => acc.finish()).toThrow('length');
  expect(() => acc.event({ error: { message: 'bad' } })).toThrow('bad');
  const duplicate = accumulator('openai');
  duplicate.event({ choices: [{ finish_reason: 'tool_calls', delta: { tool_calls: [0, 1].map(index => ({ index, id: 'same', function: { name: 'x', arguments: '{}' } })) } }] });
  expect(() => duplicate.finish()).toThrow('duplicate');
});

test('Anthropic retains thinking signatures and tool input across chunks', () => {
  const acc = accumulator('anthropic');
  acc.event({ type: 'message_start', message: { usage: { input_tokens: 20 } } });
  acc.event({ type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } });
  acc.event({ type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'reasoning' } });
  acc.event({ type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'opaque' } });
  acc.event({ type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'tool', name: 'list_files', input: {} } });
  acc.event({ type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{}' } });
  acc.event({ type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 10 } });
  acc.event({ type: 'message_stop' });
  const result = acc.finish();
  expect(result.raw[0].signature).toBe('opaque');
  expect(result.calls[0].arguments).toBe('{}');
  expect(result.usage).toEqual({ input_tokens: 20, output_tokens: 10 });
});

test('Gemini preserves thoughtSignature in function calls on round-trip', () => {
  const acc = accumulator('gemini');
  const part = { functionCall: { name: 'read_file', args: { file: 'a' }, id: 'g' }, thoughtSignature: 'opaque' };
  acc.event({ candidates: [{ content: { parts: [part] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 12 } });
  const response = acc.finish();
  const request = buildRequest(resolveProvider({ provider: 'gemini' }), { ...options, messages: [options.messages[0], response, { role: 'tool', results: [{ id: 'g', name: 'read_file', content: 'a' }] }] });
  expect(request.body.contents[1].parts[0]).toBe(part);
  expect(request.body.contents[2].parts[0].functionResponse.name).toBe('read_file');
  expect(request.url.pathname).toContain('/v1beta/models/any-new-model:streamGenerateContent');
});

test('Responses API carries reasoning items and function call outputs', () => {
  const acc = accumulator('responses');
  const output = [{ type: 'reasoning', id: 'r', encrypted_content: 'opaque', summary: [] }, { type: 'function_call', call_id: 'c', name: 'list_files', arguments: '{}' }];
  acc.event({ type: 'response.completed', response: { output, usage: { input_tokens: 10 } } });
  const response = acc.finish();
  const request = buildRequest(resolveProvider({ baseUrl: 'https://api.openai.com/v1/responses' }), { ...options, messages: [options.messages[0], response, { role: 'tool', results: [{ id: 'c', content: '[]' }] }] });
  expect(request.body.store).toBe(false);
  expect(request.body.input[1]).toBe(output[0]);
  expect(request.body.input[3]).toEqual({ type: 'function_call_output', call_id: 'c', output: '[]' });
  expect(request.body.tools[0].name).toBe('read_file');
});

test('transport streams text once and does not disclose API error bodies', async () => {
  const onText = jest.fn();
  const fetchImpl = jest.fn().mockResolvedValue(new Response('data: {"choices":[{"delta":{"content":"done"},"finish_reason":"stop"}]}\n\n'));
  const response = await callProvider(resolveProvider({ provider: 'openai' }), options, { fetchImpl, onText });
  expect(response.content).toBe('done');
  expect(onText).toHaveBeenCalledTimes(1);
  fetchImpl.mockResolvedValue(new Response('secret key and prompt', { status: 401 }));
  await expect(callProvider(resolveProvider({ provider: 'openai' }), options, { fetchImpl })).rejects.toThrow('HTTP 401');
});

test('OpenRouter encrypted reasoning details and output budget survive serialization', () => {
  const acc = accumulator('openai');
  acc.event({ choices: [{ delta: { reasoning_details: [{ index: 0, type: 'reasoning.encrypted', data: 'part-a', id: 'r' }] } }] });
  acc.event({ choices: [{ delta: { reasoning_details: [{ index: 0, type: 'reasoning.encrypted', data: 'part-b', id: 'r' }], content: 'OK' }, finish_reason: 'stop' }] });
  const result = acc.finish();
  expect(result.raw.reasoning_details[0].data).toBe('part-apart-b');
  expect(buildRequest(resolveProvider({ provider: 'openai' }), options).body.max_completion_tokens).toBe(8192);
  const custom = buildRequest(resolveProvider({ provider: 'custom', baseUrl: 'http://localhost/v1', streamUsage: false }), options);
  expect(custom.body.max_tokens).toBe(8192);
  expect(custom.body.stream_options).toBeUndefined();
});

test('custom native proxies respect selected provider; known gateways remain compatible', () => {
  expect(resolveProvider({ provider: 'anthropic', baseUrl: 'https://proxy.example/v1' }).protocol).toBe('anthropic');
  expect(resolveProvider({ provider: 'gemini', baseUrl: 'https://proxy.example/v1beta' }).protocol).toBe('gemini');
  expect(resolveProvider({ provider: 'anthropic', baseUrl: 'https://openrouter.ai/api/v1' }).protocol).toBe('openai');
  expect(endpoint(resolveProvider({ provider: 'openai', baseUrl: 'https://api.openai.com' }), 'new').pathname).toBe('/v1/chat/completions');
});

test('transport retries transient HTTP failures but never retries consumed partial text', async () => {
  const ok = () => new Response('data: {"choices":[{"delta":{"content":"OK"},"finish_reason":"stop"}]}\n\n');
  const fetchImpl = jest.fn().mockResolvedValueOnce(new Response('temporary', { status: 503 })).mockImplementationOnce(async () => ok());
  const response = await callProvider(resolveProvider({ provider: 'openai' }), options, { fetchImpl });
  expect(response.content).toBe('OK');
  expect(fetchImpl).toHaveBeenCalledTimes(2);
  const partial = jest.fn(async () => new Response('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n'));
  await expect(callProvider(resolveProvider({ provider: 'openai' }), options, { fetchImpl: partial })).rejects.toThrow('before completion');
  expect(partial).toHaveBeenCalledTimes(1);
});

test('model timeouts and cancellation abort the HTTP request, including retry backoff', async () => {
  const pending = (url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  });
  await expect(callProvider(resolveProvider({ provider: 'openai' }), options, { fetchImpl: pending, timeoutMs: 5 })).rejects.toThrow('aborted');
  const controller = new AbortController();
  const fetchImpl = jest.fn(async () => {
    setTimeout(() => controller.abort(), 5);
    return new Response('limit', { status: 429, headers: { 'retry-after': '10' } });
  });
  await expect(callProvider(resolveProvider({ provider: 'openai' }), options, { fetchImpl, signal: controller.signal })).rejects.toThrow('Cancelled');
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});
