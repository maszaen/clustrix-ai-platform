/**
 * Schema Migration V2 - Smart Sync & Backup Support
 * 
 * Adds tracking columns for multi-device sync:
 * - deleted (soft delete flag)
 * - device_id (which device created/modified)
 * - synced_at (last sync timestamp)
 * - hash (content hash for conflict detection)
 * - sequence (message order in session)
 */

const { logWithContext } = require('../utils/logger');

function log(context, level, func, message, details = {}) {
  logWithContext(context, func, message, details);
}

class SchemaMigrationV2 {
  constructor(db, dbPath, isCloudDatabase) {
    this.db = db;
    this.dbPath = dbPath;
    this.isCloudDatabase = isCloudDatabase;
  }
  
  /**
   * Check if migration is needed
   */
  needsMigration() {
    try {
      // Check if sync_metadata table exists
      const table = this.db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='sync_metadata'
      `).get();
      
      if (!table) {
        log('MIGRATION', 1, 'needsMigration', 'Migration needed: sync_metadata table not found');
        return true;
      }
      
      // Check if sessions table has new columns
      const columns = this.db.prepare(`
        PRAGMA table_info(sessions)
      `).all();
      
      const hasDeleted = columns.some(col => col.name === 'deleted');
      const hasDeviceId = columns.some(col => col.name === 'device_id');
      const hasSyncedAt = columns.some(col => col.name === 'synced_at');
      const hasHash = columns.some(col => col.name === 'hash');
      
      if (!hasDeleted || !hasDeviceId || !hasSyncedAt || !hasHash) {
        log('MIGRATION', 1, 'needsMigration', 'Migration needed: sessions table missing columns', {
          hasDeleted,
          hasDeviceId,
          hasSyncedAt,
          hasHash
        });
        return true;
      }
      
      // Check if messages table has new columns
      const msgColumns = this.db.prepare(`
        PRAGMA table_info(messages)
      `).all();
      
      const msgHasDeleted = msgColumns.some(col => col.name === 'deleted');
      const msgHasDeviceId = msgColumns.some(col => col.name === 'device_id');
      const msgHasSyncedAt = msgColumns.some(col => col.name === 'synced_at');
      const msgHasSequence = msgColumns.some(col => col.name === 'sequence');
      const msgHasUpdatedAt = msgColumns.some(col => col.name === 'updated_at');
      
      if (!msgHasDeleted || !msgHasDeviceId || !msgHasSyncedAt || !msgHasSequence || !msgHasUpdatedAt) {
        log('MIGRATION', 1, 'needsMigration', 'Migration needed: messages table missing columns', {
          msgHasDeleted,
          msgHasDeviceId,
          msgHasSyncedAt,
          msgHasSequence,
          msgHasUpdatedAt
        });
        return true;
      }
      
      log('MIGRATION', 1, 'needsMigration', 'No migration needed');
      return false;
      
    } catch (error) {
      log('MIGRATION', 4, 'needsMigration', 'Error checking migration status', {
        error: error.message
      });
      return true; // Assume migration needed if check fails
    }
  }
  
  /**
   * Run the migration
   */
  async migrate() {
    if (!this.needsMigration()) {
      log('MIGRATION', 1, 'migrate', 'No migration needed, skipping');
      return { success: true, message: 'Already migrated' };
    }
    
    log('MIGRATION', 1, 'migrate', 'Starting schema migration V2');
    
    try {
      // Start transaction
      this.db.prepare('BEGIN TRANSACTION').run();
      
      // Step 1: Create sync_metadata table if not exists
      log('MIGRATION', 1, 'migrate', 'Creating sync_metadata table');
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS sync_metadata (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);
      
      // Initialize sync_metadata if empty
      const metadataCount = this.db.prepare('SELECT COUNT(*) as count FROM sync_metadata').get();
      if (metadataCount.count === 0) {
        const now = Date.now();
        this.db.prepare(`
          INSERT INTO sync_metadata (key, value, updated_at) VALUES (?, ?, ?)
        `).run('last_sync_time', '0', now);
        
        this.db.prepare(`
          INSERT INTO sync_metadata (key, value, updated_at) VALUES (?, ?, ?)
        `).run('last_backup_time', '0', now);
        
        this.db.prepare(`
          INSERT INTO sync_metadata (key, value, updated_at) VALUES (?, ?, ?)
        `).run('pending_changes_count', '0', now);
        
        log('MIGRATION', 1, 'migrate', 'Initialized sync_metadata');
      }
      
      // Step 2: Add columns to sessions table
      log('MIGRATION', 1, 'migrate', 'Adding tracking columns to sessions table');
      
      const sessionColumns = this.db.prepare('PRAGMA table_info(sessions)').all();
      
      if (!sessionColumns.some(col => col.name === 'deleted')) {
        this.db.exec('ALTER TABLE sessions ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0');
        log('MIGRATION', 1, 'migrate', 'Added sessions.deleted column');
      }
      
      if (!sessionColumns.some(col => col.name === 'device_id')) {
        this.db.exec('ALTER TABLE sessions ADD COLUMN device_id TEXT');
        log('MIGRATION', 1, 'migrate', 'Added sessions.device_id column');
      }
      
      if (!sessionColumns.some(col => col.name === 'synced_at')) {
        this.db.exec('ALTER TABLE sessions ADD COLUMN synced_at INTEGER');
        log('MIGRATION', 1, 'migrate', 'Added sessions.synced_at column');
      }
      
      if (!sessionColumns.some(col => col.name === 'hash')) {
        this.db.exec('ALTER TABLE sessions ADD COLUMN hash TEXT');
        log('MIGRATION', 1, 'migrate', 'Added sessions.hash column');
      }
      
      // Step 3: Add columns to messages table
      log('MIGRATION', 1, 'migrate', 'Adding tracking columns to messages table');
      
      const msgColumns = this.db.prepare('PRAGMA table_info(messages)').all();
      
      if (!msgColumns.some(col => col.name === 'deleted')) {
        this.db.exec('ALTER TABLE messages ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0');
        log('MIGRATION', 1, 'migrate', 'Added messages.deleted column');
      }
      
      if (!msgColumns.some(col => col.name === 'device_id')) {
        this.db.exec('ALTER TABLE messages ADD COLUMN device_id TEXT');
        log('MIGRATION', 1, 'migrate', 'Added messages.device_id column');
      }
      
      if (!msgColumns.some(col => col.name === 'synced_at')) {
        this.db.exec('ALTER TABLE messages ADD COLUMN synced_at INTEGER');
        log('MIGRATION', 1, 'migrate', 'Added messages.synced_at column');
      }
      
      if (!msgColumns.some(col => col.name === 'sequence')) {
        this.db.exec('ALTER TABLE messages ADD COLUMN sequence INTEGER');
        log('MIGRATION', 1, 'migrate', 'Added messages.sequence column');
        
        // Set sequence based on message_index for existing messages
        this.db.exec(`
          UPDATE messages 
          SET sequence = message_index 
          WHERE sequence IS NULL
        `);
        log('MIGRATION', 1, 'migrate', 'Initialized message sequences from message_index');
      }
      
      if (!msgColumns.some(col => col.name === 'updated_at')) {
        this.db.exec('ALTER TABLE messages ADD COLUMN updated_at INTEGER');
        log('MIGRATION', 1, 'migrate', 'Added messages.updated_at column');
        
        // Set updated_at same as created_at for existing messages
        this.db.exec(`
          UPDATE messages 
          SET updated_at = created_at 
          WHERE updated_at IS NULL
        `);
        log('MIGRATION', 1, 'migrate', 'Initialized message updated_at from created_at');
      }
      
      // Step 4: Create indices for new columns
      log('MIGRATION', 1, 'migrate', 'Creating indices for tracking columns');
      
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_sessions_deleted ON sessions(deleted);
        CREATE INDEX IF NOT EXISTS idx_sessions_synced ON sessions(synced_at);
        CREATE INDEX IF NOT EXISTS idx_sessions_device ON sessions(device_id);
        
        CREATE INDEX IF NOT EXISTS idx_messages_deleted ON messages(deleted);
        CREATE INDEX IF NOT EXISTS idx_messages_synced ON messages(synced_at);
        CREATE INDEX IF NOT EXISTS idx_messages_sequence ON messages(session_id, sequence);
        CREATE INDEX IF NOT EXISTS idx_messages_updated ON messages(updated_at);
      `);
      
      log('MIGRATION', 1, 'migrate', 'Created tracking indices');
      
      // Step 5: Record migration completion
      this.db.prepare(`
        INSERT OR REPLACE INTO migration_info (key, value, timestamp) 
        VALUES (?, ?, ?)
      `).run('schema_v2_migrated', 'true', Date.now());
      
      // Commit transaction
      this.db.prepare('COMMIT').run();
      
      log('MIGRATION', 1, 'migrate', 'Schema migration V2 completed successfully');
      
      return {
        success: true,
        message: 'Schema migration V2 completed',
        changes: {
          sessions: ['deleted', 'device_id', 'synced_at', 'hash'],
          messages: ['deleted', 'device_id', 'synced_at', 'sequence', 'updated_at'],
          newTables: ['sync_metadata']
        }
      };
      
    } catch (error) {
      // Rollback on error
      try {
        this.db.prepare('ROLLBACK').run();
      } catch (rollbackErr) {
        log('MIGRATION', 4, 'migrate', 'Rollback failed', { error: rollbackErr.message });
      }
      
      log('MIGRATION', 4, 'migrate', 'Migration failed', { error: error.message, stack: error.stack });
      
      return {
        success: false,
        error: error.message,
        stack: error.stack
      };
    }
  }
}

module.exports = SchemaMigrationV2;
