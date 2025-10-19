/**
 * Custom environment loader
 * This file mimics dotenv behavior but uses hardcoded values for production builds.
 * 
 * Priority:
 * 1. Load hardcoded values (fallback for production)
 * 2. Check if .env exists in userData folder
 * 3. If exists, parse and override hardcoded values
 * 
 * Usage in main.js:
 *   require('./env.js');
 */

const fs = require('fs');
const path = require('path');

// Hardcoded environment variables for production (fallback)
const hardcodedEnv = {
  GITHUB_CLIENT_ID: 'Ov23liaGOFSuhaPgrPbP',
  GITHUB_CLIENT_SECRET: '3cfc7751c4be95cd17da803bbca099237d4c78c9',
  GITHUB_CALLBACK_URL: 'http://localhost:2920/oauth/callback'
};

// Apply hardcoded values first
Object.keys(hardcodedEnv).forEach(key => {
  if (!process.env[key]) {
    process.env[key] = hardcodedEnv[key];
  }
});

/**
 * Parse .env file content
 * @param {string} content - .env file content
 * @returns {Object} Parsed key-value pairs
 */
function parseEnvFile(content) {
  const result = {};
  const lines = content.toString().split('\n');
  
  for (const line of lines) {
    // Skip empty lines and comments
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    
    // Parse KEY=VALUE format
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim();
      
      // Remove quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      
      result[key] = value;
    }
  }
  
  return result;
}

/**
 * Load environment from userData/.env if available
 */
function loadUserDataEnv() {
  try {
    // Try to get userData path (only available after app.whenReady())
    // For now, we'll try common paths or wait for app to initialize
    const { app } = require('electron');
    
    // Check if app is ready
    if (!app.isReady()) {
      // Will be called later after app ready
      app.whenReady().then(() => {
        const userDataPath = app.getPath('userData');
        const envPath = path.join(userDataPath, '.env');
        
        if (fs.existsSync(envPath)) {
          console.log('[ENV] Loading from userData:', envPath);
          const content = fs.readFileSync(envPath, 'utf8');
          const parsed = parseEnvFile(content);
          
          // Override process.env with values from userData/.env
          Object.keys(parsed).forEach(key => {
            process.env[key] = parsed[key];
          });
          
          console.log('[ENV] Loaded', Object.keys(parsed).length, 'variables from userData/.env');
        } else {
          console.log('[ENV] No .env found in userData, using hardcoded values');
        }
      });
    }
  } catch (error) {
    // Silently fail if electron app is not available yet
    console.log('[ENV] Using hardcoded values (app not ready yet)');
  }
}

// Try to load from userData
loadUserDataEnv();

// Export dotenv-compatible API
module.exports = {
  config: () => {
    // Already loaded above, just return success
    return { parsed: process.env };
  }
};

