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
    this.redirectUrl = 'http://localhost:2920/oauth/callback';
    
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
   * Start OAuth flow and return tokens
   * Returns: { email, accessToken, refreshToken, expiresIn }
   */
  async startAuthFlow() {
    return new Promise(async (resolve, reject) => {
      const authUrl = this.getAuthUrl();
      console.log('[OAuth] Auth URL:', authUrl.substring(0, 100) + '...');
      
      // Create local server to handle OAuth callback
      const server = http.createServer(async (req, res) => {
        const parsedUrl = url.parse(req.url, true);
        const code = parsedUrl.query.code;
        const error = parsedUrl.query.error;
        const errorDescription = parsedUrl.query.error_description;

        console.log('[OAuth] Callback received:', { code: !!code, error, errorDescription });

        if (error) {
          const errorMsg = `${error}: ${errorDescription || 'Unknown error'}`;
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`<h1>Authorization failed</h1><p>${errorMsg}</p><p>You can close this window.</p>`);
          server.close();
          reject(new Error(`OAuth error: ${errorMsg}`));
          return;
        }

        if (!code) {
          return;
        }

        try {
          console.log('[OAuth] Exchanging authorization code for tokens...');
          // Exchange authorization code for tokens
          const { tokens } = await this.oauth2Client.getToken(code);
          this.oauth2Client.setCredentials(tokens);

          console.log('[OAuth] Getting user info...');
          // Get user info
          const userInfo = await this.getUserInfo(tokens.access_token);

          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`
            <h1>Authorization successful!</h1>
            <p>You can close this window.</p>
            <p>Welcome, ${userInfo.email}!</p>
          `);

          server.close();

          resolve({
            email: userInfo.email,
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            expiresIn: tokens.expiry_date
          });
        } catch (e) {
          console.error('[OAuth] Error during token exchange:', e.message);
          res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`<h1>Authorization failed</h1><p>Error: ${e.message}</p><p>You can close this window.</p>`);
          server.close();
          reject(e);
        }
      });

      server.listen(3000, () => {
        console.log('[OAuth] Callback server listening on port 3000');
        // Open browser for user to login
        open(authUrl).catch(err => {
          console.error('[OAuth] Failed to open browser:', err.message);
          reject(new Error(`Failed to open browser: ${err.message}`));
        });
      });

      server.on('error', (e) => {
        console.error('[OAuth] Server error:', e.message);
        reject(e);
      });

      // Timeout after 10 minutes
      setTimeout(() => {
        console.log('[OAuth] Flow timeout');
        server.close();
        reject(new Error('OAuth flow timeout'));
      }, 10 * 60 * 1000);
    });
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
