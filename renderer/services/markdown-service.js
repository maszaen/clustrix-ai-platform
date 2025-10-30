/**
 * Markdown Service Module
 * Wrapper untuk markdown rendering system yang sudah ada (md.js + md.worker.js)
 *
 * PENTING: Service ini HANYA wrapper, TIDAK mengubah core logic markdown rendering.
 * Core logic tetap di md.js dan md.worker.js yang sudah perfect.
 *
 * Migrated from: renderer.js (md function wrapper)
 */

/**
 * MarkdownService - Wrapper untuk markdown rendering system
 */
class MarkdownService {
  constructor() {
    // Service ini hanya wrapper, tidak punya state sendiri
    // Semua logic ada di global md() function dan md.worker.js
  }

  // ============================================
  // MARKDOWN RENDERING (Wrapper ke md.js)
  // ============================================

  /**
   * Render markdown to HTML
   * Wrapper untuk global md() function yang sudah ada
   *
   * @param {string} markdown - Markdown content
   * @param {Object} options - Render options
   * @returns {Promise<string>} Rendered HTML
   */
  async render(markdown, options = {}) {
    if (!markdown) return '';

    // Use existing md() function from md.js
    // md() function sudah handle semua logic:
    // - Worker vs sync decision
    // - Session switch optimization
    // - Fallback ke mdFallback() jika worker fail
    // - Syntax highlighting
    // - Code block listeners
    if (typeof window !== 'undefined' && typeof window.md === 'function') {
      return await window.md(markdown, options);
    }

    // Fallback jika md() belum loaded (seharusnya tidak pernah terjadi)
    console.error('MarkdownService: md() function not available');
    return this.renderSync(markdown, options);
  }

  /**
   * Render markdown synchronously
   * Wrapper untuk global mdFallback() function
   *
   * @param {string} markdown - Markdown content
   * @param {Object} options - Render options
   * @returns {string} Rendered HTML
   */
  renderSync(markdown, options = {}) {
    if (!markdown) return '';

    // Use existing mdFallback() function from renderer.js
    // mdFallback() sudah handle:
    // - enhancedMarkdownParse() dari md.js
    // - Post-processing
    // - Syntax highlighting
    // - Code block listeners
    if (typeof window !== 'undefined' && typeof window.mdFallback === 'function') {
      return window.mdFallback(markdown, options);
    }

    // Fallback jika mdFallback() belum loaded
    console.error('MarkdownService: mdFallback() function not available');
    return this._emergencyFallback(markdown);
  }

  /**
   * Emergency fallback (seharusnya tidak pernah dipanggil)
   * @private
   */
  _emergencyFallback(markdown) {
    if (!markdown) return '';
    // Hanya escape HTML, jangan render
    const div = document.createElement('div');
    div.textContent = markdown;
    return `<pre>${div.innerHTML}</pre>`;
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  /**
   * Escape HTML special characters
   * @param {string} text - Text to escape
   * @returns {string} Escaped HTML
   */
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Strip markdown formatting
   * @param {string} markdown - Markdown content
   * @returns {string} Plain text
   */
  stripMarkdown(markdown) {
    if (!markdown) return '';

    return markdown
      // Remove code blocks
      .replace(/```[\s\S]*?```/g, '')
      // Remove inline code
      .replace(/`[^`]+`/g, '')
      // Remove headers
      .replace(/^#{1,6}\s+/gm, '')
      // Remove bold/italic
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/_([^_]+)_/g, '$1')
      // Remove links
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // Remove images
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
      .trim();
  }

  /**
   * Extract code blocks from markdown
   * @param {string} markdown - Markdown content
   * @returns {Array} Array of code block objects
   */
  extractCodeBlocks(markdown) {
    if (!markdown) return [];

    const codeBlocks = [];
    const regex = /```(\w*)\n?([\s\S]*?)```/g;
    let match;

    while ((match = regex.exec(markdown)) !== null) {
      codeBlocks.push({
        language: match[1] || 'plaintext',
        code: match[2].trim(),
        fullMatch: match[0],
        index: match.index
      });
    }

    return codeBlocks;
  }

  /**
   * Extract links from markdown
   * @param {string} markdown - Markdown content
   * @returns {Array} Array of link objects
   */
  extractLinks(markdown) {
    if (!markdown) return [];

    const links = [];
    const regex = /\[([^\]]+)\]\(([^)]+)\)/g;
    let match;

    while ((match = regex.exec(markdown)) !== null) {
      links.push({
        text: match[1],
        url: match[2],
        fullMatch: match[0],
        index: match.index
      });
    }

    return links;
  }

  /**
   * Extract images from markdown
   * @param {string} markdown - Markdown content
   * @returns {Array} Array of image objects
   */
  extractImages(markdown) {
    if (!markdown) return [];

    const images = [];
    const regex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    let match;

    while ((match = regex.exec(markdown)) !== null) {
      images.push({
        alt: match[1],
        url: match[2],
        fullMatch: match[0],
        index: match.index
      });
    }

    return images;
  }

  /**
   * Count words in markdown (excluding code blocks)
   * @param {string} markdown - Markdown content
   * @returns {number} Word count
   */
  countWords(markdown) {
    if (!markdown) return 0;

    const stripped = this.stripMarkdown(markdown);
    const words = stripped.split(/\s+/).filter(word => word.length > 0);
    return words.length;
  }

  /**
   * Get markdown statistics
   * @param {string} markdown - Markdown content
   * @returns {Object} Statistics object
   */
  getStats(markdown) {
    if (!markdown) {
      return {
        characters: 0,
        words: 0,
        lines: 0,
        codeBlocks: 0,
        links: 0,
        images: 0
      };
    }

    return {
      characters: markdown.length,
      words: this.countWords(markdown),
      lines: markdown.split('\n').length,
      codeBlocks: this.extractCodeBlocks(markdown).length,
      links: this.extractLinks(markdown).length,
      images: this.extractImages(markdown).length
    };
  }

  /**
   * Validate markdown syntax (basic check)
   * @param {string} markdown - Markdown content
   * @returns {Object} Validation result {valid, warnings}
   */
  validate(markdown) {
    const warnings = [];

    if (!markdown) {
      return { valid: true, warnings };
    }

    // Check for unclosed code blocks
    const codeBlockCount = (markdown.match(/```/g) || []).length;
    if (codeBlockCount % 2 !== 0) {
      warnings.push('Unclosed code block detected');
    }

    // Check for unmatched brackets
    const openBrackets = (markdown.match(/\[/g) || []).length;
    const closeBrackets = (markdown.match(/\]/g) || []).length;
    if (openBrackets !== closeBrackets) {
      warnings.push('Unmatched brackets detected');
    }

    // Check for unmatched parentheses in links
    const openParens = (markdown.match(/\(/g) || []).length;
    const closeParens = (markdown.match(/\)/g) || []).length;
    if (openParens !== closeParens) {
      warnings.push('Unmatched parentheses detected');
    }

    return {
      valid: warnings.length === 0,
      warnings
    };
  }
}

// Create singleton instance
const markdownService = new MarkdownService();

// Note: Worker initialization is handled by md.js, not this service
// This is just a wrapper around existing markdown functions

// Convenience exports
export const renderMarkdown = (markdown, options) =>
  markdownService.render(markdown, options);
export const renderMarkdownSync = (markdown, options) =>
  markdownService.renderSync(markdown, options);
export const stripMarkdown = (markdown) =>
  markdownService.stripMarkdown(markdown);
export const extractCodeBlocks = (markdown) =>
  markdownService.extractCodeBlocks(markdown);
export const extractLinks = (markdown) =>
  markdownService.extractLinks(markdown);
export const getMarkdownStats = (markdown) =>
  markdownService.getStats(markdown);

// Export class and singleton
export { MarkdownService };
export default markdownService;
