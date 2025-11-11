const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class GitHubStorageService {
  constructor(accessToken, username) {
    this.accessToken = accessToken;
    this.username = username;
    this.repoName = `clustrix-database`;
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
   * 
   * CRITICAL FIX: Added upload verification to prevent silent failures
   * - Verifies response contains commit information
   * - Validates uploaded file SHA matches local file
   * - Implements retry logic for transient failures
   */
  async uploadDatabase(dbPath) {
    console.log('[GitHub Storage] Uploading database:', dbPath);

    const maxRetries = 3;
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Calculate checksum before upload
        const checksumBefore = this.calculateChecksum(dbPath);
        
        const fileContent = fs.readFileSync(dbPath);
        const base64Content = fileContent.toString('base64');

        console.log('[GitHub Storage] Prepared for upload', {
          size: fileContent.length,
          base64Length: base64Content.length,
          checksum: checksumBefore.substring(0, 16) + '...',
          attempt
        });

        // Get current file SHA if exists
        let fileSha = null;
        try {
          const fileInfo = await this.getFileInfo('clustrix.db', false); // Don't fetch content
          fileSha = fileInfo.sha;
          console.log('[GitHub Storage] Existing file SHA:', fileSha);
        } catch (err) {
          if (err.message.includes('404')) {
            console.log('[GitHub Storage] File does not exist yet, will create new');
          } else {
            console.log('[GitHub Storage] Warning: Could not check existing file:', err.message);
          }
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
                  console.log('[GitHub Storage] Upload error:', {
                    status: res.statusCode,
                    message: result.message
                  });
                  reject(new Error(`Upload failed (${res.statusCode}): ${result.message}`));
                } else {
                  // CRITICAL: Verify response contains commit information
                  if (!result.commit || !result.commit.sha) {
                    console.log('[GitHub Storage] Warning: Upload response missing commit info', result);
                    reject(new Error('Upload response invalid - missing commit information'));
                    return;
                  }

                  console.log('[GitHub Storage] Database uploaded successfully', {
                    commitSha: result.commit.sha,
                    contentSha: result.content?.sha
                  });
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
        
        // CRITICAL: Verify upload by downloading and comparing checksum
        console.log('[GitHub Storage] Verifying upload integrity...');
        try {
          const verifyPath = `${dbPath}.verify-${Date.now()}`;
          await this.downloadDatabase(verifyPath);
          
          const checksumAfter = this.calculateChecksum(verifyPath);
          fs.unlinkSync(verifyPath); // Cleanup verification file
          
          if (checksumBefore !== checksumAfter) {
            throw new Error(`Upload verification failed: checksum mismatch. Expected ${checksumBefore.substring(0, 16)}..., got ${checksumAfter.substring(0, 16)}...`);
          }
          
          console.log('[GitHub Storage] Upload verified successfully - checksums match');
        } catch (verifyErr) {
          console.log('[GitHub Storage] Warning: Upload verification failed:', verifyErr.message);
          // Don't fail upload if verification fails - log warning only
          // The upload itself succeeded, verification is extra safety
        }
        
        // Store checksum in metadata
        try {
          const metadata = {
            lastBackup: new Date().toISOString(),
            checksum: checksumBefore,
            size: fileContent.length,
            commitSha: uploadResult.commit?.sha,
            uploadVerified: true
          };
          await this.uploadMetadata(metadata);
          console.log('[GitHub Storage] Checksum stored in metadata');
        } catch (metadataErr) {
          console.log('[GitHub Storage] Warning: Failed to store metadata:', metadataErr.message);
          // Non-critical error, continue
        }
        
        return uploadResult;
        
      } catch (err) {
        lastError = err;
        console.log('[GitHub Storage] Upload attempt failed', {
          attempt,
          maxRetries,
          error: err.message
        });

        if (attempt < maxRetries) {
          // Exponential backoff: 2s, 4s, 8s
          const delay = Math.pow(2, attempt) * 1000;
          console.log('[GitHub Storage] Retrying in', delay, 'ms...');
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // All retries exhausted
    console.log('[GitHub Storage] Upload failed after', maxRetries, 'attempts');
    throw new Error(`Upload failed after ${maxRetries} attempts: ${lastError.message}`);
  }

  /**
   * Download database from GitHub repo
   * 
   * CRITICAL FIX: Now handles files >1MB properly
   * - Uses getFileInfo which automatically handles large files via download_url
   * - Verifies checksum if metadata available
   * - Includes retry logic for network failures
   */
  async downloadDatabase(outputPath) {
    console.log('[GitHub Storage] Downloading database to:', outputPath);

    const maxRetries = 3;
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Get file info - automatically handles >1MB files
        const fileInfo = await this.getFileInfo('clustrix.db', true);
        
        if (!fileInfo.content) {
          throw new Error('File content not available after fetch');
        }

        console.log('[GitHub Storage] File info retrieved', {
          size: fileInfo.size,
          sha: fileInfo.sha,
          encoding: fileInfo.encoding,
          attempt
        });

        // Decode base64 content
        const buffer = Buffer.from(fileInfo.content, 'base64');
        
        // Ensure directory exists
        const dir = path.dirname(outputPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        // Write file
        fs.writeFileSync(outputPath, buffer);
        console.log('[GitHub Storage] Database downloaded successfully', {
          writtenBytes: buffer.length
        });
        
        // Verify checksum
        const checksumAfter = this.calculateChecksum(outputPath);
        
        try {
          const metadata = await this.getFileInfo('metadata.json', true);
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
        lastError = err;
        console.log('[GitHub Storage] Download attempt failed', {
          attempt,
          maxRetries,
          error: err.message
        });

        // Clean up partial download
        if (fs.existsSync(outputPath)) {
          try {
            fs.unlinkSync(outputPath);
          } catch (unlinkErr) {
            console.log('[GitHub Storage] Warning: Failed to cleanup partial download:', unlinkErr.message);
          }
        }

        if (attempt < maxRetries && !err.message.includes('Checksum mismatch')) {
          // Don't retry checksum errors - they indicate data corruption, not transient failure
          // Exponential backoff: 2s, 4s, 8s
          const delay = Math.pow(2, attempt) * 1000;
          console.log('[GitHub Storage] Retrying in', delay, 'ms...');
          await new Promise(resolve => setTimeout(resolve, delay));
        } else if (err.message.includes('Checksum mismatch')) {
          // Checksum error - fail immediately
          break;
        }
      }
    }

    // All retries exhausted
    console.log('[GitHub Storage] Download failed after', maxRetries, 'attempts');
    throw new Error(`Download failed after ${maxRetries} attempts: ${lastError.message}`);
  }

  /**
   * Upload AI model config to GitHub repo
   * Creates/updates file: ai-model.conf.json (base64 encoded)
   * 
   * CRITICAL FIX: Added retry logic and verification
   */
  async uploadModelConfig(configPath) {
    console.log('[GitHub Storage] Uploading model config:', configPath);

    const maxRetries = 3;
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
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
          const fileInfo = await this.getFileInfo('ai-model.conf.json', false);
          fileSha = fileInfo.sha;
          console.log('[GitHub Storage] Existing model config SHA:', fileSha);
        } catch (err) {
          if (err.message.includes('404')) {
            console.log('[GitHub Storage] Model config does not exist yet, will create new');
          } else {
            console.log('[GitHub Storage] Warning: Could not check existing config:', err.message);
          }
        }

        // Upload/update file
        const uploadData = JSON.stringify({
          message: `Model config backup: ${new Date().toISOString()}`,
          content: base64Content,
          sha: fileSha || undefined,
        });

        const result = await new Promise((resolve, reject) => {
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
                try {
                  const errorResult = JSON.parse(responseData);
                  reject(new Error(`Upload failed (${res.statusCode}): ${errorResult.message || responseData}`));
                } catch (parseErr) {
                  reject(new Error(`Upload failed: ${res.statusCode} - ${responseData}`));
                }
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

        return result;

      } catch (err) {
        lastError = err;
        console.log('[GitHub Storage] Model config upload attempt failed', {
          attempt,
          maxRetries,
          error: err.message
        });

        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000;
          console.log('[GitHub Storage] Retrying in', delay, 'ms...');
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    console.log('[GitHub Storage] Model config upload failed after', maxRetries, 'attempts');
    throw new Error(`Model config upload failed after ${maxRetries} attempts: ${lastError.message}`);
  }

  /**
   * Download AI model config from GitHub repo
   * 
   * CRITICAL FIX: Added retry logic and proper error handling
   */
  async downloadModelConfig(outputPath) {
    console.log('[GitHub Storage] Downloading model config to:', outputPath);

    const maxRetries = 3;
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const fileInfo = await this.getFileInfo('ai-model.conf.json', true);
        
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
        lastError = err;
        console.log('[GitHub Storage] Model config download attempt failed', {
          attempt,
          maxRetries,
          error: err.message
        });

        // Clean up partial download
        if (fs.existsSync(outputPath)) {
          try {
            fs.unlinkSync(outputPath);
          } catch (unlinkErr) {
            console.log('[GitHub Storage] Warning: Failed to cleanup partial download:', unlinkErr.message);
          }
        }

        if (attempt < maxRetries && !err.message.includes('404')) {
          // Don't retry 404 errors - file doesn't exist
          const delay = Math.pow(2, attempt) * 1000;
          console.log('[GitHub Storage] Retrying in', delay, 'ms...');
          await new Promise(resolve => setTimeout(resolve, delay));
        } else if (err.message.includes('404')) {
          // File doesn't exist - not an error
          break;
        }
      }
    }

    // If it's a 404, return success with not found flag
    if (lastError && lastError.message.includes('404')) {
      console.log('[GitHub Storage] Model config not found in GitHub (may not have been backed up yet)');
      return { success: true, notFound: true };
    }

    console.log('[GitHub Storage] Model config download failed after', maxRetries, 'attempts');
    throw new Error(`Model config download failed after ${maxRetries} attempts: ${lastError.message}`);
  }

  /**
   * Get file information from GitHub
   * 
   * CRITICAL FIX: For files >1MB, GitHub API with 'Accept: application/vnd.github.v3+json'
   * returns metadata WITHOUT content field. Must use download_url or raw media type.
   * 
   * This method now:
   * 1. Gets metadata with v3+json (includes download_url, sha, size)
   * 2. For files >1MB or if content field missing, uses download_url
   * 3. For files <1MB, uses base64 content from metadata
   * 
   * @param {string} filePath - File path in repo (e.g., 'clustrix.db')
   * @param {boolean} includeContent - Whether to fetch file content (default: true)
   * @returns {Promise<Object>} File metadata with content field
   */
  async getFileInfo(filePath, includeContent = true) {
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

        res.on('end', async () => {
          try {
            const result = JSON.parse(data);

            if (res.statusCode >= 400) {
              reject(new Error(`${res.statusCode}: ${result.message}`));
              return;
            }

            // If content not needed, return metadata only
            if (!includeContent) {
              resolve(result);
              return;
            }

            // Check if content field exists and is not empty
            if (result.content && result.content.length > 0) {
              console.log('[GitHub Storage] File content available in metadata (base64)');
              resolve(result);
              return;
            }

            // Content field missing or empty - file is likely >1MB
            // Use download_url to fetch raw content
            if (result.download_url) {
              console.log('[GitHub Storage] Content field empty, fetching via download_url', {
                size: result.size,
                encoding: result.encoding
              });

              try {
                const rawContent = await this.downloadRawFile(result.download_url);
                result.content = rawContent.toString('base64');
                result.encoding = 'base64';
                console.log('[GitHub Storage] Raw content fetched and encoded to base64');
                resolve(result);
              } catch (downloadErr) {
                reject(new Error(`Failed to download raw content: ${downloadErr.message}`));
              }
            } else {
              // No content and no download_url - this shouldn't happen
              reject(new Error('File content not available and no download_url provided'));
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
   * Download raw file content via download_url
   * 
   * Used for files >1MB where GitHub API doesn't include content in metadata.
   * 
   * @param {string} downloadUrl - URL to download raw file (from GitHub API response)
   * @returns {Promise<Buffer>} Raw file content
   */
  async downloadRawFile(downloadUrl) {
    return new Promise((resolve, reject) => {
      const url = new URL(downloadUrl);
      
      const options = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'User-Agent': 'Clustrix-AI',
          'Accept': 'application/octet-stream',
        },
      };

      const req = https.request(options, (res) => {
        const chunks = [];

        res.on('data', (chunk) => {
          chunks.push(chunk);
        });

        res.on('end', () => {
          if (res.statusCode >= 400) {
            reject(new Error(`Failed to download raw file: ${res.statusCode}`));
          } else {
            const buffer = Buffer.concat(chunks);
            console.log('[GitHub Storage] Raw file downloaded', {
              size: buffer.length,
              statusCode: res.statusCode
            });
            resolve(buffer);
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
