# 🔧 Technical Specification - App Builder Agent
## Detailed Implementation Reference

---

## 1. Terminal Executor (Safe Command Execution)

### File: `backend/terminal-executor.js`

```javascript
const { spawn } = require('child_process');
const { app } = require('electron');
const path = require('path');
const { log } = require('../utils/logger');

class TerminalExecutor {
  constructor() {
    this.activeProcesses = new Map();
    this.maxConcurrent = 5;
    this.defaultTimeout = 60000; // 60 seconds
    
    // Command whitelist
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
    
    // Absolutely blocked commands
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
   */
  async execute(command, options = {}) {
    const {
      cwd = process.cwd(),
      timeout = this.defaultTimeout,
      env = {},
      streamToRenderer = false,
      rendererEvent = null
    } = options;

    // Validate command
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
   */
  validateCommand(command) {
    // Check blocked patterns first
    for (const pattern of this.blockedPatterns) {
      if (pattern.test(command)) {
        return {
          blocked: true,
          reason: `Matches dangerous pattern: ${pattern}`
        };
      }
    }

    // Check if base command is whitelisted
    const baseCommand = command.trim().split(/\s+/)[0];
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

  requiresApproval(command) {
    const validation = this.validateCommand(command);
    return validation.requiresApproval === true;
  }

  kill(processId) {
    const info = this.activeProcesses.get(processId);
    if (info) {
      info.process.kill('SIGTERM');
      this.activeProcesses.delete(processId);
      log('TERMINAL', 2, 'kill', `Killed process ${processId}`);
    }
  }

  killAll() {
    for (const [processId, info] of this.activeProcesses.entries()) {
      info.process.kill('SIGTERM');
    }
    this.activeProcesses.clear();
    log('TERMINAL', 2, 'killAll', 'Killed all active processes');
  }
}

module.exports = TerminalExecutor;
```

---

## 2. File Operations Manager (Efficient File Handling)

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
    this.backupDir = path.join(app.getPath('userData'), 'backups');
    
    // Ensure backup dir exists
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  setWorkspaceRoot(rootPath) {
    if (!fs.existsSync(rootPath)) {
      throw new Error(`Workspace does not exist: ${rootPath}`);
    }
    this.workspaceRoot = path.resolve(rootPath);
    log('FILE_OPS', 1, 'setWorkspace', `Workspace: ${this.workspaceRoot}`);
  }

  resolvePath(relativePath) {
    if (!this.workspaceRoot) {
      throw new Error('Workspace not set');
    }
    
    const resolved = path.resolve(this.workspaceRoot, relativePath);
    
    // Security: ensure path is within workspace
    if (!resolved.startsWith(this.workspaceRoot)) {
      throw new Error('Path outside workspace');
    }
    
    return resolved;
  }

  /**
   * Create a file with content
   */
  async createFile(relativePath, content, options = {}) {
    const fullPath = this.resolvePath(relativePath);
    
    log('FILE_OPS', 1, 'createFile', `Creating: ${relativePath}`);

    // Check if exists
    if (fs.existsSync(fullPath) && !options.overwrite) {
      throw new Error(`File exists: ${relativePath}`);
    }

    // Create backup if overwriting
    if (fs.existsSync(fullPath)) {
      await this.createBackup(fullPath);
    }

    // Create directories
    const dir = path.dirname(fullPath);
    await fsp.mkdir(dir, { recursive: true });

    // Write file
    await fsp.writeFile(fullPath, content, 'utf-8');

    return {
      success: true,
      path: relativePath,
      size: Buffer.byteLength(content, 'utf-8')
    };
  }

  /**
   * Read specific lines from file (efficient)
   */
  async readLines(relativePath, startLine, endLine) {
    const fullPath = this.resolvePath(relativePath);

    if (!fs.existsSync(fullPath)) {
      throw new Error(`File not found: ${relativePath}`);
    }

    const content = await fsp.readFile(fullPath, 'utf-8');
    const lines = content.split('\n');

    // Validate line numbers (1-indexed)
    if (startLine < 1 || startLine > lines.length) {
      throw new Error(`Invalid start line: ${startLine}`);
    }

    const start = startLine - 1;
    const end = endLine ? Math.min(endLine, lines.length) : lines.length;

    return lines.slice(start, end).join('\n');
  }

  /**
   * Edit specific lines in file
   */
  async editLines(relativePath, startLine, endLine, newContent) {
    const fullPath = this.resolvePath(relativePath);

    if (!fs.existsSync(fullPath)) {
      throw new Error(`File not found: ${relativePath}`);
    }

    log('FILE_OPS', 1, 'editLines', `Editing ${relativePath}:${startLine}-${endLine}`);

    // Create backup
    await this.createBackup(fullPath);

    // Read current content
    const content = await fsp.readFile(fullPath, 'utf-8');
    const lines = content.split('\n');

    // Validate
    if (startLine < 1 || startLine > lines.length) {
      throw new Error(`Invalid start line: ${startLine}`);
    }

    // Replace lines
    const before = lines.slice(0, startLine - 1);
    const after = lines.slice(endLine || startLine);
    const replacement = newContent.split('\n');

    const newLines = [...before, ...replacement, ...after];

    // Write back
    await fsp.writeFile(fullPath, newLines.join('\n'), 'utf-8');

    return {
      success: true,
      path: relativePath,
      linesChanged: (endLine || startLine) - startLine + 1
    };
  }

  /**
   * Search within a file
   */
  async searchInFile(relativePath, pattern) {
    const fullPath = this.resolvePath(relativePath);

    if (!fs.existsSync(fullPath)) {
      throw new Error(`File not found: ${relativePath}`);
    }

    const content = await fsp.readFile(fullPath, 'utf-8');
    const lines = content.split('\n');

    const regex = new RegExp(pattern, 'gi');
    const matches = [];

    lines.forEach((line, index) => {
      if (regex.test(line)) {
        matches.push({
          lineNumber: index + 1,
          line: line.trim()
        });
      }
    });

    return matches;
  }

  /**
   * Append to end of file
   */
  async appendToFile(relativePath, content) {
    const fullPath = this.resolvePath(relativePath);

    if (!fs.existsSync(fullPath)) {
      throw new Error(`File not found: ${relativePath}`);
    }

    await this.createBackup(fullPath);
    await fsp.appendFile(fullPath, content, 'utf-8');

    return { success: true, path: relativePath };
  }

  /**
   * Delete file
   */
  async deleteFile(relativePath, skipConfirmation = false) {
    const fullPath = this.resolvePath(relativePath);

    if (!fs.existsSync(fullPath)) {
      throw new Error(`File not found: ${relativePath}`);
    }

    // Critical files require confirmation
    const criticalFiles = ['package.json', 'tsconfig.json', '.env', 'README.md'];
    const fileName = path.basename(relativePath);
    
    if (criticalFiles.includes(fileName) && !skipConfirmation) {
      return {
        requiresConfirmation: true,
        path: relativePath,
        reason: `${fileName} is a critical file`
      };
    }

    log('FILE_OPS', 2, 'deleteFile', `Deleting: ${relativePath}`);

    // Move to trash instead of permanent delete
    const trashPath = path.join(
      this.backupDir,
      'trash',
      `${Date.now()}_${fileName}`
    );

    await fsp.mkdir(path.dirname(trashPath), { recursive: true });
    await fsp.rename(fullPath, trashPath);

    return {
      success: true,
      path: relativePath,
      trashPath,
      recoverable: true
    };
  }

  /**
   * Create backup of file
   */
  async createBackup(fullPath) {
    const fileName = path.basename(fullPath);
    const timestamp = Date.now();
    const backupPath = path.join(this.backupDir, `${timestamp}_${fileName}`);

    await fsp.copyFile(fullPath, backupPath);

    log('FILE_OPS', 1, 'createBackup', `Backed up: ${fileName}`);

    return backupPath;
  }

  /**
   * Get file info without reading content
   */
  async getFileInfo(relativePath) {
    const fullPath = this.resolvePath(relativePath);

    if (!fs.existsSync(fullPath)) {
      throw new Error(`File not found: ${relativePath}`);
    }

    const stats = await fsp.stat(fullPath);
    const content = await fsp.readFile(fullPath, 'utf-8');
    const lines = content.split('\n');

    return {
      path: relativePath,
      size: stats.size,
      lineCount: lines.length,
      created: stats.birthtime,
      modified: stats.mtime
    };
  }
}

module.exports = FileOperationsManager;
```

---

## 3. Request Limiter (Prevent Infinite Loops)

### File: `backend/request-limiter.js`

```javascript
const { log } = require('../utils/logger');

class RequestLimiter {
  constructor() {
    this.counters = new Map();
    this.limits = new Map();
    this.startTimes = new Map();
  }

  setLimit(sessionId, maxRequests) {
    this.limits.set(sessionId, maxRequests);
    this.counters.set(sessionId, 0);
    this.startTimes.set(sessionId, Date.now());
    
    log('REQUEST_LIMITER', 1, 'setLimit', `Session ${sessionId}: ${maxRequests} max`);
  }

  canMakeRequest(sessionId) {
    const count = this.counters.get(sessionId) || 0;
    const limit = this.limits.get(sessionId) || 50;
    return count < limit;
  }

  incrementCounter(sessionId) {
    const count = this.counters.get(sessionId) || 0;
    const newCount = count + 1;
    this.counters.set(sessionId, newCount);
    
    const limit = this.limits.get(sessionId) || 50;
    const remaining = limit - newCount;
    
    if (remaining <= 10) {
      log('REQUEST_LIMITER', 2, 'increment', `Session ${sessionId}: ${remaining} requests left`);
    }
    
    return newCount;
  }

  getRemaining(sessionId) {
    const count = this.counters.get(sessionId) || 0;
    const limit = this.limits.get(sessionId) || 50;
    return Math.max(0, limit - count);
  }

  getStatus(sessionId) {
    const count = this.counters.get(sessionId) || 0;
    const limit = this.limits.get(sessionId) || 50;
    const startTime = this.startTimes.get(sessionId) || Date.now();
    
    return {
      current: count,
      limit: limit,
      remaining: Math.max(0, limit - count),
      percentage: Math.round((count / limit) * 100),
      duration: Date.now() - startTime
    };
  }

  reset(sessionId) {
    this.counters.set(sessionId, 0);
    this.startTimes.set(sessionId, Date.now());
    
    log('REQUEST_LIMITER', 1, 'reset', `Session ${sessionId} counter reset`);
  }

  cleanup(sessionId) {
    this.counters.delete(sessionId);
    this.limits.delete(sessionId);
    this.startTimes.delete(sessionId);
  }
}

module.exports = RequestLimiter;
```

---

## 4. App Builder Agent (Orchestration)

### File: `backend/app-builder-agent.js`

```javascript
const { log } = require('../utils/logger');

class AppBuilderAgent {
  constructor(services) {
    this.terminal = services.terminal;
    this.fileOps = services.fileOps;
    this.requestLimiter = services.requestLimiter;
    this.searchEngine = services.searchEngine;
  }

  /**
   * Main build process orchestration
   */
  async buildApp(userPrompt, sessionId) {
    log('APP_BUILDER', 1, 'buildApp', `Starting build for session ${sessionId}`);

    try {
      // Phase 1: Clarification (handled by chat system)
      // Phase 2: Planning (handled by AI)
      // Phase 3: Execution (handled here)
      
      // This is called after user approves the plan
      return {
        status: 'ready',
        message: 'Awaiting plan approval from user'
      };
      
    } catch (error) {
      log('APP_BUILDER', 3, 'buildApp', `Error: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Execute approved plan
   */
  async executePlan(plan, sessionId, progressCallback) {
    const results = {
      success: true,
      steps: [],
      errors: [],
      totalSteps: 0,
      completedSteps: 0
    };

    // Calculate total steps
    results.totalSteps = 
      plan.directories.length + 
      plan.files.length + 
      plan.commands.length;

    try {
      // Step 1: Create directories
      progressCallback?.({ 
        phase: 'directories', 
        current: 0, 
        total: plan.directories.length 
      });

      for (let i = 0; i < plan.directories.length; i++) {
        const dir = plan.directories[i];
        
        try {
          await this.terminal.execute(`mkdir -p ${dir}`);
          results.steps.push({ 
            action: 'mkdir', 
            path: dir, 
            success: true 
          });
          results.completedSteps++;
          
          progressCallback?.({ 
            phase: 'directories', 
            current: i + 1, 
            total: plan.directories.length,
            overall: results.completedSteps,
            overallTotal: results.totalSteps
          });
          
        } catch (error) {
          results.errors.push({ 
            action: 'mkdir', 
            path: dir, 
            error: error.message 
          });
        }
      }

      // Step 2: Create files
      progressCallback?.({ 
        phase: 'files', 
        current: 0, 
        total: plan.files.length 
      });

      for (let i = 0; i < plan.files.length; i++) {
        const file = plan.files[i];
        
        // Check request limit
        if (!this.requestLimiter.canMakeRequest(sessionId)) {
          results.errors.push({
            error: 'Max AI requests reached'
          });
          results.success = false;
          break;
        }

        try {
          await this.fileOps.createFile(file.path, file.content);
          results.steps.push({ 
            action: 'create', 
            path: file.path, 
            success: true 
          });
          results.completedSteps++;
          
          this.requestLimiter.incrementCounter(sessionId);
          
          progressCallback?.({ 
            phase: 'files', 
            current: i + 1, 
            total: plan.files.length,
            overall: results.completedSteps,
            overallTotal: results.totalSteps
          });
          
        } catch (error) {
          results.errors.push({ 
            action: 'create', 
            path: file.path, 
            error: error.message 
          });
        }
      }

      // Step 3: Run commands
      progressCallback?.({ 
        phase: 'commands', 
        current: 0, 
        total: plan.commands.length 
      });

      for (let i = 0; i < plan.commands.length; i++) {
        const cmd = plan.commands[i];
        
        try {
          // Check if requires approval
          if (this.terminal.requiresApproval(cmd.command)) {
            // This will be handled by UI approval flow
            results.steps.push({ 
              action: 'command', 
              command: cmd.command, 
              requiresApproval: true 
            });
            continue;
          }

          const result = await this.terminal.execute(cmd.command);
          results.steps.push({ 
            action: 'command', 
            command: cmd.command, 
            success: result.success,
            output: result.stdout
          });
          results.completedSteps++;
          
          progressCallback?.({ 
            phase: 'commands', 
            current: i + 1, 
            total: plan.commands.length,
            overall: results.completedSteps,
            overallTotal: results.totalSteps
          });
          
        } catch (error) {
          results.errors.push({ 
            action: 'command', 
            command: cmd.command, 
            error: error.message 
          });
        }
      }

      // Final status
      if (results.errors.length > 0) {
        results.success = false;
      }

      progressCallback?.({ phase: 'complete', results });

      return results;

    } catch (error) {
      log('APP_BUILDER', 3, 'executePlan', `Execution error: ${error.message}`);
      results.success = false;
      results.errors.push({ error: error.message });
      return results;
    }
  }

  /**
   * Validate plan before execution
   */
  validatePlan(plan) {
    const issues = [];

    // Check required fields
    if (!plan.projectName) {
      issues.push('Missing project name');
    }

    if (!plan.directories || plan.directories.length === 0) {
      issues.push('No directories defined');
    }

    if (!plan.files || plan.files.length === 0) {
      issues.push('No files defined');
    }

    // Check file content
    plan.files.forEach((file, index) => {
      if (!file.path) {
        issues.push(`File ${index} missing path`);
      }
      if (file.content === undefined) {
        issues.push(`File ${index} missing content`);
      }
    });

    return {
      valid: issues.length === 0,
      issues
    };
  }
}

module.exports = AppBuilderAgent;
```

---

## 5. Preload API Extensions

### File: `preload.js` (additions)

```javascript
// Add to existing window.api object

appBuilder: {
  // Terminal
  executeCommand: (command, sessionId) => 
    ipcRenderer.invoke('builder:executeCommand', { command, sessionId }),
  
  approveCommand: (command) => 
    ipcRenderer.invoke('builder:approveCommand', { command }),
  
  // File operations
  createFile: (path, content) => 
    ipcRenderer.invoke('builder:createFile', { path, content }),
  
  readLines: (path, startLine, endLine) => 
    ipcRenderer.invoke('builder:readLines', { path, startLine, endLine }),
  
  editLines: (path, startLine, endLine, newContent) => 
    ipcRenderer.invoke('builder:editLines', { path, startLine, endLine, newContent }),
  
  searchInFile: (path, pattern) => 
    ipcRenderer.invoke('builder:searchInFile', { path, pattern }),
  
  // Request limiting
  setRequestLimit: (sessionId, maxRequests) => 
    ipcRenderer.invoke('builder:setRequestLimit', { sessionId, maxRequests }),
  
  getRequestStatus: (sessionId) => 
    ipcRenderer.invoke('builder:getRequestStatus', { sessionId }),
  
  resetRequests: (sessionId) => 
    ipcRenderer.invoke('builder:resetRequests', { sessionId }),
  
  // High-level
  startBuild: (userPrompt, sessionId, settings) => 
    ipcRenderer.invoke('builder:startBuild', { userPrompt, sessionId, settings }),
  
  // Event listeners
  onTerminalOutput: (callback) => {
    ipcRenderer.on('terminal:output', (_event, data) => callback(data));
  },
  
  onTerminalComplete: (callback) => {
    ipcRenderer.on('terminal:complete', (_event, data) => callback(data));
  },
  
  onRequestApproval: (callback) => {
    ipcRenderer.on('builder:requestApproval', (_event, data) => callback(data));
  }
}
```

---

## 📊 Data Structures

### Build Plan JSON Structure:
```json
{
  "projectName": "my-blog-app",
  "description": "Next.js blog with TypeScript and Tailwind CSS",
  "techStack": {
    "framework": "Next.js 14",
    "language": "TypeScript",
    "styling": "Tailwind CSS",
    "database": "Supabase"
  },
  "directories": [
    "src/",
    "src/app/",
    "src/components/",
    "src/lib/",
    "public/"
  ],
  "files": [
    {
      "path": "package.json",
      "content": "{\n  \"name\": \"my-blog-app\",\n  ...\n}",
      "description": "Project dependencies and scripts"
    },
    {
      "path": "src/app/page.tsx",
      "content": "export default function Home() {...}",
      "description": "Homepage component"
    }
  ],
  "commands": [
    {
      "command": "npm install",
      "description": "Install dependencies",
      "requiresApproval": false
    },
    {
      "command": "git init",
      "description": "Initialize git repository",
      "requiresApproval": false
    }
  ],
  "estimatedFiles": 50,
  "estimatedTime": "5-10 minutes"
}
```

---

## 🎯 Next Steps

1. **Implement terminal executor** - Start with command validation
2. **Test file operations** - Ensure line-based read/edit works
3. **Build UI components** - Create beautiful app builder modal
4. **Integrate with projects** - Add to projects page
5. **Test end-to-end** - Build a real Next.js app

---

**This specification provides all the code needed to implement the app builder! 🚀**
