(function (global) {
  if (!global) return;

  const state = {
    sessions: [],
    settings: {
      persona: { name: "", work: "", prefs: "" },
      theme: "light",
      streamThrottling: "auto",
      language: "autodetect",
    },
  };

  const sessionDrafts = new Map();
  const dirtySessionIds = new Set();
  let saveScheduled = false;

  function setSaveScheduled(value) {
    saveScheduled = Boolean(value);
  }

  function isSaveScheduled() {
    return saveScheduled;
  }

  function markSessionDirty(sessionId) {
    if (sessionId) dirtySessionIds.add(sessionId);
  }

  function clearDirtySessions() {
    dirtySessionIds.clear();
  }

  function removeDirtySession(sessionId) {
    dirtySessionIds.delete(sessionId);
  }

  function resetStore() {
    state.sessions = [];
    state.settings = {
      persona: { name: "", work: "", prefs: "" },
      theme: "light",
      streamThrottling: "auto",
      language: "autodetect",
    };
    sessionDrafts.clear();
    dirtySessionIds.clear();
    saveScheduled = false;
  }

  global.sessionStore = {
    state,
    sessionDrafts,
    dirtySessionIds,
    setSaveScheduled,
    isSaveScheduled,
    markSessionDirty,
    clearDirtySessions,
    removeDirtySession,
    resetStore,
  };
})(window);
