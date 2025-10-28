/**
 * Sidebar Sessions Module
 * Extracted from renderer.js - 99% exact code
 * Renders session list in sidebar
 */

(function() {
  'use strict';

  function renderSessions() {
    const sessionList = document.getElementById("session-list");
    if (!sessionList) return;

    const sessions = state.sessions || [];
    
    if (sessions.length === 0) {
      sessionList.innerHTML = `
        <div class="empty-sessions">
          <p>No sessions yet</p>
          <p class="empty-hint">Start a conversation to create your first session</p>
        </div>
      `;
      return;
    }

    sessionList.innerHTML = sessions
      .map((session) => {
        const isActive = current && current.id === session.id;
        const activeClass = isActive ? "active" : "";
        const name = session.name || "Untitled Chat";
        const timestamp = session.updated_at || session.created_at;
        const timeAgo = formatRelativeTime(timestamp);

        return `
          <li class="session-item ${activeClass}" data-session-id="${session.id}">
            <div class="session-content" data-session-id="${session.id}">
              <div class="session-name">${escHtml(name)}</div>
              <div class="session-time">${timeAgo}</div>
            </div>
            <button class="session-menu-btn" data-session-id="${session.id}" title="Session menu">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <circle cx="8" cy="3" r="1.5"/>
                <circle cx="8" cy="8" r="1.5"/>
                <circle cx="8" cy="13" r="1.5"/>
              </svg>
            </button>
          </li>
        `;
      })
      .join("");

    attachSessionClickHandlers();
    updateActiveSessionState();

    log("UI", 1, "renderSessions", "Sessions rendered", {
      count: sessions.length,
      activeId: current?.id,
    });
  }

  function attachSessionClickHandlers() {
    const sessionItems = document.querySelectorAll(".session-item .session-content");
    sessionItems.forEach((item) => {
      item.addEventListener("click", () => {
        const sessionId = item.dataset.sessionId;
        const session = state.sessions.find((s) => s.id === sessionId);
        if (session) {
          setCurrent(session);
          showChatPage();
        }
      });
    });
  }

  function updateActiveSessionState() {
    const sessionItems = document.querySelectorAll(".session-item");
    sessionItems.forEach((item) => {
      const sessionId = item.dataset.sessionId;
      if (sessionId === current?.id) {
        item.classList.add("active");
      } else {
        item.classList.remove("active");
      }
    });
  }

  // Export to global window object
  window.renderSessions = renderSessions;
  window.attachSessionClickHandlers = attachSessionClickHandlers;
  window.updateActiveSessionState = updateActiveSessionState;
})();
