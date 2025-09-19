# Clustrix - AI Chat Assistant

## Architecture Overview

**Clustrix** is an Electron-based multi-provider AI chat desktop application with sophisticated streaming, session management, model switching, and professional UX features.

### Key Components

- **Main Process** (`main.js`): Handles IPC, file operations, AI streaming, web search integration
- **Renderer Process** (`renderer/`): UI logic, stream management, session handling, autoscroll system
- **Preload Script** (`preload.js`): Secure IPC bridge exposing `window.api`
- **Custom Scrollbar System** (`public/rolling/`): Advanced textarea auto-resize with custom scrollbars
- **Artifacts System**: Code snippet management with syntax highlighting using Prism

### Multi-Provider Architecture

The app supports 5 AI providers with per-provider configuration:
- **OpenRouter**, **Groq**, **Gemini**, **Z AI**, **Custom OpenAI-style**
- Each provider maintains separate: Base URL, API Key, model list
- Configuration stored in `${userData}/ai-model.conf.json`

## Development Workflows

### Debugging Protocol

**CRITICAL RULE**: Never run `npm run dev` unless specifically requested. The user will provide logs and debugging information manually.

**Debugging Workflow**:
1. User reports issues with specific functionality
2. Agent analyzes code without running the application
3. Agent proposes fixes based on code analysis
4. User tests the fixes and provides logs/feedback
5. Agent iterates based on user-provided debugging information

**Log Interpretation**: When user provides logs, look for:
- Error patterns in structured logs with emoji indicators
- Session creation/navigation flows
- IPC communication patterns
- UI state changes and page transitions

### Running the App
```bash
# Development mode - ONLY when user requests
npm run dev
# or with Z AI environment 
npm run node  # Uses preset Z_API_KEY environment

# Building
npm run make
```

### Key File Locations
- **Sessions**: `${userData}/chat_data.json`
- **Model Config**: `${userData}/ai-model.conf.json`  
- **Artifacts**: `${userData}/artifacts.json`
- **Projects**: `${userData}/projects.json`
- **Debug Logs**: `${userData}/app.log`
- **Debug Mode**: Triggered when `window.api` is undefined

### Logging Standards

**MANDATORY LOGGING RULE**: Always use the structured `log()` function instead of `console.log()`.

```javascript
// ✅ CORRECT - Use structured logging
log("PROJECTS", 2, "createNewProject", "Project created successfully", { 
  projectId: project.id, 
  name: project.name 
});

// ❌ WRONG - Never use console.log
console.log("Project created:", project.id);
```

**Log Function Signature**:
```javascript
log(context, level, functionName, message, details = {})
```

**Parameters**:
- `context`: Module/section (e.g., "PROJECTS", "SESSION", "UI", "LANGCHAIN")
- `level`: 0=TRACE, 1=DEBUG, 2=INFO, 3=WARN, 4=ERROR
- `functionName`: Current function name for traceability
- `message`: Human-readable description
- `details`: Object with relevant data for debugging

**Backend Integration**: The `log()` function automatically:
- Sends logs to backend terminal via `window.api.logging.write()`
- Stores in `${userData}/app.log` for persistent debugging
- Queues logs if API not ready and flushes when available
- Provides console output for browser DevTools

**Benefits**:
- **Unified Logging**: All logs centralized in app.log database
- **Backend Visibility**: Logs appear in terminal where app is running
- **Structured Data**: Searchable and filterable log entries
- **Production Ready**: Controlled by LOGGING flag for production builds

## Critical Patterns

### Advanced Autoscroll System

**High-Performance Implementation**: Optimized for streaming up to 1900 tokens/second with sophisticated user intent detection.

```javascript
// Core autoscroll functions
smartScrollToBottom()           // Height-based detection with 180px threshold
debouncedScrollToBottom()       // Debounced for performance
isNearBottom(scroller, threshold) // Configurable threshold detection
```

**Professional Features**:
- **Response Spacer System**: 0→50vh→0 animated spacers like Claude/ChatGPT
- **Mouse Wheel Intent Detection**: Pure wheel event detection with 2-second cooldown
- **Conflict Resolution**: Strict separation between wheel intent and position-based re-enabling
- **Performance Optimized**: Handles high-speed streaming without UI lag

**Mouse Wheel Cooldown Pattern**:
```javascript
scroller.addEventListener('wheel', (e) => {
  if (e.deltaY < 0 && !scrollDetectionCooldown) { // Wheel UP only
    isUserScrolledUp = true;
    autoScrollEnabled = false;
    scrollDetectionCooldown = true; // 2-second strict cooldown
    // During cooldown: ALL scroll events ignored
    // After cooldown: Manual return to bottom required
  }
}, { passive: true });
```

### Response Spacer System

**Professional UX Enhancement**: Animated spacers that create breathing room during AI responses.

```javascript
// Spacer lifecycle
createResponseSpacer()    // Creates 0px spacer after AI message
expandSpacer()           // Animates to 50vh with cubic-bezier
collapseSpacer()         // Smooth collapse back to 0px  
removeSpacer()           // Clean removal from DOM
```

**CSS Animations**:
```css
.response-spacer {
  transition: height 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.response-spacer.expanded { height: 50vh; }
```

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

### Form State Management

**Draft System**: Sophisticated auto-save with race condition prevention.

```javascript
// Auto-save with debouncing
saveDraftDebounced(sessionId, content) // 300ms debounce
loadDraftForSession(sessionId)         // Restore on session switch

// Race condition prevention
justSentMessage = true; // Prevents draft restoration after send
setTimeout(() => { justSentMessage = false; }, 1000);
```

**Pattern in `setCurrent()`**:
```javascript
// Skip draft restoration if we just sent a message
const draft = (justSentMessage || !current || !current.id) ? '' : loadDraftForSession(current.id);
```

### Artifacts System

**Code Management**: Save, organize, and syntax highlight code snippets from chat.

```javascript
// Artifact structure
{
  id: "unique-id",
  title: "Code Title",
  code: "function example() {...}",
  language: "javascript",
  created_at: "2024-...",
  isFavorite: false,
  sessionId: "origin-session",
  messageIndex: 5
}
```

**Syntax Highlighting**: Uses Prism.js for professional code display.
```javascript
function createHighlightedCode(code, language) {
  // Maps 25+ languages (js→javascript, py→python, etc.)
  // Creates <pre><code class="language-x"> structure
  // Applies Prism.highlightAllUnder() 
  return highlightedHTML;
}
```

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

## Performance & UX Optimizations

### High-Speed Streaming
- **Optimized for 1900 tokens/second**: Debounced autoscroll prevents UI lag
- **Smart Threshold Detection**: 180px near-bottom detection for optimal UX
- **Memory Management**: Stream garbage collection prevents memory leaks

### Professional UX Features
- **Response Spacers**: 0→50vh→0 animations for breathing room
- **Intent-Based Scrolling**: Mouse wheel detection vs position-based scrolling
- **Form State Protection**: Prevents draft restoration race conditions
- **Syntax Highlighting**: Prism.js integration for code in chat and artifacts

### Visual Polish
- **Smooth Animations**: Cubic-bezier transitions for professional feel
- **Consistent Styling**: Unified design system across all components
- **Responsive Design**: Proper handling of different screen sizes and content

## Debugging Workflows

### Autoscroll Debugging
```javascript
// Check scroll state
console.log('isUserScrolledUp:', isUserScrolledUp);
console.log('autoScrollEnabled:', autoScrollEnabled);
console.log('scrollDetectionCooldown:', scrollDetectionCooldown);

// Test scroll functions
smartScrollToBottom();
isNearBottom(getChatScroller(), 180);
```

### Stream Debugging
```javascript
// Check active streams
console.log(streamManager.activeStreams);
// Test custom scrollbar
testTextareaExpansion('msg-central'); // from force-init.js
```

### Artifacts Debugging
```javascript
// Check artifacts state
console.log('codeArtifacts:', codeArtifacts);
// Test syntax highlighting
createHighlightedCode('console.log("test")', 'javascript');
```

### Log System
- Main process logs to `${userData}/app.log`
- Renderer logs via `log(context, level, func, message, details)`

## Common Gotchas

1. **Autoscroll Race Conditions**: Mouse wheel events must be handled separately from position-based scrolling
2. **Form State Timing**: Use `justSentMessage` flag to prevent draft restoration immediately after sending
3. **Stream Management**: Always check `streamManager.isStreamingInSession()` before starting new streams
4. **DOM Hydration**: Stream references can become stale when switching sessions - `gcZombies()` handles cleanup
5. **Syntax Highlighting**: Always use `createHighlightedCode()` for consistent Prism.js highlighting
6. **Response Spacers**: Must be removed when streams complete to prevent layout issues
7. **Model Provider Switching**: Each provider maintains separate model lists and credentials
8. **Custom Scrollbar DOM Mutations**: The `updateLayout()` method must re-query textarea elements to handle dynamic content changes
9. **Performance**: Debounce scroll events and use `requestAnimationFrame` for smooth animations
10. **Cooldown System**: Never break 2-second wheel cooldown prematurely - manual intervention required