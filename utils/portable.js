/**
 * Portable mode detection and path utilities
 * Enables running Clustrix from USB/portable folder without installation
 */

const path = require('path');
const fs = require('fs');
const { app } = require('electron');

let _isPortable = null;
let _portableDataPath = null;

/**
 * Check if running in portable mode
 * Portable mode is detected when a 'data' folder exists next to the executable
 */
function isPortableMode() {
  if (_isPortable !== null) return _isPortable;
  
  try {
    const exeDir = path.dirname(process.execPath);
    const portableDataDir = path.join(exeDir, 'data');
    _isPortable = fs.existsSync(portableDataDir);
    
    if (_isPortable) {
      _portableDataPath = portableDataDir;
      console.log('[PORTABLE] Running in portable mode, data path:', _portableDataPath);
    }
  } catch (err) {
    _isPortable = false;
  }
  
  return _isPortable;
}

/**
 * Get the data directory path based on mode
 * - Portable: ./data/ (next to exe)
 * - Installed: %APPDATA%/clustrix/
 */
function getDataPath() {
  if (isPortableMode()) {
    return _portableDataPath;
  }
  return app.getPath('userData');
}

/**
 * Get database directory path
 */
function getDatabasePath() {
  return path.join(getDataPath(), 'database');
}

/**
 * Get log file path
 */
function getLogPath() {
  return path.join(getDataPath(), 'app.log');
}

/**
 * Get config file path (sync-config.json, etc)
 */
function getConfigPath(filename) {
  return path.join(getDataPath(), filename);
}

/**
 * Ensure data directories exist
 */
function ensureDataDirectories() {
  const dataPath = getDataPath();
  const dbPath = getDatabasePath();
  const internalDbPath = path.join(dbPath, 'internal');
  
  [dataPath, dbPath, internalDbPath].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

module.exports = {
  isPortableMode,
  getDataPath,
  getDatabasePath,
  getLogPath,
  getConfigPath,
  ensureDataDirectories
};
