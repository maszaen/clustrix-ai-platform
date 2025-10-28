/**
 * Send Message Handler Module
 * Extracted from renderer.js - 99% exact code
 * Handles sending user messages
 */

(function() {
  'use strict';

  async function handleSendMessage() {
    if (!current) {
      log("UI", 3, "handleSendMessage", "No active session");
      return;
    }

    if (streamManager.isStreamingInSession(current)) {
      const activeStream = streamManager.getStreamForSession(current);
      if (activeStream && activeStream.id) {
        streamManager.stopStream(activeStream.id);
        log("SEND", 2, "handleSendMessage", "Interrupted active stream", {
          streamId: activeStream.id,
        });
      }
      return;
    }

    const msgInput = $("#msg");
    const text = msgInput.value.trim();

    if (!text && (!current.stagedFiles || current.stagedFiles.length === 0)) {
      log("UI", 1, "handleSendMessage", "Empty message, ignoring");
      return;
    }

    const userMessageContent = text;
    const stagedFiles = current.stagedFiles || [];

    msgInput.value = "";
    msgInput.style.height = "auto";

    const shell = msgInput.closest(".ta-shell");
    if (shell && shell._scrollbarInstance) {
      shell._scrollbarInstance.updateLayout();
    }

    try {
      saveDraftDebounced.cancel();
    } catch {}
    saveDraftForSession(current.id, "");

    current.stagedFiles = [];
    renderStagedFiles();

    const userMsg = {
      role: "user",
      content: userMessageContent,
      timestamp: nowISO(),
    };

    if (stagedFiles.length > 0) {
      userMsg.files = stagedFiles.map((f) => ({
        name: f.name,
        size: f.size,
        type: f.type,
        path: f.path,
      }));
    }

    current.messages.push(userMsg);
    current.updated_at = nowISO();
    current.last_updated = nowISO();

    const userIndex = current.messages.length - 1;
    addMessage("user", userMessageContent, userIndex, userMsg.timestamp, null, stagedFiles);

    const aiIndex = current.messages.length;
    const aiMsg = {
      role: "assistant",
      content: "",
      timestamp: nowISO(),
    };

    current.messages.push(aiMsg);

    const aiNode = addMessage("ai", "", aiIndex, aiMsg.timestamp, current.model);

    if (!aiNode) {
      log("SEND", 4, "handleSendMessage", "Failed to create AI message node");
      return;
    }

    scrollToBottomSmooth();

    const messages = buildMessagesArray(current);

    log("SEND", 2, "handleSendMessage", "Starting stream", {
      sessionId: current.id,
      messageIndex: aiIndex,
      hasFiles: stagedFiles.length > 0,
    });

    startStream(current, null, aiNode, aiIndex, false, messages);

    save();
  }

  // Export to global window object
  window.handleSendMessage = handleSendMessage;
})();
