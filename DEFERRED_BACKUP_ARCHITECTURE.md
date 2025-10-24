# Deferred Backup Architecture

## Overview
This document explains the architectural change from synchronous backup (during logout/switch) to deferred backup (after restart).

## Problem Solved
Previously, logout and data source switching operations were slow (5-10 seconds) because they performed GitHub API calls synchronously before completing the operation. Users experienced poor UX with lengthy wait times.

## Solution Architecture

### Flow Diagram
```
User clicks Logout/Switch
    ↓
Set pendingBackupAndCleanup flag
    ↓
Immediate restart (1 second)
    ↓
App starts up
    ↓
did-finish-load handler triggers
    ↓
Check pendingBackupAndCleanup flag
    ↓
Backup to GitHub (background)
    ↓
Delete cloud user folder
    ↓
Clear pending flag
```

## Implementation Details

### 1. Flag Structure (`pendingBackupAndCleanup`)
Location: `${userData}/sync-config.json`

```json
{
  "pendingBackupAndCleanup": {
    "user": "github-user-id",
    "username": "github-username",
    "token": "github-token",
    "reason": "logout" | "switch-to-internal",
    "scheduledAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### 2. Logout Flow

**File:** `main.js` - IPC Handler `sync:logout`
- Sets `pendingBackupAndCleanup` flag with user credentials
- Clears `currentCloudUser` and `cloudToken` from config
- Switches mode to 'internal'
- Triggers restart with 1000ms delay

**File:** `renderer.js` - Function `performLogout()`
- Removed automatic backup code (previously lines 15938-15988)
- Now just calls `window.api.sync.logout()` directly
- Shows success message and waits for restart

**File:** `renderer.js` - Function `handleLogout()`
- Updated confirmation message:
  - Old: "Make an automatic backup to GitHub before signing out"
  - New: "Restart the app immediately and return to internal mode" + "Create an automatic backup to GitHub after restart"

### 3. Data Source Switch Flow

**File:** `main.js` - IPC Handler `sync:switchMode`
- When switching from cloud to internal:
  - Sets `pendingBackupAndCleanup` flag (same as logout)
  - Switches mode to 'internal'
  - Triggers restart with 1000ms delay

**File:** `renderer.js` - Function `executeDataSourceSwitch()`
- Removed automatic backup code (previously lines ~16470-16540)
- Added log message noting backup will happen after restart
- Continues directly to switch API call

**File:** `renderer.js` - Function `handleDataSourceSwitch()`
- Updated confirmation message for internal mode:
  - Old: "Make an automatic backup to GitHub before switching"
  - New: "Restart the app immediately to load data from internal storage" + "Create an automatic backup to GitHub after restart"

### 4. Startup Backup Handler

**File:** `main.js` - Function `createWindow()`
- Added `win.webContents.once('did-finish-load')` handler
- Checks for `config.pendingBackupAndCleanup` flag
- If flag exists:
  1. Extracts pending task info (user, username, token, reason, scheduledAt)
  2. Verifies cloud database exists
  3. Performs backup:
     - Tries SmartBackupService first (delta backup)
     - Falls back to full backup if smart backup fails
  4. Uploads model config if exists
  5. Uploads metadata with backup info
  6. Deletes cloud user folder via `syncManager.deleteCloudUserFolder()`
  7. Clears `pendingBackupAndCleanup` flag from config
- Comprehensive error handling and logging
- Continues with cleanup even if backup fails

## Benefits

### User Experience
- **Instant Feedback**: Logout/switch completes in ~1 second instead of 5-10 seconds
- **Non-Blocking**: User sees immediate response instead of waiting for network operations
- **Background Processing**: Heavy operations happen invisibly after restart

### Technical
- **Separation of Concerns**: UI operations separate from data operations
- **Resilient**: Errors in backup don't block logout/switch
- **Auditable**: All operations logged with timestamps and reasons
- **Testable**: Each phase can be tested independently

## Testing Checklist

### Logout Flow
- [ ] Login with GitHub account
- [ ] Create some data in cloud mode
- [ ] Click logout - should restart in ~1 second
- [ ] Check logs for pending backup flag set
- [ ] After restart, check logs for backup completion
- [ ] Verify cloud user folder deleted
- [ ] Verify data still accessible in GitHub repository

### Data Source Switch Flow
- [ ] Start in cloud mode with data
- [ ] Switch to internal mode - should restart in ~1 second
- [ ] Check logs for pending backup flag set
- [ ] After restart, check logs for backup completion
- [ ] Verify cloud user folder deleted
- [ ] Verify data still accessible in GitHub repository

### Edge Cases
- [ ] Logout when no cloud data exists (backup should skip gracefully)
- [ ] Switch when backup fails (cleanup should still happen)
- [ ] Multiple rapid logout/switch attempts (should be prevented by button disable)
- [ ] App crash before backup completes (flag persists, will retry on next start)

## Monitoring

### Log Entries to Watch
```
STARTUP | pendingBackup | Processing pending backup and cleanup
STARTUP | pendingBackup | Starting backup to GitHub
STARTUP | pendingBackup | Smart backup completed successfully
STARTUP | pendingBackup | Backup completed, now cleaning up local data
STARTUP | pendingBackup | Cloud data deleted successfully
STARTUP | pendingBackup | Pending backup and cleanup completed
```

### Error Scenarios
```
STARTUP | pendingBackup | Database not found, skipping backup
STARTUP | pendingBackup | Backup failed, but will continue with cleanup
STARTUP | pendingBackup | Failed to delete cloud data
STARTUP | pendingBackup | Error processing pending backup
```

## Rollback Plan
If issues arise with deferred backup:
1. Revert `main.js` IPC handlers to immediate backup
2. Revert `renderer.js` functions to include backup code
3. Revert confirmation messages to old text
4. Remove `did-finish-load` handler from `createWindow()`
5. Remove `pendingBackupAndCleanup` flag handling

Git commits involved:
- Removed backup code from `performLogout()`
- Removed backup code from `executeDataSourceSwitch()`
- Added startup handler in `createWindow()`
- Modified `sync:logout` IPC handler
- Modified `sync:switchMode` IPC handler
- Updated confirmation messages

## Future Enhancements
- [ ] Show toast notification when background backup completes
- [ ] Add backup progress indicator in system tray
- [ ] Implement retry mechanism for failed backups
- [ ] Add user setting to disable automatic backup
- [ ] Track backup history in Action History section
