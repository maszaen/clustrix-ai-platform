/**
 * Utilities to schedule non-critical UI updates after the initial paint.
 * Deferring heavy work keeps entrance animations smooth on low-end devices.
 */

const scheduledTasks = new Map();

/**
 * Schedule a callback to run after a number of animation frames and, when
 * available, during the browser's idle time.
 *
 * @param {string} key - Unique key for the scheduled task so it can be replaced or cancelled.
 * @param {() => void} callback - Callback to execute once the UI has had time to settle.
 * @param {{ frames?: number, timeout?: number }} [options] - Scheduling options.
 * @returns {void}
 */
export function scheduleDeferredRender(key, callback, options = {}) {
  const { frames = 1, timeout = 200 } = options;
  cancelDeferredRender(key);

  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
    const timer = setTimeout(() => {
      scheduledTasks.delete(key);
      callback();
    }, Math.max(0, timeout));

    scheduledTasks.set(key, () => clearTimeout(timer));
    return;
  }

  let rafId = 0;
  let idleHandle = 0;
  const hasIdleCallback = typeof window.requestIdleCallback === 'function';
  const cancelIdle = typeof window.cancelIdleCallback === 'function'
    ? window.cancelIdleCallback.bind(window)
    : null;

  const runCallback = () => {
    const finalize = () => {
      scheduledTasks.delete(key);
      callback();
    };

    if (hasIdleCallback) {
      idleHandle = window.requestIdleCallback(finalize, { timeout });
    } else {
      idleHandle = window.setTimeout(finalize, Math.max(0, timeout));
    }
  };

  const step = (remainingFrames) => {
    if (remainingFrames <= 0) {
      runCallback();
      return;
    }

    rafId = window.requestAnimationFrame(() => step(remainingFrames - 1));
  };

  step(Math.max(0, frames));

  scheduledTasks.set(key, () => {
    if (rafId) {
      window.cancelAnimationFrame(rafId);
    }

    if (idleHandle) {
      if (hasIdleCallback && cancelIdle) {
        cancelIdle(idleHandle);
      } else {
        window.clearTimeout(idleHandle);
      }
    }

    scheduledTasks.delete(key);
  });
}

/**
 * Cancel a previously scheduled deferred render task.
 *
 * @param {string} key - Key used when scheduling the task.
 * @returns {void}
 */
export function cancelDeferredRender(key) {
  const cancel = scheduledTasks.get(key);
  if (cancel) {
    cancel();
    scheduledTasks.delete(key);
  }
}
