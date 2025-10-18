# Plan Review & Confirmation Checklist

## ⚠️ REVISED PLAN - SQLite Based

Aku sudah deep-dive ke codebase dan nyadar:
- ❌ BUKAN JSON files
- ✅ MENGGUNAKAN SQLite (better-sqlite3)
- ✅ Database: `userData/clustrix.db`

Plan yang original salah. Aku buat plan BARU yang sesuai dengan ACTUAL architecture:

1. **SYNC_ACCOUNT_IMPLEMENTATION_PLAN_REVISED.md** - Plan yang BENAR (SQLite-based)
2. **SYNC_ARCHITECTURE_DIAGRAMS.md** - Akan diupdate

**Files yang salah (can be deleted):**
- SYNC_ACCOUNT_IMPLEMENTATION_PLAN.md ❌ (Outdated - JSON assumptions)

---

## ✅ Revised Plan Highlights (SQLite-Based)

### Key Insight: Multiple Database Files
```
userData/clustrix.db              ← Internal (ALWAYS)
userData/sync/<username>/clustrix.db  ← Cloud per-account
```

### Backend Changes Needed
- ✅ New `SyncManager` class untuk manage sync config
- ✅ Extend `DatabaseManager` constructor untuk accept source path
- ✅ Modify main.js initialization untuk load correct DB path
- ✅ Add 8 new IPC handlers untuk sync operations (NO DATA MIGRATION!)
- ✅ Extended preload.js API dengan sync namespace

**PENTING:** Existing IPC handlers (sessions:load/save) TIDAK perlu berubah logic!
- Mereka langsung work karena db instance sudah point ke correct database

### Frontend Changes
- ✅ New Account Settings Modal (HTML + CSS)
- ✅ Modified Sidebar: Settings icon → User profile (when logged in)
- ✅ Settings Menu + "Account" item
- ✅ Event handlers untuk login, logout, mode switch
- ✅ UI state management (logged in vs not)

### Architecture
- ✅ Separate SQLite database per source (internal + per-cloud-account)
- ✅ `sync-config.json` system file (tracks current mode + user)
- ✅ DatabaseManager instance points to correct DB location
- ✅ App restart on mode switch = reinitialize db instance

---

## 🎯 Implementation Phases

```
Phase 1: Backend Infrastructure (Week 1)
├── Create SyncManager class
├── Implement sync config CRUD
├── Add basic IPC handlers
└── Extend preload.js

Phase 2: Frontend UI (Week 2)
├── Add Account Modal HTML/CSS
├── Implement Account handlers
├── Update Sidebar button
└── Event listener setup

Phase 3: Google OAuth (Week 3)
├── Implement OAuth flow
├── Token management
├── First-time sync choice
└── Profile fetching

Phase 4: Data Migration (Week 4)
├── Modify sessions/artifacts/projects loading
├── Implement sync & backup endpoints
├── Error handling & edge cases
└── Comprehensive testing

Phase 5: Testing & Polish (Week 4)
├── Unit tests
├── Integration tests
├── Manual smoke tests
└── Performance optimization
```

---

## 📊 Folder Structure Hasil Implementasi

```
userData/
├── clustrix.db                   ← INTERNAL SQLite database
├── ai-model.conf.json           ← Model config (unchanged)
├── app.log                       ← Logs (unchanged)
│
├── sync/                         ← NEW
│   ├── user1@gmail.com/         ← NEW per-account folder
│   │   └── clustrix.db          ← NEW per-account database (copy of internal schema)
│   │
│   └── user2@gmail.com/         ← NEW for different account
│       └── clustrix.db          ← NEW per-account database
│
└── sync-config.json             ← NEW (system file, NOT backed up)
    {
      "currentMode": "internal" | "cloud",
      "currentCloudUser": "user@gmail.com",
      "cloudToken": "...",
      "cloudTokenExpiry": 1729...,
      "createdAt": 1729...
    }
```

**PENTING:** Each SQLite database (`clustrix.db`) memiliki IDENTICAL schema:
- sessions table
- messages table
- artifacts table
- projects table
- settings table
- Etc

Cuma lokasi yang berbeda!

---

## 🔄 Data Flow Example (Revised)

### 1. User Logs In
```
handleGoogleLogin()
  → window.api.sync.startOAuth()
  → Backend: OAuth flow
  → User grants permission
  → Backend: Save token to sync-config.json
  → Frontend: Update sync-config with user email
  → Update sidebar with user profile pic
  → Show Account modal
```

### 2. User Switches to Cloud Mode
```
handleDataSourceSwitch('cloud')
  → window.api.sync.switchMode('cloud')
  → Update sync-config.json: currentMode = 'cloud'
  → Return { requiresRestart: true }
  → Show alert & auto-restart
  → App restart:
     - Load sync-config.json → currentMode = 'cloud', currentCloudUser = 'user@gmail.com'
     - main.js: Initialize db = new DatabaseManager(app, '/sync/user@gmail.com/')
     - Now db.getAllSessions() reads dari /sync/user@gmail.com/clustrix.db
     - Renderer loads sessions dari cloud database
  → Sidebar shows user profile
```

### 3. User Logs Out
```
handleLogout()
  → window.api.sync.logout()
  → Clear sync-config.json: cloudToken = null, currentMode = 'internal', currentCloudUser = null
  → Backend: db = new DatabaseManager(app)  // Back to internal
  → Update sidebar: Show default settings icon
  → Optional: Ask user "Keep cloud copy or delete?"
```

### 4. User Logs In Dengan Akun Baru
```
handleGoogleLogin() dengan email berbeda
  → OAuth success dengan user2@gmail.com
  → Check: /sync/user2@gmail.com/ exists?
     - Yes: Show "Download backup or skip"
     - No: Create new folder
  → Initialize db dari /sync/user2@gmail.com/clustrix.db
  → Load user2's data
```

---

---

## � What Actually Needs to Change

### main.js Changes
1. ✅ Create SyncManager instance
2. ✅ Modify app.whenReady() initialization:
   - Load sync-config.json
   - Initialize db dengan correct path based on currentMode
3. ✅ Add 8 new IPC handlers untuk sync (sync:load-config, sync:logout, etc)
4. ✅ Modify app:restart IPC handler (already exists? check)

**TIDAK perlu mengubah:**
- ❌ sessions:load / sessions:save logic
- ❌ artifacts:load / artifacts:save logic
- ❌ projects:load / projects:save logic
- Mereka otomatis work dengan db instance baru!

### preload.js Changes
1. ✅ Add sync namespace dengan 9 methods
2. ✅ Add app.restart method

### renderer.js Changes
1. ✅ Add Account modal UI handlers
2. ✅ Update DOMContentLoaded untuk load sync config
3. ✅ Update sidebar button logic
4. ✅ Add event listeners untuk Account modal

### index.html Changes
1. ✅ Add Account Settings Modal HTML
2. ✅ Modify #open-settings button untuk profile container
3. ✅ Add Account menu item

### CSS Changes
1. ✅ Add Account modal styling
2. ✅ Add profile button styling

---

## 📋 Confirmation Questions untuk User

**Sebelum mulai implementasi, confirm:**

### 1. Multiple Database Files Approach
**Confirm:** Understand & agree dengan "separate SQLite database per source" approach?
- Internal: `userData/clustrix.db`
- Cloud: `userData/sync/<username>/clustrix.db`

✅ Approach ini SIMPLE dan TIDAK require complex migration logic

---

### 2. Sidebar Button Update
**Confirm:** Sidebar button behavior:
- Not logged in: Settings icon + "Personalization"
- Logged in: User profile pic + first name + "Personalization" (hover → email)

✅ Agree?

---

### 3. Data Source Toggle
**Confirm:** Ketika user click "Cloud" atau "Internal":
- Auto-restart app dengan 2-3 sec delay + warning
- No cancel option (user can do it again if mistake)

✅ Agree?

---

### 4. Auto-Restart Behavior
**Confirm:** On app restart:
- Load sync-config.json → determine currentMode
- Initialize db dengan correct path
- User data immediately available dalam cloud/internal database

✅ Agree?

---

### 5. Settings Storage
**Confirm:** Persona settings, theme, language, etc:
- Stored in SQLite `settings` table
- Synced dengan database saat user switch mode
- NOT stored in separate config files

✅ Agree atau tetap separate file?

---

### 6. Model Config (ai-model.conf.json)
**Decision:** ai-model.conf.json:
- ✅ Option A: Keep LOCAL only (simpler, user-specific)
- ❓ Option B: Sync ke Google Drive (share across devices)

Current plan: **Option A** (local only)

---

## � Plan Documents

**Read in order:**

1. **SYNC_ACCOUNT_IMPLEMENTATION_PLAN_REVISED.md** ← START HERE
   - Complete implementation plan
   - SQLite-based architecture
   - Phase breakdown
   - Code samples

2. **This file (PLAN_REVIEW_CHECKLIST.md)**
   - Summary of changes
   - Confirmation questions
   - Next steps

3. **SYNC_ARCHITECTURE_DIAGRAMS.md** (can update later)
   - Visual diagrams
   - Data flow
   - State transitions

---

## ✅ Ready to Proceed?

Jika sudah confirm semua point di atas, kita bisa mulai Phase 1 implementation:

1. Create feature branch: `feature/sync-account-sqlite`
2. Start dengan creating `backend/sync-manager.js`
3. Extend `DatabaseManager` constructor
4. Modify `main.js` initialization
5. Add IPC handlers
6. Test each component

**Timeline:** ~5-6 weeks dari start sampai production-ready

---

## Status

**Created:** October 19, 2025
**Last Updated:** October 19, 2025  
**Status:** ⏳ Awaiting user confirmation
**Database:** SQLite (better-sqlite3) ✅
**Next:** User review & confirmation before implementation starts
