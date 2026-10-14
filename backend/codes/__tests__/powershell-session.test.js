/** Legacy rollback terminal: deterministic stream fixtures, not a dependency on a local PowerShell install. */
const { EventEmitter } = require('events');
const { PassThrough } = require('stream');
jest.mock('child_process', () => ({ spawn: jest.fn() }));
const { spawn } = require('child_process');
const { PowerShellSession, detectExecutable } = require('../powershell-session');

let child;
let session;
beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  child = new EventEmitter();
  child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.kill = jest.fn();
  spawn.mockReturnValue(child);
  session = new PowerShellSession({ workspacePath: process.cwd(), log: jest.fn() });
});
afterEach(() => { session.dispose(); jest.restoreAllMocks(); jest.useRealTimers(); });

function complete(output = 'hello', exitCode = 0) {
  child.stdout.write(`${output}\n${session.sentinel}\nEXIT_CODE:${exitCode}\n`);
}

test('spawns in the requested workspace and loads helper definitions', () => {
  expect(spawn).toHaveBeenCalledWith(detectExecutable(), expect.any(Array), expect.objectContaining({ cwd: process.cwd() }));
  expect(child.stdin.read().toString()).toContain('function');
});

test('captures stdout, stderr and nonzero exit status', async () => {
  const pending = session.run('Get-Location');
  child.stderr.write('problem\n');
  complete('output', 7);
  await expect(pending).resolves.toEqual({ stdout: 'output', stderr: 'problem', exitCode: 7 });
});

test('waits for complete exit-code line when sentinel and status arrive separately', async () => {
  const pending = session.run('Get-Location');
  const sentinel = session.sentinel;
  child.stdout.write(`hello\n${sentinel}\n`);
  expect(session.currentCommand).not.toBeNull();
  child.stdout.write('EXIT_CODE:1');
  expect(session.currentCommand).not.toBeNull();
  child.stdout.write('2\n');
  await expect(pending).resolves.toMatchObject({ exitCode: 12, stdout: 'hello' });
});

test('rejects empty, concurrent and disposed commands', async () => {
  await expect(session.run('')).rejects.toThrow('non-empty');
  const pending = session.run('pwd');
  await expect(session.run('pwd')).rejects.toThrow('busy');
  const rejected = expect(pending).rejects.toThrow('disposed');
  session.dispose();
  await rejected;
  await expect(session.run('pwd')).rejects.toThrow('disposed');
  expect(child.kill).toHaveBeenCalledTimes(1);
});

test('encodes special characters without shell interpolation', async () => {
  child.stdin.read();
  const command = 'Write-Host "hello; world"';
  const pending = session.run(command);
  expect(child.stdin.read().toString()).toContain(Buffer.from(command).toString('base64'));
  complete();
  await pending;
});

test('propagates spawn errors and marks unusable terminal disposed', async () => {
  const pending = session.run('pwd');
  const rejected = expect(pending).rejects.toThrow('spawn failed');
  child.emit('error', new Error('spawn failed'));
  await rejected;
  expect(session.isDisposed).toBe(true);
});

test('rejects a command if the shell exits before completion', async () => {
  const pending = session.run('pwd');
  const rejected = expect(pending).rejects.toThrow('exited before');
  child.emit('exit', 1, null);
  await rejected;
  expect(session.isDisposed).toBe(true);
});

test('legacy timeout settles the pending command', async () => {
  jest.useFakeTimers();
  const pending = session.run('pwd', { timeout: 1000 });
  const rejected = expect(pending).rejects.toThrow('timed out');
  jest.advanceTimersByTime(1001);
  await rejected;
  expect(session.currentCommand).toBeNull();
});
