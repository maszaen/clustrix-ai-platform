/**
 * Authentication Service
 * Handles Google OAuth login with auto token refresh
 */

import * as SecureStore from 'expo-secure-store';

// Google OAuth configuration
const GOOGLE_CONFIG = {
  webClientId: '50765975600-07gl5g8f1gai0rt22n2jpp03rjsbmnm0.apps.googleusercontent.com',
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
 * Login with Google
 * Uses @react-native-google-signin/google-signin (Expo recommended)
 */
export async function loginWithGoogle() {
  try {
    const { GoogleSignin, statusCodes } = require('@react-native-google-signin/google-signin');
    
    // Configure Google Sign-In
    GoogleSignin.configure({
      webClientId: GOOGLE_CONFIG.webClientId,
      offlineAccess: true,
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
 * Refresh Google token silently
 * Returns fresh access token or null if refresh fails
 */
export async function refreshGoogleToken() {
  try {
    const { GoogleSignin } = require('@react-native-google-signin/google-signin');
    
    // Configure if not already configured
    GoogleSignin.configure({
      webClientId: GOOGLE_CONFIG.webClientId,
      offlineAccess: true,
      scopes: GOOGLE_CONFIG.scopes,
    });
    
    // Check if user was previously signed in
    const hasPreviousSignIn = GoogleSignin.hasPreviousSignIn();
    if (!hasPreviousSignIn) {
      console.log('[Auth] No previous sign-in found, cannot refresh');
      return null;
    }
    
    console.log('[Auth] Attempting silent sign-in to refresh token...');
    
    // Try silent sign-in (refreshes token automatically)
    const userInfo = await GoogleSignin.signInSilently();
    
    // Get fresh tokens
    const tokens = await GoogleSignin.getTokens();
    
    console.log('[Auth] Token refreshed successfully!');
    
    // Update stored token
    const user = {
      id: userInfo.data?.user?.id,
      email: userInfo.data?.user?.email,
      name: userInfo.data?.user?.name,
      avatarUrl: userInfo.data?.user?.photo,
      provider: 'google',
    };
    
    await storeAuthData('google', tokens.accessToken, user, tokens.idToken);
    
    return {
      accessToken: tokens.accessToken,
      idToken: tokens.idToken,
      user: user,
    };
  } catch (error) {
    console.error('[Auth] Token refresh failed:', error);
    return null;
  }
}

/**
 * Get valid ID token - auto-refreshes via silent sign-in
 * Returns fresh idToken for backend API calls
 */
export async function getValidAccessToken() {
  try {
    const { GoogleSignin } = require('@react-native-google-signin/google-signin');
    
    // Configure if not already
    GoogleSignin.configure({
      webClientId: '50765975600-07gl5g8f1gai0rt22n2jpp03rjsbmnm0.apps.googleusercontent.com',
      offlineAccess: true,
      scopes: ['openid', 'profile', 'email', 'https://www.googleapis.com/auth/drive.appdata'],
    });
    
    // Check if signed in
    if (!GoogleSignin.hasPreviousSignIn()) {
      console.log('[Auth] No previous sign-in');
      return null;
    }
    
    // Silent sign-in refreshes tokens automatically
    await GoogleSignin.signInSilently();
    const tokens = await GoogleSignin.getTokens();
    
    console.log('[Auth] Token refreshed successfully');
    return tokens.idToken;
  } catch (error) {
    console.error('[Auth] Token refresh failed:', error.message);
    return null;
  }
}

/**
 * Get valid Access Token for Google Drive API
 * Returns fresh accessToken (not idToken) for Drive operations
 */
export async function getValidDriveToken() {
  try {
    const { GoogleSignin } = require('@react-native-google-signin/google-signin');
    
    // Configure if not already
    GoogleSignin.configure({
      webClientId: '50765975600-07gl5g8f1gai0rt22n2jpp03rjsbmnm0.apps.googleusercontent.com',
      offlineAccess: true,
      scopes: ['openid', 'profile', 'email', 'https://www.googleapis.com/auth/drive.appdata'],
    });
    
    // Check if signed in
    if (!GoogleSignin.hasPreviousSignIn()) {
      console.log('[Auth] No previous sign-in');
      return null;
    }
    
    // Silent sign-in refreshes tokens automatically
    await GoogleSignin.signInSilently();
    const tokens = await GoogleSignin.getTokens();
    
    console.log('[Auth] Drive token refreshed successfully');
    return tokens.accessToken;
  } catch (error) {
    console.error('[Auth] Drive token refresh failed:', error.message);
    return null;
  }
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
    // Sign out from Google
    try {
      const { GoogleSignin } = require('@react-native-google-signin/google-signin');
      await GoogleSignin.signOut();
    } catch (e) {
      // Ignore if Google Sign-In is not configured
    }
    
    // Clear stored data
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
