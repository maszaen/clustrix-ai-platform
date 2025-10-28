/**
 * File Icons Utilities Module
 * Extracted from renderer.js - 99% exact code
 * Loaded via script tag, exports to global window object
 * 
 * Note: ICONS and EXT_GROUPS constants remain in consts.js
 * This module assumes they are globally available via script tag in index.html
 */

(function() {
  'use strict';

/**
 * Get file extension in uppercase
 * @param {string} filename - File name with extension
 * @returns {string} Uppercase extension
 */
function getExtension(filename) {
  return filename.split(".").pop().toUpperCase();
}

/**
 * Normalize input to lowercase extension
 * @param {string} input - File name or extension
 * @returns {string} Lowercase extension
 */
function toExt(input) {
  if (!input) return "";
  const s = String(input).trim();
  const last = s.includes(".") ? s.split(".").pop() : s;
  return last.toLowerCase();
}

/**
 * Get file icon HTML based on file extension
 * @param {string} nameOrExt - File name or extension
 * @returns {string} SVG icon HTML
 */
function getFileIcon(nameOrExt) {
  let ext = toExt(nameOrExt.replace(/^\./, ""));
  let group = "unknown";

  if (ext === "json") {
    group = "json";
  } else if (EXT_GROUPS.spreadsheet.has(ext)) group = "spreadsheet";
  else if (EXT_GROUPS.terminal.has(ext)) group = "terminal";
  else if (EXT_GROUPS.text.has(ext)) group = "text";
  else if (EXT_GROUPS.code.has(ext)) group = "code";

  const html = ICONS[group].replace(
    '<div class="file-icon"',
    `<div class="file-icon" data-ext="${ext}" aria-label="${ext.toUpperCase()} file"`,
  );
  return html;
}

  // Export to global window object
  window.getExtension = getExtension;
  window.toExt = toExt;
  window.getFileIcon = getFileIcon;
})();
