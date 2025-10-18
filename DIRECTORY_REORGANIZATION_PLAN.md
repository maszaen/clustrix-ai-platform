# Directory Reorganization Plan

**Created:** October 19, 2025
**Purpose:** Clean & organize userData directory structure

---

## Current Structure (BEFORE)

```
userData/
├── clustrix.db
├── chat_data.json (legacy)
├── artifacts.json (legacy)
├── projects.json (legacy)
├── ai-model.conf.json
├── app.log
└── (legacy folder structure)
```

---

## Target Structure (AFTER)

```
userData/
├── database/
│   ├── internal/
│   │   ├── clustrix.db                    ← Internal SQLite database
│   │   └── ai-model.conf.json            ← Internal model config
│   │
│   └── sync/
│       ├── user1@gmail.com/
│       │   ├── clustrix.db                ← Cloud database per-account
│       │   └── ai-model.conf.json        ← Cloud model config per-account
│       │
│       └── user2@gmail.com/
│           ├── clustrix.db
│           └── ai-model.conf.json
│
├── app.log                                ← Logs (not synced)
└── sync-config.json                       ← System config (not synced)
```

**Key Points:**
- ✅ All sync-able data (database + model config) di dalam `database/` folder
- ✅ Per-account isolation: setiap user punya sendiri database + config
- ✅ System files (app.log, sync-config.json) tetap di root
- ✅ Root userData lebih rapi!

---

## Implementation Plan

### Phase 1: Create Directory Structure

#### 1.1 Create Path Constants (main.js)

```javascript
// Tambah di atas ipcMain handlers

const userDataRoot = app.getPath('userData');
const databaseRoot = path.join(userDataRoot, 'database');
const internalDbDir = path.join(databaseRoot, 'internal');
const syncDbRoot = path.join(databaseRoot, 'sync');

// Ensure directories exist on startup
function ensureDirectories() {
  const dirs = [databaseRoot, internalDbDir, syncDbRoot];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      log('INIT', 1, 'ensureDirectories', `Created directory: ${dir}`);
    }
  }
}

app.whenReady().then(async () => {
  ensureDirectories();
  
  // ... rest of initialization
});
```

#### 1.2 Update DatabaseManager Constructor

**File: backend/database-manager.js**

```javascript
class DatabaseManager {
  constructor(app, sourcePath = null) {
    const userDataPath = app.getPath('userData');
    
    // Determine database path
    let dbPath;
    if (sourcePath) {
      // Cloud mode: /database/sync/<username>/
      dbPath = path.join(sourcePath, 'clustrix.db');
    } else {
      // Internal mode: /database/internal/
      dbPath = path.join(userDataPath, 'database', 'internal', 'clustrix.db');
    }
    
    this.db = new Database(dbPath);
    this.initSchema();
    
    log('DATABASE', 1, 'constructor', 'Database initialized', { path: dbPath });
  }
  
  // ... existing methods unchanged
}
```

#### 1.3 Create SyncManager with Path Awareness

**File: backend/sync-manager.js**

```javascript
const path = require('path');
const fs = require('fs');
const { log } = require('../utils/logger');

class SyncManager {
  constructor(app) {
    this.app = app;
    this.userDataRoot = app.getPath('userData');
    this.databaseRoot = path.join(this.userDataRoot, 'database');
    this.internalDbDir = path.join(this.databaseRoot, 'internal');
    this.syncDbRoot = path.join(this.databaseRoot, 'sync');
    this.syncConfigPath = path.join(this.userDataRoot, 'sync-config.json');
  }

  // Ensure all directories exist
  ensureDirectories() {
    const dirs = [
      this.databaseRoot,
      this.internalDbDir,
      this.syncDbRoot
    ];
    
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        log('SYNC', 1, 'ensureDirectories', `Created directory: ${dir}`);
      }
    }
  }

  // Get path to internal database directory
  getInternalDataPath() {
    return this.internalDbDir;
    // Returns: /userData/database/internal/
  }

  // Get path to cloud database directory for a user
  getCloudDataPath(username) {
    const cloudPath = path.join(this.syncDbRoot, username);
    return cloudPath;
    // Returns: /userData/database/sync/<username>/
  }

  // Create cloud user folder structure
  createCloudUserFolder(username) {
    try {
      const cloudPath = this.getCloudDataPath(username);
      if (!fs.existsSync(cloudPath)) {
        fs.mkdirSync(cloudPath, { recursive: true });
        log('SYNC', 1, 'createCloudUserFolder', `Created cloud folder: ${cloudPath}`);
      }
      return cloudPath;
    } catch (e) {
      log('SYNC', 4, 'createCloudUserFolder', 'Failed to create cloud folder', { error: e.message });
      throw e;
    }
  }

  // Delete cloud user folder (on account switch or logout)
  deleteCloudUserFolder(username) {
    try {
      const cloudPath = this.getCloudDataPath(username);
      if (fs.existsSync(cloudPath)) {
        const files = fs.readdirSync(cloudPath);
        for (const file of files) {
          const filePath = path.join(cloudPath, file);
          if (fs.lstatSync(filePath).isDirectory()) {
            // Recursive delete
            fs.rmSync(filePath, { recursive: true });
          } else {
            fs.unlinkSync(filePath);
          }
        }
        fs.rmdirSync(cloudPath);
        log('SYNC', 1, 'deleteCloudUserFolder', `Deleted cloud folder: ${cloudPath}`);
      }
    } catch (e) {
      log('SYNC', 4, 'deleteCloudUserFolder', 'Failed to delete cloud folder', { error: e.message });
    }
  }

  // Load sync configuration
  loadSyncConfig() {
    try {
      if (!fs.existsSync(this.syncConfigPath)) {
        return this.getDefaultSyncConfig();
      }
      
      const raw = fs.readFileSync(this.syncConfigPath, 'utf-8');
      const config = JSON.parse(raw);
      return config && typeof config === 'object' ? config : this.getDefaultSyncConfig();
    } catch (e) {
      log('SYNC', 4, 'loadSyncConfig', 'Failed to load sync-config.json', { error: e.message });
      return this.getDefaultSyncConfig();
    }
  }

  // Save sync configuration
  saveSyncConfig(config) {
    try {
      fs.writeFileSync(this.syncConfigPath, JSON.stringify(config, null, 2), 'utf-8');
      log('SYNC', 1, 'saveSyncConfig', 'Sync config saved', { 
        mode: config.currentMode,
        user: config.currentCloudUser 
      });
      return true;
    } catch (e) {
      log('SYNC', 4, 'saveSyncConfig', 'Failed to save sync-config.json', { error: e.message });
      return false;
    }
  }

  // Get default sync configuration
  getDefaultSyncConfig() {
    return {
      currentMode: 'internal',           // 'internal' | 'cloud'
      currentCloudUser: null,            // 'user@gmail.com' | null
      cloudToken: null,                  // encrypted access token
      cloudTokenExpiry: null,            // timestamp
      lastSyncTime: null,                // timestamp
      createdAt: Date.now()
    };
  }

  // Check if token is still valid
  isTokenValid(config) {
    if (!config.cloudToken || !config.cloudTokenExpiry) {
      return false;
    }
    return config.cloudTokenExpiry > Date.now();
  }
}

module.exports = SyncManager;
```

---

### Phase 2: Update main.js Initialization

#### 2.1 Update Database Path References

**Before:**
```javascript
const dbPath = path.join(app.getPath('userData'), 'clustrix.db');
```

**After:**
```javascript
const userDataRoot = app.getPath('userData');
const databaseRoot = path.join(userDataRoot, 'database');
const internalDbDir = path.join(databaseRoot, 'internal');

// In app.whenReady():
syncManager = new SyncManager(app);
syncManager.ensureDirectories();

const syncConfig = syncManager.loadSyncConfig();

let dbSourcePath;
if (syncConfig.currentMode === 'cloud' && syncConfig.currentCloudUser) {
  const cloudPath = syncManager.getCloudDataPath(syncConfig.currentCloudUser);
  dbSourcePath = cloudPath;
} else {
  dbSourcePath = internalDbDir;
}

db = new DatabaseManager(app, dbSourcePath === internalDbDir ? null : dbSourcePath);
```

#### 2.2 Update Model Config Path References

**Before:**
```javascript
const modelsConfFile = path.join(app.getPath('userData'), 'ai-model.conf.json');
```

**After:**
```javascript
// In SyncManager:
getModelConfigPath(sourceDir) {
  return path.join(sourceDir, 'ai-model.conf.json');
}

// In main.js:
ipcMain.handle('models:load', async () => {
  try {
    const syncConfig = syncManager.loadSyncConfig();
    
    let configPath;
    if (syncConfig.currentMode === 'cloud' && syncConfig.currentCloudUser) {
      const cloudPath = syncManager.getCloudDataPath(syncConfig.currentCloudUser);
      configPath = path.join(cloudPath, 'ai-model.conf.json');
    } else {
      configPath = path.join(syncManager.internalDbDir, 'ai-model.conf.json');
    }
    
    if (!fs.existsSync(configPath)) {
      return defaultModelsConf();
    }
    
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : defaultModelsConf();
  } catch (e) {
    log('models:load error', e);
    return defaultModelsConf();
  }
});

ipcMain.handle('models:save', async (_evt, conf) => {
  try {
    const syncConfig = syncManager.loadSyncConfig();
    
    let configPath;
    if (syncConfig.currentMode === 'cloud' && syncConfig.currentCloudUser) {
      const cloudPath = syncManager.getCloudDataPath(syncConfig.currentCloudUser);
      configPath = path.join(cloudPath, 'ai-model.conf.json');
    } else {
      configPath = path.join(syncManager.internalDbDir, 'ai-model.conf.json');
    }
    
    fs.writeFileSync(configPath, JSON.stringify(conf, null, 2), 'utf-8');
    return true;
  } catch (e) {
    log('models:save error', e);
    return false;
  }
});
```

#### 2.3 Update Log File Path (Optional)

**Current:** `userData/app.log` (tetap di root, ini OK)

```javascript
setLogFile(path.join(app.getPath('userData'), 'app.log'));
// Tetap sama - logs tidak disync
```

---

### Phase 3: Migration from Old Structure to New

#### 3.1 Create Migration Utility (backend/directory-migrator.js)

```javascript
const fs = require('fs');
const path = require('path');
const { log } = require('../utils/logger');

class DirectoryMigrator {
  constructor(app, syncManager) {
    this.app = app;
    this.syncManager = syncManager;
    this.userDataRoot = app.getPath('userData');
  }

  // Run migration on app startup
  async runMigration() {
    try {
      log('MIGRATION', 1, 'runMigration', 'Starting directory reorganization migration');

      // Ensure new directory structure exists
      this.syncManager.ensureDirectories();

      // Check if migration needed (old files exist at root)
      const oldDbPath = path.join(this.userDataRoot, 'clustrix.db');
      const oldConfigPath = path.join(this.userDataRoot, 'ai-model.conf.json');

      let migrationNeeded = false;

      // Move database to internal folder
      if (fs.existsSync(oldDbPath)) {
        const newDbPath = path.join(this.syncManager.internalDbDir, 'clustrix.db');
        if (!fs.existsSync(newDbPath)) {
          fs.copyFileSync(oldDbPath, newDbPath);
          log('MIGRATION', 1, 'runMigration', 'Moved database to internal directory');
          migrationNeeded = true;
        }
      }

      // Move model config to internal folder
      if (fs.existsSync(oldConfigPath)) {
        const newConfigPath = path.join(this.syncManager.internalDbDir, 'ai-model.conf.json');
        if (!fs.existsSync(newConfigPath)) {
          fs.copyFileSync(oldConfigPath, newConfigPath);
          log('MIGRATION', 1, 'runMigration', 'Moved model config to internal directory');
          migrationNeeded = true;
        }
      }

      if (migrationNeeded) {
        log('MIGRATION', 1, 'runMigration', 'Directory reorganization completed');
        
        // Optional: Mark that migration was done (can check for cleanup)
        const migrationMarkPath = path.join(this.syncManager.internalDbDir, '.migrated');
        fs.writeFileSync(migrationMarkPath, JSON.stringify({
          timestamp: Date.now(),
          version: '1.0'
        }));
      } else {
        log('MIGRATION', 2, 'runMigration', 'No migration needed - directory already organized');
      }

      return true;
    } catch (e) {
      log('MIGRATION', 4, 'runMigration', 'Migration failed', { error: e.message });
      throw e;
    }
  }

  // Optional: Cleanup old files after migration (separate call)
  cleanupOldFiles() {
    try {
      const filesToClean = [
        path.join(this.userDataRoot, 'clustrix.db'),
        path.join(this.userDataRoot, 'ai-model.conf.json'),
        path.join(this.userDataRoot, 'chat_data.json'), // legacy JSON
        path.join(this.userDataRoot, 'artifacts.json'), // legacy JSON
        path.join(this.userDataRoot, 'projects.json')   // legacy JSON
      ];

      for (const file of filesToClean) {
        if (fs.existsSync(file)) {
          // Backup first before deleting
          const backupPath = file + '.bak';
          fs.copyFileSync(file, backupPath);
          fs.unlinkSync(file);
          log('MIGRATION', 1, 'cleanupOldFiles', `Cleaned up: ${file} (backed up to ${backupPath})`);
        }
      }

      return true;
    } catch (e) {
      log('MIGRATION', 4, 'cleanupOldFiles', 'Cleanup failed', { error: e.message });
      return false;
    }
  }
}

module.exports = DirectoryMigrator;
```

#### 3.2 Call Migration on Startup (main.js)

```javascript
const DirectoryMigrator = require('./backend/directory-migrator');

app.whenReady().then(async () => {
  // Initialize managers
  syncManager = new SyncManager(app);
  
  // Run directory migration
  const migrator = new DirectoryMigrator(app, syncManager);
  await migrator.runMigration();
  
  // After migration, initialize database normally
  // ... rest of existing code
});
```

---

### Phase 4: Update All Path References

#### 4.1 Files to Update in main.js

Search & replace all `app.getPath('userData')` references with appropriate new paths:

```javascript
// OLD: const dbPath = path.join(app.getPath('userData'), 'clustrix.db');
// NEW: const dbPath = path.join(app.getPath('userData'), 'database', 'internal', 'clustrix.db');

// OLD: const modelsConfFile = path.join(app.getPath('userData'), 'ai-model.conf.json');
// NEW: Use syncManager.getModelConfigPath() instead

// OLD: const dataFile = path.join(app.getPath('userData'), 'chat_data.json');
// NEW: Keep for legacy migration only, or remove if already migrated
```

#### 4.2 Path Constants to Add

```javascript
// At top of main.js after requires
const userDataRoot = app.getPath('userData');
const databaseRoot = path.join(userDataRoot, 'database');
const internalDbDir = path.join(databaseRoot, 'internal');
const syncDbRoot = path.join(databaseRoot, 'sync');
const syncConfigPath = path.join(userDataRoot, 'sync-config.json');
const appLogPath = path.join(userDataRoot, 'app.log');
```

---

## Implementation Checklist

### Phase 1: Directory Setup
- [ ] Create SyncManager class (backend/sync-manager.js)
- [ ] Update DatabaseManager constructor
- [ ] Add path constants to main.js

### Phase 2: Initialize Structure
- [ ] Update app.whenReady() to call syncManager.ensureDirectories()
- [ ] Update models:load to use syncManager paths
- [ ] Update models:save to use syncManager paths

### Phase 3: Migration
- [ ] Create DirectoryMigrator class (backend/directory-migrator.js)
- [ ] Call migrator.runMigration() on app startup
- [ ] Test migration on fresh app start

### Phase 4: Cleanup
- [ ] Remove old path references from main.js
- [ ] Update all IPC handlers for new paths
- [ ] Remove legacy code (JSON file handling if fully migrated)

### Phase 5: Testing
- [ ] Test fresh install (new userData directory)
- [ ] Test upgrade (migration from old structure)
- [ ] Test database operations (sessions, artifacts, projects)
- [ ] Test model config load/save
- [ ] Test cloud mode (create /database/sync/<user>/)

---

## Timeline

- **Phase 1-2:** 1-2 days (setup + path updates)
- **Phase 3:** 1 day (migration logic)
- **Phase 4:** 1 day (cleanup)
- **Phase 5:** 1-2 days (testing)

**Total:** ~1 week

---

## Benefits

✅ **Root userData cleaner** - only essential files visible
✅ **Better organization** - all synced data grouped in `database/` folder
✅ **Scalable** - easy to add new per-account folders
✅ **Clear separation** - system files (logs, config) vs user data
✅ **Future-proof** - can add other data folders later (e.g., `cache/`, `temp/`)

---

## Notes

1. **Migration is backward-compatible**: Old files are copied, not moved, until cleanup
2. **No data loss**: Migration creates backups before cleanup
3. **Reversible**: Old files backed up as `.bak` files
4. **Can be done gradually**: Migration runs on app startup, user doesn't need to do anything

---

## Status

**Created:** October 19, 2025
**Status:** ⏳ Ready for implementation
**Related Plans:** SYNC_ACCOUNT_IMPLEMENTATION_PLAN_REVISED.md (depends on this structure)
