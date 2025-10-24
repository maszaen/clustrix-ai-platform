const DatabaseManager = require('./backend/database-manager.js');
const path = require('path');
const { app } = require('electron');

// Mock app.getPath
app.getPath = (name) => {
  if (name === 'userData') {
    return path.join(__dirname, 'test-userdata');
  }
  return '';
};

async function testDelete() {
  const db = new DatabaseManager(app);

  // Create test session
  const testSession = {
    id: 'test-session-123',
    name: 'Test Session',
    type: 'regular',
    created_at: new Date().toISOString(),
    last_updated: new Date().toISOString(),
    messages: [
      ['user', 'Hello', {}],
      ['assistant', 'Hi there', {}]
    ]
  };

  console.log('Creating test session...');
  db.saveSession(testSession);

  let sessions = db.getAllSessions();
  console.log('Sessions after create:', sessions.length);

  // Simulate save without the test session (like delete)
  const data = { sessions: [] }; // Empty, simulating delete

  // Simulate the save logic
  db.transaction(() => {
    const existingSessionIds = new Set(db.getAllSessions().map(s => s.id));
    const incomingSessionIds = new Set(data.sessions.map(s => s.id));

    console.log('Existing IDs:', Array.from(existingSessionIds));
    console.log('Incoming IDs:', Array.from(incomingSessionIds));

    for (const sessionId of existingSessionIds) {
      if (!incomingSessionIds.has(sessionId)) {
        console.log('Deleting session', sessionId);
        db.deleteSession(sessionId);
      }
    }

    for (const session of data.sessions) {
      db.saveSession(session);
    }
  });

  sessions = db.getAllSessions();
  console.log('Sessions after delete:', sessions.length);

  if (sessions.length === 0) {
    console.log('✅ Delete test PASSED');
  } else {
    console.log('❌ Delete test FAILED');
  }
}

testDelete().catch(console.error);