(function (global) {
  const sessionCache = new Map();
  const MAX_CACHED_SESSIONS = 10;
  const CACHE_EXPIRY_MS = 15 * 60 * 1000;

  let logger = () => {};

  class SessionCacheEntry {
    constructor(sessionId, renderedHTML, scrollPosition = 0, lazyState = null) {
      this.sessionId = sessionId;
      this.renderedHTML = renderedHTML;
      this.scrollPosition = scrollPosition;
      this.lazyState = lazyState;
      this.timestamp = Date.now();
      this.accessCount = 1;
      this.lastAccessed = Date.now();
    }

    isExpired() {
      return Date.now() - this.timestamp > CACHE_EXPIRY_MS;
    }

    touch() {
      this.lastAccessed = Date.now();
      this.accessCount += 1;
    }

    getAge() {
      return Date.now() - this.timestamp;
    }
  }

  function setLogger(logFn) {
    logger = typeof logFn === "function" ? logFn : () => {};
  }

  function getCachedSession(sessionId) {
    const entry = sessionCache.get(sessionId);
    if (!entry || entry.isExpired()) {
      sessionCache.delete(sessionId);
      return null;
    }
    entry.touch();
    logger("CACHE", 1, "getCachedSession", "Cache hit", {
      sessionId,
      age: entry.getAge(),
      accessCount: entry.accessCount,
    });
    return entry;
  }

  function evictExpiredEntries() {
    for (const [id, entry] of sessionCache.entries()) {
      if (entry.isExpired()) {
        sessionCache.delete(id);
      }
    }
  }

  function evictLeastRecentlyUsed() {
    if (sessionCache.size < MAX_CACHED_SESSIONS) return;

    let oldestEntryId = null;
    let oldestAccess = Date.now();

    for (const [id, entry] of sessionCache.entries()) {
      if (entry.lastAccessed < oldestAccess) {
        oldestEntryId = id;
        oldestAccess = entry.lastAccessed;
      }
    }

    if (oldestEntryId) {
      sessionCache.delete(oldestEntryId);
      logger("CACHE", 1, "cacheSession", "Evicted LRU entry", {
        evictedId: oldestEntryId,
      });
    }
  }

  function cacheSession(sessionId, renderedHTML, scrollPosition = 0, lazyState = null) {
    evictExpiredEntries();
    evictLeastRecentlyUsed();

    const cacheEntry = new SessionCacheEntry(
      sessionId,
      renderedHTML,
      scrollPosition,
      lazyState,
    );
    sessionCache.set(sessionId, cacheEntry);

    logger("CACHE", 1, "cacheSession", "Session cached", {
      sessionId,
      htmlLength: renderedHTML.length,
      cacheSize: sessionCache.size,
      hasLazyState: !!lazyState,
      lazyState: lazyState
        ? {
            loadedStartIndex: lazyState.loadedStartIndex,
            isFullyLoaded: lazyState.isFullyLoaded,
            totalMessages: lazyState.totalMessages,
          }
        : null,
    });
  }

  function invalidateSessionCache(sessionId) {
    const deleted = sessionCache.delete(sessionId);
    if (deleted) {
      logger("CACHE", 1, "invalidateSessionCache", "Cache invalidated", {
        sessionId,
      });
    }
  }

  function clearSessionCache() {
    const size = sessionCache.size;
    sessionCache.clear();
    logger("CACHE", 1, "clearSessionCache", "All cache cleared", {
      clearedEntries: size,
    });
  }

  function isSessionCached(sessionId) {
    return sessionCache.has(sessionId);
  }

  function getCacheSize() {
    return sessionCache.size;
  }

  function getCacheStats() {
    const stats = {
      size: sessionCache.size,
      maxSize: MAX_CACHED_SESSIONS,
      entries: [],
    };

    for (const [id, entry] of sessionCache.entries()) {
      stats.entries.push({
        sessionId: id,
        age: entry.getAge(),
        accessCount: entry.accessCount,
        htmlSize: entry.renderedHTML.length,
        isExpired: entry.isExpired(),
      });
    }

    stats.entries.sort((a, b) => b.accessCount - a.accessCount);
    return stats;
  }

  global.sessionCacheService = {
    setLogger,
    getCachedSession,
    cacheSession,
    invalidateSessionCache,
    clearSessionCache,
    isSessionCached,
    getCacheSize,
    getCacheStats,
  };
})(window);
