# Clustrix - AI Chat Assistant

## Architecture Overview

**Clustrix** is an Electron-based multi-provider AI chat desktop application with sophisticated streaming, session management, and model switching capabilities.

### Key Components

- **Main Process** (`main.js`): Handles IPC, file operations, AI streaming, web search integration
- **Renderer Process** (`renderer/`): UI logic, stream management, session handling  
- **Preload Script** (`preload.js`): Secure IPC bridge exposing `window.api`
- **Custom Scrollbar System** (`public/rolling/`): Advanced textarea auto-resize with custom scrollbars

### Multi-Provider Architecture

The app supports 5 AI providers with per-provider configuration:
- **OpenRouter**, **Groq**, **Gemini**, **Z AI**, **Custom OpenAI-style**
- Each provider maintains separate: Base URL, API Key, model list
- Configuration stored in `${userData}/ai-model.conf.json`

## Development Workflows

### Running the App
```bash
# Development mode
npm run dev
# or with Z AI environment 
npm run node  # Uses preset Z_API_KEY environment

# Building
npm run make
```

### Key File Locations
- **Sessions**: `${userData}/chat_data.json`
- **Model Config**: `${userData}/ai-model.conf.json`  
- **Debug Logs**: `${userData}/app.log`
- **Debug Mode**: Triggered when `window.api` is undefined

## Critical Patterns

### Stream Management (`streamManager`)

**Core Concept**: One active stream per session to prevent message interleaving.

```javascript
// Stream lifecycle
streamManager.startStream(streamId, { controller, aiNode, session, messageIndex })
streamManager.stopStream(streamId)  // Cancel and cleanup
streamManager.gcZombies()           // Clean stale/offscreen streams
```

**Key Features**:
- **Resume Logic**: Auto-resumes stale streams (>6s) with `kickSoftResume()`
- **Keyed Tracking**: `byKey` maps `"sessionId:messageIndex"` to streamId
- **DOM Hydration**: Re-associates streams with DOM nodes after session switching

### Custom Scrollbar System

**Location**: `public/rolling/rolling.js`

**Pattern**: TextareaCustomScrollbar class with shell-based initialization:
```javascript
// Auto-initializes all .ta-shell elements
// Handles auto-resize up to maxHeight: 350px
// Custom drag/scroll implementation
const scrollbar = new TextareaCustomScrollbar(shellElement, { maxHeight: 350 })
```

**Critical**: Always re-query textarea on `updateLayout()` to handle DOM mutations.

### IPC Communication Patterns

**Streaming**:
```javascript
// Renderer → Main
window.api.chat.stream(messages, model, options, onEvent)
// Main responds via: chat:chunk-{id}, chat:done-{id}, chat:error-{id}
```

**Data Persistence**:
```javascript
// Models configuration
window.api.models.load/save(config)
// Session data  
window.api.sessions.load/save(data)
```

## Project-Specific Conventions

### Message Format
```javascript
// Session structure
{
  id: "unique-id",
  name: "Generated Title", 
  messages: [["user", "content"], ["ai", "response"]],
  files: [{ name, content, type }]
}
```

### Model Configuration
```javascript
// Per-provider structure in ai-model.conf.json
{
  active: { platform: "openrouter", model: "deepseek/deepseek-chat-v3.1:free" },
  providers: {
    openrouter: {
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "sk-...",
      models: [{ id: "model-id", label: "Display Name", note: "Description" }]
    }
  }
}
```

### Debug Mode Simulation
When `DEBUG_MODE = true`, the app simulates streaming responses instead of making API calls:
```javascript
// Mock streaming with word-by-word delays
const chunks = response.split(" ");
// Interval-based token emission for testing UI
```

## Critical Integration Points

### Thinking Mode
Special streaming mode where AI responses include `<thinking>` tags:
- Parsed separately from main response
- Displayed in collapsible UI sections
- Handled via `appendThinking()` function

### Web Search Integration  
- Uses SerpAPI for search results
- Integrated into message context before AI generation
- Status updates via `search:status` IPC events

### Continue Placeholder System
When streams are interrupted:
- Shows "Response interrupted" banner with Continue/Close buttons
- Auto-hides after 5 seconds
- Continue button sends "continue" prompt to resume generation

### File Upload Support
- Supports text files, Office docs (via mammoth), Excel (custom xlsx parser)
- Files attached per-session in `session.files[]`
- Processed and included in AI context

## Debugging Workflows

### Stream Debugging
```javascript
// Check active streams
console.log(streamManager.activeStreams);
// Test custom scrollbar
testTextareaExpansion('msg-central'); // from force-init.js
```

### Log System

- Main process logs to `${userData}/app.log`
- Renderer logs via `log(context, level, func, message, details)`


## Common Gotchas

1. **Stream Race Conditions**: Always check `streamManager.isStreamingInSession()` before starting new streams
2. **DOM Hydration**: Stream references can become stale when switching sessions - `gcZombies()` handles cleanup
3. **Model Provider Switching**: Each provider maintains separate model lists and credentials
4. **Custom Scrollbar DOM Mutations**: The `updateLayout()` method must re-query textarea elements to handle dynamic content changes
5. **Title Generation**: Can use separate model from chat model via "Model for Title Generator" setting