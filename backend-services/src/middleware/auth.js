/**
 * Google ID Token Verification Middleware
 * 
 * Verifies the Google ID token from mobile app and extracts user info
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin (lazy)
let firebaseInitialized = false;
function initFirebase() {
  if (firebaseInitialized) return;
  
  try {
    // Try to use service account file
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
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
      console.warn('[AUTH] No Firebase credentials, running in mock mode');
      return false;
    }
    firebaseInitialized = true;
    return true;
  } catch (err) {
    console.error('[AUTH] Firebase init error:', err);
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
  
  // Development mode - accept mock tokens
  if (process.env.NODE_ENV === 'development' && token.startsWith('dev_')) {
    req.user = {
      uid: token.replace('dev_', ''),
      email: 'dev@clustrix.local',
      name: 'Developer',
      picture: null,
    };
    return next();
  }
  
  // Initialize Firebase if needed
  if (!initFirebase()) {
    // Mock mode for local dev
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
