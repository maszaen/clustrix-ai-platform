const path = require('path');
const fs = require('fs');

/**
 * Get the path to ripgrep (rg) executable
 * Returns bundled binary in production, system PATH in development
 * @returns {string|null} Path to rg executable or null if not found
 */
function getRipgrepPath() {
  // In production (packaged app), use bundled binary
  if (process.env.NODE_ENV === 'production' || process.resourcesPath) {
    try {
      const bundledPath = path.join(process.resourcesPath || path.join(__dirname, '..', 'resources'), 'bin', 'rg.exe');
      if (fs.existsSync(bundledPath)) {
        return bundledPath;
      }
    } catch (error) {
      // Fall through to system PATH
    }
  }

  // Check for bundled binary in development
  try {
    const devBundledPath = path.join(__dirname, '..', 'resources', 'bin', 'rg.exe');
    if (fs.existsSync(devBundledPath)) {
      return devBundledPath;
    }
  } catch (error) {
    // Fall through to system PATH
  }

  // In development or if bundled binary not found, use system PATH
  return 'rg';
}

module.exports = {
  getRipgrepPath
};