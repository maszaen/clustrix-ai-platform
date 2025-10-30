/**
 * Stream Service Module
 * Handles AI response streaming management
 *
 * Migrated from: renderer.js (streamManager object)
 */

/**
 * StreamService - Manages active AI response streams
 */
class StreamService {
  constructor() {
    this.activeStreams = {};
    this.byKey = {}; // Maps session:messageIndex to streamId
  }

  // ============================================
  // STREAM LIFECYCLE
  // ============================================

  /**
   * Start a new stream
   * @param {string} streamId - Unique stream ID
   * @param {Object} data - Stream data
   * @returns {Object} Stream object
   */
  startStream(streamId, data) {
    const key = this.makeKey(data.session, data.messageIndex);

    // Stop any existing stream for this key
    this.stopAllForKey(key);

    // Clean up zombies
    this.gcZombies();

    // Register new stream
    this.activeStreams[streamId] = {
      ...data,
      fullResponse: '',
      startedAt: Date.now(),
      lastActivity: Date.now()
    };

    this.byKey[key] = streamId;

    return this.activeStreams[streamId];
  }

  /**
   * Stop a stream
   * @param {string} streamId - Stream ID
   * @returns {boolean} True if stopped
   */
  stopStream(streamId) {
    this.gcZombies();

    if (!this.activeStreams[streamId]) {
      return false;
    }

    // Cancel the stream controller
    const stream = this.activeStreams[streamId];
    if (stream.controller && typeof stream.controller.cancel === 'function') {
      try {
        stream.controller.cancel();
      } catch (error) {
        console.warn('Error canceling stream:', error);
      }
    }

    // Remove from active streams
    delete this.activeStreams[streamId];

    // Remove from byKey mapping
    for (const k in this.byKey) {
      if (this.byKey[k] === streamId) {
        delete this.byKey[k];
      }
    }

    return true;
  }

  /**
   * Stop all streams for a specific session:messageIndex key
   * @param {string} key - Key (session:messageIndex)
   */
  stopAllForKey(key) {
    const oldId = this.byKey[key];
    if (oldId && this.activeStreams[oldId]) {
      const stream = this.activeStreams[oldId];
      if (stream.controller && typeof stream.controller.cancel === 'function') {
        try {
          stream.controller.cancel();
        } catch (error) {
          console.warn('Error canceling stream by key:', error);
        }
      }
      delete this.activeStreams[oldId];
    }
    delete this.byKey[key];
  }

  /**
   * Stop all active streams
   * @returns {number} Number of streams stopped
   */
  stopAll() {
    let count = 0;

    for (const streamId in this.activeStreams) {
      const stream = this.activeStreams[streamId];
      if (stream.controller && typeof stream.controller.cancel === 'function') {
        try {
          stream.controller.cancel();
          count++;
        } catch (error) {
          console.warn('Error stopping stream:', error);
        }
      }
    }

    this.activeStreams = {};
    this.byKey = {};

    return count;
  }

  /**
   * Gracefully shutdown all streams
   * @returns {number} Number of streams stopped
   */
  shutdownGracefully() {
    if (!this.isStreaming()) {
      return 0;
    }

    const count = this.stopAll();
    return count;
  }

  // ============================================
  // STREAM QUERIES
  // ============================================

  /**
   * Check if any stream is active
   * @returns {boolean} True if streaming
   */
  isStreaming() {
    return Object.keys(this.activeStreams).length > 0;
  }

  /**
   * Check if streaming in specific session
   * @param {Object} session - Session object
   * @returns {boolean} True if streaming in session
   */
  isStreamingInSession(session) {
    if (!session) return false;

    for (const streamId in this.activeStreams) {
      const stream = this.activeStreams[streamId];
      if (stream.session === session || stream.session?.id === session.id) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get stream by ID
   * @param {string} streamId - Stream ID
   * @returns {Object|null} Stream object or null
   */
  getStream(streamId) {
    return this.activeStreams[streamId] || null;
  }

  /**
   * Get all active streams
   * @returns {Array} Array of stream objects
   */
  getAllStreams() {
    return Object.keys(this.activeStreams).map(id => ({
      id,
      ...this.activeStreams[id]
    }));
  }

  /**
   * Get stream count
   * @returns {number} Number of active streams
   */
  getStreamCount() {
    return Object.keys(this.activeStreams).length;
  }

  /**
   * Get streams for session
   * @param {Object} session - Session object
   * @returns {Array} Array of stream objects
   */
  getStreamsForSession(session) {
    if (!session) return [];

    const streams = [];
    for (const streamId in this.activeStreams) {
      const stream = this.activeStreams[streamId];
      if (stream.session === session || stream.session?.id === session.id) {
        streams.push({
          id: streamId,
          ...stream
        });
      }
    }

    return streams;
  }

  // ============================================
  // STREAM UTILITIES
  // ============================================

  /**
   * Make key from session and message index
   * @param {Object} session - Session object
   * @param {number} messageIndex - Message index
   * @returns {string} Key (session:messageIndex)
   */
  makeKey(session, messageIndex) {
    const sessionId = session?.id || session;
    return `${sessionId}:${messageIndex}`;
  }

  /**
   * Garbage collect zombie streams
   * Removes streams with invalid DOM nodes
   */
  gcZombies() {
    for (const id in this.activeStreams) {
      const s = this.activeStreams[id];

      // Check if aiNode has wrong streamId
      const wrongNode =
        s?.aiNode &&
        s.aiNode.dataset?.streamId &&
        s.aiNode.dataset.streamId !== id;

      if (wrongNode) {
        try {
          s.controller?.cancel?.();
        } catch (error) {
          console.warn('Error canceling zombie stream:', error);
        }
        delete this.activeStreams[id];
        continue;
      }

      // Check if aiNode is offscreen/removed
      const offscreen = !s?.aiNode || !document.contains(s.aiNode);
      if (offscreen) {
        s.offscreen = true;
      }
    }
  }

  /**
   * Mark all streams as awaiting resume
   * Used when connection is lost
   */
  markAwaitingResume() {
    this.gcZombies();
    const now = Date.now();

    for (const id in this.activeStreams) {
      const s = this.activeStreams[id];
      s.awaitingResume = true;
      if (!s.lastActivity) {
        s.lastActivity = now;
      }
    }
  }

  /**
   * Resume stale streams
   * @param {string} reason - Resume reason (e.g., 'online')
   * @param {Function} resumeCallback - Callback to resume stream
   */
  kickSoftResume(reason = 'online', resumeCallback = null) {
    this.gcZombies();

    const now = Date.now();
    const STALE_MS = 6000; // 6 seconds

    for (const id in this.activeStreams) {
      const s = this.activeStreams[id];

      // Skip if already resuming
      if (s.isResuming) continue;

      // Skip if already ended
      if (s.sawEnd || s.endSeen) continue;

      // Check if stale
      const stale = now - (s.lastActivity || s.startedAt || 0);
      const shouldResume = s.awaitingResume || stale > STALE_MS;

      if (!shouldResume) continue;

      s.isResuming = true;

      try {
        // Try custom autoResume function
        if (typeof s.autoResume === 'function') {
          s.autoResume(reason);
        } else if (typeof resumeCallback === 'function') {
          // Use provided callback
          resumeCallback(s, id);
        }
      } catch (err) {
        console.error('Failed to resume stream:', err);
      } finally {
        s.isResuming = false;
        s.awaitingResume = false;
      }
    }
  }

  /**
   * Update stream activity timestamp
   * @param {string} streamId - Stream ID
   */
  updateActivity(streamId) {
    const stream = this.activeStreams[streamId];
    if (stream) {
      stream.lastActivity = Date.now();
    }
  }

  /**
   * Append content to stream
   * @param {string} streamId - Stream ID
   * @param {string} content - Content to append
   * @returns {string} Full response
   */
  appendContent(streamId, content) {
    const stream = this.activeStreams[streamId];
    if (!stream) return '';

    stream.fullResponse = (stream.fullResponse || '') + content;
    this.updateActivity(streamId);

    return stream.fullResponse;
  }

  /**
   * Mark stream as ended
   * @param {string} streamId - Stream ID
   */
  markEnded(streamId) {
    const stream = this.activeStreams[streamId];
    if (stream) {
      stream.endSeen = true;
      stream.sawEnd = true;
      this.updateActivity(streamId);
    }
  }

  // ============================================
  // STREAM STATISTICS
  // ============================================

  /**
   * Get stream statistics
   * @returns {Object} Statistics object
   */
  getStats() {
    const streams = this.getAllStreams();

    return {
      total: streams.length,
      active: streams.filter(s => !s.endSeen && !s.sawEnd).length,
      ended: streams.filter(s => s.endSeen || s.sawEnd).length,
      resuming: streams.filter(s => s.isResuming).length,
      offscreen: streams.filter(s => s.offscreen).length,
      awaitingResume: streams.filter(s => s.awaitingResume).length
    };
  }

  /**
   * Get stream info
   * @param {string} streamId - Stream ID
   * @returns {Object|null} Stream info or null
   */
  getStreamInfo(streamId) {
    const stream = this.activeStreams[streamId];
    if (!stream) return null;

    return {
      id: streamId,
      sessionId: stream.session?.id,
      messageIndex: stream.messageIndex,
      startedAt: stream.startedAt,
      lastActivity: stream.lastActivity,
      duration: Date.now() - (stream.startedAt || Date.now()),
      contentLength: (stream.fullResponse || '').length,
      isEnded: stream.endSeen || stream.sawEnd,
      isResuming: stream.isResuming,
      isOffscreen: stream.offscreen,
      awaitingResume: stream.awaitingResume
    };
  }

  /**
   * Get all stream info
   * @returns {Array} Array of stream info objects
   */
  getAllStreamInfo() {
    return Object.keys(this.activeStreams).map(id => this.getStreamInfo(id));
  }
}

// Create singleton instance
const streamService = new StreamService();

// Convenience exports
export const startStream = (streamId, data) =>
  streamService.startStream(streamId, data);
export const stopStream = (streamId) =>
  streamService.stopStream(streamId);
export const stopAllStreams = () =>
  streamService.stopAll();
export const isStreaming = () =>
  streamService.isStreaming();
export const isStreamingInSession = (session) =>
  streamService.isStreamingInSession(session);
export const getStream = (streamId) =>
  streamService.getStream(streamId);
export const getAllStreams = () =>
  streamService.getAllStreams();
export const getStreamStats = () =>
  streamService.getStats();
export const updateStreamActivity = (streamId) =>
  streamService.updateActivity(streamId);
export const appendStreamContent = (streamId, content) =>
  streamService.appendContent(streamId, content);
export const markStreamEnded = (streamId) =>
  streamService.markEnded(streamId);

// Export class and singleton
export { StreamService };
export default streamService;
