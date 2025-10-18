# Clustrix Sync & Account System - REVISED PLAN (SQLite Based)

**Created:** October 19, 2025
**Status:** ⏳ Awaiting confirmation
**Database:** SQLite (better-sqlite3), NOT JSON

---

## ✅ ACTUAL Architecture (NOT Assumptions)

### Current Data Storage
```
userData/
├── clustrix.db (SQLite - PRIMARY)
│   ├── sessions table
│   ├── messages table
│   ├── artifacts table
│   ├── projects table
│   ├── project_files table
│   ├── settings table
│   ├── drafts table
│   ├── vector_embeddings table
│   └── migration_info table
│
├── ai-model.conf.json (Model config - SEPARATE FILE)
├── app.log (Logging)
└── (Optional: chat_data.json - LEGACY for migration only)
```

### Current IPC Handlers
```
sessions:load    → db.getAllSessions() + db.getMessages()
sessions:save    → db.transaction() → saveSession() + addMessage()
artifacts:load   → db.getAllArtifacts()
artifacts:save   → db.transaction() → saveArtifact()
projects:load    → db.getAllProjects() + db.getProjectFiles()
projects:save    → db.transaction() → saveProject() + saveProjectFile()
models:load/save → ai-model.conf.json (File-based)
```

### Renderer State Management
```javascript
let state = {
  sessions: [],  // dari db.getAllSessions()
  settings: {}   // dari db.getAllSettings()
};
```

---

## 📋 Revised Implementation Plan

### Phase 1: Backend Infrastructure (main.js + database-manager.js)

#### 1.1 Create `SyncManager` class (backend/sync-manager.js)
```javascript
class SyncManager {
  constructor(app) {
    this.userData = app.getPath('userData');
    this.syncRootPath = path.join(this.userData, 'sync');  // /sync folder
    this.syncConfigPath = path.join(this.userData, 'sync-config.json');
  }

  loadSyncConfig() {
    // Load /sync-config.json
    // Return default if not exists
  }

  saveSyncConfig(config) {
    // Save to /sync-config.json
  }

  getCloudDataPath(username) {
    // Return: /sync/<username>/
  }

  createCloudUserFolder(username) {
    // Create /sync/<username>/ structure
    // Return path or throw
  }
}
```

#### 1.2 Extend DatabaseManager for Multi-Source Support
```javascript
class DatabaseManager {
  constructor(app, sourcePath = null) {
    // If sourcePath provided, use /sync/<username>/
    // Else use userData root (internal)
    
    const dbPath = sourcePath 
      ? path.join(sourcePath, 'clustrix.db')
      : path.join(app.getPath('userData'), 'clustrix.db');
    
    this.db = new Database(dbPath);
    this.initSchema();
  }
  
  // Existing methods: getAllSessions, getMessages, saveSession, etc
  // Work same way regardless of dbPath
}
```

**Key insight:** SQLite database files can exist in multiple locations!
- Internal: `userData/clustrix.db`
- Cloud (user1): `userData/sync/user1@gmail.com/clustrix.db`
- Cloud (user2): `userData/sync/user2@gmail.com/clustrix.db`

#### 1.3 Modify Main Process Initialization (main.js)
```javascript
let db = null;
let syncManager = null;
let currentDbSource = 'internal';  // 'internal' | 'cloud'

app.whenReady().then(async () => {
  syncManager = new SyncManager(app);
  const syncConfig = syncManager.loadSyncConfig();
  
  // Determine which database to use
  let dbPath;
  if (syncConfig.currentMode === 'cloud' && syncConfig.currentCloudUser) {
    const cloudDataPath = syncManager.getCloudDataPath(syncConfig.currentCloudUser);
    if (fs.existsSync(path.join(cloudDataPath, 'clustrix.db'))) {
      db = new DatabaseManager(app, cloudDataPath);
      currentDbSource = 'cloud';
    } else {
      // Fallback: cloud mode but no cloud data
      db = new DatabaseManager(app);
      currentDbSource = 'internal';
    }
  } else {
    // Default: internal
    db = new DatabaseManager(app);
    currentDbSource = 'internal';
  }
  
  log('DATABASE', 1, 'init', 'Database source selected', { 
    source: currentDbSource,
    mode: syncConfig.currentMode 
  });
});
```

#### 1.4 Add IPC Handlers for Sync (main.js)

**New IPC handlers:**
```javascript
ipcMain.handle('sync:load-config', async () => {
  // Return sync-config.json
  return syncManager.loadSyncConfig();
});

ipcMain.handle('sync:save-config', async (_evt, config) => {
  // Save to sync-config.json
  syncManager.saveSyncConfig(config);
  return true;
});

ipcMain.handle('sync:get-cloud-user', async () => {
  // Return currentCloudUser email or null
  const config = syncManager.loadSyncConfig();
  return config.currentCloudUser || null;
});

ipcMain.handle('sync:get-cloud-profile', async () => {
  // Return profile: { name, email, picture }
  // TODO: Phase 2 - Google OAuth
  return null;
});

ipcMain.handle('sync:start-oauth', async () => {
  // TODO: Phase 2 - Google OAuth flow
  // Return { success, email, name, picture }
  return { success: false, error: 'Not implemented' };
});

ipcMain.handle('sync:logout', async () => {
  // Clear sync-config.json
  let config = syncManager.loadSyncConfig();
  config.currentMode = 'internal';
  config.currentCloudUser = null;
  config.cloudToken = null;
  config.cloudTokenExpiry = null;
  syncManager.saveSyncConfig(config);
  
  // Reinitialize DB to internal
  db = new DatabaseManager(app);
  currentDbSource = 'internal';
  
  return { success: true };
});

ipcMain.handle('sync:switch-mode', async (_evt, mode) => {
  // Validate & switch mode
  // IMPORTANT: This will require app restart!
  
  if (mode !== 'internal' && mode !== 'cloud') {
    throw new Error(`Invalid mode: ${mode}`);
  }
  
  const config = syncManager.loadSyncConfig();
  
  if (mode === 'cloud' && !config.currentCloudUser) {
    throw new Error('Cannot switch to cloud: not logged in');
  }
  
  // Update config
  config.currentMode = mode;
  syncManager.saveSyncConfig(config);
  
  return { success: true, requiresRestart: true };
});

ipcMain.handle('sync:sync-now', async () => {
  // TODO: Phase 2 - Google Drive upload
  // Compare local vs cloud, upload changes
  return { success: true };
});

ipcMain.handle('sync:backup-now', async () => {
  // TODO: Phase 2 - Google Drive backup
  // Full backup to Drive
  return { success: true };
});
```

#### 1.5 Modify Existing IPC Handlers (main.js)

**No changes to structure, but add source-awareness:**

```javascript
// EXISTING: ipcMain.handle('sessions:load', async () => { ... })
// Already works because db instance points to correct database!

ipcMain.handle('sessions:load', async () => {
  try {
    if (useSQLite && db) {
      // db instance is ALREADY pointing to correct DB
      // (internal atau /sync/<username>/ database)
      
      const sessions = db.getAllSessions();  // Works regardless!
      
      // Transform like before...
      const transformed = sessions.map(session => {
        const messages = db.getMessages(session.id);
        // ... rest of logic unchanged
      });
      
      // Same for settings
      const settings = db.getAllSettings();
      return { sessions: transformed, settings };
    }
  } catch (e) {
    // ... existing error handling
  }
});

// Same for:
// - ipcMain.handle('sessions:save')
// - ipcMain.handle('artifacts:load')
// - ipcMain.handle('artifacts:save')
// - ipcMain.handle('projects:load')
// - ipcMain.handle('projects:save')
```

#### 1.6 Extend preload.js

```javascript
sync: {
  loadConfig: () => ipcRenderer.invoke('sync:load-config'),
  saveConfig: (config) => ipcRenderer.invoke('sync:save-config', config),
  getCloudUser: () => ipcRenderer.invoke('sync:get-cloud-user'),
  getCloudProfile: () => ipcRenderer.invoke('sync:get-cloud-profile'),
  startOAuth: () => ipcRenderer.invoke('sync:start-oauth'),
  logout: () => ipcRenderer.invoke('sync:logout'),
  switchMode: (mode) => ipcRenderer.invoke('sync:switch-mode', mode),
  syncNow: () => ipcRenderer.invoke('sync:sync-now'),
  backupNow: () => ipcRenderer.invoke('sync:backup-now'),
},
app: {
  restart: () => ipcRenderer.invoke('app:restart'),
},
```

---

### Phase 2: Frontend UI (renderer.js + index.html)

#### 2.1 Add Account Settings Modal HTML (index.html)

```html
<!-- Account Settings Modal -->
<div id="account-settings-modal" class="modal hidden">
  <div class="modal-overlay"></div>
  <div class="modal-card">
    <div class="modal-header">
      <h2>Account Settings</h2>
      <button id="close-account-modal" class="close-btn">...</button>
    </div>
    <hr />
    <div class="modal-body">
      <!-- NOT LOGGED IN -->
      <div id="account-not-logged-in" class="account-section">
        <p>Sign in dengan Google untuk enable cloud sync...</p>
        <button id="google-login-btn" class="primary-btn">Sign in with Google</button>
      </div>

      <!-- LOGGED IN -->
      <div id="account-logged-in" class="account-section hidden">
        <!-- User Profile Card -->
        <div class="user-profile-card">
          <img id="account-profile-pic" src="" alt="Profile">
          <div>
            <div id="account-name">User Name</div>
            <div id="account-email">user@gmail.com</div>
          </div>
        </div>

        <!-- Data Source Toggle -->
        <div class="form-group">
          <label>Data Source</label>
          <div class="button-group">
            <button id="data-source-internal" class="mini-btn active">Internal</button>
            <button id="data-source-cloud" class="mini-btn">Cloud (Drive)</button>
          </div>
          <p class="help-text" id="data-source-info">...</p>
        </div>

        <!-- Sync Controls (visible only in cloud mode) -->
        <div id="sync-controls" class="form-group" style="display: none;">
          <button id="sync-now-btn" class="secondary-btn">Sync Now</button>
          <button id="backup-now-btn" class="secondary-btn">Backup Now</button>
        </div>

        <!-- Logout Button -->
        <button id="account-logout-btn" class="danger-btn">Logout</button>
      </div>
    </div>
  </div>
</div>
```

#### 2.2 Update Settings Menu (index.html)

```html
<!-- Modify existing #open-settings button -->
<button id="open-settings" class="settings-btn symbols">
  <div id="settings-icon-container">
    <!-- Default Settings Icon -->
    <svg id="default-settings-icon" ...>...</svg>
    
    <!-- User Profile (hidden by default) -->
    <div id="user-profile-container" style="display: none;">
      <img id="user-profile-pic" src="" style="width: 24px; height: 24px; border-radius: 50%;">
      <span id="user-display-name">Name</span>
    </div>
  </div>
  <span id="settings-label">Personalization</span>
</button>

<!-- Add Account to settings-menu -->
<div id="settings-menu" class="hidden">
  <button id="open-account-settings" class="menu-item">
    <svg>...</svg>
    <span>Account</span>
  </button>
  <!-- Existing items -->
  <button id="open-persona-settings" class="menu-item">...</button>
  ...
</div>
```

#### 2.3 Add Event Handlers (renderer.js)

```javascript
// Load sync config on app init
window.addEventListener('DOMContentLoaded', async () => {
  try {
    const syncConfig = await window.api.sync.loadConfig();
    
    log('INIT', 1, 'DOMContentLoaded', 'Sync config loaded', {
      mode: syncConfig.currentMode,
      cloudUser: syncConfig.currentCloudUser
    });

    // Update sidebar button based on auth state
    await updateSidebarAccountButton();
    
    // Continue with normal initialization
    // ... existing code ...
  } catch (e) {
    log('INIT', 4, 'DOMContentLoaded', 'Sync init failed', { error: e });
  }
});

// Account modal handlers
async function openAccountSettingsModal() {
  $("#account-settings-modal").classList.remove("hidden");
  $("#settings-menu").classList.add("hidden");
  
  await updateAccountModalUI();
}

function closeAccountSettingsModal() {
  $("#account-settings-modal").classList.add("hidden");
}

async function updateAccountModalUI() {
  const syncConfig = await window.api.sync.loadConfig();
  const cloudUser = syncConfig.currentCloudUser;
  
  if (cloudUser) {
    // Show logged-in UI
    $("#account-not-logged-in").classList.add("hidden");
    $("#account-logged-in").classList.remove("hidden");
    
    const profile = await window.api.sync.getCloudProfile();
    if (profile) {
      $("#account-name").textContent = profile.name || cloudUser;
      $("#account-email").textContent = cloudUser;
      $("#account-profile-pic").src = profile.picture || '';
    }
    
    // Update data source buttons
    const isCloudMode = syncConfig.currentMode === 'cloud';
    updateDataSourceButtons(isCloudMode);
    
    // Show sync controls only in cloud mode
    $("#sync-controls").style.display = isCloudMode ? 'block' : 'none';
  } else {
    // Show not-logged-in UI
    $("#account-not-logged-in").classList.remove("hidden");
    $("#account-logged-in").classList.add("hidden");
  }
}

async function updateSidebarAccountButton() {
  const syncConfig = await window.api.sync.loadConfig();
  const cloudUser = syncConfig.currentCloudUser;
  
  if (cloudUser) {
    // Show user profile in sidebar
    const profile = await window.api.sync.getCloudProfile();
    
    $("#default-settings-icon").style.display = "none";
    $("#user-profile-container").style.display = "flex";
    
    if (profile?.picture) {
      $("#user-profile-pic").src = profile.picture;
    }
    
    const displayName = profile?.name?.split(' ')[0] || cloudUser.split('@')[0];
    $("#user-display-name").textContent = displayName;
  } else {
    // Show default settings icon
    $("#default-settings-icon").style.display = "block";
    $("#user-profile-container").style.display = "none";
  }
}

async function handleGoogleLogin() {
  try {
    const result = await window.api.sync.startOAuth();
    
    if (result.success) {
      await updateAccountModalUI();
      await updateSidebarAccountButton();
    } else {
      alert(`Login failed: ${result.error}`);
    }
  } catch (e) {
    alert('An error occurred during login');
  }
}

async function handleLogout() {
  try {
    await window.api.sync.logout();
    
    // Update UI
    await updateAccountModalUI();
    await updateSidebarAccountButton();
    
    alert('Logged out. Switching to Internal mode.');
  } catch (e) {
    alert(`Logout failed: ${e.message}`);
  }
}

async function handleDataSourceSwitch(mode) {
  try {
    const result = await window.api.sync.switchMode(mode);
    
    if (result.requiresRestart) {
      alert(`Switching to ${mode} mode. App will restart...`);
      
      setTimeout(() => {
        window.api.app.restart();
      }, 2000);
    }
  } catch (e) {
    alert(`Failed: ${e.message}`);
  }
}

// Event listeners
$("#open-account-settings").addEventListener("click", openAccountSettingsModal);
$("#close-account-modal").addEventListener("click", closeAccountSettingsModal);
$("#google-login-btn").addEventListener("click", handleGoogleLogin);
$("#account-logout-btn").addEventListener("click", handleLogout);
$("#data-source-internal").addEventListener("click", () => handleDataSourceSwitch('internal'));
$("#data-source-cloud").addEventListener("click", () => handleDataSourceSwitch('cloud'));
```

#### 2.4 Add CSS (renderer/style.css)

```css
/* Account modal & buttons styling */
.account-section { /* ... */ }
.user-profile-card { /* ... */ }
.mini-btn { /* ... */ }
.button-group { /* ... */ }
```

---

### Phase 3: Google OAuth Integration (Phase 2)

#### 3.1 Implement OAuth Flow
- Setup Google Cloud Console OAuth credentials
- Implement auth code exchange
- Store & refresh tokens securely
- Fetch user profile data

#### 3.2 First-Time Sync Choice
- Detect /sync/<username>/ exists?
- Show modal: "Download backup" vs "Start fresh"
- Download dari Google Drive if exists

---

### Phase 4: Data Migration & First-Time Setup

#### 4.1 Handle Account Switch
```javascript
// When user logs in dengan email baru:
// 1. Delete old /sync/<old-email>/
// 2. Create /sync/<new-email>/
// 3. Download dari Drive (if exists)
// 4. Reinitialize db dengan new path
```

#### 4.2 Handle First Login
```javascript
// After OAuth success:
// 1. Check /sync/<email>/ exists?
// 2. If yes: Show "Download or Skip"
// 3. If no: Create folder structure
// 4. Initialize database
```

---

## 📁 File Structure After Implementation

```
userData/
├── clustrix.db              (Internal database - PRIMARY)
│
├── ai-model.conf.json       (Model config - unchanged)
├── app.log                  (Logs - unchanged)
│
├── sync/                    ← NEW
│   ├── user1@gmail.com/     ← NEW
│   │   └── clustrix.db      ← NEW (separate database)
│   │
│   └── user2@gmail.com/     ← NEW
│       └── clustrix.db      ← NEW
│
└── sync-config.json         ← NEW (system config)
    {
      "currentMode": "internal",
      "currentCloudUser": "user1@gmail.com",
      "cloudToken": "...",
      "cloudTokenExpiry": 1729...,
      "createdAt": 1729...
    }
```

---

## 🔄 State Transitions

### Initial App Load
```
DOMContentLoaded
  ↓
loadSyncConfig() → { currentMode: 'internal', currentCloudUser: null }
  ↓
main.js: Initialize db = new DatabaseManager(app)  // Uses userData/clustrix.db
  ↓
Sidebar: Show default settings icon
```

### After User Login
```
handleGoogleLogin()
  ↓
OAuth success → email: user@gmail.com
  ↓
syncManager.saveSyncConfig() → currentCloudUser = 'user@gmail.com'
  ↓
updateSidebarAccountButton()
  ↓
Sidebar: Show user profile photo + name
```

### User Switches to Cloud Mode
```
handleDataSourceSwitch('cloud')
  ↓
window.api.sync.switchMode('cloud')
  ↓
Update sync-config.json: currentMode = 'cloud'
  ↓
Return { requiresRestart: true }
  ↓
Alert user & auto-restart after 2 sec
  ↓
App restart:
  - Load sync-config.json → currentMode = 'cloud'
  - main.js: Initialize db = new DatabaseManager(app, '/sync/user1@gmail.com')
  - Sessions:load → reads dari /sync/user1@gmail.com/clustrix.db
  - Sidebar: Shows user profile
```

---

## ✅ Key Advantages of This Approach

1. **Multiple Database Instances:** Each location has own SQLite database
   - Internal: `userData/clustrix.db`
   - Cloud: `userData/sync/<username>/clustrix.db`
   - Both databases have identical schema

2. **No Schema Changes:** Database structure remains same
   - Just pointing db instance to different location

3. **Simple Data Source Switching:**
   - Restart app + reinitialize db instance
   - No complex migration logic needed

4. **Graceful Fallback:**
   - If cloud mode but cloud DB missing → fallback to internal
   - If token expired → fallback to internal

5. **Per-Account Isolation:**
   - Each Google account has separate database
   - No data mixing

---

## ⚠️ Important Considerations

### Model Config (ai-model.conf.json)
**Decision needed:** Sync dengan Google Drive atau tetap local?
- **Option A:** Keep local only (simpler)
- **Option B:** Sync ke Drive (share settings across devices)

Current plan: **Option A** (keep local, simpler to start)

### First-Time Cloud Database Creation
When user switch to cloud mode, cloud DB doesn't exist yet:
- Option 1: Copy internal DB ke cloud
- Option 2: Create new empty DB di cloud
- Option 3: Query Drive untuk existing backup

Current plan: **Option 2** (create new empty, user can restore manually)

### Settings Table
Settings stored in SQLite `settings` table:
- Persona (name, work, prefs)
- UI preferences (theme, language, etc)
- Auto-sync enabled
- Etc

All synced with database when user switches modes.

---

## 🎯 Implementation Phases (Revised)

### Phase 1: Backend Infrastructure (1-2 weeks)
- ✅ Create SyncManager class
- ✅ Extend DatabaseManager for source awareness
- ✅ Add IPC handlers
- ✅ Modify main.js initialization

### Phase 2: Frontend UI (1 week)
- ✅ Add Account modal HTML/CSS
- ✅ Add Account handlers (renderer.js)
- ✅ Update sidebar button
- ✅ Event listeners

### Phase 3: Google OAuth (2 weeks)
- ⏳ Implement OAuth flow
- ⏳ Token management
- ⏳ User profile fetching

### Phase 4: Testing & Polish (1 week)
- ⏳ Unit tests
- ⏳ Integration tests
- ⏳ Error handling
- ⏳ Edge cases

**Total: 5-6 weeks**

---

## 📋 Confirmation Checklist

**Sebelum mulai implementasi, confirm:**

1. ✅ Understand current SQLite architecture?
2. ✅ Agree dengan "multiple database files" approach?
3. ✅ Settings (persona, theme, dll) sync dengan database?
4. ✅ Model config (ai-model.conf.json) tetap local saja?
5. ✅ First-time cloud DB = create new empty (no copy)?
6. ✅ Auto-restart on mode change = OK?
7. ✅ Account switch = delete old cloud data?

---

## Next Steps

1. User confirms checklist
2. Create feature branch: `feature/sync-account-sqlite`
3. Start Phase 1 implementation
4. Regular testing after each component
