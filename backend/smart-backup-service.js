/**
 * Smart Backup Service
 * 
 * Implements delta backup instead of full database overwrite:
 * 1. Query local changes since last_backup_time
 * 2. Download cloud database
 * 3. Apply delta changes (INSERT new, UPDATE modified, mark deleted)
 * 4. Upload modified cloud database
 * 
 * This prevents data loss from concurrent edits on multiple devices.
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const { logWithContext } = require('../utils/logger');
const {
  getDeviceId,
  getLastBackupTime,
  updateLastBackupTime,
  getCurrentTimestamp,
  generateSessionHash
} = require('./sync-helpers');

const log = (level, method, message, data = {}) => {
  logWithContext('SMART-BACKUP', level, method, message, data);
};

class SmartBackupService {
  constructor(localDbPath, githubStorageService) {
    this.localDbPath = localDbPath;
    this.githubStorage = githubStorageService;
    this.tempDir = path.join(path.dirname(localDbPath), 'temp');
    
    // Ensure temp directory exists
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
    
    log(1, 'constructor', 'SmartBackupService initialized', {
      localDb: this.localDbPath,
      tempDir: this.tempDir
    });
  }
  
  /**
   * Perform smart backup (delta upload)
   * 
   * Steps:
   * 1. Query local changes since last backup
   * 2. Download cloud database
   * 3. Apply delta to cloud database
   * 4. Upload modified cloud database
   * 5. Update last_backup_time
   * 
   * @returns {Object} Backup result { success, stats, conflicts }
   */
  async performSmartBackup() {
    const startTime = Date.now();
    
    try {
      log(1, 'performSmartBackup', 'Starting smart backup');
      
      // Step 1: Query local changes
      const changes = this.queryLocalChanges();
      
      if (changes.sessions.length === 0 && changes.messages.length === 0 && changes.deletedSessions.length === 0 && changes.deletedMessages.length === 0) {
        log(1, 'performSmartBackup', 'No changes to backup');
        return {
          success: true,
          stats: { sessions: 0, messages: 0, deleted: 0 },
          message: 'No changes to backup'
        };
      }
      
      log(1, 'performSmartBackup', 'Local changes detected', {
        newSessions: changes.sessions.length,
        newMessages: changes.messages.length,
        deletedSessions: changes.deletedSessions.length,
        deletedMessages: changes.deletedMessages.length
      });
      
      // Step 2: Download cloud database
      const cloudDbPath = await this.downloadCloudDatabase();
      
      // Step 3: Apply delta changes to cloud database
      const applyResult = this.applyDeltaToCloud(cloudDbPath, changes);
      
      log(1, 'performSmartBackup', 'Delta applied to cloud database', applyResult);
      
      // Step 4: Upload modified cloud database
      await this.uploadCloudDatabase(cloudDbPath);
      
      // Step 5: Update last_backup_time
      const localDb = new Database(this.localDbPath);
      updateLastBackupTime(localDb);
      
      // Mark all synced records with synced_at
      this.markRecordsAsSynced(localDb, changes);
      localDb.close();
      
      // Cleanup temp file
      if (fs.existsSync(cloudDbPath)) {
        fs.unlinkSync(cloudDbPath);
      }
      
      const duration = Date.now() - startTime;
      
      log(1, 'performSmartBackup', 'Smart backup completed', {
        duration: `${duration}ms`,
        stats: applyResult
      });
      
      return {
        success: true,
        stats: applyResult,
        duration
      };
      
    } catch (error) {
      log(4, 'performSmartBackup', 'Smart backup failed', {
        error: error.message,
        stack: error.stack
      });
      
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Query local changes since last backup
   * 
   * Returns all sessions and messages where:
   * - updated_at > last_backup_time (modified since last backup)
   * - deleted = 0 (active records) OR deleted = 1 (tombstones to propagate)
   * 
   * @returns {Object} { sessions: [], messages: [], deletedSessions: [], deletedMessages: [] }
   */
  queryLocalChanges() {
    const db = new Database(this.localDbPath, { readonly: true });
    const lastBackup = getLastBackupTime(db);
    
    log(2, 'queryLocalChanges', 'Querying changes since last backup', {
      lastBackupTime: lastBackup,
      lastBackupDate: lastBackup ? new Date(lastBackup).toISOString() : 'never'
    });
    
    // Get modified/new active sessions
    const sessions = db.prepare(`
      SELECT * FROM sessions 
      WHERE updated_at > ? AND deleted = 0
      ORDER BY updated_at ASC
    `).all(lastBackup);
    
    // Get deleted sessions (tombstones)
    const deletedSessions = db.prepare(`
      SELECT * FROM sessions 
      WHERE updated_at > ? AND deleted = 1
      ORDER BY updated_at ASC
    `).all(lastBackup);
    
    // Get modified/new active messages
    const messages = db.prepare(`
      SELECT * FROM messages 
      WHERE updated_at > ? AND deleted = 0
      ORDER BY session_id ASC, sequence ASC
    `).all(lastBackup);
    
    // Get deleted messages (tombstones)
    const deletedMessages = db.prepare(`
      SELECT * FROM messages 
      WHERE updated_at > ? AND deleted = 1
      ORDER BY session_id ASC, sequence ASC
    `).all(lastBackup);
    
    db.close();
    
    log(2, 'queryLocalChanges', 'Local changes collected', {
      sessions: sessions.length,
      messages: messages.length,
      deletedSessions: deletedSessions.length,
      deletedMessages: deletedMessages.length
    });
    
    return { sessions, messages, deletedSessions, deletedMessages };
  }
  
  /**
   * Download cloud database to temp directory
   * 
   * @returns {string} Path to downloaded cloud database
   */
  async downloadCloudDatabase() {
    const cloudDbPath = path.join(this.tempDir, `cloud_${Date.now()}.db`);
    
    log(2, 'downloadCloudDatabase', 'Downloading cloud database', {
      destination: cloudDbPath
    });
    
    try {
      await this.githubStorage.downloadDatabase(cloudDbPath);
      
      log(2, 'downloadCloudDatabase', 'Cloud database downloaded', {
        path: cloudDbPath,
        size: fs.statSync(cloudDbPath).size
      });
      
      return cloudDbPath;
    } catch (error) {
      // If cloud database doesn't exist yet (first backup), create empty one
      if (error.message.includes('404') || error.message.includes('not found')) {
        log(2, 'downloadCloudDatabase', 'Cloud database not found, creating new one');
        
        // Create empty database with schema
        const db = new Database(cloudDbPath);
        this.initializeEmptyDatabase(db);
        db.close();
        
        return cloudDbPath;
      }
      
      throw error;
    }
  }
  
  /**
   * Initialize empty database with schema
   * Used when cloud database doesn't exist yet
   */
  initializeEmptyDatabase(db) {
    // Copy schema from local database
    const localDb = new Database(this.localDbPath, { readonly: true });
    const schema = localDb.prepare("SELECT sql FROM sqlite_master WHERE type='table'").all();
    localDb.close();
    
    // Create tables in cloud database
    for (const table of schema) {
      if (table.sql) {
        db.exec(table.sql);
      }
    }
    
    log(2, 'initializeEmptyDatabase', 'Empty database initialized with schema', {
      tables: schema.length
    });
  }
  
  /**
   * Apply delta changes to cloud database
   * 
   * For each changed record:
   * - If exists in cloud: UPDATE
   * - If not exists: INSERT
   * - If deleted locally: UPDATE deleted=1 in cloud (tombstone)
   * 
   * @param {string} cloudDbPath - Path to cloud database
   * @param {Object} changes - Local changes { sessions, messages, deletedSessions, deletedMessages }
   * @returns {Object} Stats { sessionsInserted, sessionsUpdated, messagesInserted, messagesUpdated, deleted }
   */
  applyDeltaToCloud(cloudDbPath, changes) {
    const db = new Database(cloudDbPath);
    
    let stats = {
      sessionsInserted: 0,
      sessionsUpdated: 0,
      messagesInserted: 0,
      messagesUpdated: 0,
      deleted: 0
    };
    
    db.prepare('BEGIN TRANSACTION').run();
    
    try {
      // Apply session changes
      for (const session of changes.sessions) {
        const existing = db.prepare('SELECT id FROM sessions WHERE id = ?').get(session.id);
        
        if (existing) {
          // UPDATE existing session
          db.prepare(`
            UPDATE sessions SET
              name = ?, type = ?, created_at = ?, updated_at = ?, last_updated = ?,
              project_id = ?, is_project = ?, is_favorite = ?,
              persona_name = ?, persona_work = ?, persona_prefs = ?,
              tokens_used = ?, metadata = ?,
              deleted = ?, device_id = ?, synced_at = ?, hash = ?
            WHERE id = ?
          `).run(
            session.name, session.type, session.created_at, session.updated_at, session.last_updated,
            session.project_id, session.is_project, session.is_favorite,
            session.persona_name, session.persona_work, session.persona_prefs,
            session.tokens_used, session.metadata,
            session.deleted, session.device_id, session.synced_at, session.hash,
            session.id
          );
          stats.sessionsUpdated++;
        } else {
          // INSERT new session
          db.prepare(`
            INSERT INTO sessions (
              id, name, type, created_at, updated_at, last_updated,
              project_id, is_project, is_favorite,
              persona_name, persona_work, persona_prefs,
              tokens_used, metadata,
              deleted, device_id, synced_at, hash
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            session.id, session.name, session.type, session.created_at, session.updated_at, session.last_updated,
            session.project_id, session.is_project, session.is_favorite,
            session.persona_name, session.persona_work, session.persona_prefs,
            session.tokens_used, session.metadata,
            session.deleted, session.device_id, session.synced_at, session.hash
          );
          stats.sessionsInserted++;
        }
      }
      
      // Apply deleted sessions (tombstones)
      for (const session of changes.deletedSessions) {
        const existing = db.prepare('SELECT id FROM sessions WHERE id = ?').get(session.id);
        
        if (existing) {
          // Mark as deleted in cloud
          db.prepare(`
            UPDATE sessions SET deleted = 1, updated_at = ?, device_id = ?
            WHERE id = ?
          `).run(session.updated_at, session.device_id, session.id);
          stats.deleted++;
        } else {
          // Insert tombstone
          db.prepare(`
            INSERT INTO sessions (
              id, name, type, created_at, updated_at, last_updated,
              project_id, is_project, is_favorite,
              persona_name, persona_work, persona_prefs,
              tokens_used, metadata,
              deleted, device_id, synced_at, hash
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            session.id, session.name, session.type, session.created_at, session.updated_at, session.last_updated,
            session.project_id, session.is_project, session.is_favorite,
            session.persona_name, session.persona_work, session.persona_prefs,
            session.tokens_used, session.metadata,
            session.deleted, session.device_id, session.synced_at, session.hash
          );
          stats.deleted++;
        }
      }
      
      // Apply message changes
      for (const message of changes.messages) {
        const existing = db.prepare('SELECT id FROM messages WHERE id = ?').get(message.id);
        
        if (existing) {
          // UPDATE existing message
          db.prepare(`
            UPDATE messages SET
              session_id = ?, role = ?, content = ?, message_index = ?, created_at = ?,
              model_id = ?, model_label = ?, provider = ?, base_url = ?,
              think_mode = ?, think_content = ?, thinking_update = ?,
              web_search_enabled = ?, web_search_data = ?, files = ?, metadata = ?,
              deleted = ?, device_id = ?, synced_at = ?, sequence = ?, updated_at = ?
            WHERE id = ?
          `).run(
            message.session_id, message.role, message.content, message.message_index, message.created_at,
            message.model_id, message.model_label, message.provider, message.base_url,
            message.think_mode, message.think_content, message.thinking_update,
            message.web_search_enabled, message.web_search_data, message.files, message.metadata,
            message.deleted, message.device_id, message.synced_at, message.sequence, message.updated_at,
            message.id
          );
          stats.messagesUpdated++;
        } else {
          // INSERT new message
          db.prepare(`
            INSERT INTO messages (
              id, session_id, role, content, message_index, created_at,
              model_id, model_label, provider, base_url,
              think_mode, think_content, thinking_update,
              web_search_enabled, web_search_data, files, metadata,
              deleted, device_id, synced_at, sequence, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            message.id, message.session_id, message.role, message.content, message.message_index, message.created_at,
            message.model_id, message.model_label, message.provider, message.base_url,
            message.think_mode, message.think_content, message.thinking_update,
            message.web_search_enabled, message.web_search_data, message.files, message.metadata,
            message.deleted, message.device_id, message.synced_at, message.sequence, message.updated_at
          );
          stats.messagesInserted++;
        }
      }
      
      // Apply deleted messages (tombstones)
      for (const message of changes.deletedMessages) {
        const existing = db.prepare('SELECT id FROM messages WHERE id = ?').get(message.id);
        
        if (existing) {
          // Mark as deleted in cloud
          db.prepare(`
            UPDATE messages SET deleted = 1, updated_at = ?, device_id = ?
            WHERE id = ?
          `).run(message.updated_at, message.device_id, message.id);
          stats.deleted++;
        } else {
          // Insert tombstone
          db.prepare(`
            INSERT INTO messages (
              id, session_id, role, content, message_index, created_at,
              model_id, model_label, provider, base_url,
              think_mode, think_content, thinking_update,
              web_search_enabled, web_search_data, files, metadata,
              deleted, device_id, synced_at, sequence, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            message.id, message.session_id, message.role, message.content, message.message_index, message.created_at,
            message.model_id, message.model_label, message.provider, message.base_url,
            message.think_mode, message.think_content, message.thinking_update,
            message.web_search_enabled, message.web_search_data, message.files, message.metadata,
            message.deleted, message.device_id, message.synced_at, message.sequence, message.updated_at
          );
          stats.deleted++;
        }
      }
      
      db.prepare('COMMIT').run();
      
      log(2, 'applyDeltaToCloud', 'Delta changes applied successfully', stats);
      
    } catch (error) {
      db.prepare('ROLLBACK').run();
      log(4, 'applyDeltaToCloud', 'Failed to apply delta', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    } finally {
      db.close();
    }
    
    return stats;
  }
  
  /**
   * Upload cloud database to GitHub
   * 
   * @param {string} cloudDbPath - Path to modified cloud database
   */
  async uploadCloudDatabase(cloudDbPath) {
    log(2, 'uploadCloudDatabase', 'Uploading modified cloud database');
    
    await this.githubStorage.uploadDatabase(cloudDbPath);
    
    log(1, 'uploadCloudDatabase', 'Cloud database uploaded successfully', {
      size: fs.statSync(cloudDbPath).size
    });
  }
  
  /**
   * Mark all synced records with synced_at timestamp
   * 
   * This marks local records as "backed up" so they won't be
   * included in the next delta query.
   * 
   * @param {Database} db - Local database
   * @param {Object} changes - Changes that were backed up
   */
  markRecordsAsSynced(db, changes) {
    const now = getCurrentTimestamp();
    
    db.prepare('BEGIN TRANSACTION').run();
    
    try {
      // Mark sessions as synced
      const sessionIds = [
        ...changes.sessions.map(s => s.id),
        ...changes.deletedSessions.map(s => s.id)
      ];
      
      for (const id of sessionIds) {
        db.prepare('UPDATE sessions SET synced_at = ? WHERE id = ?').run(now, id);
      }
      
      // Mark messages as synced
      const messageIds = [
        ...changes.messages.map(m => m.id),
        ...changes.deletedMessages.map(m => m.id)
      ];
      
      for (const id of messageIds) {
        db.prepare('UPDATE messages SET synced_at = ? WHERE id = ?').run(now, id);
      }
      
      db.prepare('COMMIT').run();
      
      log(2, 'markRecordsAsSynced', 'Records marked as synced', {
        sessions: sessionIds.length,
        messages: messageIds.length
      });
      
    } catch (error) {
      db.prepare('ROLLBACK').run();
      log(4, 'markRecordsAsSynced', 'Failed to mark records', {
        error: error.message
      });
    }
  }
}

module.exports = SmartBackupService;
