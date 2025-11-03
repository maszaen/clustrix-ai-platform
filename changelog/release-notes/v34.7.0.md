Changelog v34.7.0: **Database Schema Updates for Sync Support**

**Database Schema Enhancements:**
- Added sync-related columns to sessions table: `deleted`, `device_id`, `synced_at`, `hash`
- Added sync-related columns to messages table: `deleted`, `device_id`, `synced_at`, `sequence`, `updated_at`
- Improved migration logic with `ensureColumn()` helper function for backward compatibility
- Enhanced schema initialization with comprehensive column additions

**Error Handling Improvements:**
- Updated `sessions:save` IPC handler to throw errors instead of returning false
- Better error propagation for database operation failures
- Improved error logging and context in database operations

**Code Quality Improvements:**
- Reformatted SQL statements for better readability and consistency
- Removed temporary test files (`direct-test.js`, `link.test.js`) from renderer core
- Cleaned up unused test code and development artifacts

**Database Migration:**
- Automatic column addition for legacy databases during initialization
- Robust migration handling with proper error logging
- Support for incremental schema updates without data loss

**Code Quality:**
- Enhanced database schema documentation and comments
- Improved code formatting and SQL statement alignment
- Better separation of migration logic into reusable functions

**Statistics:**
- 4 files changed, 2 files removed
- ~80 lines added for schema enhancements
- ~40 lines removed (test files cleanup)
- Database schema expanded with 9 new columns across 2 tables

> **Status:** ✓ Production Ready | _Database Enhancement Release_