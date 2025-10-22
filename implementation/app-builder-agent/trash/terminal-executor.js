const { spawn } = require('child_process');
const { app } = require('electron');
const path = require('path');
const { log } = require('../../../utils/logger');

class TerminalExecutor {
  constructor() {
    this.activeProcesses = new Map();
    this.maxConcurrent = 5;
    this.defaultTimeout = 60000; // 60 seconds
    
    // Command whitelist - only these base commands are allowed
    this.safeCommands = [
      'npm', 'yarn', 'pnpm',
      'node', 'python', 'python3',
      'git',
      'mkdir', 'touch',
      'echo', 'cat', 'type', 'head', 'tail',
      'grep', 'find',
      'cd', 'pwd', 'ls', 'dir'
    ];
    
    // Patterns that require user approval
    this.recursivePatterns = [
      /-r\b/,           // -r flag
      /-R\b/,           // -R flag
      /-rf\b/,          // -rf combination
      /--recursive/,    // --recursive flag
      /\*\*/,           // ** glob pattern
      /\*\.\*/          // *.* wildcard
    ];
    
    // Absolutely blocked commands - never allowed
    this.blockedPatterns = [
      /rm\s+-rf\s+\//,              // rm -rf /
      /rmdir\s+\/s/i,               // Windows rmdir /s
      /del\s+\/[fs]/i,              // Windows del /f or /s
      /format\s+[a-z]:/i,           // format drive
      /mkfs\./,                     // make filesystem
      /dd\s+if=/,                   // disk dump
      /sudo|su\s/,                  // privilege escalation
      /curl.*\|\s*bash/,            // pipe to bash
      /wget.*\|\s*sh/,              // pipe to shell
      /chmod\s+777/,                // dangerous permissions
      />\/dev\/sd/                  // write to disk device
    ];
  }

  /**
   * Execute a command safely
   * @param {string} command - Command to execute
   * @param {Object} options - Execution options
   * @returns {Promise<Object>} Execution result
   */
  async execute(command, options = {}) {
    const {
      cwd = process.cwd(),
      timeout = this.defaultTimeout,
      env = {},
      streamToRenderer = false,
      rendererEvent = null
    } = options;

    // Validate command first
    const validation = this.validateCommand(command);
    if (validation.blocked) {
      throw new Error(`Blocked: ${validation.reason}`);
    }
    if (validation.requiresApproval) {
      return {
        requiresApproval: true,
        command,
        reason: validation.reason
      };
    }

    // Check concurrent limit
    if (this.activeProcesses.size >= this.maxConcurrent) {
      throw new Error(`Max concurrent processes (${this.maxConcurrent}) reached`);
    }

    const processId = `proc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    log('TERMINAL', 1, 'execute', `Starting: ${command}`, { processId });

    return new Promise((resolve, reject) => {
      const outputBuffer = [];
      const errorBuffer = [];
      const startTime = Date.now();

      const childProcess = spawn(command, {
        cwd,
        shell: true,
        env: { ...process.env, ...env },
        timeout
      });

      this.activeProcesses.set(processId, {
        process: childProcess,
        command,
        startTime
      });

      childProcess.stdout.on('data', (data) => {
        const chunk = data.toString();
        outputBuffer.push(chunk);

        if (streamToRenderer && rendererEvent) {
          rendererEvent.sender.send('terminal:output', {
            processId,
            type: 'stdout',
            data: chunk
          });
        }
      });

      childProcess.stderr.on('data', (data) => {
        const chunk = data.toString();
        errorBuffer.push(chunk);

        if (streamToRenderer && rendererEvent) {
          rendererEvent.sender.send('terminal:output', {
            processId,
            type: 'stderr',
            data: chunk
          });
        }
      });

      childProcess.on('close', (code) => {
        this.activeProcesses.delete(processId);

        const result = {
          processId,
          command,
          exitCode: code,
          stdout: outputBuffer.join(''),
          stderr: errorBuffer.join(''),
          success: code === 0,
          duration: Date.now() - startTime
        };

        log('TERMINAL', 1, 'execute', `Complete: exit ${code}`, {
          processId,
          duration: result.duration
        });

        if (streamToRenderer && rendererEvent) {
          rendererEvent.sender.send('terminal:complete', result);
        }

        resolve(result);
      });

      childProcess.on('error', (error) => {
        this.activeProcesses.delete(processId);
        log('TERMINAL', 3, 'execute', `Error: ${error.message}`, { processId });
        reject(error);
      });

      // Timeout handler
      setTimeout(() => {
        if (this.activeProcesses.has(processId)) {
          childProcess.kill('SIGTERM');
          this.activeProcesses.delete(processId);
          reject(new Error(`Command timeout after ${timeout}ms`));
        }
      }, timeout);
    });
  }

  /**
   * Validate command safety
   * @param {string} command - Command to validate
   * @returns {Object} Validation result
   */
  validateCommand(command) {
    // Check blocked patterns first (highest priority)
    for (const pattern of this.blockedPatterns) {
      if (pattern.test(command)) {
        return {
          blocked: true,
          reason: `Matches dangerous pattern: ${pattern}`
        };
      }
    }

    // Extract base command (first word)
    const baseCommand = command.trim().split(/\s+/)[0];
    
    // Check if base command is whitelisted
    const isWhitelisted = this.safeCommands.some(safe => 
      baseCommand === safe || 
      baseCommand.endsWith(`/${safe}`) || 
      baseCommand.endsWith(`\\${safe}`)
    );

    if (!isWhitelisted) {
      return {
        blocked: true,
        reason: `Command not whitelisted: ${baseCommand}`
      };
    }

    // Check if requires approval (recursive patterns)
    for (const pattern of this.recursivePatterns) {
      if (pattern.test(command)) {
        return {
          requiresApproval: true,
          reason: 'Command contains recursive flags'
        };
      }
    }

    return { safe: true };
  }

  /**
   * Check if command requires user approval
   * @param {string} command - Command to check
   * @returns {boolean} True if requires approval
   */
  requiresApproval(command) {
    const validation = this.validateCommand(command);
    return validation.requiresApproval === true;
  }

  /**
   * Kill a specific process
   * @param {string} processId - Process ID to kill
   */
  kill(processId) {
    const info = this.activeProcesses.get(processId);
    if (info) {
      info.process.kill('SIGTERM');
      this.activeProcesses.delete(processId);
      log('TERMINAL', 2, 'kill', `Killed process ${processId}`);
    }
  }

  /**
   * Kill all active processes
   */
  killAll() {
    for (const [processId, info] of this.activeProcesses.entries()) {
      info.process.kill('SIGTERM');
    }
    this.activeProcesses.clear();
    log('TERMINAL', 2, 'killAll', 'Killed all active processes');
  }

  /**
   * Get list of active processes
   * @returns {Array} Active process info
   */
  getActiveProcesses() {
    const processes = [];
    for (const [processId, info] of this.activeProcesses.entries()) {
      processes.push({
        processId,
        command: info.command,
        startTime: info.startTime,
        duration: Date.now() - info.startTime
      });
    }
    return processes;
  }
}

module.exports = TerminalExecutor;
