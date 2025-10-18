# Sync & Account Features - Complete Implementation

## ✅ What's Implemented

### 1. **Account Management**
- **Google OAuth Login** (demo + production modes)
  - Demo: Email prompt when no Google credentials
  - Production: Real OAuth flow when env vars set
- **Logout** - Clear session, reset to internal mode
- **Profile Display** - Shows email in sidebar when logged in

### 2. **Data Sync Architecture**
- **Internal Mode** (Default)
  - Storage: `userData/database/internal/clustrix.db`
  - All data stored locally
  - No cloud sync

- **Cloud Mode** (After login)
  - Storage: `userData/database/sync/<email>/clustrix.db`
  - Per-user cloud folder structure
  - Ready for Google Drive sync (Phase 2)

### 3. **Configuration Management**
- **Sync Config** (`userData/sync-config.json`)
  ```json
  {
    "currentMode": "internal" | "cloud",
    "currentCloudUser": "user@email.com" | null,
    "cloudToken": "access_token" | null,
    "cloudTokenExpiry": "2025-10-19T...",
    "lastSyncTime": "2025-10-19T...",
    "createdAt": "2025-10-19T...",
    "version": "1.0"
  }
  ```

### 4. **UI Components**
- **Account Button** (bottom left sidebar)
  - Shows settings icon when logged out
  - Shows profile pic when logged in
  
- **Account Settings Modal**
  - Login section (when not logged in)
    - Google login button
    - Description text
  - Profile section (when logged in)
    - User profile card (email + avatar)
    - Data source toggle (Internal / Cloud)
    - Sync & Backup buttons
    - Logout button

### 5. **IPC Handlers** (main.js)
```javascript
sync:getConfig              // Get current sync config
sync:saveConfig             // Save sync configuration
sync:switchMode             // Switch internal ↔ cloud
sync:listCloudUsers         // List all cloud user folders
sync:logout                 // Logout + reset mode
sync:startOAuth             // Start OAuth login flow
sync:syncNow                // Trigger manual sync (Phase 2)
sync:backupNow              // Trigger manual backup (Phase 2)
app:restart                 // Restart app after mode switch
```

### 6. **API Methods** (preload.js)
```javascript
window.api.sync.getConfig()
window.api.sync.saveConfig(config)
window.api.sync.switchMode({ mode, cloudUser })
window.api.sync.listCloudUsers()
window.api.sync.logout({ deleteCloudData })
window.api.sync.startOAuth()
window.api.sync.syncNow()
window.api.sync.backupNow()
window.api.app.restart()
```

## 🚀 **How to Use**

### Demo Login (No Google Credentials)
1. Click **Account** button (bottom left)
2. Click **Sign in with Google**
3. Enter email: `demo@example.com` (or any email)
4. Click **OK**
5. ✅ You're logged in! Sidebar updates with profile

### Switch to Cloud Mode
1. While logged in, click **Cloud (Google Drive)** button
2. App restarts automatically
3. Data now uses `userData/database/sync/<email>/`
4. Back to **Internal** to revert

### Logout
1. Click **Logout** button
2. Resets to internal mode
3. Data stays intact

## 🔧 **Environment Variables**

### For Demo Mode (Current)
```bash
# Leave these commented or empty
# GOOGLE_CLIENT_ID=
# GOOGLE_CLIENT_SECRET=
```

### For Production (Add to .env)
```bash
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-secret-key
```

Get credentials:
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create new project
3. Enable Google Drive API + Google People API
4. Create OAuth 2.0 Desktop application
5. Redirect URI: `http://localhost:3000/oauth/callback`
6. Download credentials and set env vars

## 📁 **File Structure**

```
userData/
├── database/
│   ├── internal/
│   │   └── clustrix.db          (Local data)
│   └── sync/
│       └── user@email.com/
│           └── clustrix.db      (Cloud data)
├── ai-model.conf.json           (Model config)
├── sync-config.json             (Sync settings)
├── app.log                       (App logs)
└── vector_data.json             (Vector store)
```

## 🔄 **Data Flow**

```
User Login
    ↓
OAuth Demo/Real
    ↓
sync:startOAuth (main.js)
    ↓
OAuthHelper class (oauth-helper.js)
    ↓
Email prompt (demo) OR Google login (production)
    ↓
Save to sync-config.json
    ↓
Switch to cloud mode database path
    ↓
Reload app
    ↓
All data now stored in sync/<email>/
```

## 📝 **Sync Managers**

### `backend/sync-manager.js`
- `loadSyncConfig()` - Load current config
- `saveSyncConfig(config)` - Save config
- `getInternalDataPath()` - Get internal DB path
- `getCloudDataPath(email)` - Get cloud DB path
- `listCloudUsers()` - List all user folders
- `createCloudUserFolder(email)` - Create user folder
- `deleteCloudUserFolder(email)` - Delete user folder
- `ensureDirectories()` - Ensure all dirs exist

### `backend/directory-migrator.js`
- `runMigration()` - Safe migration with backups
- Detects and prevents re-running
- Creates `.bak` backups before moving files

## 🎯 **Phase 1 Complete**

✅ Account UI
✅ OAuth integration (demo + production)
✅ Sync configuration
✅ Database path switching
✅ IPC handlers
✅ API exposure

## 📋 **Phase 2 (Coming Next)**

- [ ] Real Google Drive sync
- [ ] Incremental sync (only changed data)
- [ ] Conflict resolution
- [ ] Offline mode
- [ ] Selective sync (choose folders)
- [ ] Sync status indicators

## 🐛 **Troubleshooting**

### "module is not defined" Error
**FIXED** - Removed incorrect module.exports usage

### Login button not working
- Check browser console for errors
- Verify `.env` file has OAuth env vars (if using production)
- Try demo mode (leave env vars empty)

### App crashing after login
- Check `app.log` for errors
- Verify `userData/` directory exists
- Run `prisma migrate reset` if DB corrupted

### OAuth callback timeout
- Make sure `http://localhost:3000/` is reachable
- Check firewall/antivirus blocking port 3000
- Try demo mode instead

## 📞 **Questions?**

Check `main.js`, `preload.js`, `backend/oauth-helper.js` for implementation details.
