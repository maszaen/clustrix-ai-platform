# Phase 1 Testing Guide

**Quick reference for testing Phase 1 implementation**

---

## 1️⃣ Fresh Install Test

### Steps:
```bash
# Delete userData folder to simulate fresh install
rm -r ~/.config/clustrix-ai-platform  # Linux
rm -r ~/Library/Application\ Support/clustrix-ai-platform  # macOS
rm -r %APPDATA%/clustrix-ai-platform  # Windows

# Start app
npm run dev
```

### Expected Results:
- ✅ App starts without errors
- ✅ Log shows: "SyncManager initialized"
- ✅ Log shows: "DirectoryMigrator started"
- ✅ Log shows: "Directory reorganization completed"
- ✅ Folder structure created:
  ```
  userData/
  ├── database/
  │   ├── internal/
  │   │   ├── clustrix.db
  │   │   ├── ai-model.conf.json
  │   │   └── .migrated
  │   └── sync/
  ├── app.log
  └── sync-config.json
  ```
- ✅ Can create new session and save data

---

## 2️⃣ Upgrade Test (Old → New)

### Setup:
```bash
# Create old-style directory
mkdir -p userData
touch userData/clustrix.db
echo '{}' > userData/ai-model.conf.json

# Copy real database if available
cp backup.db userData/clustrix.db
```

### Steps:
1. Start app with old directory structure
2. Let migration run
3. Check results

### Expected Results:
- ✅ Log shows: "Migration already completed, skipping" OR "Directory reorganization completed"
- ✅ Files migrated to database/internal/
- ✅ Old files remain (backup)
- ✅ .migrated marker created
- ✅ All session data accessible
- ✅ Model config loaded correctly

---

## 3️⃣ Database Operations Test

### In DevTools Console:

```javascript
// Test sync:getConfig
await window.api.sync.getConfig()
// Expected: { currentMode: 'internal', currentCloudUser: null, ... }

// Test models:load
await window.api.models.load()
// Expected: { active: {...}, providers: {...} }

// Test models:save
await window.api.models.save({ active: {...} })
// Expected: true

// List cloud users (should be empty)
await window.api.sync.listCloudUsers()
// Expected: []
```

### Expected Results:
- ✅ All API calls return without error
- ✅ Config structure correct
- ✅ Models load/save work

---

## 4️⃣ Cloud Mode Test

### In DevTools Console:

```javascript
// Switch to cloud mode
await window.api.sync.switchMode({
  mode: 'cloud',
  cloudUser: 'test@gmail.com'
})
// Expected: { success: true, newMode: 'cloud', message: '...' }

// Check config updated
await window.api.sync.getConfig()
// Expected: { currentMode: 'cloud', currentCloudUser: 'test' ... }

// List cloud users
await window.api.sync.listCloudUsers()
// Expected: ['test@gmail.com']

// Check filesystem
// userData/database/sync/test@gmail.com/ should exist
```

### Expected Results:
- ✅ Mode switch succeeds
- ✅ Cloud folder created
- ✅ sync-config.json updated
- ✅ Cloud user listed

---

## 5️⃣ Logout Test

### In DevTools Console:

```javascript
// Logout
await window.api.sync.logout({ deleteCloudData: false })
// Expected: { success: true, message: '...' }

// Check config
await window.api.sync.getConfig()
// Expected: { currentMode: 'internal', currentCloudUser: null ... }

// List users (cloud folder should still exist)
await window.api.sync.listCloudUsers()
// Expected: ['test@gmail.com']

// Now logout with delete
await window.api.sync.logout({ deleteCloudData: true })

// List users again
await window.api.sync.listCloudUsers()
// Expected: []
```

### Expected Results:
- ✅ Logout succeeds
- ✅ Mode reset to internal
- ✅ Cloud folder deleted when requested
- ✅ Folder preserved when not requested

---

## 6️⃣ App Restart Test

### In DevTools Console:

```javascript
// Request restart
await window.api.app.restart()
// App should close and relaunch

// After restart, verify mode persisted
await window.api.sync.getConfig()
// Expected: mode matches what was set before restart
```

### Expected Results:
- ✅ App restarts cleanly
- ✅ Sync config persists
- ✅ Database state unchanged

---

## 7️⃣ Log File Inspection

### Location:
```
userData/app.log
```

### Look for:
```
[SYNC] Initialization:
├── "SyncManager initialized"
├── "ensureDirectories: Created directory: ..."
└── "loadSyncConfig: Sync config loaded"

[MIGRATION] Run:
├── "Directory reorganization migration started"
├── "Copied database to internal directory"
├── "Copied model config to internal directory"
└── "Migration marked as complete"

[DATABASE] Initialization:
├── "Database initialized { path: ...database/internal/clustrix.db }"
└── Success or error message
```

---

## 8️⃣ Filesystem Check

### Expected Structure After Fresh Install:
```
userData/
├── database/
│   ├── internal/
│   │   ├── clustrix.db (new, empty SQLite)
│   │   ├── ai-model.conf.json (new)
│   │   └── .migrated (marker file)
│   └── sync/ (empty, no users yet)
├── app.log (new)
└── sync-config.json (new)
```

### File Sizes:
- clustrix.db: ~100KB (empty SQLite with schema)
- ai-model.conf.json: ~2KB
- .migrated: ~80 bytes
- sync-config.json: ~200 bytes
- app.log: varies

---

## ⚠️ Common Issues & Fixes

### Issue: "SyncManager not initialized"
**Cause:** app.whenReady() hasn't completed  
**Fix:** Wait for app to fully load before testing

### Issue: "Cannot read getInternalDataPath"
**Cause:** Stale reference to syncManager  
**Fix:** Restart app and try again

### Issue: Old files not migrated
**Cause:** .migrated marker exists from previous run  
**Fix:** Delete database/internal/.migrated and restart

### Issue: Cloud folder not created
**Cause:** Invalid username format  
**Fix:** Ensure cloudUser is non-empty string (e.g., 'user@gmail.com')

### Issue: "ENOENT: no such file or directory"
**Cause:** database/ folder not created  
**Fix:** Manually create or delete sync-config.json and restart

---

## ✅ Passing Criteria

Phase 1 is **complete** when:

- [x] Fresh install creates correct folder structure
- [x] Old files migrate to database/internal/
- [x] sync-config.json created with defaults
- [x] All IPC handlers respond without error
- [x] Cloud user folders can be created/deleted
- [x] Mode switching works
- [x] Logout works
- [x] App restart works
- [x] No breaking changes to existing functionality
- [x] All data persists correctly

---

## 📋 Test Matrix

| Test | Fresh | Upgrade | Internal | Cloud | Logout | Restart |
|------|-------|---------|----------|-------|--------|---------|
| Folders created | ✅ | ✅ | - | ✅ | - | ✅ |
| Config file | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Database ops | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| API handlers | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Data persists | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## 📸 Testing Timeline

```
Fresh Install Test: 5 min
├── Start app
├── Check folders
├── Check logs
└── Verify no errors

Upgrade Test: 10 min
├── Create old structure
├── Copy real database
├── Start app
├── Wait for migration
└── Verify data

Database Test: 5 min
├── Create session
├── Save models
├── Load artifacts
└── Check persistence

Cloud Mode Test: 10 min
├── Switch to cloud
├── Create user folder
├── Switch back
├── Logout with delete
└── Verify cleanup

Total: ~30-40 minutes
```

---

**Ready to test! 🚀**

Report any issues with:
1. Error message
2. Steps to reproduce
3. Expected vs actual result
4. App logs
