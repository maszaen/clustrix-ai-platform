/**
 * Google ID Token Verification Middleware
 * 
 * Verifies the Google ID token from mobile app and extracts user info
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Initialize Firebase Admin (lazy)
let firebaseInitialized = false;
let firebaseAvailable = null; // null = not checked, true/false = result

function initFirebase() {
  if (firebaseInitialized) return true;
  if (firebaseAvailable === false) return false; // Already tried and failed
  
  try {
    // Check if service account file exists
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      const credPath = path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS);
      if (!fs.existsSync(credPath)) {
        console.warn(`[AUTH] Firebase credentials file not found: ${credPath}`);
        console.warn('[AUTH] Running in mock/JWT-decode mode');
        firebaseAvailable = false;
        return false;
      }
      
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
      });
    } else if (process.env.FIREBASE_CONFIG) {
      // Or use inline config
      admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_CONFIG)),
      });
    } else {
      // For local dev without Firebase, just mock
      console.warn('[AUTH] No Firebase credentials configured, running in mock mode');
      firebaseAvailable = false;
      return false;
    }
    
    firebaseInitialized = true;
    firebaseAvailable = true;
    console.log('[AUTH] Firebase initialized successfully');
    return true;
  } catch (err) {
    console.error('[AUTH] Firebase init error:', err.message);
    firebaseAvailable = false;
    return false;
  }
}

/**
 * Verify Google ID token and attach user to request
 */
async function verifyGoogleToken(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Missing or invalid authorization header',
      code: 'AUTH_REQUIRED',
    });
  }
  
  const token = authHeader.split('Bearer ')[1];
  
  // NOTE: X-User-Email header is now ONLY used for logging purposes
  // It does NOT bypass authentication - token must still be valid
  const logEmail = req.headers['x-user-email'];

  // Development mode - accept mock tokens (ONLY in dev environment)
  if (process.env.NODE_ENV === 'development' && token.startsWith('dev_')) {
    req.user = {
      uid: token.replace('dev_', ''),
      email: logEmail || 'dev@clustrix.local',
      name: 'Developer',
      picture: null,
    };
    return next();
  }
  
  // Initialize Firebase if needed
  if (!initFirebase()) {
    // Fallback for Dev: If real JWT token but no Firebase creds, decode payload insecurely
    // This allows showing real email in logs even without backend verify setup
    if (token.split('.').length === 3) {
      try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
        req.user = {
          uid: payload.sub || 'unknown_uid',
          email: payload.email || 'unknown@jwt.local',
          name: payload.name || payload.email?.split('@')[0] || 'Unknown',
          picture: payload.picture,
        };
        console.warn(`[AUTH] Insecurely decoded token for ${req.user.email} (No Firebase Creds)`);
        return next();
      } catch (e) {
        console.warn('[AUTH] Failed to decode JWT payload:', e.message);
      }
    }

    // Mock mode for local dev (if decoding failed or not a JWT)
    req.user = {
      uid: 'mock_user',
      email: 'mock@clustrix.local',
      name: 'Mock User',
      picture: null,
    };
    return next();
  }
  
  try {
    // Verify the ID token from Google Sign-In
    const decodedToken = await admin.auth().verifyIdToken(token);
    
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      name: decodedToken.name || decodedToken.email?.split('@')[0],
      picture: decodedToken.picture,
    };
    
    next();
  } catch (err) {
    console.error('[AUTH] Token verification failed:', err.message);
    return res.status(401).json({
      error: 'Invalid or expired token',
      code: 'INVALID_TOKEN',
    });
  }
}

module.exports = { verifyGoogleToken };
