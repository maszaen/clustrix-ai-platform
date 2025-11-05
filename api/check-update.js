/**
 * Vercel Serverless Function: Check for Updates
 *
 * This endpoint:
 * 1. Validates the user's license key
 * 2. Checks GitHub for the latest release
 * 3. Generates a signed download URL if update is available
 * 4. Logs the update check attempt
 *
 * POST /api/check-update
 * Body: { licenseKey: string, currentVersion: string, machineId?: string }
 *
 * Response:
 * {
 *   success: boolean,
 *   updateAvailable: boolean,
 *   version?: string,
 *   releaseNotes?: string,
 *   downloadUrl?: string,
 *   size?: number,
 *   publishedAt?: string,
 *   error?: string
 * }
 */

import {
  validateLicense,
  logUpdateCheck,
  incrementDownloadCount
} from './utils/mongodb.js';

import {
  getLatestRelease,
  generateSignedDownloadUrl,
  findWindowsInstaller,
  compareVersions
} from './utils/github.js';

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use POST.'
    });
  }

  try {
    const { licenseKey, currentVersion, machineId } = req.body;

    // Validate input
    if (!licenseKey || typeof licenseKey !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'License key is required'
      });
    }

    if (!currentVersion || typeof currentVersion !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Current version is required'
      });
    }

    // Validate license
    const license = await validateLicense(licenseKey);

    if (!license) {
      // Log failed attempt
      await logUpdateCheck({
        licenseKey,
        currentVersion,
        machineId: machineId || 'unknown',
        ip: req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
        status: 'invalid_license',
        error: 'Invalid or expired license key'
      });

      return res.status(403).json({
        success: false,
        error: 'Invalid or expired license key. Please contact support.'
      });
    }

    // Get latest release from GitHub
    const latestRelease = await getLatestRelease();

    if (!latestRelease || !latestRelease.tag_name) {
      throw new Error('Failed to fetch latest release from GitHub');
    }

    const latestVersion = latestRelease.tag_name.replace(/^v/, '');
    const cleanCurrentVersion = currentVersion.replace(/^v/, '');

    // Compare versions
    const updateAvailable = compareVersions(latestVersion, cleanCurrentVersion) > 0;

    // Log update check
    await logUpdateCheck({
      licenseKey,
      currentVersion: cleanCurrentVersion,
      latestVersion,
      machineId: machineId || 'unknown',
      ip: req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
      status: 'success',
      updateAvailable,
      licenseEmail: license.email || 'unknown',
      licenseName: license.name || 'unknown'
    });

    if (!updateAvailable) {
      return res.status(200).json({
        success: true,
        updateAvailable: false,
        currentVersion: cleanCurrentVersion,
        latestVersion,
        message: 'You are running the latest version'
      });
    }

    // Find Windows installer asset
    const installer = findWindowsInstaller(latestRelease);

    if (!installer) {
      throw new Error('No Windows installer found in the latest release');
    }

    // Generate signed download URL
    const downloadUrl = await generateSignedDownloadUrl(installer.id, 3600); // 1 hour expiry

    // Increment download counter
    await incrementDownloadCount(licenseKey);

    // Return update information
    return res.status(200).json({
      success: true,
      updateAvailable: true,
      version: latestVersion,
      releaseNotes: latestRelease.body || 'No release notes available',
      downloadUrl,
      size: installer.size,
      fileName: installer.name,
      publishedAt: latestRelease.published_at,
      expiresIn: 3600, // URL expires in 1 hour
      message: `Version ${latestVersion} is now available for download`
    });

  } catch (error) {
    console.error('Error in check-update:', error);

    // Log error
    try {
      await logUpdateCheck({
        licenseKey: req.body?.licenseKey || 'unknown',
        currentVersion: req.body?.currentVersion || 'unknown',
        machineId: req.body?.machineId || 'unknown',
        ip: req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
        status: 'error',
        error: error.message
      });
    } catch (logError) {
      console.error('Failed to log error:', logError);
    }

    return res.status(500).json({
      success: false,
      error: 'Internal server error. Please try again later.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
