# Renderer Refactoring Guide

## 📁 New Modular Structure

```
renderer/
├── core/           # Core system (state, app lifecycle)
├── managers/       # Business logic managers
├── services/       # External API services
├── rendering/      # UI rendering logic
├── ui/             # UI utilities & components
├── handlers/       # Event handlers
└── utils/          # Pure utility functions
```

## ✅ Phase 1: Utilities (COMPLETED)

**Status**: ✅ Extracted and ready to integrate

### Extracted Modules:
- `utils/domUtils.js` - DOM helpers ($, $$, esc, domCache)
- `utils/formatters.js` - Formatting functions (formatRelativeTime, formatUserMessage)
- `utils/debounce.js` - Timing control (debounce, throttle)

### Integration Plan:
```javascript
// In renderer.js, add at top:
import { $, $$, esc, domCache } from './utils/domUtils.js';
import { formatRelativeTime, formatUserMessage, nowISO } from './utils/formatters.js';
import { debounce, throttle } from './utils/debounce.js';

// Remove old implementations from renderer.js
```

## ✅ Phase 2: Core & Managers (IN PROGRESS)

**Status**: 🔄 Modules created, integration pending

### Extracted Modules:
- `core/state.js` - Global state management
- `managers/cacheManager.js` - Session cache with LRU
- `managers/streamManager.js` - Active streams management

### Integration Plan:
```javascript
// Import state
import { 
  state, current, setCurrent, 
  welcomeScreenStagedFiles, updateWelcomeScreenStagedFiles
} from './core/state.js';

// Import managers
import { getCachedSession, cacheSession, clearSessionCache } from './managers/cacheManager.js';
import { streamManager } from './managers/streamManager.js';

// Replace old implementations
```

## 🔜 Next Phases

### Phase 3: Rendering Modules
- `rendering/markdown/markdownRenderer.js`
- `rendering/messages/messageRenderer.js`
- `rendering/messages/thinkingUI.js`
- `rendering/pages/welcomePage.js`
- `rendering/pages/chatsPage.js`

### Phase 4: Handlers & Services
- `handlers/messageHandlers.js`
- `handlers/sessionHandlers.js`
- `services/apiService.js`
- `services/modelService.js`

### Phase 5: UI Components
- `ui/modals/modalManager.js`
- `ui/scrolling/scrollManager.js`
- `ui/navigation.js`

## 📊 Progress Tracker

- [ ] Directory structure created
- [ ] Phase 1: Utilities extracted
- [ ] Phase 2: Core & managers extracted
- [ ] Phase 2: Integration & testing
- [ ] Phase 3: Rendering modules
- [ ] Phase 4: Handlers & services
- [ ] Phase 5: UI components
- [ ] Final testing & cleanup

## 🚀 How to Continue

1. **Test utilities**: Verify no breakage after importing utils
2. **Integrate state**: Replace global variables with state module
3. **Integrate managers**: Replace inline logic with manager calls
4. **Repeat** for each phase incrementally
5. **Do all phase**

## ⚠️ Safety Rules

1. **Never break the app**: Test after each extraction
3. **Incremental changes**: Small steps, frequent tests
4. **Document changes**: Update this file as you progress
5. **Refactor the code**: Cleaning the code, but dont change the logic and functionnality, only refactor if necessary

## Additional Recommended Changes

1. Delete unused files
2. Delete unused .md

## Important
1. For better understanding, if you can read renderer.js files in one shot 16000++ lines of code, just do