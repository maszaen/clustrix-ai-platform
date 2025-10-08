// Manual test script for database message saving fixes
// Run with: node test-message-saving.js

const DatabaseManager = require('./backend/database-manager');

console.log('Testing DatabaseManager message saving fixes...\n');

// Create in-memory database for testing
const db = new DatabaseManager({
  getPath: () => ':memory:'
});

try {
  // Create a test session
  const session = {
    id: 'test-session-1',
    name: 'Test Session',
    created_at: new Date().toISOString(),
    last_updated: new Date().toISOString()
  };

  console.log('1. Creating test session...');
  db.saveSession(session);

  // Test 1: Add message with thinkContent
  console.log('2. Testing addMessage with thinkContent...');
  const thinkContent = { text: 'Thinking about this...', duration: 1500 };
  db.addMessage('test-session-1', 'ai', 'AI Response', {
    model: 'gpt-4',
    modelLabel: 'GPT-4',
    provider: 'openai',
    thinkMode: 'extended',
    thinkContent: thinkContent,
    webSearchEnabled: true,
    webSearchData: { pages: 3, query: 'test query' }
  }, 0);

  // Test 2: Upsert message with thinkContent
  console.log('3. Testing upsertMessage with thinkContent...');
  const updatedThinkContent = { text: 'Updated thinking...', duration: 2000 };
  db.upsertMessage('test-session-1', 'ai', 'Updated AI Response', {
    model: 'gpt-4',
    modelLabel: 'GPT-4',
    provider: 'openai',
    thinkMode: 'extended',
    thinkContent: updatedThinkContent,
    webSearchEnabled: true,
    webSearchData: { pages: 5, query: 'updated query' }
  }, 0);

  // Test 3: Add multiple messages
  console.log('4. Testing multiple messages...');
  db.addMessage('test-session-1', 'user', 'User message 1', {}, 1);
  db.addMessage('test-session-1', 'ai', 'AI response 1', {}, 2);
  db.addMessage('test-session-1', 'user', 'User message 2', {}, 3);

  // Retrieve and verify
  console.log('5. Retrieving messages...');
  const messages = db.getMessages('test-session-1');

  console.log(`Found ${messages.length} messages:`);
  messages.forEach((msg, index) => {
    console.log(`  Message ${index}: ${msg.role} - "${msg.content.substring(0, 50)}..."`);
    console.log(`    think_mode: ${msg.think_mode}`);
    if (msg.think_content) {
      try {
        const parsed = JSON.parse(msg.think_content);
        console.log(`    think_content: ${JSON.stringify(parsed)}`);
      } catch (e) {
        console.log(`    think_content: ERROR parsing - ${msg.think_content}`);
      }
    }
    console.log(`    web_search_enabled: ${msg.web_search_enabled}`);
    if (msg.web_search_data) {
      try {
        const parsed = JSON.parse(msg.web_search_data);
        console.log(`    web_search_data: ${JSON.stringify(parsed)}`);
      } catch (e) {
        console.log(`    web_search_data: ERROR parsing - ${msg.web_search_data}`);
      }
    }
    console.log('');
  });

  // Verify thinkContent serialization
  const firstMessage = messages[0];
  if (firstMessage.think_content) {
    const parsedThinkContent = JSON.parse(firstMessage.think_content);
    if (JSON.stringify(parsedThinkContent) === JSON.stringify(updatedThinkContent)) {
      console.log('✅ thinkContent serialization works correctly');
    } else {
      console.log('❌ thinkContent serialization failed');
      console.log('Expected:', JSON.stringify(updatedThinkContent));
      console.log('Got:', JSON.stringify(parsedThinkContent));
    }
  }

  // Verify message count
  if (messages.length === 4) {
    console.log('✅ All messages saved correctly');
  } else {
    console.log(`❌ Expected 4 messages, got ${messages.length}`);
  }

  console.log('\nTest completed successfully!');
  db.close();

} catch (error) {
  console.error('Test failed:', error);
  db.close();
  process.exit(1);
}