# AI Agent Instructions: SQLite Database Migration

**Project:** Clustrix AI Platform  
**Task:** Migrate JSON-based persistence to SQLite database  
**Priority:** CRITICAL - Performance & Data Integrity  
**Language:** English (all code and documentation)

---

## ⚠️ CRITICAL INSTRUCTIONS FOR AI AGENT

### Your Mission
You are tasked with migrating the Clustrix AI Platform from JSON file-based persistence to SQLite database. This is a **critical migration** that affects all user data. **Zero data loss is acceptable.**

### Working Principles

1. **STUDY FIRST, CODE LATER**
   - Spend as much time as needed studying the codebase
   - Understand data flow completely before making changes
   - Read ALL related files: main.js, renderer.js, preload.js, backend services
   - Map out all save/load operations
   - **NO REVISIONS ALLOWED** - Everything must be perfect on first attempt

2. **TESTING IS MANDATORY**
   - Write unit tests for database operations
   - Write integration tests for migration
   - Test with real-world data samples
   - Test error scenarios (corrupt data, disk full, etc.)
   - Test rollback mechanisms
   - **Do NOT proceed without passing tests**

3. **SAFETY FIRST**
   - Create backups before any migration
   - Implement dual-write mode (JSON + SQLite)
   - Verify data integrity at each step
   - Provide rollback mechanism
   - Never delete JSON files until migration is 100% verified

4. **PERFORMANCE VALIDATION**
   - Benchmark every operation
   - Ensure saves < 10ms average
   - Ensure loads < 50ms average
   - Monitor memory usage
   - Compare before/after metrics

---

## Current System Analysis

### Data Storage Overview

The application currently uses **4 JSON files** for persistence:

| File | Size | Frequency | Critical Issue |
|------|------|-----------|----------------|
| `chat_data.json` | 2-10MB | **10-50 saves/min** | Full rewrite every save |
| `artifacts.json` | 100KB-1MB | 5-10 saves/min | Full rewrite every save |
| `projects.json` | 1-20MB | 3-5 saves/min | Base64 files = huge |
| `ai-model.conf.json` | 5-10KB | 1-2 saves/hour | Minor issue |

### Critical Performance Problems

1. **Synchronous I/O Blocking**
   ```javascript
   // main.js:438 - BLOCKS EVENT LOOP
   fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), 'utf-8');
   ```
   - 50ms block on 2MB file
   - Main thread freezes during save
   - UI stutters visible to users

2. **Full File Rewrite on Every Change**
   - Add 1 message → Rewrite 2MB file
   - Edit session title → Rewrite 2MB file
   - Delete session → Rewrite 2MB file
   - **No incremental updates**

3. **Draft Autosave Storm**
   ```javascript
   // renderer.js:1991 - Fires 200+ times/minute
   timer = setTimeout(() => saveDraftForSession(sessionId, content), 300);
   ```
   - Triggers on every keystroke (300ms debounce)
   - localStorage writes block UI
   - Compounds with session saves

4. **No Data Integrity**
   - Crash during save = corrupt file
   - No transactions
   - No atomicity guarantees

### Key Files to Study

Before starting implementation, you MUST thoroughly read and understand:

#### Main Process (Data Layer)
- `main.js` lines 155-490: All IPC handlers for data persistence
- `preload.js` lines 1-70: IPC bridge API

#### Renderer Process (Application Layer)  
- `renderer.js` lines 10035-10246: `load()` and `save()` functions
- `renderer.js` lines 1943-1998: Draft management
- `renderer.js` lines 2142-2220: Artifacts management
- `renderer.js` lines 6303-6340: Projects management
- `renderer.js` lines 9520-9600: `addMessage()` function
- `renderer.js` lines 11490-11620: `send()` function
- `renderer.js` lines 11837-11880: `deleteSession()` function

#### Backend Services
- `backend/langchain-service.js` lines 1520-1600: Vector storage
- `backend/local-embedding-engine.js`: File-based embedding index

### Data Structure Analysis

#### Session Object Structure
```javascript
{
  id: "uuid-v4-string",
  name: "Session Title",
  type: "regular" | "project" | "markdown-test",
  created_at: "2025-10-08T10:30:00.000Z",  // ISO8601
  last_updated: "2025-10-08T10:35:00.000Z",
  messages: [
    ["user", "Hello", {}],
    ["ai", "Hi there!", { model: "glm-4.5-flash", ... }]
  ],
  projectId: "uuid-or-null",
  isProject: false,
  persona: { name: "", work: "", prefs: "" },
  tokens_used: 1234,
  tokens_by_message: {},
  canvases: {}
}
```

#### Artifact Object Structure
```javascript
{
  id: "uuid-v4-string",
  title: "Code Snippet Title",
  type: "code",
  language: "javascript",
  content: "const x = 1;",
  created_at: "2025-10-08T10:30:00.000Z",
  updated_at: "2025-10-08T10:35:00.000Z",
  isFavorite: false
}
```

#### Project Object Structure
```javascript
{
  id: "uuid-v4-string",
  name: "Project Name",
  description: "Project description",
  files: [
    {
      name: "document.pdf",
      type: "application/pdf",
      size: 2048000,
      content: "base64-encoded-string"  // ⚠️ HUGE OVERHEAD
    }
  ],
  created_at: "2025-10-08T10:30:00.000Z",
  updated_at: "2025-10-08T10:35:00.000Z",
  isFavorite: false
}
```

---

## Implementation Plan

### Phase 1: Infrastructure Setup (Day 1-2)

#### Step 1.1: Install SQLite Library
```bash
npm install better-sqlite3 --save
```

**Why better-sqlite3?**
- Synchronous API (simpler for Electron)
- Fastest performance (native C++)
- Active maintenance
- Perfect for desktop apps

#### Step 1.2: Create Database Manager

Create `backend/database-manager.js`:

```javascript
const Database = require('better-sqlite3');
const path = require('path');

class DatabaseManager {
  constructor(app) {
    const dbPath = path.join(app.getPath('userData'), 'clustrix.db');
    this.db = new Database(dbPath);
    
    // Enable WAL mode for better concurrency
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('foreign_keys = ON');
    
    this.initSchema();
  }
  
  initSchema() {
    // Create tables if they don't exist
    this.db.exec(`
      -- Sessions table
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
        
        -- Persona (denormalized)
        persona_name TEXT,
        persona_work TEXT,
        persona_prefs TEXT,
        
        -- Stats
        tokens_used INTEGER DEFAULT 0,
        
        -- Metadata (JSON)
        metadata TEXT,
        
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
      );
      
      CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_sessions_type ON sessions(type);
      CREATE INDEX IF NOT EXISTS idx_sessions_favorite ON sessions(is_favorite);
      
      -- Messages table
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        message_index INTEGER NOT NULL,
        
        -- Model info
        model_id TEXT,
        model_label TEXT,
        provider TEXT,
        base_url TEXT,
        
        -- Thinking mode
        think_mode TEXT,
        think_content TEXT,
        
        -- Web search
        web_search_enabled INTEGER DEFAULT 0,
        web_search_data TEXT,
        
        -- Files (JSON array)
        files TEXT,
        
        -- Metadata (JSON)
        metadata TEXT,
        
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );
      
      CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, message_index);
      
      -- Artifacts table
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
        metadata TEXT,
        
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL
      );
      
      CREATE INDEX IF NOT EXISTS idx_artifacts_created ON artifacts(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_artifacts_type ON artifacts(type);
      
      -- Projects table
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
      
      -- Project files table (CRITICAL for performance)
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
      
      -- Drafts table
      CREATE TABLE IF NOT EXISTS drafts (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      
      -- Settings table
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      
      -- Vector embeddings table
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
      
      -- Migration metadata
      CREATE TABLE IF NOT EXISTS migration_info (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );
    `);
  }
  
  // Session operations
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
  
  // Message operations
  getMessages(sessionId) {
    return this.db.prepare(`
      SELECT * FROM messages 
      WHERE session_id = ? 
      ORDER BY message_index ASC
    `).all(sessionId);
  }
  
  addMessage(sessionId, role, content, metadata, messageIndex) {
    const stmt = this.db.prepare(`
      INSERT INTO messages 
      (session_id, role, content, message_index, created_at, 
       model_id, model_label, provider, base_url, think_mode, 
       think_content, web_search_enabled, web_search_data, files, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      metadata.webSearchEnabled ? 1 : 0,
      metadata.webSearchData ? JSON.stringify(metadata.webSearchData) : null,
      metadata.files ? JSON.stringify(metadata.files) : null,
      JSON.stringify(metadata)
    );
  }
  
  // Transaction helper
  transaction(fn) {
    return this.db.transaction(fn)();
  }
  
  // Backup
  backup(destPath) {
    return this.db.backup(destPath);
  }
  
  close() {
    this.db.close();
  }
}

module.exports = DatabaseManager;
```

#### Step 1.3: Create Migration Tool

Create `backend/json-to-sqlite-migrator.js`:

```javascript
const fs = require('fs');
const path = require('path');
const { log } = require('../utils/logger');

class JSONToSQLiteMigrator {
  constructor(app, databaseManager) {
    this.app = app;
    this.db = databaseManager;
    this.userDataPath = app.getPath('userData');
  }
  
  async migrate() {
    log('MIGRATION', 1, 'start', 'Starting JSON to SQLite migration');
    
    try {
      // Backup JSON files first
      await this.backupJSON();
      
      // Migrate each data type
      await this.migrateSessions();
      await this.migrateArtifacts();
      await this.migrateProjects();
      await this.migrateSettings();
      
      // Verify migration
      const verified = await this.verifyMigration();
      
      if (verified) {
        // Mark migration as complete
        this.db.db.prepare(`
          INSERT OR REPLACE INTO migration_info (key, value, timestamp)
          VALUES (?, ?, ?)
        `).run('migration_complete', 'true', Date.now());
        
        log('MIGRATION', 1, 'complete', 'Migration completed successfully');
        return { success: true };
      } else {
        throw new Error('Migration verification failed');
      }
    } catch (error) {
      log('MIGRATION', 4, 'error', 'Migration failed', { error: error.message });
      await this.rollback();
      return { success: false, error: error.message };
    }
  }
  
  async backupJSON() {
    const backupDir = path.join(this.userDataPath, 'json_backup');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir);
    }
    
    const files = [
      'chat_data.json',
      'artifacts.json',
      'projects.json',
      'ai-model.conf.json'
    ];
    
    for (const file of files) {
      const srcPath = path.join(this.userDataPath, file);
      if (fs.existsSync(srcPath)) {
        const destPath = path.join(backupDir, file);
        fs.copyFileSync(srcPath, destPath);
        log('MIGRATION', 2, 'backup', `Backed up ${file}`);
      }
    }
  }
  
  async migrateSessions() {
    const dataFile = path.join(this.userDataPath, 'chat_data.json');
    if (!fs.existsSync(dataFile)) {
      log('MIGRATION', 2, 'migrateSessions', 'No sessions file found, skipping');
      return;
    }
    
    const rawData = fs.readFileSync(dataFile, 'utf-8');
    const data = JSON.parse(rawData);
    const sessions = data.sessions || [];
    
    log('MIGRATION', 1, 'migrateSessions', `Migrating ${sessions.length} sessions`);
    
    this.db.transaction(() => {
      for (const session of sessions) {
        // Save session
        this.db.saveSession(session);
        
        // Save messages
        if (session.messages && Array.isArray(session.messages)) {
          for (let i = 0; i < session.messages.length; i++) {
            const [role, content, metadata = {}] = session.messages[i];
            this.db.addMessage(session.id, role, content, metadata, i);
          }
        }
      }
    })();
    
    log('MIGRATION', 1, 'migrateSessions', 'Sessions migrated successfully');
  }
  
  async migrateArtifacts() {
    const artifactsFile = path.join(this.userDataPath, 'artifacts.json');
    if (!fs.existsSync(artifactsFile)) {
      log('MIGRATION', 2, 'migrateArtifacts', 'No artifacts file found, skipping');
      return;
    }
    
    const rawData = fs.readFileSync(artifactsFile, 'utf-8');
    const artifacts = JSON.parse(rawData);
    
    log('MIGRATION', 1, 'migrateArtifacts', `Migrating ${artifacts.length} artifacts`);
    
    const stmt = this.db.db.prepare(`
      INSERT OR REPLACE INTO artifacts 
      (id, title, type, language, content, created_at, updated_at, is_favorite, session_id, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    this.db.transaction(() => {
      for (const artifact of artifacts) {
        stmt.run(
          artifact.id,
          artifact.title,
          artifact.type,
          artifact.language || null,
          artifact.content,
          Date.parse(artifact.created_at),
          Date.parse(artifact.updated_at),
          artifact.isFavorite ? 1 : 0,
          artifact.sessionId || null,
          JSON.stringify({})
        );
      }
    })();
    
    log('MIGRATION', 1, 'migrateArtifacts', 'Artifacts migrated successfully');
  }
  
  async migrateProjects() {
    const projectsFile = path.join(this.userDataPath, 'projects.json');
    if (!fs.existsSync(projectsFile)) {
      log('MIGRATION', 2, 'migrateProjects', 'No projects file found, skipping');
      return;
    }
    
    const rawData = fs.readFileSync(projectsFile, 'utf-8');
    const projects = JSON.parse(rawData);
    
    log('MIGRATION', 1, 'migrateProjects', `Migrating ${projects.length} projects`);
    
    const projectStmt = this.db.db.prepare(`
      INSERT OR REPLACE INTO projects 
      (id, name, description, created_at, updated_at, is_favorite, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    const fileStmt = this.db.db.prepare(`
      INSERT INTO project_files 
      (project_id, name, type, size, content, created_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    this.db.transaction(() => {
      for (const project of projects) {
        // Save project
        projectStmt.run(
          project.id,
          project.name,
          project.description || '',
          Date.parse(project.created_at),
          Date.parse(project.updated_at),
          project.isFavorite ? 1 : 0,
          JSON.stringify({})
        );
        
        // Save project files (decode base64 to binary)
        if (project.files && Array.isArray(project.files)) {
          for (const file of project.files) {
            const binaryContent = Buffer.from(file.content, 'base64');
            fileStmt.run(
              project.id,
              file.name,
              file.type,
              binaryContent.length,
              binaryContent,
              Date.now(),
              JSON.stringify({})
            );
          }
        }
      }
    })();
    
    log('MIGRATION', 1, 'migrateProjects', 'Projects migrated successfully');
  }
  
  async migrateSettings() {
    // Settings are stored in session data
    const dataFile = path.join(this.userDataPath, 'chat_data.json');
    if (!fs.existsSync(dataFile)) return;
    
    const rawData = fs.readFileSync(dataFile, 'utf-8');
    const data = JSON.parse(rawData);
    const settings = data.settings || {};
    
    const stmt = this.db.db.prepare(`
      INSERT OR REPLACE INTO settings (key, value, updated_at)
      VALUES (?, ?, ?)
    `);
    
    this.db.transaction(() => {
      for (const [key, value] of Object.entries(settings)) {
        stmt.run(key, JSON.stringify(value), Date.now());
      }
    })();
    
    log('MIGRATION', 1, 'migrateSettings', 'Settings migrated successfully');
  }
  
  async verifyMigration() {
    // Verify session count
    const jsonSessions = this.getJSONSessionCount();
    const dbSessions = this.db.getAllSessions().length;
    
    if (jsonSessions !== dbSessions) {
      log('MIGRATION', 4, 'verify', 'Session count mismatch', { jsonSessions, dbSessions });
      return false;
    }
    
    // Verify message count for first session
    const sessions = this.db.getAllSessions();
    if (sessions.length > 0) {
      const firstSession = sessions[0];
      const dbMessages = this.db.getMessages(firstSession.id).length;
      
      // Compare with JSON
      const jsonData = this.loadJSONData();
      const jsonSession = jsonData.sessions.find(s => s.id === firstSession.id);
      const jsonMessages = jsonSession ? jsonSession.messages.length : 0;
      
      if (dbMessages !== jsonMessages) {
        log('MIGRATION', 4, 'verify', 'Message count mismatch', { dbMessages, jsonMessages });
        return false;
      }
    }
    
    log('MIGRATION', 1, 'verify', 'Migration verification passed');
    return true;
  }
  
  getJSONSessionCount() {
    const dataFile = path.join(this.userDataPath, 'chat_data.json');
    if (!fs.existsSync(dataFile)) return 0;
    const data = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
    return data.sessions ? data.sessions.length : 0;
  }
  
  loadJSONData() {
    const dataFile = path.join(this.userDataPath, 'chat_data.json');
    if (!fs.existsSync(dataFile)) return { sessions: [] };
    return JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
  }
  
  async rollback() {
    log('MIGRATION', 3, 'rollback', 'Rolling back migration');
    // SQLite file can be deleted, JSON backups remain
  }
}

module.exports = JSONToSQLiteMigrator;
```

#### Step 1.4: Write Tests

Create `backend/__tests__/database-manager.test.js`:

```javascript
const DatabaseManager = require('../database-manager');
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

describe('DatabaseManager', () => {
  let db;
  
  beforeEach(() => {
    // Use in-memory database for tests
    db = new DatabaseManager({ getPath: () => ':memory:' });
  });
  
  afterEach(() => {
    if (db) db.close();
  });
  
  test('should create tables on initialization', () => {
    const tables = db.db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table'
    `).all();
    
    const tableNames = tables.map(t => t.name);
    expect(tableNames).toContain('sessions');
    expect(tableNames).toContain('messages');
    expect(tableNames).toContain('artifacts');
    expect(tableNames).toContain('projects');
  });
  
  test('should save and retrieve session', () => {
    const session = {
      id: 'test-session-1',
      name: 'Test Session',
      type: 'regular',
      created_at: new Date().toISOString(),
      last_updated: new Date().toISOString(),
      messages: []
    };
    
    db.saveSession(session);
    const retrieved = db.getSession('test-session-1');
    
    expect(retrieved).toBeDefined();
    expect(retrieved.name).toBe('Test Session');
  });
  
  test('should save and retrieve messages in order', () => {
    const sessionId = 'test-session-2';
    db.saveSession({ id: sessionId, name: 'Test', created_at: new Date().toISOString(), last_updated: new Date().toISOString() });
    
    db.addMessage(sessionId, 'user', 'Hello', {}, 0);
    db.addMessage(sessionId, 'ai', 'Hi there', {}, 1);
    db.addMessage(sessionId, 'user', 'How are you?', {}, 2);
    
    const messages = db.getMessages(sessionId);
    
    expect(messages).toHaveLength(3);
    expect(messages[0].content).toBe('Hello');
    expect(messages[1].content).toBe('Hi there');
    expect(messages[2].content).toBe('How are you?');
  });
  
  test('should cascade delete messages when session deleted', () => {
    const sessionId = 'test-session-3';
    db.saveSession({ id: sessionId, name: 'Test', created_at: new Date().toISOString(), last_updated: new Date().toISOString() });
    db.addMessage(sessionId, 'user', 'Hello', {}, 0);
    
    db.deleteSession(sessionId);
    
    const messages = db.getMessages(sessionId);
    expect(messages).toHaveLength(0);
  });
  
  test('should handle transactions correctly', () => {
    const result = db.transaction(() => {
      db.saveSession({ id: 'tx-1', name: 'TX Test 1', created_at: new Date().toISOString(), last_updated: new Date().toISOString() });
      db.saveSession({ id: 'tx-2', name: 'TX Test 2', created_at: new Date().toISOString(), last_updated: new Date().toISOString() });
      return true;
    });
    
    expect(result).toBe(true);
    expect(db.getAllSessions()).toHaveLength(2);
  });
});
```

---

### Phase 2: Integration with Main Process (Day 3-4)

#### Step 2.1: Modify main.js

Add database initialization:

```javascript
// At the top of main.js
const DatabaseManager = require('./backend/database-manager');
const JSONToSQLiteMigrator = require('./backend/json-to-sqlite-migrator');

let db = null;
let useSQLite = false;

app.whenReady().then(() => {
  // ... existing initialization
  
  // Check if migration needed
  const dbPath = path.join(app.getPath('userData'), 'clustrix.db');
  const dbExists = fs.existsSync(dbPath);
  
  if (dbExists) {
    // Use SQLite
    db = new DatabaseManager(app);
    useSQLite = true;
    log('DATABASE', 1, 'init', 'Using SQLite database');
  } else {
    // Check if JSON files exist
    const jsonPath = path.join(app.getPath('userData'), 'chat_data.json');
    if (fs.existsSync(jsonPath)) {
      // Prompt user for migration
      log('DATABASE', 2, 'init', 'JSON files detected, migration needed');
      // Auto-migrate on first run
      db = new DatabaseManager(app);
      const migrator = new JSONToSQLiteMigrator(app, db);
      migrator.migrate().then(result => {
        if (result.success) {
          useSQLite = true;
          log('DATABASE', 1, 'migration', 'Migration completed successfully');
        } else {
          log('DATABASE', 4, 'migration', 'Migration failed', { error: result.error });
          app.quit();
        }
      });
    }
  }
  
  // ... rest of initialization
});
```

#### Step 2.2: Update IPC Handlers

Replace sessions:load handler:

```javascript
ipcMain.handle('sessions:load', async () => {
  try {
    if (useSQLite && db) {
      // Load from SQLite
      const sessions = db.getAllSessions();
      
      // Transform to match UI structure
      const transformed = sessions.map(session => {
        const messages = db.getMessages(session.id);
        
        // Parse metadata
        const metadata = JSON.parse(session.metadata || '{}');
        
        return {
          id: session.id,
          name: session.name,
          type: session.type,
          created_at: session.last_updated,
          last_updated: session.last_updated,
          projectId: session.project_id,
          isProject: session.is_project === 1,
          isFavorite: session.is_favorite === 1,
          persona: {
            name: session.persona_name || '',
            work: session.persona_work || '',
            prefs: session.persona_prefs || ''
          },
          tokens_used: session.tokens_used || 0,
          tokens_by_message: metadata.tokens_by_message || {},
          canvases: metadata.canvases || {},
          messages: messages.map(m => {
            const msgMetadata = JSON.parse(m.metadata || '{}');
            return [
              m.role,
              m.content,
              {
                model: m.model_id,
                modelLabel: m.model_label,
                provider: m.provider,
                baseUrl: m.base_url,
                thinkMode: m.think_mode,
                ...msgMetadata
              }
            ];
          })
        };
      });
      
      // Load settings
      const settingsRows = db.db.prepare('SELECT key, value FROM settings').all();
      const settings = {};
      for (const row of settingsRows) {
        settings[row.key] = JSON.parse(row.value);
      }
      
      return { sessions: transformed, settings };
    } else {
      // Fallback to JSON
      if (!fs.existsSync(dataFile)) {
        app.quit();
        return;
      }
      const raw = fs.readFileSync(dataFile, 'utf-8');
      const parsed = JSON.parse(raw);
      return parsed;
    }
  } catch (e) {
    log('sessions:load error', e);
    app.quit();
  }
});
```

Replace sessions:save handler:

```javascript
ipcMain.handle('sessions:save', async (_evt, data) => {
  try {
    if (useSQLite && db) {
      // Save to SQLite
      return db.transaction(() => {
        // Save each session
        for (const session of data.sessions) {
          db.saveSession(session);
          
          // Only save new messages (optimization)
          if (session._newMessages) {
            for (const [index, msg] of session._newMessages) {
              const [role, content, metadata = {}] = msg;
              db.addMessage(session.id, role, content, metadata, index);
            }
            delete session._newMessages;
          }
        }
        
        // Save settings
        if (data.settings) {
          const stmt = db.db.prepare(`
            INSERT OR REPLACE INTO settings (key, value, updated_at)
            VALUES (?, ?, ?)
          `);
          for (const [key, value] of Object.entries(data.settings)) {
            stmt.run(key, JSON.stringify(value), Date.now());
          }
        }
        
        return true;
      });
    } else {
      // Fallback to JSON
      fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), 'utf-8');
      return true;
    }
  } catch(e) {
    log('sessions:save error', e);
    return false;
  }
});
```

Similar updates for artifacts, projects handlers.

---

### Phase 3: Renderer Adaptations (Day 5)

#### Step 3.1: Track New Messages

Modify `addMessage()` function in renderer.js:

```javascript
function addMessage(role, content, { final = false, index = -1, metadata = {}, skipContainer = false } = {}) {
  // ... existing code ...
  
  // Mark message as new for incremental save
  if (current && current.id) {
    if (!current._newMessages) {
      current._newMessages = [];
    }
    current._newMessages.push([index >= 0 ? index : current.messages.length, [role, content, metadata]]);
  }
  
  // ... rest of existing code ...
}
```

#### Step 3.2: Debounce Save Operations

Add debounce utility:

```javascript
// renderer.js - Add this helper
function debounce(fn, delay) {
  let timer = null;
  const debounced = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
  debounced.cancel = () => clearTimeout(timer);
  return debounced;
}

// Wrap save function
const debouncedSave = debounce(async () => {
  await save();
}, 500);

// Replace direct save() calls with debouncedSave() where appropriate
```

#### Step 3.3: Optimize Draft Saves

Increase draft debounce:

```javascript
// renderer.js:1991 - Change from 300ms to 1000ms
timer = setTimeout(() => saveDraftForSession(sessionId, content), 1000);
```

---

### Phase 4: Testing & Validation (Day 6-7)

#### Step 4.1: Unit Tests

Run all unit tests:

```bash
npm test
```

Ensure 100% pass rate.

#### Step 4.2: Integration Tests

Create test scenarios:

1. **Create Session Test**
   - Create new session
   - Verify in database
   - Restart app
   - Verify session persists

2. **Send Message Test**
   - Send 10 messages
   - Verify all saved
   - Check message order
   - Verify content integrity

3. **Delete Session Test**
   - Delete session
   - Verify CASCADE delete of messages
   - Verify artifacts remain (if linked)

4. **Migration Test**
   - Start with JSON files
   - Run migration
   - Verify all data migrated
   - Compare JSON vs SQLite data

#### Step 4.3: Performance Benchmarks

Measure and compare:

| Operation | Before (JSON) | After (SQLite) | Target |
|-----------|---------------|----------------|--------|
| Add message | 50ms | ? | < 10ms |
| Load session | 50ms | ? | < 20ms |
| Delete session | 50ms | ? | < 10ms |
| Save all | 100ms | ? | < 50ms |

Use this benchmark script:

```javascript
// benchmark.js
async function benchmarkSave() {
  const iterations = 100;
  const times = [];
  
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await window.api.sessions.save(sampleData);
    const end = performance.now();
    times.push(end - start);
  }
  
  const avg = times.reduce((a, b) => a + b) / times.length;
  const p95 = times.sort()[Math.floor(times.length * 0.95)];
  
  console.log(`Average: ${avg.toFixed(2)}ms`);
  console.log(`95th percentile: ${p95.toFixed(2)}ms`);
}
```

---

### Phase 5: Rollout (Day 8-14)

#### Step 5.1: Beta Testing (Week 2)

1. Create beta build with SQLite enabled
2. Distribute to 5-10 internal testers
3. Monitor logs for errors
4. Collect performance metrics
5. Fix any issues

#### Step 5.2: Staged Rollout (Week 3)

1. 10% of users
2. Monitor for 2 days
3. If stable, 50% of users
4. Monitor for 2 days
5. If stable, 100% rollout

#### Step 5.3: Post-Rollout Monitoring

Track these metrics:

- Error rate (target: < 0.1%)
- Save duration (target: < 10ms avg)
- User complaints (target: 0)
- Data loss incidents (target: 0)

---

## Critical Implementation Checklist

Before you start coding, ensure you understand:

- [ ] How sessions are currently saved (main.js:437-444)
- [ ] How messages are added (renderer.js:9520-9600)
- [ ] How projects store files (base64 in JSON)
- [ ] How draft autosave works (renderer.js:1987-1998)
- [ ] How cache invalidation works (renderer.js:invalidateSessionCache)
- [ ] What happens on app startup (renderer.js:10035-10090)
- [ ] How IPC bridge works (preload.js)
- [ ] What data structures are used (study sample JSON files)

During implementation:

- [ ] Write unit tests BEFORE implementation
- [ ] Test migration with real user data (ask for samples)
- [ ] Verify data integrity after each operation
- [ ] Benchmark every operation
- [ ] Create rollback mechanism
- [ ] Document all changes
- [ ] Test on Windows (target platform)
- [ ] Test with 1000+ sessions
- [ ] Test with large projects (10MB+)
- [ ] Test error scenarios (corrupt data, disk full, etc.)

After implementation:

- [ ] All tests pass
- [ ] Performance targets met
- [ ] No data loss in any scenario
- [ ] Rollback mechanism works
- [ ] Documentation updated
- [ ] Beta testing completed
- [ ] User feedback collected

---

## Success Criteria

The migration is successful if:

1. ✅ **Zero data loss** - Every session, message, artifact, project migrated correctly
2. ✅ **Performance improved** - Saves < 10ms, loads < 50ms
3. ✅ **No UI regression** - Everything works exactly as before
4. ✅ **Rollback available** - Can export to JSON and use old version
5. ✅ **Tests pass** - 100% test coverage, all green
6. ✅ **Stable** - No crashes, no errors in logs
7. ✅ **User satisfaction** - No complaints, positive feedback

---

## Emergency Procedures

### If Migration Fails

1. Stop immediately
2. Do NOT delete JSON files
3. Restore from backup
4. Analyze error logs
5. Fix issue
6. Test again with small dataset
7. Only proceed when 100% confident

### If Data Loss Detected

1. Immediately rollback
2. Notify users
3. Restore from JSON backup
4. Investigate root cause
5. Fix and test thoroughly
6. Do NOT rollback until verified

### If Performance Worse

1. Profile operations (find bottleneck)
2. Check indexes (may be missing)
3. Verify WAL mode enabled
4. Check query optimization
5. Compare with JSON baseline
6. Optimize until targets met

---

## Important Notes

1. **DO NOT DELETE JSON FILES** until migration is 100% verified and stable for 2+ weeks
2. **ALWAYS BACKUP** before any migration operation
3. **TEST WITH REAL DATA** - synthetic data misses edge cases
4. **MONITOR CLOSELY** - watch logs, error rates, performance metrics
5. **BE READY TO ROLLBACK** - have procedure documented and tested

---

## Questions to Answer Before Starting

1. Do you understand the current data flow completely?
2. Have you studied all save/load operations?
3. Do you know what data structures are used?
4. Have you written tests for all operations?
5. Do you have backup of user data?
6. Do you have rollback procedure ready?
7. Have you benchmarked current performance?
8. Do you know success criteria?

If answer to ANY question is NO, **DO NOT START**. Study more.

---

## Final Reminder

**This is a critical migration affecting all user data. Take your time. Study thoroughly. Test extensively. There is NO ROOM for mistakes.**

**Use as much time as needed to understand the codebase completely. No revisions allowed - everything must be perfect on first attempt.**

**When in doubt, ask for clarification. Better to delay than to cause data loss.**

---

## Contact

If you encounter any issues or need clarification, provide detailed logs and context.

Good luck! 🚀
