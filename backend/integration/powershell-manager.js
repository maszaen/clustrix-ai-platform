const { spawn } = require('child_process');
const path = require('path');
const os = require('os');

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

function resolvePowerShellExecutable() {
  if (process.platform === 'win32') {
    return process.env.PWSH_PATH || 'powershell.exe';
  }

  if (process.env.PWSH_PATH) {
    return process.env.PWSH_PATH;
  }

  return 'pwsh';
}

function sanitizeOutput(output) {
  if (!output) return '';
  const lines = output
    .replace(/\r/g, '')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .filter((line) => !/^PS [^>]+>/.test(line.trim()));
  return lines.join(os.EOL);
}

class PowerShellTerminal {
  constructor(sessionId, workspacePath) {
    this.sessionId = sessionId;
    this.workspacePath = workspacePath || process.cwd();
    this.exe = resolvePowerShellExecutable();
    this.process = spawn(this.exe, ['-NoLogo', '-NoExit', '-Command', '-'], {
      cwd: this.workspacePath,
      env: process.env,
      stdio: 'pipe',
    });

    this.process.stdin.setDefaultEncoding('utf-8');

    this.queue = [];
    this.busy = false;
    this.buffer = '';
    this.errorBuffer = '';
    this.lastActivity = Date.now();
    this.idleTimer = null;
    this.alive = true;

    this.process.stdout.on('data', (chunk) => {
      this.buffer += chunk.toString();
    });

    this.process.stderr.on('data', (chunk) => {
      this.errorBuffer += chunk.toString();
    });

    this.process.on('exit', () => {
      this.dispose();
    });

    this.resetIdleTimer();
  }

  resetIdleTimer() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      this.shutdown();
    }, IDLE_TIMEOUT_MS);
  }

  shutdown() {
    if (this.process && !this.process.killed) {
      try {
        this.process.kill();
      } catch (err) {
        console.warn('[PowerShellTerminal] Failed to kill terminal', err);
      }
    }
    this.dispose();
  }

  dispose() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    this.busy = false;
    this.queue = [];
    this.alive = false;
  }

  enqueue(command) {
    return new Promise((resolve, reject) => {
      this.queue.push({ command, resolve, reject });
      this.processQueue();
    });
  }

  processQueue() {
    if (this.busy || this.queue.length === 0) return;
    const task = this.queue.shift();
    this.execute(task).catch((err) => {
      task.reject(err);
    });
  }

  async execute(task) {
    this.busy = true;
    this.resetIdleTimer();

    const marker = `__CLX_DONE_${Date.now()}_${Math.random().toString(36).slice(2)}__`;
    const markerLine = marker + os.EOL;

    const handleData = () => {
      if (this.buffer.includes(marker)) {
        cleanup();
        const combined = this.buffer.split(marker)[0];
        const sanitized = sanitizeOutput(combined);
        const errorOutput = sanitizeOutput(this.errorBuffer);

        this.buffer = '';
        this.errorBuffer = '';

        this.busy = false;
        this.lastActivity = Date.now();
        task.resolve({
          output: sanitized,
          error: errorOutput,
        });
        this.processQueue();
      }
    };

    const handleExit = (code) => {
      cleanup();
      this.busy = false;
      task.reject(new Error(`PowerShell exited with code ${code}`));
    };

    const cleanup = () => {
      this.process.stdout.off('data', handleData);
      this.process.off('exit', handleExit);
    };

    this.process.stdout.on('data', handleData);
    this.process.on('exit', handleExit);

    try {
      this.process.stdin.write(`${task.command}\r\n`);
      this.process.stdin.write(`Write-Output \"${marker}\"\r\n`);
    } catch (err) {
      cleanup();
      this.busy = false;
      task.reject(err);
      this.processQueue();
    }
  }
}

class PowerShellManager {
  constructor() {
    this.terminals = new Map();
  }

  getOrCreateTerminal(sessionId, workspacePath) {
    if (this.terminals.has(sessionId)) {
      const existing = this.terminals.get(sessionId);
      const workspaceChanged = workspacePath && path.resolve(existing.workspacePath) !== path.resolve(workspacePath);
      if (!existing.alive || workspaceChanged) {
        existing.shutdown();
        this.terminals.delete(sessionId);
      } else {
        return existing;
      }
    }

    const terminal = new PowerShellTerminal(sessionId, workspacePath);
    this.terminals.set(sessionId, terminal);
    return terminal;
  }

  async executeCommand(sessionId, command, workspacePath) {
    if (!command || !command.trim()) {
      return { output: '', error: '' };
    }

    const terminal = this.getOrCreateTerminal(sessionId, workspacePath);
    return terminal.enqueue(command.trim());
  }

  shutdownTerminal(sessionId) {
    const terminal = this.terminals.get(sessionId);
    if (terminal) {
      terminal.shutdown();
      this.terminals.delete(sessionId);
    }
  }

  shutdownAll() {
    for (const [sessionId, terminal] of this.terminals.entries()) {
      terminal.shutdown();
      this.terminals.delete(sessionId);
    }
  }
}

module.exports = new PowerShellManager();
