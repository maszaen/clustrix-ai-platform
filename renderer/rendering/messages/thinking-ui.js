'use strict';

function getLoggerFactory() {
  if (typeof require === 'function') {
    try {
      return require('../../utils/logger').createLogger;
    } catch (error) {
      console.warn('[thinking-ui] Logger require failed:', error?.message);
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

const loggerFactory = getLoggerFactory();

function cleanLeadingWhitespace(text) {
  if (!text || typeof text !== 'string') return '';
  const pattern =
    /^[\s\u200B\u200C\u200D\u2060\ufeff\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]+/;
  return text.replace(pattern, '');
}

function renderWithExistingFormatter(raw) {
  if (raw == null) return '';
  const cleaned = cleanLeadingWhitespace(String(raw));
  return cleaned
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\r?\n/g, '<br/>');
}

function renderThinkingText(raw) {
  if (raw == null) return '';
  const cleaned = cleanLeadingWhitespace(String(raw));
  let formatted = cleaned
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
  formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
  formatted = formatted.replace(/\n\n+/g, '</p><p>');
  formatted = formatted.replace(/\n/g, '<br>');
  formatted = `<p>${formatted}</p>`;
  formatted = formatted.replace(/<p>\s*<\/p>/g, '');
  return formatted;
}

function cleanInvisibleContent(html) {
  if (!html || typeof document === 'undefined') return html;

  let cleanedHtml = html
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+(\r?\n|\r)\s*/g, '')
    .replace(/(\r?\n|\r)+/g, '\n')
    .trim();

  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = cleanedHtml;

  const walker = document.createTreeWalker(
    tempDiv,
    NodeFilter.SHOW_ALL,
    {
      acceptNode(node) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const tagName = node.tagName.toLowerCase();
          if (
            !['br', 'hr', 'img', 'input'].includes(tagName) &&
            !node.textContent.trim() &&
            node.children.length === 0
          ) {
            return NodeFilter.FILTER_ACCEPT;
          }
        } else if (node.nodeType === Node.TEXT_NODE) {
          if (/^\s*$/.test(node.nodeValue)) {
            return NodeFilter.FILTER_ACCEPT;
          }
        }
        return NodeFilter.FILTER_REJECT;
      },
    },
  );

  const nodesToRemove = [];
  let node;
  while ((node = walker.nextNode())) {
    nodesToRemove.push(node);
  }
  nodesToRemove.forEach((entry) => entry.parentNode?.removeChild(entry));

  return tempDiv.innerHTML.replace(/\s+/g, ' ').trim();
}

function createThinkingUIManager({
  markdownRenderer,
  mdThinking,
  onSave = () => {},
  logger = loggerFactory('THINKING_UI'),
} = {}) {
  if (typeof document === 'undefined') {
    logger.warn('env', 'Document is not available; DOM functions will be no-ops');
  }

  let saveTimer = null;
  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        onSave();
      } catch (error) {
        logger.error('save', 'Failed to trigger save callback', {
          error: error.message,
        });
      }
    }, 200);
  }

  async function customMarkdownFormat(raw, options) {
    if (raw == null) return '';
    const cleaned = cleanLeadingWhitespace(String(raw));

    if (typeof mdThinking === 'function') {
      return mdThinking(cleaned, options);
    }

    if (markdownRenderer?.renderSync) {
      return markdownRenderer.renderSync(cleaned, options);
    }

    if (typeof md === 'function') {
      try {
        const result = md(cleaned);
        const output =
          result && typeof result.then === 'function'
            ? await result
            : result;
        return cleanInvisibleContent(output);
      } catch (error) {
        logger.warn('format', 'Custom md formatter failed; using fallback', {
          error: error.message,
        });
      }
    }

    return renderWithExistingFormatter(cleaned);
  }

  function scrollThinkingToBottom(thinkingElement) {
    if (!thinkingElement) return;
    const body = thinkingElement.body;
    if (!body || !body.classList.contains('expanded')) return;

    const attemptScroll = () => {
      const { scrollTop, clientHeight, scrollHeight } = body;
      const needsScroll = scrollHeight > clientHeight;
      const userHasScrolledUp =
        typeof thinkingElement.userScrolled === 'function' &&
        thinkingElement.userScrolled();
      if (needsScroll && !userHasScrolledUp) {
        body.scrollTop = body.scrollHeight;
      }
    };

    attemptScroll();
    setTimeout(attemptScroll, 50);
    setTimeout(attemptScroll, 100);
  }

  function ensureThinkingUI(aiNode) {
    if (!aiNode || typeof document === 'undefined') return null;
    if (aiNode._thinkingReady) return aiNode._thinkingEl;

    const content =
      aiNode.querySelector('.message-content') || aiNode;
    const existingWrap = content.querySelector('.thinking-wrap');
    if (existingWrap) {
      const toggle = existingWrap.querySelector('.thinking-toggle');
      const body = existingWrap.querySelector('.thinking-body');
      const thinkingUpdate = existingWrap.querySelector('.thinking-update');
      const text = existingWrap.querySelector('.thinking-text');
      const toggleContent = toggle?.querySelector('.thinking-toggle-content');
      aiNode._thinkingEl = {
        wrap: existingWrap,
        toggle,
        body,
        thinkingUpdate,
        text,
        toggleContent,
        userScrolled: () => false,
      };
      aiNode._thinkingReady = true;
      return aiNode._thinkingEl;
    }

    const wrap = document.createElement('div');
    wrap.className = 'thinking-wrap';
    const toggle = document.createElement('button');
    toggle.className = 'thinking-toggle';
    toggle.setAttribute('aria-expanded', 'false');
    const toggleContent = document.createElement('div');
    toggleContent.className = 'thinking-toggle-content';
    const toggleLabel = document.createElement('span');
    toggleLabel.textContent = 'Thinking';
    const toggleIcon = document.createElementNS
      ? document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      : document.createElement('svg');
    toggleIcon.setAttribute('viewBox', '0 0 24 24');
    const path = document.createElementNS
      ? document.createElementNS('http://www.w3.org/2000/svg', 'path')
      : document.createElement('path');
    path.setAttribute('d', 'M6 9l6 6 6-6');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('stroke-linecap', 'round');
    toggleIcon.appendChild(path);
    toggleContent.append(toggleLabel, toggleIcon);
    toggle.appendChild(toggleContent);
    const body = document.createElement('div');
    body.className = 'thinking-body';
    const thinkingUpdate = document.createElement('div');
    thinkingUpdate.className = 'thinking-update';
    const text = document.createElement('div');
    text.className = 'thinking-text';
    body.append(thinkingUpdate, text);
    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', expanded ? 'false' : 'true');
      body.classList.toggle('expanded', !expanded);
    });
    wrap.append(toggle, body);
    content.prepend(wrap);

    const listeners = [];
    let userScrolled = false;
    const scrollListener = () => {
      if (!body.classList.contains('expanded')) return;
      const atBottom =
        body.scrollTop + body.clientHeight >= body.scrollHeight - 10;
      userScrolled = !atBottom;
    };
    body.addEventListener('scroll', scrollListener);
    listeners.push({ element: body, type: 'scroll', listener: scrollListener });

    aiNode.cleanupThinkingUI = () => {
      listeners.forEach(({ element, type, listener }) =>
        element.removeEventListener(type, listener),
      );
    };

    aiNode._thinkingEl = {
      wrap,
      toggle,
      body,
      thinkingUpdate,
      text,
      toggleContent,
      userScrolled: () => userScrolled,
      _listeners: listeners,
    };
    aiNode._thinkingReady = true;
    return aiNode._thinkingEl;
  }

  async function updateThinkingUpdateUI(aiNode, session, messageIndex) {
    const el = aiNode?._thinkingEl;
    if (!el || !el.thinkingUpdate) return;

    if (!el.body.classList.contains('expanded')) {
      el.body.classList.add('expanded');
      el.toggle.setAttribute('aria-expanded', 'true');
    }

    const updates = session._x_think_updates?.[messageIndex] || [];
    el.thinkingUpdate.innerHTML = '';

    for (const update of updates) {
      const updateItem = document.createElement('div');
      updateItem.className = 'thinking-update-item';

      const titleDiv = document.createElement('div');
      titleDiv.className = 'thinking-update-title';
      titleDiv.textContent = update.title || 'Update';
      updateItem.appendChild(titleDiv);

      const contentDiv = document.createElement('div');
      contentDiv.className = 'thinking-update-content';
      const html = await customMarkdownFormat(update.content || '', {
        isThinkingText: true,
      });
      contentDiv.innerHTML = html;
      updateItem.appendChild(contentDiv);
      el.thinkingUpdate.appendChild(updateItem);
    }

    scrollThinkingToBottom(el);
  }

  async function updateThinkingUI(aiNode, session, messageIndex) {
    const el = ensureThinkingUI(aiNode);
    if (!el) return;

    if (!el.body.classList.contains('expanded')) {
      el.body.classList.add('expanded');
      el.toggle.setAttribute('aria-expanded', 'true');
    }

    const data = session?._x_think?.[messageIndex];
    const fullText =
      (typeof data === 'object' ? data?.text : data) || '';
    const html = await customMarkdownFormat(fullText, {
      isThinkingText: true,
    });
    el.text.innerHTML = html;
    el._lastRenderedLength = fullText.length;
    scrollThinkingToBottom(el);
  }

  async function appendThinking(aiNode, chunk, session, messageIndex) {
    if (!chunk || !aiNode || !session || messageIndex == null) return;
    ensureThinkingUI(aiNode);
    session._x_think = session._x_think || {};
    const existing = session._x_think[messageIndex];
    const currentText =
      typeof existing === 'object' ? existing.text || '' : existing || '';
    session._x_think[messageIndex] = {
      ...(typeof existing === 'object' ? existing : {}),
      text: currentText + chunk,
      duration: existing?.duration || 0,
    };

    await updateThinkingUI(aiNode, session, messageIndex);
    scheduleSave();
  }

  async function appendThinkingUpdate(aiNode, updateData, session, messageIndex) {
    if (!updateData || !aiNode || !session || messageIndex == null) return;
    ensureThinkingUI(aiNode);
    session._x_think_updates = session._x_think_updates || {};
    if (!session._x_think_updates[messageIndex]) {
      session._x_think_updates[messageIndex] = [];
    }
    session._x_think_updates[messageIndex].push({
      title: updateData.title || 'Update',
      content: updateData.content || '',
      timestamp: Date.now(),
    });
    await updateThinkingUpdateUI(aiNode, session, messageIndex);
    scheduleSave();
  }

  function finalizeThinkingUI(aiNode, duration, metadataOverride) {
    const el = aiNode?._thinkingEl;
    if (!el || !el.toggleContent) return;
    const metadata = metadataOverride || aiNode._messageMetadata || {};
    if (metadata.webSearchPages > 0) {
      el.toggleContent.innerHTML = `<span>Read ${metadata.webSearchPages} pages</span>`;
      return;
    }
    const seconds = Math.max(duration || 0, 0);
    el.toggleContent.innerHTML = `<span>Thought for ${seconds.toFixed(1)}s</span>`;
  }

  return {
    cleanLeadingWhitespace,
    renderThinkingText,
    renderWithExistingFormatter,
    ensureThinkingUI,
    appendThinking,
    appendThinkingUpdate,
    updateThinkingUI,
    updateThinkingUpdateUI,
    finalizeThinkingUI,
    scrollThinkingToBottom,
  };
}

module.exports = {
  cleanLeadingWhitespace,
  renderThinkingText,
  renderWithExistingFormatter,
  createThinkingUIManager,
};

(function attachToGlobal(global) {
  if (global) {
    global.__renderModules = global.__renderModules || {};
    global.__renderModules.createThinkingUIManager = createThinkingUIManager;
    global.__renderModules.cleanLeadingWhitespace = cleanLeadingWhitespace;
  }
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : undefined);
