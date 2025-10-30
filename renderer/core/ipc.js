/**
 * IPC Communication Module
 * Centralizes all renderer-to-main process communication
 *
 * Migrated from: renderer.js (scattered window.api calls)
 */

/**
 * IPCBridge - Unified interface for IPC communication
 */
class IPCBridge {
  constructor() {
    this.api = typeof window !== 'undefined' ? window.api : null;
    this.listeners = new Map();

    if (!this.api) {
      console.warn('IPCBridge: window.api not available. Running in non-Electron environment?');
    }
  }

  /**
   * Check if IPC is available
   * @returns {boolean} True if window.api exists
   */
  isAvailable() {
    return this.api !== null && this.api !== undefined;
  }

  // ============================================
  // SESSION OPERATIONS
  // ============================================

  /**
   * Load sessions from storage
   * @returns {Promise<Array>} Array of session objects
   */
  async loadSessions() {
    if (!this.api?.sessions?.load) return [];
    try {
      return await this.api.sessions.load();
    } catch (error) {
      console.error('IPCBridge: Failed to load sessions', error);
      return [];
    }
  }

  /**
   * Save sessions to storage
   * @param {Array} sessions - Array of session objects
   * @returns {Promise<boolean>} True if successful
   */
  async saveSessions(sessions) {
    if (!this.api?.sessions?.save) return false;
    try {
      await this.api.sessions.save(sessions);
      return true;
    } catch (error) {
      console.error('IPCBridge: Failed to save sessions', error);
      return false;
    }
  }

  // ============================================
  // MODEL/SETTINGS OPERATIONS
  // ============================================

  /**
   * Load model configuration
   * @returns {Promise<Object>} Model config object
   */
  async loadModels() {
    if (!this.api?.models?.load) return {};
    try {
      return await this.api.models.load();
    } catch (error) {
      console.error('IPCBridge: Failed to load models', error);
      return {};
    }
  }

  /**
   * Save model configuration
   * @param {Object} config - Model configuration
   * @returns {Promise<boolean>} True if successful
   */
  async saveModels(config) {
    if (!this.api?.models?.save) return false;
    try {
      await this.api.models.save(config);
      return true;
    } catch (error) {
      console.error('IPCBridge: Failed to save models', error);
      return false;
    }
  }

  // ============================================
  // PROJECT OPERATIONS
  // ============================================

  /**
   * Load projects
   * @returns {Promise<Array>} Array of project objects
   */
  async loadProjects() {
    if (!this.api?.projects?.load) return [];
    try {
      return await this.api.projects.load() || [];
    } catch (error) {
      console.error('IPCBridge: Failed to load projects', error);
      return [];
    }
  }

  /**
   * Save projects
   * @param {Array} projects - Array of project objects
   * @returns {Promise<Object>} Result object
   */
  async saveProjects(projects) {
    if (!this.api?.projects?.save) return { success: false };
    try {
      const result = await this.api.projects.save(projects);
      return result;
    } catch (error) {
      console.error('IPCBridge: Failed to save projects', error);
      return { success: false, error: error.message };
    }
  }

  // ============================================
  // FILE OPERATIONS
  // ============================================

  /**
   * Open file dialog and read files
   * @returns {Promise<Array>} Array of file objects with content
   */
  async openDialogAndRead() {
    if (!this.api?.files?.openDialogAndRead) return [];
    try {
      return await this.api.files.openDialogAndRead();
    } catch (error) {
      console.error('IPCBridge: Failed to open files', error);
      return [];
    }
  }

  // ============================================
  // ARTIFACTS OPERATIONS
  // ============================================

  /**
   * Load code artifacts
   * @returns {Promise<Array>} Array of artifact objects
   */
  async loadArtifacts() {
    if (!this.api?.artifacts?.load) return [];
    try {
      return await this.api.artifacts.load();
    } catch (error) {
      console.error('IPCBridge: Failed to load artifacts', error);
      return [];
    }
  }

  /**
   * Save code artifacts
   * @param {Array} artifacts - Array of artifact objects
   * @returns {Promise<boolean>} True if successful
   */
  async saveArtifacts(artifacts) {
    if (!this.api?.artifacts?.save) return false;
    try {
      await this.api.artifacts.save(artifacts);
      return true;
    } catch (error) {
      console.error('IPCBridge: Failed to save artifacts', error);
      return false;
    }
  }

  // ============================================
  // CHAT OPERATIONS
  // ============================================

  /**
   * Stream chat response
   * @param {Object} params - Chat parameters
   * @returns {Object} Controller object with on() and abort() methods
   */
  streamChat(params) {
    if (!this.api?.chat?.stream) {
      console.error('IPCBridge: Chat streaming not available');
      return {
        on: () => {},
        abort: () => {}
      };
    }
    return this.api.chat.stream(params);
  }

  /**
   * Suggest title for chat
   * @param {string} prompt - User prompt
   * @param {string} model - Model to use
   * @param {Object} options - Additional options
   * @returns {Promise<string>} Suggested title
   */
  async suggestTitle(prompt, model, options = {}) {
    if (!this.api?.chat?.titleSuggest) return 'New Chat';
    try {
      return await this.api.chat.titleSuggest(prompt, model, options);
    } catch (error) {
      console.error('IPCBridge: Failed to suggest title', error);
      return 'New Chat';
    }
  }

  // ============================================
  // HTML PREVIEW OPERATIONS
  // ============================================

  /**
   * Create HTML preview
   * @param {string} htmlCode - HTML code to preview
   * @returns {Promise<Object>} Preview result with previewId and filePath
   */
  async createHtmlPreview(htmlCode) {
    if (!this.api?.htmlPreview?.create) {
      return { success: false, error: 'HTML preview not available' };
    }
    try {
      return await this.api.htmlPreview.create(htmlCode);
    } catch (error) {
      console.error('IPCBridge: Failed to create HTML preview', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete HTML preview
   * @param {string} previewId - Preview ID to delete
   * @returns {Promise<boolean>} True if successful
   */
  async deleteHtmlPreview(previewId) {
    if (!this.api?.htmlPreview?.delete) return false;
    try {
      await this.api.htmlPreview.delete(previewId);
      return true;
    } catch (error) {
      console.error('IPCBridge: Failed to delete HTML preview', error);
      return false;
    }
  }

  // ============================================
  // LOGGING OPERATIONS
  // ============================================

  /**
   * Write log entry
   * @param {Object} logEntry - Log entry object
   * @returns {Promise<boolean>} True if successful
   */
  async writeLog(logEntry) {
    if (!this.api?.logging?.write) return false;
    try {
      await this.api.logging.write(logEntry);
      return true;
    } catch (error) {
      console.error('IPCBridge: Failed to write log', error);
      return false;
    }
  }

  // ============================================
  // SYNC OPERATIONS
  // ============================================

  /**
   * Get sync configuration
   * @returns {Promise<Object>} Sync config
   */
  async getSyncConfig() {
    if (!this.api?.sync?.getConfig) return {};
    try {
      return await this.api.sync.getConfig();
    } catch (error) {
      console.error('IPCBridge: Failed to get sync config', error);
      return {};
    }
  }

  /**
   * Start OAuth flow
   * @returns {Promise<Object>} OAuth result
   */
  async startOAuth() {
    if (!this.api?.sync?.startOAuth) {
      return { success: false, error: 'OAuth not available' };
    }
    try {
      return await this.api.sync.startOAuth();
    } catch (error) {
      console.error('IPCBridge: OAuth failed', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Logout from sync
   * @param {Object} options - Logout options
   * @returns {Promise<Object>} Logout result
   */
  async logout(options = {}) {
    if (!this.api?.sync?.logout) {
      return { success: false, error: 'Logout not available' };
    }
    try {
      return await this.api.sync.logout(options);
    } catch (error) {
      console.error('IPCBridge: Logout failed', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get action history
   * @returns {Promise<Object>} Action history result
   */
  async getSyncActionHistory() {
    if (!this.api?.sync?.getActionHistory) {
      return { success: false, history: [] };
    }
    try {
      return await this.api.sync.getActionHistory();
    } catch (error) {
      console.error('IPCBridge: Failed to get action history', error);
      return { success: false, history: [] };
    }
  }

  /**
   * Sync now
   * @returns {Promise<Object>} Sync result
   */
  async syncNow() {
    if (!this.api?.sync?.syncNow) {
      return { success: false, error: 'Sync not available' };
    }
    try {
      return await this.api.sync.syncNow();
    } catch (error) {
      console.error('IPCBridge: Sync failed', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Record action history
   * @param {string} action - Action name
   * @param {string} status - Action status
   * @returns {Promise<boolean>} True if successful
   */
  async recordActionHistory(action, status) {
    if (!this.api?.sync?.recordActionHistory) return false;
    try {
      await this.api.sync.recordActionHistory(action, status);
      return true;
    } catch (error) {
      console.error('IPCBridge: Failed to record action history', error);
      return false;
    }
  }

  /**
   * Backup now
   * @returns {Promise<Object>} Backup result
   */
  async backupNow() {
    if (!this.api?.sync?.backupNow) {
      return { success: false, error: 'Backup not available' };
    }
    try {
      return await this.api.sync.backupNow();
    } catch (error) {
      console.error('IPCBridge: Backup failed', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Resolve conflicts
   * @param {Array} resolutions - Array of conflict resolutions
   * @returns {Promise<Object>} Resolution result
   */
  async resolveConflicts(resolutions) {
    if (!this.api?.sync?.resolveConflicts) {
      return { success: false, error: 'Conflict resolution not available' };
    }
    try {
      return await this.api.sync.resolveConflicts(resolutions);
    } catch (error) {
      console.error('IPCBridge: Failed to resolve conflicts', error);
      return { success: false, error: error.message };
    }
  }

  // ============================================
  // APP OPERATIONS
  // ============================================

  /**
   * Get profile photo
   * @returns {Promise<Object>} Profile photo result
   */
  async getProfilePhoto() {
    if (!this.api?.app?.getProfilePhoto) {
      return { success: false };
    }
    try {
      return await this.api.app.getProfilePhoto();
    } catch (error) {
      console.error('IPCBridge: Failed to get profile photo', error);
      return { success: false };
    }
  }

  /**
   * Get default profile photo
   * @returns {Promise<Object>} Default profile photo result
   */
  async getDefaultProfilePhoto() {
    if (!this.api?.app?.getDefaultProfilePhoto) {
      return { success: false };
    }
    try {
      return await this.api.app.getDefaultProfilePhoto();
    } catch (error) {
      console.error('IPCBridge: Failed to get default profile photo', error);
      return { success: false };
    }
  }

  /**
   * Restart application
   */
  restart() {
    if (this.api?.app?.restart) {
      this.api.app.restart();
    } else {
      console.warn('IPCBridge: App restart not available');
    }
  }

  // ============================================
  // EVENT LISTENERS
  // ============================================

  /**
   * Register event listener
   * @param {string} channel - Event channel name
   * @param {Function} callback - Callback function
   * @returns {Function} Unsubscribe function
   */
  on(channel, callback) {
    if (!this.api?.on) {
      console.warn(`IPCBridge: Cannot listen to channel "${channel}" - IPC not available`);
      return () => {};
    }

    // Store listener for cleanup
    if (!this.listeners.has(channel)) {
      this.listeners.set(channel, new Set());
    }
    this.listeners.get(channel).add(callback);

    // Register listener
    this.api.on(channel, callback);

    // Return unsubscribe function
    return () => {
      const channelListeners = this.listeners.get(channel);
      if (channelListeners) {
        channelListeners.delete(callback);
        if (channelListeners.size === 0) {
          this.listeners.delete(channel);
        }
      }
      // Note: window.api might not have removeListener, depends on preload implementation
      if (this.api?.removeListener) {
        this.api.removeListener(channel, callback);
      }
    };
  }

  /**
   * Remove all listeners for a channel
   * @param {string} channel - Event channel name (optional, removes all if not specified)
   */
  removeAllListeners(channel = null) {
    if (channel) {
      this.listeners.delete(channel);
    } else {
      this.listeners.clear();
    }

    if (this.api?.removeAllListeners) {
      this.api.removeAllListeners(channel);
    }
  }

  /**
   * Get listener statistics
   * @returns {Object} Listener stats
   */
  getListenerStats() {
    const stats = {
      totalChannels: this.listeners.size,
      byChannel: {}
    };

    this.listeners.forEach((listeners, channel) => {
      stats.byChannel[channel] = listeners.size;
    });

    return stats;
  }
}

// Create singleton instance
const ipc = new IPCBridge();

// Convenience exports
export const isIPCAvailable = () => ipc.isAvailable();

// Session operations
export const loadSessions = () => ipc.loadSessions();
export const saveSessions = (sessions) => ipc.saveSessions(sessions);

// Model operations
export const loadModels = () => ipc.loadModels();
export const saveModels = (config) => ipc.saveModels(config);

// Project operations
export const loadProjects = () => ipc.loadProjects();
export const saveProjects = (projects) => ipc.saveProjects(projects);

// File operations
export const openDialogAndRead = () => ipc.openDialogAndRead();

// Artifacts
export const loadArtifacts = () => ipc.loadArtifacts();
export const saveArtifacts = (artifacts) => ipc.saveArtifacts(artifacts);

// Chat operations
export const streamChat = (params) => ipc.streamChat(params);
export const suggestTitle = (prompt, model, options) => ipc.suggestTitle(prompt, model, options);

// HTML Preview
export const createHtmlPreview = (htmlCode) => ipc.createHtmlPreview(htmlCode);
export const deleteHtmlPreview = (previewId) => ipc.deleteHtmlPreview(previewId);

// Logging
export const writeLog = (logEntry) => ipc.writeLog(logEntry);

// Sync
export const getSyncConfig = () => ipc.getSyncConfig();
export const startOAuth = () => ipc.startOAuth();
export const logout = (options) => ipc.logout(options);
export const getSyncActionHistory = () => ipc.getSyncActionHistory();
export const syncNow = () => ipc.syncNow();
export const recordActionHistory = (action, status) => ipc.recordActionHistory(action, status);
export const backupNow = () => ipc.backupNow();
export const resolveConflicts = (resolutions) => ipc.resolveConflicts(resolutions);

// App
export const getProfilePhoto = () => ipc.getProfilePhoto();
export const getDefaultProfilePhoto = () => ipc.getDefaultProfilePhoto();
export const restartApp = () => ipc.restart();

// Event listeners
export const onIPCEvent = (channel, callback) => ipc.on(channel, callback);
export const removeAllIPCListeners = (channel) => ipc.removeAllListeners(channel);

// Export class and singleton
export { IPCBridge };
export default ipc;
