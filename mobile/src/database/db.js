import * as SQLite from 'expo-sqlite';

let db = null;

// Normalize attachment metadata to keep backward compatibility with older databases
// Older records may only store base64 without a URI, causing blank previews.
// This helper builds a data URI from base64 so Image components can render correctly.
function normalizeAttachments(attachments = []) {
  return attachments.map(att => {
    // Derive MIME type from metadata or filename for proper data URI prefix
    const lowerName = att.name?.toLowerCase() || '';
    const inferredMime = att.mimeType ||
      (lowerName.endsWith('.png') ? 'image/png'
        : lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg') ? 'image/jpeg'
        : lowerName.endsWith('.gif') ? 'image/gif'
        : lowerName.endsWith('.webp') ? 'image/webp'
        : lowerName.endsWith('.heic') ? 'image/heic'
        : 'application/octet-stream');

    let uri = att.uri;

    // Backwards compatibility: older rows stored only base64 → rebuild a renderable URI
    if (!uri && att.base64) {
      uri = att.base64.startsWith('data:')
        ? att.base64
        : `data:${inferredMime};base64,${att.base64}`;
    }

    return { ...att, uri };
  });
}

export async function initDatabase() {
  db = await SQLite.openDatabaseAsync('clustrix.db');
  
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      name TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      is_favorite INTEGER DEFAULT 0,
      metadata TEXT
    );
    
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      message_index INTEGER NOT NULL,
      model_id TEXT,
      provider TEXT,
      think_content TEXT,
      think_duration INTEGER,
      metadata TEXT,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
      UNIQUE(session_id, message_index)
    );
    
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    
    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, message_index);
    
    CREATE TABLE IF NOT EXISTS custom_models (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      model_id TEXT NOT NULL,
      label TEXT NOT NULL,
      is_default INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    
    CREATE TABLE IF NOT EXISTS custom_providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      base_url TEXT NOT NULL,
      is_default INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    
    CREATE TABLE IF NOT EXISTS provider_api_keys (
      provider_id TEXT PRIMARY KEY,
      api_key TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    -- Drafts table for chat input auto-save (per session)
    CREATE TABLE IF NOT EXISTS drafts (
      session_id TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    -- User persona table for welcome screen draft/prefs storage
    CREATE TABLE IF NOT EXISTS user_persona (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    -- Backup history table for tracking backup/restore operations
    CREATE TABLE IF NOT EXISTS backup_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      session_count INTEGER DEFAULT 0,
      success INTEGER DEFAULT 1,
      error_message TEXT
    );

    -- Reminders table for scheduled notifications (agentic tools)
    CREATE TABLE IF NOT EXISTS reminders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      scheduled_date TEXT NOT NULL,
      notification_id TEXT NOT NULL,
      is_completed INTEGER DEFAULT 0,
      metadata TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_reminders_user ON reminders(user_id);
    CREATE INDEX IF NOT EXISTS idx_reminders_scheduled ON reminders(scheduled_date);
  `);
  
  // Migration: Add think_duration column if not exists (for existing databases)
  try {
    await db.runAsync('ALTER TABLE messages ADD COLUMN think_duration INTEGER');
  } catch (e) {
    // Column already exists, ignore
  }
  
  // Migration: Add is_favorite column to sessions if not exists
  try {
    await db.runAsync('ALTER TABLE sessions ADD COLUMN is_favorite INTEGER DEFAULT 0');
  } catch (e) {
    // Column already exists, ignore
  }
  
  // Migration: Add is_completed column to reminders if not exists
  try {
    await db.runAsync('ALTER TABLE reminders ADD COLUMN is_completed INTEGER DEFAULT 0');
  } catch (e) {
    // Column already exists, ignore
  }
  
  return db;
}

export function getDb() {
  return db;
}

// Sessions
export async function getAllSessions() {
  const rows = await db.getAllAsync('SELECT * FROM sessions ORDER BY updated_at DESC');
  // Convert is_favorite from INTEGER (0/1) to boolean
  return (rows || []).map(row => ({
    ...row,
    is_favorite: row.is_favorite === 1,
  }));
}

export async function getSession(id) {
  return await db.getFirstAsync('SELECT * FROM sessions WHERE id = ?', [id]);
}

export async function saveSession(session) {
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO sessions (id, name, created_at, updated_at, is_favorite, metadata)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       updated_at = excluded.updated_at,
       is_favorite = excluded.is_favorite,
       metadata = excluded.metadata`,
    [session.id, session.name, session.created_at || now, now, session.is_favorite ? 1 : 0, JSON.stringify(session.metadata || {})]
  );
}

export async function deleteSession(id) {
  await db.runAsync('DELETE FROM messages WHERE session_id = ?', [id]);
  await db.runAsync('DELETE FROM sessions WHERE id = ?', [id]);
}

// Messages
export async function getMessages(sessionId) {
  const rows = await db.getAllAsync(
    'SELECT * FROM messages WHERE session_id = ? ORDER BY message_index ASC',
    [sessionId]
  );

  // Normalize metadata for renderer consumption
  return rows.map((row) => {
    let metadata = {};
    try {
      metadata = row.metadata ? JSON.parse(row.metadata) : {};
    } catch (e) {
      metadata = {};
    }

    // Parse think_content if stored as JSON string
    let thinkContent = null;
    if (row.think_content) {
      try {
        thinkContent = JSON.parse(row.think_content);
      } catch (err) {
        thinkContent = row.think_content;
      }
    }

    const attachments = Array.isArray(metadata.attachments)
      ? normalizeAttachments(metadata.attachments)
      : undefined;

    return {
      ...row,
      ...metadata,
      attachments,
      metadata: { ...metadata, attachments },
      thinkContent: thinkContent || metadata.thinkContent || null,
      thinkDuration: row.think_duration || metadata.thinkDuration || null,
    };
  });
}

/**
 * Get all attachments from a session's messages (directly from DB, ignores pagination)
 * Used by list_attachments tool to find files regardless of loaded messages
 */
export async function getSessionAttachments(sessionId) {
  const rows = await db.getAllAsync(
    'SELECT metadata FROM messages WHERE session_id = ? AND role = ?',
    [sessionId, 'user']
  );
  
  const attachments = [];
  
  for (const row of rows) {
    try {
      const metadata = row.metadata ? JSON.parse(row.metadata) : {};
      if (metadata.attachments && Array.isArray(metadata.attachments)) {
        const normalized = normalizeAttachments(metadata.attachments);
        for (const att of normalized) {
          // Avoid duplicates by name
          if (!attachments.some(a => a.name === att.name)) {
            attachments.push(att);
          }
        }
      }
    } catch (e) {
      // Skip malformed metadata
    }
  }
  
  return attachments;
}

// Get message count for a session
export async function getMessageCount(sessionId) {
  const result = await db.getFirstAsync(
    'SELECT COUNT(*) as count FROM messages WHERE session_id = ?',
    [sessionId]
  );
  return result?.count || 0;
}

// Get messages with character limit (from the end)
// Returns { messages, hasMore, oldestLoadedIndex }
export async function getMessagesPaginated(sessionId, charLimit = 5000) {
  // First get all messages ordered by index DESC (newest first)
  const rows = await db.getAllAsync(
    'SELECT * FROM messages WHERE session_id = ? ORDER BY message_index DESC',
    [sessionId]
  );
  
  if (!rows || rows.length === 0) {
    return { messages: [], hasMore: false, oldestLoadedIndex: -1 };
  }
  
  // Accumulate messages until char limit, but MINIMUM 2 messages
  const MIN_MESSAGES = 2;
  let totalChars = 0;
  let selectedRows = [];
  
  for (const row of rows) {
    const contentLength = (row.content || '').length;
    totalChars += contentLength;
    selectedRows.push(row);
    
    // Only stop if: exceeded char limit AND have at least 2 messages
    if (totalChars >= charLimit && selectedRows.length >= MIN_MESSAGES) {
      break;
    }
  }
  
  // Reverse to get ascending order (oldest to newest)
  selectedRows.reverse();
  
  const oldestLoadedIndex = selectedRows.length > 0 ? selectedRows[0].message_index : -1;
  const hasMore = selectedRows.length < rows.length;
  
  // Normalize metadata
  const messages = selectedRows.map((row) => {
    let metadata = {};
    try {
      metadata = row.metadata ? JSON.parse(row.metadata) : {};
    } catch (e) {
      metadata = {};
    }

    let thinkContent = null;
    if (row.think_content) {
      try {
        thinkContent = JSON.parse(row.think_content);
      } catch (err) {
        thinkContent = row.think_content;
      }
    }

    return {
      ...row,
      ...metadata,
      metadata,
      thinkContent: thinkContent || metadata.thinkContent || null,
      thinkDuration: row.think_duration || metadata.thinkDuration || null,
    };
  });
  
  // Calculate the next valid message index (max index + 1)
  // This handles gaps and duplicates correctly
  const maxIndex = rows.reduce((max, row) => Math.max(max, row.message_index), -1);
  const nextValidIndex = maxIndex + 1;
  
  return { messages, hasMore, oldestLoadedIndex, totalCount: nextValidIndex };
}

// Load older messages (for pagination - load messages before a given index up to charLimit)
// Uses same logic as initial load: 5000 chars, minimum 2 messages
export async function getOlderMessages(sessionId, beforeIndex, charLimit = 5000) {
  
  // Get all messages before beforeIndex, ordered DESC (newest of the older ones first)
  const rows = await db.getAllAsync(
    'SELECT * FROM messages WHERE session_id = ? AND message_index < ? ORDER BY message_index DESC',
    [sessionId, beforeIndex]
  );
  
  
  if (!rows || rows.length === 0) {
    return { messages: [], hasMore: false, oldestLoadedIndex: beforeIndex };
  }
  
  // Accumulate messages until char limit, but MINIMUM 2 messages (same as initial load)
  const MIN_MESSAGES = 2;
  let totalChars = 0;
  let selectedRows = [];
  
  for (const row of rows) {
    const contentLength = (row.content || '').length;
    totalChars += contentLength;
    selectedRows.push(row);
    
    // Only stop if: exceeded char limit AND have at least 2 messages
    if (totalChars >= charLimit && selectedRows.length >= MIN_MESSAGES) {
      break;
    }
  }
  

  // Reverse to get ascending order (oldest to newest)
  selectedRows.reverse();
  
  // The oldest loaded index is the first element after reverse
  const oldestLoadedIndex = selectedRows[0].message_index;
  
  // Check if there are more older messages
  const hasMore = selectedRows.length < rows.length;
  
  
  // Normalize metadata (use selectedRows, not rows!)
  const messages = selectedRows.map((row) => {
    let metadata = {};
    try {
      metadata = row.metadata ? JSON.parse(row.metadata) : {};
    } catch (e) {
      metadata = {};
    }

    let thinkContent = null;
    if (row.think_content) {
      try {
        thinkContent = JSON.parse(row.think_content);
      } catch (err) {
        thinkContent = row.think_content;
      }
    }

    const attachments = Array.isArray(metadata.attachments)
      ? normalizeAttachments(metadata.attachments)
      : undefined;

    return {
      ...row,
      ...metadata,
      attachments,
      metadata: { ...metadata, attachments },
      thinkContent: thinkContent || metadata.thinkContent || null,
      thinkDuration: row.think_duration || metadata.thinkDuration || null,
    };
  });
  
  return { messages, hasMore, oldestLoadedIndex };
}

export async function addMessage(sessionId, role, content, metadata, messageIndex, createdAt = Date.now()) {
  
  // Use INSERT OR REPLACE to handle any existing duplicates gracefully
  await db.runAsync(
    `INSERT OR REPLACE INTO messages (session_id, role, content, created_at, message_index, model_id, provider, think_content, think_duration, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      sessionId, role, content, createdAt, messageIndex,
      metadata.model || null,
      metadata.provider || null,
      metadata.thinkContent ? JSON.stringify(metadata.thinkContent) : null,
      metadata.thinkDuration || null,
      JSON.stringify(metadata)
    ]
  );
}

// Update message metadata for reactions/usage
export async function updateMessageMetadata(sessionId, messageIndex, metadata) {
  const row = await db.getFirstAsync(
    'SELECT metadata FROM messages WHERE session_id = ? AND message_index = ?',
    [sessionId, messageIndex]
  );

  let existing = {};
  try {
    existing = row?.metadata ? JSON.parse(row.metadata) : {};
  } catch (e) {
    existing = {};
  }

  const merged = { ...existing, ...metadata };
  await db.runAsync(
    'UPDATE messages SET metadata = ? WHERE session_id = ? AND message_index = ?',
    [JSON.stringify(merged), sessionId, messageIndex]
  );
}

// Delete a single message by session + index (used for failure recovery)
export async function deleteMessage(sessionId, messageIndex) {
  await db.runAsync(
    'DELETE FROM messages WHERE session_id = ? AND message_index = ?',
    [sessionId, messageIndex]
  );
}

// Settings
export async function getSetting(key) {
  const row = await db.getFirstAsync('SELECT value FROM settings WHERE key = ?', [key]);
  return row ? JSON.parse(row.value) : null;
}

export async function saveSetting(key, value) {
  await db.runAsync(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
    [key, JSON.stringify(value)]
  );
}

// Custom Models
export async function getAllCustomModels() {
  return await db.getAllAsync('SELECT * FROM custom_models ORDER BY created_at DESC');
}

export async function saveCustomModel(model) {
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO custom_models (id, provider, model_id, label, is_default, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       provider = excluded.provider,
       model_id = excluded.model_id,
       label = excluded.label`,
    [model.id, model.provider, model.model_id, model.label, model.is_default ? 1 : 0, model.created_at || now]
  );
}

export async function deleteCustomModel(id) {
  await db.runAsync('DELETE FROM custom_models WHERE id = ? AND is_default = 0', [id]);
}

// Custom Providers
export async function getAllCustomProviders() {
  return await db.getAllAsync('SELECT * FROM custom_providers ORDER BY created_at DESC');
}

export async function saveCustomProvider(provider) {
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO custom_providers (id, name, base_url, is_default, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       base_url = excluded.base_url`,
    [provider.id, provider.name, provider.base_url, provider.is_default ? 1 : 0, provider.created_at || now]
  );
}

export async function deleteCustomProvider(id) {
  await db.runAsync('DELETE FROM custom_providers WHERE id = ? AND is_default = 0', [id]);
}

// Provider API Keys
export async function getAllProviderApiKeys() {
  const rows = await db.getAllAsync('SELECT * FROM provider_api_keys');
  // Convert to object { providerId: apiKey }
  const keys = {};
  for (const row of rows) {
    keys[row.provider_id] = row.api_key;
  }
  return keys;
}

export async function saveProviderApiKey(providerId, apiKey) {
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO provider_api_keys (provider_id, api_key, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(provider_id) DO UPDATE SET
       api_key = excluded.api_key,
       updated_at = excluded.updated_at`,
    [providerId, apiKey, now]
  );
}

// Draft helpers
export async function getDraft(sessionId) {
  const row = await db.getFirstAsync(
    'SELECT value FROM drafts WHERE session_id = ?',
    [sessionId]
  );
  return row?.value || '';
}

export async function saveDraft(sessionId, value) {
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO drafts (session_id, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(session_id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [sessionId, value, now]
  );
}

export async function deleteDraft(sessionId) {
  await db.runAsync('DELETE FROM drafts WHERE session_id = ?', [sessionId]);
}

// Welcome/persona draft helpers (stored in user_persona table)
export async function getPersonaDraft(key = 'welcome_draft') {
  const row = await db.getFirstAsync(
    'SELECT data FROM user_persona WHERE id = ?',
    [key]
  );
  return row?.data || '';
}

export async function savePersonaDraft(value, key = 'welcome_draft') {
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO user_persona (id, data, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    [key, value, now]
  );
}

// ========================================
// Backup History
// ========================================

/**
 * Add a backup/restore history entry
 * @param {string} type - 'backup' or 'restore'
 * @param {number} sessionCount - Number of sessions backed up/restored
 * @param {boolean} success - Whether operation succeeded
 * @param {string} errorMessage - Error message if failed
 */
export async function addBackupHistory(type, sessionCount, success = true, errorMessage = null) {
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO backup_history (type, timestamp, session_count, success, error_message)
     VALUES (?, ?, ?, ?, ?)`,
    [type, now, sessionCount, success ? 1 : 0, errorMessage]
  );
}

/**
 * Get backup history entries (most recent first)
 * @param {number} limit - Max entries to return
 */
export async function getBackupHistory(limit = 20) {
  const rows = await db.getAllAsync(
    'SELECT * FROM backup_history ORDER BY timestamp DESC LIMIT ?',
    [limit]
  );
  return (rows || []).map(row => ({
    ...row,
    success: row.success === 1,
  }));
}

// ========================================
// Export/Import for Backup
// ========================================

/**
 * Export all data from database for backup
 */
export async function exportAllData() {
  const [sessions, messages, settings, customModels, customProviders, providerApiKeys] = await Promise.all([
    db.getAllAsync('SELECT * FROM sessions'),
    db.getAllAsync('SELECT * FROM messages'),
    db.getAllAsync('SELECT * FROM settings'),
    db.getAllAsync('SELECT * FROM custom_models'),
    db.getAllAsync('SELECT * FROM custom_providers'),
    db.getAllAsync('SELECT * FROM provider_api_keys'),
  ]);
  
  return {
    version: '1.0',
    exportedAt: Date.now(),
    platform: 'mobile',
    data: {
      sessions: sessions || [],
      messages: messages || [],
      settings: settings || [],
      customModels: customModels || [],
      customProviders: customProviders || [],
      providerApiKeys: providerApiKeys || [],
    },
  };
}

/**
 * Import all data from backup
 * WARNING: This will replace all existing data!
 */
export async function importAllData(backupData) {
  if (!backupData?.data) {
    throw new Error('Invalid backup data format');
  }
  
  const { sessions, messages, settings, customModels, customProviders, providerApiKeys } = backupData.data;
  
  // Start transaction
  await db.execAsync('BEGIN TRANSACTION');
  
  try {
    // Clear existing data
    await db.execAsync(`
      DELETE FROM messages;
      DELETE FROM sessions;
      DELETE FROM settings;
      DELETE FROM custom_models;
      DELETE FROM custom_providers;
      DELETE FROM provider_api_keys;
    `);
    
    // Import sessions
    for (const session of (sessions || [])) {
      await db.runAsync(
        'INSERT INTO sessions (id, name, created_at, updated_at, is_favorite, metadata) VALUES (?, ?, ?, ?, ?, ?)',
        [session.id, session.name, session.created_at, session.updated_at, session.is_favorite ? 1 : 0, session.metadata || '{}']
      );
    }
    
    // Import messages
    for (const msg of (messages || [])) {
      await db.runAsync(
        'INSERT INTO messages (id, session_id, role, content, created_at, message_index, model_id, provider, think_content, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [msg.id, msg.session_id, msg.role, msg.content, msg.created_at, msg.message_index, msg.model_id, msg.provider, msg.think_content, msg.metadata || '{}']
      );
    }
    
    // Import settings
    for (const setting of (settings || [])) {
      await db.runAsync(
        'INSERT INTO settings (key, value) VALUES (?, ?)',
        [setting.key, setting.value]
      );
    }
    
    // Import custom models
    for (const model of (customModels || [])) {
      await db.runAsync(
        'INSERT INTO custom_models (id, provider, model_id, label, is_default, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [model.id, model.provider, model.model_id, model.label, model.is_default, model.created_at]
      );
    }
    
    // Import custom providers
    for (const provider of (customProviders || [])) {
      await db.runAsync(
        'INSERT INTO custom_providers (id, name, base_url, is_default, created_at) VALUES (?, ?, ?, ?, ?)',
        [provider.id, provider.name, provider.base_url, provider.is_default, provider.created_at]
      );
    }
    
    // Import provider API keys
    for (const key of (providerApiKeys || [])) {
      await db.runAsync(
        'INSERT INTO provider_api_keys (provider_id, api_key, updated_at) VALUES (?, ?, ?)',
        [key.provider_id, key.api_key, key.updated_at]
      );
    }
    
    await db.execAsync('COMMIT');
    
    return { success: true };
  } catch (error) {
    await db.execAsync('ROLLBACK');
    throw error;
  }
}

/**
 * Get all reminders for a user (including completed)
 * @param {string} userId - User ID
 * @returns {Promise<Array>} Array of reminder objects
 */
export async function getReminders(userId) {
  const rows = await db.getAllAsync(
    'SELECT * FROM reminders WHERE user_id = ? ORDER BY is_completed ASC, scheduled_date ASC',
    [userId]
  );
  
  return (rows || []).map(row => ({
    id: row.id,
    userId: row.user_id,
    title: row.title,
    message: row.message,
    scheduledDate: row.scheduled_date,
    notificationId: row.notification_id,
    isCompleted: row.is_completed === 1,
    metadata: row.metadata ? JSON.parse(row.metadata) : {},
    createdAt: new Date(row.created_at).toISOString(),
  }));
}

/**
 * Get only active (non-completed) reminders for a user
 * Used by view_reminder tool - excludes completed reminders
 * @param {string} userId - User ID
 * @returns {Promise<Array>} Array of active reminder objects
 */
export async function getActiveReminders(userId) {
  const rows = await db.getAllAsync(
    'SELECT * FROM reminders WHERE user_id = ? AND is_completed = 0 ORDER BY scheduled_date ASC',
    [userId]
  );
  
  return (rows || []).map(row => ({
    id: row.id,
    userId: row.user_id,
    title: row.title,
    message: row.message,
    scheduledDate: row.scheduled_date,
    notificationId: row.notification_id,
    isCompleted: false,
    metadata: row.metadata ? JSON.parse(row.metadata) : {},
    createdAt: new Date(row.created_at).toISOString(),
  }));
}

/**
 * Get a single reminder by ID
 * @param {string} id - Reminder ID
 * @param {string} userId - User ID (for ownership validation)
 * @returns {Promise<Object|null>}
 */
export async function getReminder(id, userId) {
  const row = await db.getFirstAsync(
    'SELECT * FROM reminders WHERE id = ? AND user_id = ?',
    [id, userId]
  );
  
  if (!row) return null;
  
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    message: row.message,
    scheduledDate: row.scheduled_date,
    notificationId: row.notification_id,
    isCompleted: row.is_completed === 1,
    metadata: row.metadata ? JSON.parse(row.metadata) : {},
    createdAt: new Date(row.created_at).toISOString(),
  };
}

/**
 * Save a new reminder
 * @param {Object} reminder - Reminder object
 * @returns {Promise<void>}
 */
export async function saveReminder(reminder) {
  const now = Date.now();
  await db.runAsync(
    `INSERT OR REPLACE INTO reminders (id, user_id, title, message, scheduled_date, notification_id, is_completed, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      reminder.id,
      reminder.userId,
      reminder.title,
      reminder.message,
      reminder.scheduledDate,
      reminder.notificationId || '',
      reminder.isCompleted ? 1 : 0,
      JSON.stringify(reminder.metadata || {}),
      now,
    ]
  );
}

/**
 * Mark a reminder as completed (does NOT delete)
 * @param {string} id - Reminder ID
 * @param {string} userId - User ID (for ownership validation)
 * @returns {Promise<boolean>} True if updated, false if not found
 */
export async function completeReminder(id, userId) {
  const result = await db.runAsync(
    'UPDATE reminders SET is_completed = 1 WHERE id = ? AND user_id = ?',
    [id, userId]
  );
  return result.changes > 0;
}

/**
 * Delete a reminder by ID (permanent)
 * @param {string} id - Reminder ID
 * @param {string} userId - User ID (for ownership validation)
 * @returns {Promise<boolean>} True if deleted, false if not found
 */
export async function deleteReminder(id, userId) {
  const result = await db.runAsync(
    'DELETE FROM reminders WHERE id = ? AND user_id = ?',
    [id, userId]
  );
  return result.changes > 0;
}

/**
 * Get past reminders that already fired (for cleanup) - only non-completed
 * @param {string} userId - User ID
 * @returns {Promise<Array>}
 */
export async function getPastReminders(userId) {
  const now = new Date().toISOString();
  const rows = await db.getAllAsync(
    'SELECT * FROM reminders WHERE user_id = ? AND scheduled_date < ? AND is_completed = 0',
    [userId, now]
  );
  
  return (rows || []).map(row => ({
    id: row.id,
    userId: row.user_id,
    title: row.title,
    message: row.message,
    scheduledDate: row.scheduled_date,
    notificationId: row.notification_id,
    isCompleted: false,
    metadata: row.metadata ? JSON.parse(row.metadata) : {},
    createdAt: new Date(row.created_at).toISOString(),
  }));
}

/**
 * Delete all past non-completed reminders for a user
 * @param {string} userId - User ID
 * @returns {Promise<number>} Number of deleted reminders
 */
export async function cleanupPastReminders(userId) {
  const now = new Date().toISOString();
  const result = await db.runAsync(
    'DELETE FROM reminders WHERE user_id = ? AND scheduled_date < ? AND is_completed = 0',
    [userId, now]
  );
  return result.changes || 0;
}

/**
 * Update reminder's notificationId (for re-scheduling)
 * @param {string} id - Reminder ID
 * @param {string} notificationId - New notification ID from @notifee
 */
export async function updateReminderNotificationId(id, notificationId) {
  await db.runAsync(
    'UPDATE reminders SET notification_id = ? WHERE id = ?',
    [notificationId, id]
  );
}

