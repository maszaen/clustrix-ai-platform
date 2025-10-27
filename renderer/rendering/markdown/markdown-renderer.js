'use strict';

const { createLogger } = require('../../utils/logger');
const { createMarkdownWorkerManager } = require('./markdown-worker');

function defaultFallbackRenderer(src, options = {}) {
  try {
    // Lazy load to avoid requiring DOM when running in tests.
    const { md } = require('../../md.js');
    return md(src, options);
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') {
      // eslint-disable-next-line no-console
      console.warn('markdown-renderer: fallback renderer unavailable, returning raw markdown', error.message);
    }
    return src;
  }
}

function normalizeParagraphListHtml(html) {
  if (typeof html !== 'string' || !html) return html || '';
  if (html.includes('p-has-li')) return html;
  const pattern = /<\/p>\s*<(?:ul|ol)(?=\b|>)/i;
  if (!pattern.test(html)) return html;

  if (typeof document === 'undefined') return html;

  try {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    const paragraphs = tempDiv.querySelectorAll('p + ul, p + ol');

    paragraphs.forEach((list) => {
      const prev = list.previousElementSibling;
      if (prev && prev.tagName === 'P') {
        prev.classList.add('p-has-li');
      }
    });

    return tempDiv.innerHTML;
  } catch (_) {
    return html;
  }
}

function analyzeContent(src) {
  const contentSize = src.length;
  const hasComplexElements = /```[\s\S]*?```|<[^>]+>|\$\$[\s\S]*?\$\$|\|.*\|.*\|/.test(src);
  const hasLotsOfCode = (src.match(/```/g) || []).length > 4;
  return { contentSize, hasComplexElements, hasLotsOfCode };
}

function shouldUseWorker(analysis, options) {
  const {
    forceSync = false,
    forceWorker = false,
    isStreaming = false,
    isSessionSwitch = false,
  } = options;

  if (forceSync) return false;
  if (forceWorker) return true;
  if (isSessionSwitch) return false;
  if (isStreaming) {
    return (
      analysis.contentSize > 3000 ||
      analysis.hasLotsOfCode ||
      analysis.hasComplexElements
    );
  }
  return (
    analysis.contentSize > 2000 ||
    analysis.hasLotsOfCode ||
    analysis.hasComplexElements
  );
}

function createMarkdownRenderer({
  logger = createLogger('MARKDOWN'),
  workerManager = createMarkdownWorkerManager({ logger }),
  fallbackRenderer = defaultFallbackRenderer,
} = {}) {
  async function renderFallback(src, options = {}) {
    const result = await Promise.resolve(fallbackRenderer(src, options));
    return normalizeParagraphListHtml(result || '');
  }

  async function renderWithWorker(src, options, analysis) {
    const html = await workerManager.processMarkdown(src, {
      streamId: options.streamId,
      normalize: normalizeParagraphListHtml,
    });
    if (html === null) {
      logger.warn('worker', 'Worker unavailable, falling back to sync', {
        contentSize: analysis.contentSize,
      });
      return renderFallback(src, options);
    }
    return html;
  }

  async function render(src, options = {}) {
    if (!src) return '';

    const analysis = analyzeContent(src);
    const useWorker = shouldUseWorker(analysis, options);

    logger.debug('render', useWorker ? 'Using worker rendering' : 'Using fallback rendering', {
      contentSize: analysis.contentSize,
      hasComplexElements: analysis.hasComplexElements,
      reason: options.forceSync
        ? 'forced-sync'
        : options.forceWorker
        ? 'forced-worker'
        : options.isSessionSwitch
        ? 'session-switch'
        : options.isStreaming
        ? 'streaming'
        : 'auto',
    });

    if (!useWorker) {
      return renderFallback(src, options);
    }
    return renderWithWorker(src, options, analysis);
  }

  function dispose() {
    workerManager.dispose?.();
  }

  return {
    render,
    renderSync: (src, options = {}) =>
      normalizeParagraphListHtml(fallbackRenderer(src, options) || ''),
    dispose,
  };
}

function splitMarkdownForStreaming(text) {
  if (!text) return [];
  return text.split(/(\s+)/).filter((token) => token.length > 0);
}

module.exports = {
  createMarkdownRenderer,
  normalizeParagraphListHtml,
  splitMarkdownForStreaming,
};
