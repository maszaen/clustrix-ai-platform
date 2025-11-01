# Core Backend Modules

This directory contains core backend functionality for Clustrix AI Platform.

## Modules

### 1. Thinking Parser (`thinking-parser.js`)

Detects and extracts `<thinking>` tags from streaming AI responses, separating thinking content from main response body.

#### Features

- **Stream-based parsing**: Handles chunk-by-chunk streaming content
- **Tag detection**: Detects `<thinking>...</thinking>` tags at the start of responses
- **Concurrent streams**: Supports multiple simultaneous streams
- **Automatic cleanup**: Cleans up stream state after completion

#### Usage

```javascript
const thinkingParser = require('./backend/core/thinking-parser');

// Initialize stream
thinkingParser.initializeStream(streamId);

// Process chunks
const result = thinkingParser.processChunk(streamId, chunk);
if (result.think) {
  // Send to thinking body
  sendThinking(result.think);
}
if (result.content) {
  // Send to main content
  sendContent(result.content);
}

// Finalize stream
const final = thinkingParser.finalizeStream(streamId);
```

#### API

- `initializeStream(streamId)` - Initialize parser for a new stream
- `processChunk(streamId, chunk)` - Process a content chunk, returns `{ think, content }`
- `finalizeStream(streamId)` - Finalize stream and clean up, returns final content
- `resetStream(streamId)` - Reset stream state (useful for retries)
- `getStreamState(streamId)` - Get current stream state (for debugging)

#### How it Works

1. **Detection Phase**: When stream starts, parser checks if content begins with `<thinking>` tag
2. **Accumulation Phase**: If detected, accumulates content until `</thinking>` tag is found
3. **Extraction Phase**: Extracts thinking content and sends it separately
4. **Passthrough Phase**: After thinking is extracted, remaining content passes through normally

#### Example

**Input stream:**
```
<thinking>First, I need to analyze the user's question carefully. They're asking about X, which requires Y.</thinking>Based on my analysis, the answer is Z.
```

**Output:**
- `think`: "First, I need to analyze the user's question carefully. They're asking about X, which requires Y."
- `content`: "Based on my analysis, the answer is Z."

---

### 2. Thinking Migration (`thinking-migration.js`)

Migrates old messages with embedded `<thinking>` tags to the new separated format.

#### Features

- **Toggle control**: Enable/disable migration via `ENABLE_MIGRATION` constant
- **Pattern detection**: Supports both `<thinking>` tags and `*(Internal Reasoning:)*` pattern
- **Session migration**: Migrate individual sessions or all sessions at once
- **Non-destructive**: Only migrates messages that don't already have `_x_think` data

#### Configuration

```javascript
// In thinking-migration.js
const ENABLE_MIGRATION = true; // Set to false to disable migration
```

**IMPORTANT**: Set `ENABLE_MIGRATION = false` to completely disable this feature. When disabled, all migration functions will return early without processing.

#### Usage

```javascript
const thinkingMigration = require('./backend/core/thinking-migration');

// Check if migration is enabled
if (thinkingMigration.isMigrationEnabled()) {
  // Migrate all sessions
  const count = thinkingMigration.migrateAllSessions(sessions);
  console.log(`Migrated ${count} messages`);
}

// Migrate a single session
const count = thinkingMigration.migrateSession(session);

// Check if content needs migration
if (thinkingMigration.needsMigration(content)) {
  // Content has thinking patterns
}
```

#### API

- `ENABLE_MIGRATION` - Toggle constant (set to false to disable)
- `isMigrationEnabled()` - Check if migration is enabled
- `extractThinkingContent(content)` - Extract thinking from content string
- `migrateSession(session)` - Migrate a single session, returns count of migrated messages
- `migrateAllSessions(sessions)` - Migrate all sessions, returns total count
- `needsMigration(content)` - Check if content needs migration

#### Supported Patterns

1. **`<thinking>` tags**:
   ```
   <thinking>My thought process</thinking>Main response
   ```

2. **`*(Internal Reasoning:)*` pattern**:
   ```
   Some text *(Internal Reasoning: my reasoning)* more text
   ```

#### Migration Process

1. Scans assistant messages for thinking patterns
2. Extracts thinking content using regex patterns
3. Stores in `session._x_think[messageIndex]` as `{ text, expanded: false }`
4. Removes thinking tags from original message content
5. Skips messages that already have `_x_think` data

#### Example

**Before migration:**
```javascript
session.messages[1] = [
  'assistant',
  '<thinking>Analyzing the problem</thinking>Here is my answer',
  { model: 'gpt-4' }
]
```

**After migration:**
```javascript
session.messages[1] = [
  'assistant',
  'Here is my answer',
  { model: 'gpt-4' }
]

session._x_think[1] = {
  text: 'Analyzing the problem',
  expanded: false
}
```

---

## Integration

Both modules are integrated into the main streaming and session loading logic:

### Streaming Integration (main.js)

```javascript
const thinkingParser = require('./backend/core/thinking-parser');

// In SSE streaming handler
thinkingParser.initializeStream(reqId);

res.on('data', (chunk) => {
  const parsed = thinkingParser.processChunk(reqId, delta);

  if (parsed.think) {
    event.sender.send(`chat:chunk-${reqId}`, { think: parsed.think });
  }
  if (parsed.content) {
    event.sender.send(`chat:chunk-${reqId}`, parsed.content);
  }
});

res.on('end', () => {
  const final = thinkingParser.finalizeStream(reqId);
  // Handle final content
});
```

### Session Loading Integration (main.js)

```javascript
const thinkingMigration = require('./backend/core/thinking-migration');

ipcMain.handle('sessions:load', async () => {
  const sessions = db.getAllSessions();
  const transformed = sessions.map(/* ... */);

  // Run migration if enabled
  if (thinkingMigration.isMigrationEnabled()) {
    const count = thinkingMigration.migrateAllSessions(transformed);
    if (count > 0) {
      log('MIGRATION', 1, 'sessions:load', 'Thinking migration completed', {
        totalMigrated: count
      });
    }
  }

  return transformed;
});
```

---

## Testing

Run tests with Jest:

```bash
npm test backend/core/__tests__/thinking-parser.test.js
npm test backend/core/__tests__/thinking-migration.test.js
```

### Test Coverage

**thinking-parser.test.js**:
- Thinking tag extraction
- Multi-chunk handling
- Stream state management
- Concurrent streams
- Edge cases (unclosed tags, whitespace, case-insensitivity)

**thinking-migration.test.js**:
- Pattern extraction (both `<thinking>` and `*(Internal Reasoning:)*`)
- Session migration
- Migration toggle
- Edge cases (existing data, invalid input, multiline)

---

## Troubleshooting

### Migration not working

1. Check if `ENABLE_MIGRATION` is set to `true` in `thinking-migration.js`
2. Verify messages are assistant role (user messages are skipped)
3. Check if messages already have `_x_think` data (duplicates are skipped)

### Thinking tags not detected in stream

1. Verify tags appear at the **start** of the response
2. Check for proper tag format: `<thinking>content</thinking>`
3. Ensure stream initialization happens before chunks arrive
4. Check logs with `THINKING_PARSER` tag for debugging

### Performance issues

- Parser uses minimal buffering (20 chars) to handle split tags
- Migration runs once on session load, not on every message
- Both modules use early returns for efficiency
- Disable migration completely by setting `ENABLE_MIGRATION = false`

---

## Logging

Both modules use the centralized logger with specific tags:

- **THINKING_PARSER**: Parser events (init, detect, extract)
- **MIGRATION**: Migration events (session count, pattern detection)

Example logs:
```
[THINKING_PARSER] Detected <thinking> tag at start (streamId: abc123)
[MIGRATION] Thinking migration completed (totalMigrated: 15)
```
