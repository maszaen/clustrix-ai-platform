/**
 * Session Cache Module
 * Extracted from renderer.js - 99% exact code
 * Loaded via script tag, exports to global window object
 * 
 * Implements LRU cache for rendered sessions to improve performance
 */

(function() {
  'use strict';

  const sessionCache = new Map();
  const MAX_CACHED_SESSIONS = 10; // Re-enabled for fast session switching
  const CACHE_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes

  // CLEAR CACHE ON PAGE LOAD/REFRESH to prevent stale data
  window.addEventListener('DOMContentLoaded', () => {
    sessionCache.clear();
    log('CACHE', 1, 'clearCache', 'Session cache cleared on page load');
  });

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

  function getCachedSession(sessionId) {
    const entry = sessionCache.get(sessionId);
    if (!entry || entry.isExpired()) {
      sessionCache.delete(sessionId);
      return null;
    }
    entry.touch();
    log('CACHE', 1, 'getCachedSession', 'Cache hit', { 
      sessionId, 
      age: entry.getAge(),
      accessCount: entry.accessCount 
    });
    return entry;
  }

  function cacheSession(sessionId, renderedHTML, scrollPosition = 0, lazyState = null) {
    // Clean up expired entries
    for (const [id, entry] of sessionCache.entries()) {
      if (entry.isExpired()) {
        sessionCache.delete(id);
      }
    }
    
    // Implement LRU eviction if cache is full
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
        log('CACHE', 1, 'cacheSession', 'Evicted LRU entry', { evictedId: oldestEntry });
      }
    }
    
    const cacheEntry = new SessionCacheEntry(sessionId, renderedHTML, scrollPosition, lazyState);
    sessionCache.set(sessionId, cacheEntry);
    
    log('CACHE', 1, 'cacheSession', 'Session cached', { 
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

  function invalidateSessionCache(sessionId) {
    const deleted = sessionCache.delete(sessionId);
    if (deleted) {
      log('CACHE', 1, 'invalidateSessionCache', 'Cache invalidated', { sessionId });
    }
  }

  function clearSessionCache() {
    const size = sessionCache.size;
    sessionCache.clear();
    log('CACHE', 1, 'clearSessionCache', 'All cache cleared', { clearedEntries: size });
  }

  // Intelligent cache preloading for frequently accessed sessions
  function preloadFrequentSessions() {
    if (!state.sessions || state.sessions.length === 0) return;
    
    // Find most recently accessed sessions
    const recentSessions = state.sessions
      .filter(s => s.messages && s.messages.length > 0)
      .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
      .slice(0, 3); // Top 3 most recent
    
    recentSessions.forEach((session, index) => {
      if (!sessionCache.has(session.id)) {
        // Preload with slight delay to avoid blocking UI
        setTimeout(() => {
          log('CACHE', 1, 'preloadFrequentSessions', 'Background preloading session', { 
            sessionId: session.id,
            messageCount: session.messages.length 
          });
          // Could implement background rendering here if needed
        }, index * 100);
      }
    });
  }

  // Cache statistics for debugging
  function getCacheStats() {
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

  // Export to global window object
  window.SessionCacheEntry = SessionCacheEntry;
  window.getCachedSession = getCachedSession;
  window.cacheSession = cacheSession;
  window.invalidateSessionCache = invalidateSessionCache;
  window.clearSessionCache = clearSessionCache;
  window.preloadFrequentSessions = preloadFrequentSessions;
  window.getCacheStats = getCacheStats;
  window.sessionCache = sessionCache; // Export for debugging
  window.MAX_CACHED_SESSIONS = MAX_CACHED_SESSIONS;
  window.CACHE_EXPIRY_MS = CACHE_EXPIRY_MS;
})();
