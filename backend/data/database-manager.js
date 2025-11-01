const Database = require('better-sqlite3');
const path = require('path');
const { logWithContext } = require('../../utils/logger');
const SchemaMigrationV2 = require('./schema-migration-v2');
const { 
  getDeviceId, // Only called once in constructor, then cached
  generateSessionHash, 
  getCurrentTimestamp 
} = require('../sync/sync-helpers');

function log(context, level, func, message, details = {}) {
  logWithContext(context, func, message, details);
}

class DatabaseManager {
  constructor(app, customDbDir = null) {
    let dbPath;
    
    if (customDbDir) {
      // Use custom directory path (for cloud databases)
      // customDbDir should be full path to database directory
      dbPath = path.join(customDbDir, 'clustrix.db');
    } else {
      // Default: internal database
      const userDataPath = app.getPath('userData');
      dbPath = userDataPath === ':memory:' ? ':memory:' : path.join(userDataPath, 'database', 'internal', 'clustrix.db');
    }
    
    this.db = new Database(dbPath);
    this.dbPath = dbPath;
    this.isCloudDatabase = !!customDbDir; // CRITICAL: Store cloud database flag
    
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('foreign_keys = ON');
    
    this.initSchema();
    
    // Run schema migration V2 (for sync/backup support)
    this.runSchemaMigration();
    
    // Cache device ID once per DatabaseManager instance
    // This prevents thousands of repeated calls to getDeviceId()
    this._cachedDeviceId = getDeviceId(this.db);
    
    log('DATABASE', 1, 'constructor', 'Database initialized', { 
      path: dbPath,
      isCloudDatabase: this.isCloudDatabase,
      deviceId: this._cachedDeviceId
    });
  }
  
  runSchemaMigration() {
    try {
      const migration = new SchemaMigrationV2(this.db, this.dbPath, this.isCloudDatabase);
      const result = migration.migrate();
      
      if (result.success) {
        log('DATABASE', 1, 'runSchemaMigration', 'Schema migration completed', result);
      } else {
        log('DATABASE', 4, 'runSchemaMigration', 'Schema migration failed', result);
      }
    } catch (error) {
      log('DATABASE', 4, 'runSchemaMigration', 'Schema migration error', {
        error: error.message,
        stack: error.stack
      });
    }
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
        metadata TEXT
        
        -- FOREIGN KEY constraint removed to allow session_id without requiring session in DB
        -- FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL
      );
      
      CREATE INDEX IF NOT EXISTS idx_artifacts_created ON artifacts(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_artifacts_type ON artifacts(type);
      
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        instruction TEXT,
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
    
    // CRITICAL: Add instruction column for existing databases
    // Without this, INSERT will fail on old databases
    try {
      const tableInfo = this.db.prepare("PRAGMA table_info(projects)").all();
      const hasInstructionColumn = tableInfo.some(col => col.name === 'instruction');
      
      if (!hasInstructionColumn) {
        console.log('[DATABASE] Adding instruction column to projects table (migration)');
        this.db.exec("ALTER TABLE projects ADD COLUMN instruction TEXT");
        console.log('[DATABASE] Successfully added instruction column');
      }
    } catch (migrationError) {
      console.error('[DATABASE] Migration failed:', migrationError.message);
    }
  }
  
  getAllSessions() {
    // Check if 'deleted' column exists (added in migration V2)
    const columns = this.db.prepare(`PRAGMA table_info(sessions)`).all();
    const hasDeletedColumn = columns.some(col => col.name === 'deleted');
    
    if (hasDeletedColumn) {
      return this.db.prepare(`
        SELECT * FROM sessions 
        WHERE deleted = 0
        ORDER BY updated_at DESC
      `).all();
    } else {
      // Fallback for old schema (no deleted column)
      return this.db.prepare(`
        SELECT * FROM sessions 
        ORDER BY updated_at DESC
      `).all();
    }
  }
  
  getSession(sessionId) {
    return this.db.prepare(`
      SELECT * FROM sessions WHERE id = ?
    `).get(sessionId);
  }
  
  saveSession(session) {
    // Use cached device ID (set once in constructor)
    const deviceId = this._cachedDeviceId;
    
    // Generate hash for conflict detection (will be updated with messages later)
    // For now, use a simple hash of session metadata
    const messages = this.getMessages(session.id);
    const hash = generateSessionHash(session, messages);
    
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO sessions 
      (id, name, type, created_at, updated_at, last_updated, project_id, 
       is_project, is_favorite, persona_name, persona_work, persona_prefs, 
       tokens_used, metadata, deleted, device_id, synced_at, hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const createdAt = session.created_at ? Date.parse(session.created_at) : Date.now();
    const updatedAt = getCurrentTimestamp();
    
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
      }),
      0,           // deleted (not deleted)
      deviceId,    // device_id
      null,        // synced_at (null until synced)
      hash         // hash for conflict detection
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
      WHERE session_id = ? AND deleted = 0
      ORDER BY message_index ASC
    `).all(sessionId);
  }
  
  // UPSERT message (UPDATE if exists, INSERT if not)
  upsertMessage(sessionId, role, content, metadata, messageIndex) {
    // Use cached device ID (set once in constructor)
    const deviceId = this._cachedDeviceId;
    const now = getCurrentTimestamp();
    
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
       think_content, thinking_update, web_search_enabled, web_search_data, files, metadata,
       deleted, device_id, synced_at, sequence, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    return stmt.run(
      sessionId,
      role,
      content,
      messageIndex,
      now,
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
      JSON.stringify(metadata),
      0,            // deleted (not deleted)
      deviceId,     // device_id
      null,         // synced_at (null until synced)
      messageIndex, // sequence (same as message_index initially)
      now           // updated_at
    );
  }
  
  addMessage(sessionId, role, content, metadata, messageIndex) {
    // Use cached device ID (set once in constructor)
    const deviceId = this._cachedDeviceId;
    const now = getCurrentTimestamp();
    
    const stmt = this.db.prepare(`
      INSERT INTO messages 
      (session_id, role, content, message_index, created_at, 
       model_id, model_label, provider, base_url, think_mode, 
       think_content, thinking_update, web_search_enabled, web_search_data, files, metadata,
       deleted, device_id, synced_at, sequence, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    return stmt.run(
      sessionId,
      role,
      content,
      messageIndex,
      now,
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
      JSON.stringify(metadata),
      0,            // deleted (not deleted)
      deviceId,     // device_id
      null,         // synced_at (null until synced)
      messageIndex, // sequence (same as message_index initially)
      now           // updated_at
    );
  }
  
  deleteMessagesForSession(sessionId) {
    return this.db.prepare(`
      DELETE FROM messages WHERE session_id = ?
    `).run(sessionId);
  }
  
  getAllArtifacts() {
    const artifacts = this.db.prepare(`
      SELECT * FROM artifacts 
      ORDER BY created_at DESC
    `).all();

    return artifacts;
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
    
    const result = stmt.run(
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

    return result;
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
      (id, name, description, instruction, created_at, updated_at, is_favorite, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const createdAt = project.created_at ? Date.parse(project.created_at) : Date.now();
    const updatedAt = project.updated_at || project.last_updated ? Date.parse(project.updated_at || project.last_updated) : Date.now();
    const instruction = project.instruction || '';
    
    console.log('[DB] saveProject:', {
      id: project.id,
      name: project.name,
      instruction: instruction,
      instructionLength: instruction.length
    });
    
    return stmt.run(
      project.id,
      project.name,
      project.description || '',
      instruction,
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
  close() {
    this.db.close();
  }
}

module.exports = DatabaseManager;
