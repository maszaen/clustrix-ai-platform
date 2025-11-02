# AI Streaming - Dokumentasi Lengkap: User Send Message sampai AI Response

## Overview

Dokumentasi ini menjelaskan alur lengkap dari user mengirim pesan sampai menerima dan menampilkan response AI. Sistem menggunakan arsitektur **Electron IPC** dengan:
- **Renderer Process** (renderer.js) - UI dan user interaction
- **Main Process** (main.js) - Backend logic dan API calls
- **IPC Bridge** (preload.js) - Communication layer

---

## FASE 1: USER INPUT & PENGIRIMAN

### 1.1 User Mengetik dan Mengirim Pesan

**Entry Points:**
- Klik tombol "Send" ’ [renderer.js:15445](../renderer/renderer.js#L15445)
- Tekan Enter di textarea ’ [renderer.js:15409](../renderer/renderer.js#L15409)
- Send dari welcome screen ’ [renderer.js:12853](../renderer/renderer.js#L12853)

### 1.2 Fungsi `send()` - [renderer.js:12729-12851](../renderer/renderer.js#L12729-L12851)

**Alur Detail:**

#### A. Validasi Awal [Line 12730-12754]
```javascript
// 1. Cek markdown test mode
if (DEBUG_MARKDOWN && current && isMarkdownTestSession(current)) {
    runMarkdownTestTurn(current);
    return;
}

// 2. Ambil input text
const input = $("#msg");
const originalText = (input.value || "").trim();

// 3. Reset scroll state
window._isLazyLoading = false;
isUserScrolledUp = false;
autoScrollEnabled = true;

// 4. Validasi: session exist, ada text/files, tidak sedang streaming
if (!current ||
    (!originalText && current.uploadedFiles.length === 0) ||
    streamManager.isStreamingInSession(current)) {
    return;
}
```

#### B. Persiapan Data [Line 12756-12800]
```javascript
// 5. Ambil files yang akan dikirim
const filesToAttach = getFilesForMessage(current, 'conversation');

// 6. Update session
current.last_updated = nowISO();

// 7. Tambah pesan USER ke session.messages
current.messages.push(["user", originalText, { files: filesToAttach }]);
markSessionDirty(current.id);
const userIndex = current.messages.length - 1;

// 8. Ambil config model aktif
const config = getActiveChatConfig();
const modelInfo = {
    provider: config.provider,
    model: config.model,
    label: getModelMeta(state.settings.models, config.provider, config.model).label
};

// 9. Tambah pesan AI (empty) ke session.messages
current.messages.push(["ai", "", modelInfo]);
const aiMessageIndex = current.messages.length - 1;

// 10. Track untuk incremental save
if (!current._newMessages) {
    current._newMessages = [];
}
current._newMessages.push([userIndex, ["user", originalText, { files: filesToAttach }]]);
current._newMessages.push([aiMessageIndex, ["ai", "", modelInfo]]);
```

#### C. Render UI [Line 12785-12831]
```javascript
// 11. Render pesan USER di chat
addMessage("user", originalText, {
    final: true,
    index: userIndex,
    metadata: { files: filesToAttach }
});

// 12. Clear uploaded files
current.uploadedFiles = [];
renderUploadedFiles();

// 13. Render pesan AI kosong (placeholder)
const aiNode = addMessage("ai", "", {
    final: false,
    index: aiMessageIndex,
    metadata: modelInfo
});
aiNode.dataset.index = String(aiMessageIndex);

// 14. Smooth scroll ke bawah
const scroller = getChatScroller();
if (scroller) {
    requestAnimationFrame(() => {
        scroller.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

// 15. Setup response spacer (smooth rendering)
createResponseSpacer();
setTimeout(() => expandSpacer(), 50);

// 16. Clear input textarea
input.value = "";
input.style.height = "auto";

// 17. Clear draft
saveDraftDebounced.cancel();
sessionDrafts.delete(current.id);
saveDraftForSession(current.id, "");

// 18. Set flag "just sent message" (1 detik)
justSentMessage = true;
setTimeout(() => { justSentMessage = false; }, 1000);
```

#### D. Finalisasi dan Start Stream [Line 12833-12851]
```javascript
// 19. Generate title jika session baru
if (current.name === null) {
    generateAndSetTitle(current);
}

// 20. Save state
await save();
renderSessions();

// 21. Mulai thinking animation
scheduleThinkingText(aiNode);

// 22. Build messages untuk AI
const messagesForAI = (current.type === "project" || current.isProject)
    ? buildMessagesForProject(current)
    : buildMessages();

// 23. MULAI STREAMING
startStream(
    current,
    originalText,
    aiNode,
    aiMessageIndex,
    false,
    messagesForAI
);
```

---

## FASE 2: INISIASI STREAM

### 2.1 Fungsi `startStream()` - [renderer.js:12385-12572](../renderer/renderer.js#L12385-L12572)

**Alur Detail:**

#### A. Setup Stream ID [Line 12394-12399]
```javascript
// 1. Generate unique stream ID
const nonce = Math.random().toString(36).slice(2);
const streamId = `${session.id}-${aiMessageIndex}-${nonce}`;

// 2. Set ke aiNode dataset
if (aiNode?.dataset) aiNode.dataset.streamId = streamId;

// 3. Build messages (atau gunakan override)
const messages = overrideMessages || buildMessagesUpTo(aiMessageIndex - 1);

// 4. Buat stream handler
const handler = createStreamHandler(streamId, text, isFirstInteraction);
```

#### B. Setup IPC Call ke Backend [Line 12506-12548]
```javascript
// 5. Ambil config aktif
const act = state.settings?.models?.active || {};
const thinkMode = act.thinkMode || "off";

// 6. Panggil window.api.chat.stream (IPC ke main process)
const controller = window.api.chat.stream(
    messages,                          // Array of messages
    act.model || "glm-4.5-flash",     // Model name
    {
        sessionId: session.id,
        aiMessageIndex,
        session: session,
        provider: act.platform || "openrouter",
        baseUrl: act.baseUrl,
        apiKey: act.apiKey,
        thinkMode,
        webSearchEnabled: state.settings.webSearchEnabled,
        language: state.settings.language || "autodetect",
        searchApiConfig: {
            provider: state.settings.searchApiProvider,
            serpApiKey: state.settings.serpApiKey,
            googleApiKey: state.settings.googleApiKey,
            googleCseId: state.settings.googleCseId
        }
    },
    (evt) => {  // Callback untuk setiap event
        if (evt && typeof evt === "object") {
            // Handle error
            if (evt.error) {
                handler(evt);
                return;
            }
            // Handle thinking chunk
            if (evt.think) {
                const s = streamManager.activeStreams?.[streamId];
                if (s && s.aiNode && document.contains(s.aiNode)) {
                    appendThinking(s.aiNode, evt.think, s.session, s.messageIndex);
                }
                return;
            }
        }
        // Handle content chunk
        handler(evt);
    }
);
```

#### C. Register Stream [Line 12553-12571]
```javascript
// 7. Set streaming flag
isStreamingActive = true;

// 8. Tambah class ke aiNode
if (aiNode) {
    aiNode.classList.add('streaming-active');
}

// 9. Register ke streamManager
streamManager.startStream(streamId, {
    controller,           // Object dengan method cancel()
    aiNode,              // DOM node pesan AI
    session,             // Session object
    messageIndex: aiMessageIndex,
    messages,            // Array messages
    contextPrompt: text, // User prompt
    fullResponse: initialFullResponse || "",
    startedAt: Date.now(),
    thinkStartTime: Date.now()
});
```

---

## FASE 3: IPC BRIDGE

### 3.1 Preload.js - [preload.js:31-64](../preload.js#L31-L64)

**Fungsi:** Bridge antara renderer dan main process

```javascript
// Function window.api.chat.stream
stream(messages, model='glm-4.5-flash', optionsOrCb, maybeCb) {
    // 1. Generate unique request ID
    const id = rid(); // "timestamp-random"

    // 2. Parse callback dan options
    const isFn = typeof optionsOrCb === 'function';
    const onEvent = isFn ? optionsOrCb : (typeof maybeCb === 'function' ? maybeCb : () => {});
    const options = isFn ? {} : (optionsOrCb || {});

    // 3. Setup event listeners
    const onChunk = (_e, t) => { try{ onEvent(t); }catch{} };
    const onDone  = (_e) => { cleanup(); try{ onEvent(null); }catch{} };
    const onErr   = (_e, m) => { cleanup(); try{ onEvent({error:m}); }catch{} };

    function cleanup() {
        ipcRenderer.removeAllListeners(`chat:chunk-${id}`);
        ipcRenderer.removeAllListeners(`chat:done-${id}`);
        ipcRenderer.removeAllListeners(`chat:error-${id}`);
    }

    // 4. Register listeners
    ipcRenderer.on(`chat:chunk-${id}`, onChunk);
    ipcRenderer.once(`chat:done-${id}`, onDone);
    ipcRenderer.once(`chat:error-${id}`, onErr);

    // 5. Kirim request ke main process
    ipcRenderer.send('chat:stream-start', {
        reqId: id,
        messages,
        model,
        sessionId: options.sessionId,
        aiMessageIndex: options.aiMessageIndex,
        session: options.session,
        provider: options.provider,
        baseUrl: options.baseUrl,
        apiKey: options.apiKey,
        thinkMode: options.thinkMode,
        webSearchEnabled: options.webSearchEnabled,
        language: options.language,
        searchApiConfig: options.searchApiConfig
    });

    // 6. Return controller
    return {
        cancel: () => {
            cleanup();
            ipcRenderer.send('chat:stream-cancel', id);
        }
    };
}
```

---

## FASE 4: BACKEND PROCESSING

### 4.1 Main.js Handler - [main.js:3123-3147](../main.js#L3123-L3147)

```javascript
ipcMain.on('chat:stream-start', async (event, payload) => {
    // 1. Log request
    console.debug('MAIN: chat:stream-start invoked', {
        reqId: payload.reqId,
        webSearchEnabled: payload.webSearchEnabled
    });

    // 2. Inisialisasi token tracker
    initTokenTracker(
        payload.reqId,
        payload.sessionId || payload.session?.id || null,
        payload.aiMessageIndex
    );

    // 3. Routing berdasarkan webSearchEnabled
    if (!payload.webSearchEnabled) {
        // Standard streaming
        return runStandardStreaming(event, payload);
    } else {
        // Web search + streaming
        await runWebSearchChat(event, payload);
    }
});
```

### 4.2 Fungsi `runStandardStreaming()` - [main.js:3149-3700+](../main.js#L3149)

#### A. Inisialisasi [Line 3149-3172]
```javascript
function runStandardStreaming(event, payload) {
    const reqId = payload.reqId;
    let messages = payload.messages || [];
    const model = payload.model || 'glm-4.5-flash';
    const provider = (payload.provider || 'openrouter').toLowerCase();
    const sessionId = payload.sessionId || 'default';
    const session = payload.session || {};

    // Check Perplexity model
    const BASE_URL = getBaseUrl(provider, payload);
    const API_KEY = getApiKey(provider, payload);
    const { isPerplexityModel } = require('./backend/integration/langchain-helpers');
    const isPerplexity = isPerplexityModel({ baseUrl: BASE_URL, provider });

    if (isPerplexity) {
        return handlePerplexityRequest();
    }

    // Routing LangChain atau Direct
    if (langchainService && agentOrchestrator) {
        processWithLangChain();
    } else {
        processWithoutLangChain();
    }
}
```

#### B. Perplexity Handler (Non-Streaming) [Line 3174-3326]
```javascript
async function handlePerplexityRequest() {
    // 1. Setup
    const thinkStartTime = Date.now();
    activeStreams.set(reqId, { startedAt: thinkStartTime, provider: 'perplexity' });

    // 2. HTTP Request (non-streaming)
    const url = new URL(joinEndpoint(BASE_URL, 'chat/completions'));
    const body = JSON.stringify({ model, messages, stream: false });
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
    };

    // 3. Send request
    const req = https.request(url, { method: 'POST', headers }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', async () => {
            const response = JSON.parse(data);

            // 4. Hitung thinking duration
            const thinkDuration = (Date.now() - thinkStartTime) / 1000;

            // 5. Kirim search results sebagai thinking update
            if (response.search_results && response.search_results.length > 0) {
                event.sender.send('chat-update', {
                    type: 'THINKING',
                    messageIndex: payload.aiMessageIndex || 0,
                    data: {
                        sessionId,
                        think: {
                            title: 'Search Results',
                            type: 'perplexity_search',
                            content: JSON.stringify({
                                results: response.search_results,
                                citations: response.citations || []
                            })
                        }
                    }
                });
            }

            // 6. Kirim thinking duration
            event.sender.send('chat-update', {
                type: 'THINKING_TIME',
                messageIndex: payload.aiMessageIndex || 0,
                data: { sessionId, duration: thinkDuration }
            });

            // 7. Stream content word by word (simulasi streaming)
            const content = response.choices?.[0]?.message?.content || '';
            if (content) {
                const words = content.split(' ');
                for (const word of words) {
                    if (word.trim()) {
                        event.sender.send(`chat:chunk-${reqId}`, word + ' ');
                        await new Promise(r => setTimeout(r, 20)); // 20ms delay
                    }
                }
            }

            // 8. Kirim token usage dengan cost
            if (response.usage) {
                const usageWithCost = {
                    prompt_tokens: response.usage.prompt_tokens,
                    completion_tokens: response.usage.completion_tokens,
                    total_tokens: response.usage.total_tokens,
                    cost: response.usage.cost
                };
                recordTokenUsage(reqId, 'final-response', usageWithCost, { provider, model });
                finalizeTokenUsage(reqId, event);
            }

            // 9. Selesai
            event.sender.send(`chat:done-${reqId}`);
            activeStreams.delete(reqId);
        });
    });

    req.write(body);
    req.end();
}
```

#### C. Direct Streaming (Standard OpenAI-Compatible API)

```javascript
function processWithoutLangChain() {
    // 1. Setup URL dan headers
    const url = new URL(joinEndpoint(BASE_URL, 'chat/completions'));
    const body = JSON.stringify({
        model,
        messages,
        stream: true,  // IMPORTANT: streaming enabled
        temperature: 0.7,
    });

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
    };

    // 2. HTTP Request dengan streaming
    const https = require('https');
    const req = https.request(url, { method: 'POST', headers }, (res) => {

        let buffer = '';

        // 3. Handle setiap chunk data
        res.on('data', (chunk) => {
            buffer += chunk.toString();

            // 4. Parse SSE (Server-Sent Events)
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Keep incomplete line

            for (const line of lines) {
                const trimmed = line.trim();

                // Skip empty lines dan comments
                if (!trimmed || trimmed.startsWith(':')) continue;

                // Parse "data: " prefix
                if (trimmed.startsWith('data: ')) {
                    const data = trimmed.slice(6);

                    // Check [DONE] signal
                    if (data === '[DONE]') {
                        event.sender.send(`chat:done-${reqId}`);
                        activeStreams.delete(reqId);
                        return;
                    }

                    try {
                        // 5. Parse JSON chunk
                        const parsed = JSON.parse(data);

                        // 6. Extract content
                        const content = parsed.choices?.[0]?.delta?.content || '';

                        if (content) {
                            // 7. Kirim chunk ke renderer
                            event.sender.send(`chat:chunk-${reqId}`, content);
                        }

                        // 8. Track usage jika ada
                        if (parsed.usage) {
                            recordTokenUsage(reqId, 'final-response', parsed.usage, { provider, model });
                        }

                    } catch (parseError) {
                        console.error('Failed to parse SSE chunk:', parseError);
                    }
                }
            }
        });

        // 9. Handle stream end
        res.on('end', () => {
            finalizeTokenUsage(reqId, event);
            event.sender.send(`chat:done-${reqId}`);
            activeStreams.delete(reqId);
        });
    });

    // 10. Handle errors
    req.on('error', (err) => {
        event.sender.send(`chat:error-${reqId}`, err.message);
        activeStreams.delete(reqId);
    });

    // 11. Register untuk cancellation
    activeStreams.set(reqId, {
        req,
        startedAt: Date.now(),
        provider,
        model
    });

    // 12. Send request
    req.write(body);
    req.end();
}
```

---

## FASE 5: STREAMING RESPONSE KE RENDERER

### 5.1 Event Flow dari Main ke Renderer

**Channel Events:**
1. `chat:chunk-${reqId}` - Setiap token/chunk content
2. `chat:done-${reqId}` - Stream selesai
3. `chat:error-${reqId}` - Error terjadi
4. `chat-update` - Special events (thinking, usage, dll)

**Contoh Chunk Sequence:**
```
chat:chunk-123: "Hello"
chat:chunk-123: " world"
chat:chunk-123: "!"
chat:chunk-123: " How"
chat:chunk-123: " can"
chat:chunk-123: " I"
chat:chunk-123: " help"
chat:chunk-123: "?"
chat:done-123: null
```

### 5.2 Stream Handler - [renderer.js:11618-12267](../renderer/renderer.js#L11618)

**Fungsi:** Menerima dan memproses setiap chunk, render ke UI

#### A. Handler Function Structure [Line 12007-12038]

```javascript
return (evt) => {
    const s = getState();  // Get active stream state
    if (!s) return;

    // 1. Deteksi DONE signal
    const isDone =
        evt === null ||
        evt === "[DONE]" ||
        (typeof evt === "object" &&
         (evt.done === true || evt.type === "done" || evt.event === "done"));

    if (isDone) {
        finalize();  // Panggil finalize
        return;
    }

    // 2. Deteksi ERROR
    if (evt?.error) {
        finalize({ interrupted: true, reason: evt.error });
        return;
    }

    // 3. Extract token dari event
    let token = "";
    if (typeof evt === "string") {
        token = evt;
    } else if (evt && typeof evt === "object") {
        token =
            evt.delta?.content ||
            evt.choices?.[0]?.delta?.content ||
            evt.content ||
            (typeof evt.data === "string" ? evt.data : "");
    }

    if (!token) return;

    // 4. Process token...
};
```

#### B. First Token Processing [Line 12040-12104]

```javascript
// Track apakah sudah menerima token bermakna (non-whitespace)
if (!seenMeaningfulToken && /\S/.test(token)) {
    seenMeaningfulToken = true;

    // 1. Hitung thinking duration
    if (s.thinkStartTime) {
        const durationSeconds = (Date.now() - s.thinkStartTime) / 1000;

        const { session, messageIndex } = s;
        session._x_think = session._x_think || {};

        // Ensure object format
        if (typeof session._x_think[messageIndex] !== "object") {
            const existingText = session._x_think[messageIndex] || "";
            session._x_think[messageIndex] = { text: existingText };
        }

        // 2. Save duration
        session._x_think[messageIndex].duration = durationSeconds;
        saveThinkingDebounced();

        // 3. Finalize thinking UI
        finalizeThinkingUI(s.aiNode, durationSeconds, messageMetadata);
        delete s.thinkStartTime;
    }

    // 4. Transisi dari thinking ke content
    if (s.aiNode && document.contains(s.aiNode)) {
        cancelThinkingText(s.aiNode);

        const textDiv = s.aiNode.querySelector(".message-text");
        if (textDiv) {
            const thinkingContainer = textDiv.querySelector('.thinking-container');
            if (thinkingContainer) {
                // Update text untuk transisi smooth
                const thinkingTextIndicator = thinkingContainer.querySelector('.thinking-text-indicator');
                if (thinkingTextIndicator) {
                    thinkingTextIndicator.textContent = 'Generating response...';
                }
            }
        }
        hideLoader();
    }
}
```

#### C. Accumulate Token [Line 12132-12134]

```javascript
// Tambahkan token ke fullResponse
fullResponse += String(token);

// Cek apakah ada END marker
const gotEnd = END_RX.test(fullResponse);
if (gotEnd) sawEnd = true;
```

#### D. Render ke UI [Line 12136-12350+]

**Mode "No Throttling" (Fast Path):**

```javascript
const userSetting = state.settings.streamThrottling || "auto";

if (userSetting === "none") {
    // 1. Remove thinking container immediately
    const thinkingContainer = div.querySelector('.thinking-container');
    if (thinkingContainer && display.trim().length > 0) {
        thinkingContainer.parentNode.removeChild(thinkingContainer);
    }

    // 2. Smart rendering dengan incremental append
    const newContent = display.substring(div._lastRenderedLength);
    const isInitialRender = div._lastRenderedLength === 0;
    const isSmallIncrement = newContent.length < 100;

    if (isInitialRender) {
        // Initial render - parse markdown fully
        const html = mdFallback(display);
        div.innerHTML = html;
    } else if (isSmallIncrement) {
        // Small increment - full re-render
        const html = mdFallback(display);
        div.innerHTML = html;
    } else {
        // Large increment - incremental append
        const html = mdFallback(newContent);
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        while (tempDiv.firstChild) {
            div.appendChild(tempDiv.firstChild);
        }
    }

    div._lastRenderedLength = display.length;

    // 3. Highlight code blocks & render math
    if (div.querySelector("pre code")) highlightAllUnder(div);
    renderMathInElement(div);

    // 4. Auto-scroll
    debouncedAIScrollToBottom();

    // 5. Jika END, finalize
    if (gotEnd) finalize();
    return;
}
```

**Mode Throttled (dengan Worker untuk Heavy Content):**

```javascript
// Smart throttled rendering
const performSmartRender = () => {
    const now = Date.now();
    const contentGrowth = display.length - lastRenderLength;
    const timeSinceLastRender = now - lastRenderTime;

    // Decision: gunakan worker atau tidak
    const shouldUseWorkerForStreaming = (
        display.length > 3000 ||
        (display.match(/```/g) || []).length > 3 ||
        /\$\$[\s\S]*?\$\$/.test(display)
    );

    // Get throttle delay berdasarkan setting
    const throttleMs = getThrottleMs(); // 0-150ms
    const contentGrowthThreshold = getContentGrowthThreshold(); // 1-80 chars

    // Throttling logic
    const shouldRender =
        contentGrowth >= contentGrowthThreshold ||
        timeSinceLastRender >= throttleMs ||
        gotEnd;

    if (!shouldRender) {
        if (!renderTimeout) {
            renderTimeout = setTimeout(performSmartRender, throttleMs);
        }
        return;
    }

    // Render
    if (shouldUseWorkerForStreaming && markdownWorker) {
        // WORKER-based rendering
        markdownWorker.postMessage({
            type: 'stream',
            payload: display,
            streamId
        });
    } else {
        // SYNC rendering
        md(display, { isStreaming: true }).then(html => {
            div.innerHTML = html;
            if (div.querySelector("pre code")) highlightAllUnder(div);
            attachCodeBlockListeners(div);
            renderMathInElement(div);
        });
    }

    debouncedAIScrollToBottom();
    if (gotEnd) finalize();
};

performSmartRender();
```

---

## FASE 6: MARKDOWN RENDERING

### 6.1 Fungsi `md()` - [renderer.js:8611-8697](../renderer/renderer.js#L8611-L8697)

**Smart Decision Matrix:**

```javascript
async function md(src, options = {}) {
    if (!src) return "";

    // 1. Analisis konten
    const contentSize = src.length;
    const hasComplexElements = /```[\s\S]*?```|<[^>]+>|\$\$[\s\S]*?\$\$|\|.*\|.*\|/.test(src);
    const hasLotsOfCode = (src.match(/```/g) || []).length > 4;

    // 2. Pilih strategy
    let useWorker = false;

    if (options.forceSync) {
        useWorker = false;
    } else if (options.isSessionSwitch) {
        // Session switching: ALWAYS sync (instant UX)
        useWorker = false;
    } else if (options.isStreaming) {
        // Streaming: progressive adoption
        useWorker = contentSize > 3000 || hasLotsOfCode || hasComplexElements;
    } else {
        // General: worker for heavy
        useWorker = contentSize > 2000 || hasLotsOfCode || hasComplexElements;
    }

    // 3. Execute
    if (!useWorker) {
        return mdFallback(src);  // Synchronous
    }

    // 4. Worker-based dengan timeout fallback
    return new Promise((resolve) => {
        const messageId = ++workerMessageId;
        workerPromises.set(messageId, { resolve });

        markdownWorker.postMessage({
            type: 'init',
            payload: src,
            streamId: `sync-${messageId}`,
            messageId
        });

        // Timeout 800ms
        setTimeout(() => {
            if (workerPromises.has(messageId)) {
                workerPromises.delete(messageId);
                resolve(mdFallback(src));  // Fallback on timeout
            }
        }, 800);
    });
}
```

### 6.2 Fungsi `mdFallback()` - [renderer.js:8700-8850+](../renderer/renderer.js#L8700)

**Synchronous rendering:**

```javascript
function mdFallback(src) {
    if (!src) return "";

    // 1. Gunakan enhancedMarkdownParse (dari md.js)
    if (typeof enhancedMarkdownParse === 'function') {
        const html = enhancedMarkdownParse(src, { isThinkingText: false });

        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = html;

        // 2. Post-processing
        if (typeof addPHasListClass === 'function') {
            addPHasListClass(tempDiv);
        }
        transformSourceFootnotes(tempDiv);

        // 3. Highlight code blocks
        if (tempDiv.querySelector("pre code")) {
            highlightAllUnder(tempDiv);
        }
        attachCodeBlockListeners(tempDiv);

        return tempDiv.innerHTML;
    }

    // 4. Basic fallback (markdown-it)
    const { text, latex } = preprocessMarkdownSource(src);
    const renderer = ensureMarkdownRenderer();
    const rendered = renderer.render(text.trim());
    return restoreLatexPlaceholders(rendered, latex);
}
```

---

## FASE 7: FINALIZATION

### 7.1 Fungsi `finalize()` - [renderer.js:11775-12003](../renderer/renderer.js#L11775-L12003)

**Dipanggil ketika:**
- Menerima `null` event (done signal)
- Menerima error event
- User cancel stream

**Alur Detail:**

#### A. Setup [Line 11776-11807]
```javascript
const finalize = async ({ interrupted = false, reason = null } = {}) => {
    // 1. Prevent double finalization
    if (finalized) return;
    finalized = true;

    // 2. Get stream state
    const s = getState();
    if (!s) return;

    // 3. Get actual session object
    const session = state.sessions.find(sess => sess.id === streamSession.id);
    if (!session) return;

    // 4. Prepare display text
    const display = trimEnd(fullResponse);
    const hasContent = display.length > 0;
    const hasEnd = END_RX.test(fullResponse) || sawEnd;
    const isComplete = hasEnd || !interrupted;

    // 5. Collapse spacer
    if (isComplete) {
        collapseSpacer();
    }
```

#### B. Prepare Final Message [Line 11814-11880]
```javascript
    // 6. Format final message
    let finalMessageToSave = display;
    if (interrupted) {
        const formattedError = formatErrorMessageForSaving(reason);
        finalMessageToSave = hasContent
            ? `${display}\n\n${formattedError}`
            : formattedError;
    }

    // 7. Save to session.messages
    if (finalMessageToSave || interrupted) {
        // Include thinking data
        if (session._x_think && session._x_think[messageIndex]) {
            modelInfo.thinkContent = session._x_think[messageIndex];
        }

        // Include thinking updates
        if (session._x_think_updates && session._x_think_updates[messageIndex]) {
            modelInfo.thinkingUpdate = session._x_think_updates[messageIndex];
        }

        // Save message
        session.messages[messageIndex] = ["ai", finalMessageToSave, modelInfo];

        // Track for incremental save
        if (!session._newMessages) {
            session._newMessages = [];
        }
        session._newMessages.push([messageIndex, ["ai", finalMessageToSave, modelInfo]]);
    }
```

#### C. Update UI [Line 11882-11947]
```javascript
    // 8. Set metadata ke aiNode
    if (aiNode) {
        setNodeMetadata(aiNode, modelInfo || {});
    }

    // 9. Render final content
    if (aiNode && document.contains(aiNode)) {
        hideLoader();

        const div = aiNode.querySelector(".message-text");
        if (div) {
            md(finalMessageToSave || "").then(html => {
                div.innerHTML = html;
                if (div.querySelector("pre code")) highlightAllUnder(div);
                attachCodeBlockListeners(div);
                renderMathInElement(div);
            }).catch(err => {
                div.innerHTML = mdFallback(finalMessageToSave || "");
                if (div.querySelector("pre code")) highlightAllUnder(div);
                attachCodeBlockListeners(div);
                renderMathInElement(div);
            });
        }

        // 10. Render action buttons (copy, regenerate, dll)
        renderAiFinalActions(aiNode, finalMessageToSave, messageIndex);
    }
```

#### D. Cleanup & Save [Line 11949-12003]
```javascript
    // 11. Update stream state
    s.fullResponse = finalMessageToSave;
    s.sawEnd = isComplete;
    cleanupStream();

    // 12. Remove streaming-active class
    if (aiNode) {
        aiNode.classList.remove('streaming-active');
    }

    // 13. Reset streaming flag
    isStreamingActive = false;

    // 14. Update UI
    renderSessions?.();
    updateChatHeader?.();

    // 15. Save immediately
    debouncedSave?.cancel?.();
    await save?.();

    // 16. Auto-cache session
    if (session && session.id && current && current.id === session.id) {
        const chatLog = $("#chat-log");
        if (chatLog && chatLog.innerHTML.trim()) {
            const scroller = getChatScroller();
            const scrollPos = scroller ? scroller.scrollTop : 0;
            cacheSession(session.id, chatLog.innerHTML, scrollPos, session._lazyState);
        }
    }
};
```

---

## Diagram Alur Lengkap

```
                                                                     
                     USER MENGETIK & KLIK SEND                        
                               ,                                     
                                
                                ¼
                                           
                       send() Function     
                       renderer.js:12729   
                               ,           
                                
                               4                        
                                                         
        ¼                                                 ¼
                                                                  
  VALIDASI                                    PERSIAPAN DATA      
                  $                                                $
 " Cek session                               " Upload files       
 " Cek streaming                             " Update timestamp   
 " Cek input                                 " Push user msg      
                                             " Push AI msg (empty)
                                               " Get model config   
                                                        ,           
                                                         
                                                        4            
                                                                      
                                ¼                                      ¼
                                                                             
                      RENDER UI                          START STREAM        
                                           $                                  $
                     " addMessage("user")               " scheduleThinking   
                     " addMessage("ai","")              " buildMessages()    
                     " createResponseSpacer             " startStream()      
                     " clear input                        [12385]            
                     " scroll to bottom                          ,           
                                                                  
                                                                    
                                                                   
                                    
                                    ¼
                                                   
                           startStream()           
                           renderer.js:12385       
                                                   $
                         1. Generate streamId      
                         2. createStreamHandler()  
                         3. window.api.chat.stream 
                            “ (IPC Call)           
                                   ,               
                                    
                                   4                      
                         PRELOAD.JS (IPC BRIDGE)          
                         preload.js:31-64                 
                                                          $
                 1. Generate reqId                        
                 2. Setup event listeners:                
                    " chat:chunk-${reqId}                 
                    " chat:done-${reqId}                  
                    " chat:error-${reqId}                 
                 3. ipcRenderer.send('chat:stream-start') 
                 4. Return controller { cancel() }        
                                   ,                      
                                    
                                    ¼
                                                            
                     MAIN PROCESS (Backend)                 
                     main.js:3123                           
                                                            $
             ipcMain.on('chat:stream-start', ...)           
                                                            
             " initTokenTracker()                           
             " Route berdasarkan webSearchEnabled           
                        ,                                   
                         
                        4                  
                                            
        ¼                                    ¼
                                                          
  runWebSearchChat()          runStandardStreaming()      
  (dengan web search)         main.js:3149                
                                                          $
                               Check provider & model        
                                        ,                   
                                         
                                        <                        
                                                                 
                ¼                        ¼                         ¼
                                                                      
      Perplexity             LangChain             Standard OpenAI    
      (Non-Stream)           (Agent/ReAct)         Compatible         
                         $                      $                       $
     " HTTP POST            " Project mode        " HTTPS Request     
     " JSON response        " Agent Orchestr.     " SSE Stream        
     " Word-by-word         " ReasoningAction     " Real-time chunks  
       simulation           " Word-by-word                ,           
     " With cost data         simulation                   
              ,                      ,                     
                                                              
                                       4                       
                                        
                                       4           
                              event.sender.send    
                                                   $
                             " chat:chunk-${reqId} 
                             " chat:done-${reqId}  
                             " chat:error-${reqId} 
                             " chat-update         
                                       ,           
                                        
                                        ¼ (IPC back to renderer)
                                                   
                              Preload Listeners    
                              preload.js:38-48     
                                                   $
                             onChunk ’ onEvent(t)  
                             onDone  ’ onEvent(null)
                             onErr   ’ onEvent(err)
                                       ,           
                                        
                                        ¼
                                                       
                          Stream Handler (Callback)    
                          renderer.js:12007            
                                                       $
                         return (evt) => { ... }       
                                   ,                   
                                    
                                   <                           
                                                               
        ¼                           ¼                            ¼
                                                                     
  evt === null          evt.error                evt = string/token  
  (DONE)                (ERROR)                  (CHUNK)             
                  $                      $                             $
 " finalize()          " finalize({             1. Extract token     
 " Save message            interrupted          2. Accumulate to     
 " Update UI             })                        fullResponse      
                                                3. First token:      
                                                        " Calc duration   
                                                        " Finalize thinking
                                                     4. Render to UI      
                                                              ,           
                                                               
                                                              4                
                                           RENDERING STRATEGY                  
                                                                               $
                                     " fullResponse += token                   
                                     " Check throttling setting                
                                                  ,                            
                                                   
                                                  4                       
                                                                           
                        ¼                                                   ¼
                                                                                
              NO THROTTLING                               THROTTLED MODE        
              (Fast Path)                                 (Smart Rendering)     
                                   $                                             $
             " mdFallback() sync                         " Smart throttling     
             " Incremental append                        " Worker for heavy     
             " highlightAllUnder()                       " md() async/worker    
             " renderMathInElement()                     " highlightAllUnder()  
             " Auto-scroll                               " renderMathInElement()
                       ,                                            ,           
                                                                      
                                          ,                           
                                           
                                           ¼
                                                          
                               MARKDOWN PROCESSING        
                               md() / mdFallback()        
                                          ,               
                                           
                                           ¼
                                                          
                              Final HTML Output           
                                                          $
                             " Parsed markdown            
                             " Syntax highlighted code    
                             " Rendered math (KaTeX)      
                             " Interactive code blocks    
                                          ,               
                                           
                                           ¼
                                                          
                              div.innerHTML = html        
                              debouncedAIScrollToBottom() 
                                                          

    [Stream continues... more chunks...]

                                           
                                           ¼
                                                          
                              evt === null (DONE signal)  
                                          ,               
                                           
                                           ¼
                                                            
                               finalize() Function          
                               renderer.js:11775            
                                                            $
                             1. Prevent double finalization 
                             2. Prepare final message       
                             3. Save to session.messages    
                             4. Update UI                   
                             5. Cleanup & cache             
                                                            
                                           
                                           ¼
                                                            
                                   STREAM COMPLETE          
                                                            
                                 " Message saved            
                                 " UI updated               
                                 " Ready for next message   
                                                            
```

---

## Kesimpulan

**Alur lengkap dari user send message sampai AI response:**

1. **User Input** ’ `send()` validates dan prepares data
2. **UI Rendering** ’ Render user message + AI placeholder dengan thinking animation
3. **Start Stream** ’ `startStream()` sets up handler dan IPC call
4. **IPC Bridge** ’ Preload.js sends request ke main process dengan event listeners
5. **Backend Processing** ’ Main.js routes ke:
   - **Perplexity:** Non-streaming HTTP, word-by-word simulation
   - **LangChain:** Agent/ReAct untuk complex queries
   - **Standard:** Real-time SSE streaming
6. **Chunk Streaming** ’ Setiap chunk dikirim via `chat:chunk-${reqId}`
7. **Stream Handler** ’ Receives chunks, accumulates, renders incrementally
8. **Rendering Strategy:**
   - **No throttling:** Instant sync rendering
   - **Throttled:** Worker-based untuk heavy content
9. **Markdown Processing** ’ `md()` or `mdFallback()` with syntax highlighting
10. **Finalization** ’ Save message, update UI, cleanup

**Key Performance Optimizations:**
- Incremental rendering
- Smart throttling
- Worker offloading
- Debounced scrolling
- Session caching
- Lazy loading
