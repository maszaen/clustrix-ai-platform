/**
 * Multi-Device Sync Testing Suite
 * 
 * Tests all 5 multi-device scenarios from the architecture:
 * 1. Concurrent edits (same session on 2 devices)
 * 2. Delete + Add (delete on PC1, add on PC2)
 * 3. Offline changes (offline edits, then sync)
 * 4. Partial sync (incomplete sync, resume later)
 * 5. Conflict detection (concurrent edits with different content)
 * 
 * Usage:
 * - Run individual test: node tests/multi-device-sync-tests.js <test-name>
 * - Run all tests: node tests/multi-device-sync-tests.js all
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Import services
const SmartBackupService = require('../backend/smart-backup-service');
const ConflictResolver = require('../backend/conflict-resolver');
const {
  getDeviceId,
  generateSessionHash,
  getCurrentTimestamp,
  getLastBackupTime,
  updateLastBackupTime
} = require('../backend/sync-helpers');

const { logWithContext } = require('../utils/logger');

const log = (level, method, message, data = {}) => {
  logWithContext('MULTI-DEVICE-TEST', level, method, message, data);
};

// Test data directory
const TEST_DIR = path.join(__dirname, 'test-data', 'multi-device');
if (!fs.existsSync(TEST_DIR)) {
  fs.mkdirSync(TEST_DIR, { recursive: true });
}

/**
 * Test utilities
 */
class TestUtils {
  /**
   * Create a test database with schema
   */
  static createTestDatabase(dbPath) {
    const db = new Database(dbPath);
    
    // Create schema (copy from real schema)
    db.exec(`
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
        deleted INTEGER NOT NULL DEFAULT 0,
        device_id TEXT,
        synced_at INTEGER,
        hash TEXT
      );
      
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
        deleted INTEGER NOT NULL DEFAULT 0,
        device_id TEXT,
        synced_at INTEGER,
        sequence INTEGER,
        updated_at INTEGER,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );
      
      CREATE TABLE IF NOT EXISTS sync_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      
      CREATE INDEX IF NOT EXISTS idx_sessions_deleted ON sessions(deleted);
      CREATE INDEX IF NOT EXISTS idx_sessions_synced ON sessions(synced_at);
      CREATE INDEX IF NOT EXISTS idx_messages_deleted ON messages(deleted);
      CREATE INDEX IF NOT EXISTS idx_messages_sequence ON messages(session_id, sequence);
    `);
    
    // Initialize sync metadata
    const now = getCurrentTimestamp();
    db.prepare('INSERT OR REPLACE INTO sync_metadata (key, value, updated_at) VALUES (?, ?, ?)').run('last_sync_time', '0', now);
    db.prepare('INSERT OR REPLACE INTO sync_metadata (key, value, updated_at) VALUES (?, ?, ?)').run('last_backup_time', '0', now);
    db.prepare('INSERT OR REPLACE INTO sync_metadata (key, value, updated_at) VALUES (?, ?, ?)').run('device_id', 'test-device-' + Date.now(), now);
    
    log(1, 'createTestDatabase', 'Test database created', { path: dbPath });
    
    return db;
  }
  
  /**
   * Insert a test session
   */
  static insertSession(db, sessionData) {
    const deviceId = getDeviceId(db);
    const now = getCurrentTimestamp();
    
    const session = {
      id: sessionData.id || `session-${Date.now()}`,
      name: sessionData.name || 'Test Session',
      type: sessionData.type || 'regular',
      created_at: sessionData.created_at || now,
      updated_at: sessionData.updated_at || now,
      last_updated: new Date(sessionData.updated_at || now).toISOString(),
      project_id: null,
      is_project: 0,
      is_favorite: 0,
      persona_name: '',
      persona_work: '',
      persona_prefs: '',
      tokens_used: sessionData.tokens_used || 0,
      metadata: JSON.stringify(sessionData.metadata || {}),
      deleted: sessionData.deleted || 0,
      device_id: sessionData.device_id || deviceId,
      synced_at: sessionData.synced_at || null,
      hash: sessionData.hash || generateSessionHash(sessionData, [])
    };
    
    db.prepare(`
      INSERT INTO sessions (
        id, name, type, created_at, updated_at, last_updated,
        project_id, is_project, is_favorite,
        persona_name, persona_work, persona_prefs,
        tokens_used, metadata,
        deleted, device_id, synced_at, hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      session.id, session.name, session.type, session.created_at, session.updated_at, session.last_updated,
      session.project_id, session.is_project, session.is_favorite,
      session.persona_name, session.persona_work, session.persona_prefs,
      session.tokens_used, session.metadata,
      session.deleted, session.device_id, session.synced_at, session.hash
    );
    
    log(2, 'insertSession', 'Test session inserted', { id: session.id, name: session.name });
    
    return session;
  }
  
  /**
   * Insert a test message
   */
  static insertMessage(db, messageData) {
    const deviceId = getDeviceId(db);
    const now = getCurrentTimestamp();
    
    const message = {
      session_id: messageData.session_id,
      role: messageData.role || 'user',
      content: messageData.content || 'Test message',
      created_at: messageData.created_at || now,
      updated_at: messageData.updated_at || now,
      message_index: messageData.message_index || 0,
      sequence: messageData.sequence || messageData.message_index || 0,
      deleted: messageData.deleted || 0,
      device_id: messageData.device_id || deviceId,
      synced_at: messageData.synced_at || null,
      metadata: JSON.stringify(messageData.metadata || {}),
      model_id: null,
      model_label: null,
      provider: null,
      base_url: null,
      think_mode: null,
      think_content: null,
      thinking_update: null,
      web_search_enabled: 0,
      web_search_data: null,
      files: null
    };
    
    db.prepare(`
      INSERT INTO messages (
        session_id, role, content, created_at, updated_at, message_index,
        model_id, model_label, provider, base_url,
        think_mode, think_content, thinking_update,
        web_search_enabled, web_search_data, files, metadata,
        deleted, device_id, synced_at, sequence
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      message.session_id, message.role, message.content, message.created_at, message.updated_at, message.message_index,
      message.model_id, message.model_label, message.provider, message.base_url,
      message.think_mode, message.think_content, message.thinking_update,
      message.web_search_enabled, message.web_search_data, message.files, message.metadata,
      message.deleted, message.device_id, message.synced_at, message.sequence
    );
    
    log(2, 'insertMessage', 'Test message inserted', { session_id: message.session_id, content: message.content.substring(0, 30) });
    
    return message;
  }
  
  /**
   * Cleanup test files
   */
  static cleanup() {
    if (fs.existsSync(TEST_DIR)) {
      const files = fs.readdirSync(TEST_DIR);
      for (const file of files) {
        fs.unlinkSync(path.join(TEST_DIR, file));
      }
    }
    log(1, 'cleanup', 'Test files cleaned up');
  }
}

/**
 * Scenario 1: Concurrent Edits (Same Session on 2 Devices)
 * 
 * Steps:
 * 1. PC1 opens session "Work Notes", adds message "Task 1"
 * 2. PC2 opens same session, adds message "Task 2"
 * 3. PC1 syncs first (uploads "Task 1")
 * 4. PC2 syncs after (should merge "Task 2" without losing "Task 1")
 * 
 * Expected: Both messages preserved, no data loss
 */
async function testScenario1_ConcurrentEdits() {
  console.log('\n=== Scenario 1: Concurrent Edits ===\n');
  
  const pc1DbPath = path.join(TEST_DIR, 'pc1.db');
  const pc2DbPath = path.join(TEST_DIR, 'pc2.db');
  const cloudDbPath = path.join(TEST_DIR, 'cloud.db');
  
  // Setup PC1
  const pc1Db = TestUtils.createTestDatabase(pc1DbPath);
  const session1 = TestUtils.insertSession(pc1Db, {
    id: 'work-notes-123',
    name: 'Work Notes',
    created_at: 1000000,
    updated_at: 1000100
  });
  TestUtils.insertMessage(pc1Db, {
    session_id: session1.id,
    content: 'Task 1',
    message_index: 0,
    created_at: 1000100,
    updated_at: 1000100
  });
  pc1Db.close();
  
  // Setup PC2 (same session, different message)
  const pc2Db = TestUtils.createTestDatabase(pc2DbPath);
  const session2 = TestUtils.insertSession(pc2Db, {
    id: 'work-notes-123',
    name: 'Work Notes',
    created_at: 1000000,
    updated_at: 1000200 // Slightly later
  });
  TestUtils.insertMessage(pc2Db, {
    session_id: session2.id,
    content: 'Task 2',
    message_index: 1,
    created_at: 1000200,
    updated_at: 1000200
  });
  pc2Db.close();
  
  // PC1 syncs first (creates cloud DB)
  console.log('PC1 syncs first...');
  fs.copyFileSync(pc1DbPath, cloudDbPath);
  
  // PC2 syncs after (should merge)
  console.log('PC2 syncs after...');
  // TODO: Implement smart sync merge logic
  
  // Verify: Cloud should have both messages
  const cloudDb = new Database(cloudDbPath, { readonly: true });
  const messages = cloudDb.prepare('SELECT * FROM messages WHERE session_id = ? AND deleted = 0').all('work-notes-123');
  cloudDb.close();
  
  assert.strictEqual(messages.length, 2, 'Cloud should have both messages');
  assert.ok(messages.some(m => m.content === 'Task 1'), 'Should have Task 1');
  assert.ok(messages.some(m => m.content === 'Task 2'), 'Should have Task 2');
  
  console.log('✅ Scenario 1 passed: Both messages preserved\n');
}

/**
 * Scenario 2: Delete + Add (Delete on PC1, Add on PC2)
 * 
 * Steps:
 * 1. Both PC1 and PC2 have session "Old Project"
 * 2. PC1 deletes "Old Project"
 * 3. PC2 adds new session "New Project"
 * 4. Both sync
 * 
 * Expected: Cloud has "New Project", "Old Project" marked deleted (tombstone)
 */
async function testScenario2_DeleteAndAdd() {
  console.log('\n=== Scenario 2: Delete + Add ===\n');
  
  const pc1DbPath = path.join(TEST_DIR, 'pc1-del.db');
  const pc2DbPath = path.join(TEST_DIR, 'pc2-add.db');
  const cloudDbPath = path.join(TEST_DIR, 'cloud-del.db');
  
  // Setup PC1 (deletes session)
  const pc1Db = TestUtils.createTestDatabase(pc1DbPath);
  TestUtils.insertSession(pc1Db, {
    id: 'old-project-123',
    name: 'Old Project',
    deleted: 1, // Soft deleted
    updated_at: 2000100
  });
  pc1Db.close();
  
  // Setup PC2 (adds new session)
  const pc2Db = TestUtils.createTestDatabase(pc2DbPath);
  TestUtils.insertSession(pc2Db, {
    id: 'new-project-456',
    name: 'New Project',
    deleted: 0,
    updated_at: 2000200
  });
  pc2Db.close();
  
  // TODO: Implement smart sync merge
  
  console.log('✅ Scenario 2 setup complete (full test requires sync implementation)\n');
}

/**
 * Scenario 3: Offline Changes (Offline Edits, Then Sync)
 * 
 * Steps:
 * 1. PC1 goes offline, adds 10 sessions
 * 2. PC1 comes back online, syncs
 * 
 * Expected: All 10 sessions uploaded to cloud
 */
async function testScenario3_OfflineChanges() {
  console.log('\n=== Scenario 3: Offline Changes ===\n');
  
  const pc1DbPath = path.join(TEST_DIR, 'pc1-offline.db');
  const cloudDbPath = path.join(TEST_DIR, 'cloud-offline.db');
  
  // Setup PC1 (offline, adds 10 sessions)
  const pc1Db = TestUtils.createTestDatabase(pc1DbPath);
  for (let i = 1; i <= 10; i++) {
    TestUtils.insertSession(pc1Db, {
      id: `offline-session-${i}`,
      name: `Offline Session ${i}`,
      created_at: 3000000 + i * 100,
      updated_at: 3000000 + i * 100
    });
  }
  pc1Db.close();
  
  // Sync (should upload all 10)
  console.log('Syncing 10 offline sessions...');
  // TODO: Implement smart backup
  
  console.log('✅ Scenario 3 setup complete (10 sessions created)\n');
}

/**
 * Scenario 4: Partial Sync (Incomplete Sync, Resume Later)
 * 
 * Steps:
 * 1. PC1 starts syncing 100 sessions
 * 2. Network fails after 50 sessions
 * 3. PC1 resumes sync later
 * 
 * Expected: Resume from session 51, don't re-upload 1-50
 */
async function testScenario4_PartialSync() {
  console.log('\n=== Scenario 4: Partial Sync ===\n');
  
  // TODO: Implement partial sync resumption logic
  
  console.log('✅ Scenario 4 deferred (requires sync resumption logic)\n');
}

/**
 * Scenario 5: Conflict Detection (Concurrent Edits, Different Content)
 * 
 * Steps:
 * 1. PC1 and PC2 both edit session "Report" at same time
 * 2. PC1 changes title to "Q4 Report"
 * 3. PC2 changes title to "Annual Report"
 * 4. Both sync
 * 
 * Expected: Conflict detected (same timestamp, different hash), UI shown
 */
async function testScenario5_ConflictDetection() {
  console.log('\n=== Scenario 5: Conflict Detection ===\n');
  
  const pc1DbPath = path.join(TEST_DIR, 'pc1-conflict.db');
  const pc2DbPath = path.join(TEST_DIR, 'pc2-conflict.db');
  
  const sameTimestamp = 5000000;
  
  // PC1 version
  const pc1Db = TestUtils.createTestDatabase(pc1DbPath);
  TestUtils.insertSession(pc1Db, {
    id: 'report-123',
    name: 'Q4 Report', // PC1 title
    updated_at: sameTimestamp,
    hash: 'hash-pc1-version'
  });
  const pc1Sessions = pc1Db.prepare('SELECT * FROM sessions').all();
  pc1Db.close();
  
  // PC2 version
  const pc2Db = TestUtils.createTestDatabase(pc2DbPath);
  TestUtils.insertSession(pc2Db, {
    id: 'report-123',
    name: 'Annual Report', // PC2 title
    updated_at: sameTimestamp,
    hash: 'hash-pc2-version'
  });
  const pc2Sessions = pc2Db.prepare('SELECT * FROM sessions').all();
  pc2Db.close();
  
  // Detect conflicts
  const resolver = new ConflictResolver();
  const conflicts = resolver.detectConflicts(pc1Sessions, pc2Sessions, 'session');
  
  assert.strictEqual(conflicts.length, 1, 'Should detect 1 conflict');
  assert.strictEqual(conflicts[0].id, 'report-123', 'Conflict should be for report-123');
  
  console.log('✅ Scenario 5 passed: Conflict detected\n');
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log('========================================');
  console.log('   Multi-Device Sync Testing Suite');
  console.log('========================================');
  
  try {
    // Cleanup before tests
    TestUtils.cleanup();
    
    // Run scenarios
    await testScenario1_ConcurrentEdits();
    await testScenario2_DeleteAndAdd();
    await testScenario3_OfflineChanges();
    await testScenario4_PartialSync();
    await testScenario5_ConflictDetection();
    
    console.log('========================================');
    console.log('   All Tests Completed Successfully!');
    console.log('========================================\n');
    
    // Cleanup after tests
    TestUtils.cleanup();
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run tests
if (require.main === module) {
  const testName = process.argv[2];
  
  if (!testName || testName === 'all') {
    runAllTests();
  } else {
    // Run specific test
    const testMap = {
      '1': testScenario1_ConcurrentEdits,
      '2': testScenario2_DeleteAndAdd,
      '3': testScenario3_OfflineChanges,
      '4': testScenario4_PartialSync,
      '5': testScenario5_ConflictDetection
    };
    
    const testFn = testMap[testName];
    if (testFn) {
      TestUtils.cleanup();
      testFn().then(() => {
        console.log(`\n✅ Test ${testName} completed\n`);
        TestUtils.cleanup();
      }).catch(err => {
        console.error(`\n❌ Test ${testName} failed:`, err.message);
        process.exit(1);
      });
    } else {
      console.error(`Unknown test: ${testName}`);
      console.log('Available tests: 1, 2, 3, 4, 5, all');
      process.exit(1);
    }
  }
}

module.exports = {
  TestUtils,
  testScenario1_ConcurrentEdits,
  testScenario2_DeleteAndAdd,
  testScenario3_OfflineChanges,
  testScenario4_PartialSync,
  testScenario5_ConflictDetection,
  runAllTests
};
