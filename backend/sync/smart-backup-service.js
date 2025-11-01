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
const crypto = require('crypto');
const { app } = require('electron');
const { logWithContext } = require('../../utils/logger');
const {
  getDeviceId,
  getLastBackupTime,
  updateLastBackupTime,
  getCurrentTimestamp,
  generateSessionHash
} = require('./sync-helpers');
const ConflictResolver = require('./conflict-resolver');

const log = (level, method, message, data = {}) => {
  logWithContext('SMART-BACKUP', level, method, message, data);
};

class SmartBackupService {
  constructor(localDbPath, githubStorageService) {
    this.localDbPath = localDbPath;
    this.githubStorage = githubStorageService;
    this.tempDir = path.join(path.dirname(localDbPath), 'temp');
    this.lockFilePath = path.join(app.getPath('userData'), 'backup.lock');
    this.conflictResolver = new ConflictResolver();
    
    // Ensure temp directory exists
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
    
    log(1, 'constructor', 'SmartBackupService initialized', {
      localDb: this.localDbPath,
      tempDir: this.tempDir,
      lockFile: this.lockFilePath
    });
  }
  
  /**
   * Acquire backup lock to prevent concurrent backups
   * 
   * Waits up to 30 seconds for existing lock to be released.
   * Throws error if timeout exceeded.
   */
  async acquireLock() {
    const lockTimeout = 30000; // 30 seconds
    const staleLockThreshold = 300000; // 5 minutes
    const startTime = Date.now();

    let deviceId = 'unknown';
    try {
      const db = new Database(this.localDbPath, { readonly: true });
      deviceId = getDeviceId(db);
      db.close();
    } catch (err) {
      log(3, 'acquireLock', 'Failed to read device ID before locking', {
        error: err.message
      });
    }

    while (true) {
      try {
        const lockData = {
          pid: process.pid,
          deviceId,
          startedAt: Date.now(),
          dbPath: this.localDbPath
        };

        fs.writeFileSync(this.lockFilePath, JSON.stringify(lockData, null, 2), {
          flag: 'wx'
        });

        log(1, 'acquireLock', 'Backup lock acquired', {
          pid: process.pid,
          deviceId
        });

        return;
      } catch (err) {
        if (err.code !== 'EEXIST') {
          throw err;
        }

        const elapsed = Date.now() - startTime;
        let staleLock = false;

        try {
          const raw = fs.readFileSync(this.lockFilePath, 'utf8');
          const existingLock = JSON.parse(raw);
          const age = Date.now() - (existingLock.startedAt || 0);

          if (age > staleLockThreshold) {
            staleLock = true;
            fs.unlinkSync(this.lockFilePath);
            log(2, 'acquireLock', 'Removed stale lock file', {
              age,
              pid: existingLock.pid
            });
            continue;
          }
        } catch (readErr) {
          // Corrupted lock file - remove and retry
          staleLock = true;
          try {
            fs.unlinkSync(this.lockFilePath);
            log(2, 'acquireLock', 'Removed corrupt lock file', {
              error: readErr.message
            });
            continue;
          } catch (unlinkErr) {
            log(3, 'acquireLock', 'Failed to remove corrupt lock file', {
              error: unlinkErr.message
            });
          }
        }

        if (elapsed > lockTimeout && !staleLock) {
          throw new Error('Backup lock timeout - another backup in progress');
        }

        // Wait 1 second before retrying
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
  
  /**
   * Release backup lock
   * 
   * Safe to call even if lock doesn't exist.
   */
  releaseLock() {
    if (fs.existsSync(this.lockFilePath)) {
      try {
        fs.unlinkSync(this.lockFilePath);
        log(1, 'releaseLock', 'Backup lock released');
      } catch (err) {
        log(3, 'releaseLock', 'Failed to remove lock file', {
          error: err.message
        });
      }
    }
  }
  
  /**
   * Calculate SHA256 checksum of a file
   * 
   * @param {string} filePath - Path to file
   * @returns {string} SHA256 hash (hex)
   */
  calculateChecksum(filePath) {
    const fileBuffer = fs.readFileSync(filePath);
    const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    
    log(2, 'calculateChecksum', 'Checksum calculated', {
      file: path.basename(filePath),
      checksum: hash.substring(0, 16) + '...',
      size: fileBuffer.length
    });
    
    return hash;
  }
  
  /**
   * Perform smart backup (delta upload)
   * 
   * Steps:
   * 0. Acquire backup lock
   * 1. Query local changes since last backup
   * 2. Download cloud database
   * 3. Apply delta to cloud database
   * 4. Upload modified cloud database
   * 5. Update last_backup_time
   * 6. Release lock
   * 
   * @returns {Object} Backup result { success, stats, conflicts }
   */
  async performSmartBackup() {
    const startTime = Date.now();
    let cloudDbPath = null;
    
    try {
      // Step 0: Acquire lock to prevent concurrent backups
      await this.acquireLock();
      
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
      cloudDbPath = await this.downloadCloudDatabase();

      // Step 2.5: Detect conflicts between local and cloud
      const conflicts = await this.detectConflicts(cloudDbPath, changes);
      
      if (conflicts.length > 0) {
        log(2, 'performSmartBackup', 'Conflicts detected, will need resolution', {
          conflictCount: conflicts.length
        });
        
        // Return conflicts for main process to handle via IPC
        return {
          success: false,
          needsConflictResolution: true,
          conflicts: conflicts,
          message: `${conflicts.length} conflict(s) detected. User resolution required.`
        };
      }
      
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
      
    } finally {
      // Step 6: Always release lock and cleanup temp files
      this.releaseLock();
      
      if (cloudDbPath && fs.existsSync(cloudDbPath)) {
        try {
          fs.unlinkSync(cloudDbPath);
          log(2, 'performSmartBackup', 'Cleaned up temp cloud DB', {
            path: cloudDbPath
          });
        } catch (cleanupErr) {
          log(3, 'performSmartBackup', 'Failed to cleanup temp file', {
            path: cloudDbPath,
            error: cleanupErr.message
          });
        }
      }
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
   * Detect conflicts between local changes and cloud database
   * 
   * A conflict occurs when:
   * - Same record ID exists in both local and cloud
   * - Timestamps are within 1 second (concurrent edit)
   * - Content hash differs (different changes)
   * 
   * @param {string} cloudDbPath - Path to downloaded cloud database
   * @param {Object} localChanges - Local changes from queryLocalChanges()
   * @returns {Array} Array of conflicts { id, local, cloud, type }
   */
  async detectConflicts(cloudDbPath, localChanges) {
    log(2, 'detectConflicts', 'Checking for conflicts');
    
    const cloudDb = new Database(cloudDbPath, { readonly: true });
    
    try {
      // Get cloud sessions that might conflict
      const cloudSessions = cloudDb.prepare(`
        SELECT * FROM sessions WHERE deleted = 0
      `).all();
      
      // Get cloud messages that might conflict
      const cloudMessages = cloudDb.prepare(`
        SELECT * FROM messages WHERE deleted = 0
      `).all();
      
      // Detect session conflicts
      const sessionConflicts = this.conflictResolver.detectConflicts(
        localChanges.sessions,
        cloudSessions,
        'session'
      );
      
      // Detect message conflicts
      const messageConflicts = this.conflictResolver.detectConflicts(
        localChanges.messages,
        cloudMessages,
        'message'
      );
      
      const allConflicts = [...sessionConflicts, ...messageConflicts];
      
      if (allConflicts.length > 0) {
        this.conflictResolver.queueConflicts(allConflicts);
      }
      
      log(2, 'detectConflicts', 'Conflict detection complete', {
        sessionConflicts: sessionConflicts.length,
        messageConflicts: messageConflicts.length,
        totalConflicts: allConflicts.length
      });
      
      return allConflicts;
      
    } finally {
      cloudDb.close();
    }
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
      const selectMessageById = db.prepare(`
        SELECT id, session_id, content, role, updated_at, sequence, device_id
        FROM messages
        WHERE id = ?
      `);
      const selectMessageBySequence = db.prepare(`
        SELECT id, session_id, content, role, updated_at, sequence, device_id
        FROM messages
        WHERE session_id = ? AND sequence = ?
        ORDER BY updated_at DESC
        LIMIT 1
      `);
      const updateMessageStmt = db.prepare(`
        UPDATE messages SET
          session_id = ?, role = ?, content = ?, message_index = ?, created_at = ?,
          model_id = ?, model_label = ?, provider = ?, base_url = ?,
          think_mode = ?, think_content = ?, thinking_update = ?,
          web_search_enabled = ?, web_search_data = ?, files = ?, metadata = ?,
          deleted = ?, device_id = ?, synced_at = ?, sequence = ?, updated_at = ?
        WHERE id = ?
      `);
      const insertMessageWithIdStmt = db.prepare(`
        INSERT INTO messages (
          id, session_id, role, content, message_index, created_at,
          model_id, model_label, provider, base_url,
          think_mode, think_content, thinking_update,
          web_search_enabled, web_search_data, files, metadata,
          deleted, device_id, synced_at, sequence, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insertMessageStmt = db.prepare(`
        INSERT INTO messages (
          session_id, role, content, message_index, created_at,
          model_id, model_label, provider, base_url,
          think_mode, think_content, thinking_update,
          web_search_enabled, web_search_data, files, metadata,
          deleted, device_id, synced_at, sequence, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const maxSequenceStmt = db.prepare('SELECT MAX(sequence) as maxSeq FROM messages WHERE session_id = ?');

      const getSequenceValue = (msg) => {
        if (msg.sequence !== undefined && msg.sequence !== null) return msg.sequence;
        if (msg.message_index !== undefined && msg.message_index !== null) return msg.message_index;
        if (msg.messageIndex !== undefined && msg.messageIndex !== null) return msg.messageIndex;
        return 0;
      };

      const toMessageParams = (msg, sequenceValue) => [
        msg.session_id,
        msg.role,
        msg.content,
        sequenceValue,
        msg.created_at,
        msg.model_id,
        msg.model_label,
        msg.provider,
        msg.base_url,
        msg.think_mode,
        msg.think_content,
        msg.thinking_update,
        msg.web_search_enabled,
        msg.web_search_data,
        msg.files,
        msg.metadata,
        msg.deleted,
        msg.device_id,
        msg.synced_at,
        sequenceValue,
        msg.updated_at
      ];

      for (const message of changes.messages) {
        const incomingSequence = getSequenceValue(message);
        const incomingUpdatedAt = message.updated_at || message.created_at || 0;
        const byId = message.id ? selectMessageById.get(message.id) : null;
        const bySequence = selectMessageBySequence.get(message.session_id, incomingSequence);

        if (byId && byId.session_id === message.session_id) {
          const existingUpdatedAt = byId.updated_at || 0;
          if (!existingUpdatedAt || !incomingUpdatedAt || incomingUpdatedAt >= existingUpdatedAt) {
            updateMessageStmt.run(...toMessageParams(message, incomingSequence), byId.id);
            stats.messagesUpdated++;
          }
          continue;
        }

        if (bySequence) {
          const existingUpdatedAt = bySequence.updated_at || 0;
          const sameDevice = !message.device_id || !bySequence.device_id || message.device_id === bySequence.device_id;
          const contentChanged = (bySequence.content || '') !== (message.content || '');

          if (contentChanged && !sameDevice) {
            const maxSeq = maxSequenceStmt.get(message.session_id);
            const nextSequence = (maxSeq && typeof maxSeq.maxSeq === 'number' ? maxSeq.maxSeq : incomingSequence) + 1;
            insertMessageStmt.run(...toMessageParams(message, nextSequence));
            stats.messagesInserted++;
            continue;
          }

          if (!existingUpdatedAt || !incomingUpdatedAt || incomingUpdatedAt >= existingUpdatedAt) {
            updateMessageStmt.run(...toMessageParams(message, incomingSequence), bySequence.id);
            stats.messagesUpdated++;
          }
          continue;
        }

        const useProvidedId = !!message.id && !byId;
        const sequenceForInsert = incomingSequence;

        if (useProvidedId) {
          insertMessageWithIdStmt.run(message.id, ...toMessageParams(message, sequenceForInsert));
        } else {
          const maxSeq = maxSequenceStmt.get(message.session_id);
          const nextSequence = (maxSeq && typeof maxSeq.maxSeq === 'number' ? maxSeq.maxSeq : sequenceForInsert - 1) + 1;
          insertMessageStmt.run(...toMessageParams(message, nextSequence));
        }
        stats.messagesInserted++;
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
      try {
        db.prepare('ROLLBACK').run();
      } catch (rollbackErr) {
        log(3, 'applyDeltaToCloud', 'Rollback failed', {
          error: rollbackErr.message
        });
      }

      log(4, 'applyDeltaToCloud', 'Failed to apply delta', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    } finally {
      try {
        db.close();
      } catch (closeErr) {
        log(3, 'applyDeltaToCloud', 'Failed to close database after delta apply', {
          error: closeErr.message
        });
      }
    }
    
    return stats;
  }
  
  /**
   * Apply user's conflict resolutions to local changes
   * 
   * Modifies the localChanges object based on user's choices:
   * - 'local': Keep local version (already in changes)
   * - 'cloud': Replace local with cloud version
   * - 'merge': Merge both versions (keep both)
   * 
   * @param {Object} localChanges - Local changes from queryLocalChanges()
   * @param {Array} resolutions - Array of { conflictId, resolution: 'local'|'cloud'|'merge' }
   * @param {string} cloudDbPath - Path to cloud database
   * @returns {Object} Modified changes
   */
  applyConflictResolutions(localChanges, resolutions, cloudDbPath) {
    log(2, 'applyConflictResolutions', 'Applying user conflict resolutions', {
      resolutionCount: resolutions.length
    });
    
    const cloudDb = new Database(cloudDbPath, { readonly: true });
    
    try {
      for (const { conflictId, resolution, type } of resolutions) {
        log(3, 'applyConflictResolutions', 'Applying resolution', {
          conflictId,
          resolution,
          type
        });
        
        if (resolution === 'local') {
          // Keep local version - no action needed
          continue;
        }
        
        if (resolution === 'cloud') {
          // Replace local with cloud version
          if (type === 'session') {
            const cloudSession = cloudDb.prepare('SELECT * FROM sessions WHERE id = ?').get(conflictId);
            if (cloudSession) {
              // Remove local version
              localChanges.sessions = localChanges.sessions.filter(s => s.id !== conflictId);
              // Add cloud version
              localChanges.sessions.push(cloudSession);
            }
          } else if (type === 'message') {
            const cloudMessage = cloudDb.prepare('SELECT * FROM messages WHERE id = ?').get(conflictId);
            if (cloudMessage) {
              localChanges.messages = localChanges.messages.filter(m => m.id !== conflictId);
              localChanges.messages.push(cloudMessage);
            }
          }
        }
        
        if (resolution === 'merge') {
          // Keep both versions
          // For sessions: keep local, but note we want cloud messages too
          // For messages: this is handled by sequence number logic in applyDelta
          log(3, 'applyConflictResolutions', 'Merge resolution - both versions will be kept', {
            conflictId,
            type
          });
          // No action needed - applyDeltaToCloud will handle merging
        }
      }
      
      log(2, 'applyConflictResolutions', 'Conflict resolutions applied', {
        sessionsCount: localChanges.sessions.length,
        messagesCount: localChanges.messages.length
      });
      
      return localChanges;
      
    } finally {
      cloudDb.close();
    }
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
