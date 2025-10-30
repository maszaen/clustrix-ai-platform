/**
 * Message Service Module
 * Handles message operations within sessions
 *
 * Migrated from: renderer.js (addMessage, message manipulation functions)
 */

import { getState } from '../core/state.js';
import sessionService from './session-service.js';

/**
 * MessageService - Manages messages within sessions
 */
class MessageService {
  constructor() {
    this.MESSAGE_TYPES = {
      USER: 'user',
      AI: 'ai',
      AI_CANCELLED: 'ai_cancelled',
      AI_INCOMPLETE: 'ai_incomplete',
      SYSTEM: 'system'
    };
  }

  // ============================================
  // MESSAGE CRUD OPERATIONS
  // ============================================

  /**
   * Add message to session
   * @param {string} sessionId - Session ID
   * @param {string} role - Message role ('user', 'ai', etc.)
   * @param {string} content - Message content
   * @param {Object} metadata - Message metadata
   * @returns {Promise<Object>} Message object
   */
  async add(sessionId, role, content, metadata = {}) {
    const session = sessionService.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Create message tuple: [role, content, metadata]
    const message = [role, content, metadata];

    // Add to session messages
    if (!Array.isArray(session.messages)) {
      session.messages = [];
    }

    session.messages.push(message);
    session.last_updated = this.nowISO();

    // Mark session as dirty and save
    sessionService.markDirty(sessionId);
    await sessionService.save();

    return {
      index: session.messages.length - 1,
      role,
      content,
      metadata
    };
  }

  /**
   * Get message by index
   * @param {string} sessionId - Session ID
   * @param {number} index - Message index
   * @returns {Object|null} Message object or null
   */
  get(sessionId, index) {
    const session = sessionService.get(sessionId);
    if (!session || !session.messages || index < 0 || index >= session.messages.length) {
      return null;
    }

    const msg = session.messages[index];
    if (!Array.isArray(msg) || msg.length < 2) {
      return null;
    }

    return {
      index,
      role: msg[0],
      content: msg[1],
      metadata: msg[2] || {}
    };
  }

  /**
   * Get all messages from session
   * @param {string} sessionId - Session ID
   * @returns {Array} Array of message objects
   */
  getAll(sessionId) {
    const session = sessionService.get(sessionId);
    if (!session || !Array.isArray(session.messages)) {
      return [];
    }

    return session.messages.map((msg, index) => ({
      index,
      role: msg[0],
      content: msg[1],
      metadata: msg[2] || {}
    }));
  }

  /**
   * Update message content
   * @param {string} sessionId - Session ID
   * @param {number} index - Message index
   * @param {string} content - New content
   * @param {Object} metadataUpdates - Metadata updates (optional)
   * @returns {Promise<Object|null>} Updated message or null
   */
  async update(sessionId, index, content, metadataUpdates = {}) {
    const session = sessionService.get(sessionId);
    if (!session || !session.messages || index < 0 || index >= session.messages.length) {
      return null;
    }

    const msg = session.messages[index];
    if (!Array.isArray(msg) || msg.length < 2) {
      return null;
    }

    // Update content
    msg[1] = content;

    // Update metadata
    if (Object.keys(metadataUpdates).length > 0) {
      msg[2] = { ...(msg[2] || {}), ...metadataUpdates };
    }

    session.last_updated = this.nowISO();

    // Mark session as dirty and save
    sessionService.markDirty(sessionId);
    await sessionService.save();

    return {
      index,
      role: msg[0],
      content: msg[1],
      metadata: msg[2] || {}
    };
  }

  /**
   * Delete message
   * @param {string} sessionId - Session ID
   * @param {number} index - Message index
   * @returns {Promise<boolean>} True if deleted
   */
  async delete(sessionId, index) {
    const session = sessionService.get(sessionId);
    if (!session || !session.messages || index < 0 || index >= session.messages.length) {
      return false;
    }

    session.messages.splice(index, 1);
    session.last_updated = this.nowISO();

    // Mark session as dirty and save
    sessionService.markDirty(sessionId);
    await sessionService.save();

    return true;
  }

  /**
   * Truncate messages from index
   * Used for regeneration - removes all messages after given index
   * @param {string} sessionId - Session ID
   * @param {number} fromIndex - Start index (inclusive)
   * @returns {Promise<number>} Number of messages removed
   */
  async truncateFrom(sessionId, fromIndex) {
    const session = sessionService.get(sessionId);
    if (!session || !session.messages || fromIndex < 0) {
      return 0;
    }

    const originalLength = session.messages.length;
    session.messages = session.messages.slice(0, fromIndex);
    const removed = originalLength - session.messages.length;

    if (removed > 0) {
      session.last_updated = this.nowISO();
      sessionService.markDirty(sessionId);
      await sessionService.save();
    }

    return removed;
  }

  // ============================================
  // MESSAGE QUERIES
  // ============================================

  /**
   * Get messages by role
   * @param {string} sessionId - Session ID
   * @param {string} role - Message role
   * @returns {Array} Array of message objects
   */
  getByRole(sessionId, role) {
    const messages = this.getAll(sessionId);
    return messages.filter(msg => msg.role === role);
  }

  /**
   * Get user messages
   * @param {string} sessionId - Session ID
   * @returns {Array} Array of user messages
   */
  getUserMessages(sessionId) {
    return this.getByRole(sessionId, this.MESSAGE_TYPES.USER);
  }

  /**
   * Get AI messages
   * @param {string} sessionId - Session ID
   * @returns {Array} Array of AI messages
   */
  getAIMessages(sessionId) {
    return this.getByRole(sessionId, this.MESSAGE_TYPES.AI);
  }

  /**
   * Get last message
   * @param {string} sessionId - Session ID
   * @returns {Object|null} Last message or null
   */
  getLast(sessionId) {
    const session = sessionService.get(sessionId);
    if (!session || !session.messages || session.messages.length === 0) {
      return null;
    }

    const index = session.messages.length - 1;
    return this.get(sessionId, index);
  }

  /**
   * Get last user message
   * @param {string} sessionId - Session ID
   * @returns {Object|null} Last user message or null
   */
  getLastUser(sessionId) {
    const userMessages = this.getUserMessages(sessionId);
    return userMessages.length > 0 ? userMessages[userMessages.length - 1] : null;
  }

  /**
   * Get last AI message
   * @param {string} sessionId - Session ID
   * @returns {Object|null} Last AI message or null
   */
  getLastAI(sessionId) {
    const aiMessages = this.getAIMessages(sessionId);
    return aiMessages.length > 0 ? aiMessages[aiMessages.length - 1] : null;
  }

  /**
   * Count messages
   * @param {string} sessionId - Session ID
   * @param {string} role - Optional role filter
   * @returns {number} Message count
   */
  count(sessionId, role = null) {
    const session = sessionService.get(sessionId);
    if (!session || !session.messages) {
      return 0;
    }

    if (role) {
      return session.messages.filter(msg => msg[0] === role).length;
    }

    return session.messages.length;
  }

  /**
   * Find messages by content search
   * @param {string} sessionId - Session ID
   * @param {string} query - Search query
   * @returns {Array} Array of matching messages
   */
  search(sessionId, query) {
    if (!query) return [];

    const messages = this.getAll(sessionId);
    const lowerQuery = query.toLowerCase();

    return messages.filter(msg => {
      return String(msg.content).toLowerCase().includes(lowerQuery);
    });
  }

  // ============================================
  // METADATA OPERATIONS
  // ============================================

  /**
   * Get message metadata
   * @param {string} sessionId - Session ID
   * @param {number} index - Message index
   * @returns {Object} Metadata object
   */
  getMetadata(sessionId, index) {
    const message = this.get(sessionId, index);
    return message ? message.metadata : {};
  }

  /**
   * Update message metadata
   * @param {string} sessionId - Session ID
   * @param {number} index - Message index
   * @param {Object} updates - Metadata updates
   * @returns {Promise<Object|null>} Updated metadata or null
   */
  async updateMetadata(sessionId, index, updates) {
    const session = sessionService.get(sessionId);
    if (!session || !session.messages || index < 0 || index >= session.messages.length) {
      return null;
    }

    const msg = session.messages[index];
    if (!Array.isArray(msg) || msg.length < 2) {
      return null;
    }

    // Ensure metadata object exists
    if (!msg[2] || typeof msg[2] !== 'object') {
      msg[2] = {};
    }

    // Merge updates
    msg[2] = { ...msg[2], ...updates };

    session.last_updated = this.nowISO();
    sessionService.markDirty(sessionId);
    await sessionService.save();

    return msg[2];
  }

  /**
   * Add files to message metadata
   * @param {string} sessionId - Session ID
   * @param {number} index - Message index
   * @param {Array} files - Array of file objects
   * @returns {Promise<Object|null>} Updated metadata
   */
  async addFiles(sessionId, index, files) {
    const metadata = this.getMetadata(sessionId, index);
    const existingFiles = metadata.files || [];
    const updatedFiles = [...existingFiles, ...files];

    return await this.updateMetadata(sessionId, index, { files: updatedFiles });
  }

  // ============================================
  // MESSAGE STATISTICS
  // ============================================

  /**
   * Get message statistics for session
   * @param {string} sessionId - Session ID
   * @returns {Object} Statistics object
   */
  getStats(sessionId) {
    const session = sessionService.get(sessionId);
    if (!session || !session.messages) {
      return {
        total: 0,
        user: 0,
        ai: 0,
        system: 0,
        totalTokens: 0,
        averageLength: 0
      };
    }

    const messages = session.messages;
    let totalLength = 0;

    const stats = {
      total: messages.length,
      user: 0,
      ai: 0,
      system: 0,
      totalTokens: session.tokens_used || 0,
      averageLength: 0
    };

    messages.forEach(msg => {
      const role = msg[0];
      const content = msg[1] || '';

      if (role === 'user') stats.user++;
      else if (role === 'ai') stats.ai++;
      else if (role === 'system') stats.system++;

      totalLength += String(content).length;
    });

    stats.averageLength = stats.total > 0 ? Math.round(totalLength / stats.total) : 0;

    return stats;
  }

  /**
   * Get conversation flow (user-ai pairs)
   * @param {string} sessionId - Session ID
   * @returns {Array} Array of conversation pairs
   */
  getConversationFlow(sessionId) {
    const messages = this.getAll(sessionId);
    const pairs = [];
    let currentPair = { user: null, ai: null };

    messages.forEach(msg => {
      if (msg.role === 'user') {
        // Start new pair
        if (currentPair.user !== null) {
          pairs.push(currentPair);
        }
        currentPair = { user: msg, ai: null };
      } else if (msg.role === 'ai') {
        currentPair.ai = msg;
      }
    });

    // Add last pair if exists
    if (currentPair.user !== null) {
      pairs.push(currentPair);
    }

    return pairs;
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  /**
   * Get current ISO timestamp
   * @returns {string} ISO timestamp
   */
  nowISO() {
    return new Date().toISOString();
  }

  /**
   * Validate message object
   * @param {Object} message - Message to validate
   * @returns {Object} Validation result {valid, errors}
   */
  validate(message) {
    const errors = [];

    if (!message) {
      errors.push('Message is null or undefined');
      return { valid: false, errors };
    }

    if (!Array.isArray(message) || message.length < 2) {
      errors.push('Message must be array with at least [role, content]');
      return { valid: false, errors };
    }

    const [role, content] = message;

    if (!role || typeof role !== 'string') {
      errors.push('Message role is invalid');
    }

    if (content === undefined || content === null) {
      errors.push('Message content is missing');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Export messages as text
   * @param {string} sessionId - Session ID
   * @param {Object} options - Export options
   * @returns {string} Exported text
   */
  exportAsText(sessionId, options = {}) {
    const {
      includeMetadata = false,
      separator = '\n\n---\n\n'
    } = options;

    const messages = this.getAll(sessionId);

    return messages
      .map(msg => {
        let text = `${msg.role.toUpperCase()}:\n${msg.content}`;

        if (includeMetadata && Object.keys(msg.metadata).length > 0) {
          text += `\n\nMetadata: ${JSON.stringify(msg.metadata, null, 2)}`;
        }

        return text;
      })
      .join(separator);
  }

  /**
   * Export messages as JSON
   * @param {string} sessionId - Session ID
   * @returns {string} JSON string
   */
  exportAsJSON(sessionId) {
    const messages = this.getAll(sessionId);
    return JSON.stringify(messages, null, 2);
  }
}

// Create singleton instance
const messageService = new MessageService();

// Convenience exports
export const addMessage = (sessionId, role, content, metadata) =>
  messageService.add(sessionId, role, content, metadata);
export const getMessage = (sessionId, index) =>
  messageService.get(sessionId, index);
export const getAllMessages = (sessionId) =>
  messageService.getAll(sessionId);
export const updateMessage = (sessionId, index, content, metadataUpdates) =>
  messageService.update(sessionId, index, content, metadataUpdates);
export const deleteMessage = (sessionId, index) =>
  messageService.delete(sessionId, index);
export const truncateMessages = (sessionId, fromIndex) =>
  messageService.truncateFrom(sessionId, fromIndex);
export const getMessageStats = (sessionId) =>
  messageService.getStats(sessionId);
export const exportMessages = (sessionId, format = 'text', options) =>
  format === 'json'
    ? messageService.exportAsJSON(sessionId)
    : messageService.exportAsText(sessionId, options);

// Export class and singleton
export { MessageService };
export default messageService;
