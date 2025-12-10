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
  androidClientId: '907693456473-q9f7hdqvoiv5sr10nnd2u506jlr657oa.apps.googleusercontent.com',
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
 * Uses @react-native-google-signin/google-signin (Expo recommended)
 */
export async function loginWithGoogle() {
  try {
    const { GoogleSignin, statusCodes } = require('@react-native-google-signin/google-signin');
    
    // Configure Google Sign-In
    GoogleSignin.configure({
      webClientId: GOOGLE_CONFIG.webClientId, // Required for getting idToken
      offlineAccess: true, // For refresh token
      scopes: GOOGLE_CONFIG.scopes,
    });
    
    console.log('[Auth] Google Sign-In configured');
    
    // Check if user is already signed in
    const hasPreviousSignIn = GoogleSignin.hasPreviousSignIn();
    if (hasPreviousSignIn) {
      console.log('[Auth] Found previous sign-in, signing out first...');
      await GoogleSignin.signOut();
    }
    
    // Sign in
    console.log('[Auth] Starting Google Sign-In...');
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const userInfo = await GoogleSignin.signIn();
    
    console.log('[Auth] Google Sign-In successful!');
    console.log('[Auth] User:', userInfo.data?.user?.email);
    
    // Get tokens
    const tokens = await GoogleSignin.getTokens();
    
    // Format user info
    const user = {
      id: userInfo.data?.user?.id,
      email: userInfo.data?.user?.email,
      name: userInfo.data?.user?.name,
      avatarUrl: userInfo.data?.user?.photo,
      provider: 'google',
    };
    
    // Store credentials
    await storeAuthData('google', tokens.accessToken, user, tokens.idToken);
    
    return {
      success: true,
      provider: 'google',
      user: user,
      accessToken: tokens.accessToken,
      idToken: tokens.idToken,
    };
  } catch (error) {
    console.error('[Auth] Google login error:', error);
    
    // Handle specific errors
    const { statusCodes } = require('@react-native-google-signin/google-signin');
    
    let errorMessage = error.message;
    if (error.code === statusCodes.SIGN_IN_CANCELLED) {
      errorMessage = 'Login dibatalkan';
    } else if (error.code === statusCodes.IN_PROGRESS) {
      errorMessage = 'Login sedang berlangsung';
    } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      errorMessage = 'Google Play Services tidak tersedia';
    }
    
    return {
      success: false,
      error: errorMessage,
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
