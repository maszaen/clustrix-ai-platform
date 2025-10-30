/**
 * File Utility Module
 * Functions for file type detection, icon generation, and file operations
 *
 * Migrated from: renderer.js (getFileIcon, EXT_GROUPS) and consts.js (ICONS, EXT_GROUPS)
 */

import { toExt } from './format.js';

// File extension groups for categorization
export const EXT_GROUPS = {
  pdf: new Set(['pdf']),
  spreadsheet: new Set(['xlsx', 'xls', 'csv', 'tsv']),
  terminal: new Set(['sh', 'bash', 'zsh', 'ksh', 'bat', 'cmd', 'ps1']),
  text: new Set(['txt', 'md', 'rtf', 'docx']),
  code: new Set([
    'js', 'ts', 'tsx', 'jsx', 'java', 'py', 'go', 'rs', 'rb', 'php', 'c', 'cpp', 'cs', 'kt', 'swift',
    'html', 'css', 'scss', 'less', 'xml', 'yaml', 'yml', 'toml', 'ini', 'properties', 'conf'
  ])
};

// File icons SVG  templates
export const ICONS = {
  code: `
<div class="file-icon" aria-hidden="true">
<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30"
  viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"
  stroke-linecap="round" stroke-linejoin="round"
  class="lucide lucide-file-code-icon lucide-file-code">
  <path d="M10 12.5 8 15l2 2.5"/>
  <path d="m14 12.5 2 2.5-2 2.5"/>
  <path d="M14 2v4a2 2 0 0 0 2 2h4"/>
  <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/>
</svg>
</div>`.trim(),

  text: `
<div class="file-icon" aria-hidden="true">
<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30"
  viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"
  stroke-linecap="round" stroke-linejoin="round"
  class="lucide lucide-file-text-icon lucide-file-text">
  <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/>
  <path d="M14 2v4a2 2 0 0 0 2 2h4"/>
  <path d="M10 9H8"/>
  <path d="M16 13H8"/>
  <path d="M16 17H8"/>
</svg>
</div>`.trim(),

  pdf: `
<div class="file-icon" aria-hidden="true">
<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30"
  viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"
  stroke-linecap="round" stroke-linejoin="round"
  class="lucide lucide-file-type-icon lucide-file-type">
  <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/>
  <path d="M14 2v4a2 2 0 0 0 2 2h4"/>
  <path d="M9 13v-1h1v1"/>
  <path d="M9 17v-2h2"/>
  <path d="M13 13h2"/>
  <path d="M13 17v-2l2-2"/>
</svg>
</div>`.trim(),

  spreadsheet: `
<div class="file-icon" aria-hidden="true">
<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30"
  viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"
  stroke-linecap="round" stroke-linejoin="round"
  class="lucide lucide-file-spreadsheet-icon lucide-file-spreadsheet">
  <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/>
  <path d="M14 2v4a2 2 0 0 0 2 2h4"/>
  <path d="M8 13h2"/>
  <path d="M14 13h2"/>
  <path d="M8 17h2"/>
  <path d="M14 17h2"/>
</svg>
</div>`.trim(),

  terminal: `
<div class="file-icon" aria-hidden="true">
<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30"
  viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"
  stroke-linecap="round" stroke-linejoin="round"
  class="lucide lucide-file-terminal-icon lucide-file-terminal">
  <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/>
  <path d="M14 2v4a2 2 0 0 0 2 2h4"/>
  <path d="m8 16 2-2-2-2"/>
  <path d="M12 18h4"/>
</svg>
</div>`.trim(),

  json: `
<div class="file-icon" aria-hidden="true">
<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30"
  viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"
  stroke-linecap="round" stroke-linejoin="round"
  class="lucide lucide-file-json-icon lucide-file-json">
  <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/>
  <path d="M14 2v4a2 2 0 0 0 2 2h4"/>
  <path d="M10 12a1 1 0 0 0-1 1v1a1 1 0 0 1-1 1 1 1 0 0 1 1 1v1a1 1 0 0 0 1 1"/>
  <path d="M14 18a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1 1 1 0 0 1-1-1v-1a1 1 0 0 0-1-1"/>
</svg>
</div>`.trim(),

  unknown: `
<div class="file-icon" aria-hidden="true">
<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30"
  viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"
  stroke-linecap="round" stroke-linejoin="round"
  class="lucide lucide-file-question-mark-icon lucide-file-question-mark">
  <path d="M12 17h.01"/>
  <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/>
  <path d="M9.1 9a3 3 0 0 1 5.82 1c0 2-3 3-3 3"/>
</svg>
</div>`.trim()
};

/**
 * Get file icon HTML based on filename or extension
 * @param {string} nameOrExt - Filename or extension
 * @returns {string} Icon HTML
 *
 * @example
 * getFileIcon('script.js') // Returns code icon
 * getFileIcon('document.pdf') // Returns PDF icon
 * getFileIcon('.txt') // Returns text icon
 */
export function getFileIcon(nameOrExt) {
  let ext = toExt(nameOrExt.replace(/^\./, ''));
  let group = 'unknown';

  if (ext === 'json') {
    group = 'json';
  } else if (EXT_GROUPS.pdf.has(ext)) {
    group = 'pdf';
  } else if (EXT_GROUPS.spreadsheet.has(ext)) {
    group = 'spreadsheet';
  } else if (EXT_GROUPS.terminal.has(ext)) {
    group = 'terminal';
  } else if (EXT_GROUPS.text.has(ext)) {
    group = 'text';
  } else if (EXT_GROUPS.code.has(ext)) {
    group = 'code';
  }

  const html = ICONS[group].replace(
    '<div class="file-icon"',
    `<div class="file-icon" data-ext="${ext}" aria-label="${ext.toUpperCase()} file"`
  );

  return html;
}

/**
 * Get file type category from extension
 * @param {string} nameOrExt - Filename or extension
 * @returns {string} File type category ('code', 'text', 'pdf', etc.)
 *
 * @example
 * getFileType('script.js') // 'code'
 * getFileType('document.pdf') // 'pdf'
 */
export function getFileType(nameOrExt) {
  const ext = toExt(nameOrExt.replace(/^\./, ''));

  if (ext === 'json') return 'json';
  if (EXT_GROUPS.pdf.has(ext)) return 'pdf';
  if (EXT_GROUPS.spreadsheet.has(ext)) return 'spreadsheet';
  if (EXT_GROUPS.terminal.has(ext)) return 'terminal';
  if (EXT_GROUPS.text.has(ext)) return 'text';
  if (EXT_GROUPS.code.has(ext)) return 'code';

  return 'unknown';
}

/**
 * Check if file is a code file
 * @param {string} nameOrExt - Filename or extension
 * @returns {boolean} True if file is code
 */
export function isCodeFile(nameOrExt) {
  const ext = toExt(nameOrExt.replace(/^\./, ''));
  return EXT_GROUPS.code.has(ext);
}

/**
 * Check if file is a text file
 * @param {string} nameOrExt - Filename or extension
 * @returns {boolean} True if file is text
 */
export function isTextFile(nameOrExt) {
  const ext = toExt(nameOrExt.replace(/^\./, ''));
  return EXT_GROUPS.text.has(ext);
}

/**
 * Check if file is a PDF
 * @param {string} nameOrExt - Filename or extension
 * @returns {boolean} True if file is PDF
 */
export function isPdfFile(nameOrExt) {
  const ext = toExt(nameOrExt.replace(/^\./, ''));
  return EXT_GROUPS.pdf.has(ext);
}

/**
 * Check if file is a spreadsheet
 * @param {string} nameOrExt - Filename or extension
 * @returns {boolean} True if file is spreadsheet
 */
export function isSpreadsheetFile(nameOrExt) {
  const ext = toExt(nameOrExt.replace(/^\./, ''));
  return EXT_GROUPS.spreadsheet.has(ext);
}

/**
 * Check if file is a terminal/shell script
 * @param {string} nameOrExt - Filename or extension
 * @returns {boolean} True if file is terminal script
 */
export function isTerminalFile(nameOrExt) {
  const ext = toExt(nameOrExt.replace(/^\./, ''));
  return EXT_GROUPS.terminal.has(ext);
}

/**
 * Check if file is JSON
 * @param {string} nameOrExt - Filename or extension
 * @returns {boolean} True if file is JSON
 */
export function isJsonFile(nameOrExt) {
  const ext = toExt(nameOrExt.replace(/^\./, ''));
  return ext === 'json';
}

/**
 * Get file name from path
 * @param {string} path - File path
 * @param {boolean} withExtension - Include extension (default: true)
 * @returns {string} File name
 *
 * @example
 * getFileName('/path/to/file.txt') // 'file.txt'
 * getFileName('/path/to/file.txt', false) // 'file'
 */
export function getFileName(path, withExtension = true) {
  if (!path) return '';

  const parts = path.replace(/\\/g, '/').split('/');
  const fileName = parts[parts.length - 1];

  if (!withExtension && fileName.includes('.')) {
    return fileName.substring(0, fileName.lastIndexOf('.'));
  }

  return fileName;
}

/**
 * Get directory from path
 * @param {string} path - File path
 * @returns {string} Directory path
 *
 * @example
 * getDirectory('/path/to/file.txt') // '/path/to'
 */
export function getDirectory(path) {
  if (!path) return '';

  const normalizedPath = path.replace(/\\/g, '/');
  const lastSlash = normalizedPath.lastIndexOf('/');

  if (lastSlash === -1) return '';
  return normalizedPath.substring(0, lastSlash);
}

/**
 * Join path segments
 * @param {...string} segments - Path segments
 * @returns {string} Joined path
 *
 * @example
 * joinPath('path', 'to', 'file.txt') // 'path/to/file.txt'
 */
export function joinPath(...segments) {
  return segments
    .filter(s => s && s.length > 0)
    .join('/')
    .replace(/\/+/g, '/'); // Remove duplicate slashes
}

/**
 * Normalize path separators (convert backslash to forward slash)
 * @param {string} path - Path to normalize
 * @returns {string} Normalized path
 *
 * @example
 * normalizePath('path\\to\\file.txt') // 'path/to/file.txt'
 */
export function normalizePath(path) {
  if (!path) return '';
  return path.replace(/\\/g, '/');
}

/**
 * Check if path is absolute
 * @param {string} path - Path to check
 * @returns {boolean} True if absolute
 *
 * @example
 * isAbsolutePath('/path/to/file') // true
 * isAbsolutePath('C:\\path\\to\\file') // true
 * isAbsolutePath('relative/path') // false
 */
export function isAbsolutePath(path) {
  if (!path) return false;

  // Unix absolute path
  if (path.startsWith('/')) return true;

  // Windows absolute path (C:\ or \\UNC)
  if (/^[a-zA-Z]:[\\/]/.test(path)) return true;
  if (path.startsWith('\\\\')) return true;

  return false;
}

/**
 * Parse file path into components
 * @param {string} path - File path
 * @returns {Object} Path components {dir, name, ext, base}
 *
 * @example
 * parsePath('/path/to/file.txt')
 * // { dir: '/path/to', name: 'file', ext: 'txt', base: 'file.txt' }
 */
export function parsePath(path) {
  if (!path) {
    return { dir: '', name: '', ext: '', base: '' };
  }

  const normalizedPath = normalizePath(path);
  const dir = getDirectory(normalizedPath);
  const base = getFileName(normalizedPath, true);
  const name = getFileName(normalizedPath, false);
  const ext = base.includes('.') ? base.substring(base.lastIndexOf('.') + 1) : '';

  return { dir, name, ext, base };
}

// Default export with all utilities
export default {
  EXT_GROUPS,
  ICONS,
  getFileIcon,
  getFileType,
  isCodeFile,
  isTextFile,
  isPdfFile,
  isSpreadsheetFile,
  isTerminalFile,
  isJsonFile,
  getFileName,
  getDirectory,
  joinPath,
  normalizePath,
  isAbsolutePath,
  parsePath
};
