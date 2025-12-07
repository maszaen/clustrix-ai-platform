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
