# Response Debug Improvement Plan

## Overview

Improvement ini bertujuan untuk mengganti sistem `DEBUG_MARKDOWN` yang kurang real dan tidak modular menjadi sistem **Response Debug** yang lebih powerful, modular, dan dapat mensimulasikan response AI secara realistis tanpa API call.

---

## Keluhan Sistem Saat Ini

### 1. **Hanya Bisa Debug Markdown, Kurang Real**
- Sistem `DEBUG_MARKDOWN` hanya fokus pada testing markdown rendering
- Tidak mensimulasikan flow lengkap dari backend processing
- Session type khusus (`markdown-test`) yang berbeda dari session normal
- UI controls khusus yang tidak mencerminkan flow production

### 2. **Kode Tidak Modular**
- Semua logic debug tersebar di `renderer.js` (~400+ lines)
- Mixing antara UI logic dan simulation logic
- Sulit untuk maintain dan extend
- Tidak ada separation of concerns

### 3. **Keluhan Lain**
- Tidak bisa test thinking mode, web search mode, atau feature lainnya
- Tidak ada control atas streaming speed
- Tidak bisa simulate error scenarios
- Tidak bisa test token usage tracking
- Hard-coded scenario templates

---

## Tujuan Improvement

### 1. **Kode Modular dan Mudah Dimaintain**
- Pisahkan debug logic dari renderer
- Gunakan file terpisah di `backend/debug/`
- Clean architecture dengan separation of concerns

### 2. **Debug UI Asli dari Response AI**
- Tidak perlu session type khusus
- Tidak perlu UI controls khusus
- Flow sama persis dengan request ke AI real
- User experience identical

### 3. **Backend Processing**
- Handler di main process, bukan renderer
- Integrate dengan existing stream infrastructure
- Support semua feature: thinking, web search simulation, dll

### 4. **Model "local/debugging"**
- Provider: `local` atau Model: `debugging`
- Auto-detect di backend
- Route ke debug handler
- No API key required
- **Auto-use smart title generator** (no custom title generation for debug mode)

### 5. **Response Format JSON**
- Response berupa JSON yang diproses seperti real API
- Support semua format: text, thinking, citations, dll
- Configurable scenarios

---

## Arsitektur Baru

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER SEND MESSAGE                         │
│                     (Normal Flow, No Special UI)                 │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                                 ▼
                    ┌────────────────────────┐
                    │  send() - renderer.js  │
                    │  (No DEBUG_MARKDOWN)   │
                    └────────────┬───────────┘
                                 │
                                 ▼
                    ┌────────────────────────┐
                    │  startStream()         │
                    │  window.api.chat.stream│
                    └────────────┬───────────┘
                                 │
                                 ▼ IPC
                    ┌────────────────────────────────┐
                    │  main.js                       │
                    │  ipcMain.on('chat:stream-start')│
                    └────────────┬───────────────────┘
                                 │
                                 ▼
                    ┌────────────────────────────────┐
                    │  runStandardStreaming()        │
                    └────────────┬───────────────────┘
                                 │
                ┌────────────────┴─────────────────┐
                │                                   │
                ▼                                   ▼
    ┌───────────────────────┐         ┌───────────────────────────┐
    │  Check Provider/Model │         │  Other Providers          │
    │  === "local" or       │         │  (OpenAI, Perplexity,     │
    │  === "debugging"      │         │   OpenRouter, etc)        │
    └───────────┬───────────┘         └───────────────────────────┘
                │
                ▼
    ┌─────────────────────────────────────┐
    │  backend/debug/response-debugger.js │
    │  handleDebugRequest()               │
    ├─────────────────────────────────────┤
    │ 1. Load scenario from config        │
    │ 2. Parse user prompt                │
    │ 3. Build response (echo or custom)  │
    │ 4. Simulate streaming               │
    │    - Chunking: 10-14 chars/token   │
    │    - Speed: 20-25 tokens/sec       │
    │ 5. Send via IPC events             │
    │    - chat:chunk-${reqId}           │
    │    - chat:done-${reqId}            │
    └─────────────────────────────────────┘
                │
                ▼
    ┌──────────────────────────────┐
    │  Renderer receives chunks    │
    │  (Same as real API response) │
    └──────────────────────────────┘
```

---

## Implementation Plan

### Phase 1: Backend Setup (Priority: HIGH)

#### 1.1 Create Debug Module Structure
**Files to create:**
```
backend/debug/
├── response-debugger.js     # Main handler
├── scenarios.json           # Configurable test scenarios
└── chunk-simulator.js       # Streaming simulation logic
```

#### 1.2 `response-debugger.js` - Main Handler
**Location:** `backend/debug/response-debugger.js`

**Responsibilities:**
- Detect debug mode (provider === 'local' || model === 'debugging')
- Load scenarios from JSON
- Parse user prompt for special commands
- Orchestrate response building
- Coordinate streaming simulation

**Key Functions:**
```javascript
/**
 * Check if request should be handled by debugger
 * @param {string} provider - Provider name
 * @param {string} model - Model name
 * @returns {boolean}
 */
function isDebugRequest(provider, model)

/**
 * Main entry point for debug requests
 * @param {object} event - IPC event
 * @param {object} payload - Request payload
 * @returns {Promise<void>}
 */
async function handleDebugRequest(event, payload)

/**
 * Build response based on scenario
 * @param {string} userPrompt - User's message
 * @param {object} scenario - Scenario config
 * @returns {object} - Response data with thinking, content, etc
 */
function buildResponse(userPrompt, scenario)

/**
 * Parse user prompt for special commands
 * Examples:
 * - "[thinking:5s] your message" -> 5s thinking time
 * - "[error] your message" -> simulate error
 * - "[cite:3] your message" -> add 3 citations
 * @param {string} prompt - User's raw prompt
 * @returns {object} - Parsed command and content
 */
function parsePromptCommands(prompt)
```

#### 1.3 `chunk-simulator.js` - Streaming Logic
**Location:** `backend/debug/chunk-simulator.js`

**Responsibilities:**
- Split response into realistic chunks
- Control streaming speed
- Randomize chunk size and timing for realism

**Key Functions:**
```javascript
/**
 * Split text into chunks for streaming
 * @param {string} text - Full response text
 * @param {object} options - Chunking options
 * @param {number} options.minChars - Min chars per chunk (default: 10)
 * @param {number} options.maxChars - Max chars per chunk (default: 14)
 * @returns {Array<string>} - Array of chunks
 */
function chunkText(text, options = {})

/**
 * Stream chunks with realistic timing
 * @param {Array<string>} chunks - Array of text chunks
 * @param {Function} onChunk - Callback for each chunk
 * @param {object} options - Timing options
 * @param {number} options.minTokensPerSec - Min speed (default: 20)
 * @param {number} options.maxTokensPerSec - Max speed (default: 25)
 * @returns {Promise<void>}
 */
async function streamChunks(chunks, onChunk, options = {})

/**
 * Calculate delay for next chunk
 * @param {number} minTPS - Min tokens per second
 * @param {number} maxTPS - Max tokens per second
 * @returns {number} - Delay in milliseconds
 */
function calculateDelay(minTPS, maxTPS)
```

#### 1.4 `scenarios.json` - Test Scenarios
**Location:** `backend/debug/scenarios.json`

**Structure:**
```json
{
  "default": {
    "type": "echo",
    "description": "Echo back user's message",
    "thinking": {
      "enabled": true,
      "duration": "auto",
      "content": "Processing your request..."
    },
    "response": {
      "type": "echo",
      "prefix": "",
      "suffix": ""
    },
    "streaming": {
      "minCharsPerChunk": 10,
      "maxCharsPerChunk": 14,
      "minTokensPerSec": 20,
      "maxTokensPerSec": 25
    }
  },
  "markdown_showcase": {
    "type": "template",
    "description": "Display markdown showcase",
    "thinking": {
      "enabled": true,
      "duration": 2,
      "content": "Preparing markdown examples..."
    },
    "response": {
      "type": "static",
      "content": "## Markdown Showcase\n\n..."
    }
  },
  "long_response": {
    "type": "template",
    "description": "Test long response with heavy markdown",
    "response": {
      "type": "static",
      "content": "# Very Long Response\n\n..."
    },
    "streaming": {
      "minCharsPerChunk": 8,
      "maxCharsPerChunk": 12,
      "minTokensPerSec": 15,
      "maxTokensPerSec": 20
    }
  },
  "error_simulation": {
    "type": "error",
    "description": "Simulate API error",
    "error": {
      "message": "Simulated API error for testing",
      "delayMs": 1000
    }
  },
  "thinking_showcase": {
    "type": "template",
    "description": "Test thinking mode",
    "thinking": {
      "enabled": true,
      "duration": 5,
      "content": "This is a long thinking process...\n\nAnalyzing your request...\n\nPreparing response..."
    },
    "response": {
      "type": "static",
      "content": "Response after thinking."
    }
  }
}
```

---

### Phase 2: Integration with Main Process (Priority: HIGH)

#### 2.1 Modify `main.js` - Add Debug Detection
**Location:** `main.js` around line 3149

**Changes:**
```javascript
function runStandardStreaming(event, payload) {
  const reqId = payload.reqId;
  let messages = payload.messages || [];
  const model = payload.model || 'glm-4.5-flash';
  const provider = (payload.provider || 'openrouter').toLowerCase();

  // NEW: Check if this is a debug request
  const { isDebugRequest, handleDebugRequest } = require('./backend/debug/response-debugger');

  if (isDebugRequest(provider, model)) {
    log('DEBUG', 2, 'runStandardStreaming', 'Debug mode detected, routing to debugger');
    return handleDebugRequest(event, payload);
  }

  // ... existing code for real API calls
}
```

**Note:** Debug mode akan otomatis menggunakan smart title generator yang sudah ada. Tidak ada special handling untuk title generation - biarkan flow normal yang handle.

---

### Phase 3: Cleanup Renderer (Priority: HIGH)

#### 3.1 Remove DEBUG_MARKDOWN Code
**Location:** `renderer/renderer.js`

**Lines/Functions to REMOVE:**
1. **Constants [Line 360-370]:**
   - `DEBUG_MARKDOWN`
   - `MARKDOWN_TEST_SESSION_TYPE`
   - `MARKDOWN_TEST_TITLE`
   - `MARKDOWN_TEST_PROMPT`
   - `MARKDOWN_TEST_MODEL_INFO`
   - `DEFAULT_MARKDOWN_TEST_TEMPLATE`

2. **Helper Functions:**
   - `buildMarkdownTestScenario()` [Line 414-427]
   - `isMarkdownTestSession()` [Line 429-434]
   - `splitMarkdownForStreaming()` [Line 436-439]

3. **UI Control Functions:**
   - `updateMarkdownControls()` [Line 441-464]

4. **Main Functions:**
   - `startMarkdownTestFromWelcome()` [Line 466-500]
   - `runMarkdownTestTurn()` [Line 502-587]
   - `streamMarkdownTestResponse()` [Line 589-669]

5. **Event Listeners:**
   - Welcome button click handler [Line 14717-14728]
   - Chat button click handler [Line 15429-15443]
   - Enter key handler - remove markdown test check [Line 15411-15424]
   - Send button handler - remove markdown test check [Line 15449-15454]
   - `send()` function - remove markdown test check [Line 12730-12733]

#### 3.2 Remove UI Elements
**Location:** `renderer/index.html`

**Elements to REMOVE:**
1. `#markdown-test-welcome` button [Line 426]
2. `#markdown-test-chat` button [Line 737]

---

### Phase 4: Advanced Features (Priority: MEDIUM)

#### 4.1 Special Prompt Commands

User dapat menggunakan command khusus di prompt untuk control behavior:

**Syntax:**
```
[command:value] your actual message
```

**Supported Commands:**
- `[thinking:5s]` - Set thinking duration to 5 seconds
- `[think:auto]` - Auto-calculate thinking duration
- `[speed:fast]` - Fast streaming (30-35 tokens/sec)
- `[speed:slow]` - Slow streaming (10-15 tokens/sec)
- `[error]` - Simulate error after 2 seconds
- `[error:50%]` - Simulate error at 50% progress
- `[cite:3]` - Add 3 citations to response
- `[search:5]` - Simulate web search with 5 results
- `[scenario:markdown_showcase]` - Use specific scenario from JSON

**Examples:**
```
User: [thinking:10s] Explain quantum computing
→ 10 seconds thinking, then echo back the message

User: [speed:slow] [cite:5] Write about AI
→ Slow streaming with 5 citations

User: [scenario:markdown_showcase]
→ Load and display markdown showcase scenario

User: [error:75%] Test error handling
→ Stream 75% of response then error
```

#### 4.2 Enhanced Response Building

**Support for:**
- **Thinking Content:** Multi-line thinking with stages
- **Citations:** Numbered citations like Perplexity
- **Web Search Results:** Simulated search results
- **Token Usage:** Fake but realistic token counts
- **Code Blocks:** Syntax highlighted examples
- **Math Equations:** LaTeX support
- **Tables:** Complex markdown tables

#### 4.3 Scenario Configuration

**Add to `scenarios.json`:**
```json
{
  "code_heavy": {
    "type": "template",
    "description": "Test code rendering",
    "response": {
      "type": "static",
      "content": "```python\ndef fibonacci(n):\n    if n <= 1:\n        return n\n    return fibonacci(n-1) + fibonacci(n-2)\n```\n\nThis is the Fibonacci function..."
    }
  },
  "citation_test": {
    "type": "template",
    "description": "Test citations",
    "thinking": {
      "enabled": true,
      "content": "Searching for information..."
    },
    "response": {
      "type": "static",
      "content": "According to research[1], AI is advancing rapidly[2][3]."
    },
    "citations": [
      {
        "number": 1,
        "title": "AI Advances 2024",
        "url": "https://example.com/ai-2024",
        "snippet": "Recent developments in AI..."
      },
      {
        "number": 2,
        "title": "Machine Learning Progress",
        "url": "https://example.com/ml",
        "snippet": "ML techniques have improved..."
      },
      {
        "number": 3,
        "title": "Future of AI",
        "url": "https://example.com/future",
        "snippet": "Predictions for AI development..."
      }
    ]
  }
}
```

---

### Phase 5: Testing & Documentation (Priority: MEDIUM)

#### 5.1 Create Test Suite

**Location:** `backend/debug/__tests__/`

**Test Files:**
- `response-debugger.test.js` - Main handler tests
- `chunk-simulator.test.js` - Chunking and timing tests
- `scenarios.test.js` - Scenario loading and validation

**Test Coverage:**
- Debug request detection
- Prompt command parsing
- Chunk generation with size constraints
- Streaming timing accuracy
- Scenario loading
- Error simulation
- Edge cases (empty prompt, very long prompt, special characters)

#### 5.2 Update Documentation

**Files to Update:**
1. `md/debug-markdown.md` → Rename to `md/response-debug.md`
2. Update with new architecture
3. Add usage examples
4. Add troubleshooting guide

**New Documentation:**
- `backend/debug/README.md` - Module documentation
- API reference for debug functions
- Scenario configuration guide
- Prompt command reference

---

## Migration Steps

### Step 1: Preparation
1. ✅ Create `backend/debug/` directory
2. ✅ Review all DEBUG_MARKDOWN code
3. ✅ Document current functionality
4. ✅ Create backup branch

### Step 2: Backend Implementation (Est: 2-3 hours)
1. Create `response-debugger.js` with basic structure
2. Implement `isDebugRequest()` function
3. Implement `handleDebugRequest()` with echo mode
4. Create `chunk-simulator.js` with chunking logic
5. Implement realistic streaming timing
6. Create `scenarios.json` with default scenarios
7. Test basic echo functionality

### Step 3: Integration (Est: 1 hour)
1. Modify `main.js` to detect debug requests
2. Route debug requests to new handler
3. Test IPC communication
4. Verify streaming works end-to-end

### Step 4: Cleanup (Est: 1 hour)
1. Remove all DEBUG_MARKDOWN code from `renderer.js`
2. Remove debug UI elements from `index.html`
3. Clean up any imports/references
4. Test that normal flow still works

### Step 5: Advanced Features (Est: 2-3 hours)
1. Implement prompt command parsing
2. Add scenario loading system
3. Implement special features (citations, thinking, etc)
4. Test all commands and scenarios

### Step 6: Testing & Documentation (Est: 1-2 hours)
1. Write unit tests
2. Manual testing all scenarios
3. Update documentation
4. Create usage guide

**Total Estimated Time: 8-11 hours**

---

## Benefits After Implementation

### 1. **Better Developer Experience**
- No special UI needed
- Test like using real AI
- Easy to add new scenarios
- Quick iteration on UI changes

### 2. **More Realistic Testing**
- Same flow as production
- Test thinking mode
- Test web search UI
- Test error handling
- Test token usage display

### 3. **Better Code Quality**
- Modular architecture
- Separation of concerns
- Easy to maintain
- Easy to extend
- Reusable components

### 4. **Flexibility**
- Configurable scenarios via JSON
- Prompt commands for quick testing
- Speed control
- Error simulation
- No code changes needed for new tests

### 5. **Performance**
- No UI overhead from debug controls
- Clean renderer code
- Backend processing (doesn't block UI)

---

## Example Usage

### Basic Echo Test
```
1. User selects provider "local" or model "debugging"
2. User types: "Hello world"
3. System echoes back: "Hello world"
4. Streaming speed: 20-25 tokens/sec
5. Chunk size: 10-14 chars
```

### Advanced Test with Commands
```
1. User types: "[thinking:5s] [speed:slow] Explain AI"
2. System shows thinking for 5 seconds
3. System streams response slowly (10-15 tokens/sec)
4. Response: "Explain AI" (echo mode)
```

### Scenario Test
```
1. User types: "[scenario:markdown_showcase]"
2. System loads markdown_showcase scenario from JSON
3. System displays thinking: "Preparing markdown examples..."
4. System streams full markdown showcase content
```

---

## File Structure After Implementation

```
Clustrix-AI-Platform/
├── backend/
│   └── debug/
│       ├── response-debugger.js      # NEW: Main debug handler
│       ├── chunk-simulator.js        # NEW: Streaming simulation
│       ├── scenarios.json            # NEW: Test scenarios config
│       ├── README.md                 # NEW: Module documentation
│       └── __tests__/
│           ├── response-debugger.test.js
│           ├── chunk-simulator.test.js
│           └── scenarios.test.js
├── renderer/
│   ├── renderer.js                   # MODIFIED: Remove DEBUG_MARKDOWN
│   └── index.html                    # MODIFIED: Remove debug buttons
├── main.js                           # MODIFIED: Add debug detection
└── md/
    ├── response-debug.md             # RENAMED & UPDATED
    └── ai-stream.md                  # Keep as is
```

---

## Breaking Changes

### For Users:
- ❌ No more special "Markdown Test Session"
- ❌ No more debug buttons in UI
- ✅ Use normal chat with provider "local" or model "debugging"
- ✅ More realistic testing experience

### For Developers:
- ❌ Can't call `runMarkdownTestTurn()` directly
- ❌ No more `isMarkdownTestSession()` helper
- ✅ Use normal send flow with debug provider
- ✅ Configure scenarios via JSON
- ✅ Use prompt commands for testing

---

## Success Criteria

### Must Have:
- ✅ Debug mode works via provider/model selection
- ✅ Echo mode works (user prompt → same response)
- ✅ Streaming works with configurable speed
- ✅ Chunk size respects 10-14 char constraint
- ✅ Token speed respects 20-25 tokens/sec constraint
- ✅ All DEBUG_MARKDOWN code removed
- ✅ Normal flow unaffected
- ✅ Basic scenarios working (default, markdown_showcase)

### Nice to Have:
- ✅ Prompt commands working
- ✅ Multiple scenarios loaded from JSON
- ✅ Thinking mode simulation
- ✅ Citation simulation
- ✅ Error simulation
- ✅ Web search simulation
- ✅ Unit tests coverage >80%

### Future Enhancements:
- 🔮 Record and replay real API responses
- 🔮 Custom scenario builder UI
- 🔮 Performance profiling mode
- 🔮 Network condition simulation (slow, unreliable)
- 🔮 Response caching for offline development

---

## Risk Mitigation

### Risk 1: Breaking Existing Tests
**Mitigation:**
- Create feature branch
- Test thoroughly before merge
- Keep backup of DEBUG_MARKDOWN code

### Risk 2: Performance Issues
**Mitigation:**
- Profile streaming performance
- Use async/await properly
- Don't block main thread

### Risk 3: Configuration Complexity
**Mitigation:**
- Start simple (echo mode only)
- Add features incrementally
- Document all options clearly

### Risk 4: Maintenance Overhead
**Mitigation:**
- Keep code modular
- Write good tests
- Document architecture well

---

## Next Steps

1. **Review this plan** - Get feedback and approval
2. **Create task breakdown** - Detailed subtasks for each phase
3. **Setup development branch** - `feature/response-debug`
4. **Start Phase 1** - Backend setup
5. **Iterate and test** - Incremental implementation

---

## Questions to Consider

1. Should we keep `DEBUG_MARKDOWN` flag for gradual migration?
2. Do we want backward compatibility mode?
3. Should scenarios be in JSON or JS modules?
4. Do we need UI for scenario management?
5. Should we add analytics/metrics for debug usage?

---

## Conclusion

This improvement transforms the debug system from a hacky markdown tester into a professional, modular, and powerful development tool. It enables realistic testing without API costs, maintains clean code architecture, and provides flexibility for future enhancements.

**Key Takeaway:** Moving debug logic to backend + JSON configuration = Modular, Maintainable, Powerful! 🚀
