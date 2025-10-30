/**
 * Session Service Module
 * Handles all session CRUD operations and lifecycle management
 *
 * Migrated from: renderer.js (createNewSession, deleteSession, save, load, etc.)
 */

import { getState, setState, updateState } from '../core/state.js';
import { sessionCache } from '../core/cache.js';
import ipc from '../core/ipc.js';

/**
 * SessionService - Manages chat/project sessions
 */
class SessionService {
  constructor() {
    this.DEBUG_MODE = typeof window !== 'undefined' && typeof window.api === 'undefined';
    this.dirtySessionIds = new Set();
    this.saveScheduled = false;
  }

  // ============================================
  // CRUD OPERATIONS
  // ============================================

  /**
   * Create a new session
   * @param {Array} initialMessages - Initial messages (optional)
   * @param {Object} options - Session options
   * @returns {Promise<Object>} Created session object
   */
  async create(initialMessages = [], options = {}) {
    const session = {
      id: this.generateId(),
      name: null,
      created_at: this.nowISO(),
      last_updated: this.nowISO(),
      messages: initialMessages,
      uploadedFiles: [],
      canvases: {},
      tokens_used: 0,
      tokens_by_message: {},

      // Project-specific properties
      projectId: options.projectId || null,
      type: options.type || 'regular', // 'regular' or 'project'
      isProject: options.type === 'project' || false
    };

    // Ensure token fields
    this.ensureTokenFields(session);

    // Add to state
    const sessions = getState('sessions') || [];
    sessions.unshift(session);
    setState('sessions', sessions);

    // Mark as dirty and save
    this.markDirty(session.id);
    await this.save();

    return session;
  }

  /**
   * Get session by ID
   * @param {string} sessionId - Session ID
   * @returns {Object|null} Session object or null
   */
  get(sessionId) {
    if (!sessionId) return null;
    const sessions = getState('sessions') || [];
    return sessions.find(s => s.id === sessionId) || null;
  }

  /**
   * Get all sessions
   * @returns {Array} Array of session objects
   */
  getAll() {
    return getState('sessions') || [];
  }

  /**
   * Update session
   * @param {string} sessionId - Session ID
   * @param {Object} updates - Updates to apply
   * @returns {Promise<Object|null>} Updated session or null
   */
  async update(sessionId, updates) {
    const sessions = getState('sessions') || [];
    const index = sessions.findIndex(s => s.id === sessionId);

    if (index === -1) return null;

    // Apply updates
    sessions[index] = {
      ...sessions[index],
      ...updates,
      last_updated: this.nowISO()
    };

    setState('sessions', sessions);
    this.markDirty(sessionId);
    await this.save();

    return sessions[index];
  }

  /**
   * Delete session
   * @param {string|Object} sessionIdOrObject - Session ID or session object
   * @returns {Promise<boolean>} True if deleted
   */
  async delete(sessionIdOrObject) {
    const sessionToDelete = typeof sessionIdOrObject === 'string'
      ? this.get(sessionIdOrObject)
      : sessionIdOrObject;

    if (!sessionToDelete) return false;

    // Invalidate cache
    if (sessionToDelete.id) {
      sessionCache.invalidate(sessionToDelete.id);
    }

    // Remove from state
    const sessions = getState('sessions') || [];
    const filtered = sessions.filter(s => s.id !== sessionToDelete.id);
    setState('sessions', filtered);

    // Clear dirty tracking and force full save
    this.clearDirtyTracking();
    await this.save();

    return true;
  }

  /**
   * Delete multiple sessions
   * @param {Array<string>} sessionIds - Array of session IDs
   * @returns {Promise<number>} Number of deleted sessions
   */
  async deleteMany(sessionIds) {
    if (!Array.isArray(sessionIds) || sessionIds.length === 0) return 0;

    const sessions = getState('sessions') || [];
    let deletedCount = 0;

    // Invalidate caches
    sessionIds.forEach(id => {
      sessionCache.invalidate(id);
    });

    // Filter out sessions
    const idsSet = new Set(sessionIds);
    const filtered = sessions.filter(s => {
      if (idsSet.has(s.id)) {
        deletedCount++;
        return false;
      }
      return true;
    });

    setState('sessions', filtered);

    // Clear dirty tracking and force full save
    this.clearDirtyTracking();
    await this.save();

    return deletedCount;
  }

  // ============================================
  // SAVE/LOAD OPERATIONS
  // ============================================

  /**
   * Save sessions to storage (with incremental save optimization)
   * @param {boolean} forceFullSave - Force full save instead of incremental
   * @returns {Promise<boolean>} True if successful
   */
  async save(forceFullSave = false) {
    try {
      const sessions = getState('sessions') || [];
      const settings = getState('settings') || {};

      let dataToSave;
      const shouldUseIncremental =
        !forceFullSave &&
        this.dirtySessionIds.size > 0 &&
        this.dirtySessionIds.size < sessions.length &&
        !this.DEBUG_MODE;

      if (shouldUseIncremental) {
        // INCREMENTAL: Only save dirty sessions + settings
        const dirtySessions = sessions.filter(s => this.dirtySessionIds.has(s.id));
        dataToSave = {
          sessions: dirtySessions,
          settings: settings,
          isIncremental: true,
          dirtyIds: Array.from(this.dirtySessionIds)
        };
      } else {
        // FULL SAVE: Save all sessions
        dataToSave = { sessions: sessions, settings: settings };
      }

      if (this.DEBUG_MODE) {
        // Debug mode: localStorage
        localStorage.setItem('clustrix-data', JSON.stringify({
          sessions: sessions,
          settings: settings
        }));
      } else {
        // Production: IPC
        await ipc.saveSessions(dataToSave);
      }

      // Clear dirty tracking after successful save
      this.clearDirtyTracking();

      return true;
    } catch (error) {
      console.error('SessionService: Save failed', error);
      return false;
    }
  }

  /**
   * Load sessions from storage
   * @returns {Promise<Object>} Loaded data {sessions, settings}
   */
  async load() {
    try {
      let data;

      if (this.DEBUG_MODE) {
        data = JSON.parse(localStorage.getItem('clustrix-data'));
      } else {
        data = await ipc.loadSessions();
      }

      if (data) {
        const sessions = data.sessions || [];
        const settings = data.settings || {};

        // Ensure all sessions have required fields
        sessions.forEach(session => {
          // Ensure ID
          if (!session.id) {
            session.id = this.generateId();
          }
          // Ensure token fields
          this.ensureTokenFields(session);
        });

        // Update state
        setState('sessions', sessions);
        updateState('settings', settings);

        return { sessions, settings };
      }

      return { sessions: [], settings: {} };
    } catch (error) {
      console.error('SessionService: Load failed', error);
      return { sessions: [], settings: {} };
    }
  }

  // ============================================
  // DIRTY TRACKING (Performance Optimization)
  // ============================================

  /**
   * Mark session as dirty for incremental save
   * @param {string} sessionId - Session ID
   */
  markDirty(sessionId) {
    if (sessionId) {
      this.dirtySessionIds.add(sessionId);
    }
  }

  /**
   * Clear dirty tracking
   */
  clearDirtyTracking() {
    this.dirtySessionIds.clear();
    this.saveScheduled = false;
  }

  /**
   * Get dirty session IDs
   * @returns {Set<string>} Set of dirty session IDs
   */
  getDirtyIds() {
    return new Set(this.dirtySessionIds);
  }

  // ============================================
  // TOKEN MANAGEMENT
  // ============================================

  /**
   * Ensure session has token fields
   * @param {Object} session - Session object
   */
  ensureTokenFields(session) {
    if (!session) return;

    if (typeof session.tokens_used !== 'number') {
      session.tokens_used = 0;
    }

    if (!session.tokens_by_message || typeof session.tokens_by_message !== 'object') {
      session.tokens_by_message = {};
    }
  }

  /**
   * Update token count for session
   * @param {string} sessionId - Session ID
   * @param {number} tokens - Token count to add
   * @param {number} messageIndex - Message index (optional)
   * @returns {Promise<Object|null>} Updated session
   */
  async updateTokens(sessionId, tokens, messageIndex = null) {
    const session = this.get(sessionId);
    if (!session) return null;

    this.ensureTokenFields(session);

    session.tokens_used += tokens;

    if (messageIndex !== null) {
      if (!session.tokens_by_message[messageIndex]) {
        session.tokens_by_message[messageIndex] = 0;
      }
      session.tokens_by_message[messageIndex] += tokens;
    }

    this.markDirty(sessionId);

    // Save periodically (every 25 tokens)
    if (session.tokens_used % 25 === 0) {
      await this.save();
    }

    return session;
  }

  // ============================================
  // QUERY OPERATIONS
  // ============================================

  /**
   * Find sessions by project ID
   * @param {string} projectId - Project ID
   * @returns {Array} Array of session objects
   */
  findByProject(projectId) {
    const sessions = getState('sessions') || [];
    return sessions.filter(s => s.projectId === projectId);
  }

  /**
   * Find sessions by type
   * @param {string} type - Session type ('regular' or 'project')
   * @returns {Array} Array of session objects
   */
  findByType(type) {
    const sessions = getState('sessions') || [];
    return sessions.filter(s => s.type === type);
  }

  /**
   * Search sessions by name
   * @param {string} query - Search query
   * @returns {Array} Array of matching sessions
   */
  search(query) {
    if (!query) return [];

    const sessions = getState('sessions') || [];
    const lowerQuery = query.toLowerCase();

    return sessions.filter(s => {
      if (s.name && s.name.toLowerCase().includes(lowerQuery)) {
        return true;
      }
      // Search in messages
      if (s.messages && s.messages.length > 0) {
        return s.messages.some(msg => {
          if (Array.isArray(msg) && msg[1]) {
            return String(msg[1]).toLowerCase().includes(lowerQuery);
          }
          return false;
        });
      }
      return false;
    });
  }

  /**
   * Get recent sessions
   * @param {number} limit - Maximum number of sessions (default: 10)
   * @returns {Array} Array of recent sessions
   */
  getRecent(limit = 10) {
    const sessions = getState('sessions') || [];

    return sessions
      .slice() // Create copy
      .sort((a, b) => {
        const aTime = new Date(a.last_updated || a.created_at).getTime();
        const bTime = new Date(b.last_updated || b.created_at).getTime();
        return bTime - aTime; // Descending
      })
      .slice(0, limit);
  }

  /**
   * Get favorite sessions
   * @returns {Array} Array of favorite sessions
   */
  getFavorites() {
    const sessions = getState('sessions') || [];
    return sessions.filter(s => s.favorite === true);
  }

  /**
   * Toggle favorite status
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object|null>} Updated session
   */
  async toggleFavorite(sessionId) {
    const session = this.get(sessionId);
    if (!session) return null;

    session.favorite = !session.favorite;
    session.last_updated = this.nowISO();

    this.markDirty(sessionId);
    await this.save();

    return session;
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  /**
   * Generate unique session ID
   * @returns {string} Unique ID
   */
  generateId() {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Get current ISO timestamp
   * @returns {string} ISO timestamp
   */
  nowISO() {
    return new Date().toISOString();
  }

  /**
   * Get session statistics
   * @returns {Object} Statistics object
   */
  getStats() {
    const sessions = getState('sessions') || [];

    return {
      total: sessions.length,
      regular: sessions.filter(s => s.type === 'regular').length,
      project: sessions.filter(s => s.type === 'project').length,
      favorites: sessions.filter(s => s.favorite).length,
      totalMessages: sessions.reduce((sum, s) => sum + (s.messages?.length || 0), 0),
      totalTokens: sessions.reduce((sum, s) => sum + (s.tokens_used || 0), 0),
      dirty: this.dirtySessionIds.size
    };
  }

  /**
   * Validate session object
   * @param {Object} session - Session to validate
   * @returns {Object} Validation result {valid, errors}
   */
  validate(session) {
    const errors = [];

    if (!session) {
      errors.push('Session is null or undefined');
      return { valid: false, errors };
    }

    if (!session.id) {
      errors.push('Session ID is missing');
    }

    if (!session.created_at) {
      errors.push('Created date is missing');
    }

    if (!Array.isArray(session.messages)) {
      errors.push('Messages must be an array');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

// Create singleton instance
const sessionService = new SessionService();

// Convenience exports
export const createSession = (initialMessages, options) => sessionService.create(initialMessages, options);
export const getSession = (sessionId) => sessionService.get(sessionId);
export const getAllSessions = () => sessionService.getAll();
export const updateSession = (sessionId, updates) => sessionService.update(sessionId, updates);
export const deleteSession = (sessionIdOrObject) => sessionService.delete(sessionIdOrObject);
export const deleteManySessions = (sessionIds) => sessionService.deleteMany(sessionIds);
export const saveSessions = (forceFullSave) => sessionService.save(forceFullSave);
export const loadSessions = () => sessionService.load();
export const markSessionDirty = (sessionId) => sessionService.markDirty(sessionId);
export const toggleSessionFavorite = (sessionId) => sessionService.toggleFavorite(sessionId);
export const searchSessions = (query) => sessionService.search(query);
export const getRecentSessions = (limit) => sessionService.getRecent(limit);
export const getSessionStats = () => sessionService.getStats();

// Export class and singleton
export { SessionService };
export default sessionService;
