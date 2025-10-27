'use strict';

function withLogger(logger, namespace) {
  if (logger) return logger;
  const prefix = namespace ? `[${namespace}]` : '[scroll]';
  return {
    debug: (...args) => console.debug(prefix, ...args),
    info: (...args) => console.info(prefix, ...args),
    warn: (...args) => console.warn(prefix, ...args),
    error: (...args) => console.error(prefix, ...args),
  };
}

function createSmartScroll({
  select = (selector) =>
    typeof document !== 'undefined' ? document.querySelector(selector) : null,
  logger,
} = {}) {
  logger = withLogger(logger, 'SMART_SCROLL');
  function scrollToBottom({ force = false } = {}) {
    const scroller = select('.chat-log-container');
    if (!scroller) {
      logger.warn('scrollToBottom', 'Scroller not found');
      return;
    }
    if (!force && scroller.dataset.userScrolled === 'true') {
      return;
    }
    scroller.scrollTop = scroller.scrollHeight;
    logger.debug('scrollToBottom', 'Scrolled to bottom', { force });
  }

  function markUserScrolled(up) {
    const scroller = select('.chat-log-container');
    if (!scroller) return;
    scroller.dataset.userScrolled = up ? 'true' : 'false';
  }

  return {
    scrollToBottom,
    markUserScrolled,
  };
}

(function attachToGlobal(global) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      createSmartScroll,
    };
  }
  if (global) {
    global.__uiModules = global.__uiModules || {};
    global.__uiModules.createSmartScroll = createSmartScroll;
  }
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : undefined);
