const { log } = require('../../../utils/logger');

class RequestLimiter {
  constructor() {
    this.counters = new Map();
    this.limits = new Map();
    this.startTimes = new Map();
  }

  /**
   * Set request limit for a session
   * @param {string} sessionId - Session identifier
   * @param {number} maxRequests - Maximum allowed requests
   */
  setLimit(sessionId, maxRequests) {
    this.limits.set(sessionId, maxRequests);
    this.counters.set(sessionId, 0);
    this.startTimes.set(sessionId, Date.now());
    
    log('REQUEST_LIMITER', 1, 'setLimit', `Session ${sessionId}: ${maxRequests} max`);
  }

  /**
   * Check if session can make another request
   * @param {string} sessionId - Session identifier
   * @returns {boolean} True if can make request
   */
  canMakeRequest(sessionId) {
    const count = this.counters.get(sessionId) || 0;
    const limit = this.limits.get(sessionId) || 50; // Default 50
    return count < limit;
  }

  /**
   * Increment request counter
   * @param {string} sessionId - Session identifier
   * @returns {number} New counter value
   */
  incrementCounter(sessionId) {
    const count = this.counters.get(sessionId) || 0;
    const newCount = count + 1;
    this.counters.set(sessionId, newCount);
    
    const limit = this.limits.get(sessionId) || 50;
    const remaining = limit - newCount;
    
    // Warn when getting close to limit
    if (remaining <= 10 && remaining > 0) {
      log('REQUEST_LIMITER', 2, 'increment', `Session ${sessionId}: ${remaining} requests left`);
    } else if (remaining === 0) {
      log('REQUEST_LIMITER', 2, 'increment', `Session ${sessionId}: LIMIT REACHED`);
    }
    
    return newCount;
  }

  /**
   * Get remaining requests
   * @param {string} sessionId - Session identifier
   * @returns {number} Remaining requests
   */
  getRemaining(sessionId) {
    const count = this.counters.get(sessionId) || 0;
    const limit = this.limits.get(sessionId) || 50;
    return Math.max(0, limit - count);
  }

  /**
   * Get full status for a session
   * @param {string} sessionId - Session identifier
   * @returns {Object} Status details
   */
  getStatus(sessionId) {
    const count = this.counters.get(sessionId) || 0;
    const limit = this.limits.get(sessionId) || 50;
    const startTime = this.startTimes.get(sessionId) || Date.now();
    
    return {
      current: count,
      limit: limit,
      remaining: Math.max(0, limit - count),
      percentage: Math.round((count / limit) * 100),
      duration: Date.now() - startTime,
      isExhausted: count >= limit
    };
  }

  /**
   * Reset counter for a session
   * @param {string} sessionId - Session identifier
   */
  reset(sessionId) {
    this.counters.set(sessionId, 0);
    this.startTimes.set(sessionId, Date.now());
    
    log('REQUEST_LIMITER', 1, 'reset', `Session ${sessionId} counter reset`);
  }

  /**
   * Clean up session data
   * @param {string} sessionId - Session identifier
   */
  cleanup(sessionId) {
    this.counters.delete(sessionId);
    this.limits.delete(sessionId);
    this.startTimes.delete(sessionId);
    
    log('REQUEST_LIMITER', 1, 'cleanup', `Session ${sessionId} cleaned up`);
  }

  /**
   * Get all active sessions
   * @returns {Array} List of session IDs
   */
  getActiveSessions() {
    return Array.from(this.counters.keys());
  }

  /**
   * Get summary of all sessions
   * @returns {Object} Summary by session
   */
  getAllStatus() {
    const summary = {};
    
    for (const sessionId of this.counters.keys()) {
      summary[sessionId] = this.getStatus(sessionId);
    }
    
    return summary;
  }
}

module.exports = RequestLimiter;
