# 🏗️ App Builder Agent - Implementation Plan
## Dynamic Project Scaffolding System for Clustrix AI

---

## 🎯 Vision

**Transform Clustrix Projects into an intelligent app scaffolding system** where AI can build complete web apps, mobile apps, or any project structure through iterative conversation, planning, and execution.

### **User Flow:**
```
User: "I want to build a blog website"
  ↓
AI: "What tech stack? (React/Vue/Next.js/vanilla?)"
User: "Next.js with TypeScript"
  ↓
AI: "Database? (PostgreSQL/MongoDB/Supabase?)"
User: "Supabase"
  ↓
AI: "Styling? (Tailwind/CSS Modules/Styled Components?)"
User: "Tailwind CSS"
  ↓
AI: "Here's my plan..." [Shows complete project structure]
User: "Looks good, proceed"
  ↓
AI: Creates folders → Files → Installs deps → Initializes git → Done!
```

---

## 🎨 Core Concept: Conversational Project Builder

### **Key Principles:**
1. **Dynamic Planning** - AI creates its own execution plan based on project type
2. **Iterative Clarification** - Keep asking until all info is gathered
3. **Step-by-Step Execution** - Show progress, allow user to stop/modify
4. **Safe Operations** - User approval for recursive/destructive commands
5. **Request Limiting** - Prevent infinite loops with configurable max requests

---

## 🏗️ Architecture Overview

### **Phase Flow:**
```
[1. Clarification] → [2. Planning] → [3. Approval] → [4. Execution] → [5. Completion]
```

### **Components:**

```
┌─────────────────────────────────────────────────────────────┐
│                    PROJECTS PAGE UI                         │
│  ┌────────────────────────────────────────────────────┐    │
│  │  "Build a new app..." [Start Button]               │    │
│  └────────────────────────────────────────────────────┘    │
│           ↓                                                  │
│  ┌────────────────────────────────────────────────────┐    │
│  │  AI Chat Interface (Clarification Phase)           │    │
│  │  - What are you building?                          │    │
│  │  - Tech stack preferences?                         │    │
│  │  - Database choice?                                │    │
│  └────────────────────────────────────────────────────┘    │
│           ↓                                                  │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Generated Plan Preview                            │    │
│  │  ├─ Directory structure                            │    │
│  │  ├─ File list (50+ files)                          │    │
│  │  ├─ Dependencies to install                        │    │
│  │  └─ [Approve] [Modify] [Cancel]                    │    │
│  └────────────────────────────────────────────────────┘    │
│           ↓                                                  │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Execution Progress                                │    │
│  │  ✅ Created directory structure                    │    │
│  │  ⏳ Creating files... (12/50)                      │    │
│  │  ⏸️ [Pause] [Cancel]                               │    │
│  └────────────────────────────────────────────────────┘    │
│           ↓                                                  │
│  ┌────────────────────────────────────────────────────┐    │
│  │  ✅ Project Created!                               │    │
│  │  📁 my-blog-app/                                   │    │
│  │  🚀 [Open in VS Code] [View Files]                │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

---

## 📋 Implementation Phases

### **Phase 1: Safe Terminal Executor (Week 1)**

#### Goal:
Execute terminal commands safely with user approval for dangerous operations.

#### Components:

##### 1.1 Terminal Executor Service
**File**: `backend/terminal-executor.js`

**Features:**
- Command whitelist (npm, git, node, mkdir, touch, cp, mv)
- Recursive command detection (e.g., `rm -rf`, `cp -r`)
- User approval system for dangerous ops
- Output streaming to UI
- Process timeout (60s default)
- Max 5 concurrent processes

**Safe Commands:**
```javascript
const SAFE_COMMANDS = [
  'npm', 'yarn', 'pnpm',           // Package managers
  'node', 'python', 'python3',     // Runtimes
  'git',                           // Version control
  'mkdir', 'touch',                // File creation (non-recursive)
  'echo', 'cat', 'type',           // File reading
  'cd', 'pwd', 'ls', 'dir'         // Navigation
];
```

**Recursive Commands (Require Approval):**
```javascript
const RECURSIVE_COMMANDS = [
  'rm -r', 'rm -rf',               // Recursive delete
  'cp -r', 'cp -R',                // Recursive copy
  'mv',                            // Move (can be dangerous)
  'chmod -R', 'chown -R'           // Recursive permissions
];
```

**Blocked Commands:**
```javascript
const BLOCKED_COMMANDS = [
  'rm -rf /',                      // System destruction
  'format', 'mkfs',                // Disk formatting
  'dd if=',                        // Disk operations
  'sudo', 'su',                    // Privilege escalation
  'curl | bash', 'wget | sh'       // Remote execution
];
```

##### 1.2 Command Approval UI
**File**: `renderer/renderer.js`

```javascript
async function requestCommandApproval(command, reason) {
  return new Promise((resolve) => {
    showModal({
      title: '⚠️ Command Requires Approval',
      message: `The following command needs your permission:\n\n${command}\n\nReason: ${reason}`,
      buttons: [
        { text: 'Approve', action: () => resolve(true), style: 'primary' },
        { text: 'Deny', action: () => resolve(false), style: 'secondary' }
      ]
    });
  });
}
```

---

### **Phase 2: Dynamic File Operations (Week 1-2)**

#### Goal:
Create, read, edit files dynamically without loading entire files into memory.

#### Components:

##### 2.1 File Operations Manager
**File**: `backend/file-operations-manager.js`

**Key Features:**
- **Line-based reading**: Read specific line ranges
- **Chunk-based editing**: Edit portions without loading full file
- **Search integration**: Use terminal commands (grep, find) for discovery
- **Safe writes**: Backup before write, atomic operations
- **No recursive reads**: Prevent "read entire codebase" requests

**API:**
```javascript
class FileOperationsManager {
  // Read specific lines (not entire file)
  async readLines(filePath, startLine, endLine) { }
  
  // Search file content
  async searchInFile(filePath, pattern) { }
  
  // Create file with content
  async createFile(filePath, content) { }
  
  // Edit specific lines
  async editLines(filePath, startLine, endLine, newContent) { }
  
  // Append to file
  async appendToFile(filePath, content) { }
  
  // Delete file (with confirmation for important files)
  async deleteFile(filePath, skipConfirmation = false) { }
}
```

##### 2.2 Search Integration
Use existing `desktop-search-engine.js` + terminal commands:

```javascript
// Terminal-based search (fast for large codebases)
await terminal.execute('grep -n "function" src/**/*.js');
await terminal.execute('find . -name "*.config.js"');
await terminal.execute('cat package.json | grep dependencies');

// Desktop search engine for semantic search
await searchEngine.searchPattern({ pattern: 'API endpoint' });
await searchEngine.searchFunctions({ functionName: 'handleAuth' });
```

---

### **Phase 3: Request Limiting System (Week 2)**

#### Goal:
Prevent AI from infinite looping with configurable max request limits.

#### Components:

##### 3.1 Request Counter
**File**: `backend/request-limiter.js`

```javascript
class RequestLimiter {
  constructor() {
    this.counters = new Map(); // sessionId -> count
    this.limits = new Map();   // sessionId -> limit
  }

  setLimit(sessionId, maxRequests) {
    this.limits.set(sessionId, maxRequests);
    this.counters.set(sessionId, 0);
  }

  canMakeRequest(sessionId) {
    const count = this.counters.get(sessionId) || 0;
    const limit = this.limits.get(sessionId) || 50; // Default: 50 requests
    return count < limit;
  }

  incrementCounter(sessionId) {
    const count = this.counters.get(sessionId) || 0;
    this.counters.set(sessionId, count + 1);
    return count + 1;
  }

  getRemaining(sessionId) {
    const count = this.counters.get(sessionId) || 0;
    const limit = this.limits.get(sessionId) || 50;
    return limit - count;
  }

  reset(sessionId) {
    this.counters.set(sessionId, 0);
  }
}
```

##### 3.2 Settings UI
**File**: `renderer/renderer.js`

```javascript
// Project settings modal
const projectSettings = {
  maxAIRequests: 50,           // Max requests per build session
  autoApproveRecursive: false, // Auto-approve recursive commands
  backupBeforeWrite: true,     // Always backup files
  gitAutoCommit: true,         // Auto-commit after successful build
  workspaceFolder: null        // Project workspace path
};
```

**UI:**
```html
<div class="project-settings">
  <h3>App Builder Settings</h3>
  
  <div class="setting-item">
    <label>Max AI Requests per Build</label>
    <input type="number" min="10" max="200" value="50">
    <span class="hint">Prevents infinite loops (default: 50)</span>
  </div>
  
  <div class="setting-item">
    <label>Auto-approve recursive commands</label>
    <input type="checkbox">
    <span class="hint">⚠️ Not recommended for safety</span>
  </div>
  
  <div class="setting-item">
    <label>Workspace Folder</label>
    <button onclick="selectWorkspaceFolder()">Choose Folder</button>
    <span class="path">/Users/you/projects/my-app</span>
  </div>
</div>
```

##### 3.3 Request Counter Display
Show remaining requests in UI:

```html
<div class="ai-request-counter">
  <span>🤖 AI Requests: <strong>12 / 50</strong> remaining</span>
  <button onclick="resetCounter()">Reset</button>
</div>
```

---

### **Phase 4: App Builder Agent Logic (Week 2-3)**

#### Goal:
AI orchestrates the entire build process through dynamic planning.

#### Components:

##### 4.1 App Builder Agent
**File**: `backend/app-builder-agent.js`

```javascript
class AppBuilderAgent {
  constructor(services) {
    this.terminal = services.terminal;
    this.fileOps = services.fileOps;
    this.requestLimiter = services.requestLimiter;
    this.searchEngine = services.searchEngine;
  }

  async buildApp(userPrompt, sessionId) {
    // Phase 1: Clarification
    const requirements = await this.clarifyRequirements(userPrompt, sessionId);
    
    // Phase 2: Planning
    const plan = await this.generatePlan(requirements, sessionId);
    
    // Phase 3: User Approval
    const approved = await this.requestApproval(plan);
    if (!approved) return { cancelled: true };
    
    // Phase 4: Execution
    const result = await this.executePlan(plan, sessionId);
    
    return result;
  }

  async clarifyRequirements(userPrompt, sessionId) {
    const clarificationPrompt = `
User wants to build: "${userPrompt}"

You are an expert project architect. Ask clarifying questions to gather ALL necessary information:
1. Project type (web app, mobile app, CLI tool, etc.)
2. Tech stack preferences (framework, language, database)
3. Styling approach (CSS framework, UI library)
4. Authentication needs
5. Deployment target
6. Any specific features required

Use <clarify> tags to ask questions:
<clarify><clarify-title>Tech Stack</clarify-title>
<li>What framework? (React/Vue/Next.js/Angular/Vanilla)</li>
<li>TypeScript or JavaScript?</li>
</clarify>

Keep asking until you have COMPLETE information to build the project.
When ready, respond with: "I have all the information needed. Ready to generate plan."
`;

    // Send to AI, get responses, iterate until complete
    // This uses existing chat system
    return await this.iterativeClarification(clarificationPrompt, sessionId);
  }

  async generatePlan(requirements, sessionId) {
    const planningPrompt = `
You are an expert software architect. Based on these requirements, create a COMPLETE project plan:

Requirements:
${JSON.stringify(requirements, null, 2)}

Generate a detailed plan in JSON format:
{
  "projectName": "my-blog-app",
  "description": "Next.js blog with Supabase",
  "directories": [
    "src/",
    "src/components/",
    "src/app/",
    "src/lib/",
    "public/"
  ],
  "files": [
    {
      "path": "package.json",
      "content": "...",
      "description": "Project dependencies"
    },
    {
      "path": "src/app/page.tsx",
      "content": "...",
      "description": "Homepage component"
    }
  ],
  "commands": [
    { "command": "npm install", "description": "Install dependencies" },
    { "command": "git init", "description": "Initialize git" }
  ],
  "estimatedFiles": 50,
  "estimatedTime": "5-10 minutes"
}

Be thorough and professional. Include all necessary config files, folders, and initial code.
`;

    const response = await this.callAI(planningPrompt, sessionId);
    return JSON.parse(this.extractJSON(response));
  }

  async executePlan(plan, sessionId) {
    const results = {
      success: true,
      steps: [],
      errors: []
    };

    // Step 1: Create directories
    for (const dir of plan.directories) {
      try {
        await this.terminal.execute(`mkdir -p ${dir}`);
        results.steps.push({ action: 'mkdir', path: dir, success: true });
      } catch (error) {
        results.errors.push({ action: 'mkdir', path: dir, error: error.message });
      }
    }

    // Step 2: Create files
    for (const file of plan.files) {
      // Check request limit
      if (!this.requestLimiter.canMakeRequest(sessionId)) {
        results.errors.push({
          error: 'Max AI requests reached. Stopping execution.'
        });
        results.success = false;
        break;
      }

      try {
        await this.fileOps.createFile(file.path, file.content);
        results.steps.push({ action: 'create', path: file.path, success: true });
        this.requestLimiter.incrementCounter(sessionId);
      } catch (error) {
        results.errors.push({ action: 'create', path: file.path, error: error.message });
      }
    }

    // Step 3: Run commands
    for (const cmd of plan.commands) {
      try {
        // Check if command requires approval
        if (this.requiresApproval(cmd.command)) {
          const approved = await this.requestCommandApproval(cmd.command);
          if (!approved) {
            results.steps.push({ action: 'command', command: cmd.command, skipped: true });
            continue;
          }
        }

        const result = await this.terminal.execute(cmd.command);
        results.steps.push({ action: 'command', command: cmd.command, success: true });
      } catch (error) {
        results.errors.push({ action: 'command', command: cmd.command, error: error.message });
      }
    }

    return results;
  }

  requiresApproval(command) {
    const recursivePatterns = ['-r', '-R', '-rf', '--recursive'];
    return recursivePatterns.some(pattern => command.includes(pattern));
  }
}
```

---

### **Phase 5: UI Integration (Week 3)**

#### Goal:
Integrate app builder into Projects page with beautiful UX.

#### Components:

##### 5.1 Projects Page Enhancement
**File**: `renderer/renderer.js`

**New Button in Projects Page:**
```html
<div class="projects-header">
  <h2>My Projects</h2>
  <button class="btn-primary" onclick="startAppBuilder()">
    🏗️ Build New App
  </button>
</div>
```

##### 5.2 App Builder Modal
```html
<div class="app-builder-modal">
  <div class="builder-header">
    <h2>🏗️ App Builder Assistant</h2>
    <button class="close-btn" onclick="closeBuilder()">✕</button>
  </div>
  
  <!-- Phase 1: Clarification -->
  <div class="builder-chat">
    <div class="ai-message">
      👋 Hi! I'll help you build your app. What would you like to create?
    </div>
    <input type="text" placeholder="I want to build a...">
  </div>
  
  <!-- Phase 2: Plan Preview -->
  <div class="builder-plan" style="display: none;">
    <h3>📋 Project Plan</h3>
    <div class="plan-summary">
      <div class="plan-item">
        <strong>Project:</strong> my-blog-app
      </div>
      <div class="plan-item">
        <strong>Files:</strong> 50 files, 12 folders
      </div>
      <div class="plan-item">
        <strong>Estimated Time:</strong> 5-10 minutes
      </div>
    </div>
    
    <details class="plan-details">
      <summary>View Full Structure</summary>
      <pre class="directory-tree">
my-blog-app/
├── src/
│   ├── app/
│   │   ├── page.tsx
│   │   └── layout.tsx
│   ├── components/
│   │   ├── Header.tsx
│   │   └── Footer.tsx
│   └── lib/
│       └── supabase.ts
├── public/
├── package.json
└── next.config.js
      </pre>
    </details>
    
    <div class="plan-actions">
      <button class="btn-primary" onclick="approveAndBuild()">
        ✅ Approve & Build
      </button>
      <button class="btn-secondary" onclick="modifyPlan()">
        ✏️ Modify Plan
      </button>
      <button class="btn-tertiary" onclick="cancelBuild()">
        ❌ Cancel
      </button>
    </div>
  </div>
  
  <!-- Phase 3: Execution Progress -->
  <div class="builder-progress" style="display: none;">
    <h3>🚀 Building Your App...</h3>
    
    <div class="progress-bar">
      <div class="progress-fill" style="width: 45%"></div>
    </div>
    
    <div class="progress-steps">
      <div class="step completed">
        ✅ Created directory structure
      </div>
      <div class="step in-progress">
        ⏳ Creating files (23/50)
      </div>
      <div class="step pending">
        ⏸️ Installing dependencies
      </div>
      <div class="step pending">
        ⏸️ Initializing git
      </div>
    </div>
    
    <div class="progress-actions">
      <button class="btn-secondary" onclick="pauseBuild()">
        ⏸️ Pause
      </button>
      <button class="btn-tertiary" onclick="cancelBuild()">
        ❌ Cancel
      </button>
    </div>
  </div>
  
  <!-- Phase 4: Completion -->
  <div class="builder-complete" style="display: none;">
    <div class="success-animation">🎉</div>
    <h3>✅ Project Created Successfully!</h3>
    
    <div class="project-info">
      <div class="info-item">
        <strong>Location:</strong>
        <code>/Users/you/projects/my-blog-app</code>
      </div>
      <div class="info-item">
        <strong>Files Created:</strong> 50
      </div>
      <div class="info-item">
        <strong>Time Taken:</strong> 7 minutes
      </div>
    </div>
    
    <div class="next-steps">
      <h4>Next Steps:</h4>
      <ol>
        <li>Open project in VS Code</li>
        <li>Run <code>npm run dev</code> to start development server</li>
        <li>Open <code>http://localhost:3000</code> in browser</li>
      </ol>
    </div>
    
    <div class="completion-actions">
      <button class="btn-primary" onclick="openInVSCode()">
        💻 Open in VS Code
      </button>
      <button class="btn-secondary" onclick="viewProject()">
        📁 View Files
      </button>
      <button class="btn-tertiary" onclick="closeBuilder()">
        ✅ Done
      </button>
    </div>
  </div>
  
  <!-- Request Counter (Always Visible) -->
  <div class="builder-footer">
    <div class="request-counter">
      🤖 AI Requests: <strong>18 / 50</strong> remaining
    </div>
    <div class="settings-link">
      <a href="#" onclick="openBuilderSettings()">⚙️ Settings</a>
    </div>
  </div>
</div>
```

---

## 🎯 System Prompt for App Builder

**File**: `renderer/renderer.js` (add new system prompt)

```javascript
const APP_BUILDER_SYSTEM_PROMPT = `
You are an expert software architect and app builder assistant. Your role is to help users build complete applications through conversation.

## Your Workflow:

### Phase 1: CLARIFICATION
Ask detailed questions to understand what the user wants to build:
- Project type (web app, mobile, CLI, API, etc.)
- Tech stack preferences
- Database choice
- Styling approach
- Authentication needs
- Deployment platform
- Specific features required

Use <clarify> tags to organize questions:
<clarify><clarify-title>Tech Stack</clarify-title>
<li>What framework do you prefer? (React/Vue/Next.js/Angular/Vanilla)</li>
<li>TypeScript or JavaScript?</li>
<li>State management? (Redux/Zustand/Context/None)</li>
</clarify>

Keep asking until you have COMPLETE information. When ready, say:
"I have all the information needed. Ready to generate plan."

### Phase 2: PLANNING
Generate a complete project plan in JSON format with:
- Directory structure
- All files with content
- Commands to run (npm install, git init, etc.)
- Estimated time and file count

Be thorough. Include:
- Config files (package.json, tsconfig.json, etc.)
- Core application files
- Initial components/pages
- README with setup instructions
- .gitignore, .env.example
- Basic tests if applicable

### Phase 3: EXECUTION
The system will create files and run commands based on your plan.
You don't need to do anything during execution.

## Important Rules:

1. **Dynamic Planning**: Create your own execution strategy based on project type
2. **Complete Information**: Never generate a plan without all necessary details
3. **Professional Quality**: Generate production-ready code, not placeholders
4. **Request Awareness**: You have limited AI requests (default 50), use them wisely
5. **File Reading**: When checking existing code, read specific lines/sections, not entire files
6. **Search First**: Use search to find relevant files before reading

## Example Interaction:

User: "I want to build a blog"

You: <clarify><clarify-title>Blog Specifications</clarify-title>
<li>What framework? (Next.js/Gatsby/Astro/WordPress)</li>
<li>Static or dynamic content?</li>
<li>CMS needed? (Markdown files/Headless CMS/Database)</li>
<li>Features needed? (Comments/Search/Categories/Tags)</li>
</clarify>

User: "Next.js, markdown files, with search and categories"

You: <clarify><clarify-title>Tech Details</clarify-title>
<li>TypeScript or JavaScript?</li>
<li>Styling? (Tailwind/CSS Modules/Styled Components)</li>
<li>Deploy where? (Vercel/Netlify/Self-hosted)</li>
</clarify>

User: "TypeScript, Tailwind, Vercel"

You: "I have all the information needed. Ready to generate plan."

[System shows plan for approval]

User: "Approved"

[System executes plan, creates 50+ files, installs deps, inits git]

You: "✅ Your Next.js blog is ready! Run 'npm run dev' to start."

## Capabilities You Have:

### File Operations:
- Create files (any content, any size)
- Read specific lines: readLines(file, start, end)
- Edit specific lines: editLines(file, start, end, newContent)
- Search in file: searchInFile(file, pattern)
- Delete files (with user approval)

### Terminal Commands:
- npm/yarn/pnpm (package management)
- git (version control)
- mkdir, touch (file creation)
- grep, find (search)
- cat, head, tail (read files)

### Search:
- Search patterns in codebase
- Find functions/classes
- Semantic code search

### Limitations:
- Max ${projectSettings.maxAIRequests} AI requests per build
- Recursive commands require user approval
- No system-wide operations (stay in workspace)
- No remote code execution

Work efficiently and professionally. Build amazing apps! 🚀
`;
```

---

## 🔧 IPC Handlers

**File**: `main.js` (additions)

```javascript
// App Builder Services
const TerminalExecutor = require('./backend/terminal-executor');
const FileOperationsManager = require('./backend/file-operations-manager');
const RequestLimiter = require('./backend/request-limiter');
const AppBuilderAgent = require('./backend/app-builder-agent');

let terminalExecutor = null;
let fileOpsManager = null;
let requestLimiter = null;
let appBuilderAgent = null;

// Initialize in app.whenReady()
app.whenReady().then(() => {
  // ... existing code ...
  
  terminalExecutor = new TerminalExecutor();
  fileOpsManager = new FileOperationsManager();
  requestLimiter = new RequestLimiter();
  appBuilderAgent = new AppBuilderAgent({
    terminal: terminalExecutor,
    fileOps: fileOpsManager,
    requestLimiter: requestLimiter
  });
  
  log('APP_BUILDER', 1, 'init', 'App Builder services initialized');
});

// ============================================================
// APP BUILDER - Terminal Operations
// ============================================================

ipcMain.handle('builder:executeCommand', async (event, { command, sessionId }) => {
  try {
    // Check if command requires approval
    const requiresApproval = terminalExecutor.requiresApproval(command);
    
    if (requiresApproval) {
      // Send approval request to renderer
      event.sender.send('builder:requestApproval', {
        command,
        reason: 'This command contains recursive flags'
      });
      
      // Wait for user response (handled via another IPC call)
      return { requiresApproval: true, command };
    }
    
    const result = await terminalExecutor.execute(command, {
      streamToRenderer: true,
      rendererEvent: event
    });
    
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('builder:approveCommand', async (_event, { command }) => {
  try {
    const result = await terminalExecutor.execute(command);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ============================================================
// APP BUILDER - File Operations
// ============================================================

ipcMain.handle('builder:createFile', async (_event, { path, content }) => {
  try {
    const result = await fileOpsManager.createFile(path, content);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('builder:readLines', async (_event, { path, startLine, endLine }) => {
  try {
    const content = await fileOpsManager.readLines(path, startLine, endLine);
    return { success: true, content };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('builder:editLines', async (_event, { path, startLine, endLine, newContent }) => {
  try {
    const result = await fileOpsManager.editLines(path, startLine, endLine, newContent);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('builder:searchInFile', async (_event, { path, pattern }) => {
  try {
    const matches = await fileOpsManager.searchInFile(path, pattern);
    return { success: true, matches };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ============================================================
// APP BUILDER - Request Limiting
// ============================================================

ipcMain.handle('builder:setRequestLimit', async (_event, { sessionId, maxRequests }) => {
  requestLimiter.setLimit(sessionId, maxRequests);
  return { success: true };
});

ipcMain.handle('builder:getRequestStatus', async (_event, { sessionId }) => {
  return {
    remaining: requestLimiter.getRemaining(sessionId),
    canMakeRequest: requestLimiter.canMakeRequest(sessionId)
  };
});

ipcMain.handle('builder:resetRequests', async (_event, { sessionId }) => {
  requestLimiter.reset(sessionId);
  return { success: true };
});

// ============================================================
// APP BUILDER - High-Level Build
// ============================================================

ipcMain.handle('builder:startBuild', async (event, { userPrompt, sessionId, settings }) => {
  try {
    // Set request limit from settings
    requestLimiter.setLimit(sessionId, settings.maxAIRequests || 50);
    
    // Set workspace
    if (settings.workspaceFolder) {
      fileOpsManager.setWorkspaceRoot(settings.workspaceFolder);
    }
    
    // Start build process
    const result = await appBuilderAgent.buildApp(userPrompt, sessionId);
    
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});
```

---

## 📊 Implementation Timeline

### **Week 1: Foundation**
- ✅ Terminal executor with command validation
- ✅ Recursive command detection
- ✅ File operations (line-based read/edit)
- ✅ Request limiter service

### **Week 2: Agent Logic**
- ✅ App builder agent core
- ✅ Clarification phase logic
- ✅ Plan generation system
- ✅ Execution orchestration

### **Week 3: UI Integration**
- ✅ Projects page enhancement
- ✅ App builder modal
- ✅ Progress tracking UI
- ✅ Settings panel

### **Week 4: Testing & Polish**
- ✅ End-to-end testing
- ✅ Security audit
- ✅ Performance optimization
- ✅ Documentation

---

## ✅ Success Metrics

### **Technical:**
- [ ] Can build a Next.js app from scratch (0 → production-ready)
- [ ] Request limit prevents infinite loops
- [ ] Recursive commands require user approval
- [ ] File operations are efficient (no full-file reads)
- [ ] Terminal output streams to UI smoothly

### **User Experience:**
- [ ] Users can describe app in natural language
- [ ] AI asks clarifying questions intelligently
- [ ] Plan is clear and understandable
- [ ] Progress is visible in real-time
- [ ] Completion feels rewarding

---

## 🚨 Critical Safety Rules

1. **No Recursive Deletes Without Approval** - `rm -rf` always requires confirmation
2. **Request Limiting Mandatory** - Default 50 max, configurable 10-200
3. **Workspace Boundary** - Cannot operate outside workspace folder
4. **Backup Critical Files** - Automatic backup for package.json, config files
5. **Git Safety** - Auto-commit only on user approval

---

## 📚 Example Projects AI Can Build

1. **Next.js Blog** - Full-featured blog with MDX, Tailwind, search
2. **React Dashboard** - Admin panel with charts, tables, auth
3. **Express API** - REST API with TypeScript, Prisma, JWT
4. **Vue E-commerce** - Product catalog, cart, checkout
5. **CLI Tool** - Node.js CLI with Commander.js
6. **Chrome Extension** - Manifest v3, popup, background script
7. **Discord Bot** - Discord.js bot with slash commands
8. **Python Flask API** - REST API with SQLAlchemy
9. **Mobile App (React Native)** - Cross-platform mobile app
10. **Electron Desktop App** - Desktop application with React

---

## 🎯 Next Steps

1. **Review this plan** - Confirm approach is feasible
2. **Start Week 1** - Build terminal executor + file ops
3. **Test incrementally** - Verify each component works
4. **Iterate UI** - Build beautiful, intuitive interface
5. **Launch beta** - Test with real users

---

**This is a focused, realistic, and achievable plan that transforms Clustrix into a powerful app builder! 🚀**
