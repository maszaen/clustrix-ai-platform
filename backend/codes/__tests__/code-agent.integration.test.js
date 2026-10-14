/** Offline integration: real facade, fetch/SSE adapter, native tools and temporary filesystem. */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { initializeCodeAgent, processCodeRequest, disposeAllCodeSessions } = require('../code-agent');

let root;
let server;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'clustrix-http-'));
  initializeCodeAgent({ log: jest.fn(), getCodeById: () => ({ workspace_path: root, instruction: 'Keep UI unchanged' }) });
});
afterEach(async () => {
  disposeAllCodeSessions();
  if (server) { await new Promise(resolve => server.close(resolve)); server = null; }
  fs.rmSync(root, { recursive: true, force: true });
});

/** Emit protocol-specific fixture events for a complete model turn. */
function events(protocol, toolTurn) {
  const args = { file: 'created.txt', content: 'real file, fake model\n' };
  if (protocol === 'openai') return [
    { choices: [{ delta: toolTurn ? { tool_calls: [{ index: 0, id: 'call-1', type: 'function', function: { name: 'create_file', arguments: JSON.stringify(args) } }] } : { content: 'Finished.' }, finish_reason: toolTurn ? 'tool_calls' : 'stop' }] },
    { choices: [], usage: { prompt_tokens: 20, completion_tokens: 10 } },
  ];
  if (protocol === 'anthropic') return [
    { type: 'message_start', message: { usage: { input_tokens: 20 } } },
    { type: 'content_block_start', index: 0, content_block: toolTurn ? { type: 'tool_use', id: 'call-1', name: 'create_file', input: args } : { type: 'text', text: 'Finished.' } },
    { type: 'message_delta', delta: { stop_reason: toolTurn ? 'tool_use' : 'end_turn' }, usage: { output_tokens: 10 } },
    { type: 'message_stop' },
  ];
  if (protocol === 'gemini') return [{ candidates: [{ content: { parts: toolTurn ? [{ functionCall: { id: 'call-1', name: 'create_file', args }, thoughtSignature: 'signed-state' }] : [{ text: 'Finished.' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 10 } }];
  return [
    ...(!toolTurn ? [{ type: 'response.output_text.delta', delta: 'Finished.' }] : []),
    { type: 'response.completed', response: { output: toolTurn ? [{ type: 'function_call', call_id: 'call-1', name: 'create_file', arguments: JSON.stringify(args) }] : [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Finished.' }] }], usage: { input_tokens: 20, output_tokens: 10 } } },
  ];
}

test.each(['openai', 'anthropic', 'gemini', 'responses'])('%s: two streamed turns produce paired native results, file changes and usage', async protocol => {
  const requests = [];
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      requests.push({ url: req.url, headers: req.headers, body: JSON.parse(body) });
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      for (const event of events(protocol, requests.length === 1)) res.write(`data: ${JSON.stringify(event)}\r\n\r\n`);
      res.end('data: [DONE]\n\n');
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const onChunk = jest.fn();
  const result = await processCodeRequest({
    sessionId: protocol, codeId: 'project', userPrompt: 'Create a file', provider: 'custom', model: 'future-model',
    apiKey: 'fixture-not-a-real-key', baseUrl: `http://127.0.0.1:${server.address().port}/v1`, onChunk,
    db: { getSetting: () => ({ protocol }) },
  });
  expect(fs.readFileSync(path.join(root, 'created.txt'), 'utf8')).toBe('real file, fake model\n');
  expect(result.stopReason).toBe('completed');
  expect(result.usage.total_tokens).toBe(60);
  expect(requests).toHaveLength(2);
  const second = requests[1].body;
  if (protocol === 'openai') expect(second.messages.find(m => m.role === 'tool')).toMatchObject({ tool_call_id: 'call-1' });
  if (protocol === 'anthropic') expect(second.messages.at(-1).content[0]).toMatchObject({ tool_use_id: 'call-1', type: 'tool_result' });
  if (protocol === 'gemini') {
    expect(second.contents.at(-2).parts[0].thoughtSignature).toBe('signed-state');
    expect(second.contents.at(-1).parts[0].functionResponse).toMatchObject({ id: 'call-1', name: 'create_file' });
  }
  if (protocol === 'responses') expect(second.input.at(-1)).toMatchObject({ type: 'function_call_output', call_id: 'call-1' });
  expect(result.chunks.join('')).toContain('Finished.');
  expect(onChunk).toHaveBeenCalled();
});
