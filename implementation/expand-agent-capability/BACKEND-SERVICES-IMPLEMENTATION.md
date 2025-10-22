# 🛠️ Technical Implementation Details
## Backend Services Architecture

---

## 1. Terminal Executor Service

### File: `backend/terminal-executor.js`

```javascript
const { spawn } = require('child_process');
const { app } = require('electron');
const path = require('path');
const { log } = require('../utils/logger');

class TerminalExecutor {
  constructor() {
    this.activeProcesses = new Map();
    this.outputBuffers = new Map();
    this.processCounter = 0;
    this.maxConcurrentProcesses = 5;
    this.defaultTimeout = 60000; // 60 seconds
  }

  /**
   * Execute a shell command in a sandboxed environment
   * @param {string} command - Command to execute
   * @param {Object} options - Execution options
   * @returns {Promise<Object>} Execution result
   */
  async executeCommand(command, options = {}) {
    const {
      workingDir = app.getPath('userData'),
      timeout = this.defaultTimeout,
      env = {},
      onOutput = null,
      streamToRenderer = false,
      rendererEvent = null
    } = options;

    // Validate command safety
    const validation = this.validateCommand(command);
    if (!validation.safe) {
      throw new Error(`Unsafe command: ${validation.reason}`);
    }

    // Check concurrent process limit
    if (this.activeProcesses.size >= this.maxConcurrentProcesses) {
      throw new Error('Too many concurrent processes');
    }

    const processId = `proc_${++this.processCounter}_${Date.now()}`;
    log('TERMINAL', 1, 'executeCommand', `Starting process ${processId}: ${command}`);

    return new Promise((resolve, reject) => {
      const outputBuffer = [];
      const errorBuffer = [];

      // Spawn process
      const childProcess = spawn(command, {
        cwd: workingDir,
        shell: true,
        env: { ...process.env, ...env },
        timeout
      });

      // Track active process
      this.activeProcesses.set(processId, {
        process: childProcess,
        command,
        startTime: Date.now(),
        workingDir
      });

      // Handle stdout
      childProcess.stdout.on('data', (data) => {
        const chunk = data.toString();
        outputBuffer.push(chunk);

        // Stream to renderer if requested
        if (streamToRenderer && rendererEvent) {
          rendererEvent.sender.send('terminal:output', {
            processId,
            type: 'stdout',
            data: chunk
          });
        }

        // Custom output handler
        if (onOutput) {
          onOutput({ type: 'stdout', data: chunk });
        }
      });

      // Handle stderr
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

        if (onOutput) {
          onOutput({ type: 'stderr', data: chunk });
        }
      });

      // Handle completion
      childProcess.on('close', (code) => {
        this.activeProcesses.delete(processId);

        const result = {
          processId,
          command,
          exitCode: code,
          stdout: outputBuffer.join(''),
          stderr: errorBuffer.join(''),
          success: code === 0,
          duration: Date.now() - this.activeProcesses.get(processId)?.startTime || 0
        };

        log('TERMINAL', 1, 'executeCommand', `Process ${processId} completed`, {
          exitCode: code,
          duration: result.duration
        });

        if (streamToRenderer && rendererEvent) {
          rendererEvent.sender.send('terminal:complete', result);
        }

        resolve(result);
      });

      // Handle errors
      childProcess.on('error', (error) => {
        this.activeProcesses.delete(processId);
        log('TERMINAL', 3, 'executeCommand', `Process ${processId} error: ${error.message}`);
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
   * Run tests and parse output
   * @param {string} testCommand - Test command (jest, mocha, pytest, etc.)
   * @param {Object} options - Execution options
   * @returns {Promise<Object>} Test results
   */
  async runTests(testCommand, options = {}) {
    log('TERMINAL', 1, 'runTests', `Running tests: ${testCommand}`);

    const result = await this.executeCommand(testCommand, {
      ...options,
      onOutput: (output) => {
        // Parse test output in real-time
        const parsed = this.parseTestOutput(output.data);
        if (parsed && options.onTestUpdate) {
          options.onTestUpdate(parsed);
        }
      }
    });

    // Parse final test results
    const testResults = this.parseTestResults(result.stdout, testCommand);

    return {
      ...result,
      tests: testResults
    };
  }

  /**
   * Install npm/yarn/pnpm packages
   * @param {Array<string>} packages - Package names
   * @param {Object} options - Installation options
   * @returns {Promise<Object>} Installation result
   */
  async installPackages(packages, options = {}) {
    const {
      packageManager = 'npm', // npm, yarn, pnpm
      dev = false,
      workingDir
    } = options;

    const installFlag = {
      npm: dev ? 'install --save-dev' : 'install',
      yarn: dev ? 'add -D' : 'add',
      pnpm: dev ? 'add -D' : 'add'
    }[packageManager];

    const command = `${packageManager} ${installFlag} ${packages.join(' ')}`;

    log('TERMINAL', 1, 'installPackages', `Installing: ${packages.join(', ')}`);

    return await this.executeCommand(command, {
      workingDir,
      timeout: 300000, // 5 minutes for package installation
      streamToRenderer: options.streamToRenderer,
      rendererEvent: options.rendererEvent
    });
  }

  /**
   * Validate command safety
   * @param {string} command - Command to validate
   * @returns {Object} Validation result
   */
  validateCommand(command) {
    // Dangerous patterns
    const dangerousPatterns = [
      /rm\s+-rf\s+\//, // rm -rf /
      /rmdir\s+\/s/, // Windows rmdir /s
      /del\s+\/[fs]/, // Windows del /f or /s
      /format\s+[a-z]:/, // format drive
      /mkfs\./, // make filesystem
      /dd\s+if=/, // disk dump
      /chmod\s+777/, // dangerous permissions
      /sudo\s+/, // privilege escalation
      />\/dev\/sd/, // write to disk device
      /curl.*\|\s*bash/, // pipe to bash (security risk)
      /wget.*\|\s*sh/, // pipe to shell
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(command)) {
        return {
          safe: false,
          reason: `Matches dangerous pattern: ${pattern}`
        };
      }
    }

    // Check for allowed commands
    const baseCommand = command.trim().split(/\s+/)[0];
    const allowedCommands = [
      'npm', 'yarn', 'pnpm', 'node', 'python', 'python3',
      'git', 'gh', 'jest', 'mocha', 'vitest', 'pytest',
      'tsc', 'eslint', 'prettier', 'ls', 'dir', 'cat',
      'type', 'echo', 'mkdir', 'cd'
    ];

    const isAllowed = allowedCommands.some(cmd => 
      baseCommand === cmd || baseCommand.endsWith(`/${cmd}`) || baseCommand.endsWith(`\\${cmd}`)
    );

    if (!isAllowed) {
      return {
        safe: false,
        reason: `Command not in whitelist: ${baseCommand}`
      };
    }

    return { safe: true };
  }

  /**
   * Parse test output (real-time)
   * @param {string} output - Test output chunk
   * @returns {Object|null} Parsed test info
   */
  parseTestOutput(output) {
    // Jest/Mocha patterns
    const patterns = {
      testStart: /PASS|FAIL|RUNS/,
      testPass: /✓|✔|PASS/,
      testFail: /✗|✕|FAIL/,
      testCount: /(\d+)\s+passed/,
      errorLine: /Error:|Failed:/
    };

    if (patterns.testStart.test(output)) {
      return { type: 'test-start', line: output.trim() };
    }
    if (patterns.testPass.test(output)) {
      return { type: 'test-pass', line: output.trim() };
    }
    if (patterns.testFail.test(output)) {
      return { type: 'test-fail', line: output.trim() };
    }

    return null;
  }

  /**
   * Parse final test results
   * @param {string} output - Complete test output
   * @param {string} testCommand - Test command used
   * @returns {Object} Test results summary
   */
  parseTestResults(output, testCommand) {
    const results = {
      framework: this.detectTestFramework(testCommand),
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      duration: 0
    };

    // Jest pattern
    const jestMatch = output.match(/Tests:\s+(\d+)\s+passed,\s+(\d+)\s+total/);
    if (jestMatch) {
      results.passed = parseInt(jestMatch[1]);
      results.total = parseInt(jestMatch[2]);
      results.failed = results.total - results.passed;
    }

    // Mocha pattern
    const mochaMatch = output.match(/(\d+)\s+passing.*?(\d+)\s+failing/);
    if (mochaMatch) {
      results.passed = parseInt(mochaMatch[1]);
      results.failed = parseInt(mochaMatch[2]);
      results.total = results.passed + results.failed;
    }

    // Pytest pattern
    const pytestMatch = output.match(/(\d+)\s+passed.*?(\d+)\s+failed/);
    if (pytestMatch) {
      results.passed = parseInt(pytestMatch[1]);
      results.failed = parseInt(pytestMatch[2]);
      results.total = results.passed + results.failed;
    }

    // Extract duration
    const durationMatch = output.match(/Time:\s+([\d.]+)\s*s/);
    if (durationMatch) {
      results.duration = parseFloat(durationMatch[1]);
    }

    return results;
  }

  /**
   * Detect test framework from command
   * @param {string} command - Test command
   * @returns {string} Framework name
   */
  detectTestFramework(command) {
    if (command.includes('jest')) return 'jest';
    if (command.includes('mocha')) return 'mocha';
    if (command.includes('vitest')) return 'vitest';
    if (command.includes('pytest')) return 'pytest';
    return 'unknown';
  }

  /**
   * Kill a running process
   * @param {string} processId - Process ID to kill
   */
  killProcess(processId) {
    const processInfo = this.activeProcesses.get(processId);
    if (processInfo) {
      processInfo.process.kill('SIGTERM');
      this.activeProcesses.delete(processId);
      log('TERMINAL', 2, 'killProcess', `Killed process ${processId}`);
    }
  }

  /**
   * Kill all active processes
   */
  killAllProcesses() {
    for (const [processId, info] of this.activeProcesses.entries()) {
      info.process.kill('SIGTERM');
      log('TERMINAL', 2, 'killAllProcesses', `Killed process ${processId}`);
    }
    this.activeProcesses.clear();
  }

  /**
   * Get status of all active processes
   * @returns {Array<Object>} Process statuses
   */
  getActiveProcesses() {
    return Array.from(this.activeProcesses.entries()).map(([id, info]) => ({
      processId: id,
      command: info.command,
      startTime: info.startTime,
      duration: Date.now() - info.startTime,
      workingDir: info.workingDir
    }));
  }
}

module.exports = TerminalExecutor;
```

---

## 2. File Operations Manager

### File: `backend/file-operations-manager.js`

```javascript
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const { app } = require('electron');
const { log } = require('../utils/logger');

class FileOperationsManager {
  constructor() {
    this.workspaceRoot = null;
    this.fileHistory = [];
    this.virtualEnv = new Map();
    this.backupDir = path.join(app.getPath('userData'), 'file-backups');
    this.maxHistorySize = 100;
    
    // Ensure backup directory exists
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  /**
   * Set workspace root directory
   * @param {string} rootPath - Workspace root path
   */
  setWorkspaceRoot(rootPath) {
    if (!fs.existsSync(rootPath)) {
      throw new Error(`Workspace path does not exist: ${rootPath}`);
    }
    
    this.workspaceRoot = path.resolve(rootPath);
    log('FILE_OPS', 1, 'setWorkspaceRoot', `Workspace set to: ${this.workspaceRoot}`);
  }

  /**
   * Resolve relative path to absolute path
   * @param {string} relativePath - Relative path from workspace root
   * @returns {string} Absolute path
   */
  resolvePath(relativePath) {
    if (!this.workspaceRoot) {
      throw new Error('Workspace root not set');
    }
    
    const resolved = path.resolve(this.workspaceRoot, relativePath);
    
    // Security check: ensure path is within workspace
    if (!resolved.startsWith(this.workspaceRoot)) {
      throw new Error('Path outside workspace boundary');
    }
    
    return resolved;
  }

  /**
   * Create a new file
   * @param {string} relativePath - File path relative to workspace
   * @param {string} content - File content
   * @param {Object} options - Creation options
   * @returns {Promise<Object>} Creation result
   */
  async createFile(relativePath, content, options = {}) {
    const {
      overwrite = false,
      createDirs = true,
      encoding = 'utf-8'
    } = options;

    const fullPath = this.resolvePath(relativePath);
    
    log('FILE_OPS', 1, 'createFile', `Creating file: ${relativePath}`);

    // Check if file exists
    if (fs.existsSync(fullPath) && !overwrite) {
      throw new Error(`File already exists: ${relativePath}`);
    }

    // Create backup if overwriting
    if (fs.existsSync(fullPath)) {
      await this.createBackup(fullPath);
    }

    // Create directories
    if (createDirs) {
      const dir = path.dirname(fullPath);
      await fsp.mkdir(dir, { recursive: true });
    }

    // Write file
    await fsp.writeFile(fullPath, content, encoding);

    // Track in history
    this.addToHistory({
      action: 'create',
      path: relativePath,
      fullPath,
      timestamp: Date.now(),
      contentLength: content.length
    });

    return {
      success: true,
      path: relativePath,
      fullPath,
      size: Buffer.byteLength(content, encoding)
    };
  }

  /**
   * Edit an existing file
   * @param {string} relativePath - File path relative to workspace
   * @param {Object} changes - Changes to apply
   * @returns {Promise<Object>} Edit result
   */
  async editFile(relativePath, changes) {
    const fullPath = this.resolvePath(relativePath);

    if (!fs.existsSync(fullPath)) {
      throw new Error(`File does not exist: ${relativePath}`);
    }

    log('FILE_OPS', 1, 'editFile', `Editing file: ${relativePath}`);

    // Create backup
    const backupPath = await this.createBackup(fullPath);

    // Read original content
    const originalContent = await fsp.readFile(fullPath, 'utf-8');

    // Apply changes
    let newContent;
    if (changes.type === 'full-replace') {
      newContent = changes.content;
    } else if (changes.type === 'line-replace') {
      newContent = this.applyLineChanges(originalContent, changes);
    } else if (changes.type === 'diff-patch') {
      newContent = this.applyDiffPatch(originalContent, changes);
    } else {
      throw new Error(`Unknown edit type: ${changes.type}`);
    }

    // Write new content
    await fsp.writeFile(fullPath, newContent, 'utf-8');

    // Track in history
    this.addToHistory({
      action: 'edit',
      path: relativePath,
      fullPath,
      backupPath,
      timestamp: Date.now(),
      changeType: changes.type
    });

    return {
      success: true,
      path: relativePath,
      fullPath,
      backupPath,
      diff: this.createDiff(originalContent, newContent)
    };
  }

  /**
   * Delete a file (move to trash)
   * @param {string} relativePath - File path relative to workspace
   * @returns {Promise<Object>} Deletion result
   */
  async deleteFile(relativePath) {
    const fullPath = this.resolvePath(relativePath);

    if (!fs.existsSync(fullPath)) {
      throw new Error(`File does not exist: ${relativePath}`);
    }

    log('FILE_OPS', 1, 'deleteFile', `Deleting file: ${relativePath}`);

    // Move to trash directory
    const trashDir = path.join(this.backupDir, 'trash');
    await fsp.mkdir(trashDir, { recursive: true });

    const timestamp = Date.now();
    const trashPath = path.join(
      trashDir,
      `${timestamp}_${path.basename(fullPath)}`
    );

    await fsp.rename(fullPath, trashPath);

    // Track in history
    this.addToHistory({
      action: 'delete',
      path: relativePath,
      fullPath,
      trashPath,
      timestamp
    });

    return {
      success: true,
      path: relativePath,
      trashPath,
      recoverable: true
    };
  }

  /**
   * Create backup of a file
   * @param {string} fullPath - Full path to file
   * @returns {Promise<string>} Backup file path
   */
  async createBackup(fullPath) {
    const timestamp = Date.now();
    const fileName = path.basename(fullPath);
    const backupPath = path.join(
      this.backupDir,
      `${timestamp}_${fileName}`
    );

    await fsp.copyFile(fullPath, backupPath);

    log('FILE_OPS', 1, 'createBackup', `Created backup: ${backupPath}`);

    return backupPath;
  }

  /**
   * Apply line-based changes
   * @param {string} content - Original content
   * @param {Object} changes - Line changes
   * @returns {string} New content
   */
  applyLineChanges(content, changes) {
    const lines = content.split('\n');
    const { startLine, endLine, newLines } = changes;

    // Validate line numbers
    if (startLine < 1 || startLine > lines.length) {
      throw new Error(`Invalid start line: ${startLine}`);
    }

    // Replace lines (1-indexed)
    const before = lines.slice(0, startLine - 1);
    const after = lines.slice(endLine || startLine);
    const replacement = Array.isArray(newLines) ? newLines : [newLines];

    return [...before, ...replacement, ...after].join('\n');
  }

  /**
   * Apply diff-style patch
   * @param {string} content - Original content
   * @param {Object} changes - Diff changes
   * @returns {string} New content
   */
  applyDiffPatch(content, changes) {
    // Simple find-replace patch
    const { find, replace } = changes;

    if (!content.includes(find)) {
      throw new Error('Patch target not found in file');
    }

    return content.replace(find, replace);
  }

  /**
   * Create diff between two contents
   * @param {string} oldContent - Original content
   * @param {string} newContent - New content
   * @returns {Object} Diff summary
   */
  createDiff(oldContent, newContent) {
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');

    const added = newLines.length - oldLines.length;
    const changed = oldLines.filter((line, i) => line !== newLines[i]).length;

    return {
      linesAdded: Math.max(0, added),
      linesRemoved: Math.max(0, -added),
      linesChanged: changed,
      totalLines: newLines.length
    };
  }

  /**
   * Stage file in virtual environment
   * @param {string} relativePath - File path
   * @param {string} content - File content
   * @param {string} action - Action type (create/edit/delete)
   */
  stageFile(relativePath, content, action = 'create') {
    this.virtualEnv.set(relativePath, {
      content,
      action,
      staged: true,
      timestamp: Date.now()
    });

    log('FILE_OPS', 1, 'stageFile', `Staged ${action}: ${relativePath}`);
  }

  /**
   * Commit all staged files
   * @returns {Promise<Array<Object>>} Commit results
   */
  async commitStagedFiles() {
    const results = [];

    for (const [relativePath, data] of this.virtualEnv.entries()) {
      if (!data.staged) continue;

      try {
        let result;
        if (data.action === 'create' || data.action === 'edit') {
          result = await this.createFile(relativePath, data.content, {
            overwrite: data.action === 'edit'
          });
        } else if (data.action === 'delete') {
          result = await this.deleteFile(relativePath);
        }

        results.push({
          path: relativePath,
          action: data.action,
          success: true,
          result
        });
      } catch (error) {
        results.push({
          path: relativePath,
          action: data.action,
          success: false,
          error: error.message
        });
      }
    }

    // Clear staged files
    this.virtualEnv.clear();

    log('FILE_OPS', 1, 'commitStagedFiles', `Committed ${results.length} files`);

    return results;
  }

  /**
   * Rollback last N operations
   * @param {number} steps - Number of steps to rollback
   * @returns {Promise<Array<Object>>} Rollback results
   */
  async rollback(steps = 1) {
    const operations = this.fileHistory.slice(-steps);
    const results = [];

    for (const op of operations.reverse()) {
      try {
        if (op.action === 'create' || op.action === 'edit') {
          // Restore from backup
          if (op.backupPath && fs.existsSync(op.backupPath)) {
            await fsp.copyFile(op.backupPath, op.fullPath);
            results.push({ operation: op, success: true, action: 'restored' });
          } else if (op.action === 'create') {
            // Delete created file
            await fsp.unlink(op.fullPath);
            results.push({ operation: op, success: true, action: 'deleted' });
          }
        } else if (op.action === 'delete') {
          // Restore from trash
          if (op.trashPath && fs.existsSync(op.trashPath)) {
            await fsp.rename(op.trashPath, op.fullPath);
            results.push({ operation: op, success: true, action: 'recovered' });
          }
        }
      } catch (error) {
        results.push({
          operation: op,
          success: false,
          error: error.message
        });
      }
    }

    // Remove rolled-back operations from history
    this.fileHistory = this.fileHistory.slice(0, -steps);

    log('FILE_OPS', 1, 'rollback', `Rolled back ${steps} operations`);

    return results;
  }

  /**
   * Add operation to history
   * @param {Object} operation - Operation details
   */
  addToHistory(operation) {
    this.fileHistory.push(operation);

    // Trim history if too large
    if (this.fileHistory.length > this.maxHistorySize) {
      this.fileHistory = this.fileHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * Get file operation history
   * @param {number} limit - Number of recent operations
   * @returns {Array<Object>} Operation history
   */
  getHistory(limit = 10) {
    return this.fileHistory.slice(-limit);
  }

  /**
   * Get staged files
   * @returns {Array<Object>} Staged files
   */
  getStagedFiles() {
    return Array.from(this.virtualEnv.entries()).map(([path, data]) => ({
      path,
      action: data.action,
      contentLength: data.content?.length || 0,
      timestamp: data.timestamp
    }));
  }

  /**
   * Clear staged files
   */
  clearStaged() {
    this.virtualEnv.clear();
    log('FILE_OPS', 1, 'clearStaged', 'Cleared all staged files');
  }
}

module.exports = FileOperationsManager;
```

---

## 3. Integration into Main Process

### File: `main.js` (additions)

```javascript
// Add to top of file with other requires
const TerminalExecutor = require('./backend/terminal-executor');
const FileOperationsManager = require('./backend/file-operations-manager');

// Add after other service initializations
let terminalExecutor = null;
let fileOpsManager = null;

// Initialize in app.whenReady()
app.whenReady().then(() => {
  // ... existing code ...
  
  // Initialize agent services
  terminalExecutor = new TerminalExecutor();
  fileOpsManager = new FileOperationsManager();
  
  log('MAIN', 1, 'app.whenReady', 'Agent services initialized');
  
  // ... rest of existing code ...
});

// Add new IPC handlers (before app.whenReady)

// ============================================================
// AGENT OPERATIONS - Terminal Execution
// ============================================================

ipcMain.handle('agent:executeCommand', async (event, { command, options = {} }) => {
  try {
    log('AGENT', 1, 'executeCommand', `Command: ${command}`);
    
    const result = await terminalExecutor.executeCommand(command, {
      ...options,
      streamToRenderer: true,
      rendererEvent: event
    });
    
    return result;
  } catch (error) {
    log('AGENT', 3, 'executeCommand', `Error: ${error.message}`);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('agent:runTests', async (event, { testCommand, options = {} }) => {
  try {
    log('AGENT', 1, 'runTests', `Test command: ${testCommand}`);
    
    const result = await terminalExecutor.runTests(testCommand, {
      ...options,
      streamToRenderer: true,
      rendererEvent: event
    });
    
    return result;
  } catch (error) {
    log('AGENT', 3, 'runTests', `Error: ${error.message}`);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('agent:installPackages', async (event, { packages, options = {} }) => {
  try {
    log('AGENT', 1, 'installPackages', `Packages: ${packages.join(', ')}`);
    
    const result = await terminalExecutor.installPackages(packages, {
      ...options,
      streamToRenderer: true,
      rendererEvent: event
    });
    
    return result;
  } catch (error) {
    log('AGENT', 3, 'installPackages', `Error: ${error.message}`);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('agent:killProcess', async (_event, { processId }) => {
  try {
    terminalExecutor.killProcess(processId);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('agent:getActiveProcesses', async () => {
  return terminalExecutor.getActiveProcesses();
});

// ============================================================
// AGENT OPERATIONS - File Management
// ============================================================

ipcMain.handle('agent:setWorkspace', async (_event, { rootPath }) => {
  try {
    fileOpsManager.setWorkspaceRoot(rootPath);
    return { success: true, workspace: rootPath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('agent:createFile', async (_event, { path, content, options }) => {
  try {
    const result = await fileOpsManager.createFile(path, content, options);
    return result;
  } catch (error) {
    log('AGENT', 3, 'createFile', `Error: ${error.message}`);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('agent:editFile', async (_event, { path, changes }) => {
  try {
    const result = await fileOpsManager.editFile(path, changes);
    return result;
  } catch (error) {
    log('AGENT', 3, 'editFile', `Error: ${error.message}`);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('agent:deleteFile', async (_event, { path }) => {
  try {
    const result = await fileOpsManager.deleteFile(path);
    return result;
  } catch (error) {
    log('AGENT', 3, 'deleteFile', `Error: ${error.message}`);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('agent:stageFile', async (_event, { path, content, action }) => {
  try {
    fileOpsManager.stageFile(path, content, action);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('agent:commitStaged', async () => {
  try {
    const results = await fileOpsManager.commitStagedFiles();
    return { success: true, results };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('agent:rollback', async (_event, { steps = 1 }) => {
  try {
    const results = await fileOpsManager.rollback(steps);
    return { success: true, results };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('agent:getHistory', async (_event, { limit = 10 }) => {
  return fileOpsManager.getHistory(limit);
});

ipcMain.handle('agent:getStagedFiles', async () => {
  return fileOpsManager.getStagedFiles();
});

ipcMain.handle('agent:clearStaged', async () => {
  fileOpsManager.clearStaged();
  return { success: true };
});

// ============================================================
// AGENT OPERATIONS - Apply Patch (High-Level)
// ============================================================

ipcMain.handle('agent:applyPatch', async (event, { patchId, operations, sessionId }) => {
  try {
    log('AGENT', 1, 'applyPatch', `Applying patch ${patchId} with ${operations.length} operations`);
    
    const results = [];
    
    for (const op of operations) {
      if (op.action === 'create' || op.action === 'edit') {
        // For now, we need the AI to provide content
        // In real implementation, AI would send full content in patch
        results.push({
          operation: op,
          success: false,
          error: 'Content generation not implemented - AI must provide full file content in patch'
        });
      } else if (op.action === 'delete') {
        const result = await fileOpsManager.deleteFile(op.path);
        results.push({
          operation: op,
          ...result
        });
      }
    }
    
    return {
      success: true,
      patchId,
      results,
      filesChanged: results.filter(r => r.success).length
    };
    
  } catch (error) {
    log('AGENT', 3, 'applyPatch', `Error: ${error.message}`);
    return { success: false, error: error.message };
  }
});
```

---

## Next Steps

1. **Test Terminal Executor** - Create unit tests for command execution
2. **Test File Operations** - Verify create/edit/delete/rollback
3. **Build UI Components** - Terminal output display, file diff viewer
4. **Integrate with Agent** - Connect to existing reasoning agent
5. **Security Audit** - Thorough review of sandbox implementation

