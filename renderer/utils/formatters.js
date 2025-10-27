'use strict';

/**
 * Time utilities.
 * @returns {string}
 */
function nowISO() {
  return new Date().toISOString();
}

/**
 * Format a timestamp into a human readable relative string.
 * @param {string|number|Date} dateString
 * @returns {string}
 */
function formatRelativeTime(dateString) {
  if (!dateString) return 'Unknown';

  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;

  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);

  if (diffYears > 0) {
    return diffYears === 1 ? '1 year ago' : `${diffYears} years ago`;
  } else if (diffMonths > 0) {
    return diffMonths === 1 ? '1 month ago' : `${diffMonths} months ago`;
  } else if (diffWeeks > 0) {
    return diffWeeks === 1 ? '1 week ago' : `${diffWeeks} weeks ago`;
  } else if (diffDays > 0) {
    return diffDays === 1 ? '1 day ago' : `${diffDays} days ago`;
  } else if (diffHours > 0) {
    return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
  } else if (diffMinutes > 0) {
    return diffMinutes === 1 ? '1 minute ago' : `${diffMinutes} minutes ago`;
  }
  return 'Just now';
}

/**
 * Sanitize and transform user message markdown-lite into HTML.
 * @param {string} content
 * @returns {string}
 */
function formatUserMessage(content) {
  if (!content) return '';
  let html = content
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');

  html = html
    .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/___(.*?)___/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.*?)__/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/_([^_]+)_/g, '<em>$1</em>');

  return html.replace(/\n/g, '<br/>');
}

module.exports = {
  formatRelativeTime,
  formatUserMessage,
  nowISO,
};

if (typeof window !== 'undefined') {
  window.__utilModules = window.__utilModules || {};
  window.__utilModules.formatRelativeTime = formatRelativeTime;
  window.__utilModules.formatUserMessage = formatUserMessage;
  window.__utilModules.nowISO = nowISO;
}
