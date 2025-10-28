/**
 * Session Drafts Module  
 * Extracted from renderer.js - 99% exact code
 * Manages draft autosave for sessions
 */

(function() {
  'use strict';

  let sessionDrafts = new Map();

  function saveDraftForSession(sessionId, content) {
    if (!sessionId) return;
    if (content && content.trim()) {
      sessionDrafts.set(sessionId, content);
    } else {
      sessionDrafts.delete(sessionId);
    }
    try {
      const draftsObj = Object.fromEntries(sessionDrafts);
      localStorage.setItem("session-drafts", JSON.stringify(draftsObj));
    } catch (e) {
      log("DRAFTS", 3, "saveDraftForSession", "Failed to save draft", {
        sessionId,
        error: e.message,
      });
    }
  }

  function loadDraftForSession(sessionId) {
    if (!sessionId) return "";
    const draft = sessionDrafts.get(sessionId) || "";
    return draft;
  }

  function loadAllDrafts() {
    try {
      const stored = localStorage.getItem("session-drafts");
      if (stored) {
        const draftsObj = JSON.parse(stored);
        sessionDrafts.clear();
        for (const [sessionId, content] of Object.entries(draftsObj)) {
          if (content && content.trim()) {
            sessionDrafts.set(sessionId, content);
          }
        }
      }
    } catch (e) {
      log("DRAFTS", 3, "loadDraftForSession", "Failed to load drafts", {
        error: e.message,
      });
      sessionDrafts.clear();
    }
  }

  const saveDraftDebounced = (() => {
    let timer = null;
    return Object.assign((sessionId, content) => {
      clearTimeout(timer);
      timer = setTimeout(() => saveDraftForSession(sessionId, content), 1000);
    }, {
      cancel: () => clearTimeout(timer)
    });
  })();

  // Export to global window object
  window.sessionDrafts = sessionDrafts;
  window.saveDraftForSession = saveDraftForSession;
  window.loadDraftForSession = loadDraftForSession;
  window.loadAllDrafts = loadAllDrafts;
  window.saveDraftDebounced = saveDraftDebounced;
})();
