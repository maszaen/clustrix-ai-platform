# Clustrix AI - Refactoring Plan (Cicilan)

**Status:** 🟢 Phase 1 Complete (Renderer Utilities Extracted)  
**Next Phase:** Phase 2 - Renderer State & UI Logic (2-3 days)

---

## 📊 Current State (Post-Phase 1)

✅ **Completed:**
- `renderer/cache/session-cache.mjs` - Session caching logic
- `renderer/text/sanitize.mjs` - HTML utilities
- `renderer/files/file-utils.mjs` - File utilities
- `renderer/ids/id-utils.mjs` - ID generation
- `renderer/time/time-utils.mjs` - Time formatting
- `renderer/markdown/` - Markdown utilities consolidated
- `renderer/utils/timing.mjs` - Debounce/throttle

**Remaining Issues in `renderer.js`:**
- 17,960 lines of code (still massive)
- ~50+ global state variables scattered at top
- Monolithic DOM query system (`domCache`)
- Streaming logic mixed with UI rendering
- Artifact management scattered throughout
- File upload handling intertwined with UI

**Remaining Issues in `main.js`:**
- 4,500+ lines
- IPC handlers mixed together (sessions, artifacts, chat, models, sync)
- Streaming logic bundled with routing
- Window management mixed with app init
- No separation of concerns for different handlers

---

## 🎯 Refactoring Roadmap (10 Phases)

### **Phase 2: Renderer State Management** ⭐ RECOMMENDED NEXT
**Goal:** Extract scattered state variables into managed module  
**Estimated Time:** 2-3 days  
**Difficulty:** Medium

**Create:** `renderer/state/app-state.mjs`

```javascript
// Structure:
export const AppState = {
  // Session state
  sessions: [],
  current: null,
  sessionDrafts: new Map(),
  dirtySessionIds: new Set(),
  
  // UI flags
  isChatsSelectMode: false,
  selectedChatIds: new Set(),
  isProjectsSelectMode: false,
  selectedProjectIds: new Set(),
  
  // Project state
  currentProject: null,
  projectsData: [],
  
  // View state
  collapsed: false,
  justSentMessage: false,
  
  // Settings
  settings: { persona, theme, streamThrottling, language },
  
  // Getters for immutability
  getSessions() { return this.sessions; },
  getCurrentSession() { return this.current; },
  // ... etc
};

// Methods
export function initializeAppState(initialState = {}) { ... }
export function updateSessionState(session) { ... }
export function toggleSelectMode(type) { ... }
```

**Files to modify:**
- `renderer/renderer.js` - Import from `app-state.mjs`

**Benefits:**
- ✅ Centralized state management
- ✅ Easier to track state mutations
- ✅ Foundation for future Pinia/Redux migration
- ✅ Better testability

---

### **Phase 3: Renderer DOM Management**
**Goal:** Encapsulate all DOM queries & caching  
**Estimated Time:** 2 days  
**Difficulty:** Medium

**Create:** `renderer/dom/dom-manager.mjs`

```javascript
export class DomManager {
  static cache = new Map();
  
  static get(selector) { ... }
  static invalidate(selector) { ... }
  static invalidateAll() { ... }
  
  // Common queries
  static getChatLog() { ... }
  static getMsg() { ... }
  static getMsgCentral() { ... }
  static getSessionList() { ... }
  static getProjectList() { ... }
}

export const DOM = {
  chatLog: () => DomManager.getChatLog(),
  msgInput: () => DomManager.getMsg(),
  // ... easy-to-use factory methods
};
```

**Benefits:**
- ✅ Eliminates DOM query repetition
- ✅ Centralized DOM state
- ✅ Easy cache invalidation
- ✅ Better for testing (can mock)

---

### **Phase 4: Extract Streaming Logic**
**Goal:** Separate chat streaming from UI rendering  
**Estimated Time:** 3-4 days  
**Difficulty:** Hard

**Create:** `renderer/chat/stream-orchestrator.mjs`

```javascript
export class StreamOrchestrator {
  constructor() {
    this.activeStreams = new Map();
    this.thinkingStates = new WeakMap();
  }
  
  async handleStreamChunk(reqId, chunk, session, messageIndex) { ... }
  async handleStreamComplete(reqId) { ... }
  async handleStreamError(reqId, error) { ... }
  cancelStream(reqId) { ... }
}

export async function typewriterEffect(element, chunks, options) { ... }
export async function renderMarkdownStream(element, htmlChunks) { ... }
```

**Files to modify:**
- `renderer/renderer.js` - Use `StreamOrchestrator` for all streaming

**Benefits:**
- ✅ Isolates streaming complexity
- ✅ Easier to test/debug streaming
- ✅ Can add new streaming types without touching main
- ✅ Cleaner error handling

---

### **Phase 5: Extract File & Artifact Management**
**Goal:** Separate artifact/file operations from core UI  
**Estimated Time:** 2-3 days  
**Difficulty:** Medium

**Create:**
- `renderer/artifacts/artifact-manager.mjs`
- `renderer/files/upload-handler.mjs`

```javascript
// artifact-manager.mjs
export class ArtifactManager {
  static save(code, language, title) { ... }
  static load(artifactId) { ... }
  static renderHTML(artifact) { ... }
  static highlightCode(code, language) { ... }
}

// upload-handler.mjs
export class FileUploader {
  static openDialog() { ... }
  static handleFiles(files, sessionId) { ... }
  static renderUploadedFiles(session) { ... }
}
```

**Benefits:**
- ✅ Clear file operation flow
- ✅ Easy to add new artifact types
- ✅ Separate upload logic from display
- ✅ Reusable artifact rendering

---

### **Phase 6: Extract Search & Project Logic**
**Goal:** Isolate search & project management  
**Estimated Time:** 2-3 days  
**Difficulty:** Medium

**Create:**
- `renderer/search/search-manager.mjs`
- `renderer/projects/project-manager.mjs`

```javascript
// search-manager.mjs
export class SearchManager {
  static initializeSearch() { ... }
  static handleSearchStatus(status) { ... }
  static renderSearchResults(results) { ... }
  static toggleAdvancedSearch() { ... }
}

// project-manager.mjs
export class ProjectManager {
  static switchProject(projectId) { ... }
  static saveProject(project) { ... }
  static renderProjectList() { ... }
  static handleProjectMessage(content) { ... }
}
```

**Benefits:**
- ✅ Clear feature boundaries
- ✅ Easier to add search providers
- ✅ Isolated project workflows
- ✅ Better state transitions

---

### **Phase 7: Modularize main.js IPC Handlers**
**Goal:** Break monolithic IPC handling  
**Estimated Time:** 3 days  
**Difficulty:** Medium-Hard

**Create:**
```
backend/ipc/
├── index.js (main registry)
├── sessions-handler.js
├── artifacts-handler.js
├── chat-handler.js
├── models-handler.js
├── sync-handler.js
└── app-handler.js
```

**Example structure:**
```javascript
// backend/ipc/sessions-handler.js
module.exports = {
  register(ipcMain) {
    ipcMain.handle('sessions:load', handleLoad);
    ipcMain.handle('sessions:save', handleSave);
  }
};

// backend/ipc/index.js
function registerAllHandlers(ipcMain) {
  const handlers = [
    require('./sessions-handler'),
    require('./artifacts-handler'),
    require('./chat-handler'),
    // ... etc
  ];
  handlers.forEach(h => h.register(ipcMain));
}
```

**Benefits:**
- ✅ Easier to find handlers
- ✅ Reduces main.js to ~1000 lines
- ✅ Can test handlers in isolation
- ✅ Easy to add new IPC channels

---

### **Phase 8: Extract Streaming Orchestration (Backend)**
**Goal:** Separate streaming logic from routing  
**Estimated Time:** 3-4 days  
**Difficulty:** Hard

**Create:** `backend/streaming/stream-orchestrator.js`

```javascript
export class StreamOrchestrator {
  async runStandardStreaming(event, payload) { ... }
  async runWebSearchChat(event, payload) { ... }
  async processTokenUsage(reqId, stage, usage) { ... }
}

export function createStreamRouter(orchestrator) {
  return {
    route(event, payload) {
      // Simple routing logic only
    }
  };
}
```

**Benefits:**
- ✅ Single responsibility for streaming
- ✅ Easier to test streaming flows
- ✅ Can add new chat types easily
- ✅ Cleaner routing logic

---

### **Phase 9: Extract Window Management (Backend)**
**Goal:** Isolate Electron window lifecycle  
**Estimated Time:** 2 days  
**Difficulty:** Easy-Medium

**Create:** `backend/window/window-manager.js`

```javascript
export class WindowManager {
  constructor(app) {
    this.app = app;
    this.mainWindow = null;
    this.tray = null;
  }
  
  createWindow() { ... }
  handleClose() { ... }
  setupTray() { ... }
  gracefulShutdown() { ... }
}
```

**Benefits:**
- ✅ All window logic in one place
- ✅ Reusable for multi-window scenarios
- ✅ Easier to test window behavior
- ✅ Cleaner main.js

---

### **Phase 10: Create Backend Utility Layer**
**Goal:** Consolidate scattered helper functions  
**Estimated Time:** 2 days  
**Difficulty:** Easy

**Create:**
```
backend/utils/
├── api-config.js (API key, base URL, model config)
├── token-tracker.js (Token usage tracking)
├── file-handler.js (File operations)
└── validation.js (Input validation)
```

**Benefits:**
- ✅ DRY principle applied
- ✅ Easier to update API configurations
- ✅ Reusable validation logic
- ✅ Cleaner imports

---

## 📈 Expected Results After All Phases

### Code Size Reduction
```
Current:
- renderer.js: 17,960 lines → ~8,000 lines
- main.js: 4,500+ lines → ~2,000 lines

Total: ~22,460 lines → ~10,000 lines
Reduction: ~55%
```

### Module Structure
```
renderer/
├── renderer.js (core orchestrator, ~300 lines)
├── index.html
├── style.css
├── state/
│   └── app-state.mjs
├── dom/
│   └── dom-manager.mjs
├── chat/
│   └── stream-orchestrator.mjs
├── artifacts/
│   └── artifact-manager.mjs
├── files/
│   ├── file-utils.mjs
│   └── upload-handler.mjs
├── search/
│   └── search-manager.mjs
├── projects/
│   └── project-manager.mjs
├── markdown/
│   ├── markdown.mjs
│   ├── highlight.mjs
│   └── message-format.mjs
├── cache/
├── time/
├── ids/
└── utils/

backend/
├── main.js (bootstrap only)
├── ipc/
│   ├── index.js
│   ├── sessions-handler.js
│   ├── artifacts-handler.js
│   ├── chat-handler.js
│   └── ... (other handlers)
├── streaming/
│   └── stream-orchestrator.js
├── window/
│   └── window-manager.js
├── utils/
│   ├── api-config.js
│   ├── token-tracker.js
│   └── file-handler.js
├── integration/
├── search/
├── sync/
└── ... (existing backend)
```

---

## 🚀 Recommended Execution Plan

### Week 1-2: Foundation
```
Day 1-2:   Phase 2 (State Management)
Day 3-4:   Phase 3 (DOM Management)
Day 5-6:   Phase 4 (Streaming Logic)
Day 7:     Testing & integration
```

### Week 3: Artifacts & Search
```
Day 8-9:   Phase 5 (File & Artifact)
Day 10-11: Phase 6 (Search & Project)
Day 12:    Testing & integration
```

### Week 4: Backend
```
Day 13-15: Phase 7 (IPC Handlers)
Day 16-18: Phase 8 (Stream Orchestration)
Day 19-20: Phase 9 (Window Management)
Day 21:    Phase 10 (Utils) + Final testing
```

---

## ✅ Checklist per Phase

Use this when starting each phase:

```markdown
### Phase X: [NAME]

- [ ] Create module file(s)
- [ ] Extract functions/classes
- [ ] Update imports in renderer.js/main.js
- [ ] Test core functionality (npm run dev)
- [ ] Run test suite (npm test)
- [ ] Check console for errors
- [ ] Verify no regression in existing features
- [ ] Create unit tests for new module
- [ ] Update documentation
- [ ] Commit: "refactor: [phase description]"
```

---

## 💡 Pro Tips During Refactoring

1. **Keep commits small:** One function/class per commit if possible
2. **Test after each extraction:** `npm run dev` after each file
3. **Use semantic commits:** `refactor: extract X to module Y`
4. **Document as you go:** Add JSDoc comments to new modules
5. **Profile performance:** Use DevTools before/after
6. **Keep old code:** Don't delete until verified working

---

## 📝 Notes

- Each phase is independent (can skip if not needed)
- Later phases depend on earlier phases ✓
- Estimated total time: **4-5 weeks** for all phases
- Can stop at any point and have working code
- Tests are crucial for large refactors

---

**Last Updated:** 2025-11-03  
**Next Review:** After Phase 2 completion
