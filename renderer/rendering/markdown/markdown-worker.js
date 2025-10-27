'use strict';

const { createLogger } = require('../../utils/logger');

function defaultWorkerFactory() {
  if (typeof Worker === 'undefined') {
    throw new Error('Web Worker API is not available in this environment');
  }
  return new Worker('./md.worker.js');
}

function createMarkdownWorkerManager({
  logger = createLogger('MARKDOWN_WORKER'),
  workerFactory = defaultWorkerFactory,
  timeoutMs = 800,
} = {}) {
  let worker = null;
  let messageId = 0;
  const pending = new Map();

  function ensureWorker() {
    if (worker) return worker;
    try {
      worker = workerFactory();
      worker.onmessage = handleMessage;
      worker.onerror = handleError;
      worker.onmessageerror = handleMessageError;
      logger.debug('init', 'Markdown worker initialized');
    } catch (error) {
      logger.error('init', 'Failed to initialize markdown worker', {
        error: error.message,
      });
      worker = null;
    }
    return worker;
  }

  function handleMessage(event) {
    const { messageId: resolvedId, html } = event.data || {};
    if (!resolvedId || !pending.has(resolvedId)) return;

    const { resolve, normalize } = pending.get(resolvedId);
    pending.delete(resolvedId);
    try {
      resolve(normalize(html));
    } catch (error) {
      logger.error('message', 'Failed to normalize worker HTML', {
        error: error.message,
      });
      resolve(html || '');
    }
  }

  function handleError(error) {
    logger.error('worker', 'Markdown worker error', { error: error.message });
    reset();
  }

  function handleMessageError(error) {
    logger.error('message', 'Markdown worker message error', {
      error: error.message,
    });
    reset();
  }

  function reset() {
    if (worker) {
      try {
        worker.terminate?.();
      } catch (_) {
        // ignore
      }
    }
    worker = null;
    for (const { resolve } of pending.values()) {
      resolve(null);
    }
    pending.clear();
  }

  function processMarkdown(src, { streamId, normalize = (html) => html } = {}) {
    const instance = ensureWorker();
    if (!instance) {
      return Promise.resolve(null);
    }

    const id = ++messageId;
    return new Promise((resolve) => {
      pending.set(id, { resolve, normalize });
      instance.postMessage({
        type: 'init',
        payload: src,
        streamId: streamId || `markdown-${id}`,
        messageId: id,
      });

      setTimeout(() => {
        if (!pending.has(id)) return;
        pending.delete(id);
        logger.warn('timeout', 'Markdown worker timed out', { messageId: id });
        resolve(null);
      }, timeoutMs);
    });
  }

  return {
    processMarkdown,
    reset,
    dispose: reset,
  };
}

module.exports = {
  createMarkdownWorkerManager,
};
