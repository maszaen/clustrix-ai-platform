# Integration Guide: Using Modular Architecture

This guide shows how to integrate the new modular services into renderer.js gradually.

## Current Status

✅ **Modules Created** (13 modules - ~5,200 lines)
- 7 foundation modules (core + utils)
- 5 service modules
- 1 compatibility layer

🔄 **Integration Status**: Ready but not yet integrated into renderer.js

## Quick Start

### Option 1: Add Compat Layer to renderer.js (Easiest)

Add this single line at the top of renderer.js after existing imports:

```javascript
import './compat.js';
```

This will:
- Initialize all modular services
- Expose them on `window._modular` for immediate use
- Provide backward-compatible helper functions (e.g., `window._createSession()`)
- Keep all existing code working

### Option 2: Direct Module Import (Recommended for new code)

For new features or refactored sections, import modules directly:

```javascript
import sessionService from './services/session-service.js';
import messageService from './services/message-service.js';
import markdownService from './services/markdown-service.js';

// Use the services
const session = await sessionService.create();
await messageService.add(session.id, 'user', 'Hello!');
const html = await markdownService.render('# Title');
```

## Migration Examples

### Example 1: Replace Global State Access

**Before (renderer.js):**
```javascript
let sessions = [];
let currentSession = null;

function doSomething() {
  if (currentSession) {
    // ...
  }
}
```

**After:**
```javascript
import { getState, setState } from './core/state.js';

function doSomething() {
  const currentSession = getState('currentSession');
  if (currentSession) {
    // ...
  }
}
```

### Example 2: Replace Session Operations

**Before (renderer.js):**
```javascript
function createNewSession() {
  const newSession = {
    id: generateID(),
    messages: [],
    created_at: new Date().toISOString(),
    // ...
  };
  sessions.unshift(newSession);
  await window.api.sessions.save(sessions);
  return newSession;
}
```

**After:**
```javascript
import sessionService from './services/session-service.js';

async function createNewSession() {
  return await sessionService.create();
}
```

### Example 3: Replace Markdown Rendering

**Before (renderer.js):**
```javascript
const html = await md(markdownContent);
```

**After (using compat layer):**
```javascript
// Method 1: Direct call (no change needed, md() still works)
const html = await md(markdownContent);

// Method 2: Via service wrapper
import markdownService from './services/markdown-service.js';
const html = await markdownService.render(markdownContent);
```

**Note**: Both methods call the same underlying perfect md.js logic!

### Example 4: Replace Message Operations

**Before (renderer.js):**
```javascript
function addMessageToSession(sessionId, role, content) {
  const session = sessions.find(s => s.id === sessionId);
  if (session) {
    session.messages.push([role, content, {}]);
    session.last_updated = new Date().toISOString();
    markSessionDirty(sessionId);
    await saveSessions();
  }
}
```

**After:**
```javascript
import messageService from './services/message-service.js';

async function addMessageToSession(sessionId, role, content) {
  await messageService.add(sessionId, role, content);
}
```

### Example 5: Replace File Operations

**Before (renderer.js):**
```javascript
async function uploadFilesToSession(sessionId) {
  const files = await window.api.files.openDialogAndRead();
  const session = sessions.find(s => s.id === sessionId);
  if (session) {
    session.uploadedFiles.push(...files);
    await saveSessions();
  }
}
```

**After:**
```javascript
import fileService from './services/file-service.js';

async function uploadFilesToSession(sessionId) {
  const result = await fileService.uploadToSession(sessionId);
  return result.files;
}
```

### Example 6: Replace Stream Management

**Before (renderer.js):**
```javascript
const streamManager = {
  activeStreams: {},
  startStream(id, data) { /* ... */ },
  stopStream(id) { /* ... */ }
};

streamManager.startStream('stream-1', { session, messageIndex: 0 });
```

**After:**
```javascript
import streamService from './services/stream-service.js';

streamService.startStream('stream-1', { session, messageIndex: 0 });
```

## Module Reference

### Core Modules

#### state.js - State Management
```javascript
import { getState, setState, updateState, subscribe } from './core/state.js';

// Get state
const sessions = getState('sessions');
const theme = getState('settings.theme');

// Set state
setState('currentSession', session);
setState('ui.currentPage', 'chats');

// Update state (merge)
updateState('settings', { theme: 'dark' });

// Subscribe to changes
subscribe('currentSession', (newSession) => {
  console.log('Session changed:', newSession);
});
```

#### cache.js - Session Cache
```javascript
import { sessionCache } from './core/cache.js';

// Cache session HTML
sessionCache.set(sessionId, renderedHTML, scrollPosition, lazyState);

// Get cached session
const cached = sessionCache.get(sessionId);
if (cached) {
  messageList.innerHTML = cached.html;
  messageList.scrollTop = cached.scrollPosition;
}

// Invalidate cache
sessionCache.invalidate(sessionId);
```

#### ipc.js - IPC Communication
```javascript
import ipc from './core/ipc.js';

// Load sessions
const sessions = await ipc.loadSessions();

// Save sessions
await ipc.saveSessions(sessions);

// Open file dialog
const files = await ipc.openDialogAndRead();
```

### Service Modules

#### session-service.js
```javascript
import sessionService from './services/session-service.js';

// Create session
const session = await sessionService.create([], { type: 'regular' });

// Get session
const session = sessionService.get(sessionId);

// Update session
await sessionService.update(sessionId, { name: 'New Name' });

// Delete session
await sessionService.delete(sessionId);

// Save (with incremental optimization)
await sessionService.save();
```

#### message-service.js
```javascript
import messageService from './services/message-service.js';

// Add message
await messageService.add(sessionId, 'user', 'Hello!');

// Get message
const msg = messageService.get(sessionId, 0);

// Update message
await messageService.update(sessionId, 0, 'Updated content');

// Delete message
await messageService.delete(sessionId, 0);

// Get statistics
const stats = messageService.getStats(sessionId);
```

#### file-service.js
```javascript
import fileService from './services/file-service.js';

// Upload files
const result = await fileService.uploadToSession(sessionId);

// Get files for AI
const files = fileService.getFilesForAI(sessionId);

// Remove file
await fileService.removeFromSession(sessionId, fileIndex);

// Get statistics
const stats = fileService.getStats(sessionId);
```

#### markdown-service.js (WRAPPER ONLY)
```javascript
import markdownService from './services/markdown-service.js';

// Render markdown (async, uses worker)
const html = await markdownService.render(markdown);

// Render synchronously
const html = markdownService.renderSync(markdown);

// Utility methods
const stripped = markdownService.stripMarkdown(markdown);
const blocks = markdownService.extractCodeBlocks(markdown);
const links = markdownService.extractLinks(markdown);
const stats = markdownService.getStats(markdown);
```

**IMPORTANT**: This service is a WRAPPER ONLY. All rendering logic stays in md.js and md.worker.js. No logic changes!

#### stream-service.js
```javascript
import streamService from './services/stream-service.js';

// Start stream
streamService.startStream(streamId, {
  session,
  messageIndex: 0,
  controller: abortController
});

// Stop stream
streamService.stopStream(streamId);

// Check if streaming
if (streamService.isStreaming()) {
  // ...
}

// Get stream info
const info = streamService.getStreamInfo(streamId);
```

## Backward Compatibility

All existing code continues to work through the compat layer:

```javascript
// Old style (still works)
window._createSession();
window._addMessage(sessionId, 'user', 'Hello');
window._renderMarkdown(markdown);

// New style (recommended)
import sessionService from './services/session-service.js';
sessionService.create();
```

## Migration Strategy

### Phase 1: Add Compat Layer (5 minutes)
1. Add `import './compat.js';` to renderer.js
2. Test that everything still works
3. No code changes needed

### Phase 2: Gradual Migration (weeks/months)
1. When adding new features, use direct module imports
2. When refactoring existing code, migrate to modular services
3. Keep both old and new code working side-by-side

### Phase 3: Complete Migration (future)
1. Once all code uses modular services, remove compat.js
2. Remove redundant code from renderer.js
3. Celebrate clean, maintainable codebase!

## Testing Integration

To test if modules are working correctly:

```javascript
// In browser console
console.log(window._modular); // Should show all modules

// Test state
window._getState('sessions');
window._setState('ui.currentPage', 'test');

// Test session service
await window._createSession();

// Test markdown service
await window._renderMarkdown('# Test');
```

## Common Pitfalls

### ❌ Don't: Change Logic in markdown-service.js
```javascript
// WRONG - Don't add rendering logic
renderSync(markdown) {
  return markdown.replace(/^# /gm, '<h1>'); // NO!
}
```

### ✅ Do: Keep it as Wrapper
```javascript
// CORRECT - Delegate to existing functions
renderSync(markdown) {
  return window.mdFallback(markdown); // YES!
}
```

### ❌ Don't: Bypass Services
```javascript
// WRONG - Direct state mutation
window._modular.state._state.sessions.push(newSession); // NO!
```

### ✅ Do: Use Service Methods
```javascript
// CORRECT - Use service API
await sessionService.create(); // YES!
```

## Benefits of Modular Architecture

1. **Easier Testing**: Each module can be tested independently
2. **Better Organization**: Clear separation of concerns
3. **Reduced Conflicts**: Smaller files = fewer merge conflicts
4. **Clearer Dependencies**: Explicit imports show what depends on what
5. **Better Performance**: Can optimize individual modules
6. **Easier Onboarding**: New developers can understand specific modules
7. **Future-Proof**: Easy to refactor or replace individual modules

## Next Steps

1. **Review modules**: Familiarize yourself with module structure
2. **Add compat layer**: Single line import for backward compatibility
3. **Test thoroughly**: Ensure existing functionality works
4. **Gradual migration**: Use modular services for new features
5. **Monitor progress**: Track how much code has been migrated

## Questions?

Check [MODULAR.md](MODULAR.md) for:
- Complete module list with line counts
- Architecture overview
- Migration roadmap
- Future phases (Week 3-6)

---

**Remember**: The goal is gradual migration with ZERO breaking changes. All existing perfect logic is preserved!
