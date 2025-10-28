/**
 * Formatting Utilities Module
 * Extracted from renderer.js - 99% exact code
 * Loaded via script tag, exports to global window object
 */

(function() {
  'use strict';

/**
 * Format date/time as relative time string (e.g., "2 hours ago")
 * @param {string} dateString - ISO date string
 * @returns {string} Relative time description
 */
function formatRelativeTime(dateString) {
  if (!dateString) return "Unknown";
  
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
    return diffYears === 1 ? "1 year ago" : `${diffYears} years ago`;
  } else if (diffMonths > 0) {
    return diffMonths === 1 ? "1 month ago" : `${diffMonths} months ago`;
  } else if (diffWeeks > 0) {
    return diffWeeks === 1 ? "1 week ago" : `${diffWeeks} weeks ago`;
  } else if (diffDays > 0) {
    return diffDays === 1 ? "1 day ago" : `${diffDays} days ago`;
  } else if (diffHours > 0) {
    return diffHours === 1 ? "1 hour ago" : `${diffHours} hours ago`;
  } else if (diffMinutes > 0) {
    return diffMinutes === 1 ? "1 minute ago" : `${diffMinutes} minutes ago`;
  } else {
    return "Just now";
  }
}

/**
 * Get current timestamp in ISO format
 * @returns {string} ISO 8601 timestamp
 */
function nowISO() {
  return new Date().toISOString();
}

/**
 * Format user message with basic markdown support (bold, italic)
 * @param {string} content - Raw message content
 * @returns {string} HTML-formatted message
 */
function formatUserMessage(content) {
  if (!content) return "";
  let html = content
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

  // Only support bold and italic formatting for user messages
  html = html
    .replace(/\*\*\*(.*?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/___(.*?)___/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.*?)__/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/_([^_]+)_/g, "<em>$1</em>");

  return html.replace(/\n/g, "<br/>");
}

/**
 * Format timestamp for display (smart format based on recency)
 * @param {string} dateString - ISO date string
 * @returns {string} Formatted timestamp
 */
function formatTimestamp(dateString) {
  if (!dateString) return "";

  const date = new Date(dateString);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const dateOnly = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );

  // Same day - show time only
  if (dateOnly.getTime() === today.getTime()) {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }

  // Yesterday - show "Yesterday"
  if (dateOnly.getTime() === yesterday.getTime()) {
    return "Yesterday";
  }

  // This week - show day name
  const oneWeekAgo = new Date(today);
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  if (dateOnly > oneWeekAgo) {
    return date.toLocaleDateString("en-US", { weekday: "short" });
  }

  // This year - show month and day
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }

  // Different year - show month, day, year
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

  // Export to global window object
  window.formatRelativeTime = formatRelativeTime;
  window.nowISO = nowISO;
  window.formatUserMessage = formatUserMessage;
  window.formatTimestamp = formatTimestamp;
})();
