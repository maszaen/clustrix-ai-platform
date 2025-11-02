import { EXT_GROUPS, ICONS } from '../utils/constants.mjs';
import { escapeHtml } from '../markdown/markdown.mjs';

export function getExtension(filename) {
  return filename.split('.').pop().toUpperCase();
}

export function toExt(input) {
  if (!input) return '';
  const value = String(input).trim();
  const last = value.includes('.') ? value.split('.').pop() : value;
  return last.toLowerCase();
}

export function getFileIcon(nameOrExt) {
  let ext = toExt(nameOrExt.replace(/^\./, ''));
  let group = 'unknown';

  if (ext === 'json') {
    group = 'json';
  } else if (EXT_GROUPS.pdf.has(ext)) group = 'pdf';
  else if (EXT_GROUPS.spreadsheet.has(ext)) group = 'spreadsheet';
  else if (EXT_GROUPS.terminal.has(ext)) group = 'terminal';
  else if (EXT_GROUPS.text.has(ext)) group = 'text';
  else if (EXT_GROUPS.code.has(ext)) group = 'code';

  const icon = ICONS[group] || ICONS.unknown;
  const html = icon.replace(
    '<div class="file-icon"',
    `<div class="file-icon" data-ext="${escapeHtml(ext)}" aria-label="${escapeHtml(ext.toUpperCase())} file"`
  );
  return html;
}
