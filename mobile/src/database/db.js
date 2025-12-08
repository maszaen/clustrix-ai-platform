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
      metadata TEXT,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
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
  `);
  
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
  return await db.getAllAsync(
    'SELECT * FROM messages WHERE session_id = ? ORDER BY message_index ASC',
    [sessionId]
  );
}

export async function addMessage(sessionId, role, content, metadata, messageIndex) {
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO messages (session_id, role, content, created_at, message_index, model_id, provider, think_content, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      sessionId, role, content, now, messageIndex,
      metadata.model || null,
      metadata.provider || null,
      metadata.thinkContent ? JSON.stringify(metadata.thinkContent) : null,
      JSON.stringify(metadata)
    ]
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
