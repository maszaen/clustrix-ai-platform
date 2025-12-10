/**
 * Backup Service
 * Handles database backup to GitHub (private repo) and Google Drive (appdata)
 */

import * as FileSystem from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import { setLastBackupTime } from './auth';

// Repository name for GitHub backup
const GITHUB_REPO_NAME = 'clustrix-database';

/**
 * Calculate SHA256 checksum of a file
 */
async function calculateChecksum(fileUri) {
  const content = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    content
  );
  return hash;
}

// ========================================
// GitHub Backup Functions
// ========================================

/**
 * Ensure GitHub repo exists (create if not)
 */
async function ensureGitHubRepoExists(accessToken, username) {
  console.log('[Backup] Checking if GitHub repo exists:', GITHUB_REPO_NAME);
  
  try {
    // Try to get repo info
    const response = await fetch(`https://api.github.com/repos/${username}/${GITHUB_REPO_NAME}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });
    
    if (response.status === 200) {
      console.log('[Backup] Repo exists');
      return await response.json();
    }
    
    if (response.status === 404) {
      // Create repo
      console.log('[Backup] Repo not found, creating...');
      const createResponse = await fetch('https://api.github.com/user/repos', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: GITHUB_REPO_NAME,
          description: 'Clustrix AI Platform - Sync & Backup Repository',
          private: true,
          auto_init: true,
        }),
      });
      
      if (!createResponse.ok) {
        const error = await createResponse.json();
        throw new Error(error.message || 'Failed to create repo');
      }
      
      console.log('[Backup] Repo created successfully');
      return await createResponse.json();
    }
    
    throw new Error(`Unexpected response: ${response.status}`);
  } catch (error) {
    console.error('[Backup] Error ensuring repo exists:', error);
    throw error;
  }
}

/**
 * Get file info from GitHub repo
 */
async function getGitHubFileInfo(accessToken, username, filePath) {
  const response = await fetch(
    `https://api.github.com/repos/${username}/${GITHUB_REPO_NAME}/contents/${filePath}`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    }
  );
  
  if (response.status === 404) {
    return null;
  }
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to get file info');
  }
  
  return await response.json();
}

/**
 * Upload backup to GitHub repo
 */
export async function backupToGitHub(accessToken, username, backupData) {
  console.log('[Backup] Starting GitHub backup...');
  
  try {
    // Ensure repo exists
    await ensureGitHubRepoExists(accessToken, username);
    
    // Convert backup data to base64
    const base64Content = btoa(unescape(encodeURIComponent(JSON.stringify(backupData, null, 2))));
    
    // Get current file SHA if exists (required for update)
    const existingFile = await getGitHubFileInfo(accessToken, username, 'backup.json');
    const fileSha = existingFile?.sha;
    
    // Upload file
    const response = await fetch(
      `https://api.github.com/repos/${username}/${GITHUB_REPO_NAME}/contents/backup.json`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: `Backup: ${new Date().toISOString()}`,
          content: base64Content,
          sha: fileSha || undefined,
        }),
      }
    );
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to upload backup');
    }
    
    const result = await response.json();
    
    // Upload metadata
    const metadata = {
      lastBackup: new Date().toISOString(),
      platform: 'mobile',
      version: '1.0',
    };
    
    const existingMeta = await getGitHubFileInfo(accessToken, username, 'metadata.json');
    await fetch(
      `https://api.github.com/repos/${username}/${GITHUB_REPO_NAME}/contents/metadata.json`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: `Metadata: ${new Date().toISOString()}`,
          content: btoa(JSON.stringify(metadata, null, 2)),
          sha: existingMeta?.sha || undefined,
        }),
      }
    );
    
    await setLastBackupTime(Date.now());
    
    console.log('[Backup] GitHub backup completed');
    return {
      success: true,
      commitSha: result.commit?.sha,
      repository: `${username}/${GITHUB_REPO_NAME}`,
    };
  } catch (error) {
    console.error('[Backup] GitHub backup error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Restore from GitHub backup
 */
export async function restoreFromGitHub(accessToken, username) {
  console.log('[Backup] Starting GitHub restore...');
  
  try {
    const fileInfo = await getGitHubFileInfo(accessToken, username, 'backup.json');
    
    if (!fileInfo) {
      return {
        success: false,
        error: 'No backup found',
        notFound: true,
      };
    }
    
    // Decode content
    let content;
    if (fileInfo.content) {
      content = decodeURIComponent(escape(atob(fileInfo.content.replace(/\n/g, ''))));
    } else if (fileInfo.download_url) {
      // For large files, fetch from download_url
      const response = await fetch(fileInfo.download_url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });
      content = await response.text();
    } else {
      throw new Error('No content available');
    }
    
    const backupData = JSON.parse(content);
    
    console.log('[Backup] GitHub restore completed');
    return {
      success: true,
      data: backupData,
    };
  } catch (error) {
    console.error('[Backup] GitHub restore error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

// ========================================
// Google Drive Backup Functions
// ========================================

const GOOGLE_DRIVE_APPDATA_URL = 'https://www.googleapis.com/drive/v3/files';
const GOOGLE_DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';

/**
 * Find backup file in Google Drive appdata
 */
async function findGoogleDriveBackup(accessToken) {
  const response = await fetch(
    `${GOOGLE_DRIVE_APPDATA_URL}?spaces=appDataFolder&q=name='clustrix-backup.json'`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    }
  );
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to search Drive');
  }
  
  const result = await response.json();
  return result.files?.[0] || null;
}

/**
 * Upload backup to Google Drive appdata folder
 */
export async function backupToGoogleDrive(accessToken, backupData) {
  console.log('[Backup] Starting Google Drive backup...');
  
  try {
    // Check if backup file already exists
    const existingFile = await findGoogleDriveBackup(accessToken);
    
    const metadata = {
      name: 'clustrix-backup.json',
      mimeType: 'application/json',
    };
    
    if (!existingFile) {
      metadata.parents = ['appDataFolder'];
    }
    
    const jsonContent = JSON.stringify(backupData, null, 2);
    
    // Create multipart body
    const boundary = '---clustrix-boundary';
    const body = `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: application/json\r\n\r\n` +
      `${jsonContent}\r\n` +
      `--${boundary}--`;
    
    const url = existingFile
      ? `${GOOGLE_DRIVE_UPLOAD_URL}/${existingFile.id}?uploadType=multipart`
      : `${GOOGLE_DRIVE_UPLOAD_URL}?uploadType=multipart`;
    
    const response = await fetch(url, {
      method: existingFile ? 'PATCH' : 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to upload to Drive');
    }
    
    const result = await response.json();
    
    await setLastBackupTime(Date.now());
    
    console.log('[Backup] Google Drive backup completed');
    return {
      success: true,
      fileId: result.id,
    };
  } catch (error) {
    console.error('[Backup] Google Drive backup error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Restore from Google Drive backup
 */
export async function restoreFromGoogleDrive(accessToken) {
  console.log('[Backup] Starting Google Drive restore...');
  
  try {
    const file = await findGoogleDriveBackup(accessToken);
    
    if (!file) {
      return {
        success: false,
        error: 'No backup found',
        notFound: true,
      };
    }
    
    // Download file content
    const response = await fetch(
      `${GOOGLE_DRIVE_APPDATA_URL}/${file.id}?alt=media`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );
    
    if (!response.ok) {
      throw new Error('Failed to download backup');
    }
    
    const content = await response.text();
    const backupData = JSON.parse(content);
    
    console.log('[Backup] Google Drive restore completed');
    return {
      success: true,
      data: backupData,
    };
  } catch (error) {
    console.error('[Backup] Google Drive restore error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

// ========================================
// Unified Backup Functions
// ========================================

/**
 * Backup database to cloud (GitHub or Google based on provider)
 */
export async function backupToCloud(provider, accessToken, username, backupData) {
  if (provider === 'github') {
    return await backupToGitHub(accessToken, username, backupData);
  } else if (provider === 'google') {
    return await backupToGoogleDrive(accessToken, backupData);
  } else {
    return { success: false, error: 'Unknown provider' };
  }
}

/**
 * Restore database from cloud
 */
export async function restoreFromCloud(provider, accessToken, username) {
  if (provider === 'github') {
    return await restoreFromGitHub(accessToken, username);
  } else if (provider === 'google') {
    return await restoreFromGoogleDrive(accessToken);
  } else {
    return { success: false, error: 'Unknown provider' };
  }
}
