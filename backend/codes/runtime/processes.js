const { spawn } = require('child_process');
const crypto = require('crypto');
const { clip } = require('./workspace');

/** Build OS-native invocation; encoded PowerShell preserves Unicode and propagates native exit codes. */
function shellInvocation(command, platform = process.platform) {
  if (platform !== 'win32') return { executable: '/bin/sh', args: ['-c', command] };
  const script = `$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$LASTEXITCODE = 0
try {
  & {
${command}
}
  $clxSuccess = $?
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  if (-not $clxSuccess) { exit 1 }
} catch { [Console]::Error.WriteLine($_); exit 1 }
`;
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  // CreateProcess has a 32,767-character command-line limit including executable/flags.
  if (encoded.length > 30000) throw new Error('Windows command-line limit exceeded. Create a script file with native file tools, then run that file.');
  return { executable: 'powershell.exe', args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encoded] };
}

/** Owned process groups with bounded logs; foreground timeouts terminate, never detach silently. */
class Processes {
  constructor(workspace, { platform = process.platform, spawnProcess = spawn, killGroup = process.kill.bind(process), terminationTimeoutMs = 5000 } = {}) {
    this.workspace = workspace;
    this.platform = platform;
    this.spawn = spawnProcess;
    this.killGroup = killGroup;
    this.terminationTimeoutMs = terminationTimeoutMs;
    this.jobs = new Map();
  }

  /** Start an explicitly foreground or background command. Approval is enforced by the caller. */
  async run({ command, cwd = '.', background = false, timeout_ms = 120000 }, signal) {
    if (typeof command !== 'string' || !command.trim() || command.length > 64000) throw new Error('Invalid command.');
    if (signal?.aborted) throw new Error('Cancelled.');
    for (const [id, job] of this.jobs) if (job.done && this.jobs.size >= 32) this.jobs.delete(id);
    if (this.jobs.size >= 32) throw new Error('Too many processes; stop existing jobs first.');
    const id = crypto.randomUUID();
    const windows = this.platform === 'win32';
    const invocation = shellInvocation(command, this.platform);
    const child = this.spawn(invocation.executable, invocation.args, {
      cwd: this.workspace.resolve(cwd),
      windowsHide: true,
      detached: !windows,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const job = { id, child, command, output: '', omitted: 0, done: false, exitCode: null, timedOut: false };
    job.closeWaiters = new Set();
    job.interrupted = new Promise(resolve => { job.resolveInterrupted = resolve; });
    this.jobs.set(id, job);
    const append = data => {
      job.output += data;
      if (job.output.length > 32000) {
        job.omitted += job.output.length - 32000;
        job.output = job.output.slice(-32000);
      }
    };
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', append);
    child.stderr.on('data', append);
    const abort = () => this.kill(job);
    signal?.addEventListener('abort', abort, { once: true });
    let timer;
    job.finished = new Promise(resolve => {
      const finish = (code, signalName) => {
        if (job.done) return;
        job.done = true;
        job.exitCode = code;
        job.signal = signalName || null;
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        for (const listener of [...job.closeWaiters]) listener();
        job.closeWaiters.clear();
        resolve();
      };
      child.on('error', error => {
        append(error.message);
        // ChildProcess also emits errors for failed kill/send operations, not only failed spawn.
        if (!child.pid) finish(-1);
      });
      child.on('close', finish);
    });
    if (signal?.aborted) abort();
    if (background) {
      // Give spawn errors and immediate exits a chance to surface, without waiting for a server.
      await new Promise(resolve => setTimeout(resolve, 100));
    } else {
      timer = setTimeout(() => { job.timedOut = true; this.kill(job); }, Math.max(100, Math.min(Number(timeout_ms) || 120000, 600000)));
      // Termination can fail (permissions/taskkill unavailable). Stop waiting, but retain the live job.
      await Promise.race([job.finished, job.interrupted]);
      clearTimeout(timer);
    }
    return this.status({ process_id: id });
  }

  /** Request tree termination once, bound the wait and never claim an unobserved exit. */
  kill(job) {
    if (!job || job.done) return Promise.resolve();
    if (job.stopping) return job.stopping;
    const pending = new Promise(resolve => {
      let killer;
      let fallbackUsed = false;
      const finish = () => {
        clearTimeout(timer);
        job.closeWaiters.delete(finish);
        job.resolveInterrupted();
        resolve();
      };
      const fallback = reason => {
        if (job.done || fallbackUsed) return;
        fallbackUsed = true;
        job.terminationWarning = `Process tree termination failed (${reason}); attempted direct child termination only.`;
        try { job.child.kill('SIGKILL'); } catch { /* The deadline reports an unconfirmed exit. */ }
      };
      const timer = setTimeout(() => {
        if (!job.done) job.terminationError = 'Process exit not confirmed. It may still be running; inspect or stop it manually before retrying work.';
        try { killer?.kill(); } catch { /* Do not leave a hung taskkill helper waiting indefinitely. */ }
        finish();
      }, this.terminationTimeoutMs);
      job.closeWaiters.add(finish);
      if (!Number.isInteger(job.child.pid) || job.child.pid <= 0) {
        fallback('no process ID');
      } else if (this.platform === 'win32') {
        try {
          killer = this.spawn('taskkill', ['/pid', String(job.child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
          killer.once('error', () => fallback('taskkill could not start'));
          killer.once('close', code => { if (code !== 0) fallback('taskkill returned nonzero'); });
        } catch { fallback('taskkill could not start'); }
      } else {
        try { this.killGroup(-job.child.pid, 'SIGKILL'); }
        catch { fallback('process group signal failed'); }
      }
    });
    job.stopping = pending.finally(() => { job.stopping = null; });
    return job.stopping;
  }

  /** Inspect only processes owned by this session. */
  status({ process_id }) {
    const job = this.jobs.get(process_id);
    if (!job) throw new Error('Unknown process ID for this session.');
    return {
      process_id, running: !job.done, exit_code: job.exitCode, signal: job.signal || null,
      timed_out: job.timedOut,
      ...(job.terminationError && !job.done ? { success: false, termination_error: job.terminationError } : {}),
      ...(job.terminationWarning ? { termination_warning: job.terminationWarning } : {}),
      output: (job.omitted ? `[${job.omitted} earlier characters omitted]\n` : '') + clip(job.output),
    };
  }

  /** Wait for completion or a bounded observation window instead of forcing rapid polling. */
  async waitStatus({ process_id, wait_ms = 0 }, signal) {
    const job = this.jobs.get(process_id);
    if (!job) throw new Error('Unknown process ID for this session.');
    if (signal?.aborted) throw new Error('Cancelled.');
    const duration = Math.max(0, Math.min(Number(wait_ms) || 0, 30000));
    if (!job.done && duration > 0) {
      await new Promise((resolve, reject) => {
        const cleanup = () => { clearTimeout(timer); job.closeWaiters.delete(finish); signal?.removeEventListener('abort', abort); };
        const finish = () => { cleanup(); resolve(); };
        const abort = () => { cleanup(); reject(new Error('Cancelled.')); };
        const timer = setTimeout(finish, duration);
        signal?.addEventListener('abort', abort, { once: true });
        job.closeWaiters.add(finish);
        if (signal?.aborted) abort();
      });
    }
    return this.status({ process_id });
  }

  /** Stop an owned background process and wait for the close event. */
  async stop({ process_id }) {
    const job = this.jobs.get(process_id);
    if (!job) throw new Error('Unknown process ID for this session.');
    await this.kill(job);
    return this.status({ process_id });
  }

  /** Cancel all owned processes on request cancellation, workspace switch, or shutdown. */
  dispose() {
    for (const job of this.jobs.values()) this.kill(job);
  }
}

module.exports = { Processes, shellInvocation };
