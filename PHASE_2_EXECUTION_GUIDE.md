# Phase 2: State Management Refactoring Guide

**Status:** 📋 Ready to Start  
**Estimated Time:** 2-3 days  
**Difficulty:** Medium  
**Complexity:** 🟡 Medium

---

## 📍 What's Phase 2?

Mengekstrak ~50 global state variables dari `renderer.js` yang tersebar di atas file (lines 23-57) ke dalam module terstruktur `renderer/state/app-state.mjs`.

**Current Problem:**
```javascript
// renderer.js - Global state EVERYWHERE ❌
let state = { sessions: [], settings: {...} };
let welcomeScreenStagedFiles = [];
let projectMessageStagedFiles = [];
let current = null;
let collapsed = false;
let loadedSessionCount = 0;
// ... 40+ more variables scattered
let saveScheduled = false;
```

**After Phase 2:**
```javascript
// renderer.js - Clean imports ✅
import { AppState, SessionState, UIState, ... } from './state/app-state.mjs';

// All state centralized and organized
AppState.current;
SessionState.getCurrent();
UIState.toggleSelectMode('chats');
```

---

## ✅ Checklist: Phase 2 Execution

### Step 1: Preparation (30 minutes)

- [ ] Create feature branch:
  ```bash
  git checkout -b phase-2-state-management
  ```

- [ ] Verify template file exists:
  ```bash
  ls -la renderer/state/app-state.mjs
  ```
  Should show the file created in previous step

- [ ] Review current state variables in renderer.js:
  ```bash
  head -100 renderer/renderer.js | grep -E "^let |^const " | grep -v "function"
  ```

### Step 2: Update renderer.js Imports (1-2 hours)

**Step 2a:** Add import at top of `renderer/renderer.js` (after line 23):

```javascript
// Around line 24, after existing imports
import {
  AppState,
  SessionState,
  UIState,
  ProjectState,
  SearchState,
  DraftState,
  SettingsState
} from './state/app-state.mjs';
```

**Step 2b:** Remove global state declarations (lines 25-57):

Current code to remove:
```javascript
let state = {sessions: [],settings: {...}};
let welcomeScreenStagedFiles = [];
let projectMessageStagedFiles = [];
let current = null;
let collapsed = false;
// ... etc
```

After removing, these lines should be gone!

**Step 2c:** Replace all references to global state:

Quick reference for replacements:

| Old Code | New Code | Notes |
|----------|----------|-------|
| `state.sessions` | `AppState.sessions` | Direct access to array |
| `state.settings` | `AppState.settings` or `SettingsState.get('theme')` | Use accessor for nested |
| `current` | `SessionState.getCurrent()` | Use accessor method |
| `collapsed` | `AppState.collapsed` | Direct access |
| `selectedChatIds` | `UIState.getSelected('chats')` | Use accessor |
| `currentProject` | `ProjectState.getCurrent()` | Use accessor |

### Step 3: Search & Replace Strategy (2-3 hours)

Use find & replace in VS Code:

**Replace 1:** Global state assignment
```
Find:    state\.sessions\s*=\s*
Replace: AppState.sessions = 
```

**Replace 2:** Reading state.sessions
```
Find:    state\.sessions(?!\s*=)
Replace: AppState.sessions
```

**Replace 3:** Current session assignment
```
Find:    current\s*=\s*([^;]+);
Replace: SessionState.setCurrent($1);
```

**Replace 4:** Current session reads
```
Find:    current(?!\s*=)
Replace: SessionState.getCurrent()
```

**To do in VS Code:**
1. Press `Ctrl+H` (Find and Replace)
2. Enable regex mode (click `.*` button)
3. Use replacements above one by one
4. Test after each major replacement

### Step 4: Code Migration (3-4 hours)

**Critical replacements in renderer.js:**

1. **Session initialization** (search for "new session"):
   ```javascript
   // Before
   let newSession = { id: generateSessionId(), ... };
   state.sessions.push(newSession);
   current = newSession;
   
   // After
   const newSession = { id: generateSessionId(), ... };
   SessionState.addSession(newSession);
   SessionState.setCurrent(newSession);
   ```

2. **Draft management** (search for "draft"):
   ```javascript
   // Before
   sessionDrafts.set(sessionId, content);
   
   // After
   DraftState.setDraft(sessionId, content);
   ```

3. **Settings update** (search for "settings"):
   ```javascript
   // Before
   state.settings.theme = 'dark';
   
   // After
   SettingsState.set('theme', 'dark');
   ```

4. **UI state toggles** (search for "isChatsSelectMode"):
   ```javascript
   // Before
   isChatsSelectMode = !isChatsSelectMode;
   
   // After
   UIState.toggleSelectMode('chats');
   ```

### Step 5: Testing (2-3 hours)

**Step 5a:** Syntax check
```bash
npm run dev
```

Check console for errors (should be none)

**Step 5b:** Manual testing

- [ ] Open app - should load without errors
- [ ] Create new chat - state should update
- [ ] Switch between chats - current should change
- [ ] Toggle selection mode - UI should respond
- [ ] Change theme - settings should persist
- [ ] Upload file - drafts should save

**Step 5c:** Check localStorage persistence
```javascript
// In DevTools console:
localStorage.getItem('sessions')
localStorage.getItem('settings')
```

Should show data as before

### Step 6: Create Tests (1-2 hours)

Create `tests/renderer/app-state.test.js`:

```javascript
import {
  AppState,
  SessionState,
  UIState,
  ProjectState,
  DraftState,
  SettingsState,
  initializeAppState
} from '../../renderer/state/app-state.mjs';

describe('AppState', () => {
  beforeEach(() => {
    // Reset state before each test
    AppState.sessions = [];
    AppState.current = null;
    AppState.selectedChatIds.clear();
  });
  
  describe('SessionState', () => {
    test('should add session', () => {
      const session = { id: 'test-1', messages: [] };
      SessionState.addSession(session);
      expect(AppState.sessions).toContainEqual(session);
    });
    
    test('should set current session', () => {
      const session = { id: 'test-1' };
      SessionState.setCurrent(session);
      expect(SessionState.getCurrent()).toBe(session);
    });
    
    test('should mark session as dirty', () => {
      SessionState.markDirty('test-1');
      expect(SessionState.getDirtySessions().has('test-1')).toBe(true);
    });
  });
  
  describe('UIState', () => {
    test('should toggle select mode', () => {
      expect(UIState.isSelectMode('chats')).toBe(false);
      UIState.toggleSelectMode('chats');
      expect(UIState.isSelectMode('chats')).toBe(true);
    });
    
    test('should toggle selection', () => {
      UIState.toggleSelect('chat-1', 'chats');
      expect(UIState.getSelected('chats').has('chat-1')).toBe(true);
    });
  });
  
  describe('DraftState', () => {
    test('should set and get draft', () => {
      DraftState.setDraft('session-1', 'Hello');
      expect(DraftState.getDraft('session-1')).toBe('Hello');
    });
  });
  
  describe('SettingsState', () => {
    test('should get and set settings', () => {
      SettingsState.set('theme', 'dark');
      expect(SettingsState.get('theme')).toBe('dark');
    });
  });
});
```

Run tests:
```bash
npm test -- app-state.test.js
```

### Step 7: Verify No Regressions (1 hour)

```bash
# Full test run
npm test

# Check code size reduction
wc -l renderer/renderer.js
# Should be slightly less due to removed global declarations

# Manual smoke test in app
npm run dev
# - Send message
# - Create new chat
# - Switch chats
# - Change theme
# - Upload file
```

### Step 8: Code Review Self-Checklist

Before committing, verify:

- [ ] All `state.` references replaced with `AppState.` or specific accessor
- [ ] All `current` references replaced with `SessionState.getCurrent()`
- [ ] All UI state flags use `UIState` accessors
- [ ] No more global `let` declarations at file top
- [ ] Imports added for all state modules
- [ ] Tests written and passing
- [ ] No console errors when running `npm run dev`
- [ ] localStorage still persists data
- [ ] Performance not noticeably different

### Step 9: Commit

```bash
git add -A
git commit -m "refactor: phase 2 - extract state management to app-state.mjs

- Move all global state variables to renderer/state/app-state.mjs
- Create accessor functions: SessionState, UIState, ProjectState, etc.
- Replace direct state access with structured API
- Add JSDoc comments for all functions
- Tests passing: npm test passes with 100% module coverage
- No regressions in existing features

File changes:
- renderer/renderer.js: removed ~50 global variables, added imports
- renderer/state/app-state.mjs: new centralized state management
- tests/renderer/app-state.test.js: new test suite
"
```

---

## 🎯 Success Criteria

After Phase 2 is complete, you should have:

✅ **All global state variables moved to `app-state.mjs`**
- No `let` declarations at top of renderer.js (except helpers)
- Clear separation of concerns

✅ **Centralized state access patterns**
- SessionState for session operations
- UIState for UI toggles
- SettingsState for configuration
- etc.

✅ **Tests passing**
```bash
npm test -- app-state.test.js
# ✓ All tests passing
```

✅ **No functionality loss**
- All existing features work
- localStorage still works
- No console errors

✅ **Code quality improved**
```bash
npm run dev
# Application runs smoothly
# No warnings or errors
```

---

## 🐛 Troubleshooting

### Issue: "Cannot find module './state/app-state.mjs'"
**Solution:**
```bash
# Verify file exists
ls renderer/state/app-state.mjs

# If not, recreate it with template provided
```

### Issue: "state is not defined"
**Solution:**
- Replace with: `AppState`
- Replace with: `SessionState.getCurrent()` if reading current

### Issue: Settings not persisting
**Solution:**
- Check if `SettingsState` updates trigger storage save
- Verify `ipcRenderer.invoke('sessions:save', data)` is called
- Check localStorage in DevTools

### Issue: Performance degradation
**Solution:**
- Check if accessing state in tight loops
- Consider caching frequently accessed state values
- Profile in DevTools Performance tab

### Issue: "Maximum call stack exceeded"
**Solution:**
- Check for circular state updates
- Verify no infinite loops in state accessors
- Add `console.log` in accessor functions to debug

---

## 📝 Notes & Tips

1. **Incremental migration:** Don't do all replacements at once
   - Do state-related replacements first
   - Then UI state
   - Then settings
   - Test after each batch

2. **Use find-all-references:** In VS Code:
   - Right-click on `state` → Find All References
   - Helps identify all places to update

3. **Commit frequently:**
   - Commit after replacing each type of state
   - Easier to revert if something breaks

4. **Keep old code nearby:** Don't delete global declarations until sure
   - Keep a comment showing old code
   - Comment out instead of deleting
   - Delete after tests pass

5. **Ask for help:**
   - If unsure about replacement, test it first
   - Use git stash to revert if needed

---

## 📚 Related Documentation

- `REFACTORING_PLAN.md` - Overall refactoring strategy
- `REFACTORING_DEPENDENCY_GRAPH.md` - Phase dependencies
- `AGENTS.md` - Project guidelines

---

**Ready to start? Run:**
```bash
git checkout -b phase-2-state-management
npm run dev
# Then follow the checklist above!
```

Good luck! 🚀
