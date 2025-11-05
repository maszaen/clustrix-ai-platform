/**
 * Custom Auto-Updater for Clustrix
 *
 * This replaces electron-updater with a custom implementation that:
 * 1. Validates license keys via Vercel API
 * 2. Checks for updates from GitHub (via our API)
 * 3. Downloads updates with progress tracking
 * 4. Installs updates safely
 */

const { app } = require('electron');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const https = require('https');
const { spawn } = require('child_process');
const { log } = require('./logger');

class CustomUpdater {
  constructor(apiBaseUrl) {
    this.apiBaseUrl = apiBaseUrl || 'https://your-app.vercel.app/api';
    this.updateInfo = null;
    this.downloadPath = null;
    this.licenseKey = null;
    this.machineId = null;
    this.callbacks = {
      'checking-for-update': [],
      'update-available': [],
      'update-not-available': [],
      'download-progress': [],
      'update-downloaded': [],
      'error': []
    };
  }

  /**
   * Set license key for authentication
   */
  setLicenseKey(licenseKey) {
    this.licenseKey = licenseKey;
  }

  /**
   * Set machine ID for tracking
   */
  setMachineId(machineId) {
    this.machineId = machineId;
  }

  /**
   * Set API base URL
   */
  setApiBaseUrl(url) {
    this.apiBaseUrl = url;
  }

  /**
   * Register event listener
   */
  on(event, callback) {
    if (this.callbacks[event]) {
      this.callbacks[event].push(callback);
    }
  }

  /**
   * Emit event to all listeners
   */
  emit(event, data) {
    if (this.callbacks[event]) {
      this.callbacks[event].forEach(cb => {
        try {
          cb(data);
        } catch (err) {
          log('CUSTOM_UPDATER', 3, 'emit', 'Error in event callback', { event, error: err.message });
        }
      });
    }
  }

  /**
   * Check for updates
   */
  async checkForUpdates() {
    log('CUSTOM_UPDATER', 1, 'checkForUpdates', 'Checking for updates');
    this.emit('checking-for-update');

    if (!this.licenseKey) {
      const error = new Error('License key not set. Please activate your license first.');
      this.emit('error', error);
      throw error;
    }

    try {
      const currentVersion = app.getVersion();

      const response = await fetch(`${this.apiBaseUrl}/check-update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          licenseKey: this.licenseKey,
          currentVersion,
          machineId: this.machineId || 'unknown'
        })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to check for updates');
      }

      if (!data.updateAvailable) {
        log('CUSTOM_UPDATER', 1, 'checkForUpdates', 'No updates available');
        this.emit('update-not-available', { version: currentVersion });
        return { updateInfo: null };
      }

      // Update available
      this.updateInfo = {
        version: data.version,
        releaseNotes: data.releaseNotes,
        downloadUrl: data.downloadUrl,
        size: data.size,
        fileName: data.fileName,
        publishedAt: data.publishedAt,
        expiresIn: data.expiresIn
      };

      log('CUSTOM_UPDATER', 1, 'checkForUpdates', 'Update available', {
        version: data.version,
        size: data.size
      });

      this.emit('update-available', this.updateInfo);

      return { updateInfo: this.updateInfo };

    } catch (error) {
      log('CUSTOM_UPDATER', 3, 'checkForUpdates', 'Error checking for updates', {
        error: error.message
      });
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Download update
   */
  async downloadUpdate() {
    if (!this.updateInfo || !this.updateInfo.downloadUrl) {
      throw new Error('No update available to download');
    }

    log('CUSTOM_UPDATER', 1, 'downloadUpdate', 'Starting download', {
      version: this.updateInfo.version,
      size: this.updateInfo.size
    });

    try {
      // Create temp download path
      const tempDir = app.getPath('temp');
      const fileName = this.updateInfo.fileName || `Clustrix-Setup-${this.updateInfo.version}.exe`;
      this.downloadPath = path.join(tempDir, fileName);

      // Download file with progress tracking
      await this.downloadFileWithProgress(this.updateInfo.downloadUrl, this.downloadPath);

      log('CUSTOM_UPDATER', 1, 'downloadUpdate', 'Download completed', {
        path: this.downloadPath
      });

      this.emit('update-downloaded', {
        version: this.updateInfo.version,
        path: this.downloadPath
      });

      return { downloadPath: this.downloadPath };

    } catch (error) {
      log('CUSTOM_UPDATER', 3, 'downloadUpdate', 'Error downloading update', {
        error: error.message
      });
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Download file with progress tracking
   */
  downloadFileWithProgress(url, destPath) {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(destPath);
      let downloadedBytes = 0;
      let totalBytes = 0;
      let lastProgressTime = Date.now();
      let lastDownloadedBytes = 0;

      const request = https.get(url, (response) => {
        // Handle redirects
        if (response.statusCode === 301 || response.statusCode === 302) {
          file.close();
          fs.unlinkSync(destPath);
          return this.downloadFileWithProgress(response.headers.location, destPath)
            .then(resolve)
            .catch(reject);
        }

        if (response.statusCode !== 200) {
          file.close();
          fs.unlinkSync(destPath);
          return reject(new Error(`Download failed with status code: ${response.statusCode}`));
        }

        totalBytes = parseInt(response.headers['content-length'], 10);

        response.on('data', (chunk) => {
          downloadedBytes += chunk.length;

          // Emit progress every 500ms
          const now = Date.now();
          if (now - lastProgressTime > 500) {
            const bytesPerSecond = (downloadedBytes - lastDownloadedBytes) / ((now - lastProgressTime) / 1000);
            const percent = (downloadedBytes / totalBytes) * 100;

            this.emit('download-progress', {
              percent,
              bytesPerSecond,
              transferred: downloadedBytes,
              total: totalBytes
            });

            lastProgressTime = now;
            lastDownloadedBytes = downloadedBytes;
          }
        });

        response.pipe(file);

        file.on('finish', () => {
          file.close();

          // Emit final progress
          this.emit('download-progress', {
            percent: 100,
            bytesPerSecond: 0,
            transferred: totalBytes,
            total: totalBytes
          });

          resolve();
        });
      });

      request.on('error', (err) => {
        file.close();
        fs.unlink(destPath, () => {}); // Delete the file
        reject(err);
      });

      file.on('error', (err) => {
        file.close();
        fs.unlink(destPath, () => {});
        reject(err);
      });
    });
  }

  /**
   * Install update and quit
   */
  quitAndInstall(isSilent = false, isForceRunAfter = true) {
    if (!this.downloadPath || !fs.existsSync(this.downloadPath)) {
      throw new Error('No update downloaded');
    }

    log('CUSTOM_UPDATER', 1, 'quitAndInstall', 'Installing update', {
      path: this.downloadPath,
      silent: isSilent
    });

    try {
      // Launch installer
      const installerArgs = isSilent ? ['/S'] : [];

      spawn(this.downloadPath, installerArgs, {
        detached: true,
        stdio: 'ignore'
      });

      // Quit app
      setTimeout(() => {
        app.quit();
      }, 1000);

    } catch (error) {
      log('CUSTOM_UPDATER', 3, 'quitAndInstall', 'Error launching installer', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Validate license key
   */
  async validateLicense(licenseKey) {
    try {
      const response = await fetch(`${this.apiBaseUrl}/validate-license`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          licenseKey,
          machineId: this.machineId || 'unknown'
        })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to validate license');
      }

      return data;

    } catch (error) {
      log('CUSTOM_UPDATER', 3, 'validateLicense', 'Error validating license', {
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = { CustomUpdater };
