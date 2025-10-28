/**
 * Session CRUD Module
 * Extracted from renderer.js - 99% exact code
 * Create, delete, duplicate session operations
 */

(function() {
  'use strict';

  function generateSessionId() {
    return `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  async function createNewSession(stagedFiles = [], options = {}) {
    const sessionId = generateSessionId();
    const timestamp = nowISO();
    
    const newSession = {
      id: sessionId,
      name: options.name || "Untitled Chat",
      messages: [],
      model: options.model || state.settings?.preferredModel || { provider: "openai", model: "gpt-4o" },
      created_at: timestamp,
      updated_at: timestamp,
      last_updated: timestamp,
      type: options.type || "chat"
    };

    if (stagedFiles && stagedFiles.length > 0) {
      newSession.files = stagedFiles.map(f => ({
        name: f.name,
        size: f.size,
        type: f.type,
        path: f.path
      }));
    }

    if (options.projectId) {
      newSession.projectId = options.projectId;
      newSession.type = "project";
    }

    state.sessions.unshift(newSession);
    
    log("SESSION", 2, "createNewSession", "New session created", {
      id: sessionId,
      name: newSession.name,
      type: newSession.type,
      filesCount: stagedFiles?.length || 0
    });

    await save();
    renderSessions();
    
    return newSession;
  }

  async function deleteSession(sessionToDelete) {
    if (!sessionToDelete) {
      log("SESSION", 3, "deleteSession", "No session provided for deletion");
      return;
    }

    const sessionId = sessionToDelete.id;
    const idx = state.sessions.findIndex(s => s.id === sessionId);
    
    if (idx === -1) {
      log("SESSION", 3, "deleteSession", "Session not found in state.sessions", { id: sessionId });
      return;
    }

    state.sessions.splice(idx, 1);
    
    invalidateSessionCache(sessionId);
    
    log("SESSION", 2, "deleteSession", "Session deleted", {
      id: sessionId,
      name: sessionToDelete.name,
      remaining: state.sessions.length
    });

    if (current && current.id === sessionId) {
      if (state.sessions.length > 0) {
        setCurrent(state.sessions[0]);
        showChatPage();
      } else {
        current = null;
        renderWelcome();
      }
    }

    await save();
    renderSessions();
    closeModal();
  }

  async function duplicateSession(sessionId) {
    const original = state.sessions.find(s => s.id === sessionId);
    if (!original) {
      log("SESSION", 3, "duplicateSession", "Session not found", { id: sessionId });
      return;
    }

    const duplicate = {
      ...original,
      id: generateSessionId(),
      name: `${original.name} (Copy)`,
      created_at: nowISO(),
      updated_at: nowISO(),
      last_updated: nowISO(),
      messages: original.messages ? JSON.parse(JSON.stringify(original.messages)) : []
    };

    state.sessions.unshift(duplicate);
    
    log("SESSION", 2, "duplicateSession", "Session duplicated", {
      originalId: sessionId,
      duplicateId: duplicate.id
    });

    await save();
    renderSessions();
    
    return duplicate;
  }

  // Export to global window object
  window.generateSessionId = generateSessionId;
  window.createNewSession = createNewSession;
  window.deleteSession = deleteSession;
  window.duplicateSession = duplicateSession;
})();
