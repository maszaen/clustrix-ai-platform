/**
 * Timing Utilities Module (Debounce & Throttle)
 * Extracted from renderer.js - 99% exact code
 * Loaded via script tag, exports to global window object
 */

(function() {
  'use strict';

/**
 * General debounce utility - delays function execution until after delay
 * @param {Function} fn - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} Debounced function with cancel method
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
 * Throttle utility function - limits function execution frequency
 * @param {Function} func - Function to throttle
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} Throttled function
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

  // Export to global window object
  window.debounce = debounce;
  window.throttle = throttle;
})();
