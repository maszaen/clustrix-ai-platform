/**
 * IPC API Wrapper Module
 * Extracted from renderer.js - 99% exact code
 * Electron IPC communication wrappers
 */

(function() {
  'use strict';

  async function save() {
    if (!state || !state.sessions) {
      log("SAVE", 3, "save", "No state to save");
      return;
    }

    try {
      const shouldUseIncremental = state.sessions.length > 10;
      let dataToSave;

      if (shouldUseIncremental && typeof getDirtySessions === 'function') {
        const dirtySessions = getDirtySessions();
        if (dirtySessions.length > 0) {
          dataToSave = {
            sessions: dirtySessions,
            settings: state.settings,
            incremental: true,
          };
          log("SAVE", 1, "save", `Incremental save: ${dirtySessions.length} dirty sessions`, {
            dirtyIds: dirtySessions.map((s) => s.id),
          });
        } else {
          dataToSave = { sessions: state.sessions, settings: state.settings };
          log("SAVE", 1, "save", `Full save: ${state.sessions.length} sessions`);
        }
      } else {
        dataToSave = { sessions: state.sessions, settings: state.settings };
        log("SAVE", 1, "save", `Full save: ${state.sessions.length} sessions`);
      }

      if (DEBUG_MODE) {
        localStorage.setItem("clustrix-data", JSON.stringify({
          sessions: state.sessions,
          settings: state.settings,
        }));
      } else {
        await window.api.sessions.save(dataToSave);
      }

      if (typeof clearDirtyTracking === 'function') {
        clearDirtyTracking();
      }

      log("APP", 2, "save", "Data saved successfully", {
        wasIncremental: shouldUseIncremental,
      });

      if (current && current.id) {
        const chatLog = domCache.getChatLog();
        if (chatLog && chatLog.innerHTML.trim()) {
          const scroller = getChatScroller();
          const scrollPos = scroller ? scroller.scrollTop : 0;
          cacheSession(current.id, chatLog.innerHTML, scrollPos, current._lazyState);
          log("CACHE", 1, "save", "Auto-cached current session after save");
        }
      }
    } catch (e) {
      console.error("Save failed:", e);
      log("APP", 4, "save", "Failed to save data.", { error: e });
    }
  }

  async function load() {
    try {
      let data;

      if (DEBUG_MODE) {
        const stored = localStorage.getItem("clustrix-data");
        data = stored ? JSON.parse(stored) : null;
      } else {
        data = await window.api.sessions.load();
      }

      if (data) {
        state.sessions = data.sessions || [];
        state.settings = data.settings || getDefaultSettings();

        log("APP", 2, "load", "Data loaded successfully", {
          sessionCount: state.sessions.length,
        });
      } else {
        state.sessions = [];
        state.settings = getDefaultSettings();
        log("APP", 2, "load", "No data found, using defaults");
      }

      renderSessions();
      updateInputState();
    } catch (e) {
      console.error("Load failed:", e);
      log("APP", 4, "load", "Failed to load data", { error: e });

      state.sessions = [];
      state.settings = getDefaultSettings();
    }
  }

  function getDefaultSettings() {
    return {
      theme: "dark",
      persona: { name: "", work: "", prefs: "" },
      streamThrottling: "normal",
      language: "en",
      webSearchEnabled: false,
      showProjects: true,
      showStarred: false,
    };
  }

  // Export to global window object
  window.save = save;
  window.load = load;
  window.getDefaultSettings = getDefaultSettings;
})();
