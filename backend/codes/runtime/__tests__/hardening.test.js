const fs = require('fs');
const path = require('path');
const os = require('os');
const { EventEmitter } = require('events');
const { PassThrough } = require('stream');
const { Processes, shellInvocation } = require('../processes');
const { Workspace } = require('../workspace');
const { describeCall } = require('../presentation');
const { processRequest, disposeSessions } = require('../agent');

let root;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'clustrix-hardening-')); });
afterEach(() => { disposeSessions(); fs.rmSync(root, { recursive: true, force: true }); });

/** Controlled child fixture exposes termination failures without spawning Windows tools on Linux. */
function childFixture(pid) {
  const child = new EventEmitter();
  child.pid = pid;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = jest.fn(() => true);
  return child;
}

test('null tool arguments can be displayed without crashing before schema validation', () => {
  expect(() => describeCall({ name: 'run_command', arguments: 'null' })).not.toThrow();
});

test('malformed argument shape returns a recoverable tool error, not an aborted task', async () => {
  let count = 0;
  const result = await processRequest({
    sessionId: 'malformed', userPrompt: 'inspect', model: 'fixture', workspacePath: root,
    modelCall: async (config, options, hooks) => {
      if (count++ === 0) return { role: 'assistant', calls: [{ id: 'a', name: 'run_command', arguments: 'null' }] };
      expect(options.messages.at(-1).results[0].error).toBe(true);
      hooks.onText('Recovered');
      return { role: 'assistant', content: 'Recovered' };
    },
  });
  expect(result.stopReason).toBe('completed');
});

test('Windows invocation enforces command-line length before spawning', () => {
  expect(() => shellInvocation('x'.repeat(20000), 'win32')).toThrow(/Windows.*limit/i);
});

test('failed taskkill falls back to owned child and discloses uncertain tree cleanup', async () => {
  const child = childFixture(1234);
  const killer = childFixture(4321);
  child.kill.mockImplementation(() => { queueMicrotask(() => child.emit('close', null, 'SIGTERM')); return true; });
  const spawnProcess = jest.fn().mockReturnValueOnce(child).mockImplementation(() => {
    queueMicrotask(() => killer.emit('close', 1));
    return killer;
  });
  const processes = new Processes(new Workspace(root), { platform: 'win32', spawnProcess, terminationTimeoutMs: 25 });
  const started = await processes.run({ command: 'test', background: true });
  const result = await processes.stop({ process_id: started.process_id });
  expect(spawnProcess.mock.calls[1][0]).toBe('taskkill');
  expect(child.kill).toHaveBeenCalledTimes(1);
  expect(result.running).toBe(false);
  expect(result.termination_warning).toMatch(/tree/i);
});

test('unkillable child does not hang stop or falsely report that it exited', async () => {
  const child = childFixture(1234);
  const killer = childFixture(4321);
  const spawnProcess = jest.fn().mockReturnValueOnce(child).mockImplementation(() => {
    queueMicrotask(() => killer.emit('error', new Error('no taskkill')));
    return killer;
  });
  const processes = new Processes(new Workspace(root), { platform: 'win32', spawnProcess, terminationTimeoutMs: 10 });
  const started = await processes.run({ command: 'test', background: true });
  const result = await processes.stop({ process_id: started.process_id });
  expect(result.running).toBe(true);
  expect(result.success).toBe(false);
  expect(result.termination_error).toMatch(/not confirmed/i);
  child.emit('close', 0);
  expect(processes.status({ process_id: started.process_id }).running).toBe(false);
});

test('an undo refuses a symlink substituted after our edit even if content matches', () => {
  fs.writeFileSync(path.join(root, 'file'), 'before');
  const workspace = new Workspace(root);
  workspace.read({ file: 'file' });
  const edited = workspace.edit({ file: 'file', old_text: 'before', new_text: 'after' });
  fs.writeFileSync(path.join(root, 'target'), 'after');
  fs.unlinkSync(path.join(root, 'file'));
  fs.symlinkSync(path.join(root, 'target'), path.join(root, 'file'));
  expect(() => workspace.undo({ edit_id: edited.edit_id })).toThrow(/symlink/i);
  expect(fs.lstatSync(path.join(root, 'file')).isSymbolicLink()).toBe(true);
});

test('compaction evicts complete old user-led turns and emits only one checkpoint', () => {
  const { fitContext } = require('../context');
  const result = fitContext({
    system: 'system', tools: [], contextWindow: 8500, maxOutputTokens: 1024,
    checkpoint: 'read narrower next', compacted: true,
    messages: [
      { role: 'user', content: 'x'.repeat(20000) },
      { role: 'assistant', content: 'old reply' },
      { role: 'user', content: 'current task' },
    ],
  });
  expect(result.messages).toEqual([{ role: 'user', content: 'current task' }]);
  expect(result.system.match(/Task checkpoint:/g)).toHaveLength(1);
});

test('history truncation never starts with an assistant message', () => {
  const { loadHistory } = require('../context');
  const rows = Array.from({ length: 13 }, (_, i) => ({ role: i % 2 ? 'ai' : 'user', content: `m${i}` }));
  const history = loadHistory({ getMessages: () => rows }, 's', 'next');
  expect(history[0].role).toBe('user');
  expect(history[0].content).toBe('m2');
});

test('a symlink workspace alias preserves same-session edit history across requests', async () => {
  const real = path.join(root, 'real');
  const alias = path.join(root, 'alias');
  fs.mkdirSync(real);
  fs.symlinkSync(real, alias, 'junction');
  fs.writeFileSync(path.join(real, 'a'), 'before');
  let round = 0;
  const request = { sessionId: 'alias', userPrompt: 'edit', workspacePath: alias, model: 'fixture' };
  await processRequest({ ...request, modelCall: async () => {
    const args = [
      { id: 'r', name: 'read_file', arguments: '{"file":"a"}' },
      { id: 'e', name: 'edit_file', arguments: '{"file":"a","old_text":"before","new_text":"after"}' },
    ];
    if (round < 2) return { role: 'assistant', calls: [args[round++]] };
    return { role: 'assistant', content: 'done' };
  } });
  let secondRound = 0;
  await processRequest({ ...request, userPrompt: 'show history', modelCall: async (config, options) => {
    if (secondRound++ === 0) return { role: 'assistant', calls: [{ id: 'h', name: 'show_history', arguments: '{}' }] };
    expect(JSON.parse(options.messages.at(-1).results[0].content).edits).toHaveLength(1);
    return { role: 'assistant', content: 'done' };
  } });
});

test.each(['NUL', 'con.txt', 'COM1.log', 'LPT9', 'folder/.git./config', 'a:secret', 'folder/name '])('Windows native file tools reject special alias %s', relative => {
  const { validateRelativePath } = require('../path-policy');
  expect(() => validateRelativePath(relative, 'win32')).toThrow();
});

test('path restrictions are platform-aware and permit ordinary project paths', () => {
  const { validateRelativePath } = require('../path-policy');
  expect(() => validateRelativePath('src/component.ts', 'win32')).not.toThrow();
  expect(() => validateRelativePath('nul.txt', 'linux')).not.toThrow();
  expect(() => validateRelativePath('.GIT/config', 'linux')).toThrow('.git');
});

test('large rewrite bounds diff calculation and reports omitted preview explicitly', () => {
  const before = Array.from({ length: 1100 }, (_, i) => `old-${i}`).join('\n');
  const after = Array.from({ length: 1100 }, (_, i) => `new-${i}`).join('\n');
  fs.writeFileSync(path.join(root, 'rewrite'), before);
  const workspace = new Workspace(root);
  workspace.read({ file: 'rewrite' });
  const result = workspace.edit({ file: 'rewrite', old_text: before, new_text: after });
  expect(workspace.text('rewrite')).toBe(after);
  expect(result.diff).toContain('Diff preview omitted');
  expect(result.edit_id).toBeTruthy();
});

test('repeated process observation removes listeners instead of accumulating promise handlers', async () => {
  const child = childFixture(1234);
  const processes = new Processes(new Workspace(root), { spawnProcess: () => child });
  const started = await processes.run({ command: 'fixture', background: true });
  for (let i = 0; i < 10; i++) await processes.waitStatus({ process_id: started.process_id, wait_ms: 1 });
  expect(processes.jobs.get(started.process_id).closeWaiters.size).toBe(0);
  child.emit('close', 0);
});
