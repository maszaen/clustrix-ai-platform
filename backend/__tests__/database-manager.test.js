const DatabaseManager = require('../database-manager');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

describe('DatabaseManager', () => {
  let db;
  
  beforeEach(() => {
    db = new DatabaseManager({
      getPath: () => ':memory:'
    });
  });
  
  afterEach(() => {
    if (db) db.close();
  });
  
  describe('Schema Initialization', () => {
    test('should create all required tables', () => {
      const tables = db.db.prepare(`
        SELECT name FROM sqlite_master WHERE type='table'
      `).all();
      
      const tableNames = tables.map(t => t.name);
      expect(tableNames).toContain('sessions');
      expect(tableNames).toContain('messages');
      expect(tableNames).toContain('artifacts');
      expect(tableNames).toContain('projects');
      expect(tableNames).toContain('project_files');
      expect(tableNames).toContain('drafts');
      expect(tableNames).toContain('settings');
      expect(tableNames).toContain('migration_info');
    });
    
    test('should enable WAL mode (or memory for :memory: databases)', () => {
      const result = db.db.pragma('journal_mode', { simple: true });
      expect(['wal', 'memory']).toContain(result);
    });
    
    test('should enable foreign keys', () => {
      const result = db.db.pragma('foreign_keys', { simple: true });
      expect(result).toBe(1);
    });
  });
  
  describe('Session Operations', () => {
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
      expect(retrieved.type).toBe('regular');
    });
    
    test('should retrieve all sessions in descending order', () => {
      const now = Date.now();
      db.saveSession({ 
        id: 'session-1', 
        name: 'First', 
        created_at: new Date(now - 2000).toISOString(),
        last_updated: new Date(now - 2000).toISOString()
      });
      db.saveSession({ 
        id: 'session-2', 
        name: 'Second', 
        created_at: new Date(now - 1000).toISOString(),
        last_updated: new Date(now - 1000).toISOString()
      });
      db.saveSession({ 
        id: 'session-3', 
        name: 'Third', 
        created_at: new Date(now).toISOString(),
        last_updated: new Date(now).toISOString()
      });
      
      const sessions = db.getAllSessions();
      
      expect(sessions).toHaveLength(3);
      expect(sessions[0].name).toBe('Third');
      expect(sessions[1].name).toBe('Second');
      expect(sessions[2].name).toBe('First');
    });
    
    test('should delete session', () => {
      const session = {
        id: 'test-delete',
        name: 'Delete Me',
        created_at: new Date().toISOString(),
        last_updated: new Date().toISOString()
      };
      
      db.saveSession(session);
      expect(db.getSession('test-delete')).toBeDefined();
      
      db.deleteSession('test-delete');
      expect(db.getSession('test-delete')).toBeUndefined();
    });
    
    test('should save session with persona', () => {
      const session = {
        id: 'persona-test',
        name: 'Persona Test',
        created_at: new Date().toISOString(),
        last_updated: new Date().toISOString(),
        persona: {
          name: 'Assistant',
          work: 'Help user',
          prefs: 'Be friendly'
        }
      };
      
      db.saveSession(session);
      const retrieved = db.getSession('persona-test');
      
      expect(retrieved.persona_name).toBe('Assistant');
      expect(retrieved.persona_work).toBe('Help user');
      expect(retrieved.persona_prefs).toBe('Be friendly');
    });
  });
  
  describe('Message Operations', () => {
    beforeEach(() => {
      db.saveSession({ 
        id: 'msg-session', 
        name: 'Message Test', 
        created_at: new Date().toISOString(),
        last_updated: new Date().toISOString()
      });
    });
    
    test('should save and retrieve messages in order', () => {
      db.addMessage('msg-session', 'user', 'Hello', {}, 0);
      db.addMessage('msg-session', 'ai', 'Hi there', {}, 1);
      db.addMessage('msg-session', 'user', 'How are you?', {}, 2);
      
      const messages = db.getMessages('msg-session');
      
      expect(messages).toHaveLength(3);
      expect(messages[0].content).toBe('Hello');
      expect(messages[0].role).toBe('user');
      expect(messages[1].content).toBe('Hi there');
      expect(messages[1].role).toBe('ai');
      expect(messages[2].content).toBe('How are you?');
    });
    
    test('should save message with metadata', () => {
      db.addMessage('msg-session', 'ai', 'Response', {
        model: 'gpt-4',
        modelLabel: 'GPT-4',
        provider: 'openai',
        thinkMode: 'extended'
      }, 0);
      
      const messages = db.getMessages('msg-session');
      
      expect(messages[0].model_id).toBe('gpt-4');
      expect(messages[0].model_label).toBe('GPT-4');
      expect(messages[0].provider).toBe('openai');
      expect(messages[0].think_mode).toBe('extended');
    });
    
    test('should upsert message correctly', () => {
      // Add initial message
      db.addMessage('msg-session', 'user', 'Hello', {}, 0);
      
      // Upsert the same message index with different content
      db.upsertMessage('msg-session', 'user', 'Hello World', { model: 'gpt-4' }, 0);
      
      const messages = db.getMessages('msg-session');
      
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe('Hello World');
      expect(messages[0].model_id).toBe('gpt-4');
    });
    
    test('should handle thinkContent serialization correctly', () => {
      const thinkContent = { text: 'Thinking...', duration: 1000 };
      
      db.addMessage('msg-session', 'ai', 'Response', {
        thinkMode: 'extended',
        thinkContent: thinkContent
      }, 0);
      
      const messages = db.getMessages('msg-session');
      
      expect(messages[0].think_mode).toBe('extended');
      expect(JSON.parse(messages[0].think_content)).toEqual(thinkContent);
    });
    
    test('should upsert message with thinkContent', () => {
      const thinkContent = { text: 'Updated thinking', duration: 2000 };
      
      db.upsertMessage('msg-session', 'ai', 'Updated response', {
        thinkMode: 'extended',
        thinkContent: thinkContent
      }, 0);
      
      const messages = db.getMessages('msg-session');
      
      expect(messages[0].think_mode).toBe('extended');
      expect(JSON.parse(messages[0].think_content)).toEqual(thinkContent);
    });
  });
  
  describe('Artifact Operations', () => {
    test('should save and retrieve artifact', () => {
      const artifact = {
        id: 'art-1',
        title: 'Test Code',
        type: 'code',
        language: 'javascript',
        code: 'console.log("test");',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        isFavorite: false
      };
      
      db.saveArtifact(artifact);
      const retrieved = db.getArtifact('art-1');
      
      expect(retrieved).toBeDefined();
      expect(retrieved.title).toBe('Test Code');
      expect(retrieved.language).toBe('javascript');
    });
    
    test('should retrieve all artifacts', () => {
      db.saveArtifact({
        id: 'art-1',
        title: 'First',
        type: 'code',
        code: 'test1',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      db.saveArtifact({
        id: 'art-2',
        title: 'Second',
        type: 'code',
        code: 'test2',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      
      const artifacts = db.getAllArtifacts();
      
      expect(artifacts).toHaveLength(2);
    });
    
    test('should delete artifact', () => {
      db.saveArtifact({
        id: 'art-delete',
        title: 'Delete Me',
        type: 'code',
        code: 'test',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      
      expect(db.getArtifact('art-delete')).toBeDefined();
      
      db.deleteArtifact('art-delete');
      
      expect(db.getArtifact('art-delete')).toBeUndefined();
    });
  });
  
  describe('Project Operations', () => {
    test('should save and retrieve project', () => {
      const project = {
        id: 'proj-1',
        name: 'Test Project',
        description: 'A test project',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        isFavorite: false
      };
      
      db.saveProject(project);
      const retrieved = db.getProject('proj-1');
      
      expect(retrieved).toBeDefined();
      expect(retrieved.name).toBe('Test Project');
      expect(retrieved.description).toBe('A test project');
    });
    
    test('should save and retrieve project files', () => {
      db.saveProject({
        id: 'proj-files',
        name: 'Project with Files',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      
      const fileContent = Buffer.from('Test file content');
      db.saveProjectFile('proj-files', {
        name: 'test.txt',
        type: 'text/plain',
        content: fileContent
      });
      
      const files = db.getProjectFiles('proj-files');
      
      expect(files).toHaveLength(1);
      expect(files[0].name).toBe('test.txt');
      expect(files[0].type).toBe('text/plain');
      expect(Buffer.from(files[0].content).toString()).toBe('Test file content');
    });
    
    test('should convert base64 to binary for project files', () => {
      db.saveProject({
        id: 'proj-base64',
        name: 'Base64 Test',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      
      const base64Content = Buffer.from('Hello World').toString('base64');
      db.saveProjectFile('proj-base64', {
        name: 'test.txt',
        type: 'text/plain',
        content: base64Content
      });
      
      const files = db.getProjectFiles('proj-base64');
      
      expect(Buffer.from(files[0].content).toString()).toBe('Hello World');
    });
    
    test('should cascade delete project files when project deleted', () => {
      db.saveProject({
        id: 'proj-cascade',
        name: 'Cascade Test',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      
      db.saveProjectFile('proj-cascade', {
        name: 'file1.txt',
        type: 'text/plain',
        content: Buffer.from('test')
      });
      
      expect(db.getProjectFiles('proj-cascade')).toHaveLength(1);
      
      db.deleteProject('proj-cascade');
      
      expect(db.getProjectFiles('proj-cascade')).toHaveLength(0);
    });
  });
  
  describe('Settings Operations', () => {
    test('should save and retrieve setting', () => {
      db.saveSetting('theme', 'dark');
      const retrieved = db.getSetting('theme');
      
      expect(retrieved).toBe('dark');
    });
    
    test('should retrieve all settings', () => {
      db.saveSetting('theme', 'dark');
      db.saveSetting('language', 'en');
      db.saveSetting('notifications', true);
      
      const settings = db.getAllSettings();
      
      expect(settings.theme).toBe('dark');
      expect(settings.language).toBe('en');
      expect(settings.notifications).toBe(true);
    });
    
    test('should handle complex setting values', () => {
      const complexValue = {
        nested: {
          key: 'value',
          array: [1, 2, 3]
        }
      };
      
      db.saveSetting('complex', complexValue);
      const retrieved = db.getSetting('complex');
      
      expect(retrieved).toEqual(complexValue);
    });
  });
  
  describe('Transaction Operations', () => {
    test('should execute transaction successfully', () => {
      const result = db.transaction(() => {
        db.saveSession({ 
          id: 'tx-1', 
          name: 'TX Test 1', 
          created_at: new Date().toISOString(),
          last_updated: new Date().toISOString()
        });
        db.saveSession({ 
          id: 'tx-2', 
          name: 'TX Test 2', 
          created_at: new Date().toISOString(),
          last_updated: new Date().toISOString()
        });
        return true;
      });
      
      expect(result).toBe(true);
      expect(db.getAllSessions()).toHaveLength(2);
    });
    
    test('should rollback transaction on error', () => {
      try {
        db.transaction(() => {
          db.saveSession({ 
            id: 'tx-fail-1', 
            name: 'Will Fail', 
            created_at: new Date().toISOString(),
            last_updated: new Date().toISOString()
          });
          throw new Error('Transaction failed');
        });
      } catch (e) {
        // Expected
      }
      
      expect(db.getSession('tx-fail-1')).toBeUndefined();
    });
  });
});
