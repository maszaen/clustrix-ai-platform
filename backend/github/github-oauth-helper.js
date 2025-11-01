const http = require('http');
const { URL } = require('url');
const { exec } = require('child_process');
const open = (require('open').default || require('open'));

class GitHubOAuthHelper {
  constructor(clientId, clientSecret, callbackUrl) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.callbackUrl = callbackUrl || 'http://localhost:2920/oauth/callback';

    if (!this.clientId || !this.clientSecret) {
      throw new Error('GitHub OAuth not configured. Missing clientId or clientSecret');
    }

    this.authCode = null;
    this.authError = null;
    this.pendingPromise = null;
  }

  getAuthUrl() {
    const scopes = ['user', 'user:email', 'repo', 'gist'];
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.callbackUrl,
      scope: scopes.join(' '),
      state: Math.random().toString(36).substring(7),
    });

    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  async startAuthFlow() {
    console.log('[GitHub OAuth] Starting OAuth flow...');

    return new Promise((resolve, reject) => {
      // Store promise resolvers for callback
      this.pendingPromise = { resolve, reject };

      // Open browser to GitHub OAuth URL
      const authUrl = this.getAuthUrl();
      console.log('[GitHub OAuth] Opening browser:', authUrl);

      open(authUrl).catch((err) => {
        console.log('[GitHub OAuth] Failed to open browser:', err.message);
        // Don't reject, user can manually open URL
      });

      // Set timeout for auth flow
      setTimeout(() => {
        if (this.pendingPromise) {
          this.pendingPromise.reject(new Error('OAuth flow timeout - no callback received'));
          this.pendingPromise = null;
        }
      }, 120000); // 2 minutes timeout
    });
  }

  async handleCallback(code, error, errorDescription) {
    if (!this.pendingPromise) {
      console.log('[GitHub OAuth] Callback received but no pending promise');
      return;
    }

    if (error) {
      console.log('[GitHub OAuth] Authorization error:', error, errorDescription);
      this.authError = `${error}: ${errorDescription}`;
      this.pendingPromise.reject(new Error(this.authError));
      this.pendingPromise = null;
      return;
    }

    if (!code) {
      console.log('[GitHub OAuth] No code received in callback');
      this.pendingPromise.reject(new Error('No authorization code received'));
      this.pendingPromise = null;
      return;
    }

    console.log('[GitHub OAuth] Authorization code received:', code);
    this.authCode = code;

    try {
      console.log('[GitHub OAuth] Exchanging code for token...');
      const tokenData = await this.exchangeCodeForToken(code);
      
      console.log('[GitHub OAuth] Token received, fetching user info...');
      const userInfo = await this.getUserInfo(tokenData.access_token);

      console.log('[GitHub OAuth] User info fetched:', userInfo.login);

      // GitHub may not return email if private, fetch from /user/emails
      let email = userInfo.email;
      if (!email) {
        console.log('[GitHub OAuth] Email not in user info, fetching from /user/emails...');
        const emails = await this.getUserEmails(tokenData.access_token);
        if (emails && emails.length > 0) {
          email = emails[0].email;
          console.log('[GitHub OAuth] Email fetched:', email);
        }
      }

      this.pendingPromise.resolve({
        success: true,
        accessToken: tokenData.access_token,
        email: email || userInfo.login + '@github.com', // Fallback email
        username: userInfo.login,
        name: userInfo.name,
        profileUrl: userInfo.avatar_url,
      });
      this.pendingPromise = null;
    } catch (err) {
      console.log('[GitHub OAuth] Token exchange or user info failed:', err.message);
      this.pendingPromise.reject(err);
      this.pendingPromise = null;
    }
  }

  async exchangeCodeForToken(code) {
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code: code,
        redirect_uri: this.callbackUrl,
      });

      const options = {
        hostname: 'github.com',
        port: 443,
        path: '/login/oauth/access_token',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          'Accept': 'application/json',
        },
      };

      const https = require('https');
      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const result = JSON.parse(data);

            if (result.error) {
              console.log('[GitHub OAuth] Token error:', result.error, result.error_description);
              reject(new Error(result.error_description || result.error));
            } else {
              console.log('[GitHub OAuth] Token exchange successful');
              resolve(result);
            }
          } catch (err) {
            console.log('[GitHub OAuth] Parse error:', err.message, 'Data:', data);
            reject(new Error('Failed to parse token response: ' + err.message));
          }
        });

        res.on('error', (err) => {
          console.log('[GitHub OAuth] Response error:', err.message);
          reject(err);
        });
      });

      req.on('error', (err) => {
        console.log('[GitHub OAuth] Request error:', err.message);
        reject(err);
      });

      req.setTimeout(10000, () => {
        console.log('[GitHub OAuth] Token exchange timeout');
        req.abort();
        reject(new Error('Token exchange request timeout'));
      });

      req.write(postData);
      req.end();
    });
  }

  async getUserInfo(accessToken) {
    console.log('[GitHub OAuth] Fetching user info with token:', accessToken.substring(0, 10) + '...');
    return new Promise((resolve, reject) => {
      const https = require('https');
      const options = {
        hostname: 'api.github.com',
        port: 443,
        path: '/user',
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'Clustrix-AI',
          'Accept': 'application/vnd.github.v3+json',
        },
      };

      const req = https.request(options, (res) => {
        console.log('[GitHub OAuth] User info response status:', res.statusCode);
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const userInfo = JSON.parse(data);

            if (userInfo.message) {
              console.log('[GitHub OAuth] User info error:', userInfo.message);
              reject(new Error(userInfo.message));
            } else {
              console.log('[GitHub OAuth] User info retrieved:', userInfo.login);
              resolve(userInfo);
            }
          } catch (err) {
            console.log('[GitHub OAuth] User info parse error:', err.message, 'Data:', data);
            reject(new Error('Failed to parse user info: ' + err.message));
          }
        });

        res.on('error', (err) => {
          console.log('[GitHub OAuth] User info response error:', err.message);
          reject(err);
        });
      });

      req.on('error', (err) => {
        console.log('[GitHub OAuth] User info request error:', err.message);
        reject(err);
      });

      req.setTimeout(10000, () => {
        console.log('[GitHub OAuth] User info request timeout');
        req.abort();
        reject(new Error('User info request timeout'));
      });

      req.end();
    });
  }

  async getUserEmails(accessToken) {
    console.log('[GitHub OAuth] Fetching user emails...');
    return new Promise((resolve, reject) => {
      const https = require('https');
      const options = {
        hostname: 'api.github.com',
        port: 443,
        path: '/user/emails',
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'Clustrix-AI',
          'Accept': 'application/vnd.github.v3+json',
        },
      };

      const req = https.request(options, (res) => {
        console.log('[GitHub OAuth] Emails response status:', res.statusCode);
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const emails = JSON.parse(data);

            if (Array.isArray(emails)) {
              console.log('[GitHub OAuth] Emails retrieved:', emails.length);
              resolve(emails);
            } else {
              reject(new Error('Unexpected emails response format'));
            }
          } catch (err) {
            console.log('[GitHub OAuth] Emails parse error:', err.message);
            reject(err);
          }
        });

        res.on('error', (err) => {
          console.log('[GitHub OAuth] Emails response error:', err.message);
          reject(err);
        });
      });

      req.on('error', (err) => {
        console.log('[GitHub OAuth] Emails request error:', err.message);
        reject(err);
      });

      req.setTimeout(10000, () => {
        console.log('[GitHub OAuth] Emails request timeout');
        req.abort();
        reject(new Error('Emails request timeout'));
      });

      req.end();
    });
  }
}

module.exports = GitHubOAuthHelper;
