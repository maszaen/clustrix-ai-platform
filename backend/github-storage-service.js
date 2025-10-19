const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class GitHubStorageService {
  constructor(accessToken, username) {
    this.accessToken = accessToken;
    this.username = username;
    this.repoName = `clustrix-sync-${username}`;
    this.owner = username;
  }
  
  /**
   * Calculate SHA256 checksum of a file
   * 
   * @param {string} filePath - Path to file
   * @returns {string} SHA256 hash (hex)
   */
  calculateChecksum(filePath) {
    const fileBuffer = fs.readFileSync(filePath);
    const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    
    console.log('[GitHub Storage] Checksum calculated:', {
      file: path.basename(filePath),
      checksum: hash.substring(0, 16) + '...',
      size: fileBuffer.length
    });
    
    return hash;
  }

  /**
   * Create private repo if not exists
   */
  async ensureRepoExists() {
    console.log('[GitHub Storage] Checking if repo exists:', this.repoName);

    try {
      // Try to get repo info
      const repo = await this.getRepoInfo();
      console.log('[GitHub Storage] Repo exists:', this.repoName);
      return repo;
    } catch (err) {
      if (err.message.includes('404')) {
        // Repo doesn't exist, create it
        console.log('[GitHub Storage] Repo not found, creating:', this.repoName);
        return await this.createRepo();
      }
      throw err;
    }
  }

  async createRepo() {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify({
        name: this.repoName,
        description: 'Clustrix AI Platform - Sync & Backup Repository',
        private: true,
        auto_init: true,
      });

      const options = {
        hostname: 'api.github.com',
        path: '/user/repos',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'User-Agent': 'Clustrix-AI',
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      };

      const req = https.request(options, (res) => {
        let responseData = '';

        res.on('data', (chunk) => {
          responseData += chunk;
        });

        res.on('end', () => {
          try {
            const result = JSON.parse(responseData);

            if (res.statusCode >= 400) {
              console.log('[GitHub Storage] Repo creation error:', result.message);
              reject(new Error(result.message));
            } else {
              console.log('[GitHub Storage] Repo created successfully');
              resolve(result);
            }
          } catch (err) {
            reject(new Error('Failed to parse repo creation response: ' + err.message));
          }
        });
      });

      req.on('error', (err) => {
        console.log('[GitHub Storage] Request error:', err.message);
        reject(err);
      });

      req.write(data);
      req.end();
    });
  }

  async getRepoInfo() {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.github.com',
        path: `/repos/${this.owner}/${this.repoName}`,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'User-Agent': 'Clustrix-AI',
          'Accept': 'application/vnd.github.v3+json',
        },
      };

      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const result = JSON.parse(data);

            if (res.statusCode >= 400) {
              reject(new Error(`${res.statusCode}: ${result.message}`));
            } else {
              resolve(result);
            }
          } catch (err) {
            reject(new Error('Failed to parse repo info: ' + err.message));
          }
        });
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.end();
    });
  }

  /**
   * Upload database file to GitHub repo
   * Creates/updates file: clustrix.db (base64 encoded)
   */
  async uploadDatabase(dbPath) {
    console.log('[GitHub Storage] Uploading database:', dbPath);

    try {
      // Calculate checksum before upload
      const checksumBefore = this.calculateChecksum(dbPath);
      
      const fileContent = fs.readFileSync(dbPath);
      const base64Content = fileContent.toString('base64');

      // Get current file SHA if exists
      let fileSha = null;
      try {
        const fileInfo = await this.getFileInfo('clustrix.db');
        fileSha = fileInfo.sha;
        console.log('[GitHub Storage] Existing file SHA:', fileSha);
      } catch (err) {
        console.log('[GitHub Storage] File does not exist yet, will create new');
      }

      // Upload/update file
      const uploadData = JSON.stringify({
        message: `Backup: ${new Date().toISOString()}`,
        content: base64Content,
        sha: fileSha || undefined,
      });

      const uploadResult = await new Promise((resolve, reject) => {
        const options = {
          hostname: 'api.github.com',
          path: `/repos/${this.owner}/${this.repoName}/contents/clustrix.db`,
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'User-Agent': 'Clustrix-AI',
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(uploadData),
          },
        };

        const req = https.request(options, (res) => {
          let responseData = '';

          res.on('data', (chunk) => {
            responseData += chunk;
          });

          res.on('end', () => {
            try {
              const result = JSON.parse(responseData);

              if (res.statusCode >= 400) {
                console.log('[GitHub Storage] Upload error:', result.message);
                reject(new Error(result.message));
              } else {
                console.log('[GitHub Storage] Database uploaded successfully');
                resolve(result);
              }
            } catch (err) {
              reject(new Error('Failed to parse upload response: ' + err.message));
            }
          });
        });

        req.on('error', (err) => {
          console.log('[GitHub Storage] Request error:', err.message);
          reject(err);
        });

        req.write(uploadData);
        req.end();
      });
      
      // Store checksum in metadata
      try {
        const metadata = {
          lastBackup: new Date().toISOString(),
          checksum: checksumBefore,
          size: fileContent.length
        };
        await this.uploadMetadata(metadata);
        console.log('[GitHub Storage] Checksum stored in metadata:', checksumBefore.substring(0, 16) + '...');
      } catch (metadataErr) {
        console.log('[GitHub Storage] Warning: Failed to store metadata:', metadataErr.message);
        // Non-critical error, continue
      }
      
      return uploadResult;
      
    } catch (err) {
      console.log('[GitHub Storage] Upload failed:', err.message);
      throw err;
    }
  }

  /**
   * Download database from GitHub repo
   */
  async downloadDatabase(outputPath) {
    console.log('[GitHub Storage] Downloading database to:', outputPath);

    try {
      const fileInfo = await this.getFileInfo('clustrix.db');
      
      if (!fileInfo.content) {
        throw new Error('File content not available');
      }

      // Decode base64 content
      const buffer = Buffer.from(fileInfo.content, 'base64');
      
      // Ensure directory exists
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Write file
      fs.writeFileSync(outputPath, buffer);
      console.log('[GitHub Storage] Database downloaded successfully');
      
      // Verify checksum
      const checksumAfter = this.calculateChecksum(outputPath);
      
      try {
        const metadata = await this.getFileInfo('metadata.json');
        if (metadata.content) {
          const metadataObj = JSON.parse(Buffer.from(metadata.content, 'base64').toString('utf8'));
          
          if (metadataObj.checksum && metadataObj.checksum !== checksumAfter) {
            // Checksum mismatch - delete corrupted file
            fs.unlinkSync(outputPath);
            throw new Error('Checksum mismatch - download corrupted. Expected: ' + 
              metadataObj.checksum.substring(0, 16) + '..., Got: ' + 
              checksumAfter.substring(0, 16) + '...');
          }
          
          console.log('[GitHub Storage] Checksum verified:', checksumAfter.substring(0, 16) + '...');
        }
      } catch (metadataErr) {
        if (!metadataErr.message.includes('Checksum mismatch')) {
          console.log('[GitHub Storage] Warning: Could not verify checksum (metadata not available):', metadataErr.message);
          // Non-critical if metadata doesn't exist yet
        } else {
          throw metadataErr; // Re-throw checksum errors
        }
      }

      return { success: true, path: outputPath };
    } catch (err) {
      console.log('[GitHub Storage] Download failed:', err.message);
      throw err;
    }
  }

  /**
   * Upload AI model config to GitHub repo
   * Creates/updates file: ai-model.conf.json (base64 encoded)
   */
  async uploadModelConfig(configPath) {
    console.log('[GitHub Storage] Uploading model config:', configPath);

    try {
      if (!fs.existsSync(configPath)) {
        console.log('[GitHub Storage] Model config file not found, skipping upload');
        return { success: true, skipped: true };
      }

      const fileContent = fs.readFileSync(configPath, 'utf-8');
      const base64Content = Buffer.from(fileContent).toString('base64');

      // Get current file SHA if exists
      let fileSha = null;
      try {
        const fileInfo = await this.getFileInfo('ai-model.conf.json');
        fileSha = fileInfo.sha;
        console.log('[GitHub Storage] Existing model config SHA:', fileSha);
      } catch (err) {
        console.log('[GitHub Storage] Model config does not exist yet, will create new');
      }

      // Upload/update file
      const uploadData = JSON.stringify({
        message: `Model config backup: ${new Date().toISOString()}`,
        content: base64Content,
        sha: fileSha || undefined,
      });

      return new Promise((resolve, reject) => {
        const options = {
          hostname: 'api.github.com',
          path: `/repos/${this.owner}/${this.repoName}/contents/ai-model.conf.json`,
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'User-Agent': 'Clustrix-AI',
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(uploadData),
          },
        };

        const req = https.request(options, (res) => {
          let responseData = '';

          res.on('data', (chunk) => {
            responseData += chunk;
          });

          res.on('end', () => {
            if (res.statusCode === 200 || res.statusCode === 201) {
              console.log('[GitHub Storage] Model config uploaded successfully');
              resolve({ success: true });
            } else {
              console.log('[GitHub Storage] Model config upload failed:', res.statusCode, responseData);
              reject(new Error(`Upload failed: ${res.statusCode} - ${responseData}`));
            }
          });
        });

        req.on('error', (err) => {
          console.log('[GitHub Storage] Request error:', err.message);
          reject(err);
        });

        req.write(uploadData);
        req.end();
      });
    } catch (err) {
      console.log('[GitHub Storage] Model config upload failed:', err.message);
      throw err;
    }
  }

  /**
   * Download AI model config from GitHub repo
   */
  async downloadModelConfig(outputPath) {
    console.log('[GitHub Storage] Downloading model config to:', outputPath);

    try {
      const fileInfo = await this.getFileInfo('ai-model.conf.json');
      
      if (!fileInfo.content) {
        throw new Error('File content not available');
      }

      // Decode base64 content
      const buffer = Buffer.from(fileInfo.content, 'base64');
      
      // Ensure directory exists
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Write file
      fs.writeFileSync(outputPath, buffer);
      console.log('[GitHub Storage] Model config downloaded successfully');

      return { success: true, path: outputPath };
    } catch (err) {
      console.log('[GitHub Storage] Model config download failed:', err.message);
      throw err;
    }
  }

  async getFileInfo(filePath) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.github.com',
        path: `/repos/${this.owner}/${this.repoName}/contents/${filePath}`,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'User-Agent': 'Clustrix-AI',
          'Accept': 'application/vnd.github.v3+json',
        },
      };

      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const result = JSON.parse(data);

            if (res.statusCode >= 400) {
              reject(new Error(`${res.statusCode}: ${result.message}`));
            } else {
              resolve(result);
            }
          } catch (err) {
            reject(new Error('Failed to parse file info: ' + err.message));
          }
        });
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.end();
    });
  }

  /**
   * Upload metadata file (timestamp, version)
   */
  async uploadMetadata(metadata) {
    console.log('[GitHub Storage] Uploading metadata');

    const metadataContent = JSON.stringify(metadata, null, 2);
    const base64Content = Buffer.from(metadataContent).toString('base64');

    // Get current file SHA if exists
    let fileSha = null;
    try {
      const fileInfo = await this.getFileInfo('metadata.json');
      fileSha = fileInfo.sha;
    } catch (err) {
      // File doesn't exist yet
    }

    const uploadData = JSON.stringify({
      message: `Metadata update: ${new Date().toISOString()}`,
      content: base64Content,
      sha: fileSha || undefined,
    });

    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.github.com',
        path: `/repos/${this.owner}/${this.repoName}/contents/metadata.json`,
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'User-Agent': 'Clustrix-AI',
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(uploadData),
        },
      };

      const req = https.request(options, (res) => {
        let responseData = '';

        res.on('data', (chunk) => {
          responseData += chunk;
        });

        res.on('end', () => {
          try {
            const result = JSON.parse(responseData);

            if (res.statusCode >= 400) {
              reject(new Error(result.message));
            } else {
              console.log('[GitHub Storage] Metadata uploaded successfully');
              resolve(result);
            }
          } catch (err) {
            reject(new Error('Failed to parse metadata upload response: ' + err.message));
          }
        });
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.write(uploadData);
      req.end();
    });
  }
}

module.exports = GitHubStorageService;
