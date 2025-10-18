# Clustrix Sync & Account Implementation Plan

## Executive Summary
Implementasi sistem sync cloud/internal + Account settings UI untuk Clustrix AI Platform. Sistem dirancang untuk memberikan user fleksibilitas maksimal dengan data privacy & local-first approach. Fokus pada:
1. Folder structure `/sync/<username>/` terpisah dari internal data
2. `sync-config.json` sebagai system file (non-backup)
3. Account settings modal dengan login/logout Google OAuth
4. Auto-restart mechanism untuk mode switching
5. Sidebar icon upgrade: settings → user profile photo + name

---

## Current State Analysis

### Struktur Eksisting
```
userData/
├── sessions/          (internal)
├── artifacts/         (internal)
├── projects/          (internal)
├── ai-model.conf.json (internal)
├── app.log
└── clustrix.db (optional SQLite)
```

### IPC Pattern (main.js)
```
- sessions:load → ipcMain.handle('sessions:load')
- sessions:save → ipcMain.handle('sessions:save', data)
- artifacts:load/save
- projects:load/save
- models:load/save
- files:open-dialog
```

### Renderer State Management
```javascript
let state = {
  sessions: [],
  settings: {
    persona: { name, work, prefs },
    theme,
    streamThrottling,
    language
  }
};
```

### Current Settings UI
- Button: `#open-settings` (Settings SVG icon)
- Menu: `#settings-menu` (hidden by default)
- Modal: `#settings-modal` (Personalization modal)
- Items: "Customize Clustrix", "Model Lists", "Switch Model", "Search API", Theme toggler

---

## Phase 1: Backend Infrastructure (main.js & preload.js)

### 1.1 Create Sync Config System

**File: `backend/sync-manager.js`** (NEW)
```javascript
// Purpose: Manage sync configuration and cloud/internal data switching
class SyncManager {
  constructor(app) {
    this.userData = app.getPath('userData');
    this.syncConfigPath = path.join(this.userData, 'sync-config.json');
    this.syncRootPath = path.join(this.userData, 'sync');
  }

  // Load sync-config.json
  loadSyncConfig() {
    if (!fs.existsSync(this.syncConfigPath)) {
      return this.getDefaultSyncConfig();
    }
    try {
      const raw = fs.readFileSync(this.syncConfigPath, 'utf-8');
      return JSON.parse(raw);
    } catch (e) {
      log('SYNC', 4, 'loadSyncConfig', 'Failed to load sync-config.json', { error: e });
      return this.getDefaultSyncConfig();
    }
  }

  // Save sync-config.json
  saveSyncConfig(config) {
    try {
      fs.writeFileSync(this.syncConfigPath, JSON.stringify(config, null, 2), 'utf-8');
      return true;
    } catch (e) {
      log('SYNC', 4, 'saveSyncConfig', 'Failed to save sync-config.json', { error: e });
      return false;
    }
  }

  // Get default config
  getDefaultSyncConfig() {
    return {
      currentMode: 'internal',           // 'internal' | 'cloud'
      currentCloudUser: null,            // 'user@gmail.com' | null
      cloudToken: null,                  // encrypted token
      cloudTokenExpiry: null,            // timestamp
      lastSyncTime: null,                // timestamp of last sync
      autoSync: false,                   // enable auto-upload
      createdAt: Date.now()
    };
  }

  // Get path untuk cloud data: /sync/<username>/
  getCloudDataPath(username) {
    return path.join(this.syncRootPath, username);
  }

  // Get path untuk internal data (current)
  getInternalDataPath(type) {
    // type: 'sessions', 'artifacts', 'projects'
    return path.join(this.userData, type);
  }

  // Validate token expiry
  isTokenValid(config) {
    if (!config.cloudToken || !config.cloudTokenExpiry) return false;
    return config.cloudTokenExpiry > Date.now();
  }
}

module.exports = SyncManager;
```

**Usage in main.js:**
```javascript
const SyncManager = require('./backend/sync-manager');
let syncManager = null;

app.whenReady().then(async () => {
  syncManager = new SyncManager(app);
  const syncConfig = syncManager.loadSyncConfig();
  log('SYNC', 1, 'init', 'Sync config loaded', { mode: syncConfig.currentMode });
});
```

### 1.2 Extend IPC Bridge (preload.js)

**Add to `contextBridge.exposeInMainWorld`:**
```javascript
sync: {
  loadConfig: () => ipcRenderer.invoke('sync:load-config'),
  saveConfig: (config) => ipcRenderer.invoke('sync:save-config', config),
  getCloudUserEmail: () => ipcRenderer.invoke('sync:get-cloud-user'),
  getCloudUserProfile: () => ipcRenderer.invoke('sync:get-cloud-profile'),
  startGoogleOAuth: () => ipcRenderer.invoke('sync:start-oauth'),
  logout: () => ipcRenderer.invoke('sync:logout'),
  switchMode: (mode) => ipcRenderer.invoke('sync:switch-mode', mode),
  syncNow: () => ipcRenderer.invoke('sync:sync-now'),
  backupNow: () => ipcRenderer.invoke('sync:backup-now'),
},
```

### 1.3 Implement IPC Handlers (main.js)

**ipcMain.handle('sync:load-config')**
```javascript
ipcMain.handle('sync:load-config', async () => {
  try {
    const config = syncManager.loadSyncConfig();
    return config;
  } catch (e) {
    log('SYNC', 4, 'ipcMain:sync-load-config', 'Error loading sync config', { error: e });
    return syncManager.getDefaultSyncConfig();
  }
});
```

**ipcMain.handle('sync:save-config')**
```javascript
ipcMain.handle('sync:save-config', async (_evt, config) => {
  try {
    const success = syncManager.saveSyncConfig(config);
    log('SYNC', 1, 'ipcMain:sync-save-config', 'Sync config saved', { mode: config.currentMode });
    return success;
  } catch (e) {
    log('SYNC', 4, 'ipcMain:sync-save-config', 'Error saving sync config', { error: e });
    return false;
  }
});
```

**ipcMain.handle('sync:get-cloud-user')**
```javascript
ipcMain.handle('sync:get-cloud-user', async () => {
  try {
    const config = syncManager.loadSyncConfig();
    return config.currentCloudUser || null;
  } catch (e) {
    return null;
  }
});
```

**ipcMain.handle('sync:start-oauth')**
```javascript
ipcMain.handle('sync:start-oauth', async () => {
  try {
    // Implementasi Google OAuth flow
    // - Buka browser untuk user consent
    // - Dapatkan authorization code
    // - Exchange ke access token
    // - Simpan token ke sync-config.json
    // - Return user info: { email, name, picture }
    
    // Placeholder untuk Phase 2
    return {
      success: false,
      error: 'Google OAuth not yet implemented'
    };
  } catch (e) {
    log('SYNC', 4, 'ipcMain:sync-start-oauth', 'OAuth failed', { error: e });
    return { success: false, error: e.message };
  }
});
```

**ipcMain.handle('sync:logout')**
```javascript
ipcMain.handle('sync:logout', async () => {
  try {
    let config = syncManager.loadSyncConfig();
    config.currentMode = 'internal';
    config.currentCloudUser = null;
    config.cloudToken = null;
    config.cloudTokenExpiry = null;
    syncManager.saveSyncConfig(config);
    
    log('SYNC', 1, 'ipcMain:sync-logout', 'User logged out');
    return { success: true };
  } catch (e) {
    log('SYNC', 4, 'ipcMain:sync-logout', 'Logout failed', { error: e });
    return { success: false, error: e.message };
  }
});
```

**ipcMain.handle('sync:switch-mode')**
```javascript
ipcMain.handle('sync:switch-mode', async (_evt, mode) => {
  try {
    if (mode !== 'internal' && mode !== 'cloud') {
      throw new Error(`Invalid mode: ${mode}`);
    }
    
    let config = syncManager.loadSyncConfig();
    config.currentMode = mode;
    
    if (mode === 'cloud' && !config.currentCloudUser) {
      throw new Error('Cannot switch to cloud mode: not logged in');
    }
    
    syncManager.saveSyncConfig(config);
    
    log('SYNC', 1, 'ipcMain:sync-switch-mode', 'Data source switched', { mode });
    return { success: true, requiresRestart: true };
  } catch (e) {
    log('SYNC', 4, 'ipcMain:sync-switch-mode', 'Mode switch failed', { error: e });
    return { success: false, error: e.message, requiresRestart: false };
  }
});
```

---

## Phase 2: Frontend UI (renderer/index.html & renderer/renderer.js)

### 2.1 Create Account Settings Modal (index.html)

**Insert dalam `<!-- Settings Modal -->` section (sebelum `<!-- Switch Model Modal -->`):**

```html
  <!-- Account Settings Modal -->
  <div id="account-settings-modal" class="modal hidden">
    <div class="modal-overlay"></div>
    <div class="modal-card">
      <div class="modal-header">
        <h2>Account Settings</h2>
        <button id="close-account-modal" class="close-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>
      <hr />
      <div class="modal-body">
        <!-- NOT LOGGED IN STATE -->
        <div id="account-not-logged-in" class="account-section">
          <p style="text-align: center; color: var(--fg-muted); margin-bottom: 20px;">
            Sign in dengan Google untuk enable cloud sync, backup, dan access data di multiple devices.
          </p>
          <button id="google-login-btn" class="primary-btn" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 10px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Sign in with Google
          </button>
        </div>

        <!-- LOGGED IN STATE -->
        <div id="account-logged-in" class="account-section hidden">
          <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 25px; padding: 15px; background: var(--bg-elevated); border-radius: 8px;">
            <img id="account-profile-pic" src="" alt="Profile" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover;">
            <div>
              <div style="font-weight: 600; font-size: 14px;" id="account-name">User Name</div>
              <div style="color: var(--fg-muted); font-size: 12px;" id="account-email">user@gmail.com</div>
            </div>
          </div>

          <!-- Data Source Toggle -->
          <div class="form-group">
            <label>Data Source</label>
            <div style="display: flex; gap: 10px;">
              <button id="data-source-internal" class="mini-btn active" style="flex: 1;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                  <polyline points="9 22 9 12 15 12 15 22"></polyline>
                </svg>
                Internal
              </button>
              <button id="data-source-cloud" class="mini-btn" style="flex: 1;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M4 14.899a7 7 0 1 1 13.99 1"></path>
                  <path d="M12 17v4m-2-2h4"></path>
                </svg>
                Cloud (Drive)
              </button>
            </div>
            <p class="help-text" id="data-source-info">Data dimuat dari internal storage device kamu.</p>
          </div>

          <!-- Sync Controls -->
          <div class="form-group" id="sync-controls" style="display: none;">
            <label>Cloud Sync</label>
            <button id="sync-now-btn" class="secondary-btn" style="width: 100%; margin-bottom: 10px;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 0 0 4.582 9m0 0H4m16 0a8.001 8.001 0 0 0-15.356-2m0 0v-5h-.581"></path>
              </svg>
              Sync Now
            </button>
            <button id="backup-now-btn" class="secondary-btn" style="width: 100%;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                <polyline points="17 21 17 13 7 13 7 21"></polyline>
                <polyline points="7 3 7 8 15 8"></polyline>
              </svg>
              Backup Now
            </button>
            <p class="help-text">Sync changes atau backup ke Google Drive sekarang.</p>
          </div>

          <!-- Last Sync Info -->
          <div id="sync-info" class="form-group" style="display: none;">
            <label>Sync Info</label>
            <div style="padding: 10px; background: var(--bg-input); border-radius: 6px; font-size: 12px; color: var(--fg-muted);">
              <div>Last synced: <span id="last-sync-time">Never</span></div>
              <div>Mode: <span id="current-sync-mode">Internal</span></div>
            </div>
          </div>

          <!-- Logout Button -->
          <div style="display: flex; gap: 10px; margin-top: 30px;">
            <button id="account-logout-btn" class="danger-btn" style="flex: 1;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <polyline points="16 17 21 12 16 7"></polyline>
                <line x1="21" y1="12" x2="9" y2="12"></line>
              </svg>
              Logout
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
```

### 2.2 Modify Settings Menu (index.html)

**Replace existing `#open-settings` button:**

```html
<!-- BEFORE -->
<button id="open-settings" class="settings-btn symbols">
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" ...>...</svg>
  <span>Personalization</span>
</button>

<!-- AFTER -->
<button id="open-settings" class="settings-btn symbols" style="position: relative;">
  <div id="settings-icon-container" style="display: flex; align-items: center; gap: 8px;">
    <!-- Default: Settings Icon -->
    <svg id="default-settings-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-settings2-icon lucide-settings-2">
      <path d="M14 17H5" />
      <path d="M19 7h-9" />
      <circle cx="17" cy="17" r="3" />
      <circle cx="7" cy="7" r="3" />
    </svg>
    
    <!-- Cloud User: Profile Photo + Name (hidden by default) -->
    <div id="user-profile-container" style="display: none; align-items: center; gap: 8px;">
      <img id="user-profile-pic" src="" alt="Profile" style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover;">
      <span id="user-display-name" style="font-size: 12px; max-width: 100px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Name</span>
    </div>
  </div>
  <span id="settings-label">Personalization</span>
</button>
```

**Add Account button to settings-menu:**

```html
<div id="settings-menu" class="hidden">
  <!-- NEW: Account Button -->
  <button id="open-account-settings" class="menu-item">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
      <circle cx="12" cy="7" r="4"></circle>
    </svg>
    <span>Account</span>
  </button>
  
  <!-- Existing items -->
  <button id="open-persona-settings" class="menu-item">...</button>
  ...
</div>
```

### 2.3 Add CSS for Account Modal & Buttons

**Add to `renderer/style.css`:**

```css
/* Account Settings Styles */
#account-settings-modal {
  /* Inherit dari existing modal styling */
}

.account-section {
  margin-bottom: 20px;
}

.mini-btn {
  padding: 8px 12px;
  border: 1px solid var(--border);
  background: var(--bg-input);
  color: var(--fg);
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.mini-btn:hover {
  background: var(--bg-elevated);
}

.mini-btn.active {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
}

.secondary-btn {
  padding: 10px 16px;
  border: 1px solid var(--border);
  background: var(--bg-input);
  color: var(--fg);
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.secondary-btn:hover {
  background: var(--bg-elevated);
}

/* User Profile Container in Sidebar */
#user-profile-container {
  display: flex;
  align-items: center;
}

#user-profile-pic {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid var(--border);
}
```

---

## Phase 3: Renderer Logic (renderer/renderer.js)

### 3.1 Load Sync Config on App Init

**Modify DOMContentLoaded handler:**

```javascript
window.addEventListener('DOMContentLoaded', async () => {
  try {
    // Load sync configuration
    const syncConfig = await window.api.sync.loadConfig();
    
    log('INIT', 1, 'DOMContentLoaded', 'Sync config loaded', {
      mode: syncConfig.currentMode,
      cloudUser: syncConfig.currentCloudUser
    });

    // Update UI based on sync config
    await updateAccountUIFromConfig(syncConfig);

    // Load data from appropriate source
    if (syncConfig.currentMode === 'cloud' && syncConfig.currentCloudUser) {
      log('INIT', 1, 'DOMContentLoaded', 'Loading data from cloud', {
        user: syncConfig.currentCloudUser
      });
      // TODO: Load dari /sync/<username>/
    } else {
      log('INIT', 1, 'DOMContentLoaded', 'Loading data from internal', {});
      // Normal load (existing logic)
    }

    // Continue dengan initialization normal
    // ...existing DOMContentLoaded code...
  } catch (e) {
    log('INIT', 4, 'DOMContentLoaded', 'Sync initialization failed, fallback to internal', { error: e });
  }
});
```

### 3.2 Account Settings Modal Handlers

**Add baru in `setupEventHandlers()` atau dalam DOMContentLoaded:**

```javascript
// ===== ACCOUNT SETTINGS MODAL =====

// Open Account Modal
function openAccountSettingsModal() {
  log('UI', 0, 'event:open-account-settings', 'Account settings modal opened');
  
  $("#account-settings-modal").classList.remove("hidden");
  $("#settings-menu").classList.add("hidden");
  
  // Update account UI state
  updateAccountModalUI();
}

// Close Account Modal
function closeAccountSettingsModal() {
  $("#account-settings-modal").classList.add("hidden");
}

// Update account modal UI based on auth state
async function updateAccountModalUI() {
  try {
    const syncConfig = await window.api.sync.loadConfig();
    const cloudUser = syncConfig.currentCloudUser;
    
    if (cloudUser) {
      // Show logged-in state
      $("#account-not-logged-in").classList.add("hidden");
      $("#account-logged-in").classList.remove("hidden");
      
      // Fetch user profile
      const profile = await window.api.sync.getCloudUserProfile();
      if (profile) {
        $("#account-name").textContent = profile.name || cloudUser;
        $("#account-email").textContent = cloudUser;
        $("#account-profile-pic").src = profile.picture || '';
      }
      
      // Update data source buttons
      const isCloudMode = syncConfig.currentMode === 'cloud';
      updateDataSourceButtons(isCloudMode);
      
      // Show sync controls if cloud mode
      $("#sync-controls").style.display = isCloudMode ? 'block' : 'none';
      $("#sync-info").style.display = isCloudMode ? 'block' : 'none';
      
      // Update last sync time
      if (syncConfig.lastSyncTime) {
        const lastSyncDate = new Date(syncConfig.lastSyncTime);
        $("#last-sync-time").textContent = formatRelativeTime(lastSyncDate.toISOString());
      }
      
      $("#current-sync-mode").textContent = isCloudMode ? 'Cloud' : 'Internal';
    } else {
      // Show not-logged-in state
      $("#account-not-logged-in").classList.remove("hidden");
      $("#account-logged-in").classList.add("hidden");
    }
  } catch (e) {
    log('UI', 4, 'updateAccountModalUI', 'Failed to update account modal', { error: e });
  }
}

// Update data source buttons state
function updateDataSourceButtons(isCloudMode) {
  if (isCloudMode) {
    $("#data-source-internal").classList.remove("active");
    $("#data-source-cloud").classList.add("active");
    $("#data-source-info").textContent = "Data dimuat dari Google Drive.";
  } else {
    $("#data-source-internal").classList.add("active");
    $("#data-source-cloud").classList.remove("active");
    $("#data-source-info").textContent = "Data dimuat dari internal storage device kamu.";
  }
}

// Update sidebar button based on auth state
async function updateSidebarAccountButton() {
  try {
    const syncConfig = await window.api.sync.loadConfig();
    const cloudUser = syncConfig.currentCloudUser;
    
    if (cloudUser) {
      // Show user profile in sidebar
      const profile = await window.api.sync.getCloudUserProfile();
      
      $("#default-settings-icon").style.display = "none";
      $("#user-profile-container").style.display = "flex";
      
      if (profile && profile.picture) {
        $("#user-profile-pic").src = profile.picture;
      }
      
      // Extract first name or email
      const displayName = profile?.name?.split(' ')[0] || cloudUser.split('@')[0];
      $("#user-display-name").textContent = displayName;
      
      $("#settings-label").textContent = cloudUser;
    } else {
      // Show default settings icon
      $("#default-settings-icon").style.display = "block";
      $("#user-profile-container").style.display = "none";
      $("#settings-label").textContent = "Personalization";
    }
  } catch (e) {
    log('UI', 4, 'updateSidebarAccountButton', 'Failed to update sidebar', { error: e });
  }
}

// Google Login Handler
async function handleGoogleLogin() {
  try {
    log('AUTH', 1, 'handleGoogleLogin', 'Starting Google OAuth flow');
    
    const result = await window.api.sync.startGoogleOAuth();
    
    if (result.success) {
      log('AUTH', 1, 'handleGoogleLogin', 'OAuth successful', { email: result.email });
      
      // Update UI
      await updateAccountModalUI();
      await updateSidebarAccountButton();
      
      // Show modal untuk pilih load from drive atau start fresh
      // TODO: Implement first-time sync flow
    } else {
      log('AUTH', 4, 'handleGoogleLogin', 'OAuth failed', { error: result.error });
      alert(`Login failed: ${result.error}`);
    }
  } catch (e) {
    log('AUTH', 4, 'handleGoogleLogin', 'OAuth error', { error: e });
    alert('An error occurred during login');
  }
}

// Logout Handler
async function handleLogout() {
  try {
    log('AUTH', 1, 'handleLogout', 'Logging out');
    
    const result = await window.api.sync.logout();
    
    if (result.success) {
      log('AUTH', 1, 'handleLogout', 'Logout successful');
      
      // Update UI
      await updateAccountModalUI();
      await updateSidebarAccountButton();
      
      // Show notification
      alert('Logged out successfully. Data source switched to Internal.');
    } else {
      log('AUTH', 4, 'handleLogout', 'Logout failed', { error: result.error });
      alert(`Logout failed: ${result.error}`);
    }
  } catch (e) {
    log('AUTH', 4, 'handleLogout', 'Logout error', { error: e });
  }
}

// Data Source Switch Handler
async function handleDataSourceSwitch(mode) {
  try {
    log('SYNC', 1, 'handleDataSourceSwitch', 'Switching data source', { mode });
    
    const result = await window.api.sync.switchMode(mode);
    
    if (result.success) {
      if (result.requiresRestart) {
        log('SYNC', 1, 'handleDataSourceSwitch', 'Restart required for mode change');
        alert(`Switching to ${mode === 'cloud' ? 'Cloud' : 'Internal'} mode. App will restart...`);
        
        // Auto-restart setelah delay
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } else {
        await updateAccountModalUI();
      }
    } else {
      log('SYNC', 4, 'handleDataSourceSwitch', 'Mode switch failed', { error: result.error });
      alert(`Failed to switch mode: ${result.error}`);
    }
  } catch (e) {
    log('SYNC', 4, 'handleDataSourceSwitch', 'Mode switch error', { error: e });
  }
}

// Sync Now Handler
async function handleSyncNow() {
  try {
    log('SYNC', 1, 'handleSyncNow', 'Manual sync triggered');
    
    const result = await window.api.sync.syncNow();
    
    if (result.success) {
      log('SYNC', 1, 'handleSyncNow', 'Sync completed', result);
      alert('Sync completed successfully!');
      await updateAccountModalUI();
    } else {
      log('SYNC', 4, 'handleSyncNow', 'Sync failed', { error: result.error });
      alert(`Sync failed: ${result.error}`);
    }
  } catch (e) {
    log('SYNC', 4, 'handleSyncNow', 'Sync error', { error: e });
  }
}

// Backup Now Handler
async function handleBackupNow() {
  try {
    log('SYNC', 1, 'handleBackupNow', 'Manual backup triggered');
    
    const result = await window.api.sync.backupNow();
    
    if (result.success) {
      log('SYNC', 1, 'handleBackupNow', 'Backup completed', result);
      alert('Backup uploaded to Google Drive!');
      await updateAccountModalUI();
    } else {
      log('SYNC', 4, 'handleBackupNow', 'Backup failed', { error: result.error });
      alert(`Backup failed: ${result.error}`);
    }
  } catch (e) {
    log('SYNC', 4, 'handleBackupNow', 'Backup error', { error: e });
  }
}

// Event Listeners Setup
$("#open-account-settings").addEventListener("click", openAccountSettingsModal);
$("#close-account-modal").addEventListener("click", closeAccountSettingsModal);
$("#google-login-btn").addEventListener("click", handleGoogleLogin);
$("#account-logout-btn").addEventListener("click", handleLogout);

$("#data-source-internal").addEventListener("click", () => handleDataSourceSwitch('internal'));
$("#data-source-cloud").addEventListener("click", () => handleDataSourceSwitch('cloud'));

$("#sync-now-btn").addEventListener("click", handleSyncNow);
$("#backup-now-btn").addEventListener("click", handleBackupNow);

// Close modal saat overlay di-click
$("#account-settings-modal").addEventListener("click", (e) => {
  if (e.target.classList.contains("modal-overlay")) {
    closeAccountSettingsModal();
  }
});
```

### 3.3 Modify Settings Menu Click Handler

**Update `handleSettingsClick` function:**

```javascript
function handleSettingsClick(e) {
  e.stopPropagation();
  const willShow = $("#settings-menu").classList.contains("hidden");
  log("UI", 0, "event:open-settings-click", "Settings menu toggled", { willShow });
  
  $("#settings-menu").classList.toggle("hidden");
  $("#quick-model-switch-modal").classList.add("hidden");
  
  // Update account button visibility
  updateSidebarAccountButton();
}
```

---

## Phase 4: Data Migration & Loading Logic

### 4.1 Modify sessions:load IPC Handler (main.js)

**Current behavior (internal):**
```javascript
ipcMain.handle('sessions:load', async () => {
  const dataFile = path.join(app.getPath('userData'), 'chat_data.json');
  // ... load dari dataFile
});
```

**New behavior (with sync support):**
```javascript
ipcMain.handle('sessions:load', async () => {
  const syncConfig = syncManager.loadSyncConfig();
  let dataPath;

  if (syncConfig.currentMode === 'cloud' && syncConfig.currentCloudUser) {
    // Load dari cloud
    const cloudDataPath = syncManager.getCloudDataPath(syncConfig.currentCloudUser);
    dataPath = path.join(cloudDataPath, 'chat_data.json');
    
    if (!fs.existsSync(dataPath)) {
      log('SYNC', 2, 'sessions:load', 'Cloud data not found, falling back to internal', { user: syncConfig.currentCloudUser });
      dataPath = path.join(app.getPath('userData'), 'chat_data.json');
    }
  } else {
    // Load dari internal
    dataPath = path.join(app.getPath('userData'), 'chat_data.json');
  }

  // ... rest of existing load logic menggunakan dataPath
});
```

**Same approach untuk:**
- `artifacts:load`
- `artifacts:save`
- `projects:load`
- `projects:save`

### 4.2 Implement First-Time Sync Flow (renderer/renderer.js)

**Setelah Google login berhasil, tanyakan user:**

```javascript
async function handleFirstTimeSyncChoice() {
  // Show modal dengan opsi:
  // 1. "Download dari Drive" - query Drive untuk backup
  // 2. "Start Fresh" - gunakan internal data
  
  // Implementasi di Phase 2 untuk Google Drive API integration
}
```

---

## Phase 5: Auto-Restart Mechanism

### 5.1 Implement App Restart (main.js)

**Add restart handler:**
```javascript
ipcMain.handle('app:restart', async () => {
  try {
    app.relaunch();
    app.exit(0);
  } catch (e) {
    log('APP', 4, 'app:restart', 'Restart failed', { error: e });
    return false;
  }
});
```

**Update preload.js:**
```javascript
app: {
  restart: () => ipcRenderer.invoke('app:restart'),
},
```

### 5.2 Trigger Restart from Renderer

**Dalam `handleDataSourceSwitch`:**
```javascript
if (result.requiresRestart) {
  setTimeout(() => {
    window.api.app.restart();
  }, 2000);
}
```

---

## Implementation Roadmap

### Week 1: Backend Infrastructure
- [ ] Create `backend/sync-manager.js`
- [ ] Implement sync config load/save
- [ ] Add IPC handlers (basic)
- [ ] Extend preload.js with sync API

### Week 2: Frontend UI
- [ ] Add Account settings modal HTML
- [ ] Add CSS for new components
- [ ] Implement account modal handlers
- [ ] Update sidebar button logic

### Week 3: Google OAuth Integration
- [ ] Implement OAuth flow (Phase 2)
- [ ] Token management & encryption
- [ ] User profile fetching
- [ ] First-time sync flow

### Week 4: Data Migration & Testing
- [ ] Modify data loading logic (sessions, artifacts, projects)
- [ ] Implement sync/backup endpoints
- [ ] Comprehensive testing
- [ ] Error handling & edge cases

---

## Key Design Decisions

### ✅ Decisions Made
1. **Folder structure:** `/sync/<username>/` fully terpisah dari internal
2. **System file:** `sync-config.json` tidak included dalam backup
3. **Mode switching:** Requires app restart untuk clean state
4. **Auto-restart:** Automatic setelah delay 2-3 detik
5. **First login:** Always download from Drive (tidak ada merge)
6. **Data privacy:** Token disimpan encrypted
7. **Fallback:** Jika cloud load fail, fallback ke internal

### ⚠️ Edge Cases to Handle
1. Token expired → auto-refresh atau prompt re-login
2. Cloud data corrupt → fallback dengan warning
3. Network offline → use last cached data
4. Multiple accounts → cleanup old account data
5. Logout → optional keep local copy atau delete
6. Disk space low → compress/archive old data

---

## Testing Checklist

### Unit Tests
- [ ] SyncManager.loadSyncConfig() - valid/invalid JSON
- [ ] SyncManager.saveSyncConfig() - file I/O
- [ ] Data source detection logic
- [ ] Path resolution (internal vs cloud)

### Integration Tests
- [ ] First-time login flow
- [ ] Mode switch → restart → data load correctly
- [ ] Account switch → old data deleted → new data loaded
- [ ] Logout → fallback to internal
- [ ] Sidebar updates correctly

### Manual Testing
- [ ] Settings menu toggles
- [ ] Account modal opens/closes
- [ ] Google login flow (mock)
- [ ] Data source buttons update
- [ ] App restart on mode change
- [ ] Sync info displays correctly
- [ ] UI responsive di mobile

---

## Success Criteria

1. ✅ Account settings modal fully functional
2. ✅ Sidebar icon updates dengan user profile
3. ✅ Data source toggle works (internal/cloud)
4. ✅ App auto-restart on mode change
5. ✅ No data loss during mode switch
6. ✅ Fallback to internal works correctly
7. ✅ All edge cases handled
8. ✅ Zero breaking changes to existing features
