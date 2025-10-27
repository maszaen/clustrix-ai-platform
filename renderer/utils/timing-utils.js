'use strict';

/**
 * Debounce a function call.
 * @param {Function} fn
 * @param {number} delay
 * @returns {Function & { cancel(): void }}
 */
function debounce(fn, delay) {
  let timer = null;

  const debounced = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };

  debounced.cancel = () => clearTimeout(timer);

  return debounced;
}

/**
 * Throttle a function call.
 * @param {Function} func
 * @param {number} wait
 * @returns {Function}
 */
function throttle(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

module.exports = {
  debounce,
  throttle,
};
