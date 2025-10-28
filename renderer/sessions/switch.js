/**
 * Session Switch Module
 * Extracted from renderer.js - 99% exact code
 * Handle session switching with caching & state management
 */

(function() {
  'use strict';

  function setCurrent(s, justSentMessage = false) {
    if (current && current.id) {
      const msgInput = $("#msg");
      if (msgInput) {
        saveDraftForSession(current.id, msgInput.value);
      }
      
      const isStreamingInCurrentSession = streamManager.isStreamingInSession(current);
      if (!isStreamingInCurrentSession) {
        const chatLog = $("#chat-log");
        if (chatLog && chatLog.innerHTML.trim()) {
          const scroller = getChatScroller();
          const scrollPos = scroller ? scroller.scrollTop : 0;
          cacheSession(current.id, chatLog.innerHTML, scrollPos, current._lazyState);
          log("CACHE", 1, "setCurrent", "Cached session before switch (not streaming)");
        }
      } else {
        invalidateSessionCache(current.id);
        log("CACHE", 1, "setCurrent", "Invalidated cache for streaming session before switch");
      }
    }
    
    window._isSessionSwitching = true;
    document.body.classList.add('session-switching');
    current = s;

    if (current && current.id) {
      savePageState("chat", current.id);
      
      if (typeof pushPageHistory === 'function') {
        pushPageHistory({ page: 'chat', sessionId: current.id });
      }
      
      log(
        "SessionState",
        0,
        "setCurrent",
        `Session set as current and saved: ${current.name || "Untitled"} (${current.id})`,
      );
    }

    if (current) {
      ensureTokenFields(current);
    }

    const msgInput = $("#msg");
    if (msgInput) {
      const draft =
        justSentMessage || !current || !current.id
          ? ""
          : loadDraftForSession(current.id);
      msgInput.value = draft;

      const shell = msgInput.closest(".ta-shell");
      if (shell && shell._scrollbarInstance) {
        shell._scrollbarInstance.updateLayout();
      } else {
        msgInput.style.height = "auto";
        msgInput.style.height = `${Math.min(msgInput.scrollHeight, 350)}px`;
      }
    }

    const chatArea = document.querySelector(".chat-area");
    const projectDetailView = document.querySelector(".project-detail-view");
    chatArea.classList.remove("welcome-active");
    chatArea.classList.remove("chats-active");
    chatArea.classList.remove("artifacts-active");
    chatArea.classList.remove("projects-active");
    projectDetailView.classList.remove("active");

    document.getElementById("chats-btn")?.classList.remove("active");
    document.getElementById("artifact-btn")?.classList.remove("active");
    document.getElementById("projects-btn")?.classList.remove("active");

    const welcomeScreen = document.getElementById("welcome-screen");
    if (welcomeScreen) welcomeScreen.style.display = "";

    const chatLogContainer = document.querySelector(".chat-log-container");
    if (chatLogContainer && !chatLogContainer.querySelector("#chat-log")) {
      chatLogContainer.innerHTML = `
        <div id="chat-log"></div>
      `;
    }

    if (current) {
      current._lazyState = null;
      const scroller = getChatScroller();
      if (scroller) {
        scroller._lazyListenerAdded = false;
      }
      window._isLazyLoading = false;
    }

    renderHistory();
    renderSessions();
    updateInputState();
    
    requestAnimationFrame(() => {
      window._isSessionSwitching = false;
      document.body.classList.remove('session-switching');
    });
  }

  function updateActiveSessionState() {
    const sessionItems = document.querySelectorAll('.session-item');
    sessionItems.forEach(item => {
      const sessionId = item.dataset.sessionId;
      if (sessionId === current?.id) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  }

  // Export to global window object
  window.setCurrent = setCurrent;
  window.updateActiveSessionState = updateActiveSessionState;
})();
