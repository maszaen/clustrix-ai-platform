/**
 * MongoDB Connection Utilities
 * Handles database connections and queries for license validation and logging
 */

import { MongoClient } from 'mongodb';

let cachedClient = null;
let cachedDb = null;

/**
 * Connect to MongoDB with connection pooling
 */
export async function connectToDatabase() {
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI environment variable is not set');
  }

  const client = await MongoClient.connect(process.env.MONGODB_URI, {
    maxPoolSize: 10,
    minPoolSize: 2,
    serverSelectionTimeoutMS: 5000,
  });

  const db = client.db(process.env.MONGODB_DB_NAME || 'clustrix');

  cachedClient = client;
  cachedDb = db;

  return { client, db };
}

/**
 * Validate license key
 * @param {string} licenseKey - License key to validate
 * @returns {Promise<Object|null>} License object if valid, null if invalid
 */
export async function validateLicense(licenseKey) {
  if (!licenseKey || typeof licenseKey !== 'string') {
    return null;
  }

  const { db } = await connectToDatabase();

  const license = await db.collection('licenses').findOne({
    key: licenseKey,
    active: true,
    $or: [
      { expiresAt: { $exists: false } },
      { expiresAt: null },
      { expiresAt: { $gt: new Date() } }
    ]
  });

  return license;
}

/**
 * Log update check attempt
 */
export async function logUpdateCheck(data) {
  const { db } = await connectToDatabase();

  await db.collection('update_logs').insertOne({
    ...data,
    timestamp: new Date(),
    type: 'update_check'
  });
}

/**
 * Log download attempt
 */
export async function logDownload(data) {
  const { db } = await connectToDatabase();

  await db.collection('download_logs').insertOne({
    ...data,
    timestamp: new Date(),
    type: 'download'
  });
}

/**
 * Get latest version info from database
 * This is optional - can also fetch directly from GitHub
 */
export async function getLatestVersionFromDB() {
  const { db } = await connectToDatabase();

  const versionDoc = await db.collection('app_versions')
    .findOne({ active: true }, { sort: { createdAt: -1 } });

  return versionDoc;
}

/**
 * Increment download counter for a license
 */
export async function incrementDownloadCount(licenseKey) {
  const { db } = await connectToDatabase();

  await db.collection('licenses').updateOne(
    { key: licenseKey },
    {
      $inc: { downloadCount: 1 },
      $set: { lastDownloadAt: new Date() }
    }
  );
}
