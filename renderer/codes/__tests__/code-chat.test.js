const { execFileSync } = require('child_process');
const { pathToFileURL } = require('url');
const path = require('path');

/** Run the renderer ES module in a plain Node subprocess; no DOM/Electron or experimental Jest ESM flags needed. */
test('cancel settles stream promise after preload detaches listeners; subsequent stream still works', () => {
  const moduleUrl = pathToFileURL(path.resolve(__dirname, '../code-chat.mjs')).href;
  const script = `
    const assert = require('assert/strict');
    (async () => {
      const { runCodeChatStream, cancelActiveCodeStream } = await import(${JSON.stringify(moduleUrl)});
      let callback;
      let cancels = 0;
      global.window = { api: { codes: { stream: (payload, handler) => { callback = handler; return { cancel: () => { cancels++; } }; } } } };
      const request = { session: { id: 's' }, userPrompt: 'task', handler: () => {} };
      const pending = runCodeChatStream(request);
      cancelActiveCodeStream();
      const cancelled = await pending;
      assert.equal(cancelled.cancelled, true);
      assert.equal(cancels, 1);
      const next = runCodeChatStream(request);
      callback({ type: 'done', usage: { total_tokens: 3 } });
      assert.equal((await next).usage.total_tokens, 3);
      await assert.rejects(runCodeChatStream({ ...request, session: null }), /metadata/);
      process.stdout.write('OK');
    })().catch(error => { process.stderr.write(error.stack); process.exitCode = 1; });
  `;
  expect(execFileSync(process.execPath, ['-e', script], { encoding: 'utf8', timeout: 5000 })).toBe('OK');
});

/** Check simultaneous sessions and callback races, not only the single active-session case. */
test('request-specific cancellation cannot stop another session or deliver stale chunks', () => {
  const moduleUrl = pathToFileURL(path.resolve(__dirname, '../code-chat.mjs')).href;
  const script = `
    const assert = require('assert/strict');
    (async () => {
      const { runCodeChatStream, cancelActiveCodeStream } = await import(${JSON.stringify(moduleUrl)});
      const callbacks = new Map(); const cancelled = []; const chunks = [];
      global.window = { api: { codes: { stream: (payload, callback) => {
        callbacks.set(payload.sessionId, callback);
        return { cancel: () => cancelled.push(payload.sessionId) };
      } } } };
      const request = id => runCodeChatStream({ session: { id }, userPrompt: 'task', handler: chunk => chunks.push(chunk) });
      const a = request('a'); const b = request('b');
      assert.equal(typeof a.controller.cancel, 'function');
      callbacks.get('a')({ type: 'done' }); await a;
      cancelActiveCodeStream();
      assert.equal((await b).cancelled, true);
      assert.deepEqual(cancelled, ['b']);
      const c = request('c'); const d = request('d');
      c.controller.cancel(); await c;
      callbacks.get('c')({ type: 'chunk', chunk: 'late' });
      assert.deepEqual(chunks, []);
      assert.deepEqual(cancelled, ['b', 'c']);
      d.controller.cancel(); await d;
      assert.deepEqual(cancelled, ['b', 'c', 'd']);
      process.stdout.write('OK');
    })().catch(error => { process.stderr.write(error.stack); process.exitCode = 1; });
  `;
  expect(execFileSync(process.execPath, ['-e', script], { encoding: 'utf8', timeout: 5000 })).toBe('OK');
});

test('throwing chunk handler rejects and cancels transport even with synchronous callbacks', () => {
  const moduleUrl = pathToFileURL(path.resolve(__dirname, '../code-chat.mjs')).href;
  const script = `
    const assert = require('assert/strict');
    (async () => {
      const { runCodeChatStream } = await import(${JSON.stringify(moduleUrl)});
      let cancels = 0;
      global.window = { api: { codes: { stream: (payload, callback) => {
        callback({ type: 'chunk', chunk: 'hello' });
        return { cancel: () => cancels++ };
      } } } };
      const result = runCodeChatStream({ session: { id: 'a' }, userPrompt: 'task', handler: () => { throw new Error('UI disconnected'); } });
      await assert.rejects(result, /UI disconnected/);
      assert.equal(cancels, 1);
      process.stdout.write('OK');
    })().catch(error => { process.stderr.write(error.stack); process.exitCode = 1; });
  `;
  expect(execFileSync(process.execPath, ['-e', script], { encoding: 'utf8', timeout: 5000 })).toBe('OK');
});
