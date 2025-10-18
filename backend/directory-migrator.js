const fs = require('fs');
const path = require('path');
const { log } = require('../utils/logger');

/**
 * DirectoryMigrator
 * 
 * Handles migration from old directory structure to new structure:
 * OLD: userData/clustrix.db, userData/ai-model.conf.json
 * NEW: userData/database/internal/clustrix.db, userData/database/internal/ai-model.conf.json
 * 
 * Safe migration with backup:
 * 1. Check if old files exist
 * 2. Ensure new directories exist
 * 3. Copy old files to new location (backup)
 * 4. Optionally clean up old files (marked as .bak for safety)
 */
class DirectoryMigrator {
  constructor(app, syncManager) {
    this.app = app;
    this.syncManager = syncManager;
    this.userDataRoot = app.getPath('userData');
    this.migrationMarkerPath = path.join(
      this.syncManager.internalDbDir,
      '.migrated'
    );
  }

  /**
   * Run migration on app startup
   * Safe: copies files, doesn't delete original
   * Only deletes if cleanup is explicitly called
   */
  async runMigration() {
    try {
      log('MIGRATION', 1, 'runMigration', 'Starting directory reorganization migration');

      // Ensure new directory structure exists
      this.syncManager.ensureDirectories();

      // Check if already migrated
      if (this._isMigrationComplete()) {
        log('MIGRATION', 2, 'runMigration', 'Migration already completed, skipping');
        return { migrated: false, reason: 'already_done' };
      }

      let migrationNeeded = false;
      const results = {
        migrated: false,
        database: null,
        modelConfig: null,
        errors: []
      };

      // Move database to internal folder
      const oldDbPath = path.join(this.userDataRoot, 'clustrix.db');
      const newDbPath = path.join(this.syncManager.internalDbDir, 'clustrix.db');

      if (fs.existsSync(oldDbPath) && !fs.existsSync(newDbPath)) {
        try {
          fs.copyFileSync(oldDbPath, newDbPath);
          log('MIGRATION', 1, 'runMigration', 'Copied database to internal directory', {
            from: oldDbPath,
            to: newDbPath
          });
          results.database = 'migrated';
          migrationNeeded = true;
        } catch (e) {
          log('MIGRATION', 4, 'runMigration', 'Failed to copy database', {
            error: e.message
          });
          results.errors.push({
            file: 'clustrix.db',
            error: e.message
          });
        }
      }

      // Move model config to internal folder
      const oldConfigPath = path.join(this.userDataRoot, 'ai-model.conf.json');
      const newConfigPath = path.join(
        this.syncManager.internalDbDir,
        'ai-model.conf.json'
      );

      if (fs.existsSync(oldConfigPath) && !fs.existsSync(newConfigPath)) {
        try {
          fs.copyFileSync(oldConfigPath, newConfigPath);
          log('MIGRATION', 1, 'runMigration', 'Copied model config to internal directory', {
            from: oldConfigPath,
            to: newConfigPath
          });
          results.modelConfig = 'migrated';
          migrationNeeded = true;
        } catch (e) {
          log('MIGRATION', 4, 'runMigration', 'Failed to copy model config', {
            error: e.message
          });
          results.errors.push({
            file: 'ai-model.conf.json',
            error: e.message
          });
        }
      }

      // Create initial sync-config.json if it doesn't exist
      try {
        if (!fs.existsSync(this.syncManager.syncConfigPath)) {
          const defaultConfig = this.syncManager.getDefaultSyncConfig();
          this.syncManager.saveSyncConfig(defaultConfig);
          log('MIGRATION', 1, 'runMigration', 'Created initial sync-config.json');
        }
      } catch (e) {
        log('MIGRATION', 4, 'runMigration', 'Failed to create sync-config.json', {
          error: e.message
        });
        results.errors.push({
          file: 'sync-config.json',
          error: e.message
        });
      }

      if (migrationNeeded) {
        // Mark migration as complete
        this._markMigrationComplete();
        results.migrated = true;

        log('MIGRATION', 1, 'runMigration', 'Directory reorganization completed successfully', {
          database: results.database,
          modelConfig: results.modelConfig
        });
      } else {
        log('MIGRATION', 2, 'runMigration', 'No migration needed - directory already organized');
      }

      return results;
    } catch (e) {
      log('MIGRATION', 4, 'runMigration', 'Migration failed with fatal error', {
        error: e.message,
        stack: e.stack
      });
      throw e;
    }
  }

  /**
   * Cleanup old files after migration (separate call, not automatic)
   * Creates backups with .bak extension before deletion
   * Should only be called after confirming migration success
   */
  cleanupOldFiles() {
    try {
      log('MIGRATION', 1, 'cleanupOldFiles', 'Starting cleanup of old files');

      const filesToClean = [
        path.join(this.userDataRoot, 'clustrix.db'),
        path.join(this.userDataRoot, 'ai-model.conf.json'),
        path.join(this.userDataRoot, 'chat_data.json'), // legacy JSON
        path.join(this.userDataRoot, 'artifacts.json'), // legacy JSON
        path.join(this.userDataRoot, 'projects.json') // legacy JSON
      ];

      const results = {
        cleaned: [],
        errors: [],
        backedUp: []
      };

      for (const file of filesToClean) {
        if (fs.existsSync(file)) {
          try {
            // Create backup with .bak extension
            const backupPath = file + '.bak';
            if (!fs.existsSync(backupPath)) {
              fs.copyFileSync(file, backupPath);
              results.backedUp.push(backupPath);
            }

            // Delete original file
            fs.unlinkSync(file);
            results.cleaned.push(file);

            log('MIGRATION', 1, 'cleanupOldFiles', `Cleaned: ${path.basename(file)}`, {
              original: file,
              backup: backupPath
            });
          } catch (e) {
            log('MIGRATION', 4, 'cleanupOldFiles', `Failed to clean: ${path.basename(file)}`, {
              error: e.message
            });
            results.errors.push({
              file: file,
              error: e.message
            });
          }
        }
      }

      log('MIGRATION', 1, 'cleanupOldFiles', 'Cleanup completed', {
        cleaned: results.cleaned.length,
        errors: results.errors.length,
        backedUp: results.backedUp.length
      });

      return results;
    } catch (e) {
      log('MIGRATION', 4, 'cleanupOldFiles', 'Cleanup failed with fatal error', {
        error: e.message,
        stack: e.stack
      });
      throw e;
    }
  }

  /**
   * Check if migration is already complete
   * Looks for .migrated marker file in internal directory
   */
  _isMigrationComplete() {
    try {
      if (fs.existsSync(this.migrationMarkerPath)) {
        const marker = fs.readFileSync(this.migrationMarkerPath, 'utf-8');
        const data = JSON.parse(marker);
        return data && data.timestamp && data.version;
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  /**
   * Mark migration as complete by creating marker file
   */
  _markMigrationComplete() {
    try {
      const marker = {
        timestamp: Date.now(),
        version: '1.0',
        migratedAt: new Date().toISOString()
      };
      fs.writeFileSync(
        this.migrationMarkerPath,
        JSON.stringify(marker, null, 2),
        'utf-8'
      );
      log('MIGRATION', 1, '_markMigrationComplete', 'Migration marked as complete');
    } catch (e) {
      log('MIGRATION', 4, '_markMigrationComplete', 'Failed to mark migration', {
        error: e.message
      });
    }
  }

  /**
   * Verify migration integrity
   * Checks if all expected files exist in new location
   */
  verifyMigration() {
    try {
      const internalDir = this.syncManager.internalDbDir;
      const dbPath = path.join(internalDir, 'clustrix.db');
      const configPath = path.join(internalDir, 'ai-model.conf.json');
      const syncConfigPath = this.syncManager.syncConfigPath;

      const results = {
        valid: false,
        checks: {
          internalDirExists: fs.existsSync(internalDir),
          dbFileExists: fs.existsSync(dbPath),
          configFileExists: fs.existsSync(configPath),
          syncConfigExists: fs.existsSync(syncConfigPath)
        },
        sizes: {
          dbFileSize: fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0,
          configFileSize: fs.existsSync(configPath) ? fs.statSync(configPath).size : 0
        }
      };

      // Valid if at least internal dir exists and marker is present
      results.valid = results.checks.internalDirExists && this._isMigrationComplete();

      log('MIGRATION', 1, 'verifyMigration', 'Migration verification completed', results);

      return results;
    } catch (e) {
      log('MIGRATION', 4, 'verifyMigration', 'Verification failed', {
        error: e.message
      });
      return {
        valid: false,
        error: e.message
      };
    }
  }

  /**
   * Rollback migration (restore old directory structure)
   * Restores from .bak files if available
   */
  rollback() {
    try {
      log('MIGRATION', 1, 'rollback', 'Starting migration rollback');

      const filesToRestore = [
        'clustrix.db',
        'ai-model.conf.json',
        'chat_data.json',
        'artifacts.json',
        'projects.json'
      ];

      const results = {
        restored: [],
        errors: []
      };

      for (const filename of filesToRestore) {
        const bakPath = path.join(this.userDataRoot, filename + '.bak');
        const originalPath = path.join(this.userDataRoot, filename);

        if (fs.existsSync(bakPath)) {
          try {
            fs.copyFileSync(bakPath, originalPath);
            results.restored.push(filename);

            log('MIGRATION', 1, 'rollback', `Restored: ${filename}`, {
              from: bakPath,
              to: originalPath
            });
          } catch (e) {
            log('MIGRATION', 4, 'rollback', `Failed to restore: ${filename}`, {
              error: e.message
            });
            results.errors.push({
              file: filename,
              error: e.message
            });
          }
        }
      }

      // Remove migration marker
      if (fs.existsSync(this.migrationMarkerPath)) {
        fs.unlinkSync(this.migrationMarkerPath);
      }

      log('MIGRATION', 1, 'rollback', 'Rollback completed', {
        restored: results.restored.length,
        errors: results.errors.length
      });

      return results;
    } catch (e) {
      log('MIGRATION', 4, 'rollback', 'Rollback failed', {
        error: e.message,
        stack: e.stack
      });
      throw e;
    }
  }
}

module.exports = DirectoryMigrator;
