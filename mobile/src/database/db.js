import * as SQLite from 'expo-sqlite';

let db = null;

export async function initDatabase() {
  db = await SQLite.openDatabaseAsync('clustrix.db');
  
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      name TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
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
  `);
  
  // Migration: Add think_duration column if not exists (for existing databases)
  try {
    await db.runAsync('ALTER TABLE messages ADD COLUMN think_duration INTEGER');
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
  return await db.getAllAsync('SELECT * FROM sessions ORDER BY updated_at DESC');
}

export async function getSession(id) {
  return await db.getFirstAsync('SELECT * FROM sessions WHERE id = ?', [id]);
}

export async function saveSession(session) {
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO sessions (id, name, created_at, updated_at, metadata)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       updated_at = excluded.updated_at,
       metadata = excluded.metadata`,
    [session.id, session.name, session.created_at || now, now, JSON.stringify(session.metadata || {})]
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

    return {
      ...row,
      ...metadata,
      metadata,
      thinkContent: thinkContent || metadata.thinkContent || null,
      thinkDuration: row.think_duration || metadata.thinkDuration || null,
    };
  });
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

// Load older messages (for pagination - load N messages before a given index)
export async function getOlderMessages(sessionId, beforeIndex, count = 4) {
  console.log('[DB:getOlderMessages] sessionId:', sessionId, 'beforeIndex:', beforeIndex, 'count:', count);
  
  const rows = await db.getAllAsync(
    'SELECT * FROM messages WHERE session_id = ? AND message_index < ? ORDER BY message_index DESC LIMIT ?',
    [sessionId, beforeIndex, count]
  );
  
  console.log('[DB:getOlderMessages] Raw rows count:', rows?.length, 'indices:', rows?.map(r => r.message_index));
  
  if (!rows || rows.length === 0) {
    return { messages: [], hasMore: false };
  }
  
  // Reverse to get ascending order
  rows.reverse();
  
  // Check if there are more older messages by querying count of messages before oldestLoaded
  const oldestLoaded = rows[0].message_index;
  
  // More accurate hasMore check - query if any message exists before oldestLoaded
  const olderExists = await db.getFirstAsync(
    'SELECT 1 FROM messages WHERE session_id = ? AND message_index < ? LIMIT 1',
    [sessionId, oldestLoaded]
  );
  const hasMore = !!olderExists;
  
  console.log('[DB:getOlderMessages] After reverse indices:', rows.map(r => r.message_index), 'oldestLoaded:', oldestLoaded, 'hasMore:', hasMore);
  
  // Normalize metadata
  const messages = rows.map((row) => {
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
  
  return { messages, hasMore };
}

export async function addMessage(sessionId, role, content, metadata, messageIndex, createdAt = Date.now()) {
  console.log('[DB:addMessage] sessionId:', sessionId, 'role:', role, 'messageIndex:', messageIndex);
  
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
        'INSERT INTO sessions (id, name, created_at, updated_at, metadata) VALUES (?, ?, ?, ?, ?)',
        [session.id, session.name, session.created_at, session.updated_at, session.metadata || '{}']
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
