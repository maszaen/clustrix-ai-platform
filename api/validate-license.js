/**
 * Vercel Serverless Function: Validate License
 *
 * This endpoint validates a license key and returns license information
 *
 * POST /api/validate-license
 * Body: { licenseKey: string, machineId?: string }
 *
 * Response:
 * {
 *   success: boolean,
 *   valid: boolean,
 *   license?: {
 *     email: string,
 *     name: string,
 *     type: string,
 *     expiresAt: Date|null,
 *     features: Array
 *   },
 *   error?: string
 * }
 */

import { validateLicense } from './utils/mongodb.js';

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
    const { licenseKey, machineId } = req.body;

    // Validate input
    if (!licenseKey || typeof licenseKey !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'License key is required'
      });
    }

    // Validate license
    const license = await validateLicense(licenseKey);

    if (!license) {
      return res.status(200).json({
        success: true,
        valid: false,
        message: 'Invalid or expired license key'
      });
    }

    // Return license information (without sensitive data)
    return res.status(200).json({
      success: true,
      valid: true,
      license: {
        email: license.email || 'N/A',
        name: license.name || 'N/A',
        type: license.type || 'standard',
        expiresAt: license.expiresAt || null,
        features: license.features || ['basic'],
        isLifetime: !license.expiresAt,
        activatedAt: license.activatedAt || license.createdAt,
      },
      message: 'License is valid'
    });

  } catch (error) {
    console.error('Error in validate-license:', error);

    return res.status(500).json({
      success: false,
      error: 'Internal server error. Please try again later.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
