const Database = require('better-sqlite3');
const path = require('path');
const { logWithContext } = require('../../utils/logger');
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
    
    
    // Cache device ID once per DatabaseManager instance
    // This prevents thousands of repeated calls to getDeviceId()
    this._cachedDeviceId = getDeviceId(this.db);
    
    log('DATABASE', 1, 'constructor', 'Database initialized', { 
      path: dbPath,
      isCloudDatabase: this.isCloudDatabase,
      deviceId: this._cachedDeviceId
    });
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
        deleted INTEGER DEFAULT 0,
        device_id TEXT,
        synced_at INTEGER,
        hash TEXT,

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
        deleted INTEGER DEFAULT 0,
        device_id TEXT,
        synced_at INTEGER,
        sequence INTEGER,
        updated_at INTEGER,

        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, message_index);
      CREATE INDEX IF NOT EXISTS idx_messages_created_provider ON messages(created_at, provider);
      
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

      CREATE TABLE IF NOT EXISTS codes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        instruction TEXT,
        workspace_path TEXT,
        workspace_metadata TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        is_favorite INTEGER DEFAULT 0,
        metadata TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_codes_created ON codes(created_at DESC);

      CREATE TABLE IF NOT EXISTS code_iterations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        message_index INTEGER NOT NULL,
        iteration INTEGER NOT NULL,
        command TEXT,
        output TEXT,
        exit_code INTEGER,
        answer TEXT,
        hidden TEXT,
        summary TEXT,
        created_at INTEGER NOT NULL,

        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_code_iterations_session ON code_iterations(session_id, message_index, iteration);

      CREATE TABLE IF NOT EXISTS memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        memory_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        start_line INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        owner_type TEXT NOT NULL DEFAULT 'code'
      );

      CREATE INDEX IF NOT EXISTS idx_memory_session ON memory(session_id, owner_type, memory_name);

      CREATE TABLE IF NOT EXISTS edit_history (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        file_path TEXT NOT NULL,
        operation_type TEXT NOT NULL,
        range_start INTEGER,
        range_end INTEGER,
        before_content TEXT,
        after_content TEXT,
        diff TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_edit_history_session ON edit_history(session_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS conversation_summaries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        summary_text TEXT NOT NULL,
        summarized_until_index INTEGER NOT NULL,
        token_count INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_conversation_summaries_session ON conversation_summaries(session_id, created_at DESC);

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
    
    const ensureColumn = (table, column, definition) => {
      try {
        const columns = this.db.prepare(`PRAGMA table_info(${table})`).all();
        const hasColumn = columns.some(col => col.name === column);

        if (!hasColumn) {
          console.log(`[DATABASE] Adding ${column} column to ${table} table (migration)`);
          this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
          console.log(`[DATABASE] Successfully added ${column} column to ${table}`);
        }
      } catch (migrationError) {
        console.error(`[DATABASE] Failed adding ${column} to ${table}:`, migrationError.message);
      }
    };

    // CRITICAL: Add missing columns for legacy databases
    ensureColumn('projects', 'instruction', 'TEXT');

    ensureColumn('sessions', 'deleted', 'INTEGER DEFAULT 0');
    ensureColumn('sessions', 'device_id', 'TEXT');
    ensureColumn('sessions', 'synced_at', 'INTEGER');
    ensureColumn('sessions', 'hash', 'TEXT');
    ensureColumn('sessions', 'code_id', 'TEXT');

  ensureColumn('codes', 'instruction', 'TEXT');
  ensureColumn('codes', 'workspace_path', 'TEXT');
  ensureColumn('codes', 'workspace_metadata', 'TEXT');
  ensureColumn('codes', 'is_favorite', 'INTEGER DEFAULT 0');
  ensureColumn('codes', 'metadata', 'TEXT');

    ensureColumn('messages', 'deleted', 'INTEGER DEFAULT 0');
    ensureColumn('messages', 'device_id', 'TEXT');
    ensureColumn('messages', 'synced_at', 'INTEGER');
    ensureColumn('messages', 'sequence', 'INTEGER');
    ensureColumn('messages', 'updated_at', 'INTEGER');

    ensureColumn('memory', 'total_lines', 'INTEGER');

    this.migrateMemoryTable();
  }

  migrateMemoryTable() {
    try {
      const tableExists = this.db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'memory'`).get();
      if (!tableExists) {
        return;
      }

      const columns = this.db.prepare(`PRAGMA table_info(memory)`).all();
      const hasOwnerType = columns.some(col => col.name === 'owner_type');
      const foreignKeys = this.db.prepare(`PRAGMA foreign_key_list(memory)`).all();
      const referencesCodes = foreignKeys.some(fk => fk.table === 'codes');

      if (hasOwnerType && !referencesCodes) {
        return;
      }

      this.db.exec('BEGIN TRANSACTION;');
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS memory_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT NOT NULL,
          memory_name TEXT NOT NULL,
          file_path TEXT NOT NULL,
          start_line INTEGER NOT NULL,
          end_line INTEGER NOT NULL,
          content TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          owner_type TEXT NOT NULL DEFAULT 'code'
        );
      `);

      const ownerColumn = hasOwnerType ? 'owner_type' : "'code'";
      this.db.exec(`
        INSERT INTO memory_new (id, session_id, memory_name, file_path, start_line, end_line, content, created_at, updated_at, owner_type)
        SELECT id, session_id, memory_name, file_path, start_line, end_line, content, created_at, updated_at, ${ownerColumn}
        FROM memory;
      `);

      this.db.exec('DROP TABLE memory;');
      this.db.exec('ALTER TABLE memory_new RENAME TO memory;');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_memory_session ON memory(session_id, owner_type, memory_name);');
      this.db.exec('COMMIT;');
    } catch (error) {
      try {
        this.db.exec('ROLLBACK;');
      } catch (rollbackError) {
        console.error('[DATABASE] Failed to rollback memory migration:', rollbackError.message);
      }
      console.error('[DATABASE] Failed to migrate memory table:', error.message);
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
      INSERT INTO sessions 
      (id, name, type, created_at, updated_at, last_updated, project_id,
      code_id, is_project, is_favorite, persona_name, persona_work, persona_prefs,
      tokens_used, metadata, deleted, device_id, synced_at, hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        type = excluded.type,
        updated_at = excluded.updated_at,
        last_updated = excluded.last_updated,
        project_id = excluded.project_id,
        code_id = excluded.code_id,
        is_project = excluded.is_project,
        is_favorite = excluded.is_favorite,
        persona_name = excluded.persona_name,
        persona_work = excluded.persona_work,
        persona_prefs = excluded.persona_prefs,
        tokens_used = excluded.tokens_used,
        metadata = excluded.metadata,
        deleted = excluded.deleted,
        device_id = excluded.device_id,
        synced_at = excluded.synced_at,
        hash = excluded.hash
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
      session.codeId || null,
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
    
    // Check if message already exists and get its original created_at
    const existing = this.db.prepare(`
      SELECT created_at FROM messages 
      WHERE session_id = ? AND message_index = ?
    `).get(sessionId, messageIndex);
    
    // Preserve original created_at if message exists, otherwise use now
    const createdAt = existing ? existing.created_at : now;
    
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
      createdAt,    // PRESERVE original created_at!
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
  
  addMessage(sessionId, role, content, metadata, messageIndex, createdAt = null) {
    // Use cached device ID (set once in constructor)
    const deviceId = this._cachedDeviceId;
    const now = getCurrentTimestamp();
    
    // Use provided createdAt if exists, otherwise use now
    const messageCreatedAt = createdAt || now;
    
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
      messageCreatedAt,  // Use preserved or new timestamp
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
  
  getMessagesForSession(sessionId) {
    return this.db.prepare(`
      SELECT message_index, created_at FROM messages 
      WHERE session_id = ? 
      ORDER BY message_index ASC
    `).all(sessionId);
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
      INSERT INTO projects 
      (id, name, description, instruction, created_at, updated_at, is_favorite, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        description = excluded.description,
        instruction = excluded.instruction,
        updated_at = excluded.updated_at,
        is_favorite = excluded.is_favorite,
        metadata = excluded.metadata
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

  getAllCodes() {
    return this.db.prepare(`
      SELECT * FROM codes
      ORDER BY created_at DESC
    `).all();
  }

  getCode(codeId) {
    return this.db.prepare(`
      SELECT * FROM codes WHERE id = ?
    `).get(codeId);
  }

  saveCode(code) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO codes
      (id, name, description, instruction, workspace_path, workspace_metadata,
       created_at, updated_at, is_favorite, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const createdAt = code.created_at ? Date.parse(code.created_at) : Date.now();
    const updatedAt = code.updated_at || code.last_updated
      ? Date.parse(code.updated_at || code.last_updated)
      : Date.now();

    return stmt.run(
      code.id,
      code.name,
      code.description || '',
      code.instruction || '',
      code.workspacePath || '',
      JSON.stringify(code.workspaceMetadata || {}),
      createdAt,
      updatedAt,
      code.isFavorite ? 1 : 0,
      JSON.stringify(code.metadata || {})
    );
  }

  deleteCode(codeId) {
    // Delete associated sessions first to prevent orphaned data
    this.db.prepare(`
      DELETE FROM sessions WHERE code_id = ?
    `).run(codeId);

    // Then delete the code
    return this.db.prepare(`
      DELETE FROM codes WHERE id = ?
    `).run(codeId);
  }

  // Code iterations methods
  addCodeIteration(sessionId, messageIndex, iteration, data) {
    const stmt = this.db.prepare(`
      INSERT INTO code_iterations
      (session_id, message_index, iteration, command, output, exit_code, answer, hidden, summary, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    return stmt.run(
      sessionId,
      messageIndex,
      iteration,
      data.command || null,
      data.output || null,
      data.exitCode ?? null,
      data.answer || null,
      data.hidden || null,
      data.summary || null,
      Date.now()
    );
  }

  getCodeIterations(sessionId, messageIndex = null) {
    if (messageIndex !== null) {
      return this.db.prepare(`
        SELECT * FROM code_iterations
        WHERE session_id = ? AND message_index = ?
        ORDER BY iteration ASC
      `).all(sessionId, messageIndex);
    }

    return this.db.prepare(`
      SELECT * FROM code_iterations
      WHERE session_id = ?
      ORDER BY message_index ASC, iteration ASC
    `).all(sessionId);
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

  // Memory persistence methods
  saveMemory(sessionId, memoryName, filePath, startLine, endLine, content, ownerType = 'code', totalLines = null) {
    const normalizedType = ownerType === 'session' ? 'session' : 'code';
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO memory (session_id, memory_name, file_path, start_line, end_line, content, created_at, updated_at, owner_type, total_lines)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const now = Date.now();
    return stmt.run(sessionId, memoryName, filePath, startLine, endLine, JSON.stringify(content), now, now, normalizedType, totalLines);
  }

  getMemory(sessionId, memoryName = null, ownerType = 'code') {
    const normalizedType = ownerType === 'session' ? 'session' : 'code';
    let query, params;
    if (memoryName) {
      query = `SELECT * FROM memory WHERE session_id = ? AND owner_type = ? AND memory_name = ? ORDER BY file_path, start_line`;
      params = [sessionId, normalizedType, memoryName];
    } else {
      query = `SELECT * FROM memory WHERE session_id = ? AND owner_type = ? ORDER BY memory_name, file_path, start_line`;
      params = [sessionId, normalizedType];
    }

    const rows = this.db.prepare(query).all(...params);
    return rows.map(row => ({
      ...row,
      content: JSON.parse(row.content)
    }));
  }

  deleteMemory(sessionId, memoryName = null, ownerType = 'code') {
    const normalizedType = ownerType === 'session' ? 'session' : 'code';
    if (memoryName) {
      return this.db.prepare(`DELETE FROM memory WHERE session_id = ? AND owner_type = ? AND memory_name = ?`).run(sessionId, normalizedType, memoryName);
    } else {
      return this.db.prepare(`DELETE FROM memory WHERE session_id = ? AND owner_type = ?`).run(sessionId, normalizedType);
    }
  }

  clearAllMemory(sessionId, ownerType = 'code') {
    const normalizedType = ownerType === 'session' ? 'session' : 'code';
    return this.db.prepare(`DELETE FROM memory WHERE session_id = ? AND owner_type = ?`).run(sessionId, normalizedType);
  }

  // Edit history methods
  saveEditHistory(sessionId, editId, filePath, operationType, rangeStart, rangeEnd, beforeContent, afterContent, diff) {
    const stmt = this.db.prepare(`
      INSERT INTO edit_history (id, session_id, file_path, operation_type, range_start, range_end, before_content, after_content, diff, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(editId, sessionId, filePath, operationType, rangeStart, rangeEnd, beforeContent, afterContent, diff, Date.now());
  }

  getEditHistory(sessionId, limit = 20) {
    return this.db.prepare(`
      SELECT * FROM edit_history 
      WHERE session_id = ? 
      ORDER BY created_at DESC 
      LIMIT ?
    `).all(sessionId, limit);
  }

  getEditById(editId) {
    return this.db.prepare(`SELECT * FROM edit_history WHERE id = ?`).get(editId);
  }

  deleteEditHistory(editId) {
    return this.db.prepare(`DELETE FROM edit_history WHERE id = ?`).run(editId);
  }

  // Get all edits after a specific edit (for cascading undo)
  getEditsAfter(sessionId, editId) {
    const targetEdit = this.getEditById(editId);
    if (!targetEdit) return [];
    return this.db.prepare(`
      SELECT * FROM edit_history 
      WHERE session_id = ? AND created_at >= ?
      ORDER BY created_at DESC
    `).all(sessionId, targetEdit.created_at);
  }

  // Delete multiple edits by IDs
  deleteEditHistoryBatch(editIds) {
    if (!editIds || editIds.length === 0) return;
    const placeholders = editIds.map(() => '?').join(',');
    return this.db.prepare(`DELETE FROM edit_history WHERE id IN (${placeholders})`).run(...editIds);
  }

  clearEditHistory(sessionId) {
    return this.db.prepare(`DELETE FROM edit_history WHERE session_id = ?`).run(sessionId);
  }

  // Conversation summary methods
  saveConversationSummary(sessionId, summaryText, summarizedUntilIndex, tokenCount = 0) {
    const stmt = this.db.prepare(`
      INSERT INTO conversation_summaries (session_id, summary_text, summarized_until_index, token_count, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    return stmt.run(sessionId, summaryText, summarizedUntilIndex, tokenCount, Date.now());
  }

  getLatestSummary(sessionId) {
    return this.db.prepare(`
      SELECT * FROM conversation_summaries 
      WHERE session_id = ? 
      ORDER BY created_at DESC 
      LIMIT 1
    `).get(sessionId);
  }

  getAllSummaries(sessionId) {
    return this.db.prepare(`
      SELECT * FROM conversation_summaries 
      WHERE session_id = ? 
      ORDER BY created_at ASC
    `).all(sessionId);
  }

  deleteSummaries(sessionId) {
    return this.db.prepare(`DELETE FROM conversation_summaries WHERE session_id = ?`).run(sessionId);
  }

  // Migration: Add thinking_update column if it doesn't exist
  close() {
    this.db.close();
  }
}

module.exports = DatabaseManager;
