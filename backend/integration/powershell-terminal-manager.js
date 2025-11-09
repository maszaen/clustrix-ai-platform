const { spawn } = require('child_process');
const path = require('path');
const { logWithContext } = require('../../utils/logger');

function log(func, message, details = {}) {
  logWithContext('TERMINAL_MANAGER', func, message, details);
}

class PowerShellTerminalManager {
  constructor(db) {
    this.db = db;
    this.terminals = new Map(); // Map<terminalId, { process, codeId, buffer }>

    // Start cleanup interval for idle terminals (check every 5 minutes)
    this.startCleanupInterval();

    log('constructor', 'PowerShell Terminal Manager initialized');
  }

  /**
   * Create a new PowerShell terminal for a code session
   */
  async createTerminal(codeId, workspacePath = null) {
    try {
      const terminalId = `term_${codeId}_${Date.now()}`;

      log('createTerminal', 'Creating PowerShell terminal', { terminalId, codeId, workspacePath });

      // Spawn PowerShell process
      const psProcess = spawn('powershell.exe', [
        '-NoProfile',
        '-NoLogo',
        '-NonInteractive',
        '-Command',
        '-'
      ], {
        cwd: workspacePath || process.cwd(),
        shell: false,
        windowsHide: true
      });

      // Store terminal info
      this.terminals.set(terminalId, {
        process: psProcess,
        codeId,
        workspacePath,
        buffer: '',
        isReady: true,
        lastActivity: Date.now()
      });

      // Save terminal to database
      await this.db.saveCodeTerminal({
        id: terminalId,
        code_id: codeId,
        pid: psProcess.pid,
        shell_type: 'powershell',
        created_at: Date.now(),
        last_active_at: Date.now(),
        status: 'active'
      });

      log('createTerminal', 'Terminal created successfully', { terminalId, pid: psProcess.pid });

      return {
        terminalId,
        pid: psProcess.pid,
        status: 'active'
      };
    } catch (error) {
      log('createTerminal', 'Failed to create terminal', { error: error.message, codeId });
      throw error;
    }
  }

  /**
   * Execute a PowerShell command in a terminal
   */
  async executeCommand(terminalId, command) {
    return new Promise((resolve, reject) => {
      const terminal = this.terminals.get(terminalId);

      if (!terminal) {
        return reject(new Error(`Terminal ${terminalId} not found`));
      }

      if (!terminal.isReady) {
        return reject(new Error(`Terminal ${terminalId} is busy`));
      }

      terminal.isReady = false;
      terminal.buffer = '';
      terminal.lastActivity = Date.now();

      // Update DB activity timestamp
      this.db.updateTerminalActivity(terminalId);

      log('executeCommand', 'Executing command', { terminalId, command: command.substring(0, 100) });

      // Timeout for command execution (2 minutes)
      const timeout = setTimeout(() => {
        terminal.isReady = true;
        reject(new Error('Command execution timeout (2 minutes)'));
      }, 120000);

      let outputBuffer = '';
      let errorBuffer = '';

      // Listen for stdout
      const onStdout = (data) => {
        outputBuffer += data.toString();
      };

      // Listen for stderr
      const onStderr = (data) => {
        errorBuffer += data.toString();
      };

      // Listen for process exit (if command causes shell to exit)
      const onExit = (code) => {
        clearTimeout(timeout);
        terminal.process.stdout.removeListener('data', onStdout);
        terminal.process.stderr.removeListener('data', onStderr);
        terminal.process.removeListener('exit', onExit);
        terminal.isReady = true;

        log('executeCommand', 'Terminal process exited', { terminalId, code });

        // Terminal closed unexpectedly
        this.closeTerminal(terminalId);
        reject(new Error(`Terminal process exited with code ${code}`));
      };

      terminal.process.stdout.on('data', onStdout);
      terminal.process.stderr.on('data', onStderr);
      terminal.process.once('exit', onExit);

      // Execute command with output delimiter
      const delimiter = `__CMD_END_${Date.now()}__`;
      const wrappedCommand = `
try {
  ${command}
} catch {
  Write-Error $_.Exception.Message
}
Write-Host "${delimiter}"
`;

      terminal.process.stdin.write(wrappedCommand + '\n');

      // Poll for delimiter in output
      const pollInterval = setInterval(() => {
        if (outputBuffer.includes(delimiter) || errorBuffer.includes(delimiter)) {
          clearInterval(pollInterval);
          clearTimeout(timeout);

          terminal.process.stdout.removeListener('data', onStdout);
          terminal.process.stderr.removeListener('data', onStderr);
          terminal.process.removeListener('exit', onExit);

          terminal.isReady = true;

          // Remove delimiter from output
          let finalOutput = outputBuffer.replace(delimiter, '').trim();
          let finalError = errorBuffer.trim();

          log('executeCommand', 'Command completed', {
            terminalId,
            outputLength: finalOutput.length,
            hasError: finalError.length > 0
          });

          resolve({
            stdout: finalOutput,
            stderr: finalError,
            exitCode: finalError.length > 0 ? 1 : 0
          });
        }
      }, 100);
    });
  }

  /**
   * Close a terminal
   */
  async closeTerminal(terminalId) {
    const terminal = this.terminals.get(terminalId);

    if (!terminal) {
      log('closeTerminal', 'Terminal not found', { terminalId });
      return;
    }

    log('closeTerminal', 'Closing terminal', { terminalId, codeId: terminal.codeId });

    try {
      // Kill the process
      terminal.process.kill();
    } catch (error) {
      log('closeTerminal', 'Error killing process', { terminalId, error: error.message });
    }

    // Remove from memory
    this.terminals.delete(terminalId);

    // Update database
    await this.db.closeTerminal(terminalId);

    log('closeTerminal', 'Terminal closed', { terminalId });
  }

  /**
   * Get terminal for a code session
   */
  getTerminalForCode(codeId) {
    for (const [terminalId, terminal] of this.terminals.entries()) {
      if (terminal.codeId === codeId) {
        return { terminalId, ...terminal };
      }
    }
    return null;
  }

  /**
   * Cleanup interval for idle terminals
   */
  startCleanupInterval() {
    setInterval(async () => {
      try {
        const inactiveTerminals = await this.db.getInactiveTerminals(30); // 30 minutes idle

        for (const terminal of inactiveTerminals) {
          log('cleanup', 'Closing inactive terminal', {
            terminalId: terminal.id,
            codeId: terminal.code_id,
            lastActive: new Date(terminal.last_active_at).toISOString()
          });

          await this.closeTerminal(terminal.id);
        }
      } catch (error) {
        log('cleanup', 'Error during cleanup', { error: error.message });
      }
    }, 5 * 60 * 1000); // Run every 5 minutes
  }

  /**
   * Close all terminals (on app shutdown)
   */
  async closeAllTerminals() {
    log('closeAllTerminals', 'Closing all terminals', { count: this.terminals.size });

    const promises = [];
    for (const terminalId of this.terminals.keys()) {
      promises.push(this.closeTerminal(terminalId));
    }

    await Promise.all(promises);
    log('closeAllTerminals', 'All terminals closed');
  }
}

module.exports = PowerShellTerminalManager;
