/**
 * DOM Utilities Module
 * Extracted from renderer.js - 99% exact code
 * Loaded via script tag, exports to global window object
 */

(function() {
  'use strict';

  /**
   * Query a single DOM element
   * @param {string} sel - CSS selector
   * @returns {Element|null}
   */
  const $ = (sel) => document.querySelector(sel);

  /**
   * Query multiple DOM elements
   * @param {string} sel - CSS selector
   * @returns {NodeListOf<Element>}
   */
  const $$ = (sel) => document.querySelectorAll(sel);

  /**
   * Escape HTML special characters for safe injection
   * @param {any} s - String to escape
   * @returns {string} Escaped string
   */
  function escHtml(s) {
    if (!s) return "";
    return s
      .toString()
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  /**
   * PERFORMANCE: DOM Query Cache - cache frequently accessed elements
   * Avoids repeated querySelector calls for hot paths
   */
  const domCache = {
    _cache: new Map(),
    get(selector) {
      if (!this._cache.has(selector)) {
        const element = document.querySelector(selector);
        if (element) {
          this._cache.set(selector, element);
        }
        return element;
      }
      return this._cache.get(selector);
    },
    invalidate(selector) {
      if (selector) {
        this._cache.delete(selector);
      } else {
        this._cache.clear();
      }
    },
    // Helper methods for common queries
    getChatLog() { return this.get("#chat-log"); },
    getMsg() { return this.get("#msg"); },
    getMsgCentral() { return this.get("#msg-central"); }
  };

  // Export to global window object
  window.$ = $;
  window.$$ = $$;
  window.escHtml = escHtml;
  window.domCache = domCache;
})();
