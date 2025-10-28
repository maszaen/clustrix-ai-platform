/**
 * Regenerate Handler Module
 * Extracted from renderer.js - 99% exact code
 * Handles regenerating AI responses
 */

(function() {
  'use strict';

  async function handleRegenerate(messageIndex) {
    if (!current) {
      log("REGENERATE", 3, "handleRegenerate", "No active session");
      return;
    }

    if (typeof messageIndex !== "number" || messageIndex < 0) {
      log("REGENERATE", 3, "handleRegenerate", "Invalid message index", { messageIndex });
      return;
    }

    const msg = current.messages[messageIndex];
    if (!msg || msg.role !== "assistant") {
      log("REGENERATE", 3, "handleRegenerate", "Message not found or not assistant", {
        messageIndex,
        role: msg?.role,
      });
      return;
    }

    if (streamManager.isStreamingInSession(current)) {
      const activeStream = streamManager.getStreamForSession(current);
      if (activeStream && activeStream.id) {
        streamManager.stopStream(activeStream.id);
        log("REGENERATE", 2, "handleRegenerate", "Stopped active stream", {
          streamId: activeStream.id,
        });
      }
    }

    msg.content = "";
    msg.timestamp = nowISO();
    if (msg.thinking) msg.thinking = "";

    current.updated_at = nowISO();
    current.last_updated = nowISO();

    const aiNode = document.querySelector(
      `.message[data-role="ai"][data-index="${messageIndex}"]`
    );

    if (!aiNode) {
      log("REGENERATE", 4, "handleRegenerate", "AI message node not found", {
        messageIndex,
      });
      return;
    }

    const contentDiv = aiNode.querySelector(".message-text");
    if (contentDiv) {
      contentDiv.innerHTML = "";
    }

    if (aiNode._thinkingEl) {
      const thinkingWrap = aiNode._thinkingEl.wrap;
      if (thinkingWrap && thinkingWrap.parentNode) {
        thinkingWrap.parentNode.removeChild(thinkingWrap);
      }
      aiNode._thinkingEl = null;
      aiNode._thinkingReady = false;
    }

    const messages = buildMessagesArray(current, messageIndex);

    log("REGENERATE", 2, "handleRegenerate", "Starting regeneration", {
      sessionId: current.id,
      messageIndex,
    });

    startStream(current, null, aiNode, messageIndex, false, messages);

    save();
  }

  function setupRegenerateButtons() {
    const aiMessages = document.querySelectorAll('.message[data-role="ai"]');
    aiMessages.forEach((aiNode) => {
      const regenerateBtn = aiNode.querySelector(".regenerate-btn");
      if (regenerateBtn && !regenerateBtn.dataset.listenerAttached) {
        regenerateBtn.addEventListener("click", () => {
          const messageIndex = parseInt(aiNode.dataset.index, 10);
          handleRegenerate(messageIndex);
        });
        regenerateBtn.dataset.listenerAttached = "true";
      }
    });
  }

  // Export to global window object
  window.handleRegenerate = handleRegenerate;
  window.setupRegenerateButtons = setupRegenerateButtons;
})();
