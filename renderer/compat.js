/**
 * Compatibility Layer
 * Provides backward compatibility during gradual migration from monolithic renderer.js to modular architecture
 *
 * This file exports global references to new modular services while maintaining the old API surface.
 * Once migration is complete, this file can be removed.
 */

// Import core modules
import { state, getState, setState, updateState, subscribe } from './core/state.js';
import { sessionCache, initSessionCache, getSessionCache } from './core/cache.js';
import ipc from './core/ipc.js';

// Import utils
import * as dom from './utils/dom.js';
import * as format from './utils/format.js';
import * as escape from './utils/escape.js';
import * as fileUtils from './utils/file.js';

// Import services
import sessionService from './services/session-service.js';
import messageService from './services/message-service.js';
import fileService from './services/file-service.js';
import markdownService from './services/markdown-service.js';
import streamService from './services/stream-service.js';

// ============================================
// GLOBAL EXPORTS FOR BACKWARD COMPATIBILITY
// ============================================

// Expose on window for legacy code
if (typeof window !== 'undefined') {
  // Core
  window._modular = {
    state,
    sessionCache,
    ipc,
    dom,
    format,
    escape,
    fileUtils,
    sessionService,
    messageService,
    fileService,
    markdownService,
    streamService
  };

  // State helpers (can replace global `state` variable gradually)
  window._getState = getState;
  window._setState = setState;
  window._updateState = updateState;
  window._subscribe = subscribe;

  // Session cache helpers
  window._getCachedSession = (sessionId) => sessionCache.get(sessionId);
  window._cacheSession = (sessionId, html, scroll, lazy) => sessionCache.set(sessionId, html, scroll, lazy);
  window._invalidateSessionCache = (sessionId) => sessionCache.invalidate(sessionId);
  window._clearSessionCache = () => sessionCache.clear();

  // IPC helpers (can replace direct window.api calls)
  window._ipc = ipc;

  // DOM helpers (can replace $ and $$ gradually)
  window._$ = dom.$;
  window._$$ = dom.$$;

  // Format helpers
  window._formatRelativeTime = format.formatRelativeTime;
  window._formatTimestamp = format.formatTimestamp;
  window._formatFileSize = format.formatFileSize;
  window._toExt = format.toExt;

  // Escape helpers
  window._escapeHtml = escape.escapeHtml;
  window._sanitizeUrl = escape.sanitizeUrl;

  // File helpers
  window._getFileIcon = fileUtils.getFileIcon;
  window._getFileType = fileUtils.getFileType;
  window._EXT_GROUPS = fileUtils.EXT_GROUPS;
  window._ICONS = fileUtils.ICONS;

  // Session service helpers
  window._createSession = (...args) => sessionService.create(...args);
  window._getSession = (id) => sessionService.get(id);
  window._updateSession = (...args) => sessionService.update(...args);
  window._deleteSession = (...args) => sessionService.delete(...args);
  window._saveSessions = (...args) => sessionService.save(...args);
  window._loadSessions = () => sessionService.load();
  window._markSessionDirty = (id) => sessionService.markDirty(id);

  // Message service helpers
  window._addMessage = (...args) => messageService.add(...args);
  window._getMessage = (...args) => messageService.get(...args);
  window._updateMessage = (...args) => messageService.update(...args);
  window._deleteMessage = (...args) => messageService.delete(...args);

  // File service helpers
  window._addFilesToSession = (...args) => fileService.addToSession(...args);
  window._getSessionFiles = (id) => fileService.getSessionFiles(id);
  window._getFilesForAI = (id) => fileService.getFilesForAI(id);
  window._uploadFiles = (id) => fileService.uploadToSession(id);

  // Markdown service helpers (wrapper only, logic tetap di md.js)
  window._renderMarkdown = (...args) => markdownService.render(...args);
  window._renderMarkdownSync = (...args) => markdownService.renderSync(...args);
  window._stripMarkdown = (md) => markdownService.stripMarkdown(md);

  // Stream service helpers (can replace streamManager gradually)
  window._streamManager = streamService;
  window._startStream = (...args) => streamService.startStream(...args);
  window._stopStream = (id) => streamService.stopStream(id);
  window._isStreaming = () => streamService.isStreaming();
  window._isStreamingInSession = (session) => streamService.isStreamingInSession(session);
}

// ============================================
// MIGRATION HELPERS
// ============================================

/**
 * Initialize compatibility layer
 * Call this early in the application lifecycle
 */
export function initCompatLayer() {
  console.log('[Compat] Initializing compatibility layer...');

  // Initialize session cache with logging
  initSessionCache({
    maxSize: 10,
    expiryMs: 15 * 60 * 1000,
    logHelper: (context, level, func, message, details) => {
      console.log(`[${context}] ${func}: ${message}`, details);
    }
  });

  // Note: Markdown worker initialization is handled by md.js
  // markdownService is just a wrapper - it doesn't manage workers

  console.log('[Compat] Compatibility layer initialized successfully');
}

/**
 * Get migration status
 * Useful for monitoring migration progress
 */
export function getMigrationStatus() {
  return {
    modulesLoaded: {
      core: {
        state: !!window._modular?.state,
        cache: !!window._modular?.sessionCache,
        ipc: !!window._modular?.ipc
      },
      utils: {
        dom: !!window._modular?.dom,
        format: !!window._modular?.format,
        escape: !!window._modular?.escape,
        file: !!window._modular?.fileUtils
      },
      services: {
        session: !!window._modular?.sessionService,
        message: !!window._modular?.messageService,
        file: !!window._modular?.fileService,
        markdown: !!window._modular?.markdownService,
        stream: !!window._modular?.streamService
      }
    },
    globalHelpersAvailable: {
      state: typeof window._getState === 'function',
      cache: typeof window._getCachedSession === 'function',
      ipc: !!window._ipc,
      dom: typeof window._$ === 'function',
      format: typeof window._formatRelativeTime === 'function',
      escape: typeof window._escapeHtml === 'function',
      file: typeof window._getFileIcon === 'function',
      session: typeof window._createSession === 'function',
      message: typeof window._addMessage === 'function',
      fileService: typeof window._addFilesToSession === 'function',
      markdown: typeof window._renderMarkdown === 'function',
      stream: !!window._streamManager
    }
  };
}

/**
 * Print migration guide
 * Helpful for developers during migration
 */
export function printMigrationGuide() {
  console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║                      MODULAR MIGRATION GUIDE                         ║
╚══════════════════════════════════════════════════════════════════════╝

The compatibility layer provides backward-compatible APIs while you migrate.

CORE MODULES:
  state     → window._modular.state or window._getState()
  cache     → window._modular.sessionCache or window._getCachedSession()
  ipc       → window._modular.ipc or window._ipc

UTILS:
  DOM       → window._modular.dom or window._$()
  Format    → window._modular.format or window._formatRelativeTime()
  Escape    → window._modular.escape or window._escapeHtml()
  File      → window._modular.fileUtils or window._getFileIcon()

SERVICES:
  Session   → window._modular.sessionService or window._createSession()
  Message   → window._modular.messageService or window._addMessage()
  File      → window._modular.fileService or window._getSessionFiles()
  Markdown  → window._modular.markdownService or window._renderMarkdown()
  Stream    → window._modular.streamService or window._streamManager

MIGRATION STEPS:
  1. Import the module in your code:
     import sessionService from './services/session-service.js';

  2. Replace old API calls with new ones:
     OLD: state.sessions.push(newSession)
     NEW: await sessionService.create([], options)

  3. Test thoroughly

  4. Once all code is migrated, remove compatibility layer

For status: getMigrationStatus()
  `);
}

// Auto-initialize when loaded
if (typeof window !== 'undefined') {
  initCompatLayer();

  // Log status in development
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    const status = getMigrationStatus();
    console.log('[Compat] Migration Status:', status);
    console.log('[Compat] Type printMigrationGuide() for help');
    window.printMigrationGuide = printMigrationGuide;
    window.getMigrationStatus = getMigrationStatus;
  }
}

// Export all modules for ES module imports
export {
  // Core
  state,
  getState,
  setState,
  updateState,
  subscribe,
  sessionCache,
  ipc,

  // Utils
  dom,
  format,
  escape,
  fileUtils,

  // Services
  sessionService,
  messageService,
  fileService,
  markdownService,
  streamService
};
