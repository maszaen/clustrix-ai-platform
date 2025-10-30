/**
 * File Service Module
 * Handles file operations for sessions and projects
 *
 * Migrated from: renderer.js (file upload, getFilesFor*, analyzeFileVisibility)
 */

import { getState } from '../core/state.js';
import sessionService from './session-service.js';
import ipc from '../core/ipc.js';

/**
 * FileService - Manages files for sessions and projects
 */
class FileService {
  constructor() {
    this.FILE_CONTEXTS = {
      FORM: 'form',
      MESSAGE: 'message',
      AI: 'ai'
    };
  }

  // ============================================
  // SESSION FILE OPERATIONS
  // ============================================

  /**
   * Add files to session
   * @param {string} sessionId - Session ID
   * @param {Array} files - Array of file objects
   * @returns {Promise<Array>} Updated files array
   */
  async addToSession(sessionId, files) {
    const session = sessionService.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (!Array.isArray(session.uploadedFiles)) {
      session.uploadedFiles = [];
    }

    // Filter valid files
    const validFiles = files.filter(f => f && !f.error);

    session.uploadedFiles.push(...validFiles);
    session.last_updated = sessionService.nowISO();

    sessionService.markDirty(sessionId);
    await sessionService.save();

    return session.uploadedFiles;
  }

  /**
   * Remove file from session
   * @param {string} sessionId - Session ID
   * @param {number} index - File index
   * @returns {Promise<boolean>} True if removed
   */
  async removeFromSession(sessionId, index) {
    const session = sessionService.get(sessionId);
    if (!session || !Array.isArray(session.uploadedFiles)) {
      return false;
    }

    if (index < 0 || index >= session.uploadedFiles.length) {
      return false;
    }

    session.uploadedFiles.splice(index, 1);
    session.last_updated = sessionService.nowISO();

    sessionService.markDirty(sessionId);
    await sessionService.save();

    return true;
  }

  /**
   * Clear all files from session
   * @param {string} sessionId - Session ID
   * @returns {Promise<boolean>} True if cleared
   */
  async clearSession(sessionId) {
    const session = sessionService.get(sessionId);
    if (!session) {
      return false;
    }

    session.uploadedFiles = [];
    session.last_updated = sessionService.nowISO();

    sessionService.markDirty(sessionId);
    await sessionService.save();

    return true;
  }

  /**
   * Get files for session
   * @param {string} sessionId - Session ID
   * @returns {Array} Array of file objects
   */
  getSessionFiles(sessionId) {
    const session = sessionService.get(sessionId);
    if (!session || !Array.isArray(session.uploadedFiles)) {
      return [];
    }

    return session.uploadedFiles;
  }

  /**
   * Get files for display context
   * @param {string} sessionId - Session ID
   * @param {string} context - Context ('form', 'message', 'ai')
   * @returns {Array} Array of file objects
   */
  getFilesForDisplay(sessionId, context = 'form') {
    const session = sessionService.get(sessionId);
    if (!session || !Array.isArray(session.uploadedFiles)) {
      return [];
    }

    // Currently all files are visible in all contexts
    // This can be extended for context-specific filtering
    return session.uploadedFiles;
  }

  /**
   * Get files for AI processing
   * @param {string} sessionId - Session ID
   * @returns {Array} Array of file objects
   */
  getFilesForAI(sessionId) {
    return this.getFilesForDisplay(sessionId, this.FILE_CONTEXTS.AI);
  }

  /**
   * Get files for message display
   * @param {string} sessionId - Session ID
   * @param {string} messageType - Message type (optional)
   * @returns {Array} Array of file objects
   */
  getFilesForMessage(sessionId, messageType = 'conversation') {
    return this.getFilesForDisplay(sessionId, this.FILE_CONTEXTS.MESSAGE);
  }

  /**
   * Analyze file visibility for session
   * @param {string} sessionId - Session ID
   * @returns {Object} Visibility analysis
   */
  analyzeFileVisibility(sessionId) {
    const session = sessionService.get(sessionId);
    if (!session) {
      return { error: 'Session not found' };
    }

    const allFiles = session.uploadedFiles || [];
    const isProjectSession = session.type === 'project' || session.isProject;

    return {
      sessionType: isProjectSession ? 'project' : 'regular',
      totalFiles: allFiles.length,
      projectFiles: 0,
      userFiles: allFiles.length,
      formDisplay: this.getFilesForDisplay(sessionId, 'form').length,
      messageDisplay: this.getFilesForDisplay(sessionId, 'message').length,
      aiProcessing: this.getFilesForAI(sessionId).length,
      visibility: {
        form: 'all-files',
        message: 'all-files',
        ai: 'all-files'
      }
    };
  }

  // ============================================
  // FILE UPLOAD OPERATIONS
  // ============================================

  /**
   * Open file dialog and read files
   * @returns {Promise<Array>} Array of file objects with content
   */
  async openFileDialog() {
    try {
      const fileContents = await ipc.openDialogAndRead();
      if (!fileContents || fileContents.length === 0) {
        return [];
      }

      // Filter out files with errors
      return fileContents.filter(f => !f.error);
    } catch (error) {
      console.error('FileService: Failed to open file dialog', error);
      return [];
    }
  }

  /**
   * Upload files to session
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object>} Upload result
   */
  async uploadToSession(sessionId) {
    try {
      const files = await this.openFileDialog();
      if (files.length === 0) {
        return {
          success: false,
          message: 'No files selected',
          files: []
        };
      }

      const updatedFiles = await this.addToSession(sessionId, files);

      return {
        success: true,
        message: `${files.length} file(s) uploaded`,
        files: updatedFiles,
        addedCount: files.length
      };
    } catch (error) {
      console.error('FileService: Upload failed', error);
      return {
        success: false,
        message: error.message,
        files: []
      };
    }
  }

  // ============================================
  // FILE QUERIES
  // ============================================

  /**
   * Find file by name
   * @param {string} sessionId - Session ID
   * @param {string} fileName - File name
   * @returns {Object|null} File object or null
   */
  findByName(sessionId, fileName) {
    const files = this.getSessionFiles(sessionId);
    return files.find(f => f.name === fileName) || null;
  }

  /**
   * Find files by type
   * @param {string} sessionId - Session ID
   * @param {string} type - File type/extension
   * @returns {Array} Array of matching files
   */
  findByType(sessionId, type) {
    const files = this.getSessionFiles(sessionId);
    const lowerType = type.toLowerCase();

    return files.filter(f => {
      if (!f.name) return false;
      const ext = f.name.split('.').pop().toLowerCase();
      return ext === lowerType || f.type === type;
    });
  }

  /**
   * Search files by content
   * @param {string} sessionId - Session ID
   * @param {string} query - Search query
   * @returns {Array} Array of matching files
   */
  searchContent(sessionId, query) {
    if (!query) return [];

    const files = this.getSessionFiles(sessionId);
    const lowerQuery = query.toLowerCase();

    return files.filter(f => {
      if (f.content && String(f.content).toLowerCase().includes(lowerQuery)) {
        return true;
      }
      if (f.name && f.name.toLowerCase().includes(lowerQuery)) {
        return true;
      }
      return false;
    });
  }

  /**
   * Get file count for session
   * @param {string} sessionId - Session ID
   * @returns {number} File count
   */
  count(sessionId) {
    const files = this.getSessionFiles(sessionId);
    return files.length;
  }

  /**
   * Get total size of files
   * @param {string} sessionId - Session ID
   * @returns {number} Total size in bytes
   */
  getTotalSize(sessionId) {
    const files = this.getSessionFiles(sessionId);
    return files.reduce((sum, f) => sum + (f.size || 0), 0);
  }

  // ============================================
  // FILE STATISTICS
  // ============================================

  /**
   * Get file statistics for session
   * @param {string} sessionId - Session ID
   * @returns {Object} Statistics object
   */
  getStats(sessionId) {
    const files = this.getSessionFiles(sessionId);

    const typeCount = {};
    let totalSize = 0;

    files.forEach(f => {
      // Count by type
      const type = f.type || 'unknown';
      typeCount[type] = (typeCount[type] || 0) + 1;

      // Sum size
      totalSize += f.size || 0;
    });

    return {
      total: files.length,
      totalSize: totalSize,
      averageSize: files.length > 0 ? Math.round(totalSize / files.length) : 0,
      byType: typeCount
    };
  }

  // ============================================
  // FILE VALIDATION
  // ============================================

  /**
   * Validate file object
   * @param {Object} file - File to validate
   * @returns {Object} Validation result {valid, errors}
   */
  validate(file) {
    const errors = [];

    if (!file) {
      errors.push('File is null or undefined');
      return { valid: false, errors };
    }

    if (!file.name) {
      errors.push('File name is missing');
    }

    if (!file.content && file.content !== '') {
      errors.push('File content is missing');
    }

    if (file.error) {
      errors.push(`File has error: ${file.error}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Check if file is valid
   * @param {Object} file - File to check
   * @returns {boolean} True if valid
   */
  isValid(file) {
    return this.validate(file).valid;
  }

  // ============================================
  // FILE UTILITIES
  // ============================================

  /**
   * Get file extension
   * @param {Object} file - File object
   * @returns {string} File extension (lowercase)
   */
  getExtension(file) {
    if (!file || !file.name) return '';
    const parts = file.name.split('.');
    return parts.length > 1 ? parts.pop().toLowerCase() : '';
  }

  /**
   * Get file base name (without extension)
   * @param {Object} file - File object
   * @returns {string} Base name
   */
  getBaseName(file) {
    if (!file || !file.name) return '';
    const parts = file.name.split('.');
    if (parts.length === 1) return parts[0];
    return parts.slice(0, -1).join('.');
  }

  /**
   * Format file size for display
   * @param {number} bytes - Size in bytes
   * @returns {string} Formatted size
   */
  formatSize(bytes) {
    if (bytes === 0) return '0 B';
    if (!bytes || bytes < 0) return 'Unknown';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  }

  /**
   * Create file object
   * @param {string} name - File name
   * @param {string} content - File content
   * @param {Object} options - Additional options
   * @returns {Object} File object
   */
  createFile(name, content, options = {}) {
    return {
      name,
      content,
      type: options.type || this._inferType(name),
      size: content ? content.length : 0,
      created_at: new Date().toISOString(),
      ...options
    };
  }

  /**
   * Infer file type from name
   * @private
   * @param {string} name - File name
   * @returns {string} Inferred type
   */
  _inferType(name) {
    if (!name) return 'unknown';

    const ext = name.split('.').pop().toLowerCase();
    const typeMap = {
      // Text
      txt: 'text/plain',
      md: 'text/markdown',
      // Code
      js: 'text/javascript',
      ts: 'text/typescript',
      py: 'text/x-python',
      java: 'text/x-java',
      // Documents
      pdf: 'application/pdf',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      // Spreadsheets
      csv: 'text/csv',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      // Images
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg'
    };

    return typeMap[ext] || 'application/octet-stream';
  }

  /**
   * Export files as JSON
   * @param {string} sessionId - Session ID
   * @returns {string} JSON string
   */
  exportAsJSON(sessionId) {
    const files = this.getSessionFiles(sessionId);
    return JSON.stringify(files, null, 2);
  }

  /**
   * Import files from JSON
   * @param {string} sessionId - Session ID
   * @param {string} json - JSON string
   * @returns {Promise<Array>} Imported files
   */
  async importFromJSON(sessionId, json) {
    try {
      const files = JSON.parse(json);
      if (!Array.isArray(files)) {
        throw new Error('Invalid JSON: must be an array');
      }

      return await this.addToSession(sessionId, files);
    } catch (error) {
      console.error('FileService: Import failed', error);
      throw error;
    }
  }
}

// Create singleton instance
const fileService = new FileService();

// Convenience exports
export const addFilesToSession = (sessionId, files) =>
  fileService.addToSession(sessionId, files);
export const removeFileFromSession = (sessionId, index) =>
  fileService.removeFromSession(sessionId, index);
export const clearSessionFiles = (sessionId) =>
  fileService.clearSession(sessionId);
export const getSessionFiles = (sessionId) =>
  fileService.getSessionFiles(sessionId);
export const uploadFiles = (sessionId) =>
  fileService.uploadToSession(sessionId);
export const getFileStats = (sessionId) =>
  fileService.getStats(sessionId);
export const searchFiles = (sessionId, query) =>
  fileService.searchContent(sessionId, query);
export const getFilesForAI = (sessionId) =>
  fileService.getFilesForAI(sessionId);
export const getFilesForMessage = (sessionId, messageType) =>
  fileService.getFilesForMessage(sessionId, messageType);

// Export class and singleton
export { FileService };
export default fileService;
