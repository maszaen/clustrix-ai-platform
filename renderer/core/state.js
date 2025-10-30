/**
 * State Management Module
 * Centralizes all application state with reactive updates
 *
 * Migrated from: renderer.js lines 1-41 (global variables)
 */

class AppState {
  constructor() {
    this._state = {
      // Session state
      sessions: [],
      currentSession: null,

      // Settings
      settings: {
        persona: { name: "", work: "", prefs: "" },
        theme: "light",
        streamThrottling: "auto",
        language: "autodetect"
      },

      // UI state
      ui: {
        currentPage: "welcome",
        sidebarCollapsed: false,
        selectMode: {
          chats: false,
          projects: false
        },
        selectedIds: {
          chats: new Set(),
          projects: new Set()
        },
        loadedCounts: {
          sessions: 0,
          chatPage: 0,
          projectSessions: 0
        }
      },

      // Files state
      files: {
        welcome: [],
        project: [],
        chat: []
      },

      // Search state
      search: {
        query: "",
        results: [],
        isAdvanced: false,
        queue: [],
        isProcessing: false
      },

      // Project state
      projects: {
        list: [],
        current: null,
        documentListener: null
      },

      // Artifacts state
      artifacts: {
        list: []
      },

      // Stream state
      stream: {
        justSentMessage: false,
        previousWebSearchState: null
      },

      // Modal state
      modal: {
        confirmation: {
          element: null,
          titleEl: null,
          messageEl: null,
          confirmBtn: null,
          cancelBtn: null,
          closeBtn: null,
          options: null,
          isProcessing: false
        }
      },

      // Drafts
      drafts: new Map(),

      // Timers
      timers: {
        onlineResume: null
      },

      // Feature flags
      features: {
        mermaidInitialized: false
      },

      // Performance
      performance: {
        dirtySessionIds: new Set(),
        saveScheduled: false
      }
    };

    // Subscribers: path -> Set of callback functions
    this._subscribers = new Map();
  }

  /**
   * Get state value by path
   * @param {string} path - Dot-notation path (e.g., 'sessions', 'ui.currentPage')
   * @returns {any} State value
   *
   * @example
   * state.get('sessions') // Returns all sessions
   * state.get('ui.currentPage') // Returns current page
   */
  get(path) {
    if (!path) return this._state;

    const parts = path.split('.');
    let value = this._state;

    for (const part of parts) {
      if (value === null || value === undefined) return undefined;
      value = value[part];
    }

    return value;
  }

  /**
   * Set state value and notify listeners
   * @param {string} path - Dot-notation path
   * @param {any} value - New value
   *
   * @example
   * state.set('currentSession', session)
   * state.set('ui.currentPage', 'chat')
   */
  set(path, value) {
    const oldState = this._cloneState();
    const parts = path.split('.');
    const lastKey = parts.pop();

    let target = this._state;
    for (const part of parts) {
      if (!target[part]) target[part] = {};
      target = target[part];
    }

    const oldValue = target[lastKey];
    target[lastKey] = value;

    // Record history for debugging
    this._addHistory({
      path,
      oldValue,
      newValue: value,
      timestamp: Date.now()
    });

    // Notify listeners
    this._notify(path, value, oldValue);
  }

  /**
   * Update state with partial object (shallow merge)
   * @param {string} path - Path to object
   * @param {Object} updates - Partial updates
   *
   * @example
   * state.update('settings', { theme: 'dark' })
   */
  update(path, updates) {
    const current = this.get(path) || {};
    const updated = { ...current, ...updates };
    this.set(path, updated);
  }

  /**
   * Subscribe to state changes
   * @param {string} path - Path to watch (empty string watches all changes)
   * @param {Function} callback - Called with (newValue, oldValue, path)
   * @returns {Function} Unsubscribe function
   *
   * @example
   * const unsubscribe = state.subscribe('sessions', (sessions) => {
   *   console.log('Sessions changed:', sessions)
   * })
   * // Later: unsubscribe()
   */
  subscribe(path, callback) {
    if (!this._subscribers.has(path)) {
      this._subscribers.set(path, new Set());
    }
    this._subscribers.get(path).add(callback);

    // Return unsubscribe function
    return () => {
      const listeners = this._subscribers.get(path);
      if (listeners) {
        listeners.delete(callback);
        if (listeners.size === 0) {
          this._subscribers.delete(path);
        }
      }
    };
  }

  /**
   * Batch multiple state updates (single notification)
   * @param {Function} updateFn - Function that performs updates
   *
   * @example
   * state.batch(() => {
   *   state.set('sessions', newSessions)
   *   state.set('currentSession', newSession)
   *   state.set('ui.currentPage', 'chat')
   * }) // Only one notification sent
   */
  batch(updateFn) {
    const originalNotify = this._notify.bind(this);
    const changes = [];

    // Collect changes without notifying
    this._notify = (path, value, oldValue) => {
      changes.push({ path, value, oldValue });
    };

    // Run updates
    try {
      updateFn(this);
    } finally {
      // Restore notify function
      this._notify = originalNotify;

      // Send all notifications
      changes.forEach(({ path, value, oldValue }) => {
        this._notify(path, value, oldValue);
      });
    }
  }

  /**
   * Notify subscribers of state change
   * @private
   */
  _notify(path, value, oldValue) {
    // Notify exact path listeners
    const listeners = this._subscribers.get(path);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(value, oldValue, path);
        } catch (error) {
          console.error(`Error in state subscriber for path "${path}":`, error);
        }
      });
    }

    // Notify wildcard listeners (empty string path)
    const wildcardListeners = this._subscribers.get('');
    if (wildcardListeners) {
      wildcardListeners.forEach(callback => {
        try {
          callback(this._state, oldValue, path);
        } catch (error) {
          console.error('Error in state wildcard subscriber:', error);
        }
      });
    }
  }

  /**
   * Clone state for history tracking
   * @private
   */
  _cloneState() {
    return JSON.parse(JSON.stringify(this._state));
  }

  /**
   * Add to state change history
   * @private
   */
  _addHistory(change) {
    if (!this._history) {
      this._history = [];
      this._maxHistory = 50;
    }

    this._history.push(change);

    if (this._history.length > this._maxHistory) {
      this._history.shift();
    }
  }

  /**
   * Get state change history (for debugging)
   * @returns {Array} History of state changes
   */
  getHistory() {
    return this._history ? this._history.slice() : [];
  }

  /**
   * Get subscriber statistics (for debugging)
   * @returns {Object} Subscriber stats
   */
  getStats() {
    const stats = {
      totalSubscribers: 0,
      byPath: {}
    };

    this._subscribers.forEach((listeners, path) => {
      stats.totalSubscribers += listeners.size;
      stats.byPath[path || '(wildcard)'] = listeners.size;
    });

    return stats;
  }

  /**
   * Reset all state to initial values
   */
  reset() {
    const oldState = this._state;
    this._state = new AppState()._state;
    this._notify('', this._state, oldState);
  }

  /**
   * Export state as JSON (for debugging/persistence)
   * @returns {Object} Serializable state
   */
  toJSON() {
    // Convert Sets and Maps to arrays/objects for JSON serialization
    const serializable = JSON.parse(JSON.stringify(this._state));

    // Handle non-JSON types
    if (this._state.ui?.selectedIds) {
      serializable.ui.selectedIds = {
        chats: Array.from(this._state.ui.selectedIds.chats || []),
        projects: Array.from(this._state.ui.selectedIds.projects || [])
      };
    }

    if (this._state.drafts) {
      serializable.drafts = Array.from(this._state.drafts.entries());
    }

    if (this._state.performance?.dirtySessionIds) {
      serializable.performance.dirtySessionIds = Array.from(this._state.performance.dirtySessionIds);
    }

    return serializable;
  }
}

// Create singleton instance
export const state = new AppState();

// Convenience exports for cleaner API
export const getState = (path) => state.get(path);
export const setState = (path, value) => state.set(path, value);
export const updateState = (path, updates) => state.update(path, updates);
export const subscribe = (path, callback) => state.subscribe(path, callback);
export const batchUpdate = (updateFn) => state.batch(updateFn);

// Default export
export default state;
