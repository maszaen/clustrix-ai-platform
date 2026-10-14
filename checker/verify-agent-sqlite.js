/**
 * Optional real-SQLite contract check. Requires better-sqlite3 built for the current Node ABI.
 * Only Electron's path service is stubbed; schema, transactions, persistence and the runtime are real.
 * Run: npm run test:agent:sqlite
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const { processRequest, disposeSessions } = require('../backend/codes/runtime/agent');
const { loadHistory } = require('../backend/codes/runtime/context');
const { loadCheckpoint } = require('../backend/codes/runtime/checkpoints');

/** Load the actual database class without requiring an Electron GUI/binary in a Node test process. */
function loadDatabaseClass(userData) {
  const originalLoad = Module._load;
  try {
    Module._load = function (name, parent, isMain) {
      if (name === 'electron') return { app: { getPath: () => userData } };
      return originalLoad.call(this, name, parent, isMain);
    };
    return require('../backend/data/database-manager');
  } finally { Module._load = originalLoad; }
}

test('real SQLite: runtime saves iterations/checkpoint, preserves chat ownership, and resumes after reopen', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'clustrix-sqlite-'));
  const workspacePath = path.join(directory, 'workspace');
  fs.mkdirSync(workspacePath);
  const DatabaseManager = loadDatabaseClass(directory);
  let db;
  try {
    db = new DatabaseManager(null, directory);
    db.saveSession({ id: 'native-test', name: 'Native test', type: 'code' });
    db.addMessage('native-test', 'user', 'Create a test file', {}, 0);
    db.addMessage('native-test', 'ai', '', {}, 1);
    db.saveSetting('codes.agent', { runtime: 'modern', maxIterations: 5 });
    let round = 0;
    const result = await processRequest({
      sessionId: 'native-test', userPrompt: 'Create a test file', model: 'offline-fixture', workspacePath, db,
      options: db.getSetting('codes.agent'),
      modelCall: async (config, options, hooks) => {
        if (round++ === 0) {
          assert.equal(options.messages.filter(m => m.role === 'user').length, 1);
          return { role: 'assistant', calls: [{ id: 'file', name: 'create_file', arguments: JSON.stringify({ file: 'verified.txt', content: 'persisted\n' }) }] };
        }
        assert.equal(options.messages.at(-1).results[0].error, false);
        hooks.onText('Created the file.');
        return { role: 'assistant', content: 'Created the file.' };
      },
    });
    assert.equal(result.stopReason, 'completed');
    assert.equal(fs.readFileSync(path.join(workspacePath, 'verified.txt'), 'utf8'), 'persisted\n');
    assert.equal(db.getMessages('native-test').length, 2, 'runtime must not duplicate renderer messages');
    assert.equal(db.getCodeIterations('native-test').length, 1);
    assert.equal(db.getCodeIterations('native-test')[0].summary, 'create_file');
    assert.equal(loadCheckpoint(db, 'native-test', fs.realpathSync(workspacePath)).status, 'completed');
    db.upsertMessage('native-test', 'ai', 'Created the file.', {}, 1);
    disposeSessions();
    db.close();
    db = new DatabaseManager(null, directory);
    assert.equal(loadHistory(db, 'native-test', 'continue')[1].role, 'assistant');
    assert.equal(loadHistory(db, 'native-test', 'continue')[1].content, 'Created the file.');
    assert.equal(loadCheckpoint(db, 'native-test', fs.realpathSync(workspacePath)).recentActions[0].tool, 'create_file');
    assert.equal(loadCheckpoint(db, 'native-test', directory), null, 'checkpoint must not leak across workspaces');
    assert.equal(db.getSetting('codes.agent').runtime, 'modern');
    db.deleteSession('native-test');
    assert.equal(db.getCodeIterations('native-test').length, 0);
    assert.equal(db.getLatestSummary('native-test'), undefined);
  } finally {
    disposeSessions();
    db?.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
