const Database = require('better-sqlite3');
const path = require('path');
const { logWithContext } = require('../utils/logger');

function log(context, level, func, message, details = {}) {
  logWithContext(context, func, message, details);
}

class DatabaseManager {
  constructor(app) {
    const userDataPath = app.getPath('userData');
    const dbPath = userDataPath === ':memory:' ? ':memory:' : path.join(userDataPath, 'clustrix.db');
    this.db = new Database(dbPath);
    
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('foreign_keys = ON');
    
    this.initSchema();
    this.migrateThinkingUpdate();  // Run migration after schema initialization
    log('DATABASE', 1, 'constructor', 'Database initialized', { path: dbPath });
  }
  
  initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        name TEXT,
        type TEXT DEFAULT 'regular',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_updated TEXT,
        project_id TEXT,
        is_project INTEGER DEFAULT 0,
        is_favorite INTEGER DEFAULT 0,
        
        persona_name TEXT,
        persona_work TEXT,
        persona_prefs TEXT,
        
        tokens_used INTEGER DEFAULT 0,
        
        metadata TEXT,
        
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
      );
      
      CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_sessions_type ON sessions(type);
      CREATE INDEX IF NOT EXISTS idx_sessions_favorite ON sessions(is_favorite);
      
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        message_index INTEGER NOT NULL,
        
        model_id TEXT,
        model_label TEXT,
        provider TEXT,
        base_url TEXT,
        
        think_mode TEXT,
        think_content TEXT,
        thinking_update TEXT,
        
        web_search_enabled INTEGER DEFAULT 0,
        web_search_data TEXT,
        
        files TEXT,
        
        metadata TEXT,
        
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );
      
      CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, message_index);
      
      CREATE TABLE IF NOT EXISTS artifacts (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        type TEXT NOT NULL,
        language TEXT,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        is_favorite INTEGER DEFAULT 0,
        session_id TEXT,
        message_index INTEGER,
        metadata TEXT,
        
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL
      );
      
      CREATE INDEX IF NOT EXISTS idx_artifacts_created ON artifacts(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_artifacts_type ON artifacts(type);
      
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        is_favorite INTEGER DEFAULT 0,
        metadata TEXT
      );
      
      CREATE INDEX IF NOT EXISTS idx_projects_created ON projects(created_at DESC);
      
      CREATE TABLE IF NOT EXISTS project_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        size INTEGER NOT NULL,
        content BLOB NOT NULL,
        created_at INTEGER NOT NULL,
        metadata TEXT,
        
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );
      
      CREATE INDEX IF NOT EXISTS idx_project_files_project ON project_files(project_id);
      
      CREATE TABLE IF NOT EXISTS drafts (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      
      CREATE TABLE IF NOT EXISTS vector_embeddings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT,
        content TEXT NOT NULL,
        embedding BLOB NOT NULL,
        metadata TEXT,
        created_at INTEGER NOT NULL,
        
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );
      
      CREATE INDEX IF NOT EXISTS idx_embeddings_session ON vector_embeddings(session_id);
      
      CREATE TABLE IF NOT EXISTS migration_info (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );
    `);
  }
  
  getAllSessions() {
    return this.db.prepare(`
      SELECT * FROM sessions 
      ORDER BY updated_at DESC
    `).all();
  }
  
  getSession(sessionId) {
    return this.db.prepare(`
      SELECT * FROM sessions WHERE id = ?
    `).get(sessionId);
  }
  
  saveSession(session) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO sessions 
      (id, name, type, created_at, updated_at, last_updated, project_id, 
       is_project, is_favorite, persona_name, persona_work, persona_prefs, 
       tokens_used, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const createdAt = session.created_at ? Date.parse(session.created_at) : Date.now();
    const updatedAt = session.last_updated ? Date.parse(session.last_updated) : Date.now();
    
    return stmt.run(
      session.id,
      session.name,
      session.type || 'regular',
      createdAt,
      updatedAt,
      session.last_updated || new Date(updatedAt).toISOString(),
      session.projectId || null,
      session.isProject ? 1 : 0,
      session.isFavorite ? 1 : 0,
      session.persona?.name || '',
      session.persona?.work || '',
      session.persona?.prefs || '',
      session.tokens_used || 0,
      JSON.stringify({
        canvases: session.canvases || {},
        tokens_by_message: session.tokens_by_message || {}
      })
    );
  }
  
  deleteSession(sessionId) {
    return this.db.prepare(`
      DELETE FROM sessions WHERE id = ?
    `).run(sessionId);
  }
  
  getMessages(sessionId) {
    return this.db.prepare(`
      SELECT * FROM messages 
      WHERE session_id = ? 
      ORDER BY message_index ASC
    `).all(sessionId);
  }
  
  // UPSERT message (UPDATE if exists, INSERT if not)
  upsertMessage(sessionId, role, content, metadata, messageIndex) {
    // First, try to delete existing message at this index
    this.db.prepare(`
      DELETE FROM messages 
      WHERE session_id = ? AND message_index = ?
    `).run(sessionId, messageIndex);
    
    // Then insert the new message
    const stmt = this.db.prepare(`
      INSERT INTO messages 
      (session_id, role, content, message_index, created_at, 
       model_id, model_label, provider, base_url, think_mode, 
       think_content, thinking_update, web_search_enabled, web_search_data, files, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    return stmt.run(
      sessionId,
      role,
      content,
      messageIndex,
      Date.now(),
      metadata.model || null,
      metadata.modelLabel || null,
      metadata.provider || null,
      metadata.baseUrl || null,
      metadata.thinkMode || null,
      metadata.thinkContent ? JSON.stringify(metadata.thinkContent) : null,
      metadata.thinkingUpdate ? JSON.stringify(metadata.thinkingUpdate) : null,
      metadata.webSearchEnabled ? 1 : 0,
      metadata.webSearchData ? JSON.stringify(metadata.webSearchData) : null,
      metadata.files ? JSON.stringify(metadata.files) : null,
      JSON.stringify(metadata)
    );
  }
  
  addMessage(sessionId, role, content, metadata, messageIndex) {
    const stmt = this.db.prepare(`
      INSERT INTO messages 
      (session_id, role, content, message_index, created_at, 
       model_id, model_label, provider, base_url, think_mode, 
       think_content, thinking_update, web_search_enabled, web_search_data, files, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    return stmt.run(
      sessionId,
      role,
      content,
      messageIndex,
      Date.now(),
      metadata.model || null,
      metadata.modelLabel || null,
      metadata.provider || null,
      metadata.baseUrl || null,
      metadata.thinkMode || null,
      metadata.thinkContent ? JSON.stringify(metadata.thinkContent) : null,
      metadata.thinkingUpdate ? JSON.stringify(metadata.thinkingUpdate) : null,
      metadata.webSearchEnabled ? 1 : 0,
      metadata.webSearchData ? JSON.stringify(metadata.webSearchData) : null,
      metadata.files ? JSON.stringify(metadata.files) : null,
      JSON.stringify(metadata)
    );
  }
  
  deleteMessagesForSession(sessionId) {
    return this.db.prepare(`
      DELETE FROM messages WHERE session_id = ?
    `).run(sessionId);
  }
  
  getAllArtifacts() {
    return this.db.prepare(`
      SELECT * FROM artifacts 
      ORDER BY created_at DESC
    `).all();
  }
  
  getArtifact(artifactId) {
    return this.db.prepare(`
      SELECT * FROM artifacts WHERE id = ?
    `).get(artifactId);
  }
  
  saveArtifact(artifact) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO artifacts 
      (id, title, type, language, content, created_at, updated_at, is_favorite, session_id, message_index, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    return stmt.run(
      artifact.id,
      artifact.title,
      artifact.type || 'code',
      artifact.language || null,
      artifact.content || artifact.code || '',
      Date.parse(artifact.created_at),
      Date.parse(artifact.updated_at),
      artifact.isFavorite ? 1 : 0,
      artifact.sessionId || null,
      artifact.messageIndex || null,
      JSON.stringify({})
    );
  }
  
  deleteArtifact(artifactId) {
    return this.db.prepare(`
      DELETE FROM artifacts WHERE id = ?
    `).run(artifactId);
  }
  
  getAllProjects() {
    return this.db.prepare(`
      SELECT * FROM projects 
      ORDER BY created_at DESC
    `).all();
  }
  
  getProject(projectId) {
    return this.db.prepare(`
      SELECT * FROM projects WHERE id = ?
    `).get(projectId);
  }
  
  saveProject(project) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO projects 
      (id, name, description, created_at, updated_at, is_favorite, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    const createdAt = project.created_at ? Date.parse(project.created_at) : Date.now();
    const updatedAt = project.updated_at || project.last_updated ? Date.parse(project.updated_at || project.last_updated) : Date.now();
    
    return stmt.run(
      project.id,
      project.name,
      project.description || '',
      createdAt,
      updatedAt,
      project.isFavorite ? 1 : 0,
      JSON.stringify({})
    );
  }
  
  deleteProject(projectId) {
    return this.db.prepare(`
      DELETE FROM projects WHERE id = ?
    `).run(projectId);
  }
  
  getProjectFiles(projectId) {
    return this.db.prepare(`
      SELECT * FROM project_files 
      WHERE project_id = ?
    `).all(projectId);
  }
  
  saveProjectFile(projectId, file) {
    const stmt = this.db.prepare(`
      INSERT INTO project_files 
      (project_id, name, type, size, content, created_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    const binaryContent = typeof file.content === 'string' 
      ? Buffer.from(file.content, 'utf-8')  // Plain text from file processing
      : file.content;
    
    return stmt.run(
      projectId,
      file.name,
      file.type,
      binaryContent.length,
      binaryContent,
      Date.now(),
      JSON.stringify({})
    );
  }
  
  deleteProjectFiles(projectId) {
    return this.db.prepare(`
      DELETE FROM project_files WHERE project_id = ?
    `).run(projectId);
  }
  
  getSetting(key) {
    const row = this.db.prepare(`
      SELECT value FROM settings WHERE key = ?
    `).get(key);
    return row ? JSON.parse(row.value) : null;
  }
  
  saveSetting(key, value) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO settings (key, value, updated_at)
      VALUES (?, ?, ?)
    `);
    return stmt.run(key, JSON.stringify(value), Date.now());
  }
  
  getAllSettings() {
    const rows = this.db.prepare(`SELECT key, value FROM settings`).all();
    const settings = {};
    for (const row of rows) {
      settings[row.key] = JSON.parse(row.value);
    }
    return settings;
  }
  
  transaction(fn) {
    return this.db.transaction(fn)();
  }
  
  backup(destPath) {
    return this.db.backup(destPath);
  }
  
  // Migration: Add thinking_update column if it doesn't exist
  migrateThinkingUpdate() {
    try {
      // Check if column exists
      const tableInfo = this.db.prepare(`PRAGMA table_info(messages)`).all();
      const hasThinkingUpdate = tableInfo.some(col => col.name === 'thinking_update');
      
      if (!hasThinkingUpdate) {
        log('DATABASE', 1, 'migrateThinkingUpdate', 'Adding thinking_update column to messages table');
        this.db.exec(`ALTER TABLE messages ADD COLUMN thinking_update TEXT`);
        log('DATABASE', 1, 'migrateThinkingUpdate', 'Successfully added thinking_update column');
      } else {
        log('DATABASE', 1, 'migrateThinkingUpdate', 'thinking_update column already exists, skipping migration');
      }
    } catch (error) {
      log('DATABASE', 3, 'migrateThinkingUpdate', 'Migration failed', { error: error.message });
      throw error;
    }
  }
  
  close() {
    this.db.close();
  }
}

module.exports = DatabaseManager;
