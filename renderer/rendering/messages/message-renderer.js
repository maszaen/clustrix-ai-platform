'use strict';

let cachedSplitMarkdownForStreaming = null;

function defaultSplitMarkdownForStreaming(text) {
  if (!text) return [];
  return String(text)
    .split(/(\s+)/)
    .filter((token) => token.length > 0);
}

function resolveSplitMarkdownForStreaming() {
  if (typeof cachedSplitMarkdownForStreaming === 'function') {
    return cachedSplitMarkdownForStreaming;
  }

  let resolved = null;

  if (typeof require === 'function') {
    try {
      const markdown = require('../markdown/markdown-renderer');
      if (
        markdown &&
        typeof markdown.splitMarkdownForStreaming === 'function'
      ) {
        resolved = markdown.splitMarkdownForStreaming;
      }
    } catch (error) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn(
          '[message-renderer] splitMarkdownForStreaming require failed:',
          error?.message,
        );
      }
    }
  }

  if (!resolved && typeof window !== 'undefined') {
    const globalRenderModules = window.__renderModules;
    if (
      globalRenderModules &&
      typeof globalRenderModules.splitMarkdownForStreaming === 'function'
    ) {
      resolved = globalRenderModules.splitMarkdownForStreaming;
    } else if (
      typeof window.splitMarkdownForStreaming === 'function'
    ) {
      resolved = window.splitMarkdownForStreaming;
    }
  }

  if (!resolved) {
    resolved = defaultSplitMarkdownForStreaming;
  }

  cachedSplitMarkdownForStreaming = resolved;
  return cachedSplitMarkdownForStreaming;
}

const splitMarkdownForStreamingBinding = resolveSplitMarkdownForStreaming();

function getLoggerFactory() {
  if (typeof require === 'function') {
    try {
      return require('../../utils/logger').createLogger;
    } catch (error) {
      console.warn('[message-renderer] Logger require failed:', error?.message);
    }
  }
  if (typeof window !== 'undefined' && window.__utilModules?.createLogger) {
    return window.__utilModules.createLogger;
  }
  return (namespace) => ({
    debug: (...args) => console.debug(`[${namespace}]`, ...args),
    info: (...args) => console.info(`[${namespace}]`, ...args),
    warn: (...args) => console.warn(`[${namespace}]`, ...args),
    error: (...args) => console.error(`[${namespace}]`, ...args),
  });
}

function defaultEsc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function defaultGetExtension(name) {
  return String(name).split('.').pop().toUpperCase();
}

function renderFileBubbles(files, { esc, getExtension, getFileIcon }) {
  if (!Array.isArray(files) || files.length === 0) return '';
  return `
    <div class="file-pills-container">
      ${files
        .map(
          (file) => `
            <div class="file-pill-bubble">
              ${getFileIcon(esc(file.name))}
              <div style="display:flex;flex-direction:column;">
                <p>${esc(file.name)}</p>
                <span class="file-extension">${esc(getExtension(file.name))}</span>
              </div>
            </div>`,
        )
        .join('')}
    </div>
  `;
}

function createMessageRenderer({
  formatUserMessage,
  markdownRenderer,
  thinkingManager,
  getFileIcon,
  getExtension = defaultGetExtension,
  esc = defaultEsc,
  logger = getLoggerFactory()('MESSAGE_RENDERER'),
} = {}) {
  if (typeof formatUserMessage !== 'function') {
    throw new Error('createMessageRenderer requires formatUserMessage');
  }
  if (!markdownRenderer || typeof markdownRenderer.render !== 'function') {
    throw new Error('createMessageRenderer requires markdownRenderer');
  }

  getFileIcon =
    typeof getFileIcon === 'function'
      ? getFileIcon
      : () => '<div class="file-icon"></div>';

  async function renderAIContent(content, options = {}) {
    try {
      return await markdownRenderer.render(content, options);
    } catch (error) {
      logger.warn('renderAIContent', 'Falling back to sync renderer', {
        error: error.message,
      });
      return markdownRenderer.renderSync(content, options);
    }
  }

  function renderUserMessage({ content = '', metadata = {} }) {
    const filesHtml = renderFileBubbles(metadata.files, {
      esc,
      getExtension,
      getFileIcon,
    });
    const messageHtml = formatUserMessage(content || '');
    return {
      role: 'user',
      html: `
        <div class="message user">
          <div class="col-user-container">
            ${filesHtml}
            <div class="message-row">
              <div class="message-content">
                <div class="message-text">
                  <div class="user-text-content">${messageHtml}</div>
                  <button class="message-expand-btn hidden" title="Expand/Collapse">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M6 9l6 6 6-6"/>
                    </svg>
                  </button>
                </div>
              </div>
              <div class="message-actions"></div>
            </div>
          </div>
        </div>
      `,
      metadata,
    };
  }

  function renderAILoading({ metadata = {} }) {
    return {
      role: 'ai',
      html: `
        <div class="message ai streaming">
          <div class="message-row">
            <div class="message-content">
              <div class="thinking-container">
                <div class="typing-indicator"><span></span></div>
                <span class="thinking-text-indicator"></span>
              </div>
            </div>
            <div class="message-actions"></div>
          </div>
        </div>
      `,
      metadata,
    };
  }

  async function renderAIMessage({ content = '', metadata = {}, final = true }) {
    const html = final
      ? await renderAIContent(content, { isStreaming: false })
      : content;

    let thinkingHtml = '';
    if (final && metadata.thinking) {
      const thinkingText =
        thinkingManager?.renderThinkingText(metadata.thinking) ||
        thinkingManager?.renderWithExistingFormatter?.(metadata.thinking) ||
        '';
      thinkingHtml = `<div class="thinking-text">${thinkingText}</div>`;
    }

    return {
      role: 'ai',
      html: `
        <div class="message ai ${final ? 'final' : 'streaming'}">
          <div class="message-row">
            <div class="message-content">
              <div class="message-text">${html}${thinkingHtml}</div>
            </div>
            <div class="message-actions"></div>
          </div>
        </div>
      `,
      metadata,
    };
  }

  function renderAIContentSync(content, options = {}) {
    if (
      markdownRenderer &&
      typeof markdownRenderer.renderSync === 'function'
    ) {
      try {
        return markdownRenderer.renderSync(content, options) || '';
      } catch (error) {
        logger.warn('renderAIContentSync', 'renderSync failed; returning raw', {
          error: error.message,
        });
      }
    }
    return typeof content === 'string' ? content : String(content ?? '');
  }

  function renderAIMessageSync({ content = '', metadata = {}, final = true }) {
    const html = final
      ? renderAIContentSync(content, { isStreaming: false })
      : content;

    let thinkingHtml = '';
    if (final && metadata.thinking) {
      const thinkingText =
        thinkingManager?.renderThinkingText(metadata.thinking) ||
        thinkingManager?.renderWithExistingFormatter?.(metadata.thinking) ||
        '';
      thinkingHtml = `<div class="thinking-text">${thinkingText}</div>`;
    }

    return {
      role: 'ai',
      html: `
        <div class="message ai ${final ? 'final' : 'streaming'}">
          <div class="message-row">
            <div class="message-content">
              <div class="message-text">${html}${thinkingHtml}</div>
            </div>
            <div class="message-actions"></div>
          </div>
        </div>
      `,
      metadata,
    };
  }

  function renderSystemMessage({ content }) {
    const safe = esc(content || '');
    return {
      role: 'system',
      html: `
        <div class="message system">
          <div class="message-row">
            <div class="message-content">
              <div class="message-text"><span>${safe}</span></div>
            </div>
          </div>
        </div>
      `,
      metadata: {},
    };
  }

  function renderCancelledMessage({ content }) {
    const safe = esc(content || '');
    return {
      role: 'ai_cancelled',
      html: `
        <div class="message ai_cancelled">
          <div class="message-row">
            <div class="message-content">
              <div class="message-text">
                <span style="color:var(--fg-muted);font-style:italic;">${safe}</span>
                <button class="primary-btn regenerate-cancelled">Regenerate?</button>
              </div>
            </div>
          </div>
        </div>
      `,
      metadata: {},
    };
  }

  async function renderMessage({ role, content, metadata = {}, final = true }) {
    switch (role) {
      case 'user':
        return renderUserMessage({ content, metadata });
      case 'ai':
        return final
          ? renderAIMessage({ content, metadata, final: true })
          : renderAILoading({ metadata });
      case 'ai_cancelled':
        return renderCancelledMessage({ content });
      case 'system':
        return renderSystemMessage({ content });
      default:
        return {
          role,
          html: `<div class="message ${role}">${esc(content || '')}</div>`,
          metadata,
        };
    }
  }

  function renderMessageSync({ role, content, metadata = {}, final = true }) {
    switch (role) {
      case 'user':
        return renderUserMessage({ content, metadata });
      case 'ai':
        return final
          ? renderAIMessageSync({ content, metadata, final: true })
          : renderAILoading({ metadata });
      case 'ai_cancelled':
        return renderCancelledMessage({ content });
      case 'system':
        return renderSystemMessage({ content });
      default:
        return {
          role,
          html: `<div class="message ${role}">${esc(content || '')}</div>`,
          metadata,
        };
    }
  }

  return {
    renderMessage,
    renderMessageSync,
    splitMarkdownForStreaming: splitMarkdownForStreamingBinding,
  };
}

(function attachToGlobal(global) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      createMessageRenderer,
      splitMarkdownForStreaming: splitMarkdownForStreamingBinding,
    };
  }
  if (global) {
    global.__renderModules = global.__renderModules || {};
    global.__renderModules.createMessageRenderer = createMessageRenderer;
    global.__renderModules.splitMarkdownForStreaming =
      splitMarkdownForStreamingBinding;
  }
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : undefined);
