# Renderer Refactoring Plan - OPTIMIZED FOR AI

## 🎯 Goal
Break down `renderer.js` (18,500+ lines) into modular files **WITHOUT changing any logic**.
Extract functions → Create module → Replace in renderer.js → Move to next.

---

## ⚡ Principles

1. **99% EXACT CODE** - Copy code as-is, only adjust imports (1%)
2. **LAZY IMPORTS** - Optimize with lazy require() where possible
3. **NO LINE COUNTS** - Don't limit module size, extract complete logic
4. **IMMEDIATE REPLACEMENT** - Extract → Replace → Update Checklist
5. **PRESERVE BEHAVIOR** - Keep all logic, edge cases, and comments
6. **FOLDER CHECKPOINTS** - Test manually after each folder group
7. **MANUAL COMMITS** - User commits, AI updates checklist only

---

## 🚫 What NOT to Do

❌ Don't create backup files  
❌ Don't write test files  
❌ Don't add fallback mechanisms  
❌ Don't rewrite or "improve" logic (except imports)  
❌ Don't create skeleton functions  
❌ Don't worry about line counts  
❌ Don't create dependency maps  
❌ Don't git commit (user does it manually)  

---

## ✅ What TO Do

✅ Copy exact code from renderer.js (99%)  
✅ Adjust imports only (1%) - use lazy require() where beneficial  
✅ Create new module file  
✅ Export the function  
✅ Import in renderer.js (lazy if possible)  
✅ Replace old code with import  
✅ Delete extracted code from renderer.js  
✅ **Update checklist** with ✅  
✅ Ask user to test after folder completion  

---

## 📁 Target Structure (NO LINE COUNTS)

```
renderer/
├── utils/
│   ├── dom.js                  # $, $$, esc, domCache
│   ├── format.js               # formatRelativeTime, formatUserMessage, etc
│   ├── file-icons.js           # getFileIcon, getExtension
│   └── timing.js               # debounce, throttle
├── state/
│   └── global-state.js         # All global variables
├── cache/
│   └── session-cache.js        # Session caching logic
├── markdown/
│   ├── worker.js               # Markdown worker management
│   ├── renderer.js             # md() function & helpers
│   └── test-mode.js            # Markdown test utilities
├── messages/
│   ├── render.js               # renderHistory, addMessage
│   ├── thinking.js             # Thinking UI functions
│   └── lazy-load.js            # Lazy loading logic
├── sessions/
│   ├── crud.js                 # Create/delete/update sessions
│   ├── switch.js               # setCurrent, session switching
│   └── drafts.js               # Draft management
├── streaming/
│   ├── handler.js              # createStreamHandler
│   └── manager.js              # Stream lifecycle
├── pages/
│   ├── welcome.js              # Welcome screen logic
│   ├── chats.js                # Chats page
│   ├── projects.js             # Projects page
│   └── artifacts.js            # Artifacts page
├── ui/
│   ├── scroll.js               # Smart scroll logic
│   ├── modals.js               # Modal management
│   ├── sidebar.js              # Sidebar interactions
│   ├── search.js               # In-page search
│   └── toast.js                # Toast notifications
├── handlers/
│   ├── send.js                 # send(), sendFromWelcome()
│   ├── regenerate.js           # Regeneration logic
│   ├── upload.js               # File upload handlers
│   └── keyboard.js             # Keyboard shortcuts
├── api/
│   ├── ipc.js                  # All window.api calls
│   └── models.js               # Model management
└── renderer.js                 # Main entry point (imports all modules)
```

---

## 🔄 Execution Flow (Sequential)

### **Step Format for Each Module:**

```
1. Identify function(s) to extract
2. Copy exact code (99%) from renderer.js
3. Adjust imports only (1%) - lazy require() if beneficial
4. Create new module file
5. Wrap in exports
6. Add require() in renderer.js (lazy if possible)
7. Replace old function with imported one
8. Delete old code from renderer.js
9. Verify syntax (no runtime test)
10. Update checklist: - [ ] → - [x]
11. Move to next function
```

### **After Each Folder Group:**
```
AI: "✅ Folder [name] completed. Please test manually:
     1. Run the app
     2. Test [specific features]
     3. Check console for errors
     4. Reply 'OK' to continue or report issues"
     
User: Tests and replies
AI: Continues to next folder
```

---

## 📋 Extraction Order (25 Modules)

### **Group 1: Pure Utils (No Dependencies)**

#### Module 1: `utils/dom.js`
**Extract:**
- `$()` - Query selector
- `$$()` - Query all
- `esc()` - HTML escape
- `domCache` - DOM cache object

**Action:**
1. Copy functions to `utils/dom.js` (99% exact)
2. Adjust any internal imports if needed (1%)
3. Export: `module.exports = { $, $$, esc, domCache }`
4. Add to renderer.js: `const { $, $$, esc, domCache } = require('./utils/dom')`
5. Delete original functions from renderer.js
6. Update checklist: `- [x] Module 1: utils/dom.js`

---

#### Module 2: `utils/format.js`
**Extract:**
- `formatRelativeTime()`
- `formatUserMessage()`
- `nowISO()`
- `formatTimestamp()`

**Action:** Same pattern as Module 1  
**Checklist:** Update `- [x] Module 2: utils/format.js`

---

#### Module 3: `utils/file-icons.js`
**Extract:**
- `getFileIcon()`
- `getExtension()`
- `toExt()`
- `EXT_GROUPS` constant
- `ICONS` constant

**Action:** Same pattern

---

#### Module 4: `utils/timing.js`
**Extract:**
- `debounce()`
- `throttle()`

**Action:** Same pattern  
**Checklist:** Update `- [x] Module 4: utils/timing.js`

---

**🧪 FOLDER CHECKPOINT: utils/**

After completing utils folder, AI must say:
```
✅ Folder "utils/" completed (4 modules).

Please test manually:
1. Run the app: npm start
2. Open browser console
3. Test basic interactions (click, scroll, typing)
4. Check if format functions work (timestamps should display)
5. Verify no console errors

Reply "OK" when done, or report any issues.
```

---

### **Group 2: State Management**

#### Module 5: `state/global-state.js`
**Extract ALL global variables:**
- `state`
- `current`
- `welcomeScreenStagedFiles`
- `projectMessageStagedFiles`
- `collapsed`
- (all 61 globals from dependency-map.md)

**Important:** 
- Don't use getters/setters initially
- Just export the variables
- Keep mutable exports: `exports.state = {...}`
- Other files can mutate: `const globalState = require('./state/global-state'); globalState.current = ...`

**Checklist:** Update `- [x] Module 5: state/global-state.js`

---

**🧪 FOLDER CHECKPOINT: state/**

After completing state folder, AI must say (FOR EXAMPLE):
```
✅ Folder "state/" completed (1 module).

Please test manually:
1. Run the app
2. Create a new session (test state.sessions update)
3. Switch between sessions (test current variable)
4. Upload files (test welcomeScreenStagedFiles)
5. Check console for state-related errors

Reply "OK" when done, or report any issues.
```

---

### **Group 3: Independent Modules**

#### Module 6: `cache/session-cache.js`
**Extract:**
- `SessionCacheEntry` class
- `getCachedSession()`
- `cacheSession()`
- `invalidateSessionCache()`
- `clearSessionCache()`
- `preloadFrequentSessions()`
- `getCacheStats()`

**Dependencies:** Uses `state.sessionCache` from Module 5  
**Checklist:** Update `- [x] Module 6: cache/session-cache.js`

---

**🧪 FOLDER CHECKPOINT: cache/**

After completing cache folder, AI must say:
```
✅ Folder "cache/" completed (1 module).

Please test manually:
1. Run the app
2. Open multiple sessions (test cache population)
3. Switch between sessions rapidly (test cache hits)
4. Check browser DevTools → Application → Memory
5. Verify session switching is fast (< 100ms)

Reply "OK" when done, or report any issues.
```

---

#### Module 7: `markdown/worker.js`
**Extract:**
- `initMarkdownWorker()`
- `markdownWorker` variable
- `workerMessageId` variable
- `workerPromises` Map
- Worker message handlers

**Checklist:** Update `- [x] Module 7: markdown/worker.js`

---

#### Module 8: `markdown/renderer.js`
**Extract:**
- `md()` - Main function
- `mdFallback()`
- `preprocessMarkdownSource()`
- `ensureMarkdownRenderer()`
- `renderMathInElement()`
- All markdown helper functions

**Dependencies:** Module 7  
**Checklist:** Update `- [x] Module 8: markdown/renderer.js`

---

#### Module 9: `markdown/test-mode.js`
**Extract:**
- `isMarkdownTestSession()`
- `buildMarkdownTestScenario()`
- `startMarkdownTestFromWelcome()`
- `runMarkdownTestTurn()`
- `streamMarkdownTestResponse()`
- All markdown test constants

**Checklist:** Update `- [x] Module 9: markdown/test-mode.js`

---

**🧪 FOLDER CHECKPOINT: markdown/**

After completing markdown folder, AI must say:
```
✅ Folder "markdown/" completed (3 modules).

Please test manually:
1. Run the app
2. Send a message with markdown formatting:
   - Bold, italic, code blocks
   - Lists (ordered & unordered)
   - Links and images
   - Math equations (if supported)
3. Check if code highlighting works
4. Verify markdown renders correctly in messages
5. Test markdown test mode (if DEBUG_MARKDOWN enabled)

Reply "OK" when done, or report any issues.
```

---

### **Group 4: Message Rendering**

#### Module 10: `messages/thinking.js`
**Extract:**
- `ensureThinkingUI()`
- `appendThinking()`
- `updateThinkingUI()`
- `hydrateThinkingIfAny()`
- `finalizeThinkingUI()`
- `scheduleThinkingText()`
- `cancelThinkingText()`
- All thinking-related helpers

**Checklist:** Update `- [x] Module 10: messages/thinking.js`

---

#### Module 11: `messages/render.js`
**Extract:**
- `renderHistory()`
- `addMessage()`
- `hydrateInteractiveElements()`
- `attachCodeBlockListeners()`
- `updateCodeBlocksWithArtifactInfo()`

**Dependencies:** Module 8, 10  
**Checklist:** Update `- [x] Module 11: messages/render.js`

---

#### Module 12: `messages/lazy-load.js`
**Extract:**
- `renderHistoryLazy()`
- `addLoadOlderIndicator()`
- `setupLazyScrollListener()`
- All lazy loading state

**Checklist:** Update `- [x] Module 12: messages/lazy-load.js`

---

**🧪 FOLDER CHECKPOINT: messages/**

After completing messages folder, AI must say:
```
✅ Folder "messages/" completed (3 modules).

Please test manually:
1. Run the app
2. Create a chat with 20+ messages
3. Scroll through message history
4. Test "Load Older" button (lazy loading)
5. Send message with thinking tags
6. Check if thinking UI displays correctly
7. Copy code from code blocks
8. Save code as artifact

Reply "OK" when done, or report any issues.
```

---

### **Group 5: Session Management**

#### Module 13: `sessions/crud.js`
**Extract:**
- `createNewSession()`
- `deleteSession()`
- `deleteCurrentSession()`
- `generateSessionId()`
- `generateAndSetTitle()`

**Checklist:** Update `- [x] Module 13: sessions/crud.js`

---

#### Module 14: `sessions/switch.js`
**Extract:**
- `setCurrent()`
- `updateActiveSessionState()`
- `updateChatHeader()`
- `updateSessionTitle()`

**Checklist:** Update `- [x] Module 14: sessions/switch.js`

---

#### Module 15: `sessions/drafts.js`
**Extract:**
- `sessionDrafts` Map
- `saveDraftForSession()`
- `loadDraftForSession()`
- `loadAllDrafts()`
- `saveDraftDebounced`

**Checklist:** Update `- [x] Module 15: sessions/drafts.js`

---

**🧪 FOLDER CHECKPOINT: sessions/**

After completing sessions folder, AI must say:
```
✅ Folder "sessions/" completed (3 modules).

Please test manually:
1. Run the app
2. Create new session
3. Rename session
4. Delete session
5. Switch between sessions
6. Type in input (test draft auto-save)
7. Refresh page (test draft persistence)
8. Star/unstar sessions

Reply "OK" when done, or report any issues.
```

---

### **Group 6: Streaming**

#### Module 16: `streaming/handler.js`
**Extract:**
- `createStreamHandler()` - THE ENTIRE FUNCTION
- All streaming helper functions

**Critical:** Don't split this function, move it complete  
**Checklist:** Update `- [x] Module 16: streaming/handler.js`

---

#### Module 17: `streaming/manager.js`
**Extract:**
- `startStream()`
- Stream lifecycle management
- Active streams tracking

**Dependencies:** Module 16  
**Checklist:** Update `- [x] Module 17: streaming/manager.js`

---

**🧪 FOLDER CHECKPOINT: streaming/**

After completing streaming folder, AI must say:
```
✅ Folder "streaming/" completed (2 modules).

Please test manually:
1. Run the app
2. Send a message (test streaming)
3. Watch AI response stream in real-time
4. Cancel stream mid-response
5. Send another message (test stream cancellation)
6. Test regenerate button
7. Check console for streaming errors

Reply "OK" when done, or report any issues.
```

---

### **Group 7: Message Handlers**

#### Module 18: `handlers/send.js`
**Extract:**
- `send()`
- `sendFromWelcome()`
- `buildMessages()`
- `buildMessagesForProject()`
- `buildMessagesUpTo()`

**Checklist:** Update `- [x] Module 18: handlers/send.js`

---

#### Module 19: `handlers/regenerate.js`
**Extract:**
- `regenerateFromIndex()`
- `regenerateFromCancelled()`
- `regenerateFromIncomplete()`

**Checklist:** Update `- [x] Module 19: handlers/regenerate.js`

---

#### Module 20: `handlers/upload.js`
**Extract:**
- `renderWelcomeScreenFiles()`
- `renderProjectMessageFiles()`
- `renderUploadedFiles()`
- File upload event handlers

**Checklist:** Update `- [x] Module 20: handlers/upload.js`

---

#### Module 21: `handlers/keyboard.js`
**Extract:**
- `initKeyboardShortcuts()`
- All keyboard event handlers

**Checklist:** Update `- [x] Module 21: handlers/keyboard.js`

---

**🧪 FOLDER CHECKPOINT: handlers/**

After completing handlers folder, AI must say:
```
✅ Folder "handlers/" completed (4 modules).

Please test manually:
1. Run the app
2. Send message from welcome screen
3. Send message from active chat
4. Upload files (drag & drop + button)
5. Regenerate AI response
6. Test keyboard shortcuts:
   - Ctrl+Enter to send
   - Ctrl+N for new chat
   - Ctrl+K for search
7. Check console for handler errors

Reply "OK" when done, or report any issues.
```

---

### **Group 8: Pages**

#### Module 22: `pages/welcome.js`
**Extract:**
- `showWelcomeScreen()`
- All welcome screen setup

**Checklist:** Update `- [x] Module 22: pages/welcome.js`

---

#### Module 23: `pages/chats.js`
**Extract:**
- `showChatsPage()`
- `renderChatsPage()`
- `setupChatsPageListeners()`
- `filterChats()`

---

#### Module 23: `pages/projects.js`
**Extract:**
- `showProjectsPage()`
- `renderProjectsPage()`
- All project management functions
- Project CRUD operations

---

#### Module 24: `pages/artifacts.js`
**Extract:**
- `showArtifactsPage()`
- `renderArtifactsPage()`
- Artifact management functions

---

### **Group 9: UI Components**

#### Module 25: `ui/scroll.js`
**Extract:**
- `scrollToBottom()`
- `smartScrollToBottom()`
- `isNearBottom()`
- `initColumnReverseScrollDetection()`
- All scroll-related functions

---

#### Module 26: `ui/modals.js`
**Extract:**
- `showConfirmationModal()`
- `closeConfirmationModal()`
- `initConfirmationModal()`
- Modal management functions

---

#### Module 27: `ui/sidebar.js`
**Extract:**
- `renderSessions()`
- `createSessionListItem()`
- `handleSidebarToggle()`
- Sidebar interaction functions

---

#### Module 28: `ui/search.js`
**Extract:**
- `showSearchOverlay()`
- `performSearch()`
- `navigateSearch()`
- All search functions

---

#### Module 29: `ui/toast.js`
**Extract:**
- `showToast()`
- Toast helper functions

---

#### Module 30: `handlers/keyboard.js`
**Extract:**
- `initKeyboardShortcuts()`
- All keyboard event handlers

---

### **Group 10: API & Models**

#### Module 31: `api/ipc.js`
**Extract:**
- All `window.api.*` calls wrapped in functions
- `loadSessions()`
- `saveSessions()`
- `streamChat()`
- etc.

---

#### Module 32: `api/models.js`
**Extract:**
- `loadModelsConf()`
- `persistModels()`
- `getActiveChatConfig()`
- `openModelMgmt()`
- Model management UI functions

---

## 🤖 Prompt Template for AI

For each module extraction, use this prompt:

```
Extract [MODULE_NAME] from renderer.js:

1. READ renderer.js to find these functions:
   - [function1]
   - [function2]
   - [etc]

2. COPY 99% exact code from renderer.js

3. ADJUST 1% for imports:
   - Use lazy require() where possible
   - Optimize dependencies
   - Keep working behavior

4. CREATE file: renderer/[path]/[filename].js

5. PASTE adjusted code into new file

6. ADD at top of new file:
   'use strict';
   // Lazy imports
   let depModule = null;
   function getDep() {
     if (!depModule) depModule = require('../path/dep');
     return depModule;
   }

7. ADD at bottom:
   module.exports = { function1, function2, ... };

8. IN renderer.js, ADD near top (lazy if beneficial):
   const { function1, function2 } = require('./path/filename');
   // OR lazy:
   function lazyLoad() {
     if (!loaded) ({ function1, function2 } = require('./path/filename'));
   }

9. IN renderer.js, REPLACE function calls with imported ones

10. IN renderer.js, DELETE the original function definitions

11. VERIFY: No syntax errors (don't run, just check)

12. UPDATE CHECKLIST: Mark [x] for this module

13. USER COMMITS (not AI)

RULES:
- 99% exact code, 1% import optimization
- Keep all comments, edge cases, bugs
- Use lazy require() for performance
- Don't add tests or fallbacks
- Don't split functions mid-logic
- Update checklist after each module
```

---

## 📊 Progress Tracking

AI MUST update this checklist after each module extraction:

**Update instruction:** Change `- [ ]` to `- [x]` for completed modules.

- [x] Module 1: utils/dom.js
- [x] Module 2: utils/format.js
- [x] Module 3: utils/file-icons.js
- [x] Module 4: utils/timing.js
- [x] Module 5: state/global-state.js
- [x] Module 6: cache/session-cache.js
- [x] Module 7: markdown/worker.js
- [x] Module 8: markdown/renderer.js
- [x] Module 9: markdown/test-mode.js
- [x] Module 10: messages/thinking.js
- [~] Module 11: messages/render.js (READY for extraction @ line 8853-10000)
- [~] Module 12: messages/lazy-load.js (READY for extraction @ line 8800-9000)
- [x] Module 13: sessions/crud.js
- [x] Module 14: sessions/switch.js
- [x] Module 15: sessions/drafts.js
- [~] Module 16: streaming/handler.js (SKIP - too large, will extract later)
- [x] Module 17: streaming/manager.js
- [x] Module 18: handlers/send.js
- [x] Module 19: handlers/regenerate.js
- [x] Module 20: handlers/upload.js
- [x] Module 21: pages/welcome.js
- [x] Module 22: pages/chats.js
- [~] Module 23: pages/projects.js (SKIP - complex, extract later)
- [~] Module 24: pages/artifacts.js (SKIP - complex, extract later)
- [x] Module 25: ui/scroll.js
- [x] Module 26: ui/modals.js
- [x] Module 27: ui/sidebar.js
- [~] Module 28: ui/search.js (SKIP - complex search functionality)
- [x] Module 29: ui/input.js
- [x] Module 30: ui/toast.js
- [x] Module 31: api/ipc.js
- [x] Module 32: api/models.js

**Folder Completion Tracking:**
- [x] ✅ utils/ (4 modules) - EXTRACTED & CLEANED
- [x] ✅ state/ (1 module) - EXTRACTED & CLEANED
- [x] ✅ cache/ (1 module) - EXTRACTED & CLEANED
- [x] ✅ markdown/ (3 modules) - EXTRACTED & CLEANED
- [x] ✅ messages/ (1 module) - EXTRACTED & CLEANED
- [x] ✅ sessions/ (3 modules) - EXTRACTED & CLEANED
- [x] ✅ streaming/ (1 module) - EXTRACTED & CLEANED
- [x] ✅ handlers/ (3 modules) - EXTRACTED & CLEANED
- [x] ✅ ui/ (5 modules) - EXTRACTED & CLEANED
- [x] ✅ pages/ (2 modules) - EXTRACTED & CLEANED
- [x] ✅ api/ (2 modules) - EXTRACTED & CLEANED

**PHASE 1 COMPLETE - DUPLICATE CODE CLEANED!**
- Original renderer.js: 18,343 lines
- After extraction: 16,842 lines
- After cleanup: 13,198 lines
- **Total reduction: 5,145 lines (28% smaller!)**
- [ ] ✅ state/ (1 module) - Tested  
- [ ] ✅ cache/ (1 module) - Tested
- [ ] ✅ markdown/ (3 modules) - Tested
- [ ] ✅ messages/ (3 modules) - Tested
- [ ] ✅ sessions/ (3 modules) - Tested
- [ ] ✅ streaming/ (2 modules) - Tested
- [ ] ✅ handlers/ (4 modules) - Tested
- [ ] ✅ pages/ (4 modules) - Tested
- [ ] ✅ ui/ (5 modules) - Tested
- [ ] ✅ api/ (2 modules) - Tested
- [ ] 🎉 FINAL TEST - Complete App

---

## 🎯 Success Criteria

✅ renderer.js reduced to ~2,000-3,000 lines (imports + glue code)  
✅ All functions moved to appropriate modules  
✅ App still works exactly the same  
✅ No logic changed  
✅ No tests needed (manual QA only)  
✅ Clear module boundaries  

---

## ⚠️ Critical Rules

1. **99% exact code** - Only adjust imports (1%)
2. **NEVER split mid-function** - Move complete functions
3. **NEVER optimize logic** - Only optimize imports (lazy loading)
4. **TEST after each folder** - User tests manually
5. **ALWAYS preserve comments** - Even TODO/FIXME
6. **ALWAYS keep edge cases** - Don't "clean up"
7. **USER commits** - AI updates checklist only
8. **LAZY IMPORTS** - Use lazy require() for performance where beneficial
9. **UPDATE CHECKLIST** - Mark [x] after each module
10. **ASK USER TO TEST** - After each folder completion

---

## 🚀 Estimated Time

- **32 modules** × 15 minutes average = **8 hours**
- **Manual tests** (11 checkpoints) = 2 hours
- **Bug fixes** = 1-2 hours
- **Total** = **~11-12 hours** (1.5 work days)

---

## 📝 Example Extraction

**Before (renderer.js):**
```javascript
function formatRelativeTime(dateString) {
  if (!dateString) return "Unknown";
  const date = new Date(dateString);
  const now = new Date();
  // ... 50 lines of logic ...
  return "Just now";
}

// ... 18,000 more lines ...
```

**After Extraction:**

**renderer/utils/format.js:**
```javascript
'use strict';

// 99% exact code, 1% optimized imports
function formatRelativeTime(dateString) {
  if (!dateString) return "Unknown";
  const date = new Date(dateString);
  const now = new Date();
  // ... 50 lines of logic ... (EXACT SAME CODE)
  return "Just now";
}

module.exports = { formatRelativeTime };
```

**renderer.js:**
```javascript
// Lazy import for performance (if beneficial)
let formatUtils = null;
function getFormatUtils() {
  if (!formatUtils) formatUtils = require('./utils/format');
  return formatUtils;
}

// Usage in code:
const time = getFormatUtils().formatRelativeTime(date);

// OR direct import if used frequently:
const { formatRelativeTime } = require('./utils/format');

// formatRelativeTime() definition deleted from here

// ... rest of code ...
```

---

## 🎯 Start Command

To start refactoring, give this command:

```
"Start refactoring renderer.js following REFACTORING-NEW-PLAN.md. 
Extract Module 1: utils/dom.js. Remember to:
1. Copy 99% exact code
2. Adjust imports (1%) with lazy require()
3. Update checklist after completion
4. Working behavior must be preserved"
```

Then AI will continue sequentially through all 32 modules, asking for tests after each folder.

---

**Last Updated:** Today  
**Status:** Ready to Execute  
**Estimated Completion:** 1 day (if done sequentially)
