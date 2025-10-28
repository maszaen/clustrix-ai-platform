/**
 * Chats Page Module
 * Extracted from renderer.js - 99% exact code
 * Renders chat conversation page
 */

(function() {
  'use strict';

  function showChatPage() {
    savePageState("chat", current?.id);
    
    if (typeof pushPageHistory === 'function' && current) {
      pushPageHistory({ page: 'chat', sessionId: current.id });
    }

    const chatArea = document.querySelector(".chat-area");
    const projectDetailView = document.querySelector(".project-detail-view");
    const welcomeScreen = document.getElementById("welcome-screen");

    chatArea.classList.remove("welcome-active");
    chatArea.classList.remove("chats-active");
    chatArea.classList.remove("artifacts-active");
    chatArea.classList.remove("projects-active");
    projectDetailView.classList.remove("active");

    if (welcomeScreen) {
      welcomeScreen.style.display = "none";
    }

    document.getElementById("chats-btn")?.classList.remove("active");
    document.getElementById("artifact-btn")?.classList.remove("active");
    document.getElementById("projects-btn")?.classList.remove("active");

    const chatLogContainer = document.querySelector(".chat-log-container");
    if (chatLogContainer && !chatLogContainer.querySelector("#chat-log")) {
      chatLogContainer.innerHTML = `<div id="chat-log"></div>`;
    }

    updateInputState();

    log("NAV", 2, "showChatPage", "Chat page displayed", {
      sessionId: current?.id,
      sessionName: current?.name,
    });
  }

  // Export to global window object
  window.showChatPage = showChatPage;
})();
