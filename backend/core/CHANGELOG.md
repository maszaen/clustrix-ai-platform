# Thinking Parser & Migration - Changelog

## 2025-01-01 - Initial Implementation

### Added

#### Thinking Parser (`thinking-parser.js`)
- Stream-based parser for extracting `<thinking>` tags from AI responses
- Support for concurrent multiple streams
- Automatic state cleanup after stream completion
- Case-insensitive tag detection
- Handles tags split across multiple chunks
- Detects thinking tags only at the start of responses
- Graceful handling of unclosed tags (treats as regular content)

#### Thinking Migration (`thinking-migration.js`)
- Migration tool for old messages with embedded thinking patterns
- Toggle control via `ENABLE_MIGRATION` constant
- Support for two patterns:
  - `<thinking>...</thinking>` tags
  - `*(Internal Reasoning: ...)* pattern`
- Session-level and bulk migration support
- Non-destructive (skips already migrated messages)
- Only migrates assistant messages (skips user messages)

#### Integration
- **main.js**: Integrated thinking parser into SSE streaming handler
- **main.js**: Integrated thinking parser into non-SSE Gemini responses
- **main.js**: Integrated thinking parser into non-SSE OpenAI responses
- **main.js**: Added migration on session load (`sessions:load` handler)

#### Tests
- Comprehensive test suite for thinking parser (14 test cases)
- Comprehensive test suite for thinking migration (13 test cases)
- Tests cover edge cases, concurrent streams, and error handling

#### Documentation
- README.md with complete API documentation
- Usage examples for both modules
- Integration guide for main.js
- Troubleshooting section
- CHANGELOG.md for tracking changes

### Modified Files
- `main.js`:
  - Added imports for thinking parser and migration modules
  - Modified SSE streaming handler (lines ~4025-4150)
  - Modified Gemini non-streaming handler (lines ~3839-3890)
  - Modified OpenAI non-streaming handler (lines ~3973-4035)
  - Added migration call in session load handler (lines ~2262-2270)

### Architecture

```
backend/core/
├── thinking-parser.js          # Stream parser for <thinking> tags
├── thinking-migration.js       # Migration tool with toggle
├── README.md                   # Complete documentation
├── CHANGELOG.md                # This file
└── __tests__/
    ├── thinking-parser.test.js    # Parser tests
    └── thinking-migration.test.js # Migration tests
```

### Flow

1. **Streaming Flow**:
   ```
   AI Response → SSE Stream → Thinking Parser → {think, content}
   ↓
   Renderer receives { think } → Thinking Body
   Renderer receives content → Main Message Body
   ```

2. **Migration Flow**:
   ```
   Session Load → Check ENABLE_MIGRATION → Scan Messages
   ↓
   Find <thinking> patterns → Extract → Store in _x_think
   ↓
   Update message content (remove tags) → Save
   ```

### Priority Order

When processing content, the following priority is applied:

1. **Highest**: `<thinking>` tags (handled by thinking-parser.js)
2. **Medium**: `reasoning_content` from API response
3. **Low**: `*(Internal Reasoning:)* pattern (Gemini-specific)

### Performance

- Parser uses minimal 20-char buffer for handling split tags
- Migration runs once on session load only
- Early returns for efficiency when disabled
- No performance impact when migration is disabled (`ENABLE_MIGRATION = false`)

### Configuration

**Enable/Disable Migration**:
```javascript
// In backend/core/thinking-migration.js
const ENABLE_MIGRATION = true; // Set to false to disable
```

When `ENABLE_MIGRATION = false`:
- All migration functions return early
- Zero performance overhead
- No scanning or processing occurs

### Breaking Changes
None - This is a new feature that enhances existing functionality without breaking changes.

### Known Issues
None

### Future Improvements
- [ ] Support for `<thinking>` tags anywhere in response (currently only at start)
- [ ] Configurable patterns via settings
- [ ] Migration progress reporting for large datasets
- [ ] Streaming thinking content word-by-word (currently sent as complete block)
- [ ] Support for nested thinking blocks

---

## Usage Examples

### Example 1: DeepSeek with Thinking Tags

**Model Response**:
```
<thinking>
The user is asking about the capital of France. This is a straightforward question.
I should provide the answer clearly and concisely.
</thinking>
The capital of France is Paris.
```

**Result**:
- Thinking body: "The user is asking about the capital of France. This is a straightforward question. I should provide the answer clearly and concisely."
- Main content: "The capital of France is Paris."

### Example 2: Migration of Old Messages

**Before**:
```javascript
session.messages[5] = [
  'assistant',
  '<thinking>Analyzing code structure...</thinking>Here is the refactored code: ...',
  { model: 'gpt-4', timestamp: 1234567890 }
]
```

**After Migration**:
```javascript
// Message content cleaned
session.messages[5] = [
  'assistant',
  'Here is the refactored code: ...',
  { model: 'gpt-4', timestamp: 1234567890 }
]

// Thinking separated
session._x_think[5] = {
  text: 'Analyzing code structure...',
  expanded: false
}
```

---

## Testing Commands

```bash
# Run all tests
npm test backend/core/

# Run specific test
npm test backend/core/__tests__/thinking-parser.test.js
npm test backend/core/__tests__/thinking-migration.test.js

# Run with coverage
npm test -- --coverage backend/core/
```

---

## Credits

**Developer**: Claude Code
**Date**: 2025-01-01
**Version**: 1.0.0
