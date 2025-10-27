'use strict';

const { createLogger } = require('../utils/logger');
const {
  getValue,
  updateValue,
  resetKey,
} = require('../core/state');

const DEFAULT_MAX_CACHED_SESSIONS = 10;
const DEFAULT_CACHE_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes

class SessionCacheEntry {
  constructor(sessionId, renderedHTML, scrollPosition = 0, lazyState = null, now = Date.now) {
    this.sessionId = sessionId;
    this.renderedHTML = renderedHTML;
    this.scrollPosition = scrollPosition;
    this.lazyState = lazyState;
    this.timestamp = now();
    this.accessCount = 1;
    this.lastAccessed = now();
  }

  isExpired(cacheExpiryMs, now = Date.now) {
    return now() - this.timestamp > cacheExpiryMs;
  }

  touch(now = Date.now) {
    this.lastAccessed = now();
    this.accessCount += 1;
  }

  getAge(now = Date.now) {
    return now() - this.timestamp;
  }
}

function createCacheManager({
  logger = createLogger('CACHE'),
  maxCachedSessions = DEFAULT_MAX_CACHED_SESSIONS,
  cacheExpiryMs = DEFAULT_CACHE_EXPIRY_MS,
} = {}) {
  function getSessionCache() {
    return getValue('sessionCache');
  }

  function ensureCache() {
    return updateValue('sessionCache', (cache) => cache ?? new Map());
  }

  function cleanExpiredEntries() {
    const cache = getSessionCache();
    for (const [id, entry] of cache.entries()) {
      if (entry.isExpired(cacheExpiryMs)) {
        cache.delete(id);
        logger.debug('cleanExpiredEntries', `Removed expired cache entry`, { sessionId: id });
      }
    }
  }

  function evictIfNeeded() {
    const cache = getSessionCache();
    if (cache.size < maxCachedSessions) return;

    let oldestEntry = null;
    let oldestTime = Number.POSITIVE_INFINITY;

    for (const [id, entry] of cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestEntry = id;
      }
    }

    if (oldestEntry) {
      cache.delete(oldestEntry);
      logger.debug('evictIfNeeded', 'Evicted LRU entry', { evictedId: oldestEntry });
    }
  }

  function getCachedSession(sessionId) {
    if (!sessionId) return null;
    const cache = getSessionCache();
    const entry = cache.get(sessionId);
    if (!entry) return null;
    if (entry.isExpired(cacheExpiryMs)) {
      cache.delete(sessionId);
      logger.debug('getCachedSession', 'Expired entry removed', { sessionId });
      return null;
    }
    entry.touch();
    logger.debug('getCachedSession', 'Cache hit', {
      sessionId,
      age: entry.getAge(),
      accessCount: entry.accessCount,
    });
    return entry;
  }

  function cacheSession(sessionId, renderedHTML, scrollPosition = 0, lazyState = null) {
    if (!sessionId || typeof renderedHTML !== 'string') {
      throw new Error('cacheSession requires sessionId and renderedHTML');
    }
    ensureCache();
    cleanExpiredEntries();
    evictIfNeeded();

    const entry = new SessionCacheEntry(sessionId, renderedHTML, scrollPosition, lazyState);
    getSessionCache().set(sessionId, entry);

    logger.debug('cacheSession', 'Session cached', {
      sessionId,
      htmlLength: renderedHTML.length,
      cacheSize: getSessionCache().size,
      hasLazyState: !!lazyState,
    });
    return entry;
  }

  function invalidateSessionCache(sessionId) {
    if (!sessionId) return false;
    const cache = getSessionCache();
    const deleted = cache.delete(sessionId);
    if (deleted) {
      logger.debug('invalidateSessionCache', 'Cache invalidated', { sessionId });
    }
    return deleted;
  }

  function clearSessionCache() {
    const cache = getSessionCache();
    const size = cache.size;
    cache.clear();
    logger.debug('clearSessionCache', 'Cleared all cache entries', { clearedEntries: size });
    return size;
  }

  function preloadFrequentSessions() {
    const appState = getValue('state');
    if (!appState.sessions || appState.sessions.length === 0) return;

    const recentSessions = appState.sessions
      .filter((session) => session.messages && session.messages.length > 0)
      .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
      .slice(0, 3);

    recentSessions.forEach((session, index) => {
      if (!getSessionCache().has(session.id)) {
        setTimeout(() => {
          logger.debug('preloadFrequentSessions', 'Background preload scheduled', {
            sessionId: session.id,
            messageCount: session.messages.length,
          });
        }, index * 100);
      }
    });
  }

  function getCacheStats() {
    const cache = getSessionCache();
    const stats = {
      size: cache.size,
      maxSize: maxCachedSessions,
      entries: [],
    };

    for (const [id, entry] of cache.entries()) {
      stats.entries.push({
        sessionId: id,
        age: entry.getAge(),
        accessCount: entry.accessCount,
        htmlSize: entry.renderedHTML.length,
        isExpired: entry.isExpired(cacheExpiryMs),
      });
    }

    stats.entries.sort((a, b) => b.accessCount - a.accessCount);
    return stats;
  }

  function resetCacheStore() {
    resetKey('sessionCache');
  }

  return {
    SessionCacheEntry,
    getCachedSession,
    cacheSession,
    invalidateSessionCache,
    clearSessionCache,
    preloadFrequentSessions,
    getCacheStats,
    resetCacheStore,
    constants: {
      maxCachedSessions,
      cacheExpiryMs,
    },
  };
}

module.exports = {
  createCacheManager,
  SessionCacheEntry,
  DEFAULT_MAX_CACHED_SESSIONS,
  DEFAULT_CACHE_EXPIRY_MS,
};
