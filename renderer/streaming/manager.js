/**
 * Stream Manager Module
 * Extracted from renderer.js - 99% exact code
 * Manages active streaming connections and state
 */

(function() {
  'use strict';

  const streamManager = {
    activeStreams: {},
    byKey: {},

    makeKey(session, messageIndex) {
      return `${session.id}:${messageIndex}`;
    },

    stopAllForKey(key) {
      const oldId = this.byKey[key];
      if (oldId && this.activeStreams[oldId]) {
        this.activeStreams[oldId].controller?.cancel?.();
        delete this.activeStreams[oldId];
      }
      delete this.byKey[key];
    },

    gcZombies() {
      for (const id in this.activeStreams) {
        const s = this.activeStreams[id];

        const wrongNode =
          s?.aiNode &&
          s.aiNode.dataset?.streamId &&
          s.aiNode.dataset.streamId !== id;
        if (wrongNode) {
          try {
            s.controller?.cancel?.();
          } catch {}
          delete this.activeStreams[id];
          continue;
        }

        const offscreen = !s?.aiNode || !document.contains(s.aiNode);
        if (offscreen) {
          s.offscreen = true;
          continue;
        }
      }
    },

    markAwaitingResume() {
      this.gcZombies();
      const now = Date.now();
      for (const id in this.activeStreams) {
        const s = this.activeStreams[id];
        s.awaitingResume = true;
        if (!s.lastActivity) s.lastActivity = now;
      }
    },

    kickSoftResume(reason = "online") {
      this.gcZombies();

      const now = Date.now();
      const STALE_MS = 6000;
      for (const id in this.activeStreams) {
        const s = this.activeStreams[id];

        if (s.isResuming) continue;

        if (s.sawEnd || s.endSeen) continue;

        const stale = now - (s.lastActivity || s.startedAt || 0);
        const shouldResume = s.awaitingResume || stale > STALE_MS;

        if (!shouldResume) continue;

        s.isResuming = true;

        try {
          if (typeof s.autoResume === "function") {
            s.autoResume(reason);
          } else {
            const msgs =
              s.messages ||
              buildResumeMessagesFromSession(
                s.session,
                s.messageIndex,
                s.fullResponse,
              );
            startStream(
              s.session,
              s.contextPrompt ?? null,
              s.aiNode,
              s.messageIndex,
              false,
              msgs,
            );
          }
        } catch (err) {
          log("STREAM", 3, "kickSoftResume", "Gagal soft resume", {
            streamId: id,
            error: err.message,
          });
        } finally {
          s.isResuming = false;
          s.awaitingResume = false;
        }
      }

      updateInputState?.();
    },

    startStream(streamId, data) {
      const key = this.makeKey(data.session, data.messageIndex);
      this.stopAllForKey(key);
      this.gcZombies();
      this.activeStreams[streamId] = { ...data, fullResponse: "" };
      this.byKey[key] = streamId;
      updateInputState();
    },

    stopStream(streamId) {
      this.gcZombies();
      log("STREAM", 1, "stopStream", "Attempting to stop stream", { streamId });
      log("STREAM", 0, "stopStream", "Active streams before stopping", {
        activeStreams: Object.keys(this.activeStreams),
      });

      if (this.activeStreams[streamId]) {
        this.activeStreams[streamId].controller?.cancel();
        const { [streamId]: _, ...rest } = this.activeStreams;
        this.activeStreams = rest;
        log(
          "STREAM",
          2,
          "stopStream",
          "Stream stopped and removed from active list",
          { streamId },
        );

        collapseSpacer();
      } else {
        log("STREAM", 3, "stopStream", "Failed to stop stream: ID not found", {
          streamId,
        });
      }

      for (const k in this.byKey)
        if (this.byKey[k] === streamId) delete this.byKey[k];
      log("STREAM", 0, "stopStream", "Active streams after stopping", {
        activeStreams: Object.keys(this.activeStreams),
      });
      updateInputState();
    },

    isStreaming() {
      return Object.keys(this.activeStreams).length > 0;
    },

    isStreamingInSession(session) {
      if (!session || !session.id) return false;
      for (const id in this.activeStreams) {
        const s = this.activeStreams[id];
        if (s.session && s.session.id === session.id) return true;
      }
      return false;
    },

    getStreamForSession(session) {
      if (!session || !session.id) return null;
      for (const id in this.activeStreams) {
        const s = this.activeStreams[id];
        if (s.session && s.session.id === session.id) return { id, ...s };
      }
      return null;
    },
  };

  // Export to global window object
  window.streamManager = streamManager;
})();
