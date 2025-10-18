# Sync & Account Architecture Overview

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Clustrix Electron App                           │
│                                                                           │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                     MAIN PROCESS (main.js)                         │ │
│  │                                                                     │ │
│  │  ┌──────────────────────────────────────────────────────────────┐ │ │
│  │  │             SyncManager Instance                             │ │ │
│  │  │  - loadSyncConfig()                                          │ │ │
│  │  │  - saveSyncConfig(config)                                    │ │ │
│  │  │  - getCloudDataPath(username)                                │ │ │
│  │  │  - getInternalDataPath(type)                                 │ │ │
│  │  └──────────────────────────────────────────────────────────────┘ │ │
│  │                              │                                      │ │
│  │                              ▼                                      │ │
│  │  ┌──────────────────────────────────────────────────────────────┐ │ │
│  │  │              IPC Handlers (ipcMain.handle)                   │ │ │
│  │  │                                                              │ │ │
│  │  │  sync:load-config      →  syncManager.loadSyncConfig()      │ │ │
│  │  │  sync:save-config      →  syncManager.saveSyncConfig()      │ │ │
│  │  │  sync:get-cloud-user   →  Get current cloud email           │ │ │
│  │  │  sync:start-oauth      →  Google OAuth Flow (Phase 2)       │ │ │
│  │  │  sync:logout           →  Clear token & fallback internal   │ │ │
│  │  │  sync:switch-mode      →  Change current mode               │ │ │
│  │  │  sessions:load         →  Load from cloud/internal          │ │ │
│  │  │  sessions:save         →  Save to cloud/internal            │ │ │
│  │  │  (same for artifacts, projects)                             │ │ │
│  │  └──────────────────────────────────────────────────────────────┘ │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                              ║ IPC                                       │
├──────────────────────────────╫─────────────────────────────────────────┤
│                              ║                                           │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                  RENDERER PROCESS (renderer.js)                    │ │
│  │                                                                     │ │
│  │  ┌──────────────────────────────────────────────────────────────┐ │ │
│  │  │          Account Settings Modal + UI Components             │ │ │
│  │  │                                                              │ │ │
│  │  │  • Not logged in state: "Sign in with Google" button        │ │ │
│  │  │  • Logged in state:                                         │ │ │
│  │  │    - User profile (pic + name + email)                      │ │ │
│  │  │    - Data source toggle: Internal / Cloud                   │ │ │
│  │  │    - Sync controls: Sync Now, Backup Now                    │ │ │
│  │  │    - Logout button                                          │ │ │
│  │  │  • Sidebar: Profile pic + name (when logged in)             │ │ │
│  │  └──────────────────────────────────────────────────────────────┘ │ │
│  │                              │                                      │ │
│  │                              ▼                                      │ │
│  │  ┌──────────────────────────────────────────────────────────────┐ │ │
│  │  │         Event Handlers + Sync Logic                         │ │ │
│  │  │                                                              │ │ │
│  │  │  handleGoogleLogin()          → window.api.sync.start...    │ │ │
│  │  │  handleLogout()               → window.api.sync.logout      │ │ │
│  │  │  handleDataSourceSwitch()     → window.api.sync.switch...   │ │ │
│  │  │  handleSyncNow()              → window.api.sync.syncNow     │ │ │
│  │  │  handleBackupNow()            → window.api.sync.backupNow   │ │ │
│  │  │  updateSidebarAccountButton() → Render user profile         │ │ │
│  │  │  updateAccountModalUI()       → Refresh modal state         │ │ │
│  │  └──────────────────────────────────────────────────────────────┘ │ │
│  │                              │                                      │ │
│  │                              ▼                                      │ │
│  │  ┌──────────────────────────────────────────────────────────────┐ │ │
│  │  │              window.api Bridge (preload.js)                  │ │ │
│  │  │                                                              │ │ │
│  │  │  api.sync.loadConfig()                                      │ │ │
│  │  │  api.sync.saveConfig()                                      │ │ │
│  │  │  api.sync.getCloudUserEmail()                               │ │ │
│  │  │  api.sync.getCloudUserProfile()                             │ │ │
│  │  │  api.sync.startGoogleOAuth()                                │ │ │
│  │  │  api.sync.logout()                                          │ │ │
│  │  │  api.sync.switchMode(mode)                                  │ │ │
│  │  │  api.sync.syncNow()                                         │ │ │
│  │  │  api.sync.backupNow()                                       │ │ │
│  │  │  api.app.restart()                                          │ │ │
│  │  └──────────────────────────────────────────────────────────────┘ │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Data Storage Architecture

```
userData/
│
├─── sessions/                  [INTERNAL]
│    ├── session-1.json
│    ├── session-2.json
│    └── ...
│
├─── artifacts/                 [INTERNAL]
│    └── artifacts.json
│
├─── projects/                  [INTERNAL]
│    └── projects.json
│
├─── ai-model.conf.json         [INTERNAL]
│
├─── sync/                       [CLOUD SYNCED]
│    │
│    ├── user1@gmail.com/       [First Account]
│    │   ├── sessions/
│    │   │   ├── session-1.json
│    │   │   └── ...
│    │   ├── artifacts/
│    │   │   └── artifacts.json
│    │   ├── projects/
│    │   │   └── projects.json
│    │   └── ai-model.conf.json
│    │
│    └── user2@gmail.com/       [Second Account]
│        ├── sessions/
│        ├── artifacts/
│        ├── projects/
│        └── ai-model.conf.json
│
├─── sync-config.json           [SYSTEM CONFIG - NOT BACKED UP]
│    {
│      "currentMode": "internal",           // atau "cloud"
│      "currentCloudUser": "user@gmail.com",
│      "cloudToken": "...",                 // encrypted
│      "cloudTokenExpiry": 1729000000,
│      "lastSyncTime": 1729000000,
│      "autoSync": false,
│      "createdAt": 1729000000
│    }
│
├─── app.log
└─── clustrix.db (optional SQLite)
```

---

## State Flow Diagram

### Initial State (App Start)
```
┌─────────────────────────────────────────────────────────────┐
│  1. Load sync-config.json                                   │
│  2. Check currentMode                                       │
│  3. If currentMode === 'cloud' && token valid               │
│       → Load data from /sync/<username>/ folder             │
│     Else → Load data from internal folder                   │
│  4. Update sidebar icon (default settings or user profile)  │
└─────────────────────────────────────────────────────────────┘
```

### Login Flow
```
┌────────────────────────────────────────────────────────────────┐
│  User clicks "Sign in with Google" button                      │
│                    ↓                                            │
│  OAuth Dialog appears                                          │
│                    ↓                                            │
│  User grants permission & redirects                           │
│                    ↓                                            │
│  Backend receives auth code → exchange to token              │
│                    ↓                                            │
│  Check: /sync/<email>/ exists?                               │
│         Yes → Query Drive untuk existing backup              │
│         No  → First time → Show "Download or Start Fresh"    │
│                    ↓                                            │
│  Save to sync-config.json:                                    │
│    - currentCloudUser = user@gmail.com                       │
│    - cloudToken = encrypted_token                            │
│    - cloudTokenExpiry = timestamp                            │
│                    ↓                                            │
│  Update sidebar icon with user profile                       │
│                    ↓                                            │
│  Modal shows: Data source = Internal (unless user chose...)  │
└────────────────────────────────────────────────────────────────┘
```

### Data Source Switch Flow
```
┌──────────────────────────────────────────────────────────────────┐
│  User clicks "Cloud" or "Internal" button                        │
│                    ↓                                              │
│  Validate switch is allowed (e.g., must be logged in for Cloud) │
│                    ↓                                              │
│  Update sync-config.json: currentMode = 'cloud' | 'internal'   │
│                    ↓                                              │
│  Trigger app.relaunch() with 2-3 sec delay                     │
│                    ↓                                              │
│  On restart: Load data dari new path (internal atau cloud)     │
│                    ↓                                              │
│  Update UI                                                       │
└──────────────────────────────────────────────────────────────────┘
```

### Logout Flow
```
┌──────────────────────────────────────────────────────────────┐
│  User clicks "Logout" button                                 │
│                    ↓                                          │
│  Clear from sync-config.json:                                │
│    - cloudToken = null                                       │
│    - cloudTokenExpiry = null                                 │
│    - currentCloudUser = null                                 │
│    - currentMode = 'internal' (fallback)                     │
│                    ↓                                          │
│  Optional: Delete /sync/<email>/ folder                      │
│           (dapat ditanya ke user)                            │
│                    ↓                                          │
│  Update sidebar: Show default settings icon                  │
│                    ↓                                          │
│  Reload data dari internal folder                            │
│                    ↓                                          │
│  Optional app restart (atau soft reload)                     │
└──────────────────────────────────────────────────────────────┘
```

---

## Config File Structure

### sync-config.json (Example)
```json
{
  "currentMode": "cloud",
  "currentCloudUser": "john.doe@gmail.com",
  "cloudToken": "ya29.a0AfH6SMB...encrypted...",
  "cloudTokenExpiry": 1729345600000,
  "lastSyncTime": 1729262000000,
  "autoSync": true,
  "createdAt": 1729000000000
}
```

### Data dalam /sync/<username>/sessions/ (Same format)
```javascript
// Exactly same structure sebagai internal sessions
[
  {
    id: "uuid-1",
    name: "Project X Discussion",
    messages: [[role, content, metadata], ...],
    created_at: "2024-10-19T...",
    last_updated: "2024-10-19T...",
    _x_think: { /* thinking data */ }
  },
  ...
]
```

---

## UI Component Hierarchy

```
Sidebar
├── Chats Button
├── Projects Button
├── Artifacts Button
└── Settings Container
    ├── Open Settings Button (MODIFIED)
    │   ├── When NOT logged in:
    │   │   ├── Default Settings Icon (SVG)
    │   │   └── "Personalization" label
    │   └── When logged in:
    │       ├── User Profile Picture
    │       ├── User First Name
    │       └── User Email (label)
    │
    └── Settings Menu (Dropdown)
        ├── Account [NEW]
        ├── Customize Clustrix
        ├── Model Lists
        ├── Switch Model
        ├── Search API
        └── Theme Switcher

Modals
├── Personalization Modal (existing)
└── Account Settings Modal [NEW]
    ├── NOT LOGGED IN STATE
    │   └── "Sign in with Google" button
    │
    └── LOGGED IN STATE
        ├── User Profile Card
        │   ├── Profile Picture
        │   ├── Name (read-only)
        │   └── Email (read-only)
        │
        ├── Data Source Selector
        │   ├── Internal Button
        │   ├── Cloud (Drive) Button
        │   └── Info text
        │
        ├── Sync Controls [visible only if Cloud mode]
        │   ├── Sync Now button
        │   ├── Backup Now button
        │   └── Help text
        │
        ├── Sync Info [visible only if Cloud mode]
        │   ├── Last synced time
        │   └── Current mode
        │
        └── Logout Button
```

---

## Event Flow Diagram

```
User Action → Event Handler → API Call → IPC → Main Process → Disk I/O
                                                      ↓
                                              Update sync-config.json
                                                      ↓
                                              Return result to IPC
                                                      ↓
                                              Renderer processes result
                                                      ↓
                                              Update UI / Restart app
```

### Example: Data Source Switch
```
User clicks "Cloud" button
        ↓
handleDataSourceSwitch('cloud')
        ↓
window.api.sync.switchMode('cloud')
        ↓
ipcRenderer.invoke('sync:switch-mode', 'cloud')
        ↓
ipcMain.handle('sync:switch-mode') di main.js
        ↓
SyncManager.loadSyncConfig()
        ↓
Validate: currentCloudUser ada? Yes!
        ↓
Update config: currentMode = 'cloud'
        ↓
SyncManager.saveSyncConfig(config)
        ↓
Return { success: true, requiresRestart: true }
        ↓
Renderer receives result
        ↓
Show alert & call window.api.app.restart()
        ↓
App relaunches
        ↓
DOMContentLoaded handler runs lagi
        ↓
loadSyncConfig() → currentMode = 'cloud'
        ↓
Load data dari /sync/user@gmail.com/
        ↓
Update UI dengan data cloud
        ↓
Sidebar shows user profile
```

---

## Error Handling Paths

```
┌─ Token Expired
│  └─ Try auto-refresh
│     ├─ Success → Update token
│     └─ Fail → Show re-login prompt OR fallback to internal
│
├─ Cloud Data Not Found
│  └─ Fallback ke internal dengan warning: "Cloud sync not available"
│
├─ Network Offline
│  ├─ OAuth → Show error: "No internet connection"
│  ├─ Sync → Buffer changes locally, notify user
│  └─ Load data → Use last cached copy
│
├─ Corrupted Cloud Data
│  └─ Fallback ke internal + warning + log error
│
├─ Account Switch
│  ├─ Old data folder → Delete (after user confirms)
│  └─ New data folder → Create & download dari Drive
│
├─ Disk Space Low
│  └─ Warn user before sync/backup
│
└─ Multiple Concurrent Mode Switches
   └─ Lock prevention: ignore new requests hingga current selesai
```

---

## Performance Considerations

1. **Lazy Loading:** Jangan load semua cloud data sekaligus
   - Load on demand atau paginate
   
2. **Token Caching:** Cache token dengan expiry check
   - Cek expiry sebelum API call
   - Auto-refresh 5 menit sebelum expire
   
3. **Sync Optimization:** Incremental sync
   - Hanya sync modified files (gunakan timestamp)
   - Compress besar data sebelum upload
   
4. **UI Responsiveness:** Async operations
   - Never block UI saat sync/login
   - Show loading spinner
   - Allow cancel operation
   
5. **Storage:** Cleanup policies
   - Archive old sessions setelah 1 tahun
   - Delete orphaned cloud data (>30 hari tidak di-access)

---

## Security Considerations

1. **Token Storage:** Encrypt tokens di sync-config.json
   - Gunakan `electron-store` dengan encryption key
   - OR gunakan OS keychain
   
2. **HTTPS Only:** Semua Google API calls via HTTPS
   
3. **User Consent:** Show permission request modal sebelum sync
   
4. **Data Privacy:**
   - Local data never sent tanpa explicit user action
   - Inform user tentang data yg akan di-backup
   
5. **Logout:** Securely clear tokens
   - Overwrite dengan random data sebelum delete
   
6. **CSP Headers:** Prevent XSS attacks
   - Sanitize user profile data sebelum render
