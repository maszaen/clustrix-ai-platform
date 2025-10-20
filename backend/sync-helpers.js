/**
 * Sync Helpers
 * 
 * Utility functions for smart sync/backup system:
 * - Device ID generation (persistent per machine)
 * - Session hash generation (for conflict detection)
 * - Timestamp helpers
 * - Change detection
 */

const crypto = require('crypto');
const os = require('os');
const { logWithContext } = require('../utils/logger');

const log = (level, method, message, data = {}) => {
  logWithContext('SYNC-HELPERS', level, method, message, data);
};

// ============================================================
// DEVICE ID GENERATION
// ============================================================

// Cache device ID to avoid repeated database queries
let cachedDeviceId = null;

/**
 * Generate a unique device ID based on machine characteristics
 * 
 * Creates a consistent ID that persists across app restarts but is
 * unique per machine. Used to track which device made changes.
 * 
 * Format: xxxxxxxx-xxxx-xxxx (e.g., "a3f4b8c1-d2e5-f7a9")
 * 
 * @returns {string} Device ID (24 characters)
 */
function generateDeviceId() {
  const machineInfo = {
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    username: os.userInfo().username,
    homedir: os.homedir()
  };
  
  const infoString = JSON.stringify(machineInfo);
  const hash = crypto.createHash('sha256').update(infoString).digest('hex');
  
  // Format as UUID-style ID: xxxxxxxx-xxxx-xxxx
  const deviceId = `${hash.substring(0, 8)}-${hash.substring(8, 12)}-${hash.substring(12, 16)}`;
  
  log(1, 'generateDeviceId', 'Device ID generated', {
    deviceId,
    hostname: machineInfo.hostname,
    platform: machineInfo.platform
  });
  
  return deviceId;
}

/**
 * Get or create device ID for this machine
 * 
 * Retrieves device ID from sync_metadata table, or generates and stores
 * a new one if it doesn't exist. This ensures each machine has a persistent
 * unique identifier.
 * 
 * OPTIMIZATION: Caches the device ID after first retrieval to avoid
 * repeated database queries (since device ID never changes).
 * 
 * @param {Database} db - Better-sqlite3 database instance
 * @returns {string} Device ID for this machine
 */
function getDeviceId(db) {
  // Return cached value if available
  if (cachedDeviceId) {
    return cachedDeviceId;
  }
  
  try {
    // Try to get existing device ID
    const row = db.prepare('SELECT value FROM sync_metadata WHERE key = ?').get('device_id');
    
    if (row) {
      log(1, 'getDeviceId', 'Using existing device ID', { deviceId: row.value });
      cachedDeviceId = row.value;
      return cachedDeviceId;
    }
    
    // Generate new device ID
    const deviceId = generateDeviceId();
    const now = Date.now();
    
    // Store in database
    db.prepare(`
      INSERT INTO sync_metadata (key, value, updated_at) 
      VALUES (?, ?, ?)
    `).run('device_id', deviceId, now);
    
    log(1, 'getDeviceId', 'Created new device ID', { deviceId });
    cachedDeviceId = deviceId;
    return cachedDeviceId;
  } catch (error) {
    log(4, 'getDeviceId', 'Error getting device ID', {
      error: error.message,
      stack: error.stack
    });
    
    // Fallback to generating a device ID (won't persist, but better than crashing)
    const fallbackId = generateDeviceId();
    cachedDeviceId = fallbackId; // Cache even fallback to avoid regenerating
    return fallbackId;
  }
}

// ============================================================
// SESSION HASH GENERATION
// ============================================================

/**
 * Generate a hash for a session to detect content changes
 * 
 * Creates a SHA256 hash of the session's key properties and messages.
 * Used to detect conflicts when two devices modify the same session
 * concurrently (same timestamp but different content).
 * 
 * Hash includes:
 * - Session ID
 * - Session title
 * - Number of messages
 * - Last message content (representative sample)
 * 
 * @param {Object} session - Session object with id, name, etc.
 * @param {Array<Object>} messages - Array of message objects
 * @returns {string} SHA256 hash (64 hex characters)
 */
function generateSessionHash(session, messages = []) {
  const hashInput = {
    id: session.id,
    title: session.name || session.title || '',
    messageCount: messages.length,
    // Use last message as representative sample (full hash of all messages would be expensive)
    lastMessageContent: messages.length > 0 ? messages[messages.length - 1].content : ''
  };
  
  const inputString = JSON.stringify(hashInput);
  const hash = crypto.createHash('sha256').update(inputString).digest('hex');
  
  // Only log in debug mode or for first few sessions to avoid log spam
  // (This function is called for EVERY session on every save)
  // Removed verbose logging - hash generation is a normal, frequent operation
  
  return hash;
}

/**
 * Generate a hash for a single message
 * 
 * Creates a SHA256 hash of the message content and metadata.
 * Used for message-level conflict detection.
 * 
 * Hash includes:
 * - Message ID
 * - Role (user/assistant/system)
 * - Content
 * - Sequence number (position in session)
 * 
 * @param {Object} message - Message object
 * @returns {string} SHA256 hash (64 hex characters)
 */
function generateMessageHash(message) {
  const hashInput = {
    id: message.id,
    role: message.role,
    content: message.content,
    sequence: message.sequence || message.message_index || 0
  };
  
  const inputString = JSON.stringify(hashInput);
  const hash = crypto.createHash('sha256').update(inputString).digest('hex');
  
  log(3, 'generateMessageHash', 'Message hash generated', {
    messageId: message.id,
    hash: hash.substring(0, 16) + '...'
  });
  
  return hash;
}

// ============================================================
// TIMESTAMP HELPERS
// ============================================================

/**
 * Get current timestamp in milliseconds
 * 
 * @returns {number} Unix timestamp (ms since epoch)
 */
function getCurrentTimestamp() {
  return Date.now();
}

/**
 * Format timestamp for display
 * 
 * @param {number} timestamp - Unix timestamp in milliseconds
 * @returns {string} Human-readable date/time
 */
function formatTimestamp(timestamp) {
  if (!timestamp) return 'Never';
  return new Date(timestamp).toLocaleString();
}

/**
 * Check if timestamp A is newer than timestamp B
 * 
 * @param {number} timestampA 
 * @param {number} timestampB 
 * @returns {boolean} True if A is newer
 */
function isNewer(timestampA, timestampB) {
  return timestampA > timestampB;
}

/**
 * Check if two timestamps are within a tolerance (for conflict detection)
 * 
 * Sometimes two devices might create records with timestamps only milliseconds
 * apart due to clock synchronization. This checks if they're "close enough"
 * to be considered the same time (potential conflict).
 * 
 * @param {number} timestampA 
 * @param {number} timestampB 
 * @param {number} toleranceMs - Tolerance in milliseconds (default 1000ms = 1 second)
 * @returns {boolean} True if timestamps are within tolerance
 */
function timestampsMatch(timestampA, timestampB, toleranceMs = 1000) {
  return Math.abs(timestampA - timestampB) <= toleranceMs;
}

// ============================================================
// CHANGE DETECTION
// ============================================================

/**
 * Get metadata value from sync_metadata table
 * 
 * @param {Database} db - Better-sqlite3 database instance
 * @param {string} key - Metadata key (e.g., 'last_sync_time')
 * @returns {string|null} Metadata value or null if not found
 */
function getSyncMetadata(db, key) {
  try {
    const row = db.prepare('SELECT value FROM sync_metadata WHERE key = ?').get(key);
    return row ? row.value : null;
  } catch (error) {
    log(4, 'getSyncMetadata', 'Error getting metadata', {
      key,
      error: error.message
    });
    return null;
  }
}

/**
 * Set metadata value in sync_metadata table
 * 
 * @param {Database} db - Better-sqlite3 database instance
 * @param {string} key - Metadata key
 * @param {string} value - Metadata value
 */
function setSyncMetadata(db, key, value) {
  try {
    const now = getCurrentTimestamp();
    
    db.prepare(`
      INSERT OR REPLACE INTO sync_metadata (key, value, updated_at) 
      VALUES (?, ?, ?)
    `).run(key, value, now);
    
    log(2, 'setSyncMetadata', 'Metadata updated', { key, value });
  } catch (error) {
    log(4, 'setSyncMetadata', 'Error setting metadata', {
      key,
      value,
      error: error.message
    });
  }
}

/**
 * Get last sync time from metadata
 * 
 * @param {Database} db - Better-sqlite3 database instance
 * @returns {number} Last sync timestamp (0 if never synced)
 */
function getLastSyncTime(db) {
  const value = getSyncMetadata(db, 'last_sync_time');
  return value ? parseInt(value, 10) : 0;
}

/**
 * Set last sync time to now
 * 
 * @param {Database} db - Better-sqlite3 database instance
 */
function updateLastSyncTime(db) {
  const now = getCurrentTimestamp();
  setSyncMetadata(db, 'last_sync_time', now.toString());
  log(1, 'updateLastSyncTime', 'Last sync time updated', { timestamp: now });
}

/**
 * Get last backup time from metadata
 * 
 * @param {Database} db - Better-sqlite3 database instance
 * @returns {number} Last backup timestamp (0 if never backed up)
 */
function getLastBackupTime(db) {
  const value = getSyncMetadata(db, 'last_backup_time');
  return value ? parseInt(value, 10) : 0;
}

/**
 * Set last backup time to now
 * 
 * @param {Database} db - Better-sqlite3 database instance
 */
function updateLastBackupTime(db) {
  const now = getCurrentTimestamp();
  setSyncMetadata(db, 'last_backup_time', now.toString());
  log(1, 'updateLastBackupTime', 'Last backup time updated', { timestamp: now });
}

/**
 * Get count of pending changes (records modified since last backup)
 * 
 * Counts sessions and messages where:
 * - updated_at > last_backup_time (modified since last backup)
 * - deleted = 0 (not soft-deleted)
 * 
 * @param {Database} db - Better-sqlite3 database instance
 * @returns {number} Count of pending changes
 */
function getPendingChangesCount(db) {
  try {
    const lastBackup = getLastBackupTime(db);
    
    // Count sessions modified since last backup
    const sessionsCount = db.prepare(`
      SELECT COUNT(*) as count 
      FROM sessions 
      WHERE updated_at > ? AND deleted = 0
    `).get(lastBackup).count;
    
    // Count messages modified since last backup
    const messagesCount = db.prepare(`
      SELECT COUNT(*) as count 
      FROM messages 
      WHERE updated_at > ? AND deleted = 0
    `).get(lastBackup).count;
    
    const total = sessionsCount + messagesCount;
    
    log(2, 'getPendingChangesCount', 'Pending changes counted', {
      sessions: sessionsCount,
      messages: messagesCount,
      total
    });
    
    return total;
  } catch (error) {
    log(4, 'getPendingChangesCount', 'Error counting pending changes', {
      error: error.message
    });
    return 0;
  }
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  // Device ID
  generateDeviceId,
  getDeviceId,
  
  // Hashing
  generateSessionHash,
  generateMessageHash,
  
  // Timestamps
  getCurrentTimestamp,
  formatTimestamp,
  isNewer,
  timestampsMatch,
  
  // Metadata
  getSyncMetadata,
  setSyncMetadata,
  getLastSyncTime,
  updateLastSyncTime,
  getLastBackupTime,
  updateLastBackupTime,
  getPendingChangesCount
};
