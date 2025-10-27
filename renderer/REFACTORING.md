# Renderer Refactoring Plan - REVISED

## 📊 Current State Analysis

**File:** `renderer.js` - **18,343 lines** (~664KB)
**Total Functions:** ~280+ functions
**Key Issues:**
- Massive monolithic file with all logic mixed together
- Global state scattered throughout (40+ global variables)
- No clear separation of concerns
- Hard to maintain, test, and debug

---

## 🎯 Refactoring Goals

1. **Modularize** - Break into logical, testable modules
2. **Organize** - Group related functionality
3. **Maintain** - Keep 100% backward compatibility
4. **Test** - Each module should be testable independently
5. **Document** - Clear module responsibilities

---

## 📁 Target Module Structure

```
renderer/
├── core/
│   ├── state.js                    # Global state management (~100 lines)
│   ├── app-lifecycle.js            # Init, load, save functions (~200 lines)
│   └── constants.js                # All constants & configs (~150 lines)
├── managers/
│   ├── session-manager.js          # Session CRUD operations (~400 lines)
│   ├── cache-manager.js            # Session caching with LRU (~150 lines)
│   ├── draft-manager.js            # Draft auto-save logic (~100 lines)
│   ├── stream-manager.js           # Active streams tracking (~100 lines)
│   └── file-manager.js             # File upload/staging (~200 lines)
├── services/
│   ├── api-service.js              # IPC communication (~300 lines)
│   ├── model-service.js            # Model config & switching (~500 lines)
│   ├── sync-service.js             # Cloud sync operations (~400 lines)
│   └── auth-service.js             # Authentication & OAuth (~300 lines)
├── rendering/
│   ├── markdown/
│   │   ├── markdown-renderer.js    # Markdown processing (~400 lines)
│   │   ├── markdown-worker.js      # Worker management (~100 lines)
│   │   └── markdown-test.js        # Debug markdown testing (~300 lines)
│   ├── messages/
│   │   ├── message-renderer.js     # Message DOM creation (~600 lines)
│   │   ├── thinking-ui.js          # Thinking tags UI (~500 lines)
│   │   ├── lazy-loader.js          # Lazy message loading (~200 lines)
│   │   └── code-blocks.js          # Code highlighting (~200 lines)
│   └── pages/
│       ├── welcome-page.js         # Welcome screen (~300 lines)
│       ├── chats-page.js           # Chats listing (~600 lines)
│       ├── projects-page.js        # Projects management (~1200 lines)
│       └── artifacts-page.js       # Artifacts gallery (~500 lines)
├── ui/
│   ├── modals/
│   │   ├── modal-manager.js        # Modal orchestration (~200 lines)
│   │   ├── confirmation-modal.js   # Confirmation dialogs (~150 lines)
│   │   ├── model-mgmt-modal.js     # Model management UI (~800 lines)
│   │   └── search-api-modal.js     # Search API config (~150 lines)
│   ├── scrolling/
│   │   ├── smart-scroll.js         # Auto-scroll logic (~400 lines)
│   │   ├── scroll-detection.js     # Scroll position tracking (~200 lines)
│   │   └── scroll-button.js        # Scroll-to-bottom button (~100 lines)
│   ├── sidebar.js                  # Sidebar & navigation (~400 lines)
│   ├── toasts.js                   # Toast notifications (~100 lines)
│   └── theme.js                    # Theme switching (~50 lines)
├── handlers/
│   ├── message-handlers.js         # Send, regenerate, edit (~800 lines)
│   ├── session-handlers.js         # Session create/delete/rename (~400 lines)
│   ├── project-handlers.js         # Project operations (~800 lines)
│   ├── file-handlers.js            # File upload handlers (~300 lines)
│   ├── search-handler.js           # In-page search (~500 lines)
│   └── keyboard-handler.js         # Keyboard shortcuts (~200 lines)
└── utils/
    ├── dom-utils.js                # DOM helpers ($, $$, esc) (~100 lines)
    ├── formatters.js               # Date/time formatting (~100 lines)
    ├── timing-utils.js             # Debounce, throttle (~50 lines)
    ├── validation.js               # Input validation (~100 lines)
    └── logger.js                   # Frontend logging (~50 lines)
```

**Estimated Total:** ~15,000 lines across 50+ modules
**Remaining in renderer.js:** ~3,000 lines (glue code, initialization)

---

## 🔄 Refactoring Phases (12 Phases)

### **Phase 0: Preparation** ⚡ MUST DO FIRST
**Estimated Time:** 1-2 hours
**Risk:** Low

**Tasks:**
1. Create directory structure
2. Setup module template with JSDoc
3. Create test harness for validation
4. Document current global dependencies
5. Backup renderer.js

**Deliverables:**
- Empty directory structure
- Module template file
- Dependency map document

---

### **Phase 1: Utils & Constants** 🟢 Safe to Extract
**Estimated Time:** 2-3 hours
**Risk:** Very Low
**Dependencies:** None

**Extract:**
```
utils/dom-utils.js          - $, $$, esc, domCache (~100 lines)
utils/formatters.js         - formatRelativeTime, formatUserMessage, nowISO (~100 lines)
utils/timing-utils.js       - debounce, throttle (~50 lines)
utils/validation.js         - escapeHtml, getExtension, toExt (~50 lines)
utils/logger.js             - log function wrapper (~50 lines)
core/constants.js           - EXT_GROUPS, ICONS, SESSIONS_PER_PAGE, etc (~150 lines)
```

**Testing:**
- Import each util in console
- Verify functions return expected values
- No DOM manipulation yet

---

### **Phase 2: State Management** 🟡 Medium Risk
**Estimated Time:** 3-4 hours
**Risk:** Medium (many dependencies)
**Dependencies:** Phase 1 (utils)

**Extract:**
```
core/state.js               - All global variables, getters, setters (~150 lines)
```

**State Variables to Centralize:**
```javascript
// Session state
- state, sessions, current
- welcomeScreenStagedFiles, projectMessageStagedFiles
- loadedSessionCount, loadedChatPageCount

// UI state
- collapsed, isChatsSelectMode, isProjectsSelectMode
- selectedChatIds, selectedProjectIds
- currentProject, projectsData

// Cache state
- sessionCache, sessionDrafts, dirtySessionIds
- codeArtifacts

// Modal state
- confirmationModal, confirmationTitleEl, etc.
```

**Testing:**
- Verify state accessors work
- Check session switching
- Test draft persistence

---

### **Phase 3: Cache Manager** 🟢 Safe
**Estimated Time:** 2 hours
**Risk:** Low
**Dependencies:** Phase 2 (state)

**Extract:**
```
managers/cache-manager.js   - Session caching with LRU (~150 lines)
```

**Functions:**
- getCachedSession()
- cacheSession()
- invalidateSessionCache()
- clearSessionCache()
- preloadFrequentSessions()
- getCacheStats()

**Testing:**
- Cache hit/miss
- LRU eviction
- Cache invalidation

---

### **Phase 4: API Service** 🟢 Safe
**Estimated Time:** 2-3 hours
**Risk:** Low
**Dependencies:** Phase 1 (utils), Phase 2 (state)

**Extract:**
```
services/api-service.js     - All window.api.* calls (~300 lines)
```

**Functions:**
- loadSessions()
- saveSessions()
- loadProjects()
- saveProjects()
- loadArtifacts()
- streamChat()
- generateTitle()
- uploadFiles()

**Testing:**
- Mock window.api
- Verify IPC communication
- Test error handling

---

### **Phase 5: Model Service** 🟡 Medium Risk
**Estimated Time:** 4-5 hours
**Risk:** Medium
**Dependencies:** Phase 2 (state), Phase 4 (api-service)

**Extract:**
```
services/model-service.js   - Model config & UI (~500 lines)
```

**Functions:**
- loadModelsConf()
- persistModels()
- getActiveChatConfig()
- getTitleGenConfig()
- normalizeProviderModels()
- Model management modal UI

**Testing:**
- Load/save config
- Model switching
- Provider management

---

### **Phase 6: Markdown Rendering** 🔴 High Risk
**Estimated Time:** 5-6 hours
**Risk:** High (critical path)
**Dependencies:** Phase 1 (utils), Phase 3 (cache)

**Extract:**
```
rendering/markdown/markdown-renderer.js  (~400 lines)
rendering/markdown/markdown-worker.js    (~100 lines)
rendering/markdown/markdown-test.js      (~300 lines)
```

**Functions:**
- md() - Main markdown renderer
- mdFallback()
- initMarkdownWorker()
- preprocessMarkdownSource()
- renderMathInElement()
- Markdown test utilities

**Testing:**
- Test all markdown features
- Worker fallback
- Math rendering
- Code highlighting

---

### **Phase 7: Message Rendering** 🔴 Critical
**Estimated Time:** 8-10 hours
**Risk:** Very High (core functionality)
**Dependencies:** Phase 2 (state), Phase 6 (markdown)

**Extract:**
```
rendering/messages/message-renderer.js   (~600 lines)
rendering/messages/thinking-ui.js        (~500 lines)
rendering/messages/lazy-loader.js        (~200 lines)
rendering/messages/code-blocks.js        (~200 lines)
```

**Functions:**
- renderHistory()
- renderHistoryLazy()
- addMessage()
- Thinking UI functions
- Code block interactions
- Lazy loading logic

**Testing:**
- Render full chat
- Thinking tags
- Lazy loading
- Code copy/save

---

### **Phase 8: Page Rendering** 🟡 Medium Risk
**Estimated Time:** 6-8 hours
**Risk:** Medium
**Dependencies:** Phase 2 (state), Phase 7 (message-rendering)

**Extract:**
```
rendering/pages/welcome-page.js      (~300 lines)
rendering/pages/chats-page.js        (~600 lines)
rendering/pages/projects-page.js     (~1200 lines)
rendering/pages/artifacts-page.js    (~500 lines)
```

**Functions:**
- showWelcomeScreen()
- showChatsPage() + renderChatsPage()
- showProjectsPage() + all project functions
- showArtifactsPage() + renderArtifactsPage()

**Testing:**
- Page navigation
- List rendering
- Search/filter
- Selection mode

---

### **Phase 9: Session Handlers** 🟡 Medium Risk
**Estimated Time:** 4-5 hours
**Risk:** Medium
**Dependencies:** Phase 2 (state), Phase 4 (api-service)

**Extract:**
```
managers/session-manager.js          (~400 lines)
handlers/session-handlers.js         (~400 lines)
```

**Functions:**
- createNewSession()
- deleteSession()
- setCurrent()
- Session rename logic
- Favorite toggle
- Draft management

**Testing:**
- CRUD operations
- Draft persistence
- Session switching

---

### **Phase 10: Message Handlers** 🔴 Critical
**Estimated Time:** 8-10 hours
**Risk:** High (streaming logic)
**Dependencies:** Phase 2, 4, 6, 7, 9

**Extract:**
```
handlers/message-handlers.js         (~800 lines)
managers/stream-manager.js           (~100 lines)
```

**Functions:**
- send()
- sendFromWelcome()
- startStream()
- createStreamHandler()
- regenerateFromIndex()
- Streaming logic

**Testing:**
- Send message
- Stream response
- Regenerate
- Cancel stream

---

### **Phase 11: UI Components** 🟢 Safe
**Estimated Time:** 6-8 hours
**Risk:** Low
**Dependencies:** Phase 2 (state), various

**Extract:**
```
ui/modals/modal-manager.js           (~200 lines)
ui/modals/confirmation-modal.js      (~150 lines)
ui/modals/model-mgmt-modal.js        (~800 lines)
ui/scrolling/smart-scroll.js         (~400 lines)
ui/sidebar.js                        (~400 lines)
ui/toasts.js                         (~100 lines)
ui/theme.js                          (~50 lines)
handlers/search-handler.js           (~500 lines)
handlers/keyboard-handler.js         (~200 lines)
```

**Testing:**
- Modal open/close
- Scrolling behavior
- Sidebar interactions
- Search functionality
- Keyboard shortcuts

---

### **Phase 12: Integration & Cleanup** 🔴 Critical
**Estimated Time:** 10-15 hours
**Risk:** Very High (final integration)
**Dependencies:** All previous phases

**Tasks:**
1. Wire all modules together
2. Remove extracted code from renderer.js
3. Test all user flows end-to-end
4. Performance testing
5. Fix circular dependencies
6. Update documentation
7. Final cleanup

**Testing:**
- Full app smoke test
- All features work
- No console errors
- Performance metrics

---

## 📊 Effort Summary

| Phase | Est. Hours | Risk Level | Priority |
|-------|-----------|------------|----------|
| Phase 0  | 1-2    | Low        | 🔥 Critical |
| Phase 1  | 2-3    | Very Low   | 🔥 Critical |
| Phase 2  | 3-4    | Medium     | 🔥 Critical |
| Phase 3  | 2      | Low        | High |
| Phase 4  | 2-3    | Low        | 🔥 Critical |
| Phase 5  | 4-5    | Medium     | Medium |
| Phase 6  | 5-6    | High       | 🔥 Critical |
| Phase 7  | 8-10   | Very High  | 🔥 Critical |
| Phase 8  | 6-8    | Medium     | High |
| Phase 9  | 4-5    | Medium     | 🔥 Critical |
| Phase 10 | 8-10   | High       | 🔥 Critical |
| Phase 11 | 6-8    | Low        | Medium |
| Phase 12 | 10-15  | Very High  | 🔥 Critical |

**Total Estimated Time:** 62-84 hours (~2-3 weeks full-time)

---

## ⚠️ Safety Rules

1. ✅ **NEVER edit renderer.js until Phase 12** - Only extract, don't modify original
2. ✅ **Test after EVERY phase** - Run app and test affected features
3. ✅ **Keep git commits small** - One phase = one commit
4. ✅ **Document breaking changes** - Update this file as you go
5. ✅ **Use feature flags** - If needed, add toggles for new modules
6. ✅ **Backup frequently** - Git commit before each phase

---

## 🚀 How to Start

### Step 1: Read This Entire Document
Understand the full scope before starting

### Step 2: Run Phase 0
Create directories and setup tooling

### Step 3: Start Phase 1
Extract utils (safest, easiest win)

### Step 4: Test Phase 1
Verify nothing breaks

### Step 5: Continue Phase by Phase
Never skip ahead

---

## 📝 Progress Checklist

- [ ] Phase 0: Preparation
- [ ] Phase 1: Utils & Constants
- [ ] Phase 2: State Management
- [ ] Phase 3: Cache Manager
- [ ] Phase 4: API Service
- [ ] Phase 5: Model Service
- [ ] Phase 6: Markdown Rendering
- [ ] Phase 7: Message Rendering
- [ ] Phase 8: Page Rendering
- [ ] Phase 9: Session Handlers
- [ ] Phase 10: Message Handlers
- [ ] Phase 11: UI Components
- [ ] Phase 12: Integration & Cleanup

---

## 🎯 Success Criteria

✅ App works identically to before refactoring
✅ No console errors in production
✅ Performance metrics unchanged or better
✅ Code is 60%+ more maintainable
✅ Each module is under 800 lines
✅ Clear separation of concerns
✅ All features tested and working

---

**Last Updated:** Today
**Status:** Planning Complete - Ready to Start Phase 0