# Perbedaan DEBUG_MODE vs Response Debug

## 📋 Overview

Ada **2 sistem debug** yang berbeda di aplikasi Clustrix:

1. **DEBUG_MODE** - Browser-only development mode (existing, line 297)
2. **Response Debug** - Backend debugging system (newly implemented)

Keduanya memiliki **tujuan dan cara kerja yang berbeda**.

---

## 🔍 **1. DEBUG_MODE (Existing System)**

### **Definisi**
```javascript
// renderer/renderer.js:297
const DEBUG_MODE = typeof window.api === "undefined";
```

### **Trigger Condition**
- **Aktif ketika:** `window.api` tidak tersedia (undefined)
- **Scenario:** Saat aplikasi dibuka di **browser biasa** (bukan Electron)
- **Purpose:** Testing renderer tanpa backend Electron

### **Kapan DEBUG_MODE = true?**
```
✅ Browser (Chrome, Firefox, Edge): DEBUG_MODE = true
❌ Electron App: DEBUG_MODE = false
```

---

## 🎯 **Fungsi-fungsi yang Dipengaruhi DEBUG_MODE**

### **A. Storage Operations**

#### **1. Load Data (line 10648-10650)**
```javascript
const data = DEBUG_MODE
  ? JSON.parse(localStorage.getItem("clustrix-data"))  // Browser: localStorage
  : await window.api.sessions.load();                  // Electron: IPC call
```

**Flow:**
- **DEBUG_MODE (Browser):** Load dari `localStorage`
- **Production (Electron):** Load dari SQLite via IPC

---

#### **2. Save Data (line 10840-10847)**
```javascript
if (DEBUG_MODE) {
  // In debug mode, always do full save to localStorage
  localStorage.setItem("clustrix-data", JSON.stringify({
    sessions: state.sessions,
    settings: state.settings
  }));
} else {
  await window.api.sessions.save(dataToSave);  // IPC call
}
```

**Flow:**
- **DEBUG_MODE:** Full save ke `localStorage` (tidak ada incremental save)
- **Production:** Incremental/full save ke SQLite via IPC

**Note:** Line 10820 - Incremental save **disabled** untuk DEBUG_MODE:
```javascript
const shouldUseIncremental = dirtySessionIds.size > 0 &&
                              dirtySessionIds.size < state.sessions.length &&
                              !DEBUG_MODE; // Full save in debug mode for simplicity
```

---

#### **3. Load Models Config (line 3188-3190)**
```javascript
const conf = DEBUG_MODE
  ? JSON.parse(localStorage.getItem("models-conf"))
  : await window.api.models.load();
```

**Flow:**
- **DEBUG_MODE:** Load dari `localStorage`
- **Production:** Load dari file via IPC

---

#### **4. Save Models Config (line 2734-2736, 14601)**
```javascript
if (!DEBUG_MODE) {
  await window.api?.models?.save?.(conf);
}
```

**Flow:**
- **DEBUG_MODE:** Skip save (hanya localStorage)
- **Production:** Save ke file via IPC

---

### **B. AI Response Simulation (line 12097-12199)**

Ini adalah **fitur paling kompleks** dari DEBUG_MODE.

#### **Main Logic**
```javascript
if (DEBUG_MODE) {
  // Simulate AI streaming response
  const simulatedController = {
    cancel: () => {
      clearTimeout(timeout);
      clearInterval(interval);
      handler(null);
    },
  };

  streamManager.startStream(streamId, {
    controller: simulatedController,
    aiNode,
    session,
    messageIndex: aiMessageIndex,
    messages,
    contextPrompt: text,
    fullResponse: initialFullResponse,
  });

  // ... simulation logic
}
```

---

#### **Special Commands (via user prompt)**

**1. `think-indicator` Command**
```javascript
if (text === "think-indicator") {
  log("DEBUG", 2, "startStream", "Mode Debug: think-indicator (50s wait)");
  timeout = setTimeout(() => {
    startDemoStreaming(DEMO_RESPONSE, 80);
  }, 50000);  // Wait 50 seconds before streaming
  return;
}
```

**Behavior:**
- Wait 50 seconds (simulating long thinking)
- Then stream DEMO_RESPONSE with 80ms delay per word

---

**2. `think-indicator&think-mode` Command**
```javascript
else if (text === "think-indicator&think-mode") {
  log("DEBUG", 2, "startStream", "Mode Debug: think-indicator&think-mode");
  const thinkingTextEl = aiNode.querySelector(".thinking-text-indicator");

  timeout = setTimeout(() => {
    if (thinkingTextEl) {
      typewriterEffect(thinkingTextEl, DEMO_RESPONSE, {
        speed: 10,
        punctuationDelay: 100,
      });
    }

    const thinkingDuration = DEMO_RESPONSE.length * 15;
    setTimeout(() => {
      if (thinkingTextEl) thinkingTextEl.innerHTML = "";
      const div = aiNode.querySelector(".message-text");
      if (div) div.innerHTML = "";

      startDemoStreaming(DEMO_RESPONSE, 80);
    }, thinkingDuration + 500);
  }, 3000);
  return;
}
```

**Behavior:**
1. Wait 3 seconds
2. Show thinking text with typewriter effect (10ms per char)
3. Wait until thinking finishes (length * 15ms + 500ms)
4. Clear thinking text
5. Stream actual response (80ms per word)

---

**3. `slow` Modifier**
```javascript
const isSlow = /slow/.test(text);
const delay = isSlow ? 250 : 80;
```

**Example:** User prompt contains "slow"
- Delay: 250ms per word (slower)
- Normal: 80ms per word

---

**4. `error` Command**
```javascript
const isImmediateError = /error/.test(text) && !/\d+error/.test(text);

if (isImmediateError) {
  setTimeout(() => handler({ error: "Simulated failure." }), 500);
  return;
}
```

**Behavior:** Simulate immediate error after 500ms

---

**5. `[number]error` Command**
```javascript
const errorMatch = text.match(/(\d+)error/);
const failAtPercent = errorMatch ? parseInt(errorMatch[1], 10) : null;
const failAtIndex = failAtPercent
  ? Math.floor(chunks.length * (failAtPercent / 100))
  : -1;

interval = setInterval(() => {
  if (failAtIndex !== -1 && i >= failAtIndex) {
    clearInterval(interval);
    handler({ error: "Simulated failure." });
    return;
  }
  // ... continue streaming
}, delay);
```

**Example:** `50error` in prompt
- Stream 50% of response
- Then simulate error

---

#### **Default Streaming Simulation**
```javascript
const startDemoStreaming = (response, delay) => {
  const chunks = response.split(" ");
  let i = 0;
  interval = setInterval(() => {
    if (i < chunks.length) {
      handler(chunks[i] + " ");
      i++;
    } else {
      clearInterval(interval);
      handler(null);  // Signal completion
    }
  }, delay);
};

startDemoStreaming(DEMO_RESPONSE, 80);
```

**Flow:**
1. Split DEMO_RESPONSE by spaces
2. Stream word by word
3. 80ms delay per word (or 250ms if "slow")
4. Send `null` to signal completion

---

## 🆚 **2. Response Debug (New System)**

### **Definisi**
Backend-based debugging system untuk simulate AI responses **tanpa API call**.

### **Trigger Condition**
```javascript
// main.js:3149
const { isDebugRequest, handleDebugRequest } = require('./backend/debug/response-debugger');
if (isDebugRequest(provider, model)) {
  log('INFO', 'runStandardStreaming', 'Debug mode detected - routing to response debugger');
  return handleDebugRequest(event, payload);
}

// response-debugger.js:41-46
function isDebugRequest(provider, model) {
  const providerLower = (provider || '').toLowerCase();
  const modelLower = (model || '').toLowerCase();
  return providerLower === 'local' || modelLower === 'debugging';
}
```

**Aktif ketika:**
- Provider = `"local"` (case-insensitive)
- **ATAU** Model = `"debugging"` (case-insensitive)

---

### **Architecture**

```
User sends message
      ↓
renderer.js → send()
      ↓
main.js → runStandardStreaming()
      ↓
Detect: provider='local' OR model='debugging'
      ↓
route to: handleDebugRequest()
      ↓
Parse prompt commands: [thinking:5s], [speed:fast], [scenario:name]
      ↓
Build response config from scenarios.json
      ↓
simulateWithThinking()
      ↓
Stream chunks: 10-14 chars, 20-25 tokens/sec
      ↓
Send via IPC: chat:chunk-{reqId}, chat:done-{reqId}
      ↓
renderer receives and displays
```

---

### **Files**

1. **backend/debug/response-debugger.js** - Main handler
2. **backend/debug/chunk-simulator.js** - Streaming simulation
3. **backend/debug/scenarios.json** - Test scenarios

---

### **Features**

#### **A. Prompt Commands**

**1. `[thinking:Xs]` or `[think:Xs]`**
```javascript
// Example: "[thinking:5s] What is React?"
// Result: 5 seconds thinking, then response
```

**2. `[speed:fast|slow|medium]`**
```javascript
// [speed:fast] → 35-45 tokens/sec
// [speed:slow] → 8-12 tokens/sec
// [speed:medium] → 15-20 tokens/sec (default: 20-25)
```

**3. `[scenario:name]`**
```javascript
// [scenario:markdown_showcase] → Load markdown scenario
// [scenario:long_response] → Load long response scenario
```

**4. `[error]` or `[error:50%]`**
```javascript
// [error] → Immediate error after 1s
// [error:50%] → Error at 50% progress (not implemented yet)
```

---

#### **B. Scenarios (scenarios.json)**

**1. default (echo)**
```json
{
  "type": "echo",
  "thinking": {
    "enabled": true,
    "duration": "auto",
    "content": "Processing your request..."
  },
  "streaming": {
    "minCharsPerChunk": 10,
    "maxCharsPerChunk": 14,
    "minTokensPerSec": 20,
    "maxTokensPerSec": 25
  }
}
```

**2. markdown_showcase** - Showcase markdown rendering

**3. long_response** - Test long content with heavy markdown

**4. error_simulation** - Test error handling

**5. thinking_showcase** - Test thinking mode with detailed reasoning

**6. fast_response** - Test fast streaming (35-45 TPS)

**7. slow_response** - Test slow streaming (8-12 TPS)

---

#### **C. Streaming Simulation**

**chunk-simulator.js:**
```javascript
function chunkText(text, options = {}) {
  const { minChars = 10, maxChars = 14 } = options;
  const chunks = [];
  let currentPos = 0;

  while (currentPos < text.length) {
    // Random chunk size between min and max
    const chunkSize = Math.floor(Math.random() * (maxChars - minChars + 1)) + minChars;
    const chunk = text.substring(currentPos, currentPos + chunkSize);
    if (chunk.length > 0) chunks.push(chunk);
    currentPos += chunkSize;
  }

  return chunks;
}

function calculateDelay(minTPS, maxTPS) {
  const tokensPerSec = Math.random() * (maxTPS - minTPS) + minTPS;
  return Math.floor(1000 / tokensPerSec);
}
```

**Realistic randomization:**
- Chunk size: 10-14 characters (random per chunk)
- Delay: 20-25 tokens/sec (random per chunk)

---

#### **D. Thinking Phase**

```javascript
function simulateWithThinking(params) {
  const {
    thinkingContent,
    thinkingDuration = 0,
    responseContent,
    onThinkingChunk,
    onThinkingComplete,
    onResponseChunk,
    onComplete,
    streamingOptions = {}
  } = params;

  // If thinking enabled, stream thinking first
  if (thinkingContent && thinkingDuration > 0) {
    const thinkingChunks = chunkText(thinkingContent, {
      minChars: 15,
      maxChars: 25
    });

    streamChunks(
      thinkingChunks,
      onThinkingChunk,
      {
        minTokensPerSec: 30,
        maxTokensPerSec: 40,
        onComplete: () => {
          onThinkingComplete(thinkingDuration);
          // Add delay before starting response
          setTimeout(startResponseStreaming, 100);
        }
      }
    );
  } else {
    // No thinking, start response immediately
    startResponseStreaming();
  }
}
```

---

#### **E. Title Generation**

**renderer.js:10969-11039**
```javascript
async function generateAndSetTitle(session) {
  // Check if this is a debug session
  const aiMessage = session.messages.find((m) => m[0] === "ai");
  const modelInfo = aiMessage?.[2] || {};
  const isDebugSession =
    (modelInfo.provider || '').toLowerCase() === 'local' ||
    (modelInfo.model || '').toLowerCase() === 'debugging';

  try {
    // Use smart title generator (API or local)
    let title = await window.api.chat.titleSuggest(userPrompt, cfg.model, {...});

    // Add [DG] prefix for debug sessions
    const finalTitle = isDebugSession ? `[DG] ${title || "New Chat"}` : (title || "New Chat");
    session.name = finalTitle.slice(0, 70);
  } catch (e) {
    // Fallback to local SmartTitleGenerator
    const generator = new SmartTitleGenerator();
    const title = generator.generate(userPromptRaw);

    // Add [DG] prefix for debug sessions
    const finalTitle = isDebugSession ? `[DG] ${title}` : title;
    session.name = finalTitle.slice(0, 70);
  }
}
```

**Result:**
- Debug session: `[DG] Explain React Hooks`
- Normal session: `Explain React Hooks`

---

## 📊 **Comparison Table**

| Feature | DEBUG_MODE | Response Debug |
|---------|-----------|----------------|
| **Trigger** | `window.api === undefined` | `provider='local'` OR `model='debugging'` |
| **Scope** | Browser-only testing | Electron + Browser |
| **Location** | Renderer only | Backend + Renderer |
| **Storage** | localStorage only | SQLite (via IPC) |
| **Streaming** | Word-based (split by space) | Character-based (10-14 chars random) |
| **Speed Control** | Fixed 80ms or 250ms | Configurable TPS (tokens/sec) |
| **Commands** | Prompt keywords (slow, error) | Structured `[command:value]` |
| **Scenarios** | Hardcoded DEMO_RESPONSE | JSON configuration |
| **Thinking** | Special commands only | Auto-duration + streaming |
| **Cancellation** | Manual interval/timeout clear | Cancellation via reqId |
| **Title** | "Debug: {prompt}" (old, removed) | `[DG] {smart title}` |
| **Error Simulation** | `error` or `50error` | `[error]` or `[error:50%]` |
| **Modularity** | Inline in renderer | Separate backend modules |
| **Extensibility** | Hard to extend | Easy via scenarios.json |

---

## 🎯 **Use Cases**

### **DEBUG_MODE:**
1. **Quick renderer testing** tanpa setup Electron
2. **UI development** di browser devtools
3. **Rapid prototyping** tanpa backend
4. **localStorage debugging**

**Example Flow:**
```bash
# Open index.html directly in browser
open renderer/index.html

# window.api will be undefined
# DEBUG_MODE = true
# All data stored in localStorage
```

---

### **Response Debug:**
1. **Testing streaming behavior** tanpa API calls
2. **Scenario-based testing** (markdown, long response, errors)
3. **Performance testing** (fast/slow speeds)
4. **Thinking mode testing**
5. **Integration testing** with full Electron stack

**Example Flow:**
```javascript
// In model settings, set:
provider: "local"
model: "debugging"

// Send message with commands:
"[thinking:3s] [speed:fast] Explain React hooks"

// Result:
// 1. 3s thinking phase (streamed)
// 2. Fast response (35-45 TPS)
// 3. Echo user prompt
// 4. Title: "[DG] React Hooks Explained"
```

---

## 🔄 **When Each System is Active**

```
┌─────────────────────────────────────┐
│         Browser (no Electron)       │
│  window.api = undefined             │
│  ✅ DEBUG_MODE = true               │
│  ❌ Response Debug = inactive       │
│  Storage: localStorage              │
│  Streaming: Word-based simulation   │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│    Electron (normal operation)      │
│  window.api = defined               │
│  ❌ DEBUG_MODE = false              │
│  ✅ Response Debug = active IF      │
│     provider='local' OR             │
│     model='debugging'               │
│  Storage: SQLite via IPC            │
│  Streaming: Real API or Debug       │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│   Electron + Debug Model Selected   │
│  window.api = defined               │
│  ❌ DEBUG_MODE = false              │
│  ✅ Response Debug = active         │
│  Storage: SQLite via IPC            │
│  Streaming: Realistic simulation    │
│  Title: [DG] prefix                 │
└─────────────────────────────────────┘
```

---

## 💡 **Key Insights**

### **1. Orthogonal Systems**
DEBUG_MODE dan Response Debug adalah **independent** - tidak saling override:
- DEBUG_MODE = environment check (browser vs Electron)
- Response Debug = model selection check (local/debugging)

### **2. Can Coexist?**
**Theoretically YES, practically NO:**
- DEBUG_MODE needs `window.api === undefined` (browser only)
- Response Debug needs IPC to backend (Electron only)
- **They never run simultaneously** in practice

### **3. Response Debug is Superior for Testing**
- More realistic streaming (character-based)
- Configurable scenarios
- Backend integration
- Proper IPC flow
- Title generation with [DG] prefix

### **4. DEBUG_MODE Should Stay**
- Still useful for **pure frontend testing**
- Lightweight browser development
- No backend dependency
- Quick localStorage testing

---

## ✅ **Recommendations**

1. **Keep DEBUG_MODE** for browser-only development
2. **Use Response Debug** for full-stack testing
3. **Document both systems** clearly (this file!)
4. **Consider future:** Merge DEBUG_MODE simulation into Response Debug for consistency

---

## 🔚 **Summary**

- **DEBUG_MODE:** Browser-only, localStorage-based, word streaming, hardcoded
- **Response Debug:** Electron-based, SQLite-based, character streaming, configurable
- **Both valuable** for different scenarios
- **No conflicts** - they operate in different environments
