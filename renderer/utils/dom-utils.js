'use strict';

/**
 * DOM helpers copied from the renderer monolith for Phase 1 extraction.
 *
 * These helpers provide a thin wrapper around common selectors plus a cached
 * lookup table for frequently accessed nodes.
 */

/**
 * Query a single DOM element.
 * @param {string} selector
 * @returns {Element|null}
 */
function $(selector) {
  return document.querySelector(selector);
}

/**
 * Query multiple DOM elements.
 * @param {string} selector
 * @returns {NodeListOf<Element>}
 */
function $$(selector) {
  return document.querySelectorAll(selector);
}

/**
 * Escape text for safe HTML injection.
 * @param {unknown} value
 * @returns {string}
 */
function esc(value) {
  if (!value) return '';
  return value
    .toString()
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Cached DOM query helpers to avoid repeated lookups for hot paths.
 */
const domCache = {
  _cache: new Map(),

  /**
   * @param {string} selector
   * @returns {Element|null}
   */
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

  /**
   * Remove a cached selector or clear the entire cache.
   * @param {string} [selector]
   * @returns {void}
   */
  invalidate(selector) {
    if (selector) {
      this._cache.delete(selector);
    } else {
      this._cache.clear();
    }
  },

  // Helpers for common selectors used throughout the renderer.
  getChatLog() {
    return this.get('#chat-log');
  },
  getMsg() {
    return this.get('#msg');
  },
  getMsgCentral() {
    return this.get('#msg-central');
  },
};

module.exports = {
  $,
  $$,
  esc,
  domCache,
};
