# AI Plan for Thinking Update Implementation

## 📋 Overview
Saat ini, thinking updates dari backend (melalui `chat-update` event dengan type `THINKING`) dan AI thinking stream disatukan ke dalam elemen `.thinking-text` yang sama. Hal ini menyebabkan confusion karena thinking update seharusnya terformat sebagai markdown terstruktur dengan judul dan konten, sementara `.thinking-text` hanya menampilkan raw thinking stream.

**Tujuan:** Memisahkan thinking update dari backend ke elemen baru `.thinking-update` yang terpisah dari `.thinking-text`, dan menyimpan thinking update ini ke database untuk dapat di-load kembali.

## 🔍 Current State Analysis

### 1. **Thinking Text Structure**
**Location:** `renderer/renderer.js` → `ensureThinkingUI()` (line ~1540-1640)

**Current DOM:**
```html
<div class="thinking-wrap">
  <button class="thinking-toggle">...</button>
  <div class="thinking-body expanded">
    <div class="thinking-text">
      <!-- Currently contains BOTH AI thinking stream AND backend thinking updates -->
    </div>
  </div>
</div>
```

### 2. **Chat-Update Event Handler**
**Location:** `renderer/renderer.js` (line ~14101-14162)

```javascript
window.api.on("chat-update", (payload) => {
  const { type, messageIndex, data } = payload;
  
  if (type === "THINKING") {
    const thinkContent = data?.think;  // Contains {title, content}
    appendThinking(bubbleNode, thinkContent, sess, messageIndex);  // ❌ Goes to .thinking-text
  }
});
```

### 3. **AppendThinking Function**
**Location:** `renderer/renderer.js` (line ~1645-1670)

```javascript
async function appendThinking(aiNode, chunk, session, messageIndex) {
  // Currently updates session._x_think[messageIndex]
  // Then calls updateThinkingUI() which renders to .thinking-text
}
```

### 4. **Backend Thinking Updates**
**Location:** `main.js` (line ~1046)

```javascript
if (update.type === 'thinking_log') {
  // Sends to 'search:status' instead of 'chat-update'
  event.sender.send('search:status', { ... });
}
```

**Location:** `backend/langchain-agents.js` (line ~326-365)

```javascript
emitPlanThinking(plan, progressCallback) {
  progressCallback({
    type: 'thinking_log',
    entry: {
      text: `• ${plan.title}`,      // ✅ Has title
      stage: 'plan-title',          // ✅ Has stage/category
    },
  });
}
```

### 5. **Database Schema**
**Location:** `backend/database-manager.js` (line ~50-70)

```sql
CREATE TABLE messages (
  think_mode TEXT,
  think_content TEXT,  -- Currently stores session._x_think (AI stream)
  -- ❌ No field for thinking_update
)
```

## 🎯 Implementation Plan

### **Phase 1: Database Schema Update**

#### Task 1.1: Add thinking_update Column
**File:** `backend/database-manager.js`

**Action:** Add new column to messages table for storing structured thinking updates.

```sql
ALTER TABLE messages ADD COLUMN thinking_update TEXT;
```

**Changes:**
1. Update `initSchema()` to include `thinking_update TEXT` in messages table
2. Update `addMessage()` to accept and store `thinkingUpdate` in metadata
3. Update `upsertMessage()` to handle `thinkingUpdate` field
4. Create migration script for existing database

---

### **Phase 2: Backend Update Flow**

#### Task 2.1: Standardize Thinking Update Format
**File:** `main.js`

**Current:**
```javascript
if (update.type === 'thinking_log') {
  event.sender.send('search:status', { ... });  // ❌ Wrong channel
}
```

**New:**
```javascript
if (update.type === 'thinking_log') {
  const aiMessageIndex = session.messages ? session.messages.length - 1 : 0;
  event.sender.send('chat-update', {
    type: 'THINKING',
    messageIndex: aiMessageIndex,
    data: {
      sessionId: session?.id || null,
      think: {
        title: update.entry?.stage || 'Thinking',
        content: update.entry?.text || update.content || ''
      }
    }
  });
}
```

**Changes:**
1. Route all `thinking_log` updates through `chat-update` channel
2. Format payload with proper structure: `{ title, content }`
3. Include `sessionId` for proper session tracking

#### Task 2.2: Update RE+ACT Agent Thinking
**File:** `backend/reasoning-action-agent.js`

**Changes:**
1. Ensure all thinking updates from RE+ACT follow format: `{ title, content }`
2. Update line ~142 and ~286 where `type: 'thinking'` is sent

---

### **Phase 3: Frontend DOM Structure**

#### Task 3.1: Update ensureThinkingUI
**File:** `renderer/renderer.js` → `ensureThinkingUI()`

**Current:**
```html
<div class="thinking-body">
  <div class="thinking-text"></div>
</div>
```

**New:**
```html
<div class="thinking-body">
  <div class="thinking-update"></div>  <!-- NEW: Structured updates from backend -->
  <div class="thinking-text"></div>    <!-- EXISTING: AI stream thinking -->
</div>
```

**Implementation:**
```javascript
const body = document.createElement("div");
body.className = "thinking-body";

// NEW: Create thinking-update container
const thinkingUpdate = document.createElement("div");
thinkingUpdate.className = "thinking-update";

const text = document.createElement("div");
text.className = "thinking-text";

body.appendChild(thinkingUpdate);  // Add update container FIRST
body.appendChild(text);            // Then text container
```

**Changes:**
1. Add `thinkingUpdate` element creation
2. Update `aiNode._thinkingEl` to include reference to `thinkingUpdate`
3. Handle rehydration for existing thinking-wrap (cache restore)

---

### **Phase 4: Thinking Update Handler**

#### Task 4.1: Create appendThinkingUpdate Function
**File:** `renderer/renderer.js`

**New Function:**
```javascript
async function appendThinkingUpdate(aiNode, updateData, session, messageIndex) {
  if (!updateData || !aiNode || !session || messageIndex == null) return;
  
  ensureThinkingUI(aiNode);
  
  // Structure: { title, content }
  const title = updateData.title || 'Update';
  const content = updateData.content || '';
  
  // Store in session
  session._x_think_updates = session._x_think_updates || {};
  if (!session._x_think_updates[messageIndex]) {
    session._x_think_updates[messageIndex] = [];
  }
  session._x_think_updates[messageIndex].push({ title, content, timestamp: Date.now() });
  
  // Update UI
  await updateThinkingUpdateUI(aiNode, session, messageIndex);
  
  saveThinkingDebounced();
}
```

#### Task 4.2: Create updateThinkingUpdateUI Function
**File:** `renderer/renderer.js`

**New Function:**
```javascript
async function updateThinkingUpdateUI(aiNode, session, messageIndex) {
  const el = aiNode._thinkingEl;
  if (!el || !el.thinkingUpdate) return;
  
  if (!el.body.classList.contains('expanded')) {
    el.body.classList.add('expanded');
    el.toggle.setAttribute('aria-expanded', 'true');
  }
  
  const updates = session._x_think_updates?.[messageIndex] || [];
  
  // Build HTML for all updates
  let html = '';
  for (const update of updates) {
    const formattedContent = await customMarkdownFormat(update.content);
    html += `
      <div class="thinking-update-item">
        <div class="thinking-update-title">${escapeHtml(update.title)}</div>
        <div class="thinking-update-content">${formattedContent}</div>
      </div>
    `;
  }
  
  el.thinkingUpdate.innerHTML = html;
  scrollThinkingToBottom(el);
}
```

#### Task 4.3: Update Chat-Update Handler
**File:** `renderer/renderer.js` (line ~14101-14162)

**Current:**
```javascript
if (type === "THINKING") {
  appendThinking(bubbleNode, thinkContent, sess, messageIndex);  // ❌ Wrong
}
```

**New:**
```javascript
if (type === "THINKING") {
  const thinkData = data?.think;
  
  if (thinkData && typeof thinkData === 'object' && thinkData.title) {
    // Backend thinking update with structure
    appendThinkingUpdate(bubbleNode, thinkData, sess, messageIndex);
  } else {
    // Legacy: Plain text thinking stream
    appendThinking(bubbleNode, thinkData, sess, messageIndex);
  }
}
```

---

### **Phase 5: Database Integration**

#### Task 5.1: Save Thinking Updates to Database
**File:** `renderer/renderer.js`

**Update save() function:**
```javascript
async function save() {
  for (const session of state.sessions) {
    if (session.messages) {
      for (let i = 0; i < session.messages.length; i++) {
        const msg = session.messages[i];
        const metadata = msg[2] || {};
        
        // Add thinking updates to metadata
        if (session._x_think_updates && session._x_think_updates[i]) {
          metadata.thinkingUpdate = session._x_think_updates[i];
        }
        
        await window.api.upsertMessage(session.id, msg[0], msg[1], metadata, i);
      }
    }
  }
}
```

#### Task 5.2: Load Thinking Updates from Database
**File:** `renderer/renderer.js`

**Update loadSessionsFromDatabase():**
```javascript
async function loadSessionsFromDatabase() {
  const dbSessions = await window.api.getAllSessions();
  
  for (const dbSession of dbSessions) {
    const messages = await window.api.getMessages(dbSession.id);
    
    const session = {
      // ... existing fields
      _x_think_updates: {}
    };
    
    messages.forEach(msg => {
      const metadata = JSON.parse(msg.metadata || '{}');
      
      // Load thinking updates
      if (metadata.thinkingUpdate) {
        session._x_think_updates[msg.message_index] = metadata.thinkingUpdate;
      }
    });
    
    state.sessions.push(session);
  }
}
```

#### Task 5.3: Restore Thinking Updates in UI
**File:** `renderer/renderer.js`

**Update renderCachedMessages():**
```javascript
async function renderCachedMessages(session) {
  for (let i = 0; i < session.messages.length; i++) {
    const msg = session.messages[i];
    const aiNode = createAIMessageNode();
    
    // ... existing rendering
    
    // Restore thinking updates
    if (session._x_think_updates && session._x_think_updates[i]) {
      await updateThinkingUpdateUI(aiNode, session, i);
    }
  }
}
```

---

### **Phase 6: Styling**

#### Task 6.1: Add CSS for Thinking Update
**File:** `renderer/style.css`

**Add new styles:**
```css
/* Thinking update container */
.thinking-update {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border-color);
}

.thinking-update:last-child {
  border-bottom: none;
  margin-bottom: 0;
  padding-bottom: 0;
}

.thinking-update-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 0;
}

.thinking-update-title {
  font-weight: 600;
  font-size: 12px;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.thinking-update-content {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-primary);
}

.thinking-update-content p {
  margin: 0 0 8px 0;
}

.thinking-update-content p:last-child {
  margin-bottom: 0;
}

/* Markdown formatting for thinking-update */
.thinking-update-content h1,
.thinking-update-content h2,
.thinking-update-content h3,
.thinking-update-content h4,
.thinking-update-content h5,
.thinking-update-content h6 {
  font-size: 13px;
  font-weight: 600;
  margin: 8px 0 4px 0;
}

.thinking-update-content ul,
.thinking-update-content ol {
  margin: 4px 0;
  padding-left: 20px;
}

.thinking-update-content li {
  margin: 2px 0;
}

.thinking-update-content code {
  background: var(--code-bg);
  padding: 2px 4px;
  border-radius: 3px;
  font-size: 12px;
}

.thinking-update-content pre {
  background: var(--code-bg);
  padding: 8px;
  border-radius: 4px;
  overflow-x: auto;
  margin: 8px 0;
}

/* When both update and text exist, add spacing */
.thinking-body .thinking-update + .thinking-text {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border-color);
}
```

---

### **Phase 7: Testing & Validation**

#### Task 7.1: Test Thinking Update Flow
**Scenarios:**
1. ✅ New chat with research agent → thinking updates appear in `.thinking-update`
2. ✅ AI thinking stream → appears in `.thinking-text`
3. ✅ Both updates → appear in separate containers
4. ✅ Save session → thinking updates stored to database
5. ✅ Load session → thinking updates restored from database
6. ✅ Cache restore → thinking updates rehydrated correctly

#### Task 7.2: Test Database Migration
**Scenarios:**
1. ✅ Fresh install → new schema created
2. ✅ Existing database → migration adds `thinking_update` column
3. ✅ Old sessions without thinking updates → load without errors
4. ✅ New sessions with thinking updates → save and load correctly

#### Task 7.3: Cross-Browser Testing
**Browsers:**
- ✅ Chrome
- ✅ Edge
- ✅ Firefox (if applicable)

---

## 📊 Implementation Checklist

### Phase 1: Database Schema ✅
- [ ] Add `thinking_update` column to messages table
- [ ] Update `addMessage()` to handle `thinkingUpdate`
- [ ] Update `upsertMessage()` to handle `thinkingUpdate`
- [ ] Create database migration script

### Phase 2: Backend Update Flow ✅
- [ ] Route `thinking_log` through `chat-update` channel
- [ ] Standardize payload format: `{ title, content }`
- [ ] Update RE+ACT agent thinking emissions

### Phase 3: Frontend DOM Structure ✅
- [ ] Add `.thinking-update` element in `ensureThinkingUI()`
- [ ] Update `aiNode._thinkingEl` to include `thinkingUpdate` reference
- [ ] Handle cache restore for `.thinking-update`

### Phase 4: Thinking Update Handler ✅
- [ ] Create `appendThinkingUpdate()` function
- [ ] Create `updateThinkingUpdateUI()` function
- [ ] Update `chat-update` handler to route to correct function
- [ ] Add `escapeHtml()` helper if not exists

### Phase 5: Database Integration ✅
- [ ] Update `save()` to store `thinkingUpdate` in metadata
- [ ] Update `loadSessionsFromDatabase()` to load `thinkingUpdate`
- [ ] Update `renderCachedMessages()` to restore thinking updates

### Phase 6: Styling ✅
- [ ] Add CSS for `.thinking-update` container
- [ ] Add CSS for `.thinking-update-item`
- [ ] Add CSS for `.thinking-update-title` and `.thinking-update-content`
- [ ] Add markdown styling for thinking update content
- [ ] Add spacing between `.thinking-update` and `.thinking-text`

### Phase 7: Testing ✅
- [ ] Test new chat with research agent
- [ ] Test AI thinking stream
- [ ] Test combined thinking update + stream
- [ ] Test save and load from database
- [ ] Test cache restore
- [ ] Test database migration
- [ ] Cross-browser testing

---

## 🚀 Execution Order

1. **Database Schema Update** (Phase 1) - Foundation
2. **Backend Update Flow** (Phase 2) - Data source
3. **Frontend DOM Structure** (Phase 3) - UI foundation
4. **Thinking Update Handler** (Phase 4) - Core logic
5. **Database Integration** (Phase 5) - Persistence
6. **Styling** (Phase 6) - Visual polish
7. **Testing & Validation** (Phase 7) - Quality assurance

---

## 📝 Notes

- **Backward Compatibility:** Old sessions without thinking updates will still work
- **Data Structure:** `session._x_think_updates[messageIndex]` is an array of `{ title, content, timestamp }`
- **Markdown Formatting:** Thinking update content is formatted using `customMarkdownFormat()`
- **Autoscroll:** Thinking update follows same scroll behavior as thinking text
- **Cache Restore:** Both `.thinking-update` and `.thinking-text` are restored from cached DOM

---

## 🎯 Success Criteria

1. ✅ Thinking updates from backend appear in `.thinking-update` element
2. ✅ AI thinking stream appears in `.thinking-text` element
3. ✅ Both elements are visually distinct and properly styled
4. ✅ Thinking updates are saved to database with message metadata
5. ✅ Thinking updates are restored correctly on session load
6. ✅ No visual regression in existing thinking text display
7. ✅ Database migration works without data loss

---

## 📚 References

- **Chat Update Handler:** `renderer/renderer.js` line ~14101-14162
- **Thinking UI:** `renderer/renderer.js` line ~1540-1850
- **Backend Agents:** `backend/langchain-agents.js` line ~326-365
- **Database Schema:** `backend/database-manager.js` line ~50-70
- **Main Process:** `main.js` line ~1046
