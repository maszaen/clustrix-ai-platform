/**
 * Session Cache Module
 * Handles session caching with LRU eviction and expiry
 *
 * Migrated from: renderer.js lines 46-200 (session cache system)
 */

/**
 * SessionCacheEntry - Represents a cached session with metadata
 */
class SessionCacheEntry {
  constructor(sessionId, renderedHTML, scrollPosition = 0, lazyState = null) {
    this.sessionId = sessionId;
    this.renderedHTML = renderedHTML;
    this.scrollPosition = scrollPosition;
    this.lazyState = lazyState; // Store lazy loading state
    this.timestamp = Date.now();
    this.accessCount = 1;
    this.lastAccessed = Date.now();
  }

  /**
   * Check if cache entry has expired
   * @returns {boolean} True if expired
   */
  isExpired(expiryMs) {
    return Date.now() - this.timestamp > expiryMs;
  }

  /**
   * Update access metadata
   */
  touch() {
    this.lastAccessed = Date.now();
    this.accessCount++;
  }

  /**
   * Get age of cache entry in milliseconds
   * @returns {number} Age in ms
   */
  getAge() {
    return Date.now() - this.timestamp;
  }
}

/**
 * SessionCache - Smart caching system with LRU eviction
 */
class SessionCache {
  constructor(options = {}) {
    this.cache = new Map();
    this.maxSize = options.maxSize || 10;
    this.expiryMs = options.expiryMs || 15 * 60 * 1000; // 15 minutes default
    this.logHelper = options.logHelper || console.log;
  }

  /**
   * Get cached session
   * @param {string} sessionId - Session ID
   * @returns {SessionCacheEntry|null} Cache entry or null if not found/expired
   */
  get(sessionId) {
    const entry = this.cache.get(sessionId);
    if (!entry || entry.isExpired(this.expiryMs)) {
      this.cache.delete(sessionId);
      return null;
    }
    entry.touch();

    this._log('getCachedSession', 'Cache hit', {
      sessionId,
      age: entry.getAge(),
      accessCount: entry.accessCount
    });

    return entry;
  }

  /**
   * Cache a session
   * @param {string} sessionId - Session ID
   * @param {string} renderedHTML - Rendered HTML content
   * @param {number} scrollPosition - Scroll position to restore
   * @param {Object} lazyState - Lazy loading state
   */
  set(sessionId, renderedHTML, scrollPosition = 0, lazyState = null) {
    // Clean up expired entries
    this._cleanExpired();

    // Implement LRU eviction if cache is full
    if (this.cache.size >= this.maxSize) {
      this._evictLRU();
    }

    const cacheEntry = new SessionCacheEntry(sessionId, renderedHTML, scrollPosition, lazyState);
    this.cache.set(sessionId, cacheEntry);

    this._log('cacheSession', 'Session cached', {
      sessionId,
      htmlLength: renderedHTML.length,
      cacheSize: this.cache.size,
      hasLazyState: !!lazyState,
      lazyState: lazyState ? {
        loadedStartIndex: lazyState.loadedStartIndex,
        isFullyLoaded: lazyState.isFullyLoaded,
        totalMessages: lazyState.totalMessages
      } : null
    });
  }

  /**
   * Invalidate (delete) a specific session from cache
   * @param {string} sessionId - Session ID
   * @returns {boolean} True if deleted
   */
  invalidate(sessionId) {
    const deleted = this.cache.delete(sessionId);
    if (deleted) {
      this._log('invalidateSessionCache', 'Cache invalidated', { sessionId });
    }
    return deleted;
  }

  /**
   * Clear all cache entries
   * @returns {number} Number of entries cleared
   */
  clear() {
    const size = this.cache.size;
    this.cache.clear();
    this._log('clearSessionCache', 'All cache cleared', { clearedEntries: size });
    return size;
  }

  /**
   * Check if session is cached
   * @param {string} sessionId - Session ID
   * @returns {boolean} True if cached and not expired
   */
  has(sessionId) {
    const entry = this.cache.get(sessionId);
    if (!entry) return false;
    if (entry.isExpired(this.expiryMs)) {
      this.cache.delete(sessionId);
      return false;
    }
    return true;
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getStats() {
    const stats = {
      size: this.cache.size,
      maxSize: this.maxSize,
      expiryMs: this.expiryMs,
      entries: []
    };

    for (const [id, entry] of this.cache.entries()) {
      stats.entries.push({
        sessionId: id,
        age: entry.getAge(),
        accessCount: entry.accessCount,
        htmlSize: entry.renderedHTML.length,
        isExpired: entry.isExpired(this.expiryMs),
        scrollPosition: entry.scrollPosition,
        hasLazyState: !!entry.lazyState
      });
    }

    // Sort by access count (most accessed first)
    stats.entries.sort((a, b) => b.accessCount - a.accessCount);
    return stats;
  }

  /**
   * Preload frequently accessed sessions (background optimization)
   * @param {Array} sessions - Array of session objects
   * @param {number} count - Number of sessions to preload (default 3)
   */
  preloadFrequent(sessions, count = 3) {
    if (!sessions || sessions.length === 0) return;

    // Find most recently accessed sessions
    const recentSessions = sessions
      .filter(s => s.messages && s.messages.length > 0)
      .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
      .slice(0, count);

    recentSessions.forEach((session, index) => {
      if (!this.has(session.id)) {
        // Preload with slight delay to avoid blocking UI
        setTimeout(() => {
          this._log('preloadFrequentSessions', 'Background preloading session', {
            sessionId: session.id,
            messageCount: session.messages.length
          });
          // Note: Actual rendering would be done by the caller
          // This is just a notification/hook for background preloading
        }, index * 100);
      }
    });
  }

  /**
   * Clean expired entries from cache
   * @private
   */
  _cleanExpired() {
    for (const [id, entry] of this.cache.entries()) {
      if (entry.isExpired(this.expiryMs)) {
        this.cache.delete(id);
      }
    }
  }

  /**
   * Evict least recently used entry
   * @private
   */
  _evictLRU() {
    let oldestEntry = null;
    let oldestTime = Date.now();

    for (const [id, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestEntry = id;
      }
    }

    if (oldestEntry) {
      this.cache.delete(oldestEntry);
      this._log('cacheSession', 'Evicted LRU entry', { evictedId: oldestEntry });
    }
  }

  /**
   * Internal logging helper
   * @private
   */
  _log(func, message, details = {}) {
    if (typeof this.logHelper === 'function') {
      try {
        this.logHelper('CACHE', 1, func, message, details);
      } catch (err) {
        console.warn('SessionCache logHelper failed:', err.message);
      }
    }
  }
}

// Create singleton instance
// Note: Will be initialized with proper logger when integrated
let _instance = null;

/**
 * Initialize the session cache with configuration
 * @param {Object} options - Configuration options
 * @returns {SessionCache} Cache instance
 */
export function initSessionCache(options = {}) {
  _instance = new SessionCache(options);

  // Auto-clear cache on page load/refresh to prevent stale data
  if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
      _instance.clear();
    });
  }

  return _instance;
}

/**
 * Get the session cache instance
 * @returns {SessionCache} Cache instance
 */
export function getSessionCache() {
  if (!_instance) {
    // Create default instance if not initialized
    _instance = new SessionCache();
  }
  return _instance;
}

// Convenience exports for backward compatibility
export const sessionCache = {
  get: (sessionId) => getSessionCache().get(sessionId),
  set: (sessionId, html, scroll, lazy) => getSessionCache().set(sessionId, html, scroll, lazy),
  invalidate: (sessionId) => getSessionCache().invalidate(sessionId),
  clear: () => getSessionCache().clear(),
  has: (sessionId) => getSessionCache().has(sessionId),
  getStats: () => getSessionCache().getStats(),
  preloadFrequent: (sessions, count) => getSessionCache().preloadFrequent(sessions, count)
};

// Export class for advanced usage
export { SessionCache, SessionCacheEntry };

// Default export
export default sessionCache;
