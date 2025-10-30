/**
 * Escape Utility Module
 * Functions for escaping/sanitizing text for safe display
 *
 * Migrated from: renderer.js (escapeHtml and related security functions)
 */

/**
 * Escape HTML special characters
 * Prevents XSS attacks by converting special characters to HTML entities
 * @param {string} text - Text to escape
 * @returns {string} Escaped HTML
 *
 * @example
 * escapeHtml('<script>alert("xss")</script>')
 * // '&lt;script&gt;alert("xss")&lt;/script&gt;'
 */
export function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Escape HTML using character map (faster for large texts)
 * @param {string} text - Text to escape
 * @returns {string} Escaped HTML
 *
 * @example
 * escapeHtmlFast('Hello <b>World</b> & "Quotes"')
 * // 'Hello &lt;b&gt;World&lt;/b&gt; &amp; &quot;Quotes&quot;'
 */
export function escapeHtmlFast(text) {
  if (!text) return '';

  const escapeMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '/': '&#x2F;'
  };

  return String(text).replace(/[&<>"'\/]/g, char => escapeMap[char]);
}

/**
 * Unescape HTML entities
 * @param {string} html - HTML with entities
 * @returns {string} Unescaped text
 *
 * @example
 * unescapeHtml('&lt;div&gt;') // '<div>'
 */
export function unescapeHtml(html) {
  if (!html) return '';
  const textarea = document.createElement('textarea');
  textarea.innerHTML = html;
  return textarea.value;
}

/**
 * Escape attribute value for safe use in HTML attributes
 * @param {string} text - Text to escape
 * @returns {string} Escaped attribute value
 *
 * @example
 * escapeAttr('value with "quotes"') // 'value with &quot;quotes&quot;'
 */
export function escapeAttr(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Escape regex special characters
 * @param {string} text - Text to escape
 * @returns {string} Escaped regex pattern
 *
 * @example
 * escapeRegex('Hello? (World)') // 'Hello\\? \\(World\\)'
 */
export function escapeRegex(text) {
  if (!text) return '';
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Escape URL for safe use in href attributes
 * @param {string} url - URL to escape
 * @returns {string} Escaped URL
 *
 * @example
 * escapeUrl('https://example.com/path?q=hello world')
 * // 'https://example.com/path?q=hello%20world'
 */
export function escapeUrl(url) {
  if (!url) return '';
  try {
    return encodeURI(url);
  } catch (e) {
    console.warn('Failed to escape URL:', url, e);
    return '';
  }
}

/**
 * Escape URL component (for query parameters)
 * @param {string} component - URL component to escape
 * @returns {string} Escaped component
 *
 * @example
 * escapeUrlComponent('hello world & stuff')
 * // 'hello%20world%20%26%20stuff'
 */
export function escapeUrlComponent(component) {
  if (!component) return '';
  try {
    return encodeURIComponent(component);
  } catch (e) {
    console.warn('Failed to escape URL component:', component, e);
    return '';
  }
}

/**
 * Sanitize filename for safe file system use
 * Removes/replaces invalid filename characters
 * @param {string} filename - Filename to sanitize
 * @param {string} replacement - Replacement character (default: '_')
 * @returns {string} Sanitized filename
 *
 * @example
 * sanitizeFilename('My File: <test>.txt') // 'My File_ _test_.txt'
 */
export function sanitizeFilename(filename, replacement = '_') {
  if (!filename) return '';

  // Remove invalid characters: \ / : * ? " < > |
  return String(filename)
    .replace(/[\\/:*?"<>|]/g, replacement)
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Sanitize text by removing control characters
 * @param {string} text - Text to sanitize
 * @returns {string} Sanitized text
 *
 * @example
 * sanitizeText('Hello\x00World\x1F') // 'HelloWorld'
 */
export function sanitizeText(text) {
  if (!text) return '';
  // Remove control characters (0x00-0x1F except \t \n \r)
  return String(text).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

/**
 * Strip script tags and event handlers from HTML
 * WARNING: This is NOT a complete XSS sanitizer. Use a proper library for production.
 * @param {string} html - HTML to sanitize
 * @returns {string} Sanitized HTML
 *
 * @example
 * stripScripts('<div onclick="alert()">Safe</div><script>bad()</script>')
 * // '<div>Safe</div>'
 */
export function stripScripts(html) {
  if (!html) return '';

  return String(html)
    // Remove script tags
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    // Remove event handlers (onclick, onload, etc.)
    .replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/\s*on\w+\s*=\s*[^\s>]*/gi, '')
    // Remove javascript: protocol
    .replace(/javascript:/gi, '');
}

/**
 * Validate and sanitize URL (basic check for safe protocols)
 * @param {string} url - URL to validate
 * @param {Array<string>} allowedProtocols - Allowed protocols (default: http, https)
 * @returns {string|null} Sanitized URL or null if invalid
 *
 * @example
 * sanitizeUrl('https://example.com') // 'https://example.com'
 * sanitizeUrl('javascript:alert()') // null
 */
export function sanitizeUrl(url, allowedProtocols = ['http', 'https', 'mailto', 'tel']) {
  if (!url) return null;

  const trimmed = String(url).trim();

  // Check for dangerous protocols
  const protocolMatch = trimmed.match(/^([a-z][a-z0-9+.-]*?):/i);

  if (protocolMatch) {
    const protocol = protocolMatch[1].toLowerCase();
    if (!allowedProtocols.includes(protocol)) {
      console.warn('Blocked dangerous URL protocol:', protocol);
      return null;
    }
  }

  // Basic URL validation
  try {
    // Relative URLs are ok
    if (trimmed.startsWith('/') || trimmed.startsWith('#') || trimmed.startsWith('?')) {
      return trimmed;
    }

    // Validate absolute URLs
    const urlObj = new URL(trimmed, window.location.href);
    if (allowedProtocols.includes(urlObj.protocol.replace(':', ''))) {
      return urlObj.href;
    }

    return null;
  } catch (e) {
    console.warn('Invalid URL:', url, e);
    return null;
  }
}

/**
 * Escape CSV field (wrap in quotes if needed, escape quotes)
 * @param {string} field - CSV field value
 * @returns {string} Escaped CSV field
 *
 * @example
 * escapeCsv('value with, comma') // '"value with, comma"'
 * escapeCsv('value with "quotes"') // '"value with ""quotes"""'
 */
export function escapeCsv(field) {
  if (field === null || field === undefined) return '';

  const str = String(field);

  // Check if field needs quoting
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    // Escape quotes by doubling them
    const escaped = str.replace(/"/g, '""');
    return `"${escaped}"`;
  }

  return str;
}

/**
 * Escape JSON string for safe embedding in HTML
 * @param {any} obj - Object to serialize
 * @returns {string} Escaped JSON string
 *
 * @example
 * escapeJson({key: '<script>alert()</script>'})
 * // Safe for: <script>var data = JSON.parse('...');</script>
 */
export function escapeJson(obj) {
  if (obj === null || obj === undefined) return 'null';

  const json = JSON.stringify(obj);

  // Escape for safe embedding in HTML/JS
  return json
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

// Default export with all utilities
export default {
  escapeHtml,
  escapeHtmlFast,
  unescapeHtml,
  escapeAttr,
  escapeRegex,
  escapeUrl,
  escapeUrlComponent,
  sanitizeFilename,
  sanitizeText,
  stripScripts,
  sanitizeUrl,
  escapeCsv,
  escapeJson
};
