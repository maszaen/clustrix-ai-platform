const { spawn } = require('child_process');
const path = require('path');

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

function detectExecutable() {
  if (process.platform === 'win32') {
    return 'powershell.exe';
  }

  if (process.env.PWSH_PATH) {
    return process.env.PWSH_PATH;
  }

  return 'pwsh';
}

function normalizeWorkspacePath(workspacePath) {
  if (!workspacePath || typeof workspacePath !== 'string') {
    return process.cwd();
  }

  if (!path.isAbsolute(workspacePath)) {
    return path.resolve(process.cwd(), workspacePath);
  }

  return workspacePath;
}

class PowerShellSession {
  constructor(options = {}) {
    const { workspacePath, log = () => {} } = options;
    this.log = log;
    this.workspacePath = normalizeWorkspacePath(workspacePath);
    this.executable = detectExecutable();
    this.currentCommand = null;
    this.commandTimer = null;
    this.isDisposed = false;

    this._spawnProcess();
  }

  _spawnProcess() {
    this.process = spawn(this.executable, [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      '-'
    ], {
      cwd: this.workspacePath,
      env: {
        ...process.env,
        PSMODULEPATH: process.env.PSMODULEPATH || ''
      },
      windowsHide: true
    });

    this.process.stdin.setDefaultEncoding('utf-8');
    this.process.stdout.setEncoding('utf-8');
    this.process.stderr.setEncoding('utf-8');

    this.stdoutBuffer = '';
    this.stderrBuffer = '';

    this.process.stdout.on('data', (chunk) => this._handleStdout(chunk));
    this.process.stderr.on('data', (chunk) => this._handleStderr(chunk));
    this.process.on('error', (error) => {
      this.log('CODES', 4, 'powershell-session:error', 'PowerShell process error', {
        error: error?.message || error
      });
      if (this.currentCommand) {
        this.currentCommand.reject(error);
        this._clearCurrentCommand();
      }
    });

    this.process.on('exit', (code, signal) => {
      this.log('CODES', 2, 'powershell-session:exit', 'PowerShell session exited', {
        code,
        signal
      });
      if (this.currentCommand) {
        const error = new Error('PowerShell session exited before command completed');
        this.currentCommand.reject(error);
        this._clearCurrentCommand();
      }
      this.isDisposed = true;
    });
  }

  _handleStdout(chunk) {
    if (this.currentCommand) {
      this.stdoutBuffer += chunk;
      this._checkForCompletion();
    }
  }

  _handleStderr(chunk) {
    if (this.currentCommand) {
      this.stderrBuffer += chunk;
    }
  }

  _checkForCompletion() {
    if (!this.currentCommand || !this.sentinel) return;

    const sentinelIndex = this.stdoutBuffer.indexOf(this.sentinel);
    if (sentinelIndex === -1) {
      return;
    }

    const beforeSentinel = this.stdoutBuffer.slice(0, sentinelIndex);
    const afterSentinel = this.stdoutBuffer.slice(sentinelIndex + this.sentinel.length);

    const exitMatch = afterSentinel.match(/EXIT_CODE:(-?\d+)/);
    const exitCode = exitMatch ? parseInt(exitMatch[1], 10) : 0;

    const cleanedStdout = beforeSentinel.replace(/\r?\n$/, '');
    const stderr = this.stderrBuffer.trimEnd();

    const result = {
      stdout: cleanedStdout,
      stderr,
      exitCode
    };

    this.currentCommand.resolve(result);
    this._clearCurrentCommand();
  }

  _clearCurrentCommand() {
    if (this.commandTimer) {
      clearTimeout(this.commandTimer);
      this.commandTimer = null;
    }
    this.currentCommand = null;
    this.sentinel = null;
    this.stdoutBuffer = '';
    this.stderrBuffer = '';
  }

  async run(command, options = {}) {
    if (this.isDisposed) {
      throw new Error('PowerShell session has been disposed');
    }

    if (!command || typeof command !== 'string' || command.trim().length === 0) {
      throw new Error('Command must be a non-empty string');
    }

    if (this.currentCommand) {
      throw new Error('PowerShell session is busy running another command');
    }

    const timeout = typeof options.timeout === 'number'
      ? Math.max(options.timeout, 1000)
      : DEFAULT_TIMEOUT_MS;

    return new Promise((resolve, reject) => {
      this.currentCommand = { resolve, reject };
      this.sentinel = `__CLX_DONE_${Date.now()}_${Math.random().toString(36).slice(2)}`;

      // Encode command to base64 to safely handle multi-line strings, special chars, quotes
      const cmdBuffer = Buffer.from(command, 'utf16le');
      const base64Cmd = cmdBuffer.toString('base64');

      const script = `
$ErrorActionPreference = 'Stop'
$clx__exit = 0
$clx__cmd = [System.Text.Encoding]::Unicode.GetString([System.Convert]::FromBase64String('${base64Cmd}'))
try {
  & ([scriptblock]::Create($clx__cmd))
}
catch {
  [Console]::Error.WriteLine($_)
  if ($LASTEXITCODE -ne $null) {
    $clx__exit = [int]$LASTEXITCODE
  } else {
    $clx__exit = 1
  }
}
if ($LASTEXITCODE -ne $null -and $LASTEXITCODE -ne 0) {
  $clx__exit = [int]$LASTEXITCODE
}
[Console]::Out.WriteLine("${this.sentinel}")
[Console]::Out.WriteLine("EXIT_CODE:$clx__exit")
[Console]::Out.Flush()
`;

      try {
        this.process.stdin.write(script + '\n');
      } catch (error) {
        this._clearCurrentCommand();
        reject(error);
        return;
      }

      this.commandTimer = setTimeout(() => {
        if (this.currentCommand) {
          const error = new Error('PowerShell command timed out');
          this.currentCommand.reject(error);
          this._clearCurrentCommand();
        }
      }, timeout);
    });
  }

  dispose() {
    if (this.isDisposed) return;

    this.isDisposed = true;
    if (this.commandTimer) {
      clearTimeout(this.commandTimer);
      this.commandTimer = null;
    }

    try {
      this.process.stdin.end();
    } catch {}

    try {
      this.process.kill();
    } catch {}
  }
}

module.exports = {
  PowerShellSession,
  detectExecutable,
};
