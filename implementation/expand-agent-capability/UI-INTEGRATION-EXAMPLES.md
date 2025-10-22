# 🎨 UI Integration & Usage Examples
## Frontend Implementation for Agent Capabilities

---

## 1. Preload API Extension

### File: `preload.js` (additions)

```javascript
// Add to existing window.api object

agent: {
  // Terminal operations
  executeCommand: (command, options) => 
    ipcRenderer.invoke('agent:executeCommand', { command, options }),
  
  runTests: (testCommand, options) => 
    ipcRenderer.invoke('agent:runTests', { testCommand, options }),
  
  installPackages: (packages, options) => 
    ipcRenderer.invoke('agent:installPackages', { packages, options }),
  
  killProcess: (processId) => 
    ipcRenderer.invoke('agent:killProcess', { processId }),
  
  getActiveProcesses: () => 
    ipcRenderer.invoke('agent:getActiveProcesses'),
  
  // File operations
  setWorkspace: (rootPath) => 
    ipcRenderer.invoke('agent:setWorkspace', { rootPath }),
  
  createFile: (path, content, options) => 
    ipcRenderer.invoke('agent:createFile', { path, content, options }),
  
  editFile: (path, changes) => 
    ipcRenderer.invoke('agent:editFile', { path, changes }),
  
  deleteFile: (path) => 
    ipcRenderer.invoke('agent:deleteFile', { path }),
  
  stageFile: (path, content, action) => 
    ipcRenderer.invoke('agent:stageFile', { path, content, action }),
  
  commitStaged: () => 
    ipcRenderer.invoke('agent:commitStaged'),
  
  rollback: (steps) => 
    ipcRenderer.invoke('agent:rollback', { steps }),
  
  getHistory: (limit) => 
    ipcRenderer.invoke('agent:getHistory', { limit }),
  
  getStagedFiles: () => 
    ipcRenderer.invoke('agent:getStagedFiles'),
  
  clearStaged: () => 
    ipcRenderer.invoke('agent:clearStaged'),
  
  // High-level patch application
  applyPatch: (patchData) => 
    ipcRenderer.invoke('agent:applyPatch', patchData),
  
  // Listen to terminal output streams
  onTerminalOutput: (callback) => {
    ipcRenderer.on('terminal:output', (_event, data) => callback(data));
  },
  
  onTerminalComplete: (callback) => {
    ipcRenderer.on('terminal:complete', (_event, data) => callback(data));
  }
}
```

---

## 2. Markdown Parser Enhancement

### File: `local_modules/custom-formatter/md.js` (additions)

```javascript
// Add after existing container tag processing (around line where clarify/try are handled)

if (tagName === 'patch') {
  const patchId = `patch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Extract patch operations from list items
  const listItems = containerContent.match(/<li[^>]*>.*?<\/li>/gis) || [];
  const operations = [];
  
  listItems.forEach(item => {
    // Parse attributes from <li> tag
    const fileMatch = item.match(/data-file="([^"]+)"/);
    const actionMatch = item.match(/data-action="([^"]+)"/);
    const contentMatch = item.match(/data-content="([^"]+)"/); // Optional: inline content
    
    // Extract description (text between <li> tags)
    const description = item.replace(/<[^>]+>/g, '').trim();
    
    if (fileMatch) {
      operations.push({
        file: fileMatch[1],
        action: actionMatch ? actionMatch[1] : 'edit',
        description,
        content: contentMatch ? contentMatch[1] : null
      });
    }
  });
  
  // Store operations in global map for later retrieval
  if (typeof window !== 'undefined' && window.patchOperations) {
    window.patchOperations.set(patchId, operations);
  }
  
  // Render interactive patch block
  const operationsHtml = operations.map(op => {
    const actionClass = {
      'create': 'patch-create',
      'edit': 'patch-edit',
      'delete': 'patch-delete'
    }[op.action] || 'patch-edit';
    
    const actionIcon = {
      'create': '➕',
      'edit': '✏️',
      'delete': '🗑️'
    }[op.action] || '📝';
    
    return `
      <div class="patch-operation ${actionClass}">
        <span class="patch-op-icon">${actionIcon}</span>
        <code class="patch-file-path">${op.file}</code>
        <span class="patch-op-desc">${op.description}</span>
      </div>
    `;
  }).join('');
  
  return `
    <div class="patch-container" data-patch-id="${patchId}">
      <div class="patch-header">
        <div class="patch-title-row">
          <span class="patch-icon">📦</span>
          <span class="patch-title">${title || 'Code Changes'}</span>
          <span class="patch-count">${operations.length} file${operations.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="patch-actions">
          <button class="patch-btn patch-preview-btn" onclick="previewPatch('${patchId}')">
            👁️ Preview
          </button>
          <button class="patch-btn patch-apply-btn" onclick="applyPatch('${patchId}')">
            ✅ Apply Changes
          </button>
        </div>
      </div>
      <div class="patch-operations">
        ${operationsHtml}
      </div>
      <div class="patch-status" id="patch-status-${patchId}"></div>
    </div>
  `;
}
```

### File: `renderer/md.worker.js` (same additions as above)

Copy the same patch handling code to the worker for consistency.

---

## 3. Renderer Functions

### File: `renderer/renderer.js` (additions)

```javascript
// Add to global scope
window.patchOperations = new Map();
window.activePatchProcesses = new Map();

/**
 * Preview patch changes before applying
 */
async function previewPatch(patchId) {
  const operations = window.patchOperations.get(patchId);
  if (!operations) {
    console.error('Patch operations not found:', patchId);
    return;
  }
  
  const statusDiv = document.getElementById(`patch-status-${patchId}`);
  statusDiv.innerHTML = `
    <div class="patch-preview">
      <div class="preview-header">📋 Preview Changes</div>
      ${operations.map(op => `
        <div class="preview-item">
          <strong>${op.action}</strong>: <code>${op.file}</code>
          <p>${op.description}</p>
        </div>
      `).join('')}
      <div class="preview-warning">
        ⚠️ This will modify your workspace files. Make sure you have backups or version control.
      </div>
    </div>
  `;
}

/**
 * Apply patch changes
 */
async function applyPatch(patchId) {
  const operations = window.patchOperations.get(patchId);
  if (!operations) {
    console.error('Patch operations not found:', patchId);
    return;
  }
  
  const patchContainer = document.querySelector(`[data-patch-id="${patchId}"]`);
  const statusDiv = document.getElementById(`patch-status-${patchId}`);
  const applyBtn = patchContainer.querySelector('.patch-apply-btn');
  
  // Disable button
  applyBtn.disabled = true;
  applyBtn.textContent = '⏳ Applying...';
  
  // Show progress
  statusDiv.innerHTML = `
    <div class="patch-progress">
      <div class="progress-spinner"></div>
      <span>Applying ${operations.length} file changes...</span>
    </div>
  `;
  
  try {
    // Ensure workspace is set
    const currentSession = getCurrentSession();
    if (currentSession?.type === 'project' && currentSession?.projectId) {
      // Get project workspace
      const projects = await window.api.projects.load();
      const project = projects.find(p => p.id === currentSession.projectId);
      
      if (project?.workspacePath) {
        await window.api.agent.setWorkspace(project.workspacePath);
      } else {
        throw new Error('Project workspace not configured');
      }
    } else {
      throw new Error('Patches can only be applied in project sessions');
    }
    
    // Apply patch
    const result = await window.api.agent.applyPatch({
      patchId,
      operations,
      sessionId: currentSession.id
    });
    
    if (result.success) {
      // Show success
      statusDiv.innerHTML = `
        <div class="patch-success">
          <div class="success-icon">✅</div>
          <div class="success-message">
            Successfully applied ${result.filesChanged} file change${result.filesChanged !== 1 ? 's' : ''}
          </div>
          <div class="success-actions">
            <button class="patch-btn" onclick="viewPatchHistory()">
              📜 View History
            </button>
            <button class="patch-btn" onclick="rollbackPatch(1)">
              ↩️ Undo
            </button>
          </div>
        </div>
      `;
      
      // Update button
      applyBtn.textContent = '✅ Applied';
      applyBtn.classList.add('patch-btn-success');
      
    } else {
      throw new Error(result.error || 'Unknown error');
    }
    
  } catch (error) {
    console.error('Patch application failed:', error);
    
    // Show error
    statusDiv.innerHTML = `
      <div class="patch-error">
        <div class="error-icon">❌</div>
        <div class="error-message">
          Failed to apply patch: ${error.message}
        </div>
        <div class="error-actions">
          <button class="patch-btn" onclick="retryPatch('${patchId}')">
            🔄 Retry
          </button>
          <button class="patch-btn" onclick="cancelPatch('${patchId}')">
            ❌ Cancel
          </button>
        </div>
      </div>
    `;
    
    // Re-enable button
    applyBtn.disabled = false;
    applyBtn.textContent = '✅ Apply Changes';
  }
}

/**
 * Retry failed patch
 */
async function retryPatch(patchId) {
  const statusDiv = document.getElementById(`patch-status-${patchId}`);
  statusDiv.innerHTML = '';
  await applyPatch(patchId);
}

/**
 * Cancel patch
 */
function cancelPatch(patchId) {
  const statusDiv = document.getElementById(`patch-status-${patchId}`);
  statusDiv.innerHTML = '<div class="patch-cancelled">Patch application cancelled.</div>';
}

/**
 * View file operation history
 */
async function viewPatchHistory() {
  try {
    const history = await window.api.agent.getHistory(20);
    
    // Create modal to display history
    const historyHtml = `
      <div class="history-modal">
        <div class="history-header">
          <h3>File Operation History</h3>
          <button onclick="closeHistoryModal()">✕</button>
        </div>
        <div class="history-list">
          ${history.map(op => `
            <div class="history-item history-${op.action}">
              <span class="history-time">${new Date(op.timestamp).toLocaleString()}</span>
              <span class="history-action">${op.action}</span>
              <code class="history-path">${op.path}</code>
            </div>
          `).join('')}
        </div>
        <div class="history-actions">
          <button class="patch-btn" onclick="rollbackPatch(1)">
            ↩️ Undo Last
          </button>
          <button class="patch-btn" onclick="rollbackPatch(5)">
            ↩️ Undo Last 5
          </button>
        </div>
      </div>
    `;
    
    // Show modal (implement your modal system)
    showModal(historyHtml);
    
  } catch (error) {
    console.error('Failed to load history:', error);
    alert('Failed to load history: ' + error.message);
  }
}

/**
 * Rollback file operations
 */
async function rollbackPatch(steps = 1) {
  if (!confirm(`Are you sure you want to undo the last ${steps} operation(s)?`)) {
    return;
  }
  
  try {
    const result = await window.api.agent.rollback(steps);
    
    if (result.success) {
      alert(`Successfully rolled back ${steps} operation(s)`);
      // Refresh history view if open
      if (document.querySelector('.history-modal')) {
        await viewPatchHistory();
      }
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    alert('Rollback failed: ' + error.message);
  }
}

/**
 * Execute terminal command from chat
 */
async function executeTerminalCommand(command, options = {}) {
  try {
    // Show terminal output in chat
    appendTerminalOutput(`$ ${command}\n`, 'command');
    
    // Setup output listener
    window.api.agent.onTerminalOutput((data) => {
      appendTerminalOutput(data.data, data.type);
    });
    
    // Execute
    const result = await window.api.agent.executeCommand(command, options);
    
    // Show completion
    if (result.success) {
      appendTerminalOutput(`\n✅ Completed (exit code ${result.exitCode})\n`, 'success');
    } else {
      appendTerminalOutput(`\n❌ Failed: ${result.error}\n`, 'error');
    }
    
    return result;
    
  } catch (error) {
    appendTerminalOutput(`\n❌ Error: ${error.message}\n`, 'error');
    throw error;
  }
}

/**
 * Append terminal output to chat
 */
function appendTerminalOutput(text, type = 'stdout') {
  const chatDiv = document.getElementById('chat');
  if (!chatDiv) return;
  
  // Find or create terminal output block
  let terminalBlock = document.querySelector('.terminal-output:last-child');
  if (!terminalBlock) {
    terminalBlock = document.createElement('div');
    terminalBlock.className = 'terminal-output';
    terminalBlock.innerHTML = '<pre class="terminal-content"></pre>';
    chatDiv.appendChild(terminalBlock);
  }
  
  const contentPre = terminalBlock.querySelector('.terminal-content');
  const span = document.createElement('span');
  span.className = `terminal-${type}`;
  span.textContent = text;
  contentPre.appendChild(span);
  
  // Auto-scroll
  chatDiv.scrollTop = chatDiv.scrollHeight;
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  // Setup terminal output listeners
  window.api.agent.onTerminalOutput((data) => {
    console.log('Terminal output:', data);
  });
  
  window.api.agent.onTerminalComplete((result) => {
    console.log('Terminal complete:', result);
  });
});
```

---

## 4. CSS Styling

### File: `renderer/style.css` (additions)

```css
/* ============================================================
   PATCH CONTAINER STYLES
   ============================================================ */

.patch-container {
  margin: 1rem 0;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 8px;
  overflow: hidden;
  background: var(--patch-bg, #f9f9f9);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.patch-header {
  padding: 1rem;
  background: var(--patch-header-bg, #fff);
  border-bottom: 1px solid var(--border-color, #e0e0e0);
}

.patch-title-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.patch-icon {
  font-size: 1.5rem;
}

.patch-title {
  font-weight: 600;
  font-size: 1.1rem;
  color: var(--fg, #333);
  flex: 1;
}

.patch-count {
  padding: 0.25rem 0.5rem;
  background: var(--badge-bg, #e0e0e0);
  border-radius: 12px;
  font-size: 0.85rem;
  color: var(--badge-fg, #666);
}

.patch-actions {
  display: flex;
  gap: 0.5rem;
}

.patch-btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 6px;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.patch-preview-btn {
  background: var(--preview-btn-bg, #f0f0f0);
  color: var(--preview-btn-fg, #333);
}

.patch-preview-btn:hover {
  background: var(--preview-btn-hover, #e0e0e0);
}

.patch-apply-btn {
  background: var(--apply-btn-bg, #4CAF50);
  color: white;
}

.patch-apply-btn:hover:not(:disabled) {
  background: var(--apply-btn-hover, #45a049);
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.patch-apply-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.patch-btn-success {
  background: var(--success-bg, #2196F3) !important;
}

/* Patch Operations List */
.patch-operations {
  padding: 1rem;
}

.patch-operation {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  margin-bottom: 0.5rem;
  border-radius: 6px;
  background: var(--operation-bg, #fff);
  border-left: 3px solid var(--operation-border, #ccc);
}

.patch-operation:last-child {
  margin-bottom: 0;
}

.patch-create {
  border-left-color: var(--create-color, #4CAF50);
  background: var(--create-bg, #f1f8f4);
}

.patch-edit {
  border-left-color: var(--edit-color, #2196F3);
  background: var(--edit-bg, #f0f7ff);
}

.patch-delete {
  border-left-color: var(--delete-color, #f44336);
  background: var(--delete-bg, #fff0f0);
}

.patch-op-icon {
  font-size: 1.25rem;
}

.patch-file-path {
  font-family: 'Fira Code', monospace;
  font-size: 0.9rem;
  padding: 0.25rem 0.5rem;
  background: var(--code-bg, #f5f5f5);
  border-radius: 4px;
  color: var(--code-fg, #333);
}

.patch-op-desc {
  flex: 1;
  color: var(--desc-fg, #666);
  font-size: 0.9rem;
}

/* Patch Status Messages */
.patch-status {
  padding: 0 1rem 1rem 1rem;
}

.patch-progress,
.patch-success,
.patch-error,
.patch-cancelled,
.patch-preview {
  padding: 1rem;
  border-radius: 6px;
  margin-top: 0.5rem;
}

.patch-progress {
  background: var(--progress-bg, #fff3cd);
  border: 1px solid var(--progress-border, #ffc107);
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.progress-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--spinner-color, #ffc107);
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.patch-success {
  background: var(--success-bg, #d4edda);
  border: 1px solid var(--success-border, #4CAF50);
}

.success-icon,
.error-icon {
  font-size: 2rem;
  margin-bottom: 0.5rem;
}

.success-message,
.error-message {
  font-weight: 500;
  margin-bottom: 0.75rem;
}

.success-actions,
.error-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.75rem;
}

.patch-error {
  background: var(--error-bg, #f8d7da);
  border: 1px solid var(--error-border, #f44336);
}

.patch-cancelled {
  background: var(--cancelled-bg, #e0e0e0);
  color: var(--cancelled-fg, #666);
  text-align: center;
}

.patch-preview {
  background: var(--preview-bg, #e3f2fd);
  border: 1px solid var(--preview-border, #2196F3);
}

.preview-header {
  font-weight: 600;
  margin-bottom: 0.75rem;
  font-size: 1rem;
}

.preview-item {
  margin-bottom: 0.75rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--preview-item-border, #ccc);
}

.preview-item:last-child {
  border-bottom: none;
  margin-bottom: 0;
  padding-bottom: 0;
}

.preview-item strong {
  text-transform: uppercase;
  font-size: 0.85rem;
  color: var(--preview-label, #666);
}

.preview-item code {
  font-family: 'Fira Code', monospace;
  background: var(--code-bg, #f5f5f5);
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
}

.preview-item p {
  margin: 0.5rem 0 0 0;
  color: var(--desc-fg, #666);
}

.preview-warning {
  margin-top: 1rem;
  padding: 0.75rem;
  background: var(--warning-bg, #fff3cd);
  border-left: 3px solid var(--warning-border, #ffc107);
  font-size: 0.9rem;
}

/* ============================================================
   TERMINAL OUTPUT STYLES
   ============================================================ */

.terminal-output {
  margin: 1rem 0;
  background: var(--terminal-bg, #1e1e1e);
  border-radius: 8px;
  overflow: hidden;
  font-family: 'Fira Code', 'Consolas', monospace;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.terminal-content {
  padding: 1rem;
  margin: 0;
  color: var(--terminal-fg, #d4d4d4);
  font-size: 0.9rem;
  line-height: 1.5;
  overflow-x: auto;
}

.terminal-command {
  color: var(--terminal-command, #4ec9b0);
  font-weight: 500;
}

.terminal-stdout {
  color: var(--terminal-stdout, #d4d4d4);
}

.terminal-stderr {
  color: var(--terminal-stderr, #f48771);
}

.terminal-success {
  color: var(--terminal-success, #4CAF50);
  font-weight: 500;
}

.terminal-error {
  color: var(--terminal-error, #f44336);
  font-weight: 500;
}

/* ============================================================
   HISTORY MODAL STYLES
   ============================================================ */

.history-modal {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 80%;
  max-width: 800px;
  max-height: 80vh;
  background: var(--modal-bg, #fff);
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  z-index: 1000;
  display: flex;
  flex-direction: column;
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem;
  border-bottom: 1px solid var(--border-color, #e0e0e0);
}

.history-header h3 {
  margin: 0;
  font-size: 1.25rem;
}

.history-header button {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: var(--close-btn, #999);
  padding: 0;
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.history-header button:hover {
  color: var(--close-btn-hover, #333);
}

.history-list {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
}

.history-item {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem;
  margin-bottom: 0.5rem;
  border-radius: 6px;
  background: var(--history-item-bg, #f9f9f9);
  border-left: 3px solid var(--history-border, #ccc);
}

.history-create {
  border-left-color: var(--create-color, #4CAF50);
}

.history-edit {
  border-left-color: var(--edit-color, #2196F3);
}

.history-delete {
  border-left-color: var(--delete-color, #f44336);
}

.history-time {
  font-size: 0.85rem;
  color: var(--time-fg, #999);
  white-space: nowrap;
}

.history-action {
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.85rem;
  font-weight: 500;
  text-transform: uppercase;
  background: var(--action-bg, #e0e0e0);
  color: var(--action-fg, #666);
  white-space: nowrap;
}

.history-path {
  flex: 1;
  font-family: 'Fira Code', monospace;
  font-size: 0.9rem;
  color: var(--path-fg, #333);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-actions {
  padding: 1rem 1.5rem;
  border-top: 1px solid var(--border-color, #e0e0e0);
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
}

/* Dark mode overrides */
@media (prefers-color-scheme: dark) {
  .patch-container {
    --patch-bg: #2a2a2a;
    --patch-header-bg: #1e1e1e;
    --border-color: #444;
  }
  
  .patch-operation {
    --operation-bg: #1e1e1e;
  }
  
  .terminal-output {
    --terminal-bg: #1e1e1e;
    --terminal-fg: #d4d4d4;
  }
  
  .history-modal {
    --modal-bg: #2a2a2a;
  }
}
```

---

## 5. Usage Examples

### Example 1: AI Response with Patch Tag

```markdown
I'll help you add authentication to your app. Here are the changes:

<patch><patch-title>Add JWT Authentication</patch-title>
<li data-file="src/auth/jwt.js" data-action="create">Create JWT token handler with sign/verify methods</li>
<li data-file="src/middleware/auth.js" data-action="create">Add authentication middleware for protected routes</li>
<li data-file="src/routes/auth.js" data-action="create">Create login/logout endpoints</li>
<li data-file="package.json" data-action="edit">Add jsonwebtoken and bcrypt dependencies</li>
<li data-file=".env.example" data-action="edit">Add JWT_SECRET placeholder</li>
</patch>

After applying these changes, you'll need to:
1. Run `npm install` to install the new dependencies
2. Set your JWT_SECRET in the .env file
3. Update your Express app to use the auth middleware

Would you like me to also create the database schema for users?
```

### Example 2: Terminal Command Execution

```javascript
// User asks: "Run the tests for me"

// AI generates response with thinking:
const response = `
I'll run your test suite now.

<thinking>Running: npm test</thinking>
`;

// Then backend executes:
await window.api.agent.executeCommand('npm test', {
  workingDir: projectWorkspace,
  streamToRenderer: true
});

// Output streams to chat in real-time
// Results displayed with pass/fail indicators
```

### Example 3: Complete Workflow

```javascript
// 1. User: "Create a React component for user profile"

// 2. AI searches codebase for context
const searchResult = await reasoningAgent.searchCode('React component structure');

// 3. AI generates patch
const response = `
<patch><patch-title>Create User Profile Component</patch-title>
<li data-file="src/components/UserProfile.jsx" data-action="create">Create profile component with props validation</li>
<li data-file="src/components/UserProfile.css" data-action="create">Add responsive styling</li>
<li data-file="src/components/index.js" data-action="edit">Export UserProfile component</li>
</patch>

I've created a responsive user profile component with:
- Avatar display with fallback
- Editable bio field
- Social links section
- Dark mode support
`;

// 4. User clicks "Apply Changes"
await applyPatch(patchId);

// 5. Files created successfully

// 6. User: "Now run the tests"
await window.api.agent.runTests('npm test -- UserProfile');

// 7. Tests pass, AI confirms:
"✅ All tests passed! The UserProfile component is ready to use."
```

---

## 6. System Prompt Update

### File: `renderer/renderer.js` (update system prompt)

```javascript
// Around line 8685, update the system prompt

const systemPrompt = `
You are a highly capable AI coding assistant with FULL development capabilities.

## Your Abilities:

### 🔧 File Operations
You can create, edit, and delete files using the <patch> tag:

<patch><patch-title>Description of changes</patch-title>
<li data-file="path/to/file.js" data-action="create">What this file does</li>
<li data-file="path/to/other.js" data-action="edit">What changes to make</li>
<li data-file="path/to/old.js" data-action="delete">Why removing this file</li>
</patch>

### 💻 Terminal Access
You can describe terminal commands needed, and I'll execute them:
- Package installation: "Run npm install react-router-dom"
- Testing: "Run the test suite"
- Build: "Build the production bundle"

### 🧠 Workflow Pattern
1. Search codebase for context (automatic)
2. Plan changes with clear <patch> tags
3. User reviews and clicks "Apply Changes"
4. Validate with tests if needed
5. Iterate if issues found

### 📝 Response Format
When making code changes:
1. Use <clarify> tags if you need information
2. Present <patch> with clear file operations
3. Explain what each change does
4. Suggest next steps (tests, documentation)

### ⚠️ Important
- Always use relative paths from project root
- Group related changes in one patch
- Be explicit about what each file does
- Suggest running tests after changes
- Ask before destructive operations

### 🎯 Example Response
<patch><patch-title>Fix authentication bug</patch-title>
<li data-file="src/auth/verify.js" data-action="edit">Add null check for expired tokens</li>
<li data-file="tests/auth.test.js" data-action="edit">Add test case for token expiration</li>
</patch>

This fixes the bug where expired tokens weren't being rejected. After applying, run the tests to verify the fix works.
`;
```

---

## Next Steps

1. **Test Markdown Rendering** - Ensure patch tags render correctly
2. **Test IPC Communication** - Verify agent API works end-to-end
3. **Build UI Components** - Implement modals, progress indicators
4. **Test Workflows** - Create test project and run through scenarios
5. **Polish UX** - Add animations, better error messages, tooltips

