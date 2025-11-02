import { escapeHtml } from './markdown.mjs';

export function createHighlightedCode(code, language) {
  const trimmedLanguage = language ? language.trim() : '';
  const escapedCode = escapeHtml(code);

  if (typeof hljs !== 'undefined') {
    try {
      if (trimmedLanguage && hljs.getLanguage(trimmedLanguage)) {
        const highlighted = hljs.highlight(escapedCode, { language: trimmedLanguage }).value;
        return `<pre><code class="hljs language-${trimmedLanguage}">${highlighted}</code></pre>`;
      }
      const highlightedAuto = hljs.highlightAuto(escapedCode);
      const langClass = highlightedAuto.language ? ` language-${highlightedAuto.language}` : '';
      return `<pre><code class="hljs${langClass}">${highlightedAuto.value}</code></pre>`;
    } catch (error) {
      console.warn('Highlight.js error:', error);
    }
  }

  return `<pre><code>${escapedCode}</code></pre>`;
}
