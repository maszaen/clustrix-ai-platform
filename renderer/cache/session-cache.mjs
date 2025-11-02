const MAX_CACHED_SESSIONS = 10;
const CACHE_EXPIRY_MS = 15 * 60 * 1000;

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
    this.accessCount++;
  }

  getAge() {
    return Date.now() - this.timestamp;
  }
}

const sessionCache = new Map();
let cacheLogger = null;

function logCache(level, fn, message, details) {
  if (typeof cacheLogger === 'function') {
    cacheLogger('CACHE', level, fn, message, details);
  }
}

export function setSessionCacheLogger(logger) {
  cacheLogger = typeof logger === 'function' ? logger : null;
}

export function getCachedSession(sessionId) {
  const entry = sessionCache.get(sessionId);
  if (!entry || entry.isExpired()) {
    sessionCache.delete(sessionId);
    return null;
  }

  entry.touch();
  logCache(1, 'getCachedSession', 'Cache hit', {
    sessionId,
    age: entry.getAge(),
    accessCount: entry.accessCount
  });
  return entry;
}

export function cacheSession(sessionId, renderedHTML, scrollPosition = 0, lazyState = null) {
  for (const [id, entry] of sessionCache.entries()) {
    if (entry.isExpired()) {
      sessionCache.delete(id);
    }
  }

  if (sessionCache.size >= MAX_CACHED_SESSIONS) {
    let oldestEntry = null;
    let oldestTime = Date.now();

    for (const [id, entry] of sessionCache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestEntry = id;
      }
    }

    if (oldestEntry) {
      sessionCache.delete(oldestEntry);
      logCache(1, 'cacheSession', 'Evicted LRU entry', { evictedId: oldestEntry });
    }
  }

  const cacheEntry = new SessionCacheEntry(sessionId, renderedHTML, scrollPosition, lazyState);
  sessionCache.set(sessionId, cacheEntry);

  logCache(1, 'cacheSession', 'Session cached', {
    sessionId,
    htmlLength: renderedHTML.length,
    cacheSize: sessionCache.size,
    hasLazyState: !!lazyState,
    lazyState: lazyState ? {
      loadedStartIndex: lazyState.loadedStartIndex,
      isFullyLoaded: lazyState.isFullyLoaded,
      totalMessages: lazyState.totalMessages
    } : null
  });
}

export function invalidateSessionCache(sessionId) {
  const deleted = sessionCache.delete(sessionId);
  if (deleted) {
    logCache(1, 'invalidateSessionCache', 'Cache invalidated', { sessionId });
  }
  return deleted;
}

export function clearSessionCache() {
  const size = sessionCache.size;
  sessionCache.clear();
  return size;
}

export function preloadFrequentSessions(sessions = []) {
  if (!Array.isArray(sessions) || sessions.length === 0) return;

  const recentSessions = sessions
    .filter((session) => session && session.messages && session.messages.length > 0)
    .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
    .slice(0, 3);

  recentSessions.forEach((session, index) => {
    if (!sessionCache.has(session.id)) {
      setTimeout(() => {
        logCache(1, 'preloadFrequentSessions', 'Background preloading session', {
          sessionId: session.id,
          messageCount: session.messages.length
        });
      }, index * 100);
    }
  });
}

export function getCacheStats() {
  const stats = {
    size: sessionCache.size,
    maxSize: MAX_CACHED_SESSIONS,
    entries: []
  };

  for (const [id, entry] of sessionCache.entries()) {
    stats.entries.push({
      sessionId: id,
      age: entry.getAge(),
      accessCount: entry.accessCount,
      htmlSize: entry.renderedHTML.length,
      isExpired: entry.isExpired()
    });
  }

  stats.entries.sort((a, b) => b.accessCount - a.accessCount);
  return stats;
}

export function getSessionCacheSize() {
  return sessionCache.size;
}

export { MAX_CACHED_SESSIONS, CACHE_EXPIRY_MS };
