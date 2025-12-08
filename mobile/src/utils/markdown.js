/**
 * Markdown utilities for React Native
 * Simplified version of renderer/core/md.js
 */

// Code block language detection
export function detectLanguage(code) {
  if (/^import\s|^export\s|^const\s|^let\s|^function\s|=>\s*{/.test(code)) return 'javascript';
  if (/^def\s|^class\s|^import\s.*:|^from\s.*import/.test(code)) return 'python';
  if (/^package\s|^public\s+class|^import\s+java/.test(code)) return 'java';
  if (/<\?php|<\?=/.test(code)) return 'php';
  if (/^#include|^int\s+main|^void\s+\w+\(/.test(code)) return 'c';
  if (/^<!DOCTYPE|^<html|^<div|^<span/.test(code)) return 'html';
  if (/^\{[\s\S]*".*":/.test(code)) return 'json';
  if (/^SELECT\s|^INSERT\s|^UPDATE\s|^DELETE\s/i.test(code)) return 'sql';
  return 'text';
}

// Escape HTML entities
export function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Format code blocks for display
export function formatCodeBlock(code, language) {
  return {
    code: code.trim(),
    language: language || detectLanguage(code),
  };
}

// Parse thinking blocks from content
export function parseThinkingBlocks(content) {
  // Normalize escaped newlines (literal \n string to actual newline)
  const normalizedContent = content.replace(/\\n/g, '\n');
  
  const thinkRegex = /<think(?:ing)?>([\s\S]*?)<\/think(?:ing)?>/gi;
  const blocks = [];
  let lastIndex = 0;
  let match;

  while ((match = thinkRegex.exec(normalizedContent)) !== null) {
    if (match.index > lastIndex) {
      blocks.push({ type: 'text', content: normalizedContent.slice(lastIndex, match.index) });
    }
    blocks.push({ type: 'thinking', content: match[1].trim() });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < normalizedContent.length) {
    blocks.push({ type: 'text', content: normalizedContent.slice(lastIndex) });
  }

  return blocks.length ? blocks : [{ type: 'text', content: normalizedContent }];
}

// Simple markdown to plain text (for previews)
export function stripMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/```[\s\S]*?```/g, '[code]')
    .replace(/`[^`]+`/g, '[code]')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/#{1,6}\s+/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\n+/g, ' ')
    .trim();
}

// Truncate text with ellipsis
export function truncate(text, maxLength = 100) {
  if (!text || text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim() + '...';
}
