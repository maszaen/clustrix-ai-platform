'use strict';

const { createLogger } = require('../utils/logger');
const { DEBUG_MODE } = require('../core/constants');

function resolveWindow(windowAlias) {
  if (windowAlias) return windowAlias;
  if (typeof window !== 'undefined') return window;
  return {};
}

function safeInvoke(fn, args, { logger, scope, fallback } = {}) {
  if (typeof fn !== 'function') {
    if (fallback !== undefined) {
      return typeof fallback === 'function' ? fallback() : fallback;
    }
    logger?.warn(scope, 'API bridge unavailable');
    return undefined;
  }
  try {
    return fn(...args);
  } catch (error) {
    logger?.error(scope, 'API call failed', { error: error.message });
    throw error;
  }
}

function wrapEventHandler(handler, logger, scope) {
  if (typeof handler !== 'function') return handler;
  return (...eventArgs) => {
    try {
      handler(...eventArgs);
    } catch (error) {
      logger?.error(scope, 'Event handler threw', { error: error.message });
    }
  };
}

function createApiService(opts = {}) {
  const {
    windowAlias,
    logger = createLogger('API'),
    debugMode = DEBUG_MODE,
  } = opts;
  const hostWindow = resolveWindow(windowAlias);
  const api = hostWindow.api || {};

  const sessions = {
    async load() {
      if (debugMode) {
        return null;
      }
      return safeInvoke(api.sessions?.load, [], {
        logger,
        scope: 'sessions.load',
        fallback: null,
      });
    },
    async save(payload) {
      if (debugMode) {
        return hostWindow.localStorage?.setItem?.(
          'clustrix-data',
          JSON.stringify(payload),
        );
      }
      return safeInvoke(api.sessions?.save, [payload], {
        logger,
        scope: 'sessions.save',
      });
    },
  };

  const projects = {
    async load() {
      return safeInvoke(api.projects?.load, [], {
        logger,
        scope: 'projects.load',
        fallback: () => [],
      });
    },
    async save(data) {
      return safeInvoke(api.projects?.save, [data], {
        logger,
        scope: 'projects.save',
      });
    },
  };

  const artifacts = {
    async load() {
      return safeInvoke(api.artifacts?.load, [], {
        logger,
        scope: 'artifacts.load',
        fallback: () => [],
      });
    },
    async save(data) {
      return safeInvoke(api.artifacts?.save, [data], {
        logger,
        scope: 'artifacts.save',
      });
    },
  };

  const models = {
    async load() {
      return safeInvoke(api.models?.load, [], {
        logger,
        scope: 'models.load',
        fallback: () => null,
      });
    },
    async save(config) {
      if (debugMode) return null;
      return safeInvoke(api.models?.save, [config], {
        logger,
        scope: 'models.save',
      });
    },
  };

  const files = {
    async openDialogAndRead(options) {
      return safeInvoke(api.files?.openDialogAndRead, [options], {
        logger,
        scope: 'files.openDialogAndRead',
        fallback: () => null,
      });
    },
  };

  const chat = {
    stream(messages, model, options, handler) {
      return safeInvoke(
        api.chat?.stream,
        [messages, model, options, wrapEventHandler(handler, logger, 'chat.stream')],
        {
          logger,
          scope: 'chat.stream',
          fallback: () => ({
            cancel() {},
          }),
        },
      );
    },
    async titleSuggest(prompt, model, metadata) {
      return safeInvoke(
        api.chat?.titleSuggest,
        [prompt, model, metadata],
        {
          logger,
          scope: 'chat.titleSuggest',
          fallback: () => null,
        },
      );
    },
  };

  const logging = {
    write(entry) {
      return safeInvoke(api.logging?.write, [entry], {
        logger,
        scope: 'logging.write',
      });
    },
  };

  const windowControls = {
    minimize() {
      return safeInvoke(api.window?.minimize, [], {
        logger,
        scope: 'window.minimize',
      });
    },
    maximize() {
      return safeInvoke(api.window?.maximize, [], {
        logger,
        scope: 'window.maximize',
      });
    },
    close() {
      return safeInvoke(api.window?.close, [], {
        logger,
        scope: 'window.close',
      });
    },
  };

  const htmlPreview = {
    async create(html) {
      return safeInvoke(api.htmlPreview?.create, [html], {
        logger,
        scope: 'htmlPreview.create',
        fallback: () => null,
      });
    },
    async delete(previewId) {
      return safeInvoke(api.htmlPreview?.delete, [previewId], {
        logger,
        scope: 'htmlPreview.delete',
      });
    },
  };

  const app = {
    async restart() {
      return safeInvoke(api.app?.restart, [], {
        logger,
        scope: 'app.restart',
      });
    },
    async getProfilePhoto() {
      return safeInvoke(api.app?.getProfilePhoto, [], {
        logger,
        scope: 'app.getProfilePhoto',
        fallback: () => null,
      });
    },
    async getDefaultProfilePhoto() {
      return safeInvoke(api.app?.getDefaultProfilePhoto, [], {
        logger,
        scope: 'app.getDefaultProfilePhoto',
        fallback: () => null,
      });
    },
  };

  const sync = {
    async getConfig() {
      return safeInvoke(api.sync?.getConfig, [], {
        logger,
        scope: 'sync.getConfig',
        fallback: () => null,
      });
    },
    async startOAuth() {
      return safeInvoke(api.sync?.startOAuth, [], {
        logger,
        scope: 'sync.startOAuth',
        fallback: () => ({ success: false }),
      });
    },
    async logout(options) {
      return safeInvoke(api.sync?.logout, [options], {
        logger,
        scope: 'sync.logout',
        fallback: () => ({ success: false }),
      });
    },
    async syncNow() {
      return safeInvoke(api.sync?.syncNow, [], {
        logger,
        scope: 'sync.syncNow',
        fallback: () => ({ success: false }),
      });
    },
    async backupNow() {
      return safeInvoke(api.sync?.backupNow, [], {
        logger,
        scope: 'sync.backupNow',
        fallback: () => ({ success: false }),
      });
    },
    async recordActionHistory(category, status, metadata) {
      return safeInvoke(api.sync?.recordActionHistory, [category, status, metadata], {
        logger,
        scope: 'sync.recordActionHistory',
      });
    },
    async getActionHistory() {
      return safeInvoke(api.sync?.getActionHistory, [], {
        logger,
        scope: 'sync.getActionHistory',
        fallback: () => [],
      });
    },
    async switchMode(payload) {
      return safeInvoke(api.sync?.switchMode, [payload], {
        logger,
        scope: 'sync.switchMode',
        fallback: () => ({ success: false }),
      });
    },
    async resolveConflicts(resolutions) {
      return safeInvoke(api.sync?.resolveConflicts, [resolutions], {
        logger,
        scope: 'sync.resolveConflicts',
        fallback: () => ({ success: false }),
      });
    },
  };

  const events = {
    on(channel, handler) {
      return safeInvoke(api.on, [channel, wrapEventHandler(handler, logger, `events.on:${channel}`)], {
        logger,
        scope: 'events.on',
      });
    },
    off(channel, handler) {
      if (typeof api.off === 'function') {
        return safeInvoke(api.off, [channel, handler], {
          logger,
          scope: 'events.off',
        });
      }
      if (typeof api.removeListener === 'function') {
        return safeInvoke(api.removeListener, [channel, handler], {
          logger,
          scope: 'events.removeListener',
        });
      }
      return undefined;
    },
  };

  function isAvailable() {
    return Boolean(hostWindow.api);
  }

  return {
    debugMode,
    isAvailable,
    sessions,
    projects,
    artifacts,
    models,
    files,
    chat,
    logging,
    window: windowControls,
    htmlPreview,
    app,
    sync,
    events,
  };
}

module.exports = {
  createApiService,
};
