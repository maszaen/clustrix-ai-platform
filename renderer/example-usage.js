/**
 * Example Usage of Modular Services
 *
 * This file demonstrates how to use the new modular architecture.
 * Copy these patterns when migrating code from renderer.js.
 */

// ============================================
// OPTION 1: Import Compat Layer (Easiest)
// ============================================
// Just add this line to renderer.js to enable backward compatibility
// import './compat.js';

// Then use global helpers:
// await window._createSession();
// await window._addMessage(sessionId, 'user', 'Hello');

// ============================================
// OPTION 2: Direct Module Import (Recommended)
// ============================================

import { getState, setState, subscribe } from './core/state.js';
import { sessionCache } from './core/cache.js';
import ipc from './core/ipc.js';

import sessionService from './services/session-service.js';
import messageService from './services/message-service.js';
import fileService from './services/file-service.js';
import markdownService from './services/markdown-service.js';
import streamService from './services/stream-service.js';

// ============================================
// EXAMPLE 1: Create and Manage Session
// ============================================

async function exampleCreateSession() {
  console.log('=== Example 1: Create Session ===');

  // Create new session
  const session = await sessionService.create([], { type: 'regular' });
  console.log('Created session:', session.id);

  // Set as current session
  setState('currentSession', session);

  // Add messages
  await messageService.add(session.id, 'user', 'Hello, AI!');
  await messageService.add(session.id, 'ai', 'Hello! How can I help you today?');

  // Get message stats
  const stats = messageService.getStats(session.id);
  console.log('Message stats:', stats);

  return session;
}

// ============================================
// EXAMPLE 2: Reactive State Management
// ============================================

function exampleStateManagement() {
  console.log('=== Example 2: State Management ===');

  // Subscribe to session changes
  subscribe('currentSession', (newSession) => {
    console.log('Current session changed:', newSession?.id);

    // Update UI based on new session
    if (newSession) {
      document.title = `Clustrix - ${newSession.name || 'New Chat'}`;
    }
  });

  // Get state
  const sessions = getState('sessions');
  const currentPage = getState('ui.currentPage');
  const theme = getState('settings.theme');

  console.log('Sessions:', sessions.length);
  console.log('Current page:', currentPage);
  console.log('Theme:', theme);

  // Update state
  setState('ui.currentPage', 'chats');
  setState('settings.theme', 'dark');
}

// ============================================
// EXAMPLE 3: Session Cache Usage
// ============================================

async function exampleCacheUsage(session) {
  console.log('=== Example 3: Session Cache ===');

  // Render session
  const messages = messageService.getAll(session.id);
  let html = '';

  for (const msg of messages) {
    const content = await markdownService.render(msg.content);
    html += `<div class="message ${msg.role}">${content}</div>`;
  }

  // Cache the rendered HTML
  const scrollPosition = 100;
  sessionCache.set(session.id, html, scrollPosition, {
    messageCount: messages.length,
    lastRendered: Date.now()
  });

  console.log('Cached session:', session.id);

  // Later: Retrieve from cache
  const cached = sessionCache.get(session.id);
  if (cached) {
    console.log('Retrieved from cache:', {
      htmlLength: cached.html.length,
      scrollPosition: cached.scrollPosition,
      lazyState: cached.lazyState
    });

    // Use cached HTML
    // messageList.innerHTML = cached.html;
    // messageList.scrollTop = cached.scrollPosition;
  }
}

// ============================================
// EXAMPLE 4: File Operations
// ============================================

async function exampleFileOperations(sessionId) {
  console.log('=== Example 4: File Operations ===');

  // Upload files (opens dialog)
  const result = await fileService.uploadToSession(sessionId);
  console.log('Upload result:', result.message);

  // Get files for AI processing
  const filesForAI = fileService.getFilesForAI(sessionId);
  console.log('Files for AI:', filesForAI.length);

  // Get file statistics
  const stats = fileService.getStats(sessionId);
  console.log('File stats:', {
    total: stats.total,
    totalSize: stats.totalSize,
    byType: stats.byType
  });

  // Search files
  const searchResults = fileService.searchContent(sessionId, 'function');
  console.log('Found files containing "function":', searchResults.length);
}

// ============================================
// EXAMPLE 5: Markdown Rendering (WRAPPER)
// ============================================

async function exampleMarkdownRendering() {
  console.log('=== Example 5: Markdown Rendering ===');

  const markdown = `
# Hello World

This is **bold** and this is *italic*.

\`\`\`javascript
function hello() {
  console.log('Hello!');
}
\`\`\`

- Item 1
- Item 2
- Item 3
  `;

  // Async render (uses worker if available)
  const html = await markdownService.render(markdown);
  console.log('Rendered HTML length:', html.length);

  // Sync render (direct fallback)
  const htmlSync = markdownService.renderSync(markdown);
  console.log('Rendered HTML (sync) length:', htmlSync.length);

  // Extract code blocks
  const codeBlocks = markdownService.extractCodeBlocks(markdown);
  console.log('Code blocks:', codeBlocks.length);

  // Strip markdown
  const plainText = markdownService.stripMarkdown(markdown);
  console.log('Plain text:', plainText.substring(0, 50) + '...');

  // Get stats
  const stats = markdownService.getStats(markdown);
  console.log('Markdown stats:', stats);
}

// ============================================
// EXAMPLE 6: Stream Management
// ============================================

async function exampleStreamManagement(session) {
  console.log('=== Example 6: Stream Management ===');

  const streamId = 'stream-' + Date.now();
  const messageIndex = session.messages.length;

  // Start stream
  streamService.startStream(streamId, {
    session: session,
    messageIndex: messageIndex,
    controller: new AbortController(),
    fullResponse: ''
  });

  console.log('Started stream:', streamId);

  // Check if streaming
  console.log('Is streaming?', streamService.isStreaming());
  console.log('Is streaming in session?', streamService.isStreamingInSession(session));

  // Append content
  streamService.appendContent(streamId, 'Hello ');
  streamService.appendContent(streamId, 'World!');

  // Get stream info
  const info = streamService.getStreamInfo(streamId);
  console.log('Stream info:', info);

  // Stop stream
  streamService.stopStream(streamId);
  console.log('Stopped stream');
}

// ============================================
// EXAMPLE 7: Complete Workflow
// ============================================

async function exampleCompleteWorkflow() {
  console.log('=== Example 7: Complete Workflow ===');

  try {
    // 1. Create session
    const session = await sessionService.create();
    console.log('✓ Created session:', session.id);

    // 2. Add user message
    await messageService.add(session.id, 'user', 'What is JavaScript?');
    console.log('✓ Added user message');

    // 3. Upload files (simulated)
    // await fileService.uploadToSession(session.id);
    // console.log('✓ Uploaded files');

    // 4. Start AI response stream
    const streamId = 'ai-response-' + Date.now();
    streamService.startStream(streamId, {
      session: session,
      messageIndex: 1,
      controller: new AbortController()
    });
    console.log('✓ Started AI stream');

    // 5. Simulate streaming response
    const response = 'JavaScript is a programming language...';
    for (let i = 0; i < response.length; i += 10) {
      const chunk = response.substring(i, i + 10);
      streamService.appendContent(streamId, chunk);
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // 6. Complete stream
    streamService.markEnded(streamId);
    const stream = streamService.getStream(streamId);
    console.log('✓ Stream completed, response length:', stream.fullResponse.length);

    // 7. Add AI message
    await messageService.add(session.id, 'ai', stream.fullResponse);
    console.log('✓ Added AI message');

    // 8. Render messages with markdown
    const messages = messageService.getAll(session.id);
    for (const msg of messages) {
      const html = await markdownService.render(msg.content);
      console.log(`✓ Rendered ${msg.role} message:`, html.substring(0, 50) + '...');
    }

    // 9. Cache the session
    sessionCache.set(session.id, '<rendered-html>', 0, { cached: true });
    console.log('✓ Cached session');

    // 10. Get statistics
    const msgStats = messageService.getStats(session.id);
    const fileStats = fileService.getStats(session.id);
    console.log('✓ Stats:', { messages: msgStats.total, files: fileStats.total });

    // 11. Stop stream
    streamService.stopStream(streamId);
    console.log('✓ Stopped stream');

    console.log('🎉 Complete workflow finished successfully!');

  } catch (error) {
    console.error('❌ Error in workflow:', error);
  }
}

// ============================================
// EXAMPLE 8: Migration Pattern
// ============================================

// Before (old renderer.js code):
/*
function oldCreateNewChat() {
  const newSession = {
    id: generateID(),
    name: null,
    messages: [],
    created_at: new Date().toISOString(),
    uploadedFiles: [],
    tokens_used: 0
  };

  sessions.unshift(newSession);
  currentSession = newSession;

  await window.api.sessions.save(sessions);

  renderSession(newSession);
}
*/

// After (with modular services):
async function newCreateNewChat() {
  // Create session (handles ID, timestamp, structure)
  const session = await sessionService.create();

  // Set as current (reactive state management)
  setState('currentSession', session);

  // Render (with caching)
  renderSession(session);
}

// ============================================
// RUN EXAMPLES
// ============================================

export async function runAllExamples() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   Modular Architecture - Example Usage      ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');

  try {
    // Example 1: Create session
    const session = await exampleCreateSession();
    console.log('');

    // Example 2: State management
    exampleStateManagement();
    console.log('');

    // Example 3: Cache usage
    await exampleCacheUsage(session);
    console.log('');

    // Example 4: File operations
    // await exampleFileOperations(session.id); // Requires user interaction
    // console.log('');

    // Example 5: Markdown rendering
    await exampleMarkdownRendering();
    console.log('');

    // Example 6: Stream management
    await exampleStreamManagement(session);
    console.log('');

    // Example 7: Complete workflow
    await exampleCompleteWorkflow();
    console.log('');

    console.log('✅ All examples completed successfully!');

  } catch (error) {
    console.error('❌ Error running examples:', error);
  }
}

// To run these examples, uncomment:
// runAllExamples();
