# DEBUG_MARKDOWN - Dokumentasi Lengkap

## Overview

`DEBUG_MARKDOWN` adalah fitur testing untuk markdown renderer yang mensimulasikan streaming response AI secara lokal tanpa API call. Fitur ini memungkinkan developer untuk test dan debug markdown rendering dengan cepat.

---

## Konstanta Utama

### `DEBUG_MARKDOWN` - [renderer.js:360](../renderer/renderer.js#L360)
```javascript
const DEBUG_MARKDOWN = true;
```
**Fungsi:** Flag global untuk mengaktifkan/menonaktifkan fitur Markdown Test. Ketika `true`, tombol test muncul di UI.

### Konstanta Terkait - [renderer.js:363-370](../renderer/renderer.js#L363-L370)
```javascript
const MARKDOWN_TEST_SESSION_TYPE = "markdown-test";
const MARKDOWN_TEST_TITLE = "Markdown Test Session";
const MARKDOWN_TEST_PROMPT = "[MARKDOWN TEST]";
const MARKDOWN_TEST_MODEL_INFO = Object.freeze({
  provider: "local",
  model: "markdown-test",
  label: "Markdown Test",
});
```

**Fungsi:**
- `MARKDOWN_TEST_SESSION_TYPE`: Identifier untuk membedakan session test dari session normal
- `MARKDOWN_TEST_TITLE`: Judul default untuk session test
- `MARKDOWN_TEST_PROMPT`: Teks yang ditampilkan sebagai pesan user
- `MARKDOWN_TEST_MODEL_INFO`: Metadata model yang disimulasikan (offline/local)

---

## Template Default

### `DEFAULT_MARKDOWN_TEST_TEMPLATE` - [renderer.js:380-412](../renderer/renderer.js#L380-L412)

```javascript
const DEFAULT_MARKDOWN_TEST_TEMPLATE = Object.freeze({
  think: "Tidak ada isi form. Tampilkan contoh markdown bawaan...",
  response: `## Markdown Showcase

Berikut contoh elemen markdown umum:

- **Teks tebal** dan _teks miring_
- Daftar bernomor:
  1. Langkah pertama
  2. Langkah kedua dengan tautan [Clustrix](https://example.com)
- Kutipan blok untuk catatan penting.

> Markdown membantu menjaga struktur jawaban.

### Potongan kode

\`\`\`js
function greet(name) {
  return \`Halo, \${name}!\`;
}
console.log(greet("Markdown Test"));
\`\`\`

| Komponen | Status |
| --- | --- |
| Heading |  |
| List |  |
| Code block |  |
`
});
```

**Fungsi:** Template showcase yang menampilkan berbagai elemen markdown (heading, list, code block, tabel, dll) ketika tidak ada input dari user.

---

## Fungsi Helper

### `buildMarkdownTestScenario()` - [renderer.js:414-427](../renderer/renderer.js#L414-L427)

```javascript
function buildMarkdownTestScenario(rawInput) {
  const text = typeof rawInput === "string" ? rawInput.replace(/\r\n/g, "\n") : "";
  const trimmed = text.trim();

  if (!trimmed) {
    return DEFAULT_MARKDOWN_TEST_TEMPLATE;
  }

  return {
    think: "Salin isi form ke balasan markdown agar mudah diverifikasi secara lokal tanpa request eksternal.",
    response: text,
  };
}
```

**Fungsi:** Membuat scenario test berdasarkan input user
- **Input:** `rawInput` - teks dari textarea
- **Output:** Object dengan `think` dan `response`
- **Logic:**
  - Jika input kosong ’ return `DEFAULT_MARKDOWN_TEST_TEMPLATE`
  - Jika ada input ’ return scenario dengan response = input user (untuk test rendering markdown yang diketik user)

### `isMarkdownTestSession()` - [renderer.js:429-434](../renderer/renderer.js#L429-L434)

```javascript
function isMarkdownTestSession(session) {
  return (
    !!session &&
    (session.type === MARKDOWN_TEST_SESSION_TYPE || session.isMarkdownTest === true)
  );
}
```

**Fungsi:** Mengecek apakah session adalah markdown test session
- **Return:** `true` jika session memiliki `type === "markdown-test"` atau `isMarkdownTest === true`

### `splitMarkdownForStreaming()` - [renderer.js:436-439](../renderer/renderer.js#L436-L439)

```javascript
function splitMarkdownForStreaming(text) {
  if (!text) return [];
  return text.split(/(\s+)/).filter((token) => token.length > 0);
}
```

**Fungsi:** Memecah teks markdown menjadi token-token untuk efek streaming
- **Logic:** Split berdasarkan whitespace `(\s+)` untuk mensimulasi token streaming
- **Return:** Array of strings (tokens)

---

## Fungsi UI Control

### `updateMarkdownControls()` - [renderer.js:441-464](../renderer/renderer.js#L441-L464)

```javascript
function updateMarkdownControls() {
  const welcomeBtn = document.getElementById("markdown-test-welcome");
  if (welcomeBtn) {
    welcomeBtn.style.display = DEBUG_MARKDOWN ? "" : "none";
  }

  const chatBtn = document.getElementById("markdown-test-chat");
  const sendBtn = document.getElementById("send");

  if (!DEBUG_MARKDOWN) {
    if (chatBtn) chatBtn.style.display = "none";
    if (sendBtn) sendBtn.style.display = "";
    return;
  }

  const shouldShowMarkdownControls = isMarkdownTestSession(current);

  if (chatBtn) {
    chatBtn.style.display = shouldShowMarkdownControls ? "" : "none";
  }
  if (sendBtn) {
    sendBtn.style.display = shouldShowMarkdownControls ? "none" : "";
  }
}
```

**Fungsi:** Mengatur visibilitas tombol markdown test

**Logic:**
1. Tampilkan tombol `markdown-test-welcome` jika `DEBUG_MARKDOWN === true`
2. Jika `DEBUG_MARKDOWN === false` ’ sembunyikan semua tombol test
3. Jika dalam markdown test session ’ tampilkan tombol `markdown-test-chat`, sembunyikan tombol `send` normal
4. Jika bukan test session ’ sembunyikan tombol `markdown-test-chat`, tampilkan tombol `send` normal

**Tombol UI:**
- [index.html:426](../renderer/index.html#L426) - `#markdown-test-welcome` (di welcome screen)
- [index.html:737](../renderer/index.html#L737) - `#markdown-test-chat` (di chat screen)

---

## Fungsi Inisiasi Test

### `startMarkdownTestFromWelcome()` - [renderer.js:466-500](../renderer/renderer.js#L466-L500)

**Fungsi:** Memulai markdown test dari welcome screen

**Alur:**
1. **[Line 467]** Cek `DEBUG_MARKDOWN`, keluar jika `false`
2. **[Line 469-484]** Ambil teks dari `#msg-central`, clear textarea dan draft
3. **[Line 486-487]** Clear uploaded files
4. **[Line 489-493]** Buat session baru dengan:
   - `type: MARKDOWN_TEST_SESSION_TYPE`
   - `name: "Markdown Test Session"`
   - `isMarkdownTest: true`
5. **[Line 495]** Save state
6. **[Line 497]** Set sebagai session aktif
7. **[Line 498]** Update UI controls
8. **[Line 499]** Jalankan test turn pertama

---

## Fungsi Eksekusi Test Turn

### `runMarkdownTestTurn()` - [renderer.js:502-587](../renderer/renderer.js#L502-L587)

**Fungsi:** Menjalankan satu turn test (user message + AI response simulasi)

**Alur Detail:**

#### 1. Validasi [Line 503-506]
- Cek `DEBUG_MARKDOWN`
- Pastikan session adalah markdown test session
- Pastikan tidak ada streaming aktif

#### 2. Reset Scroll State [Line 508-512]
- Set `_isLazyLoading = false`
- Set `isUserScrolledUp = false`
- Enable auto-scroll
- Clear cooldown

#### 3. Inisialisasi & Update [Line 514-518]
- Inisialisasi `uploadedFiles` array
- Update `last_updated` timestamp

#### 4. Ambil dan Clear Input [Line 520-544]
- Ambil nilai dari `rawInput` parameter atau `#msg` textarea
- Clear textarea
- Reset height textarea
- Cancel debounced save
- Clear session draft

#### 5. Set Just Sent Message Flag [Line 546-549]
- Set `justSentMessage = true`
- Timeout 1 detik untuk reset

#### 6. Buat Pesan USER [Line 551-557]
- Push `["user", MARKDOWN_TEST_PROMPT]` ke session.messages
- Render pesan user di UI dengan `addMessage()`

#### 7. Buat Pesan AI [Line 559-568]
- Push `["ai", "", modelInfo]` ke session.messages
- Render node AI kosong di UI
- Set dataset.index

#### 8. Persiapan Spacer & Thinking [Line 570-575]
- `createResponseSpacer()` untuk smooth scroll
- `expandSpacer()` dengan delay 50ms
- `scheduleThinkingText(aiNode)` untuk animasi thinking

#### 9. Build Scenario dan Mulai Streaming [Line 577-580]
- Panggil `buildMarkdownTestScenario()` dengan input user
- Panggil `streamMarkdownTestResponse()` untuk simulasi streaming

#### 10. Finalisasi [Line 582-586]
- Render session list
- Update chat header
- Save state

---

## Fungsi Streaming Simulasi

### `streamMarkdownTestResponse()` - [renderer.js:589-669](../renderer/renderer.js#L589-L669)

**Fungsi:** Mensimulasikan streaming response AI secara lokal tanpa API call

**Alur Detail:**

#### A. Setup [Line 590-616]
1. Generate unique `streamId`
2. Buat stream handler dengan `createStreamHandler()`
3. Inisialisasi timer variables (`thinkTimer`, `streamTimer`, `finished`)
4. Buat `clearTimers()` helper function
5. Buat `controller` object dengan method `cancel()`

#### B. Register Stream [Line 618-628]
Panggil `streamManager.startStream()` dengan metadata:
- controller
- aiNode
- session
- messageIndex
- contextPrompt
- fullResponse
- startedAt
- thinkStartTime

#### C. Begin Streaming Function [Line 630-668]

**Thinking Phase:**
- Panggil `appendThinking()` untuk update thinking content
- Content = `scenario.think`
- Hitung thinking duration dari timestamp
- Store di `session._x_think[aiMessageIndex]`:
  ```javascript
  {
    text: scenario.think,
    duration: thinkDuration
  }
  ```
- Panggil `finalizeThinkingUI()` untuk update tampilan "Thought for Xs"

**Response Phase:**
- Split response menjadi tokens dengan `splitMarkdownForStreaming()`
- Start interval streaming dengan delay **24ms** (simulasi kecepatan API)
- Setiap tick:
  - Cek stream masih aktif
  - Jika masih ada token ’ kirim via `handler(tokens[idx])`
  - Jika semua token terkirim ’ cleanup dan kirim `handler(null)` untuk signal end

#### D. Schedule [Line 668]
Jadwalkan `beginStreaming()` dengan delay **120ms** (simulasi waktu "thinking")

---

## Stream Manager

### `streamManager` - [renderer.js:843-1014](../renderer/renderer.js#L843-L1014)

**Fungsi:** Mengelola semua active streams dalam aplikasi

**Properties:**
```javascript
const streamManager = {
  activeStreams: {},  // Object berisi semua stream aktif (key = streamId)
  byKey: {},          // Map dari session+messageIndex ke streamId
}
```

**Key Methods:**

#### `makeKey(session, messageIndex)` - [Line 847-849]
Generate unique key untuk session+message combination

#### `stopAllForKey(key)` - [Line 851-858]
Stop semua stream untuk session+message tertentu

#### `startStream(streamId, data)` - [Line 947-954]
Register stream baru:
- Stop stream lama dengan key yang sama
- Add ke `activeStreams`
- Add mapping ke `byKey`
- Update input state

#### `isStreamingInSession(session)` - [Line 994-1002]
Cek apakah ada stream aktif di session tertentu

---

## Fungsi UI Rendering

### `scheduleThinkingText()` - [renderer.js:7622-7662](../renderer/renderer.js#L7622-L7662)

**Fungsi:** Jadwalkan animasi text thinking dengan 4 stage:
1. [800ms] "Reading your request"
2. [2500ms] "Processing thoughts"
3. [4500ms] "Organizing response"
4. [6500ms] "Almost ready"

### `appendThinking()` - [renderer.js:1950-1977](../renderer/renderer.js#L1950-L1977)

**Fungsi:** Menambahkan chunk thinking text ke UI dan session data
- Update `session._x_think[messageIndex]` dengan append chunk
- Panggil `updateThinkingUI()` untuk render ke DOM
- Debounced save

### `finalizeThinkingUI()` - [renderer.js:2779-2802](../renderer/renderer.js#L2779-L2802)

**Fungsi:** Finalisasi UI thinking setelah selesai
- Update toggle text menjadi "Thought for X.Xs"
- Handle special case untuk web search

---

## Event Listeners

### Welcome Button Click - [renderer.js:14717-14728](../renderer/renderer.js#L14717-L14728)
**Trigger:** Klik tombol `#markdown-test-welcome` di welcome screen
**Handler:** `startMarkdownTestFromWelcome()`

### Chat Button Click - [renderer.js:15429-15443](../renderer/renderer.js#L15429-L15443)
**Trigger:** Klik tombol `#markdown-test-chat` di chat screen
**Handler:** `runMarkdownTestTurn(current)`

### Enter Key in Textarea - [renderer.js:15411-15424](../renderer/renderer.js#L15411-L15424)
**Trigger:** Tekan Enter (tanpa Shift) di `#msg` textarea
**Handler:** Jika markdown test session ’ `runMarkdownTestTurn(current, e.target.value)`

### Send Button Click - [renderer.js:15449-15454](../renderer/renderer.js#L15449-L15454)
**Trigger:** Klik tombol `#send`
**Handler:** Jika markdown test session ’ `runMarkdownTestTurn(current, composer.value)`

### `send()` Function Override - [renderer.js:12730-12733](../renderer/renderer.js#L12730-L12733)
**Fungsi:** Function utama untuk send message
**Handler:** Cek dulu apakah markdown test session, jika ya ’ delegate ke `runMarkdownTestTurn()`

---

## Diagram Alur Lengkap

```
                                                                 
                    USER ACTION: KLIK TOMBOL                      
                            ,                                    
                             
                             ¼
                                            
                 DEBUG_MARKDOWN === true?   
                        ,                   
                          YES
                         ¼
                                                
           startMarkdownTestFromWelcome()       
           [renderer.js:466]                    
                                                $
          1. Ambil input dari #msg-central      
          2. Clear textarea & draft             
          3. Create new session                 
             - type: "markdown-test"            
             - isMarkdownTest: true             
          4. setCurrent(session)                
          5. updateMarkdownControls()           
                         ,                      
                          
                          ¼
                                                
           runMarkdownTestTurn(session, input)  
           [renderer.js:502]                    
                                                $
          1. Validasi (DEBUG, session type,     
             no active stream)                  
          2. Reset scroll state                 
          3. Clear textarea & draft             
          4. Add USER message:                  
             - ["user", "[MARKDOWN TEST]"]      
             - addMessage("user", ...)          
          5. Add AI message (empty):            
             - ["ai", "", modelInfo]            
             - addMessage("ai", "", ...)        
          6. createResponseSpacer()             
          7. scheduleThinkingText(aiNode)       
                         ,                      
                          
                          ¼
                                                
           buildMarkdownTestScenario(input)     
           [renderer.js:414]                    
                                                $
          IF input empty:                       
            ’ DEFAULT_MARKDOWN_TEST_TEMPLATE    
          ELSE:                                 
            ’ { think: "...", response: input } 
                         ,                      
                          
                          ¼ scenario object
                                                
           streamMarkdownTestResponse()         
           [renderer.js:589]                    
                                                $
          1. Generate streamId                  
          2. createStreamHandler(streamId)      
          3. Setup controller { cancel() }      
          4. streamManager.startStream()        
                         ,                      
                          
                          ¼
                                                
           Delay 120ms ’ beginStreaming()       
           [renderer.js:630]                    
                         ,                      
                          
                         4                    
                                               
        ¼                                       ¼
                                                          
 THINKING PHASE                    RESPONSE PHASE         
                  $                                        $
 appendThinking()                splitMarkdownFor         
 [Line 635]                        Streaming()            
                                 [Line 647]               
 Update:                                                  
 session._x_think                setInterval(24ms):       
 [messageIndex]                                         
                                  handler(token[i])     
 finalizeThinking                 i++                   
 UI()                                                   
 [Line 645]                                               
 "Thought for Xs"                When done:               
                                 handler(null) ’ END      
                                                            
                                              
                                              ¼
                                                         
                            createStreamHandler()        
                            [renderer.js:11618]          
                                                         $
                           Receives tokens:              
                           - Accumulate to fullResponse  
                           - Render incrementally to DOM 
                           - Update markdown rendering   
                                                         
                           On null (END):                
                           - Finalize message            
                           - Save session                
                           - cleanup stream              
                                                         
```

---

## Kesimpulan

**DEBUG_MARKDOWN** adalah sistem testing lengkap untuk markdown renderer yang:

1. **Bekerja Offline** - Tidak butuh API call, semua simulasi lokal
2. **Fast Iteration** - Developer bisa test rendering dengan cepat
3. **Realistic Simulation** - Mensimulasikan streaming dengan timing yang realistis (24ms per token)
4. **Complete Flow** - Mencakup thinking phase, response phase, dan finalization
5. **Easy to Use** - Toggle `DEBUG_MARKDOWN = true/false` untuk enable/disable

**Use Cases:**
- Test markdown rendering untuk berbagai format
- Debug streaming performance
- Verify thinking UI transitions
- Test error handling tanpa waste API credits
- Demo features tanpa internet connection

**Key Features:**
- Token-by-token streaming simulation
- Thinking phase dengan duration tracking
- Template showcase untuk test berbagai elemen markdown
- Custom input support untuk test specific markdown
- Full integration dengan stream manager dan rendering pipeline
