/* eslint-disable no-console */
'use strict';

const DEFAULT_DELAY_MS = 4000;

function withLogger(logger, namespace) {
  if (logger) return logger;
  const prefix = namespace ? `[${namespace}]` : '[toast]';
  return {
    debug: (...args) => console.debug(prefix, ...args),
    info: (...args) => console.info(prefix, ...args),
    warn: (...args) => console.warn(prefix, ...args),
    error: (...args) => console.error(prefix, ...args),
  };
}

function createToastManager({
  select = (selector) =>
    typeof document !== 'undefined' ? document.querySelector(selector) : null,
  logger,
  setTimeoutFn = (fn, delay) => setTimeout(fn, delay),
} = {}) {
  logger = withLogger(logger, 'TOASTS');
  function ensureContainer() {
    let container = select('#toast-container');
    if (!container && typeof document !== 'undefined') {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      container.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        display: flex;
        flex-direction: column-reverse;
        gap: 10px;
        z-index: 10000;
        pointer-events: none;
      `;
      document.body.appendChild(container);
    }
    return container;
  }

  function ensureAnimations() {
    if (typeof document === 'undefined') return;
    if (!document.querySelector('style[data-toast-animations]')) {
      const style = document.createElement('style');
      if (typeof style.setAttribute === 'function') {
        style.setAttribute('data-toast-animations', 'true');
      } else {
        style.dataset = style.dataset || {};
        style.dataset.toastAnimations = 'true';
      }
      style.textContent = `
        .toast-notification {
          transition: transform 0.3s ease-out, opacity 0.3s ease-out, margin-bottom 0.3s ease-out, max-height 0.3s ease-out;
        }
      `;
      if (document.head && typeof document.head.appendChild === 'function') {
        document.head.appendChild(style);
      }
    }
  }

  function showToast(message, type = 'info', delay = DEFAULT_DELAY_MS) {
    if (typeof document === 'undefined') return null;
    const container = ensureContainer();
    if (!container) {
      logger.warn('showToast', 'Toast container unavailable');
      return null;
    }

    ensureAnimations();

    const toast = document.createElement('div');
    toast.className = `toast-notification toast-${type}`;
    toast.textContent = message ?? '';
    toast.style.cssText = `
      padding: 12px 16px;
      background: ${type === 'error' ? '#902424b4' : type === 'success' ? '#0e8a3aa1' : '#1b4d9e9e'};
      color: white;
      border-radius: var(--radius-lg);
      font-size: 14px;
      max-width: 300px;
      word-wrap: break-word;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      pointer-events: auto;
      transform: translateY(100px);
      opacity: 0;
      transition: transform 0.3s ease-out, opacity 0.3s ease-out, margin-bottom 0.3s ease-out;
    `;

    container.appendChild(toast);

    logger.debug('showToast', 'Toast displayed', { type });

    const raf = typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : (fn) => setTimeoutFn(fn, 0);

    raf(() => {
      raf(() => {
        toast.style.transform = 'translateY(0)';
        toast.style.opacity = '1';
      });
    });

    if (delay != null) {
      setTimeoutFn(() => {
        const toastHeight = toast.offsetHeight;
        toast.style.transform = 'translateY(20px)';
        toast.style.opacity = '0';
        toast.style.maxHeight = `${toastHeight}px`;
        setTimeoutFn(() => {
          toast.style.maxHeight = '0';
          toast.style.marginBottom = '0';
          toast.style.padding = '0 12px';
          toast.style.overflow = 'hidden';
          setTimeoutFn(() => {
            toast.remove();
            if (container.children.length === 0) {
              container.remove();
            }
          }, 300);
        }, 300);
      }, delay);
    }

    toast.addEventListener('click', () => {
      toast.style.transform = 'translateY(100px)';
      toast.style.opacity = '0';
      setTimeoutFn(() => {
        toast.remove();
        if (container.children.length === 0) {
          container.remove();
        }
      }, 300);
    });

    return toast;
  }

  return {
    showToast,
  };
}

(function attachToGlobal(global) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      createToastManager,
    };
  }
  if (global) {
    global.__uiModules = global.__uiModules || {};
    global.__uiModules.createToastManager = createToastManager;
  }
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : undefined);
