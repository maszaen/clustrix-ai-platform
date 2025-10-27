'use strict';

function getLoggerFactory() {
  if (typeof require === 'function') {
    try {
      return require('../utils/logger').createLogger;
    } catch (error) {
      console.warn('[message-handlers] Logger require failed:', error?.message);
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
      console.warn('[message-handlers] nowISO require failed:', error?.message);
    }
  }
  if (typeof window !== 'undefined' && window.__utilModules?.nowISO) {
    return window.__utilModules.nowISO;
  }
  return () => new Date().toISOString();
}

const loggerFactory = getLoggerFactory();
const nowIsoFn = getNowISO();

function createMessageHandlers({
  sessionHandlers,
  messageRenderer,
  thinkingManager,
  markdownRenderer,
  appendMessage,
  getState,
  getCurrent,
  setCurrent,
  save,
  cacheSession,
  invalidateSessionCache,
  renderUploadedFiles = () => {},
  renderSessions = () => {},
  startStream = () => {},
  loadAllArtifacts = async () => [],
  buildMessages = () => [],
  buildMessagesUpTo = () => [],
  buildResumeMessages = () => [],
  scheduleThinkingText = () => {},
  isStreamingInSession = () => false,
  logger = loggerFactory('MESSAGE_HANDLERS'),
  now = nowIsoFn,
} = {}) {
  if (!sessionHandlers) {
    throw new Error('createMessageHandlers requires sessionHandlers');
  }
  if (
    !messageRenderer &&
    typeof appendMessage !== 'function'
  ) {
    throw new Error(
      'createMessageHandlers requires messageRenderer or appendMessage',
    );
  }

  const state = getState();

  function appendMessageWithRenderer(role, content, options) {
    if (!messageRenderer) return null;
    const result = messageRenderer.renderMessage({
      role,
      content,
      metadata: options?.metadata,
      final: options?.final,
    });
    if (!result || typeof document === 'undefined') return null;
    const container = document.querySelector('#chat-log');
    if (!container) return null;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = result.html;
    const node = wrapper.firstElementChild;
    if (!node) return null;
    if (options?.index != null) {
      node.dataset.index = String(options.index);
      node.dataset.sessionId = getCurrent()?.id || '';
    }
    container.appendChild(node);
    return node;
  }

  const appendMessageImpl =
    typeof appendMessage === 'function' ? appendMessage : appendMessageWithRenderer;

  const scheduleThinking = scheduleThinkingText;

  async function sendMessage(text, { fromWelcome = false } = {}) {
    const current = getCurrent();
    if (!current) {
      logger.warn('send', 'No active session; aborting send');
      return null;
    }

    const trimmed = (text || '').trim();
    const hasFiles = Array.isArray(current.uploadedFiles) && current.uploadedFiles.length > 0;
    if (!trimmed && !hasFiles) return null;

    current.last_updated = now();

    const filesToAttach = current.uploadedFiles || [];
    const userMessage = ['user', trimmed, { files: filesToAttach }];
    current.messages.push(userMessage);

    const config = state.settings?.models
      ? sessionHandlers.getActiveChatConfig?.(current)
      : null;
    const modelMeta = config
      ? sessionHandlers.getModelMeta?.(state.settings.models, config.provider, config.model)
      : null;
    const aiPlaceholder = [
      'ai',
      '',
      {
        provider: config?.provider || 'unknown',
        model: config?.model || 'unknown',
        label: modelMeta?.label || config?.model || 'unknown',
      },
    ];
    current.messages.push(aiPlaceholder);

    appendMessageImpl('user', trimmed, {
      index: current.messages.length - 2,
      metadata: { files: filesToAttach },
      final: true,
    });
    current.uploadedFiles = [];
    renderUploadedFiles();

    const aiIndex = current.messages.length - 1;
    const aiNode = appendMessageImpl('ai', '', {
      index: aiIndex,
      metadata: aiPlaceholder[2],
      final: false,
    });

    await save();
    renderSessions();

    const messagesForAI = buildMessages(current);
    startStream(current, trimmed, aiNode, aiIndex, fromWelcome, messagesForAI);
    return aiNode;
  }

  async function regenerate(aiIndex) {
    const current = getCurrent();
    if (!current) return null;

    const placeholder = await sessionHandlers.regenerateFromIndex(aiIndex, current);
    const aiNode = appendMessageImpl('ai', '', {
      index: current.messages.length - 1,
      metadata: placeholder[2],
      final: false,
    });
    const messagesForAI = buildMessages(current);
    startStream(current, '', aiNode, current.messages.length - 1, false, messagesForAI);
    return aiNode;
  }

  async function regenerateCancelled(targetButton) {
    const current = getCurrent();
    if (!current || isStreamingInSession(current)) return null;
    if (typeof document === 'undefined' || !targetButton) return null;

    const messageNode = targetButton.closest('.message.ai_cancelled');
    if (!messageNode) return null;

    const indexAttr = targetButton.dataset?.messageIndex;
    const messageIndex = Number.parseInt(indexAttr ?? '-1', 10);
    if (!Number.isInteger(messageIndex) || messageIndex < 0) return null;

    const existingEntry = current.messages[messageIndex] || [];
    const existingContent = existingEntry[1] || '';
    const modelInfo = existingEntry[2] || {};

    const msgs = buildMessagesUpTo(messageIndex - 1, current);

    let promptContent;
    if (existingContent && existingContent.length > 20) {
      promptContent = `[System] Continue this response from where it left off without repeating anything, without providing any additional response to reply to this:\n\n${existingContent}\n\n---CONTINUE FROM HERE WITHOUT REPEATING ANYTHING---`;
    } else {
      const userMessages = current.messages
        .slice(0, messageIndex)
        .filter((m) => m[0] === 'user');
      const lastUserMessage = userMessages.pop();
      if (!lastUserMessage) return null;
      promptContent = lastUserMessage[1];
    }

    msgs.push({ role: 'user', content: promptContent });

    current.messages[messageIndex] = ['ai', '', modelInfo];
    current.last_updated = now();
    current._newMessages = current._newMessages || [];
    current._newMessages.push([messageIndex, current.messages[messageIndex]]);

    if (typeof invalidateSessionCache === 'function' && current.id) {
      invalidateSessionCache(current.id);
    }

    await save();
    renderSessions();

    const replacementNode = appendMessageImpl('ai', '', {
      index: messageIndex,
      metadata: modelInfo,
      final: false,
    });
    if (!replacementNode) return null;

    if (messageNode.parentNode) {
      messageNode.parentNode.replaceChild(replacementNode, messageNode);
    }

    scheduleThinking(replacementNode);
    startStream(current, promptContent, replacementNode, messageIndex, false, msgs);
    return replacementNode;
  }

  async function regenerateIncomplete(targetButton) {
    const current = getCurrent();
    if (!current || isStreamingInSession(current)) return null;
    if (typeof document === 'undefined' || !targetButton) return null;

    const messageNode = targetButton.closest('.message.ai_incomplete');
    if (!messageNode) return null;

    const indexAttr = targetButton.dataset?.messageIndex;
    const messageIndex = Number.parseInt(indexAttr ?? '-1', 10);
    if (!Number.isInteger(messageIndex) || messageIndex < 0) return null;

    const entry = current.messages[messageIndex] || [];
    const modelInfo = entry[2] || {};

    const msgs = buildMessagesUpTo(messageIndex - 1, current);

    const userMessages = current.messages
      .slice(0, messageIndex)
      .filter((m) => m[0] === 'user');
    const lastUserMessage = userMessages.pop();
    if (!lastUserMessage) return null;

    const promptContent = lastUserMessage[1];
    msgs.push({ role: 'user', content: promptContent });

    current.messages[messageIndex] = ['ai', '', modelInfo];
    current.last_updated = now();
    current._newMessages = current._newMessages || [];
    current._newMessages.push([messageIndex, current.messages[messageIndex]]);

    if (typeof invalidateSessionCache === 'function' && current.id) {
      invalidateSessionCache(current.id);
    }

    await save();
    renderSessions();

    const replacementNode = appendMessageImpl('ai', '', {
      index: messageIndex,
      metadata: modelInfo,
      final: false,
    });
    if (!replacementNode) return null;

    if (messageNode.parentNode) {
      messageNode.parentNode.replaceChild(replacementNode, messageNode);
    }

    scheduleThinking(replacementNode);
    startStream(current, promptContent, replacementNode, messageIndex, false, msgs);
    return replacementNode;
  }

  async function rehydrateArtifacts(container) {
    const artifacts = await loadAllArtifacts();
    if (!Array.isArray(artifacts)) return;
    const codeBlocks = (container || document).querySelectorAll('.code-block-container');
    codeBlocks.forEach((block) => {
      const codeElement = block.querySelector('code');
      const saveButton = block.querySelector('.save-code-btn');
      const languageSpan = block.querySelector('.language-name');
      const header = block.querySelector('.code-block-header');
      if (!codeElement || !saveButton || !languageSpan) return;

      const language = saveButton.getAttribute('data-language');
      const match = artifacts.find(
        (artifact) =>
          artifact.code === codeElement.textContent && artifact.language === language,
      );
      if (match) {
        languageSpan.innerHTML = `${language} <span>${match.title}</span>`;
        if (header) header.dataset.artifactId = match.id;
        saveButton.style.display = 'none';
      }
    });
  }

  return {
    sendMessage,
    regenerate,
    regenerateCancelled,
    regenerateIncomplete,
    rehydrateArtifacts,
  };
}

module.exports = {
  createMessageHandlers,
};

(function attachToGlobal(global) {
  if (global) {
    global.__handlerModules = global.__handlerModules || {};
    global.__handlerModules.createMessageHandlers = createMessageHandlers;
  }
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : undefined);
