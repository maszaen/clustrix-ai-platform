'use strict';

function getLoggerFactory() {
  if (typeof require === 'function') {
    try {
      return require('../utils/logger').createLogger;
    } catch (error) {
      console.warn('[session-handlers] Logger require failed:', error?.message);
    }
  }
  if (typeof window !== 'undefined' && window.__utilModules?.createLogger) {
    return window.__utilModules.createLogger;
  }
  return (namespace) => ({
    debug: (...args) => console.debug(`[${namespace}]`, ...args),
    info: (...args) => console.info(`[${namespace}]`, ...args),
    warn: (...args) => console.warn(`[${namespace}]`, ...args),
    error: (...args) => console.error(`[${namespace}]`, ...args),
  });
}

function getNowISO() {
  if (typeof require === 'function') {
    try {
      return require('../utils/formatters').nowISO;
    } catch (error) {
      console.warn('[session-handlers] nowISO require failed:', error?.message);
    }
  }
  if (typeof window !== 'undefined' && window.__utilModules?.nowISO) {
    return window.__utilModules.nowISO;
  }
  return () => new Date().toISOString();
}

function defaultIdFactory() {
  return `session_${Math.random().toString(36).slice(2, 10)}`;
}

const loggerFactory = getLoggerFactory();
const nowIsoFn = getNowISO();

function createSessionHandlers({
  getState,
  getCurrent,
  setCurrent,
  save = async () => {},
  invalidateCache = () => {},
  showWelcomeScreen = () => {},
  renderSessions = () => {},
  getActiveChatConfig = () => ({}),
  getModelMeta = () => ({}),
  now = nowIsoFn,
  generateId = defaultIdFactory,
  logger = loggerFactory('SESSION_HANDLERS'),
} = {}) {
  if (typeof getState !== 'function') {
    throw new Error('createSessionHandlers requires getState');
  }
  if (typeof getCurrent !== 'function' || typeof setCurrent !== 'function') {
    throw new Error('createSessionHandlers requires current session accessors');
  }

  function ensureSessions() {
    const state = getState();
    if (!state.sessions) {
      state.sessions = [];
    }
    return state.sessions;
  }

  async function createSession(initialMessages = [], options = {}) {
    const sessions = ensureSessions();
    const timestamp = now();
    const session = {
      id: generateId(),
      name: options.name || null,
      created_at: timestamp,
      last_updated: timestamp,
      messages: Array.isArray(initialMessages)
        ? initialMessages.slice()
        : [],
      uploadedFiles: [],
      canvases: {},
      tokens_used: 0,
      tokens_by_message: {},
      projectId: options.projectId || null,
      type: options.type || 'regular',
      isProject: options.type === 'project' || false,
    };

    sessions.unshift(session);
    logger.debug('createSession', 'Session created', {
      sessionId: session.id,
      type: session.type,
      projectId: session.projectId,
    });
    await save();
    return session;
  }

  async function deleteSession(session) {
    if (!session) return false;
    const sessions = ensureSessions();
    const before = sessions.length;

    const newSessions = sessions.filter((s) => s !== session);
    getState().sessions = newSessions;
    if (before === newSessions.length) return false;

    if (session.id) invalidateCache(session.id);

    if (getCurrent() === session) {
      setCurrent(null);
      showWelcomeScreen?.();
    }

    await save();
    renderSessions?.();
    logger.debug('deleteSession', 'Session deleted', {
      sessionId: session.id,
      remaining: newSessions.length,
    });
    return true;
  }

  async function deleteCurrentSession() {
    return deleteSession(getCurrent());
  }

  async function regenerateFromIndex(targetIndex, session = getCurrent()) {
    if (!session || !Array.isArray(session.messages)) {
      throw new Error('Session has no messages to regenerate');
    }
    if (
      typeof targetIndex !== 'number' ||
      targetIndex < 0 ||
      targetIndex >= session.messages.length
    ) {
      throw new Error('Invalid message index for regeneration');
    }

    const userMessages = session.messages
      .slice(0, targetIndex)
      .filter((msg) => msg[0] === 'user');
    const lastUserMessage = userMessages.pop();
    if (!lastUserMessage) {
      throw new Error('No user message found before target index');
    }

    session.messages.length = targetIndex;
    session.last_updated = now();

    const config = getActiveChatConfig(session);
    const modelMeta = getModelMeta(
      getState().settings?.models,
      config.provider,
      config.model,
    );

    const placeholder = [
      'ai',
      '',
      {
        provider: config.provider,
        model: config.model,
        label: modelMeta.label || config.model,
      },
    ];
    session.messages.push(placeholder);

    session._newMessages = session._newMessages || [];
    session._newMessages.push([session.messages.length - 1, placeholder]);

    await save();
    renderSessions?.();

    logger.debug('regenerateFromIndex', 'Placeholder appended for regeneration', {
      sessionId: session.id,
      index: targetIndex,
      provider: config.provider,
      model: config.model,
    });

    return placeholder;
  }

  return {
    createSession,
    deleteSession,
    deleteCurrentSession,
    regenerateFromIndex,
  };
}

module.exports = {
  createSessionHandlers,
};

(function attachToGlobal(global) {
  if (global) {
    global.__handlerModules = global.__handlerModules || {};
    global.__handlerModules.createSessionHandlers = createSessionHandlers;
  }
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : undefined);
