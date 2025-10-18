const path = require('path');
const fs = require('fs');
const { log } = require('../utils/logger');

/**
 * SyncManager
 * 
 * Manages:
 * - Directory structure for internal vs cloud-synced data
 * - Sync configuration (sync-config.json)
 * - Cloud user folder creation/deletion
 * - Path generation for internal and per-account cloud storage
 */
class SyncManager {
  constructor(app) {
    this.app = app;
    this.userDataRoot = app.getPath('userData');
    this.databaseRoot = path.join(this.userDataRoot, 'database');
    this.internalDbDir = path.join(this.databaseRoot, 'internal');
    this.syncDbRoot = path.join(this.databaseRoot, 'sync');
    this.syncConfigPath = path.join(this.userDataRoot, 'sync-config.json');
    
    log('SYNC', 1, 'constructor', 'SyncManager initialized', {
      userDataRoot: this.userDataRoot,
      databaseRoot: this.databaseRoot,
      internalDbDir: this.internalDbDir,
      syncDbRoot: this.syncDbRoot
    });
  }

  /**
   * Ensure all required directories exist
   * Called on app startup before database initialization
   */
  ensureDirectories() {
    try {
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
      
      return true;
    } catch (e) {
      log('SYNC', 4, 'ensureDirectories', 'Failed to ensure directories', {
        error: e.message,
        stack: e.stack
      });
      throw e;
    }
  }

  /**
   * Get path to internal database directory
   * Returns: userData/database/internal/
   */
  getInternalDataPath() {
    return this.internalDbDir;
  }

  /**
   * Get path to cloud database directory for a specific user
   * Returns: userData/database/sync/<username>/
   */
  getCloudDataPath(username) {
    if (!username || typeof username !== 'string') {
      throw new Error('Username must be a non-empty string');
    }
    const cloudPath = path.join(this.syncDbRoot, username);
    return cloudPath;
  }

  /**
   * Create cloud user folder structure
   * Creates: userData/database/sync/<username>/
   */
  createCloudUserFolder(username) {
    try {
      if (!username || typeof username !== 'string') {
        throw new Error('Username must be a non-empty string');
      }

      const cloudPath = this.getCloudDataPath(username);
      
      if (!fs.existsSync(cloudPath)) {
        fs.mkdirSync(cloudPath, { recursive: true });
        log('SYNC', 1, 'createCloudUserFolder', `Created cloud folder for ${username}: ${cloudPath}`);
      } else {
        log('SYNC', 2, 'createCloudUserFolder', `Cloud folder already exists for ${username}`);
      }
      
      return cloudPath;
    } catch (e) {
      log('SYNC', 4, 'createCloudUserFolder', `Failed to create cloud folder for ${username}`, {
        error: e.message,
        stack: e.stack
      });
      throw e;
    }
  }

  /**
   * Delete cloud user folder and all its contents
   * Called on logout or account switch
   */
  deleteCloudUserFolder(username) {
    try {
      if (!username || typeof username !== 'string') {
        throw new Error('Username must be a non-empty string');
      }

      const cloudPath = this.getCloudDataPath(username);
      
      if (fs.existsSync(cloudPath)) {
        // Recursively delete all files and subdirectories
        this._recursiveDelete(cloudPath);
        log('SYNC', 1, 'deleteCloudUserFolder', `Deleted cloud folder for ${username}: ${cloudPath}`);
        return true;
      } else {
        log('SYNC', 2, 'deleteCloudUserFolder', `Cloud folder does not exist for ${username}`);
        return false;
      }
    } catch (e) {
      log('SYNC', 4, 'deleteCloudUserFolder', `Failed to delete cloud folder for ${username}`, {
        error: e.message,
        stack: e.stack
      });
      throw e;
    }
  }

  /**
   * Helper: Recursively delete directory and contents
   */
  _recursiveDelete(dirPath) {
    if (fs.existsSync(dirPath)) {
      fs.readdirSync(dirPath).forEach(file => {
        const curPath = path.join(dirPath, file);
        if (fs.lstatSync(curPath).isDirectory()) {
          this._recursiveDelete(curPath);
        } else {
          fs.unlinkSync(curPath);
        }
      });
      fs.rmdirSync(dirPath);
    }
  }

  /**
   * Load sync configuration from sync-config.json
   * Returns default config if file doesn't exist or is invalid
   */
  loadSyncConfig() {
    try {
      if (!fs.existsSync(this.syncConfigPath)) {
        log('SYNC', 2, 'loadSyncConfig', 'sync-config.json does not exist, returning default');
        return this.getDefaultSyncConfig();
      }
      
      const raw = fs.readFileSync(this.syncConfigPath, 'utf-8');
      const config = JSON.parse(raw);
      
      if (config && typeof config === 'object') {
        log('SYNC', 1, 'loadSyncConfig', 'Sync config loaded', {
          currentMode: config.currentMode,
          currentCloudUser: config.currentCloudUser ? '***' : null
        });
        return config;
      } else {
        log('SYNC', 2, 'loadSyncConfig', 'Invalid config format, returning default');
        return this.getDefaultSyncConfig();
      }
    } catch (e) {
      log('SYNC', 4, 'loadSyncConfig', 'Failed to load sync-config.json', {
        error: e.message,
        stack: e.stack
      });
      return this.getDefaultSyncConfig();
    }
  }

  /**
   * Save sync configuration to sync-config.json
   */
  saveSyncConfig(config) {
    try {
      if (!config || typeof config !== 'object') {
        throw new Error('Config must be a valid object');
      }

      // Validate required fields
      if (!('currentMode' in config) || !('currentCloudUser' in config)) {
        throw new Error('Config missing required fields: currentMode, currentCloudUser');
      }

      fs.writeFileSync(this.syncConfigPath, JSON.stringify(config, null, 2), 'utf-8');
      
      log('SYNC', 1, 'saveSyncConfig', 'Sync config saved', {
        mode: config.currentMode,
        user: config.currentCloudUser ? '***' : null
      });
      
      return true;
    } catch (e) {
      log('SYNC', 4, 'saveSyncConfig', 'Failed to save sync-config.json', {
        error: e.message,
        stack: e.stack
      });
      throw e;
    }
  }

  /**
   * Get default sync configuration
   * Used when creating new config or on error
   */
  getDefaultSyncConfig() {
    return {
      currentMode: 'internal',           // 'internal' | 'cloud'
      currentCloudUser: null,            // 'user@gmail.com' | null
      cloudToken: null,                  // encrypted access token for OAuth
      cloudTokenExpiry: null,            // timestamp when token expires
      lastSyncTime: null,                // timestamp of last sync operation
      createdAt: Date.now(),
      version: '1.0'
    };
  }

  /**
   * Check if cloud token is still valid
   */
  isTokenValid(config) {
    if (!config || !config.cloudToken || !config.cloudTokenExpiry) {
      return false;
    }
    return config.cloudTokenExpiry > Date.now();
  }

  /**
   * Get current data source path based on sync config
   * Returns path to internal or cloud directory
   */
  getCurrentDataPath() {
    try {
      const config = this.loadSyncConfig();
      
      if (config.currentMode === 'cloud' && config.currentCloudUser) {
        const cloudPath = this.getCloudDataPath(config.currentCloudUser);
        log('SYNC', 2, 'getCurrentDataPath', 'Using cloud data path', {
          user: '***',
          path: cloudPath
        });
        return cloudPath;
      } else {
        log('SYNC', 2, 'getCurrentDataPath', 'Using internal data path', {
          path: this.internalDbDir
        });
        return this.internalDbDir;
      }
    } catch (e) {
      log('SYNC', 4, 'getCurrentDataPath', 'Error getting current data path, defaulting to internal', {
        error: e.message
      });
      return this.internalDbDir;
    }
  }

  /**
   * List all cloud user folders
   * Returns array of usernames that have local cloud data
   */
  listCloudUsers() {
    try {
      if (!fs.existsSync(this.syncDbRoot)) {
        return [];
      }

      const users = fs.readdirSync(this.syncDbRoot)
        .filter(item => {
          const itemPath = path.join(this.syncDbRoot, item);
          return fs.statSync(itemPath).isDirectory();
        });

      log('SYNC', 1, 'listCloudUsers', `Found ${users.length} cloud users`);
      return users;
    } catch (e) {
      log('SYNC', 4, 'listCloudUsers', 'Failed to list cloud users', {
        error: e.message
      });
      return [];
    }
  }

  /**
   * Get size of data in a directory (recursive)
   * Used for backup/sync size estimation
   */
  getDirectorySize(dirPath) {
    try {
      let size = 0;

      const walk = (dir) => {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          const filePath = path.join(dir, file);
          const stat = fs.statSync(filePath);
          if (stat.isDirectory()) {
            size += walk(filePath);
          } else {
            size += stat.size;
          }
        }
      };

      if (fs.existsSync(dirPath)) {
        walk(dirPath);
      }

      return size;
    } catch (e) {
      log('SYNC', 4, 'getDirectorySize', 'Failed to calculate directory size', {
        error: e.message
      });
      return 0;
    }
  }
}

module.exports = SyncManager;
