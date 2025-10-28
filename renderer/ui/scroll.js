/**
 * Scroll Utilities Module
 * Extracted from renderer.js - 99% exact code
 * Scroll management for chat
 */

(function() {
  'use strict';

  function scrollToBottom() {
    const scroller = getChatScroller();
    if (!scroller) return;
    
    scroller.scrollTop = scroller.scrollHeight;
  }

  function scrollToBottomSmooth() {
    const scroller = getChatScroller();
    if (!scroller) return;
    
    scroller.scrollTo({
      top: scroller.scrollHeight,
      behavior: 'smooth'
    });
  }

  function getChatScroller() {
    return document.querySelector('.chat-log-container') || 
           document.querySelector('#chat-log')?.parentElement;
  }

  function isScrolledToBottom() {
    const scroller = getChatScroller();
    if (!scroller) return true;
    
    const threshold = 100;
    return scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < threshold;
  }

  // Export to global window object
  window.scrollToBottom = scrollToBottom;
  window.scrollToBottomSmooth = scrollToBottomSmooth;
  window.getChatScroller = getChatScroller;
  window.isScrolledToBottom = isScrolledToBottom;
})();
