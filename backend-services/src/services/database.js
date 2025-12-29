/**
 * Database Service - Firestore Persistence
 * 
 * Persists model settings, user config, and analytics to survive server restarts
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  // Try to load service account from env or file
  const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  
  if (serviceAccountJson) {
    // Parse JSON from env variable
    try {
      const serviceAccount = JSON.parse(serviceAccountJson);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log('[DB] Firebase initialized from FIREBASE_SERVICE_ACCOUNT env');
    } catch (e) {
      console.error('[DB] Failed to parse FIREBASE_SERVICE_ACCOUNT:', e.message);
    }
  } else if (serviceAccountPath) {
    // Use file path from GOOGLE_APPLICATION_CREDENTIALS
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
    console.log('[DB] Firebase initialized from GOOGLE_APPLICATION_CREDENTIALS');
  } else {
    // Try default (Cloud Run automatically provides credentials)
    try {
      admin.initializeApp();
      console.log('[DB] Firebase initialized with default credentials');
    } catch (e) {
      console.error('[DB] Firebase init failed:', e.message);
    }
  }
}

// Get Firestore instance
let db = null;

function getDb() {
  if (!db) {
    try {
      db = admin.firestore();
    } catch (e) {
      console.error('[DB] Failed to get Firestore:', e.message);
      return null;
    }
  }
  return db;
}

// ===================================================================
// MODEL SETTINGS
// ===================================================================

/**
 * Save model enabled/disabled state
 */
async function saveModelSettings(modelId, enabled) {
  const db = getDb();
  if (!db) return;
  
  try {
    await db.collection('modelSettings').doc(encodeDocId(modelId)).set({
      modelId,
      enabled,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    console.log(`[DB] Saved model setting: ${modelId} = ${enabled}`);
  } catch (err) {
    console.error('[DB] Error saving model settings:', err.message);
  }
}

/**
 * Load all model settings
 */
async function loadModelSettings() {
  const db = getDb();
  if (!db) return {};
  
  try {
    const snapshot = await db.collection('modelSettings').get();
    const settings = {};
    snapshot.forEach(doc => {
      const data = doc.data();
      settings[data.modelId] = data.enabled;
    });
    console.log(`[DB] Loaded ${Object.keys(settings).length} model settings`);
    return settings;
  } catch (err) {
    console.error('[DB] Error loading model settings:', err.message);
    return {};
  }
}

// ===================================================================
// USER CONFIG (Unlimited users)
// ===================================================================

/**
 * Save unlimited user status
 */
async function saveUnlimitedUser(userId, isUnlimited) {
  const db = getDb();
  if (!db) return;
  
  try {
    if (isUnlimited) {
      await db.collection('unlimitedUsers').doc(userId).set({
        userId,
        grantedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log(`[DB] Saved unlimited user: ${userId}`);
    } else {
      await db.collection('unlimitedUsers').doc(userId).delete();
      console.log(`[DB] Removed unlimited user: ${userId}`);
    }
  } catch (err) {
    console.error('[DB] Error saving unlimited user:', err.message);
  }
}

/**
 * Load all unlimited users
 */
async function loadUnlimitedUsers() {
  const db = getDb();
  if (!db) return [];
  
  try {
    const snapshot = await db.collection('unlimitedUsers').get();
    const users = [];
    snapshot.forEach(doc => {
      users.push(doc.data().userId);
    });
    console.log(`[DB] Loaded ${users.length} unlimited users`);
    return users;
  } catch (err) {
    console.error('[DB] Error loading unlimited users:', err.message);
    return [];
  }
}

// ===================================================================
// ANALYTICS (User stats - periodic save)
// ===================================================================

/**
 * Save user stats (batch save periodically)
 */
async function saveUserStats(userId, stats) {
  const db = getDb();
  if (!db) return;
  
  try {
    // Convert Set to Array for Firestore
    const data = {
      ...stats,
      devices: Array.from(stats.devices || []),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    await db.collection('userStats').doc(userId).set(data, { merge: true });
  } catch (err) {
    console.error('[DB] Error saving user stats:', err.message);
  }
}

/**
 * Load all user stats
 */
async function loadAllUserStats() {
  const db = getDb();
  if (!db) return new Map();
  
  try {
    const snapshot = await db.collection('userStats').get();
    const stats = new Map();
    snapshot.forEach(doc => {
      const data = doc.data();
      // Convert devices array back to Set
      data.devices = new Set(data.devices || []);
      stats.set(data.userId, data);
    });
    console.log(`[DB] Loaded ${stats.size} user stats`);
    return stats;
  } catch (err) {
    console.error('[DB] Error loading user stats:', err.message);
    return new Map();
  }
}

/**
 * Save analytics summary (daily aggregates)
 */
async function saveAnalyticsSummary(date, summary) {
  try {
    await getDb().collection('analyticsSummary').doc(date).set({
      ...summary,
      date,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  } catch (err) {
    console.error('[DB] Error saving analytics summary:', err.message);
  }
}

// ===================================================================
// REQUEST LOGS (Individual request persistence)
// ===================================================================

/**
 * Save individual request log to Firestore
 * Uses request ID as document ID for deduplication
 */
async function saveRequestLog(request) {
  const db = getDb();
  if (!db) return;
  
  try {
    await db.collection('requestLogs').doc(request.id).set({
      ...request,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error('[DB] Error saving request log:', err.message);
  }
}

/**
 * Load recent request logs from Firestore
 * @param {number} hours - Load requests from last N hours (default 24)
 * @param {number} limit - Max number of requests to load (default 10000)
 */
async function loadRequestLogs(hours = 24, limit = 10000) {
  const db = getDb();
  if (!db) return [];
  
  try {
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    
    const snapshot = await db.collection('requestLogs')
      .where('timestamp', '>=', cutoffTime)
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .get();
    
    const requests = [];
    snapshot.forEach(doc => {
      requests.push(doc.data());
    });
    
    console.log(`[DB] Loaded ${requests.length} request logs from last ${hours}h`);
    return requests;
  } catch (err) {
    console.error('[DB] Error loading request logs:', err.message);
    return [];
  }
}

/**
 * Delete old request logs (cleanup job)
 * @param {number} daysOld - Delete requests older than N days
 */
async function deleteOldRequestLogs(daysOld = 7) {
  const db = getDb();
  if (!db) return 0;
  
  try {
    const cutoffTime = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000).toISOString();
    
    const snapshot = await db.collection('requestLogs')
      .where('timestamp', '<', cutoffTime)
      .limit(500) // Batch delete limit
      .get();
    
    if (snapshot.empty) return 0;
    
    const batch = db.batch();
    snapshot.forEach(doc => {
      batch.delete(doc.ref);
    });
    await batch.commit();
    
    console.log(`[DB] Deleted ${snapshot.size} old request logs`);
    return snapshot.size;
  } catch (err) {
    console.error('[DB] Error deleting old request logs:', err.message);
    return 0;
  }
}

// ===================================================================
// BLOCKED USERS
// ===================================================================

/**
 * Save blocked user status
 */
async function saveBlockedUser(userId, isBlocked) {
  const db = getDb();
  if (!db) return;
  
  try {
    if (isBlocked) {
      await db.collection('blockedUsers').doc(userId).set({
        userId,
        blockedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log(`[DB] Saved blocked user: ${userId}`);
    } else {
      await db.collection('blockedUsers').doc(userId).delete();
      console.log(`[DB] Removed blocked user: ${userId}`);
    }
  } catch (err) {
    console.error('[DB] Error saving blocked user:', err.message);
  }
}

/**
 * Load all blocked users
 */
async function loadBlockedUsers() {
  const db = getDb();
  if (!db) return [];
  
  try {
    const snapshot = await db.collection('blockedUsers').get();
    const users = [];
    snapshot.forEach(doc => {
      users.push(doc.data().userId);
    });
    console.log(`[DB] Loaded ${users.length} blocked users`);
    return users;
  } catch (err) {
    console.error('[DB] Error loading blocked users:', err.message);
    return [];
  }
}

// ===================================================================
// HELPERS
// ===================================================================

/**
 * Encode document ID (Firestore doesn't allow / in doc IDs)
 */
function encodeDocId(id) {
  return id.replace(/\//g, '__SLASH__');
}

/**
 * Decode document ID
 */
function decodeDocId(id) {
  return id.replace(/__SLASH__/g, '/');
}

module.exports = {
  saveModelSettings,
  loadModelSettings,
  saveUnlimitedUser,
  loadUnlimitedUsers,
  saveBlockedUser,
  loadBlockedUsers,
  saveUserStats,
  loadAllUserStats,
  saveAnalyticsSummary,
  saveRequestLog,
  loadRequestLogs,
  deleteOldRequestLogs,
};

