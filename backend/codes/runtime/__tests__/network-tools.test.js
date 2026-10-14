const fs = require('fs');
const path = require('path');
const os = require('os');
const { readImage, webSearch } = require('../network-tools');
const { buildRequest } = require('../providers');
const { Workspace } = require('../workspace');
let root;
let workspace;
let signal;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'clustrix-network-'));
  workspace = new Workspace(root);
  signal = new AbortController().signal;
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
const png = Buffer.from('89504e470d0a1a0a00000000', 'hex');

test.each(['openai', 'anthropic', 'gemini', 'responses'])('%s image request uses the configured protocol and no legacy model allowlist', async protocol => {
  fs.writeFileSync(path.join(root, 'screen.png'), png);
  const modelCall = jest.fn(async (config, request, hooks) => {
    expect(config.protocol).toBe(protocol);
    expect(hooks.signal).toBe(signal);
    const native = buildRequest(config, request);
    expect(native.body.tools).toBeUndefined();
    expect(native.body.tool_choice).toBeUndefined();
    expect(JSON.stringify(native.body)).toContain(png.toString('base64'));
    return { content: 'A screenshot', usage: { input_tokens: 50, output_tokens: 10 } };
  });
  const result = await readImage({ image_path: 'screen.png' }, { workspace, signal, modelCall, apiConfig: { provider: 'openrouter', model: 'vision-model-from-the-future', protocol } });
  expect(result.output).toBe('A screenshot');
  expect(result.model_usage.input_tokens).toBe(50);
});

test('image validation rejects non-images and workspace escapes before calling a model', async () => {
  fs.writeFileSync(path.join(root, 'secret.png'), 'not an image');
  const modelCall = jest.fn();
  const context = { workspace, signal, modelCall, apiConfig: {} };
  await expect(readImage({ image_path: 'secret.png' }, context)).rejects.toThrow('Unsupported');
  await expect(readImage({ image_path: '../outside' }, context)).rejects.toThrow('outside');
  expect(modelCall).not.toHaveBeenCalled();
});

test.each([
  ['jpeg', Buffer.from([255, 216, 255, 0])],
  ['gif', Buffer.from('GIF89a0000')],
  ['webp', Buffer.from('RIFF0000WEBP')],
])('detects %s by bytes rather than filename', async (type, bytes) => {
  fs.writeFileSync(path.join(root, 'image.bin'), bytes);
  await readImage({ image_path: 'image.bin', prompt: 'Describe' }, {
    workspace, signal, apiConfig: { provider: 'openai', model: 'new' },
    modelCall: async (config, request) => {
      expect(JSON.stringify(request.messages)).toContain(`image/${type}`);
      return { content: 'description' };
    },
  });
});

test('image cancellation and empty model responses are explicit', async () => {
  fs.writeFileSync(path.join(root, 'screen.png'), png);
  const controller = new AbortController(); controller.abort();
  await expect(readImage({ image_path: 'screen.png' }, { workspace, signal: controller.signal })).rejects.toThrow('Cancelled');
  await expect(readImage({ image_path: 'screen.png' }, { workspace, signal, apiConfig: {}, modelCall: async () => ({ content: '' }) })).rejects.toThrow('vision support');
});

const settings = provider => ({ getSetting: key => ({ searchApiProvider: provider, serpApiKey: 'serp-secret', googleApiKey: 'google-secret', googleCseId: 'engine' })[key] });

test.each(['google', 'serpapi'])('%s search reuses settings, deduplicates safe URLs and never auto-scrapes results', async provider => {
  const fetchImpl = jest.fn(async url => {
    expect(url.searchParams.get('q')).toBeTruthy();
    return new Response(JSON.stringify({ [provider === 'google' ? 'items' : 'organic_results']: [
      { title: 'Docs', link: 'https://example.com/docs', snippet: 'A source' },
      { title: 'Bad', link: 'file:///etc/passwd', snippet: 'No' },
    ] }));
  });
  const result = await webSearch({ queries: ['query one', 'query two'] }, { db: settings(provider), signal, fetchImpl });
  expect(result.results).toHaveLength(1);
  expect(result.results[0].snippet).toBe('A source');
  expect(fetchImpl).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(result)).not.toContain('secret');
});

test('search empty results, bad config, HTTP errors and API errors are recoverable', async () => {
  const ctx = { signal, db: settings('google') };
  await expect(webSearch({ queries: ['q'] }, { signal })).rejects.toThrow('credentials');
  await expect(webSearch({ queries: ['q'] }, { signal, db: settings('unknown') })).rejects.toThrow('Unsupported');
  await expect(webSearch({ queries: ['q'] }, { ...ctx, fetchImpl: async () => new Response('{}') })).resolves.toMatchObject({ results: [] });
  await expect(webSearch({ queries: ['q'] }, { ...ctx, fetchImpl: async () => new Response('key=secret', { status: 401 }) })).rejects.toThrow('HTTP 401');
  await expect(webSearch({ queries: ['q'] }, { ...ctx, fetchImpl: async () => new Response('{"error":"secret"}') })).rejects.toThrow('Check search settings');
  await expect(webSearch({ queries: ['q'] }, { ...ctx, fetchImpl: async () => { throw new Error('https://google?key=secret'); } })).rejects.toThrow('failed or was cancelled');
});

test('search abort signal reaches in-flight requests; response size is bounded', async () => {
  const controller = new AbortController();
  const fetchImpl = (url, opts) => new Promise((resolve, reject) => {
    opts.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    controller.abort();
  });
  await expect(webSearch({ queries: ['q'] }, { signal: controller.signal, db: settings('serpapi'), fetchImpl })).rejects.toThrow('cancelled');
  await expect(webSearch({ queries: ['q'] }, { signal, db: settings('serpapi'), fetchImpl: async () => new Response('x'.repeat(1024 * 1024 + 1)) })).rejects.toThrow('exceeds');
});
