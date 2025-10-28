/**
 * Markdown Worker Module
 * Extracted from renderer.js - 99% exact code
 * Manages Web Worker for markdown rendering
 */

(function() {
  'use strict';

  let markdownWorker = null;
  let workerMessageId = 0;
  const workerPromises = new Map();

  function shouldNormalizeParagraphLists(html) {
    if (typeof html !== 'string' || !html) return false;
    if (html.includes('p-has-li')) return true;
    return /<\/p>\s*<(?:ul|ol)(?=\b|>)/i.test(html);
  }

  function normalizeParagraphListHtml(html) {
    if (!shouldNormalizeParagraphLists(html)) {
      return html || '';
    }
    if (typeof addPHasListClass !== 'function' || typeof document === 'undefined') {
      return html || '';
    }
    try {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = html || '';
      addPHasListClass(tempDiv);
      return tempDiv.innerHTML;
    } catch (err) {
      log('MARKDOWN', 2, 'normalizeParagraphListHtml', 'Failed to normalize paragraph/list spacing', { error: err.message });
      return html || '';
    }
  }

  function initMarkdownWorker() {
    if (markdownWorker) return;
    
    try {
      log('WORKER', 1, 'initMarkdownWorker', 'Initializing markdown worker...');
      markdownWorker = new Worker('./md.worker.js');
      
      markdownWorker.onmessage = function(event) {
        const { type, html, streamId, messageId } = event.data || {};
        
        if (messageId && workerPromises.has(messageId)) {
          const { resolve } = workerPromises.get(messageId);
          workerPromises.delete(messageId);
          log('WORKER', 1, 'onmessage', 'Worker resolved message', { messageId, htmlLength: html?.length || 0 });
          const normalizedHtml = normalizeParagraphListHtml(html || '');
          resolve(normalizedHtml);
        }
      };
      
      markdownWorker.onerror = function(error) {
        log('WORKER', 3, 'onerror', 'Markdown worker error', { error: error.message });
        // Clear worker to force fallback
        markdownWorker = null;
      };
      
      markdownWorker.onmessageerror = function(error) {
        log('WORKER', 3, 'onmessageerror', 'Worker message error', { error: error.message });
        markdownWorker = null;
      };
      
      log('WORKER', 1, 'initMarkdownWorker', 'Markdown worker initialized successfully');
    } catch (error) {
      log('WORKER', 3, 'initMarkdownWorker', 'Failed to initialize markdown worker', { error: error.message });
      markdownWorker = null;
    }
  }

  function terminateMarkdownWorker() {
    if (markdownWorker) {
      markdownWorker.terminate();
      markdownWorker = null;
      workerPromises.clear();
      log('WORKER', 1, 'terminateMarkdownWorker', 'Markdown worker terminated');
    }
  }

  // Export to global window object
  window.markdownWorker = null; // Access via getter/setter
  window.workerMessageId = 0;
  window.workerPromises = workerPromises;
  window.initMarkdownWorker = initMarkdownWorker;
  window.terminateMarkdownWorker = terminateMarkdownWorker;
  window.shouldNormalizeParagraphLists = shouldNormalizeParagraphLists;
  window.normalizeParagraphListHtml = normalizeParagraphListHtml;
  
  // Getter/setter for markdownWorker
  Object.defineProperty(window, 'markdownWorker', {
    get() { return markdownWorker; },
    set(val) { markdownWorker = val; }
  });
  
  Object.defineProperty(window, 'workerMessageId', {
    get() { return workerMessageId; },
    set(val) { workerMessageId = val; }
  });
})();
