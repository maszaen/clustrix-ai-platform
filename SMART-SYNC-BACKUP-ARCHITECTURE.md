# Smart Sync & Backup Architecture - Detailed Design

## 🎯 Tujuan

Redesign sistem sync/backup Clustrix untuk support:
- ✅ Multi-device collaboration tanpa data loss
- ✅ Conflict detection & resolution
- ✅ Delta sync (hanya sync perubahan)
- ✅ Message-level granularity (bukan hanya session)
- ✅ Soft delete dengan tombstone pattern
- ✅ Device tracking untuk audit trail

---

## 📊 Database Schema Changes

### 1. Sessions Table - Add Tracking Columns

```sql
ALTER TABLE sessions ADD COLUMN created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000);
ALTER TABLE sessions ADD COLUMN updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000);
ALTER TABLE sessions ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN device_id TEXT;
ALTER TABLE sessions ADD COLUMN synced_at INTEGER;
ALTER TABLE sessions ADD COLUMN hash TEXT;
```

**Penjelasan:**
- `created_at`: Timestamp saat session dibuat (milliseconds)
- `updated_at`: Timestamp terakhir diubah (auto-update on modify)
- `deleted`: Flag soft delete (0 = active, 1 = deleted)
- `device_id`: UUID device yang create/edit session
- `synced_at`: Timestamp terakhir di-sync ke cloud
- `hash`: SHA256 hash dari session content (for conflict detection)

### 2. Messages Table - Separate from Sessions

**Current:**
```json
{
  "id": "session-123",
  "title": "My Chat",
  "messages": [
    { "role": "user", "content": "Hello" },
    { "role": "assistant", "content": "Hi!" }
  ]
}
```

**Problem:** Tidak bisa track individual message changes

**New Schema:**
```sql
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted INTEGER DEFAULT 0,
  device_id TEXT,
  synced_at INTEGER,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE INDEX idx_messages_session ON messages(session_id);
CREATE INDEX idx_messages_sequence ON messages(session_id, sequence);
CREATE INDEX idx_messages_updated ON messages(updated_at);
```

**Penjelasan:**
- `id`: Unique message ID (UUID)
- `session_id`: Foreign key ke sessions table
- `sequence`: Order message dalam session (0, 1, 2, ...)
- `created_at`, `updated_at`, `deleted`, `device_id`, `synced_at`: Same as sessions

**Migration Path:**
```javascript
// Migrate existing sessions to new schema
for (const session of existingSessions) {
  // 1. Keep session in sessions table (add new columns)
  await db.run(`UPDATE sessions SET 
    created_at = ?, 
    updated_at = ?, 
    device_id = ?,
    hash = ?
    WHERE id = ?`, [
    session.timestamp || Date.now(),
    session.timestamp || Date.now(),
    getDeviceId(),
    generateSessionHash(session),
    session.id
  ]);
  
  // 2. Extract messages to messages table
  for (let i = 0; i < session.messages.length; i++) {
    const msg = session.messages[i];
    await db.run(`INSERT INTO messages 
      (id, session_id, role, content, sequence, created_at, updated_at, device_id) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
      generateUUID(),
      session.id,
      msg.role,
      msg.content,
      i,
      session.timestamp || Date.now(),
      session.timestamp || Date.now(),
      getDeviceId()
    ]);
  }
  
  // 3. Remove messages array from session JSON
  // Keep session metadata in sessions table
}
```

### 3. Sync Metadata Table

```sql
CREATE TABLE IF NOT EXISTS sync_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Initial data
INSERT INTO sync_metadata (key, value, updated_at) VALUES
  ('device_id', '<UUID>', <timestamp>),
  ('last_sync_time', '0', <timestamp>),
  ('last_backup_time', '0', <timestamp>),
  ('pending_changes_count', '0', <timestamp>);
```

**Keys:**
- `device_id`: Unique identifier untuk device ini
- `last_sync_time`: Timestamp terakhir sukses sync FROM cloud
- `last_backup_time`: Timestamp terakhir sukses backup TO cloud
- `pending_changes_count`: Jumlah changes yang belum di-backup

---

## 🔄 Smart Sync Algorithm (Download from Cloud)

### High-Level Flow

```
User clicks "Sync Now"
    ↓
1. Download cloud DB to temp location
2. Compare with local DB (session-level + message-level)
3. Detect changes: new, updated, deleted, conflicts
4. Show conflict UI if needed
5. Apply merged data to local DB
6. Update sync_metadata.last_sync_time
7. Show success toast
```

### Detailed Algorithm

```javascript
async function smartSync() {
  const startTime = Date.now();
  const conflicts = [];
  const stats = {
    sessionsAdded: 0,
    sessionsUpdated: 0,
    sessionsDeleted: 0,
    messagesAdded: 0,
    messagesUpdated: 0,
    messagesDeleted: 0,
    conflictsDetected: 0
  };
  
  try {
    // Step 1: Download cloud database
    console.log('[Sync] Downloading cloud database...');
    const cloudDbPath = await downloadCloudDatabase();
    const cloudDb = openDatabase(cloudDbPath);
    const localDb = getCurrentDatabase();
    
    // Step 2: Get device info
    const deviceId = await getDeviceId();
    const lastSyncTime = await getSyncMetadata('last_sync_time');
    
    // Step 3: Compare sessions
    const cloudSessions = await cloudDb.getAllSessions(); // WHERE deleted = 0 OR updated_at > lastSyncTime
    const localSessions = await localDb.getAllSessions();
    
    const cloudSessionMap = new Map(cloudSessions.map(s => [s.id, s]));
    const localSessionMap = new Map(localSessions.map(s => [s.id, s]));
    
    // Step 4: Process each cloud session
    for (const [sessionId, cloudSession] of cloudSessionMap) {
      const localSession = localSessionMap.get(sessionId);
      
      if (!localSession) {
        // Case 1: New session in cloud (not in local)
        if (cloudSession.deleted) {
          // Already deleted in cloud, skip
          continue;
        } else {
          // Add session to local
          await localDb.insertSession(cloudSession);
          
          // Also add all messages
          const cloudMessages = await cloudDb.getMessages(sessionId);
          for (const msg of cloudMessages) {
            if (!msg.deleted) {
              await localDb.insertMessage(msg);
              stats.messagesAdded++;
            }
          }
          
          stats.sessionsAdded++;
          console.log(`[Sync] Added session: ${sessionId}`);
        }
      } else {
        // Case 2: Session exists in both local and cloud
        
        // Check if deleted in cloud
        if (cloudSession.deleted && !localSession.deleted) {
          // Deleted in cloud, mark deleted locally
          await localDb.markSessionDeleted(sessionId);
          
          // Also mark all messages deleted
          await localDb.markSessionMessagesDeleted(sessionId);
          
          stats.sessionsDeleted++;
          console.log(`[Sync] Deleted session: ${sessionId}`);
          continue;
        }
        
        // Check if deleted locally (keep local deletion, will propagate on backup)
        if (localSession.deleted && !cloudSession.deleted) {
          console.log(`[Sync] Session deleted locally, skip: ${sessionId}`);
          continue;
        }
        
        // Both active, compare timestamps
        if (cloudSession.updated_at > localSession.updated_at) {
          // Cloud is newer, update local
          await localDb.updateSession(cloudSession);
          stats.sessionsUpdated++;
          console.log(`[Sync] Updated session (cloud newer): ${sessionId}`);
          
          // Sync messages for this session
          await syncSessionMessages(sessionId, cloudDb, localDb, stats, conflicts);
          
        } else if (cloudSession.updated_at < localSession.updated_at) {
          // Local is newer, keep local (will upload on backup)
          console.log(`[Sync] Session newer locally, skip: ${sessionId}`);
          
          // Still check messages (might have changes)
          await syncSessionMessages(sessionId, cloudDb, localDb, stats, conflicts);
          
        } else {
          // Same timestamp, check hash
          if (cloudSession.hash !== localSession.hash) {
            // CONFLICT! Same timestamp but different content
            conflicts.push({
              type: 'session',
              sessionId: sessionId,
              local: localSession,
              cloud: cloudSession
            });
            stats.conflictsDetected++;
            console.log(`[Sync] Conflict detected: ${sessionId}`);
          } else {
            // Same hash, still check messages
            await syncSessionMessages(sessionId, cloudDb, localDb, stats, conflicts);
          }
        }
      }
    }
    
    // Step 5: Check for local-only sessions
    for (const [sessionId, localSession] of localSessionMap) {
      if (!cloudSessionMap.has(sessionId) && !localSession.deleted) {
        // Local session not in cloud yet
        // Will be uploaded on next backup
        console.log(`[Sync] Local-only session (will backup): ${sessionId}`);
      }
    }
    
    // Step 6: Handle conflicts if any
    if (conflicts.length > 0) {
      console.log(`[Sync] Showing conflict resolution UI for ${conflicts.length} conflicts`);
      const resolutions = await showConflictResolutionUI(conflicts);
      
      for (const resolution of resolutions) {
        if (resolution.type === 'session') {
          if (resolution.choice === 'keep-cloud') {
            await localDb.updateSession(resolution.cloud);
            // Also sync messages
            await syncSessionMessages(resolution.sessionId, cloudDb, localDb, stats, []);
          } else if (resolution.choice === 'keep-local') {
            // Keep local, will upload on backup
          } else if (resolution.choice === 'merge') {
            // Merge session metadata (use cloud)
            await localDb.updateSession(resolution.cloud);
            // Merge messages (combine both)
            await mergeSessionMessages(resolution.sessionId, cloudDb, localDb, stats);
          }
        } else if (resolution.type === 'message') {
          if (resolution.choice === 'keep-cloud') {
            await localDb.updateMessage(resolution.cloud);
          } else if (resolution.choice === 'keep-local') {
            // Keep local, will upload on backup
          } else if (resolution.choice === 'merge') {
            // Cannot merge single message, must choose one
            // Default to cloud
            await localDb.updateMessage(resolution.cloud);
          }
        }
      }
    }
    
    // Step 7: Update sync metadata
    await setSyncMetadata('last_sync_time', startTime);
    await setSyncMetadata('pending_changes_count', 0);
    
    // Step 8: Cleanup temp cloud DB
    await closeDatabaseAndDelete(cloudDbPath);
    
    console.log('[Sync] Complete:', stats);
    
    return {
      success: true,
      stats,
      duration: Date.now() - startTime
    };
    
  } catch (error) {
    console.error('[Sync] Error:', error);
    throw error;
  }
}

async function syncSessionMessages(sessionId, cloudDb, localDb, stats, conflicts) {
  const cloudMessages = await cloudDb.getMessages(sessionId);
  const localMessages = await localDb.getMessages(sessionId);
  
  const cloudMsgMap = new Map(cloudMessages.map(m => [m.id, m]));
  const localMsgMap = new Map(localMessages.map(m => [m.id, m]));
  
  // Process each cloud message
  for (const [msgId, cloudMsg] of cloudMsgMap) {
    const localMsg = localMsgMap.get(msgId);
    
    if (!localMsg) {
      // New message from cloud
      if (!cloudMsg.deleted) {
        await localDb.insertMessage(cloudMsg);
        stats.messagesAdded++;
      }
    } else {
      // Message exists in both
      if (cloudMsg.deleted && !localMsg.deleted) {
        await localDb.markMessageDeleted(msgId);
        stats.messagesDeleted++;
      } else if (!cloudMsg.deleted && !localMsg.deleted) {
        // Both active, compare timestamps
        if (cloudMsg.updated_at > localMsg.updated_at) {
          await localDb.updateMessage(cloudMsg);
          stats.messagesUpdated++;
        } else if (cloudMsg.updated_at === localMsg.updated_at) {
          // Check content
          if (cloudMsg.content !== localMsg.content) {
            // Message conflict
            conflicts.push({
              type: 'message',
              sessionId: sessionId,
              messageId: msgId,
              local: localMsg,
              cloud: cloudMsg
            });
            stats.conflictsDetected++;
          }
        }
      }
    }
  }
  
  // Check for local-only messages (will backup later)
  for (const [msgId, localMsg] of localMsgMap) {
    if (!cloudMsgMap.has(msgId) && !localMsg.deleted) {
      console.log(`[Sync] Local-only message: ${msgId} in session ${sessionId}`);
    }
  }
}

async function mergeSessionMessages(sessionId, cloudDb, localDb, stats) {
  // Get all messages from both (including deleted)
  const cloudMessages = await cloudDb.getMessages(sessionId);
  const localMessages = await localDb.getMessages(sessionId);
  
  // Combine and deduplicate by ID
  const allMessages = new Map();
  
  for (const msg of cloudMessages) {
    allMessages.set(msg.id, msg);
  }
  
  for (const msg of localMessages) {
    const existing = allMessages.get(msg.id);
    if (!existing || msg.updated_at > existing.updated_at) {
      allMessages.set(msg.id, msg);
    }
  }
  
  // Sort by sequence and apply to local
  const sortedMessages = Array.from(allMessages.values())
    .filter(m => !m.deleted)
    .sort((a, b) => a.sequence - b.sequence);
  
  // Re-sequence
  for (let i = 0; i < sortedMessages.length; i++) {
    sortedMessages[i].sequence = i;
  }
  
  // Update local database
  await localDb.transaction(async () => {
    // Delete all messages for session
    await localDb.deleteAllMessagesForSession(sessionId);
    
    // Insert merged messages
    for (const msg of sortedMessages) {
      await localDb.insertMessage(msg);
      stats.messagesAdded++;
    }
  });
}
```

---

## ⬆️ Smart Backup Algorithm (Upload to Cloud)

### High-Level Flow

```
User clicks "Backup Now"
    ↓
1. Query local changes since last_backup_time
2. Download current cloud DB
3. Apply local changes to cloud DB (delta)
4. Upload modified cloud DB
5. Update sync_metadata.last_backup_time
6. Show success toast
```

### Detailed Algorithm

```javascript
async function smartBackup() {
  const startTime = Date.now();
  const stats = {
    sessionsUploaded: 0,
    messagesUploaded: 0,
    deletionsUploaded: 0
  };
  
  try {
    // Step 1: Get local changes
    const lastBackupTime = await getSyncMetadata('last_backup_time');
    const deviceId = await getDeviceId();
    
    console.log(`[Backup] Finding changes since ${new Date(lastBackupTime)}`);
    
    const changes = await getChangesSinceBackup(lastBackupTime);
    
    /*
    changes = {
      sessions: {
        new: [session1, session2],
        updated: [session3, session4],
        deleted: [id5, id6]
      },
      messages: {
        new: [msg1, msg2, msg3],
        updated: [msg4, msg5],
        deleted: [msgId6, msgId7]
      }
    }
    */
    
    const totalChanges = 
      changes.sessions.new.length +
      changes.sessions.updated.length +
      changes.sessions.deleted.length +
      changes.messages.new.length +
      changes.messages.updated.length +
      changes.messages.deleted.length;
    
    if (totalChanges === 0) {
      console.log('[Backup] No changes to backup');
      return {
        success: true,
        message: 'No changes to backup',
        stats
      };
    }
    
    console.log(`[Backup] Found ${totalChanges} changes:`, {
      newSessions: changes.sessions.new.length,
      updatedSessions: changes.sessions.updated.length,
      deletedSessions: changes.sessions.deleted.length,
      newMessages: changes.messages.new.length,
      updatedMessages: changes.messages.updated.length,
      deletedMessages: changes.messages.deleted.length
    });
    
    // Step 2: Download current cloud DB
    console.log('[Backup] Downloading current cloud database...');
    const cloudDbPath = await downloadCloudDatabase();
    const cloudDb = openDatabase(cloudDbPath);
    
    // Step 3: Apply changes to cloud DB
    await cloudDb.transaction(async () => {
      // 3a: Insert new sessions
      for (const session of changes.sessions.new) {
        await cloudDb.insertSession(session);
        stats.sessionsUploaded++;
        
        // Also insert messages for this session
        const messages = await localDb.getMessages(session.id);
        for (const msg of messages) {
          if (!msg.deleted) {
            await cloudDb.insertMessage(msg);
            stats.messagesUploaded++;
          }
        }
      }
      
      // 3b: Update modified sessions
      for (const session of changes.sessions.updated) {
        await cloudDb.updateSession(session);
        stats.sessionsUploaded++;
        
        // Messages will be handled separately in 3d/3e
      }
      
      // 3c: Mark deleted sessions
      for (const sessionId of changes.sessions.deleted) {
        await cloudDb.markSessionDeleted(sessionId);
        // Also mark all messages deleted
        await cloudDb.markSessionMessagesDeleted(sessionId);
        stats.deletionsUploaded++;
      }
      
      // 3d: Insert new messages
      for (const msg of changes.messages.new) {
        await cloudDb.insertMessage(msg);
        stats.messagesUploaded++;
      }
      
      // 3e: Update modified messages
      for (const msg of changes.messages.updated) {
        await cloudDb.updateMessage(msg);
        stats.messagesUploaded++;
      }
      
      // 3f: Mark deleted messages
      for (const msgId of changes.messages.deleted) {
        await cloudDb.markMessageDeleted(msgId);
        stats.deletionsUploaded++;
      }
    });
    
    // Step 4: Upload modified cloud DB to GitHub
    console.log('[Backup] Uploading modified database to GitHub...');
    await uploadCloudDatabase(cloudDbPath);
    
    // Step 5: Update local synced_at timestamps
    await localDb.transaction(async () => {
      // Mark all changed sessions as synced
      const allChangedSessionIds = [
        ...changes.sessions.new.map(s => s.id),
        ...changes.sessions.updated.map(s => s.id),
        ...changes.sessions.deleted
      ];
      
      for (const sessionId of allChangedSessionIds) {
        await localDb.updateSyncedAt(sessionId, startTime);
      }
      
      // Mark all changed messages as synced
      const allChangedMessageIds = [
        ...changes.messages.new.map(m => m.id),
        ...changes.messages.updated.map(m => m.id),
        ...changes.messages.deleted
      ];
      
      for (const msgId of allChangedMessageIds) {
        await localDb.updateMessageSyncedAt(msgId, startTime);
      }
    });
    
    // Step 6: Update backup metadata
    await setSyncMetadata('last_backup_time', startTime);
    await setSyncMetadata('pending_changes_count', 0);
    
    // Step 7: Cleanup temp cloud DB
    await closeDatabaseAndDelete(cloudDbPath);
    
    console.log('[Backup] Complete:', stats);
    
    return {
      success: true,
      stats,
      duration: Date.now() - startTime
    };
    
  } catch (error) {
    console.error('[Backup] Error:', error);
    throw error;
  }
}

async function getChangesSinceBackup(lastBackupTime) {
  const localDb = getCurrentDatabase();
  
  // Query sessions changed since last backup
  const newSessions = await localDb.query(`
    SELECT * FROM sessions 
    WHERE created_at > ? AND deleted = 0
  `, [lastBackupTime]);
  
  const updatedSessions = await localDb.query(`
    SELECT * FROM sessions 
    WHERE updated_at > ? AND created_at <= ? AND deleted = 0
  `, [lastBackupTime, lastBackupTime]);
  
  const deletedSessions = await localDb.query(`
    SELECT id FROM sessions 
    WHERE deleted = 1 AND updated_at > ?
  `, [lastBackupTime]);
  
  // Query messages changed since last backup
  const newMessages = await localDb.query(`
    SELECT * FROM messages 
    WHERE created_at > ? AND deleted = 0
  `, [lastBackupTime]);
  
  const updatedMessages = await localDb.query(`
    SELECT * FROM messages 
    WHERE updated_at > ? AND created_at <= ? AND deleted = 0
  `, [lastBackupTime, lastBackupTime]);
  
  const deletedMessages = await localDb.query(`
    SELECT id FROM messages 
    WHERE deleted = 1 AND updated_at > ?
  `, [lastBackupTime]);
  
  return {
    sessions: {
      new: newSessions,
      updated: updatedSessions,
      deleted: deletedSessions.map(row => row.id)
    },
    messages: {
      new: newMessages,
      updated: updatedMessages,
      deleted: deletedMessages.map(row => row.id)
    }
  };
}
```

---

## 🎨 Conflict Resolution UI

### Modal Design

```
┌─────────────────────────────────────────────────────────────┐
│  ⚠️  Sync Conflicts Detected                           [X]  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  We found 3 conflicts that need your attention.             │
│  Please review and choose which version to keep.            │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Conflict 1 of 3: Session "My Important Chat"         │ │
│  ├────────────────────────────────────────────────────────┤ │
│  │                                                         │ │
│  │  ┌─────────────────┐         ┌──────────────────────┐ │ │
│  │  │ 💻 This Device  │         │ ☁️ Cloud (PC2)       │ │ │
│  │  ├─────────────────┤         ├──────────────────────┤ │ │
│  │  │ Edited: 2h ago  │         │ Edited: 1h ago       │ │ │
│  │  │ Messages: 15    │         │ Messages: 12         │ │ │
│  │  │                 │         │                      │ │ │
│  │  │ Last message:   │         │ Last message:        │ │ │
│  │  │ "See you        │         │ "Need to finish      │ │ │
│  │  │  tomorrow"      │         │  the report"         │ │ │
│  │  │                 │         │                      │ │ │
│  │  │ [Keep This]     │         │ [Keep Cloud]         │ │ │
│  │  └─────────────────┘         └──────────────────────┘ │ │
│  │                                                         │ │
│  │  [Merge Both (Combine all messages)]                   │ │
│  │                                                         │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  [< Previous]  [Skip This]  [Next >]  [Apply All]          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Implementation

```javascript
async function showConflictResolutionUI(conflicts) {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'conflict-modal';
    
    let currentIndex = 0;
    const resolutions = [];
    
    function renderConflict(index) {
      const conflict = conflicts[index];
      const isSession = conflict.type === 'session';
      
      const html = `
        <div class="conflict-header">
          <h2>⚠️ Sync Conflicts Detected</h2>
          <button class="close-btn">×</button>
        </div>
        
        <div class="conflict-body">
          <p class="conflict-intro">
            Conflict ${index + 1} of ${conflicts.length}: 
            ${isSession ? 'Session' : 'Message'} 
            "${conflict.local.title || conflict.local.content?.substring(0, 50)}"
          </p>
          
          <div class="conflict-comparison">
            <div class="version local">
              <h3>💻 This Device</h3>
              <div class="metadata">
                <p>Device: ${conflict.local.device_id?.substring(0, 8)}</p>
                <p>Edited: ${formatTimestamp(conflict.local.updated_at)}</p>
                ${isSession ? `<p>Messages: ${conflict.local.messageCount}</p>` : ''}
              </div>
              <div class="preview">
                ${isSession 
                  ? `<p>Last message: "${conflict.local.lastMessage}"</p>`
                  : `<p>"${conflict.local.content}"</p>`
                }
              </div>
              <button class="choice-btn" data-choice="keep-local">
                Keep This Device
              </button>
            </div>
            
            <div class="version cloud">
              <h3>☁️ Cloud</h3>
              <div class="metadata">
                <p>Device: ${conflict.cloud.device_id?.substring(0, 8)}</p>
                <p>Edited: ${formatTimestamp(conflict.cloud.updated_at)}</p>
                ${isSession ? `<p>Messages: ${conflict.cloud.messageCount}</p>` : ''}
              </div>
              <div class="preview">
                ${isSession 
                  ? `<p>Last message: "${conflict.cloud.lastMessage}"</p>`
                  : `<p>"${conflict.cloud.content}"</p>`
                }
              </div>
              <button class="choice-btn" data-choice="keep-cloud">
                Keep Cloud Version
              </button>
            </div>
          </div>
          
          ${isSession ? `
            <button class="merge-btn" data-choice="merge">
              🔀 Merge Both (Combine all messages by timestamp)
            </button>
          ` : ''}
        </div>
        
        <div class="conflict-footer">
          <button class="nav-btn" ${index === 0 ? 'disabled' : ''}>
            &lt; Previous
          </button>
          <button class="skip-btn">Skip This</button>
          <button class="nav-btn" ${index === conflicts.length - 1 ? 'disabled' : ''}>
            Next &gt;
          </button>
          <button class="apply-btn" ${resolutions.length < conflicts.length ? 'disabled' : ''}>
            Apply All
          </button>
        </div>
      `;
      
      modal.innerHTML = html;
      
      // Attach event listeners
      modal.querySelector('.close-btn').onclick = () => {
        modal.remove();
        resolve([]);
      };
      
      modal.querySelectorAll('.choice-btn, .merge-btn').forEach(btn => {
        btn.onclick = () => {
          const choice = btn.dataset.choice;
          resolutions[index] = {
            ...conflict,
            choice
          };
          
          // Move to next conflict or finish
          if (index < conflicts.length - 1) {
            currentIndex++;
            renderConflict(currentIndex);
          } else {
            // All resolved
            modal.remove();
            resolve(resolutions);
          }
        };
      });
      
      modal.querySelector('.skip-btn').onclick = () => {
        // Default to keep-cloud
        resolutions[index] = {
          ...conflict,
          choice: 'keep-cloud'
        };
        
        if (index < conflicts.length - 1) {
          currentIndex++;
          renderConflict(currentIndex);
        } else {
          modal.remove();
          resolve(resolutions);
        }
      };
      
      // Navigation
      const navBtns = modal.querySelectorAll('.nav-btn');
      navBtns[0].onclick = () => {
        if (index > 0) {
          currentIndex--;
          renderConflict(currentIndex);
        }
      };
      navBtns[1].onclick = () => {
        if (index < conflicts.length - 1) {
          currentIndex++;
          renderConflict(currentIndex);
        }
      };
      
      modal.querySelector('.apply-btn').onclick = () => {
        if (resolutions.length === conflicts.length) {
          modal.remove();
          resolve(resolutions);
        }
      };
    }
    
    renderConflict(0);
    document.body.appendChild(modal);
  });
}
```

---

## 🔧 Helper Functions

### Device ID Generation

```javascript
function generateDeviceId() {
  const crypto = require('crypto');
  const os = require('os');
  
  // Combine machine-specific info
  const machineInfo = {
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    username: os.userInfo().username,
    // Do NOT use MAC address (privacy concern)
  };
  
  // Create hash
  const hash = crypto
    .createHash('sha256')
    .update(JSON.stringify(machineInfo))
    .digest('hex');
  
  // Take first 16 chars for UUID-like format
  const deviceId = [
    hash.substring(0, 8),
    hash.substring(8, 12),
    hash.substring(12, 16),
    hash.substring(16, 20),
    hash.substring(20, 32)
  ].join('-');
  
  return deviceId;
}

async function getDeviceId() {
  const metadata = await getSyncMetadata('device_id');
  if (metadata) {
    return metadata;
  }
  
  // First time, generate and save
  const deviceId = generateDeviceId();
  await setSyncMetadata('device_id', deviceId);
  return deviceId;
}
```

### Session Hash Generation

```javascript
function generateSessionHash(session) {
  const crypto = require('crypto');
  
  // Combine session data (exclude timestamps and device_id)
  const hashInput = {
    id: session.id,
    title: session.title,
    // Include message content for completeness
    messageCount: session.messages?.length || 0,
    lastMessageContent: session.messages?.slice(-1)[0]?.content || ''
  };
  
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(hashInput))
    .digest('hex');
}

// Update hash on every session modification
async function updateSessionHash(sessionId) {
  const session = await db.getSession(sessionId);
  const hash = generateSessionHash(session);
  await db.run('UPDATE sessions SET hash = ? WHERE id = ?', [hash, sessionId]);
}
```

### Timestamp Helpers

```javascript
function getCurrentTimestamp() {
  return Date.now(); // milliseconds since epoch
}

function formatTimestamp(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  
  return new Date(timestamp).toLocaleDateString();
}

// Auto-update timestamps on insert/update
db.on('insert', async (table, data) => {
  if (table === 'sessions' || table === 'messages') {
    data.created_at = data.created_at || getCurrentTimestamp();
    data.updated_at = getCurrentTimestamp();
    data.device_id = await getDeviceId();
  }
});

db.on('update', async (table, data) => {
  if (table === 'sessions' || table === 'messages') {
    data.updated_at = getCurrentTimestamp();
    data.device_id = await getDeviceId();
    
    if (table === 'sessions') {
      data.hash = generateSessionHash(data);
    }
  }
});
```

---

## 🧪 Testing Scenarios

### Scenario 1: Multi-Device New Sessions

**Setup:**
- PC1: Sessions A, B (backed up)
- PC2: Sync → download A, B

**Action:**
- PC2: Create sessions C, D
- PC2: Backup

**Expected:**
- Cloud: A, B, C, D
- PC1: Sync → download C, D
- PC1: Sessions A, B, C, D ✅

### Scenario 2: Delete Propagation

**Setup:**
- PC1: Sessions A, B, C (backed up)
- PC2: Sync → download A, B, C

**Action:**
- PC1: Delete session B
- PC1: Backup (mark B as deleted=1)

**Expected:**
- Cloud: A, C, B(deleted)
- PC2: Sync → mark B deleted
- PC2: Sessions A, C ✅

### Scenario 3: Edit Same Session (Conflict)

**Setup:**
- PC1: Session A (backed up)
- PC2: Sync → download A

**Action:**
- PC1 (offline): Edit A → "Hello" (10:00 AM)
- PC2: Edit A → "World" (10:05 AM)
- PC2: Backup
- PC1: Sync

**Expected:**
- Conflict detected (PC2 newer)
- Show conflict UI
- User chooses "Keep Cloud"
- PC1: Session A = "World" ✅

### Scenario 4: Message-Level Sync

**Setup:**
- PC1: Session A with messages 1, 2, 3 (backed up)
- PC2: Sync → download A with messages 1, 2, 3

**Action:**
- PC1: Add message 4
- PC2: Add message 5
- PC2: Backup
- PC1: Sync

**Expected:**
- PC1: Detect message 5 is new
- Add message 5 to session A
- PC1: Session A has messages 1, 2, 3, 4, 5 ✅
- PC1: Backup → upload message 4
- Cloud: Session A has messages 1, 2, 3, 4, 5 ✅

### Scenario 5: Fresh Install Sync

**Setup:**
- Cloud: 100 sessions with 1000 messages
- PC2: Fresh install, empty DB

**Action:**
- PC2: Login, sync

**Expected:**
- PC2: Download all 100 sessions
- PC2: Download all 1000 messages
- PC2: Database = Cloud ✅

---

## 📈 Performance Optimizations

### 1. Incremental Sync

**Problem:** Downloading entire database every time is slow

**Solution:**
```javascript
// Only download changes since last sync
async function downloadDeltaChanges(lastSyncTime) {
  const githubStorage = new GitHubStorageService(token, username);
  
  // Get metadata first to check if full sync needed
  const metadata = await githubStorage.getMetadata();
  
  if (metadata.lastBackupTime <= lastSyncTime) {
    return { sessions: [], messages: [], hasChanges: false };
  }
  
  // Download only changed sessions
  const changedSessions = await githubStorage.getChangedSessions(lastSyncTime);
  
  // Download only changed messages for those sessions
  const changedMessages = await githubStorage.getChangedMessages(lastSyncTime);
  
  return {
    sessions: changedSessions,
    messages: changedMessages,
    hasChanges: true
  };
}
```

### 2. Batch Operations

```javascript
// Instead of:
for (const session of sessions) {
  await db.insertSession(session);
}

// Use transaction:
await db.transaction(async () => {
  for (const session of sessions) {
    await db.insertSession(session);
  }
});
```

### 3. Progress UI

```javascript
function showSyncProgress(current, total, type) {
  const progressBar = document.getElementById('sync-progress');
  const progressText = document.getElementById('sync-text');
  
  const percent = Math.floor((current / total) * 100);
  progressBar.style.width = `${percent}%`;
  progressText.textContent = `Syncing ${type}: ${current} of ${total}`;
}

// Usage:
for (let i = 0; i < sessions.length; i++) {
  await db.insertSession(sessions[i]);
  showSyncProgress(i + 1, sessions.length, 'sessions');
}
```

### 4. Lazy Loading Messages

```javascript
// Don't load all messages upfront
// Load on-demand when session is opened

async function openSession(sessionId) {
  // Load session metadata first
  const session = await db.getSession(sessionId);
  
  // Load messages separately
  const messages = await db.getMessages(sessionId);
  
  return { ...session, messages };
}
```

---

## 🎯 Implementation Priority

**Phase 1: Database Schema** (1-2 days)
- ✅ Add tracking columns to sessions
- ✅ Create messages table
- ✅ Create sync_metadata table
- ✅ Migration script for existing data
- ✅ Device ID generation

**Phase 2: Timestamp Tracking** (1 day)
- ✅ Auto-set created_at on insert
- ✅ Auto-update updated_at on modify
- ✅ Track synced_at after sync/backup
- ✅ Hash generation for sessions

**Phase 3: Soft Delete** (1 day)
- ✅ Replace DELETE with UPDATE deleted=1
- ✅ Update queries to filter deleted=0
- ✅ Tombstone cleanup job

**Phase 4: Smart Sync** (2-3 days)
- ✅ Session-level comparison
- ✅ Message-level comparison
- ✅ Conflict detection
- ✅ Merge logic

**Phase 5: Smart Backup** (1-2 days)
- ✅ Delta change detection
- ✅ Apply changes to cloud DB
- ✅ Upload optimization

**Phase 6: Conflict UI** (2 days)
- ✅ Modal design
- ✅ Side-by-side comparison
- ✅ Resolution handlers
- ✅ Merge option

**Phase 7: Testing** (2-3 days)
- ✅ Multi-device scenarios
- ✅ Edge cases
- ✅ Performance testing

**Total: ~10-15 days**

---

## ✅ Success Criteria

1. ✅ Multi-device sync tanpa data loss
2. ✅ Conflict detection dan resolution yang jelas
3. ✅ Delta sync (tidak download seluruh DB setiap kali)
4. ✅ Message-level granularity
5. ✅ Soft delete dengan tombstone pattern
6. ✅ Device tracking untuk audit
7. ✅ Performance: sync 1000 sessions < 10 seconds
8. ✅ UX: Clear progress indicators
9. ✅ Error handling: Rollback on failure
10. ✅ Documentation: Architecture dan API docs

---

**End of Document**
