'use strict';

function withLogger(logger, namespace) {
  if (logger) return logger;
  const prefix = namespace ? `[${namespace}]` : '[modal]';
  return {
    debug: (...args) => console.debug(prefix, ...args),
    info: (...args) => console.info(prefix, ...args),
    warn: (...args) => console.warn(prefix, ...args),
    error: (...args) => console.error(prefix, ...args),
  };
}

function createModalManager({
  select = (selector) =>
    typeof document !== 'undefined' ? document.querySelector(selector) : null,
  logger,
} = {}) {
  logger = withLogger(logger, 'MODAL_MANAGER');
  function openModal(modal) {
    if (!modal) return;
    modal.classList.add('open');
    logger.debug('open', `Opened modal ${modal.id || '(unknown)'}`);
  }

  function closeModal(modal) {
    if (!modal) return;
    modal.classList.remove('open');
    logger.debug('close', `Closed modal ${modal.id || '(unknown)'}`);
  }

  function showConfirmation({ title, message, onConfirm } = {}) {
    const modal = select('#confirm-modal');
    if (!modal) {
      logger.warn('showConfirmation', 'Confirmation modal not found');
      return;
    }
    const titleEl = modal.querySelector('#confirm-title');
    const messageEl = modal.querySelector('#confirm-message');
    if (titleEl) titleEl.textContent = title || 'Confirm';
    if (messageEl) messageEl.textContent = message || '';

    const okBtn = modal.querySelector('#confirm-ok');
    const cancelBtn = modal.querySelector('#confirm-cancel');
    const overlay = modal.querySelector('.modal-overlay');

    const cleanup = () => {
      okBtn?.removeEventListener('click', handleOk);
      cancelBtn?.removeEventListener('click', handleCancel);
      overlay?.removeEventListener('click', handleCancel);
    };

    function handleOk() {
      try {
        onConfirm?.();
      } finally {
        cleanup();
        closeModal(modal);
      }
    }

    function handleCancel() {
      cleanup();
      closeModal(modal);
    }

    okBtn?.addEventListener('click', handleOk);
    cancelBtn?.addEventListener('click', handleCancel);
    overlay?.addEventListener('click', handleCancel);
    openModal(modal);
  }

  return {
    openModal,
    closeModal,
    showConfirmation,
  };
}

(function attachToGlobal(global) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      createModalManager,
    };
  }
  if (global) {
    global.__uiModules = global.__uiModules || {};
    global.__uiModules.createModalManager = createModalManager;
  }
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : undefined);
