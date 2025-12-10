/**
 * Backup Service
 * Handles database backup to Google Drive (appdata folder)
 */

import * as Crypto from 'expo-crypto';
import { setLastBackupTime, getValidAccessToken } from './auth';

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
async function backupToGoogleDrive(accessToken, backupData) {
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
async function restoreFromGoogleDrive(accessToken) {
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

/**
 * Backup database to cloud with auto token refresh
 */
export async function backupToCloud(backupData) {
  console.log('[Backup] Preparing backup...');
  
  // Get valid (refreshed) access token
  const accessToken = await getValidAccessToken();
  
  if (!accessToken) {
    return {
      success: false,
      error: 'Tidak ada sesi login aktif. Silakan login ulang.',
      needsReauth: true,
    };
  }
  
  return await backupToGoogleDrive(accessToken, backupData);
}

/**
 * Restore database from cloud with auto token refresh
 */
export async function restoreFromCloud() {
  console.log('[Backup] Preparing restore...');
  
  // Get valid (refreshed) access token
  const accessToken = await getValidAccessToken();
  
  if (!accessToken) {
    return {
      success: false,
      error: 'Tidak ada sesi login aktif. Silakan login ulang.',
      needsReauth: true,
    };
  }
  
  return await restoreFromGoogleDrive(accessToken);
}

