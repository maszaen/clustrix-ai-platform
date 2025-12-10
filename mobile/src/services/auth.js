/**
 * Authentication Service
 * Handles GitHub and Google OAuth login flows
 */

import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

// Helper function to generate random string for PKCE
function generateRandomString(length) {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let result = '';
  const randomBytes = new Uint8Array(length);
  // Use Math.random as fallback (not cryptographically secure but works for state)
  for (let i = 0; i < length; i++) {
    randomBytes[i] = Math.floor(Math.random() * 256);
  }
  for (let i = 0; i < length; i++) {
    result += charset[randomBytes[i] % charset.length];
  }
  return result;
}

// Generate code verifier for PKCE
function generateCodeVerifier() {
  return generateRandomString(64);
}

// Generate code challenge from verifier using SHA256
async function generateCodeChallenge(verifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    verifier,
    { encoding: Crypto.CryptoEncoding.BASE64 }
  );
  // Convert to URL-safe base64
  return digest
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// Complete auth session for web browser
WebBrowser.maybeCompleteAuthSession();

// OAuth configuration - Replace these with your actual credentials
const GITHUB_CONFIG = {
  clientId: 'Ov23liPfFwmtdh5r4DYX', // User will replace this
  clientSecret: 'd8d12c44c548694102bdc7a9b07ab08a40bd41f6', // User will replace this
  scopes: ['user', 'user:email', 'repo', 'gist'],
};

const GOOGLE_CONFIG = {
  // Web client ID for Expo Go development (uses auth proxy)
  webClientId: '907693456473-cnui64m5d30cc3p34i1kl5u3up9up8lm.apps.googleusercontent.com',
  // Web client secret (required for code exchange)
  webClientSecret: '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', // Add your client secret here
  // Android client ID for production builds (replace with your Android OAuth client ID)
  androidClientId: 'YOUR_ANDROID_CLIENT_ID',
  scopes: ['openid', 'profile', 'email', 'https://www.googleapis.com/auth/drive.appdata'],
};

// Secure storage keys
const STORAGE_KEYS = {
  AUTH_TOKEN: 'clustrix_auth_token',
  AUTH_PROVIDER: 'clustrix_auth_provider',
  USER_INFO: 'clustrix_user_info',
  LAST_BACKUP: 'clustrix_last_backup',
};

/**
 * Get redirect URI for OAuth
 */
export function getRedirectUri() {
  return AuthSession.makeRedirectUri({
    scheme: 'clustrix',
    path: 'oauth',
  });
}

/**
 * Login with GitHub
 * Opens browser for OAuth flow, returns user info on success
 */
export async function loginWithGitHub() {
  try {
    const redirectUri = getRedirectUri();
    console.log('[Auth] GitHub redirect URI:', redirectUri);
    
    // Build authorization URL
    const authUrl = `https://github.com/login/oauth/authorize?` +
      `client_id=${GITHUB_CONFIG.clientId}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(GITHUB_CONFIG.scopes.join(' '))}` +
      `&state=${Math.random().toString(36).substring(7)}`;
    
    // Open browser for auth
    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);
    
    if (result.type !== 'success') {
      throw new Error('GitHub auth cancelled or failed');
    }
    
    // Extract code from redirect URL
    const url = new URL(result.url);
    const code = url.searchParams.get('code');
    
    if (!code) {
      throw new Error('No authorization code received');
    }
    
    // Exchange code for token
    const tokenData = await exchangeGitHubCode(code, redirectUri);
    
    // Get user info
    const userInfo = await getGitHubUserInfo(tokenData.access_token);
    
    // Store credentials
    await storeAuthData('github', tokenData.access_token, userInfo);
    
    return {
      success: true,
      provider: 'github',
      user: userInfo,
      accessToken: tokenData.access_token,
    };
  } catch (error) {
    console.error('[Auth] GitHub login error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Exchange GitHub auth code for access token
 */
async function exchangeGitHubCode(code, redirectUri) {
  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      client_id: GITHUB_CONFIG.clientId,
      client_secret: GITHUB_CONFIG.clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });
  
  const data = await response.json();
  
  if (data.error) {
    throw new Error(data.error_description || data.error);
  }
  
  return data;
}

/**
 * Get GitHub user info
 */
async function getGitHubUserInfo(accessToken) {
  // Get basic user info
  const userResponse = await fetch('https://api.github.com/user', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/vnd.github.v3+json',
    },
  });
  
  const user = await userResponse.json();
  
  // Get primary email if not public
  let email = user.email;
  if (!email) {
    const emailsResponse = await fetch('https://api.github.com/user/emails', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });
    const emails = await emailsResponse.json();
    const primaryEmail = emails.find(e => e.primary);
    email = primaryEmail?.email || emails[0]?.email;
  }
  
  return {
    id: user.id.toString(),
    username: user.login,
    name: user.name || user.login,
    email: email || `${user.login}@github.com`,
    avatarUrl: user.avatar_url,
    provider: 'github',
  };
}

/**
 * Login with Google
 * Requires development build for OAuth to work properly (Expo Go doesn't support custom URI schemes)
 */
export async function loginWithGoogle() {
  try {
    const Constants = require('expo-constants').default;
    const isExpoGo = Constants.appOwnership === 'expo';
    
    // Google OAuth discovery document
    const discovery = {
      authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenEndpoint: 'https://oauth2.googleapis.com/token',
    };
    
    // Use native scheme - works with development build and production
    const redirectUri = AuthSession.makeRedirectUri({
      scheme: 'clustrix',
      path: 'oauth',
    });
    
    // For Expo Go, the scheme won't work - need development build
    if (isExpoGo) {
      console.log('[Auth] Running in Expo Go - OAuth requires development build');
      console.log('[Auth] Redirect URI would be:', redirectUri);
      
      // Try anyway - might work if user has configured something special
      // But likely will fail
    }
    
    const clientId = isExpoGo ? GOOGLE_CONFIG.webClientId : (GOOGLE_CONFIG.androidClientId || GOOGLE_CONFIG.webClientId);
    
    console.log('[Auth] Google OAuth starting...');
    console.log('[Auth] Redirect URI:', redirectUri);
    console.log('[Auth] Client ID:', clientId.substring(0, 30) + '...');
    console.log('[Auth] Is Expo Go:', isExpoGo);
    
    // Build OAuth URL with PKCE
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const state = generateRandomString(16);
    
    const authUrl = 
      `${discovery.authorizationEndpoint}?` +
      `client_id=${encodeURIComponent(clientId)}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `response_type=code&` +
      `scope=${encodeURIComponent(GOOGLE_CONFIG.scopes.join(' '))}&` +
      `code_challenge=${encodeURIComponent(codeChallenge)}&` +
      `code_challenge_method=S256&` +
      `state=${state}&` +
      `access_type=offline&` +
      `prompt=consent`;
    
    console.log('[Auth] Opening browser...');
    
    // Open browser
    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);
    
    console.log('[Auth] Browser result type:', result.type);
    
    if (result.type !== 'success') {
      if (result.type === 'dismiss') {
        // User closed browser
        if (isExpoGo) {
          throw new Error('Google login requires development build. Run: npx expo run:android');
        }
        throw new Error('Login dibatalkan');
      }
      throw new Error('Google auth failed: ' + result.type);
    }
    
    console.log('[Auth] Got result URL:', result.url);
    
    // Extract authorization code
    let code;
    try {
      const url = new URL(result.url);
      code = url.searchParams.get('code');
    } catch (e) {
      // Try manual extraction
      const match = result.url.match(/[?&]code=([^&]+)/);
      code = match ? decodeURIComponent(match[1]) : null;
    }
    
    if (!code) {
      console.error('[Auth] No code in result URL:', result.url);
      throw new Error('No authorization code received');
    }
    
    console.log('[Auth] Got authorization code, exchanging for tokens...');
    
    // Exchange code for tokens
    const tokenResponse = await fetch(discovery.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: GOOGLE_CONFIG.webClientSecret,
        code,
        code_verifier: codeVerifier,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }).toString(),
    });
    
    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      console.error('[Auth] Token exchange failed:', errorData);
      throw new Error(errorData.error_description || errorData.error || 'Token exchange failed');
    }
    
    const tokenData = await tokenResponse.json();
    console.log('[Auth] Token exchange successful!');
    
    // Get user info
    const userInfo = await getGoogleUserInfo(tokenData.access_token);
    
    // Store credentials
    await storeAuthData('google', tokenData.access_token, userInfo, tokenData.refresh_token);
    
    return {
      success: true,
      provider: 'google',
      user: userInfo,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
    };
  } catch (error) {
    console.error('[Auth] Google login error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Exchange Google auth code for token
 */
async function exchangeGoogleCode(code, redirectUri, clientId, clientSecret) {
  const body = {
    client_id: clientId,
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  };
  
  // Include client_secret for web client (not needed for Android native)
  if (clientSecret) {
    body.client_secret = clientSecret;
  }
  
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(body).toString(),
  });
  
  const data = await response.json();
  
  if (data.error) {
    throw new Error(data.error_description || data.error);
  }
  
  return data;
}

/**
 * Get Google user info
 */
async function getGoogleUserInfo(accessToken) {
  const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });
  
  const user = await response.json();
  
  return {
    id: user.sub,
    username: user.email.split('@')[0],
    name: user.name,
    email: user.email,
    avatarUrl: user.picture,
    provider: 'google',
  };
}

/**
 * Store auth data securely
 */
async function storeAuthData(provider, token, userInfo, refreshToken = null) {
  await SecureStore.setItemAsync(STORAGE_KEYS.AUTH_TOKEN, token);
  await SecureStore.setItemAsync(STORAGE_KEYS.AUTH_PROVIDER, provider);
  await SecureStore.setItemAsync(STORAGE_KEYS.USER_INFO, JSON.stringify(userInfo));
  if (refreshToken) {
    await SecureStore.setItemAsync('clustrix_refresh_token', refreshToken);
  }
}

/**
 * Get stored auth data
 */
export async function getStoredAuth() {
  try {
    const token = await SecureStore.getItemAsync(STORAGE_KEYS.AUTH_TOKEN);
    const provider = await SecureStore.getItemAsync(STORAGE_KEYS.AUTH_PROVIDER);
    const userInfoStr = await SecureStore.getItemAsync(STORAGE_KEYS.USER_INFO);
    
    if (!token || !provider || !userInfoStr) {
      return null;
    }
    
    return {
      accessToken: token,
      provider,
      user: JSON.parse(userInfoStr),
    };
  } catch (error) {
    console.error('[Auth] Error getting stored auth:', error);
    return null;
  }
}

/**
 * Logout - clear all stored auth data
 */
export async function logout() {
  try {
    await SecureStore.deleteItemAsync(STORAGE_KEYS.AUTH_TOKEN);
    await SecureStore.deleteItemAsync(STORAGE_KEYS.AUTH_PROVIDER);
    await SecureStore.deleteItemAsync(STORAGE_KEYS.USER_INFO);
    await SecureStore.deleteItemAsync('clustrix_refresh_token');
    return { success: true };
  } catch (error) {
    console.error('[Auth] Logout error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get last backup time
 */
export async function getLastBackupTime() {
  try {
    const time = await SecureStore.getItemAsync(STORAGE_KEYS.LAST_BACKUP);
    return time ? parseInt(time, 10) : null;
  } catch {
    return null;
  }
}

/**
 * Set last backup time
 */
export async function setLastBackupTime(timestamp = Date.now()) {
  try {
    await SecureStore.setItemAsync(STORAGE_KEYS.LAST_BACKUP, timestamp.toString());
  } catch (error) {
    console.error('[Auth] Error setting last backup time:', error);
  }
}
