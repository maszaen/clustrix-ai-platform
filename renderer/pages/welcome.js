/**
 * Welcome Page Module
 * Extracted from renderer.js - 99% exact code
 * Renders welcome/home page
 */

(function() {
  'use strict';

  function showWelcomeScreen() {
    savePageState("welcome");
    
    if (typeof pushPageHistory === 'function') {
      pushPageHistory({ page: 'welcome' });
    }

    current = null;
    
    const chatArea = document.querySelector(".chat-area");
    const projectDetailView = document.querySelector(".project-detail-view");
    const welcomeScreen = document.getElementById("welcome-screen");
    
    chatArea.classList.add("welcome-active");
    chatArea.classList.remove("chats-active");
    chatArea.classList.remove("artifacts-active");
    chatArea.classList.remove("projects-active");
    projectDetailView.classList.remove("active");

    if (welcomeScreen) {
      welcomeScreen.style.display = "flex";
    }

    const chatLogContainer = document.querySelector(".chat-log-container");
    if (chatLogContainer) {
      chatLogContainer.innerHTML = "";
    }

    document.getElementById("chats-btn")?.classList.remove("active");
    document.getElementById("artifact-btn")?.classList.remove("active");
    document.getElementById("projects-btn")?.classList.remove("active");

    renderSessions();
    updateInputState();

    const msgCentral = $("#msg-central");
    if (msgCentral) {
      const draft = loadDraftForSession("welcome-screen");
      msgCentral.value = draft || "";
      
      const shell = msgCentral.closest(".ta-shell");
      if (shell && shell._scrollbarInstance) {
        shell._scrollbarInstance.updateLayout();
      } else {
        msgCentral.style.height = "auto";
        msgCentral.style.height = `${Math.min(msgCentral.scrollHeight, 350)}px`;
      }
    }

    log("NAV", 2, "showWelcomeScreen", "Welcome screen displayed");
  }

  function renderWelcome() {
    showWelcomeScreen();
  }

  function showWelcome() {
    showWelcomeScreen();
  }

  // Export to global window object
  window.showWelcomeScreen = showWelcomeScreen;
  window.renderWelcome = renderWelcome;
  window.showWelcome = showWelcome;
})();
