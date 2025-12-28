/**
 * Google ID Token Verification Middleware
 * 
 * Verifies the Google ID token from mobile app using Google OAuth2 API
 */

const { OAuth2Client } = require('google-auth-library');

// Web Client ID from Firebase (must match mobile app's webClientId)
const WEB_CLIENT_ID = '50765975600-07gl5g8f1gai0rt22n2jpp03rjsbmnm0.apps.googleusercontent.com';

// Initialize OAuth2 client
const oauthClient = new OAuth2Client(WEB_CLIENT_ID);

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
  
  try {
    // Verify the ID token using Google OAuth2 API
    const ticket = await oauthClient.verifyIdToken({
      idToken: token,
      audience: WEB_CLIENT_ID,
    });
    
    const payload = ticket.getPayload();
    
    req.user = {
      uid: payload.sub,
      email: payload.email,
      name: payload.name || payload.email?.split('@')[0],
      picture: payload.picture,
    };
    
    next();
  } catch (err) {
    console.error('[AUTH] Token verification failed:', err.message);
    
    // Fallback: Try to decode JWT payload for logging (insecure, for debugging)
    if (token.split('.').length === 3) {
      try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
        console.warn(`[AUTH] Token from ${payload.email} failed verification`);
      } catch (e) {
        // ignore
      }
    }
    
    return res.status(401).json({
      error: 'Invalid or expired token',
      code: 'INVALID_TOKEN',
    });
  }
}

module.exports = { verifyGoogleToken };
