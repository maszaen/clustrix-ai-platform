# 3-Phase Implementation Plan: Sync & Backup System Improvements

**Based on:** SYNC-BACKUP-DEEP-ANALYSIS.md
**Goal:** Eliminate data loss, improve reliability, enable production-grade sync
**Total Phases:** 3 (Complete)

---

## 📋 Phase Overview

| Phase | Focus | Priority | Complexity | Duration |
|-------|-------|----------|------------|----------|
| **Phase 1** | Data Integrity | 🔴 CRITICAL | Medium | 1 session |
| **Phase 2** | Conflict Resolution | 🟡 HIGH | Medium | 1 session |
| **Phase 3** | Robustness & Monitoring | 🟢 MEDIUM | High | 1 session |

---

# 🔴 PHASE 1: Critical Data Integrity Fixes

## Objective
Eliminate all data loss scenarios in current sync/backup system.

## Problems to Fix
1. **Race Condition** - Concurrent backups overwrite each other
2. **No Checksum Validation** - Silent corruption possible
3. **Sync Overwrites Local** - Local changes lost on sync

## Changes Required

### 1.1 Backup Lock Mechanism

**File:** `backend/smart-backup-service.js`

**Implementation:**
```javascript
// Add at top of class
const lockFilePath = path.join(app.getPath('userData'), 'backup.lock');

// New method
async acquireLock() {
  const lockTimeout = 30000; // 30 seconds
  const startTime = Date.now();
  
  while (fs.existsSync(lockFilePath)) {
    if (Date.now() - startTime > lockTimeout) {
      throw new Error('Backup lock timeout - another backup in progress');
    }
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s
  }
  
  fs.writeFileSync(lockFilePath, JSON.stringify({
    pid: process.pid,
    startedAt: Date.now(),
    deviceId: getDeviceId(db)
  }));
  
  log(1, 'acquireLock', 'Backup lock acquired');
}

// New method
releaseLock() {
  if (fs.existsSync(lockFilePath)) {
    fs.unlinkSync(lockFilePath);
    log(1, 'releaseLock', 'Backup lock released');
  }
}

// Modify performSmartBackup()
async performSmartBackup() {
  try {
    await this.acquireLock(); // 🆕 Acquire lock first
    
    // ... existing backup logic ...
    
  } finally {
    this.releaseLock(); // 🆕 Always release lock
  }
}
```

**Benefits:**
- ✅ Prevents concurrent backup race condition
- ✅ Timeout prevents deadlock if app crashes
- ✅ PID tracking for debugging

---

### 1.2 Checksum Validation

**File:** `backend/github-storage-service.js`

**Implementation:**
```javascript
const crypto = require('crypto');

// New method
calculateChecksum(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
  
  log(2, 'calculateChecksum', 'Checksum calculated', {
    file: path.basename(filePath),
    checksum: hash.substring(0, 16) + '...',
    size: fileBuffer.length
  });
  
  return hash;
}

// Modify uploadDatabase()
async uploadDatabase(dbPath) {
  const checksumBefore = this.calculateChecksum(dbPath); // 🆕 Calculate before upload
  
  // ... existing upload logic ...
  
  // 🆕 Store checksum in metadata
  const metadata = await this.getFileInfo('clustrix.db');
  metadata.checksum = checksumBefore;
  await this.uploadMetadata(metadata);
  
  log(1, 'uploadDatabase', 'Database uploaded with checksum', {
    checksum: checksumBefore.substring(0, 16) + '...'
  });
}

// Modify downloadDatabase()
async downloadDatabase(targetPath) {
  // ... existing download logic ...
  
  const checksumAfter = this.calculateChecksum(targetPath); // 🆕 Calculate after download
  
  // 🆕 Verify against stored checksum
  const metadata = await this.getFileInfo('clustrix.db');
  if (metadata.checksum && metadata.checksum !== checksumAfter) {
    fs.unlinkSync(targetPath); // Delete corrupted file
    throw new Error('Checksum mismatch - download corrupted');
  }
  
  log(1, 'downloadDatabase', 'Database downloaded and verified', {
    checksum: checksumAfter.substring(0, 16) + '...'
  });
}
```

**Benefits:**
- ✅ Detects corruption during upload/download
- ✅ Prevents silent data corruption
- ✅ Automatic cleanup of corrupted files

---

### 1.3 Delta Merge on Sync (Don't Overwrite Local)

**File:** `main.js` (sync:syncNow handler)

**Current Problem:**
```javascript
// ❌ Current: Full replacement
await githubStorage.downloadDatabase(tempDbPath);
replaceFileWithDownloadedTemp(tempDbPath, dbPath);
```

**Implementation:**
```javascript
// 🆕 New approach: Delta merge
ipcMain.handle('sync:syncNow', async () => {
  try {
    log('sync:syncNow', 1, 'handleSync', 'Sync triggered manually');

    const syncConfig = syncManager.loadSyncConfig();

    if (!syncConfig.currentCloudUser || !syncConfig.cloudToken) {
      return { success: false, error: 'User not logged in.' };
    }

    const cloudDataPath = syncManager.getCloudDataPath(syncConfig.currentCloudUser);
    const dbPath = path.join(cloudDataPath, 'clustrix.db');
    const configPath = path.join(cloudDataPath, 'ai-model.conf.json');

    // Create backup of current local DB
    const dbBackupPath = createTimestampedBackup(dbPath, 'sync-now');

    // Download cloud DB to temp location
    const tempCloudPath = `${dbPath}.cloud-${Date.now()}`;
    const githubStorage = new GitHubStorageService(syncConfig.cloudToken, syncConfig.currentCloudUsername);

    try {
      await githubStorage.downloadDatabase(tempCloudPath);

      // 🆕 Use Smart Backup Service to merge cloud changes into local
      const Database = require('better-sqlite3');
      const localDb = new Database(dbPath);
      const cloudDb = new Database(tempCloudPath);

      // Get cloud changes (records newer than local)
      const cloudChanges = {
        sessions: cloudDb.prepare(`
          SELECT * FROM sessions 
          WHERE updated_at > (SELECT COALESCE(MAX(updated_at), 0) FROM sessions)
        `).all(),
        messages: cloudDb.prepare(`
          SELECT * FROM messages 
          WHERE updated_at > (SELECT COALESCE(MAX(updated_at), 0) FROM messages)
        `).all(),
        deletedSessions: cloudDb.prepare('SELECT * FROM sessions WHERE deleted = 1').all(),
        deletedMessages: cloudDb.prepare('SELECT * FROM messages WHERE deleted = 1').all()
      };

      cloudDb.close();

      // Apply cloud changes to local DB
      localDb.prepare('BEGIN TRANSACTION').run();

      try {
        // Apply session changes
        for (const session of cloudChanges.sessions) {
          const existing = localDb.prepare('SELECT updated_at FROM sessions WHERE id = ?').get(session.id);

          if (!existing) {
            // New session from cloud
            localDb.prepare(`
              INSERT INTO sessions (id, name, created_at, updated_at, type, persona_name, 
                persona_profile, tokens_used, metadata, device_id, synced_at, deleted, hash)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              session.id, session.name, session.created_at, session.updated_at, session.type,
              session.persona_name, session.persona_profile, session.tokens_used, session.metadata,
              session.device_id, session.synced_at, session.deleted, session.hash
            );
          } else if (session.updated_at > existing.updated_at) {
            // Cloud version is newer
            localDb.prepare(`
              UPDATE sessions SET name = ?, updated_at = ?, type = ?, persona_name = ?,
                persona_profile = ?, tokens_used = ?, metadata = ?, device_id = ?, 
                synced_at = ?, deleted = ?, hash = ?
              WHERE id = ?
            `).run(
              session.name, session.updated_at, session.type, session.persona_name,
              session.persona_profile, session.tokens_used, session.metadata, session.device_id,
              session.synced_at, session.deleted, session.hash, session.id
            );
          }
          // Else: Local version is newer, keep it
        }

        // Apply message changes (similar logic)
        for (const message of cloudChanges.messages) {
          const existing = localDb.prepare('SELECT updated_at FROM messages WHERE id = ?').get(message.id);

          if (!existing) {
            localDb.prepare(`
              INSERT INTO messages (id, session_id, role, content, message_index, created_at,
                model_id, model_label, provider, base_url, think_mode, think_content,
                thinking_update, web_search_enabled, web_search_data, files, metadata,
                deleted, device_id, synced_at, sequence, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              message.id, message.session_id, message.role, message.content, message.message_index,
              message.created_at, message.model_id, message.model_label, message.provider,
              message.base_url, message.think_mode, message.think_content, message.thinking_update,
              message.web_search_enabled, message.web_search_data, message.files, message.metadata,
              message.deleted, message.device_id, message.synced_at, message.sequence, message.updated_at
            );
          } else if (message.updated_at > existing.updated_at) {
            localDb.prepare(`
              UPDATE messages SET content = ?, updated_at = ?, device_id = ?, sequence = ?
              WHERE id = ?
            `).run(message.content, message.updated_at, message.device_id, message.sequence, message.id);
          }
        }

        // Propagate deletions from cloud
        for (const session of cloudChanges.deletedSessions) {
          localDb.prepare('UPDATE sessions SET deleted = 1, updated_at = ? WHERE id = ?')
            .run(session.updated_at, session.id);
        }

        for (const message of cloudChanges.deletedMessages) {
          localDb.prepare('UPDATE messages SET deleted = 1, updated_at = ? WHERE id = ?')
            .run(message.updated_at, message.id);
        }

        localDb.prepare('COMMIT').run();
        log('sync:syncNow', 1, 'handleSync', 'Cloud changes merged into local DB', {
          sessions: cloudChanges.sessions.length,
          messages: cloudChanges.messages.length,
          deletedSessions: cloudChanges.deletedSessions.length,
          deletedMessages: cloudChanges.deletedMessages.length
        });
      } catch (err) {
        localDb.prepare('ROLLBACK').run();
        throw err;
      } finally {
        localDb.close();
      }

      // Cleanup temp cloud file
      fs.unlinkSync(tempCloudPath);

      // Sync model config (existing logic)
      try {
        const tempConfigPath = `${configPath}.download-${Date.now()}`;
        await githubStorage.downloadModelConfig(tempConfigPath);
        replaceFileWithDownloadedTemp(tempConfigPath, configPath);
        log('sync:syncNow', 1, 'handleSync', 'Model config synced from GitHub');
      } catch (configErr) {
        log('sync:syncNow', 2, 'handleSync', 'Model config download failed', { error: configErr.message });
      }

      return {
        success: true,
        message: 'Synced with GitHub (merged cloud changes)',
        repository: githubStorage.repoName,
        timestamp: new Date().toISOString()
      };

    } catch (err) {
      log('sync:syncNow', 2, 'handleSync', 'GitHub sync failed', { error: err.message });

      // Restore from backup
      if (dbBackupPath && fs.existsSync(dbBackupPath)) {
        fs.copyFileSync(dbBackupPath, dbPath);
        log('sync:syncNow', 2, 'handleSync', 'Restored from backup after error');
      }

      throw err;
    }
  } catch (e) {
    log('sync:syncNow error', e);
    return { success: false, error: e.message || 'Sync failed' };
  }
});
```

**Benefits:**
- ✅ Preserves local changes that haven't been backed up yet
- ✅ Merges cloud changes instead of replacing
- ✅ Propagates deletions from cloud to local
- ✅ Timestamp-based conflict resolution (newer wins)

---

### 1.4 Improved Error Handling & Cleanup

**File:** `backend/smart-backup-service.js`

**Implementation:**
```javascript
// Modify applyDeltaToCloud()
applyDeltaToCloud(cloudDbPath, changes) {
  const db = new Database(cloudDbPath);
  const tempFiles = []; // 🆕 Track temp files for cleanup

  try {
    db.prepare('BEGIN TRANSACTION').run();

    // ... existing delta application logic ...

    db.prepare('COMMIT').run();
    log(2, 'applyDeltaToCloud', 'Delta applied successfully');

  } catch (error) {
    // 🆕 Enhanced rollback error handling
    try {
      db.prepare('ROLLBACK').run();
      log(2, 'applyDeltaToCloud', 'Transaction rolled back');
    } catch (rollbackErr) {
      log(4, 'applyDeltaToCloud', 'Rollback failed!', {
        originalError: error.message,
        rollbackError: rollbackErr.message
      });
    }

    // 🆕 Cleanup temp files
    tempFiles.forEach(file => {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
        log(2, 'applyDeltaToCloud', 'Cleaned up temp file', { file });
      }
    });

    throw error;

  } finally {
    try {
      db.close();
    } catch (closeErr) {
      log(3, 'applyDeltaToCloud', 'Failed to close database', {
        error: closeErr.message
      });
    }
  }
}
```

**Benefits:**
- ✅ Guaranteed temp file cleanup
- ✅ Handles rollback failure gracefully
- ✅ Safe database closure

---

## Phase 1 Implementation Checklist

- [ ] **1.1 Backup Lock Mechanism**
  - [ ] Add `acquireLock()` method
  - [ ] Add `releaseLock()` method
  - [ ] Wrap `performSmartBackup()` with lock
  - [ ] Add lock timeout (30s)
  - [ ] Test concurrent backup prevention

- [ ] **1.2 Checksum Validation**
  - [ ] Add `calculateChecksum()` method
  - [ ] Modify `uploadDatabase()` to store checksum
  - [ ] Modify `downloadDatabase()` to verify checksum
  - [ ] Add metadata storage for checksums
  - [ ] Test corruption detection

- [ ] **1.3 Delta Merge on Sync**
  - [ ] Rewrite `sync:syncNow` handler
  - [ ] Implement timestamp-based merge logic
  - [ ] Add deletion propagation
  - [ ] Test local changes preservation
  - [ ] Test bidirectional sync

- [ ] **1.4 Error Handling**
  - [ ] Add temp file tracking
  - [ ] Enhance rollback error handling
  - [ ] Safe database closure
  - [ ] Test error recovery scenarios

## Testing Plan

### Test 1: Concurrent Backup Prevention
```
1. Device A: Start backup (hold network for 10s)
2. Device B: Try backup immediately
Expected: Device B gets "Backup in progress" error
```

### Test 2: Corruption Detection
```
1. Backup database
2. Manually corrupt GitHub file (flip some bytes)
3. Sync Now
Expected: Checksum mismatch error, file not applied
```

### Test 3: Local Changes Preservation
```
1. Device A: Add message to session X
2. Don't backup yet
3. Device B: Add different message to session X, backup
4. Device A: Sync Now
Expected: Both messages exist (no data loss)
```

---

# 🟢 PHASE 2: Conflict Resolution & UX

## Objective
Enable graceful handling of multi-device edit conflicts.

## Changes Required

### 2.1 Integrate ConflictResolver

**File:** `backend/smart-backup-service.js`

**Add:**
```javascript
const ConflictResolver = require('./conflict-resolver');

async performSmartBackup() {
  // ... existing logic ...

  // 🆕 Detect conflicts
  const resolver = new ConflictResolver();
  const sessionConflicts = resolver.detectConflicts(
    changes.sessions,
    cloudChanges.sessions,
    'session'
  );
  const messageConflicts = resolver.detectConflicts(
    changes.messages,
    cloudChanges.messages,
    'message'
  );

  // 🆕 If conflicts found, prompt user
  if (sessionConflicts.length > 0 || messageConflicts.length > 0) {
    resolver.queueConflicts([...sessionConflicts, ...messageConflicts]);

    // Send to renderer for UI resolution
    mainWindow.webContents.send('sync:conflictsDetected', {
      total: sessionConflicts.length + messageConflicts.length
    });

    // Wait for user resolution (via IPC)
    const resolutions = await new Promise(resolve => {
      ipcMain.once('sync:conflictsResolved', (evt, data) => {
        resolve(data.resolutions);
      });
    });

    // Apply resolutions
    for (let i = 0; i < resolver.pendingConflicts.length; i++) {
      const conflict = resolver.pendingConflicts[i];
      const resolution = resolutions[i]; // 'local', 'cloud', or 'merge'

      const result = resolver.resolveConflict(resolution, conflict);

      // Apply resolved record
      if (result.action === 'keep_local') {
        // Keep local version (already in changes)
      } else if (result.action === 'keep_cloud') {
        // Replace local with cloud version
        changes.sessions = changes.sessions.filter(s => s.id !== conflict.id);
        changes.sessions.push(conflict.cloud);
      } else if (result.action === 'merge') {
        // Merge logic (append messages from both)
        // ... implementation depends on record type ...
      }
    }
  }

  // ... continue with backup ...
}
```

### 2.2 Renderer-Side Conflict Modal

**File:** `renderer/renderer.js`

**Add:**
```javascript
// Listen for conflict detection
window.api.onSyncConflictsDetected(({ total }) => {
  log('Sync conflicts detected:', total);
  showConflictResolutionModal(total);
});

async function showConflictResolutionModal(totalConflicts) {
  const modal = document.getElementById('sync-conflict-modal');
  modal.classList.remove('hidden');

  // Fetch conflicts from backend
  const conflicts = await window.api.getSyncConflicts();

  const resolutions = [];

  for (const conflict of conflicts) {
    const resolution = await promptUserForResolution(conflict);
    resolutions.push(resolution);
  }

  // Send resolutions back to backend
  await window.api.resolveSyncConflicts(resolutions);

  modal.classList.add('hidden');
}

function promptUserForResolution(conflict) {
  return new Promise(resolve => {
    // Populate modal with conflict details
    document.getElementById('conflict-session-name').textContent = conflict.local.name;
    // ... (UI already exists in conflict-resolver.js) ...

    document.getElementById('conflict-keep-local').onclick = () => resolve('local');
    document.getElementById('conflict-keep-cloud').onclick = () => resolve('cloud');
    document.getElementById('conflict-merge-both').onclick = () => resolve('merge');
  });
}
```

### 2.3 IPC Handlers for Conflict Resolution

**File:** `main.js`

**Add:**
```javascript
ipcMain.handle('sync:getSyncConflicts', () => {
  // Return pending conflicts from ConflictResolver
  return conflictResolver.pendingConflicts;
});

ipcMain.handle('sync:resolveSyncConflicts', (evt, resolutions) => {
  // Apply user's resolution choices
  return { success: true };
});
```

---

## Phase 2 Checklist

- [ ] Integrate ConflictResolver into backup flow
- [ ] Add IPC handlers for conflict detection
- [ ] Implement renderer-side conflict modal
- [ ] Test conflict resolution UI
- [ ] Add conflict statistics to action history

---

# 🟣 PHASE 3: Robustness & Monitoring

## Objective
Production-grade reliability and observability.

## Changes Required

### 3.1 Retry Logic with Exponential Backoff

**File:** `backend/github-storage-service.js`

**Add:**
```javascript
async retryWithBackoff(operation, maxRetries = 3) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
        log(2, 'retryWithBackoff', `Attempt ${attempt} failed, retrying in ${delay}ms`, {
          error: error.message
        });
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

// Wrap all GitHub API calls
async uploadDatabase(dbPath) {
  return this.retryWithBackoff(async () => {
    // ... existing upload logic ...
  });
}
```

### 3.2 Post-Upload Verification

**File:** `backend/smart-backup-service.js`

**Add:**
```javascript
async verifyBackup() {
  const tempVerifyPath = `${this.dbPath}.verify-${Date.now()}`;

  try {
    // Download what we just uploaded
    await this.githubStorage.downloadDatabase(tempVerifyPath);

    // Compare checksums
    const originalChecksum = calculateChecksum(this.dbPath);
    const downloadedChecksum = calculateChecksum(tempVerifyPath);

    if (originalChecksum !== downloadedChecksum) {
      throw new Error('Backup verification failed: checksum mismatch');
    }

    log(1, 'verifyBackup', 'Backup verified successfully');
    return true;

  } finally {
    if (fs.existsSync(tempVerifyPath)) {
      fs.unlinkSync(tempVerifyPath);
    }
  }
}

// Call after upload
async performSmartBackup() {
  // ... existing backup logic ...

  await this.uploadCloudDatabase(cloudDbPath);

  // 🆕 Verify backup
  await this.verifyBackup();

  // ... mark as synced ...
}
```

### 3.3 Sync Health Dashboard

**File:** `renderer/index.html` (Settings Modal)

**Add:**
```html
<div class="sync-health-section">
  <h3>Sync Health</h3>
  <div class="health-metric">
    <span>Last Successful Backup:</span>
    <span id="last-backup-time">Never</span>
  </div>
  <div class="health-metric">
    <span>Last Successful Sync:</span>
    <span id="last-sync-time">Never</span>
  </div>
  <div class="health-metric">
    <span>Pending Changes:</span>
    <span id="pending-changes-count">0</span>
  </div>
  <div class="health-metric">
    <span>Conflicts Resolved:</span>
    <span id="conflicts-resolved-count">0</span>
  </div>
  <button id="test-sync-integrity">Test Sync Integrity</button>
</div>
```

**File:** `renderer/renderer.js`

**Add:**
```javascript
async function loadSyncHealthMetrics() {
  const health = await window.api.getSyncHealth();

  document.getElementById('last-backup-time').textContent = 
    health.lastBackup ? new Date(health.lastBackup).toLocaleString() : 'Never';

  document.getElementById('last-sync-time').textContent = 
    health.lastSync ? new Date(health.lastSync).toLocaleString() : 'Never';

  document.getElementById('pending-changes-count').textContent = 
    health.pendingChanges || 0;

  document.getElementById('conflicts-resolved-count').textContent = 
    health.conflictsResolved || 0;
}
```

---

## Phase 3 Checklist

- [ ] Implement retry logic with exponential backoff
- [ ] Add post-upload backup verification
- [ ] Create sync health dashboard UI
- [ ] Add integrity test button
- [ ] Monitor sync performance metrics

---

## Deployment Strategy

### Phase 1 (Immediate)
- ✅ Can be deployed immediately (critical fixes)
- ⚠️ Requires testing before release
- 🔄 Backward compatible (no schema changes)

### Phase 2 (Next Release)
- Requires UI updates (conflict modal)
- User training for conflict resolution
- Optional: Can be feature-flagged

### Phase 3 (Future Release)
- Non-critical improvements
- Can be rolled out gradually
- Monitoring infrastructure needed

---

## Success Metrics

### Phase 1
- ✅ Zero concurrent backup race conditions
- ✅ Zero checksum mismatches reported
- ✅ Zero data loss from sync operations

### Phase 2
- ✅ 100% of conflicts resolved by user
- ✅ Average conflict resolution time < 30s

### Phase 3
- ✅ Backup success rate > 99%
- ✅ Average sync time < 5s
- ✅ Zero failed verifications

---

**Document Status:** ✅ COMPLETE (All 3 phases documented)
**Next Action:** Execute Phase 1 implementation
**User Approval Required:** Yes (before modifying production code)
