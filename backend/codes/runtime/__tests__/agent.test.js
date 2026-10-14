const fs = require('fs');
const os = require('os');
const path = require('path');
const { processRequest, disposeSessions, cancelSession, resolveApproval, requestApproval } = require('../agent');
const { fitContext, loadHistory } = require('../context');
const { TOOLS, validate } = require('../tools');
const { Workspace } = require('../workspace');
const { Processes } = require('../processes');

let root;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'clustrix-agent-')); });
afterEach(() => { disposeSessions(); fs.rmSync(root, { recursive: true, force: true }); });
const call = (name, args, id = 'c') => ({ id, name, arguments: typeof args === 'string' ? args : JSON.stringify(args) });
const reply = (calls = [], content = '') => ({ role: 'assistant', content, calls, usage: { prompt_tokens: 10, completion_tokens: 5 } });
const request = extra => ({ sessionId: 'test', userPrompt: 'Fix the bug', provider: 'openrouter', model: 'new-model', workspacePath: root, ...extra });

/** Fixture transport emits text using the same contract as the actual streaming provider. */
function modelSequence(responses, inspect = () => {}) {
  return jest.fn(async (config, options, hooks) => {
    inspect(config, options, hooks);
    const response = responses.shift();
    if (!response) throw new Error('Unexpected extra model round.');
    if (response.content) hooks.onText(response.content);
    return response;
  });
}

test('end-to-end read → exact edit → test approval → command → final response; UI format and usage preserved', async () => {
  fs.writeFileSync(path.join(root, 'a.js'), 'module.exports = 1;\n');
  const modelCall = modelSequence([
    reply([call('read_file', { file: 'a.js' })]),
    reply([call('edit_file', { file: 'a.js', old_text: '= 1', new_text: '= 2' })]),
    reply([call('run_command', { command: 'node -e "process.exit(0)"' })]),
    reply([], 'Updated and verified.'),
  ]);
  const db = { getMessages: () => [{ role: 'user', content: 'Fix the bug', message_index: 4 }], addCodeIteration: jest.fn() };
  const onChunk = jest.fn((text, info) => {
    if (info.type === 'confirmation') {
      const event = JSON.parse(text);
      expect(resolveApproval(event.sessionId, event.iteration, true)).toBe(true);
    }
  });
  const result = await processRequest(request({ modelCall, onChunk, db }));
  expect(result.stopReason).toBe('completed');
  expect(result.cancelled).toBe(false);
  expect(result.usage).toEqual({ prompt_tokens: 40, completion_tokens: 20, total_tokens: 60 });
  expect(result.chunks.join('')).toContain('<!--command-output-->');
  expect(result.chunks.join('')).toContain('Updated and verified.');
  expect(fs.readFileSync(path.join(root, 'a.js'), 'utf8')).toContain('= 2');
  expect(modelCall.mock.calls[0][1].messages.filter(m => m.role === 'user')).toHaveLength(1);
  expect(db.addCodeIteration).toHaveBeenCalledWith('test', 4, 2, expect.objectContaining({ summary: 'run_command' }));
});

test('malformed/unknown tool arguments are tool results, never shell commands', async () => {
  const modelCall = modelSequence([
    reply([call('run_command', '{bad', 'a'), call('sudo', { command: 'x' }, 'b'), call('read_file', { file: 3 }, 'c')]),
    reply([], 'Recovered.'),
  ]);
  const result = await processRequest(request({ modelCall }));
  expect(result.stopReason).toBe('completed');
  const feedback = modelCall.mock.calls[1][1].messages.find(m => m.role === 'tool');
  expect(feedback.results).toHaveLength(3);
  expect(feedback.results.every(r => r.error)).toBe(true);
  expect(result.chunks.join('')).toContain('Unknown tool sudo');
});

test('non-streaming requests fail closed on shell approval; no disk mutation', async () => {
  const modelCall = modelSequence([reply([call('run_command', { command: 'echo unsafe > unwanted' })]), reply([], 'Approval unavailable.')]);
  const result = await processRequest(request({ modelCall }));
  expect(fs.existsSync(path.join(root, 'unwanted'))).toBe(false);
  expect(result.chunks.join('')).toContain('denied');
});

test('approval is action/session scoped, expires, and aborts without leaked resolvers', async () => {
  const controller = new AbortController();
  let event;
  const pending = requestApproval('a', 'command', text => { event = JSON.parse(text); }, controller.signal, 1000);
  expect(resolveApproval('b', event.iteration, true)).toBe(false);
  controller.abort();
  expect(await pending).toBe(false);
  expect(resolveApproval('a', event.iteration, true)).toBe(false);
  expect(await requestApproval('a', 'command', () => {}, new AbortController().signal, 5)).toBe(false);
});

test('cancellation aborts an in-flight model and rejects simultaneous requests for one session', async () => {
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  const modelCall = jest.fn((config, options, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    started();
  }));
  const pending = processRequest(request({ modelCall }));
  await ready;
  await expect(processRequest(request({ modelCall }))).rejects.toThrow('already has');
  expect(cancelSession('test')).toBe(true);
  expect((await pending).cancelled).toBe(true);
});

test('cancel while waiting approval prevents command execution', async () => {
  const modelCall = modelSequence([reply([call('run_command', { command: 'echo nope > unwanted' })])]);
  const result = await processRequest(request({ modelCall, onChunk: (text, info) => { if (info.type === 'confirmation') cancelSession('test'); } }));
  expect(result.cancelled).toBe(true);
  expect(fs.existsSync(path.join(root, 'unwanted'))).toBe(false);
});

test('identical tool failures stop with explicit incomplete status', async () => {
  const failure = reply([call('read_file', { file: 'missing' })]);
  const modelCall = modelSequence([failure, failure, failure]);
  const result = await processRequest(request({ modelCall }));
  expect(result.stopReason).toBe('repeated_tool_failure');
  expect(result.chunks.join('')).toContain('Work may be incomplete');
});

test('iteration budget never silently reports success', async () => {
  const modelCall = modelSequence([reply([call('list_files', {})])]);
  const result = await processRequest(request({ modelCall, options: { maxIterations: 1 } }));
  expect(result.stopReason).toBe('iteration_limit');
  expect(result.chunks.join('')).toContain('budget reached');
});

test('workspace switch recreates native I/O; no home-directory fallback', async () => {
  await expect(processRequest(request({ workspacePath: undefined }))).rejects.toThrow('workspace');
  const other = fs.mkdtempSync(path.join(os.tmpdir(), 'clustrix-other-'));
  try {
    await processRequest(request({ modelCall: modelSequence([reply([call('create_file', { file: 'one', content: '1' })]), reply([], 'done')]) }));
    await processRequest(request({ workspacePath: other, modelCall: modelSequence([reply([call('create_file', { file: 'two', content: '2' })]), reply([], 'done')]) }));
    expect(fs.existsSync(path.join(root, 'two'))).toBe(false);
    expect(fs.existsSync(path.join(other, 'two'))).toBe(true);
  } finally { fs.rmSync(other, { recursive: true, force: true }); }
});

test('tool schema validates nested values and rejects unexpected properties', () => {
  const schema = TOOLS.find(t => t.name === 'update_checklist').parameters;
  expect(() => validate({ checklist: [{ task: 'test', status: 'madeup' }] }, schema)).toThrow();
  expect(() => validate({ checklist: [], extra: true }, schema)).toThrow('Unknown');
  expect(() => validate({ checklist: [{ task: 'test', status: 'completed' }] }, schema)).not.toThrow();
});

test('context compacts whole call/result groups, keeping current task and recent rounds', () => {
  const messages = [{ role: 'user', content: 'current task' }];
  for (let i = 0; i < 10; i++) messages.push({ role: 'assistant', calls: [{ id: String(i) }] }, { role: 'tool', results: [{ id: String(i), content: 'x'.repeat(3000) }] });
  const fitted = fitContext({ system: 'rules', tools: [], messages, contextWindow: 8500, maxOutputTokens: 1024, checkpoint: 'Edited a.js; run tests' });
  expect(fitted.removed).toBeGreaterThan(0);
  expect(fitted.messages[0].content).toBe('current task');
  expect(fitted.system).toContain('Edited a.js');
  for (let i = 1; i < fitted.messages.length; i++) {
    if (fitted.messages[i].role === 'tool') expect(fitted.messages[i - 1].calls[0].id).toBe(fitted.messages[i].results[0].id);
  }
  expect(() => fitContext({ system: 'x'.repeat(90000), tools: [], messages: [messages[0]], contextWindow: 8500, maxOutputTokens: 1024 })).toThrow('budget');
});

test('history stays chronological, excludes invalid roles, deduplicates only latest current user', () => {
  const db = { getMessages: () => [{ role: 'system', content: 'bad' }, { role: 'user', content: 'old' }, { role: 'assistant', content: 'reply' }, { role: 'user', content: 'new' }] };
  expect(loadHistory(db, 's', 'new').map(m => m.content)).toEqual(['old', 'reply', 'new']);
});

test('foreground reports actual exit code, fresh cwd, bounded output and kills on timeout', async () => {
  const processes = new Processes(new Workspace(root));
  const result = await processes.run({ command: 'node -e "process.stdout.write(String(process.cwd())); process.exit(7)"' });
  expect(result.exit_code).toBe(7);
  expect(result.output).toContain(root);
  const timeout = await processes.run({ command: 'node -e "setInterval(()=>{},1000)"', timeout_ms: 100 });
  expect(timeout.timed_out).toBe(true);
  expect(timeout.running).toBe(false);
  const large = await processes.run({ command: 'node -e "process.stdout.write(\'x\'.repeat(100000))"' });
  expect(large.output.length).toBeLessThan(17000);
  expect(large.output).toContain('omitted');
  processes.dispose();
});

test('background process lifecycle returns an owned ID, status and explicit stop', async () => {
  const processes = new Processes(new Workspace(root));
  const job = await processes.run({ command: 'node -e "setInterval(()=>{},1000)"', background: true });
  expect(job.running).toBe(true);
  expect(() => processes.status({ process_id: 'other-session' })).toThrow('Unknown');
  const stopped = await processes.stop({ process_id: job.process_id });
  expect(stopped.running).toBe(false);
});

test('skill loading, checklist, search and edit history use the same dispatcher for every provider', async () => {
  fs.mkdirSync(path.join(root, '.agents/skills/testing'), { recursive: true });
  fs.writeFileSync(path.join(root, '.agents/skills/testing/SKILL.md'), '---\ndescription: Verification guidance\n---\nRun focused tests.');
  fs.writeFileSync(path.join(root, 'a'), 'before');
  const modelCall = modelSequence([
    reply([call('load_skill', { name: '.agents/skills/testing' }), call('update_checklist', { checklist: [{ task: 'Verify', status: 'in_progress' }] }, 'b'), call('search_files', { query: 'before' }, 'c')]),
    reply([call('read_file', { file: 'a' })]),
    reply([call('edit_file', { file: 'a', old_text: 'before', new_text: 'after' })]),
    reply([call('show_history', {})]),
    reply([], 'Done'),
  ]);
  const result = await processRequest(request({ modelCall }));
  expect(result.chunks.join('')).toContain('Run focused tests');
  expect(result.chunks.join('')).toContain('Verify (in progress)');
  expect(result.chunks.join('')).toContain('edit_id');
});

test('durable factual checkpoints survive runtime disposal and stay scoped to the workspace', async () => {
  let saved;
  const db = {
    saveConversationSummary: jest.fn((id, summary_text) => { saved = { summary_text }; }),
    getLatestSummary: () => saved,
  };
  await processRequest(request({ db, modelCall: modelSequence([reply([call('update_checklist', { checklist: [{ task: 'Run tests next', status: 'pending' }] })]), reply([], 'Paused')]) }));
  expect(saved.summary_text).toContain('Run tests next');
  disposeSessions();
  const modelCall = modelSequence([reply([], 'Continuing')]);
  await processRequest(request({ db, userPrompt: 'continue', modelCall }));
  expect(modelCall.mock.calls[0][1].messages[0].content).toContain('Earlier task checkpoint');
  expect(modelCall.mock.calls[0][1].messages[0].content).toContain('Run tests next');
});

test('huge latest tool groups are evicted atomically instead of deadlocking the agent context', () => {
  const messages = [
    { role: 'user', content: 'task' },
    { role: 'assistant', calls: [{ id: 'x' }] },
    { role: 'tool', results: [{ id: 'x', content: 'x'.repeat(100000) }] },
  ];
  const fitted = fitContext({ system: 'rules', messages, tools: [], contextWindow: 8000, maxOutputTokens: 1024, checkpoint: 'Read file a; narrow next read' });
  expect(fitted.messages).toEqual([messages[0]]);
  expect(fitted.system).toContain('Read file a');
});

test('Windows shell invocation is Unicode-safe and propagates native failures', () => {
  const { shellInvocation } = require('../processes');
  const invocation = shellInvocation('Write-Output "héllo"; node test.js', 'win32');
  expect(invocation.executable).toBe('powershell.exe');
  const script = Buffer.from(invocation.args.at(-1), 'base64').toString('utf16le');
  expect(script).toContain('héllo');
  expect(script).toContain('exit $LASTEXITCODE');
  expect(script).toContain("$ErrorActionPreference = 'Stop'");
});

test('process output responds to cancellation and launch errors', async () => {
  const processes = new Processes(new Workspace(root));
  const controller = new AbortController();
  const pending = processes.run({ command: 'node -e "setInterval(()=>{},1000)"' }, controller.signal);
  controller.abort();
  expect((await pending).running).toBe(false);
  const invalidCwd = await processes.run({ command: 'echo nope', cwd: 'does-not-exist' });
  expect(invalidCwd.exit_code).toBe(-1);
  processes.dispose();
});

test('actual renderer ai roles and empty placeholders retain assistant history without duplicating the current prompt', () => {
  const db = { getMessages: () => [
    { role: 'user', content: 'old task' },
    { role: 'ai', content: 'Implemented old task' },
    { role: 'user', content: 'continue' },
    { role: 'ai', content: '' },
  ] };
  expect(loadHistory(db, 's', 'continue')).toEqual([
    { role: 'user', content: 'old task' },
    { role: 'assistant', content: 'Implemented old task' },
    { role: 'user', content: 'continue' },
  ]);
});

test('process_status can wait for completion or a deadline and can be cancelled', async () => {
  const processes = new Processes(new Workspace(root));
  const job = await processes.run({ command: 'node -e "setTimeout(()=>{},300)"', background: true });
  expect((await processes.waitStatus({ process_id: job.process_id, wait_ms: 3000 })).running).toBe(false);
  const running = await processes.run({ command: 'node -e "setInterval(()=>{},1000)"', background: true });
  expect((await processes.waitStatus({ process_id: running.process_id, wait_ms: 5 })).running).toBe(true);
  const controller = new AbortController();
  const wait = processes.waitStatus({ process_id: running.process_id, wait_ms: 30000 }, controller.signal);
  controller.abort();
  await expect(wait).rejects.toThrow('Cancelled');
  await processes.stop({ process_id: running.process_id });
});
