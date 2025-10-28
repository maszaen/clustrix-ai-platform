/**
 * Input State Management Module
 * Extracted from renderer.js - 99% exact code
 * Manages textarea input state and UI updates
 */

(function() {
  'use strict';

  function updateInputState() {
    const isStreaming = streamManager.isStreamingInSession(current);
    const isCurrentNull = !current;
    const isProjectSession = current && current.type === 'project';

    const msgEl = $("#msg");
    if (msgEl) {
      msgEl.disabled = isCurrentNull;
      if (isCurrentNull) {
        msgEl.placeholder = "Select a session to start";
      } else if (isStreaming) {
        msgEl.placeholder = "Ask anything";
      } else {
        msgEl.placeholder = "Ask anything";
      }
    }

    const sendBtn = $("#send");
    if (sendBtn) {
      sendBtn.disabled = isCurrentNull;

      if (isStreaming) {
        sendBtn.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 18 18" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-square-icon lucide-square"><rect width="12" height="12" x="3" y="3" rx="2"/></svg>`;
        sendBtn.classList.add("interrupt");
        sendBtn.title = "Interrupt response";
      } else {
        sendBtn.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-up-icon lucide-arrow-up">
            <path d="m5 12 7-7 7 7"/>
            <path d="M12 19V5"/>
          </svg>
        `;
        sendBtn.classList.remove("interrupt");
        sendBtn.title = "Send message";
      }
    }

    const msgCentral = $("#msg-central");
    const sendCentral = $("#send-central");
    if (msgCentral && sendCentral) {
      msgCentral.disabled = false;
      sendCentral.disabled = false;
      msgCentral.placeholder = "How can i help you today?";
    }

    const webSearchSwitch = document.getElementById('web-search-switch');
    if (webSearchSwitch) {
      const webSearchToggle = webSearchSwitch.closest('.theme-switcher');
      if (webSearchToggle) {
        webSearchToggle.style.display = isProjectSession ? 'none' : '';
      }
    }

    log("INPUT", 1, "updateInputState", "Input state updated", {
      isStreaming,
      isCurrentNull,
      isProjectSession,
    });
  }

  function setupTextareaResize() {
    const msgEl = $("#msg");
    if (!msgEl) return;

    msgEl.addEventListener("input", () => {
      msgEl.style.height = "auto";
      msgEl.style.height = `${Math.min(msgEl.scrollHeight, 350)}px`;
    });
  }

  function setupTextareaCentralResize() {
    const msgCentral = $("#msg-central");
    if (!msgCentral) return;

    msgCentral.addEventListener("input", () => {
      msgCentral.style.height = "auto";
      msgCentral.style.height = `${Math.min(msgCentral.scrollHeight, 350)}px`;
    });
  }

  // Export to global window object
  window.updateInputState = updateInputState;
  window.setupTextareaResize = setupTextareaResize;
  window.setupTextareaCentralResize = setupTextareaCentralResize;
})();
