/**
 * Formatting Utility Module
 * Functions for formatting dates, times, file names, and other data
 *
 * Migrated from: renderer.js (formatRelativeTime, formatTimestamp, getExtension, toExt, getFileIcon)
 */

/**
 * Get file extension from filename in uppercase
 * @param {string} filename - Filename with extension
 * @returns {string} Uppercase extension
 *
 * @example
 * getExtension('document.pdf') // 'PDF'
 */
export function getExtension(filename) {
  if (!filename) return '';
  return filename.split('.').pop().toUpperCase();
}

/**
 * Normalize file extension to lowercase
 * @param {string} input - Filename or extension
 * @returns {string} Lowercase extension
 *
 * @example
 * toExt('file.PDF') // 'pdf'
 * toExt('.js') // 'js'
 * toExt('txt') // 'txt'
 */
export function toExt(input) {
  if (!input) return '';
  const s = String(input).trim();
  const last = s.includes('.') ? s.split('.').pop() : s;
  return last.toLowerCase();
}

/**
 * Format date as relative time (e.g., "2 hours ago", "Just now")
 * @param {string|Date} dateString - Date to format
 * @returns {string} Relative time string
 *
 * @example
 * formatRelativeTime('2024-01-01T10:00:00Z') // '2 hours ago'
 */
export function formatRelativeTime(dateString) {
  if (!dateString) return 'Unknown';

  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;

  // Convert to different time units
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
  } else {
    return 'Just now';
  }
}

/**
 * Format timestamp for session list (context-aware)
 * Shows time for today, "Yesterday", day name for this week, or date
 * @param {string|Date} dateString - Date to format
 * @returns {string} Formatted timestamp
 *
 * @example
 * formatTimestamp('2024-01-15T14:30:00Z')
 * // Today: '2:30 PM'
 * // Yesterday: 'Yesterday'
 * // This week: 'Mon'
 * // This year: 'Jan 15'
 * // Other: 'Jan 15, 2023'
 */
export function formatTimestamp(dateString) {
  if (!dateString) return '';

  const date = new Date(dateString);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const dateOnly = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );

  // Same day - show time only
  if (dateOnly.getTime() === today.getTime()) {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  // Yesterday - show "Yesterday"
  if (dateOnly.getTime() === yesterday.getTime()) {
    return 'Yesterday';
  }

  // This week - show day name
  const oneWeekAgo = new Date(today);
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  if (dateOnly > oneWeekAgo) {
    return date.toLocaleDateString('en-US', { weekday: 'short' });
  }

  // This year - show month and day
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  }

  // Different year - show month, day, year
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

/**
 * Format file size in human-readable format
 * @param {number} bytes - File size in bytes
 * @param {number} decimals - Number of decimal places (default: 2)
 * @returns {string} Formatted file size
 *
 * @example
 * formatFileSize(1024) // '1.00 KB'
 * formatFileSize(1536, 1) // '1.5 KB'
 * formatFileSize(1048576) // '1.00 MB'
 */
export function formatFileSize(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  if (!bytes || bytes < 0) return 'Unknown';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const size = parseFloat((bytes / Math.pow(k, i)).toFixed(dm));

  return `${size} ${sizes[i]}`;
}

/**
 * Format number with thousands separator
 * @param {number} num - Number to format
 * @param {string} separator - Separator character (default: ',')
 * @returns {string} Formatted number
 *
 * @example
 * formatNumber(1000) // '1,000'
 * formatNumber(1234567) // '1,234,567'
 */
export function formatNumber(num, separator = ',') {
  if (typeof num !== 'number' || isNaN(num)) return '0';
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, separator);
}

/**
 * Truncate text with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @param {string} suffix - Suffix to add (default: '...')
 * @returns {string} Truncated text
 *
 * @example
 * truncate('Hello World', 8) // 'Hello...'
 * truncate('Short', 10) // 'Short'
 */
export function truncate(text, maxLength, suffix = '...') {
  if (!text || text.length <= maxLength) return text || '';
  return text.substring(0, maxLength - suffix.length) + suffix;
}

/**
 * Truncate text at word boundary
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @param {string} suffix - Suffix to add (default: '...')
 * @returns {string} Truncated text
 *
 * @example
 * truncateWords('Hello wonderful world', 12) // 'Hello...'
 */
export function truncateWords(text, maxLength, suffix = '...') {
  if (!text || text.length <= maxLength) return text || '';

  const truncated = text.substring(0, maxLength - suffix.length);
  const lastSpace = truncated.lastIndexOf(' ');

  if (lastSpace > 0) {
    return truncated.substring(0, lastSpace) + suffix;
  }

  return truncated + suffix;
}

/**
 * Pluralize word based on count
 * @param {number} count - Count
 * @param {string} singular - Singular form
 * @param {string} plural - Plural form (optional, defaults to singular + 's')
 * @returns {string} Pluralized word with count
 *
 * @example
 * pluralize(1, 'file') // '1 file'
 * pluralize(5, 'file') // '5 files'
 * pluralize(2, 'person', 'people') // '2 people'
 */
export function pluralize(count, singular, plural = null) {
  const word = count === 1 ? singular : (plural || `${singular}s`);
  return `${count} ${word}`;
}

/**
 * Capitalize first letter of string
 * @param {string} str - String to capitalize
 * @returns {string} Capitalized string
 *
 * @example
 * capitalize('hello') // 'Hello'
 */
export function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Title case a string
 * @param {string} str - String to title case
 * @returns {string} Title cased string
 *
 * @example
 * titleCase('hello world') // 'Hello World'
 */
export function titleCase(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .split(' ')
    .map(word => capitalize(word))
    .join(' ');
}

/**
 * Format duration in milliseconds to human-readable string
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration
 *
 * @example
 * formatDuration(1500) // '1.5s'
 * formatDuration(65000) // '1m 5s'
 * formatDuration(3661000) // '1h 1m'
 */
export function formatDuration(ms) {
  if (!ms || ms < 0) return '0s';

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else if (seconds > 0) {
    return `${seconds}s`;
  } else {
    return `${ms}ms`;
  }
}

/**
 * Format percentage
 * @param {number} value - Value (0-1 or 0-100)
 * @param {number} decimals - Decimal places (default: 0)
 * @param {boolean} asDecimal - True if value is 0-1 (default: false)
 * @returns {string} Formatted percentage
 *
 * @example
 * formatPercent(0.75, 1, true) // '75.0%'
 * formatPercent(75) // '75%'
 */
export function formatPercent(value, decimals = 0, asDecimal = false) {
  if (typeof value !== 'number' || isNaN(value)) return '0%';
  const percent = asDecimal ? value * 100 : value;
  return `${percent.toFixed(decimals)}%`;
}

/**
 * Strip HTML tags from string
 * @param {string} html - HTML string
 * @returns {string} Plain text
 *
 * @example
 * stripHtml('<p>Hello <b>World</b></p>') // 'Hello World'
 */
export function stripHtml(html) {
  if (!html) return '';
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
}

/**
 * Limit text to specific number of lines
 * @param {string} text - Text to limit
 * @param {number} maxLines - Maximum number of lines
 * @param {string} suffix - Suffix to add (default: '...')
 * @returns {string} Limited text
 *
 * @example
 * limitLines('Line 1\nLine 2\nLine 3', 2) // 'Line 1\nLine 2...'
 */
export function limitLines(text, maxLines, suffix = '...') {
  if (!text) return '';
  const lines = text.split('\n');
  if (lines.length <= maxLines) return text;
  return lines.slice(0, maxLines).join('\n') + suffix;
}

// Default export with all utilities
export default {
  getExtension,
  toExt,
  formatRelativeTime,
  formatTimestamp,
  formatFileSize,
  formatNumber,
  truncate,
  truncateWords,
  pluralize,
  capitalize,
  titleCase,
  formatDuration,
  formatPercent,
  stripHtml,
  limitLines
};
