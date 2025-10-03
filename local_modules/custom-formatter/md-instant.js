/**
 * Instant Markdown Formatter for Lazy Loading
 * Non-worker version for immediate rendering without loading delays
 */

class InstantMarkdownFormatter {
  constructor() {
    this.md = null;
    this.initialized = false;
    this.init();
  }

  init() {
    try {
      // Use the same MarkdownIt instance as the main formatter
      if (typeof window !== 'undefined' && window.markdownit) {
        this.md = window.markdownit({
          html: true,
          breaks: true,
          linkify: true,
          typographer: true,
          quotes: '""\'\'',
        });

        // Add the same plugins as custom formatter
        this.setupPlugins();
        this.initialized = true;
      } else {
        console.warn('MarkdownIt not available for instant formatter');
      }
    } catch (error) {
      console.error('Failed to initialize instant markdown formatter:', error);
    }
  }

  setupPlugins() {
    if (!this.md) return;

    // Custom renderer for code blocks with headers (same as custom formatter)
    const defaultFence = this.md.renderer.rules.fence;
    this.md.renderer.rules.fence = (tokens, idx, options, env, slf) => {
      const token = tokens[idx];
      const info = token.info ? token.info.trim() : '';
      const langName = info ? info.split(/\s+/g)[0] : 'text';
      const codeContent = token.content.trim();
      
      // Escape function for HTML
      const esc = (str) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      
      return `
        <div class="code-block-container">
          <div class="code-block-header">
            <span class="language-name">${langName}</span>
            <div class="code-block-actions">
              <button class="save-code-btn" title="Save to artifacts" data-code="${esc(codeContent).replace(/"/g, "&quot;")}" data-language="${langName}">
                <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17,21 17,13 7,13 7,21"/><polyline points="7,3 7,8 15,8"/></svg>
              </button>
              <button class="copy-code-btn" title="Copy code">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
              </button>
            </div>
          </div>
          <pre><code class="language-${langName}">${esc(codeContent)}</code></pre>
        </div>
      `;
    };

    // Custom link renderer
    const defaultLinkOpen = this.md.renderer.rules.link_open || function(tokens, idx, options, env, slf) {
      return slf.renderToken(tokens, idx, options);
    };
    
    this.md.renderer.rules.link_open = function(tokens, idx, options, env, slf) {
      const token = tokens[idx];
      const href = token.attrGet('href');
      if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
        token.attrSet('target', '_blank');
        token.attrSet('rel', 'noopener noreferrer');
      }
      return defaultLinkOpen(tokens, idx, options, env, slf);
    };
  }

  format(text) {
    if (!this.initialized || !this.md) {
      // Fallback to simple HTML escaping
      return this.fallbackFormat(text);
    }

    try {
      return this.md.render(text);
    } catch (error) {
      console.warn('Instant markdown formatting error:', error);
      return this.fallbackFormat(text);
    }
  }

  fallbackFormat(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/\n/g, '<br>');
  }
}

// Create global instance
window.instantMarkdownFormatter = new InstantMarkdownFormatter();

// Export functions for use
window.formatMarkdownInstant = function(text) {
  return window.instantMarkdownFormatter.format(text);
};

// Special formatter for thinking-text without action buttons
window.formatMarkdownInstantThinking = function(text) {
  console.log('🧠 THINKING FORMATTER CALLED:', text.length, 'chars');
  if (!window.instantMarkdownFormatter.initialized || !window.instantMarkdownFormatter.md) {
    return window.instantMarkdownFormatter.fallbackFormat(text);
  }

  // Create a copy of the markdown instance with thinking-specific rules
  const thinkingMd = window.markdownit({
    html: true,
    breaks: true,
    linkify: true,
    typographer: true,
    quotes: '""\'\'',
  });

  // Setup thinking-specific code block renderer (no action buttons)
  thinkingMd.renderer.rules.fence = (tokens, idx, options, env, slf) => {
    const token = tokens[idx];
    const info = token.info ? token.info.trim() : '';
    const langName = info ? info.split(/\s+/g)[0] : 'text';
    // Don't trim content to preserve newlines!
    const codeContent = token.content;
    
    // Escape function for HTML
    const esc = (str) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    
    // Simple code block without action buttons for thinking-text
    return `<div class="code-block-container thinking-code"><div class="code-block-header"><span class="language-name">${langName}</span></div><pre><code class="language-${langName}">${esc(codeContent)}</code></pre></div>`;
  };

  // Setup same link renderer
  thinkingMd.renderer.rules.link_open = function(tokens, idx, options, env, slf) {
    const token = tokens[idx];
    const href = token.attrGet('href');
    if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
      token.attrSet('target', '_blank');
      token.attrSet('rel', 'noopener noreferrer');
    }
    return thinkingMd.renderer.renderToken(tokens, idx, options);
  };

  try {
    return thinkingMd.render(text);
  } catch (error) {
    console.warn('Thinking instant markdown formatting error:', error);
    return window.instantMarkdownFormatter.fallbackFormat(text);
  }
};