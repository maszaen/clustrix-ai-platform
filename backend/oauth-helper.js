/**
 * OAuth Helper for Google Authentication
 * Handles OAuth flow for Clustrix desktop app
 * 
 * PRODUCTION ONLY - requires Google Cloud Console credentials:
 * - GOOGLE_CLIENT_ID environment variable (OAuth)
 * - GOOGLE_CLIENT_SECRET environment variable (OAuth)
 * - GOOGLE_API_KEY environment variable (for Drive & People APIs)
 * 
 * No demo mode, no native dialogs. All UI handled by renderer.
 */

const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');
const open = require('open').default || require('open');
const http = require('http');
const url = require('url');

class OAuthHelper {
  constructor() {
    this.clientId = process.env.GOOGLE_CLIENT_ID;
    this.clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    this.apiKey = process.env.GOOGLE_API_KEY; // Separate API key for Drive/People
    this.redirectUrl = 'urn:ietf:wg:oauth:2.0:oob'; // Desktop app - Out of Band flow
    
    // REQUIRED - throw error if not configured
    if (!this.clientId || !this.clientSecret) {
      throw new Error(
        'Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.'
      );
    }
    
    if (!this.apiKey) {
      throw new Error(
        'Google API Key not configured. Set GOOGLE_API_KEY environment variable for Drive and People APIs.'
      );
    }
    
    this.oauth2Client = new OAuth2Client(
      this.clientId,
      this.clientSecret,
      this.redirectUrl
    );
  }

  /**
   * Get authorization URL for user to login
   */
  getAuthUrl() {
    const scopes = [
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/drive',
    ];

    const authUrl = this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent'
    });

    return authUrl;
  }

  /**
   * Start OAuth flow (Out-of-Band for desktop)
   * Returns: { email, accessToken, refreshToken, expiresIn }
   */
  async startAuthFlow() {
    const authUrl = this.getAuthUrl();
    console.log('[OAuth] Opening authorization URL...');
    
    // Open browser for user to login and get auth code
    await open(authUrl);
    
    // For OOB flow, we need to get the auth code from the user
    // This will be handled by renderer - show input dialog for auth code
    throw new Error('OOB_AUTH_REQUIRED');
  }

  /**
   * Exchange authorization code for tokens (OOB flow)
   * User pastes the code from Google consent screen
   */
  async exchangeCodeForToken(authCode) {
    try {
      console.log('[OAuth] Exchanging auth code for tokens...');
      const { tokens } = await this.oauth2Client.getToken(authCode);
      this.oauth2Client.setCredentials(tokens);

      console.log('[OAuth] Getting user info...');
      const userInfo = await this.getUserInfo(tokens.access_token);

      return {
        email: userInfo.email,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresIn: tokens.expiry_date
      };
    } catch (e) {
      console.error('[OAuth] Error exchanging token:', e.message);
      throw e;
    }
  }

  /**
   * Get user info from Google using access token
   */
  async getUserInfo(accessToken) {
    const people = google.people({ version: 'v1', auth: this.oauth2Client });
    
    this.oauth2Client.setCredentials({ access_token: accessToken });
    
    const response = await people.people.get({
      resourceName: 'people/me',
      personFields: 'emailAddresses,names,photos',
    });

    const emailAddresses = response.data.emailAddresses || [];
    const names = response.data.names || [];
    const photos = response.data.photos || [];

    return {
      email: emailAddresses[0]?.value || 'unknown@gmail.com',
      name: names[0]?.displayName || 'User',
      picture: photos[0]?.url || ''
    };
  }
}

module.exports = OAuthHelper;
