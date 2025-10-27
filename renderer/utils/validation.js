'use strict';

/**
 * Escape text for safe HTML usage.
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
  if (typeof document !== 'undefined') {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Fallback when DOM is unavailable (e.g., unit tests using node env).
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Get uppercase extension from filename.
 * @param {string} filename
 * @returns {string}
 */
function getExtension(filename) {
  return filename.split('.').pop().toUpperCase();
}

/**
 * Normalize filename/extension into lowercase extension.
 * @param {string} input
 * @returns {string}
 */
function toExt(input) {
  if (!input) return '';
  const s = String(input).trim();
  const last = s.includes('.') ? s.split('.').pop() : s;
  return last.toLowerCase();
}

module.exports = {
  escapeHtml,
  getExtension,
  toExt,
};
