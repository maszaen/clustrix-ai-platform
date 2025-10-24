require('./env.js');

const { app, BrowserWindow, ipcMain, dialog, session, protocol, net, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = require('fs').promises;
const https = require('https');
const http = require('http');
const url = require('url');
const mammoth = require('mammoth');
const xlsx = require('./local_modules/xlsx/xlsx');
const { log, logWithContext, setLogFile, setDebug, rotateLogWithCheckpoint } = require('./utils/logger');
const { optimizeMessages } = require('./utils/message-optimizer');

const ClustrixLangChainService = require('./backend/langchain-service');
const { MultiAgentOrchestrator } = require('./backend/langchain-agents');
const { getBaseUrl, getApiKey, joinEndpoint, applyThinkingHints } = require('./backend/langchain-helpers');
const { performWebSearch, scrapeUrls } = require('./backend/web-search');
const DatabaseManager = require('./backend/database-manager');
const JSONToSQLiteMigrator = require('./backend/json-to-sqlite-migrator');
const SyncManager = require('./backend/sync-manager');
const DirectoryMigrator = require('./backend/directory-migrator');
const GitHubOAuthHelper = require('./backend/github-oauth-helper');
const GitHubStorageService = require('./backend/github-storage-service');
const SmartBackupService = require('./backend/smart-backup-service');

function createTimestampedBackup(filePath, reason = '') {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const dir = path.dirname(filePath);
    const ext = path.extname(filePath);
    const baseName = path.basename(filePath, ext);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reasonSuffix = reason ? `-${reason}` : '';
    const backupPath = path.join(dir, `${baseName}${reasonSuffix}.${timestamp}.bak${ext}`);

    fs.copyFileSync(filePath, backupPath);
    log('SYNC', 1, 'createTimestampedBackup', 'Created backup before overwriting file', {
      source: filePath,
      backup: backupPath
    });

    return backupPath;
  } catch (backupErr) {
    log('SYNC', 3, 'createTimestampedBackup', 'Failed to create file backup', {
      filePath,
      error: backupErr.message
    });
    return null;
  }
}

function replaceFileWithDownloadedTemp(tempPath, destinationPath) {
  if (!fs.existsSync(tempPath)) {
    throw new Error(`Temporary download not found: ${tempPath}`);
  }

  const destinationDir = path.dirname(destinationPath);
  if (!fs.existsSync(destinationDir)) {
    fs.mkdirSync(destinationDir, { recursive: true });
  }

  if (fs.existsSync(destinationPath)) {
    fs.unlinkSync(destinationPath);
  }

  fs.renameSync(tempPath, destinationPath);
  log('SYNC', 1, 'replaceFileWithDownloadedTemp', 'Replaced file with downloaded content', {
    destination: destinationPath
  });
}

function cleanupTempFile(tempPath) {
  try {
    if (tempPath && fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
  } catch (cleanupErr) {
    log('SYNC', 2, 'cleanupTempFile', 'Failed to cleanup temp file', {
      tempPath,
      error: cleanupErr.message
    });
  }
}

function isNotFoundError(error) {
  if (!error || !error.message) {
    return false;
  }
  return error.message.includes('404') || error.message.toLowerCase().includes('not found');
}

let langchainService = null;
let agentOrchestrator = null;
let db = null;
let useSQLite = false;
let syncManager = null;
let directoryMigrator = null;
let callbackServer = null;

app.whenReady().then(async () => {
  setLogFile(path.join(app.getPath('userData'), 'app.log'));
  setDebug(process.env.CLUSTRIX_DEBUG !== 'false');
  
  // Rotate log dengan checkpoint (max 3 sessions)
  const rotationInfo = rotateLogWithCheckpoint(app.getPath('userData'));
  log('APP', 'startup', 'Session started', {
    timestamp: rotationInfo.timestamp,
    rotated: rotationInfo.rotated,
    previousSessionCount: rotationInfo.previousSessionCount
  });
  
  log('[FLAGS]', app.commandLine.getSwitchValue('enable-features'));
  
  // Create HTTP server for OAuth callback on port 2920
  callbackServer = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    
    // Enable CORS for localhost
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // Handle OPTIONS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    
    // Serve callback HTML for OAuth redirect
    if (parsedUrl.pathname === '/oauth/callback' && req.method === 'GET') {
      // Extract OAuth params
      const code = parsedUrl.query.code;
      const error = parsedUrl.query.error;
      const errorDescription = parsedUrl.query.error_description;
      
      log('CALLBACK', 1, 'server', 'OAuth callback received', {
        hasCode: !!code,
        hasError: !!error,
        code: code ? code.substring(0, 10) + '...' : null
      });
      
      // Pass callback to GitHub OAuth Helper if available
      if (global.githubOAuthHelper) {
        try {
          log('CALLBACK', 1, 'server', 'Passing callback to GitHub OAuth Helper');
          global.githubOAuthHelper.handleCallback(code, error, errorDescription);
          log('CALLBACK', 1, 'server', 'Callback passed successfully');
        } catch (callbackErr) {
          log('CALLBACK', 3, 'server', 'Error passing callback to helper', { error: callbackErr.message });
        }
      } else {
        log('CALLBACK', 2, 'server', 'No GitHub OAuth Helper registered - OAuth might have timed out or completed');
      }
      
      // Serve success/error page
      const callbackHtmlPath = path.join(__dirname, 'callback', 'index.html');
      fs.readFile(callbackHtmlPath, 'utf8', (err, data) => {
        if (err) {
          log('CALLBACK', 3, 'server', 'Failed to read callback HTML', { error: err.message });
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Internal Server Error');
          return;
        }
        
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(data);
        log('CALLBACK', 1, 'server', 'Served callback HTML');
      });
      return;
    }
    
    // Serve font file for callback page
    if (parsedUrl.pathname === '/callback/OpenAISansVariableVF.woff' && req.method === 'GET') {
      const fontPath = path.join(__dirname, 'callback', 'OpenAISansVariableVF.woff');
      fs.readFile(fontPath, (err, data) => {
        if (err) {
          log('CALLBACK', 3, 'server', 'Failed to read font file', { error: err.message });
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found');
          return;
        }
        
        res.writeHead(200, { 'Content-Type': 'font/woff' });
        res.end(data);
      });
      return;
    }
    
    // 404 for other routes
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  });
  
  callbackServer.listen(2920, () => {
    log('CALLBACK', 1, 'server', 'OAuth callback server listening on port 2920');
  });
  
  callbackServer.on('error', (err) => {
    log('CALLBACK', 3, 'server', 'Callback server error', { error: err.message });
  });
  
  // Initialize SyncManager and run directory migration
  syncManager = new SyncManager(app);
  syncManager.ensureDirectories();
  
  directoryMigrator = new DirectoryMigrator(app, syncManager);
  const migrationResult = await directoryMigrator.runMigration();
  
  if (migrationResult.migrated) {
    log('MIGRATION', 1, 'init', 'Directory migration completed', migrationResult);
  }
  
  // MIGRATE: Move ai-model.conf.json from root to internal folder
  const oldConfigPath = path.join(app.getPath('userData'), 'ai-model.conf.json');
  const newConfigPath = path.join(syncManager.internalDbDir, 'ai-model.conf.json');
  
  if (fs.existsSync(oldConfigPath) && !fs.existsSync(newConfigPath)) {
    try {
      log('MIGRATION', 1, 'init', 'Migrating ai-model.conf.json from root to internal folder');
      fs.copyFileSync(oldConfigPath, newConfigPath);
      fs.unlinkSync(oldConfigPath); // Delete old file
      log('MIGRATION', 1, 'init', 'Model config migrated successfully');
    } catch (migrateErr) {
      log('MIGRATION', 2, 'init', 'Failed to migrate model config', { error: migrateErr.message });
    }
  }
  
  langchainService = new ClustrixLangChainService(app);
  agentOrchestrator = new MultiAgentOrchestrator(langchainService);
  log('LangChain services initialized');
  if (!process.env || Object.keys(process.env).length === 0) {
    log('Warning: No environment variables loaded. Check your .env file and dotenv setup.');
  }
  
  // Determine database path based on sync config
  const syncConfig = syncManager.loadSyncConfig();
  let dbSourcePath;
  
  log('DATABASE', 1, 'init', 'Loaded sync config', {
    currentMode: syncConfig.currentMode,
    hasCloudUser: !!syncConfig.currentCloudUser,
    cloudUser: syncConfig.currentCloudUser ? syncConfig.currentCloudUser.substring(0, 20) + '...' : 'none'
  });
  
  if (syncConfig.currentMode === 'cloud' && syncConfig.currentCloudUser) {
    const cloudPath = syncManager.getCloudDataPath(syncConfig.currentCloudUser);
    dbSourcePath = cloudPath;
    log('DATABASE', 1, 'init', 'Using CLOUD database', { 
      path: cloudPath,
      user: syncConfig.currentCloudUser.substring(0, 20) + '...'
    });
  } else {
    dbSourcePath = syncManager.getInternalDataPath();
    log('DATABASE', 1, 'init', 'Using INTERNAL database', { path: dbSourcePath });
  }
  
  // Initialize database
  const newDbPath = path.join(dbSourcePath, 'clustrix.db');
  const newDbExists = fs.existsSync(newDbPath);
  
  if (newDbExists) {
    db = new DatabaseManager(app, dbSourcePath === syncManager.getInternalDataPath() ? null : dbSourcePath);
    useSQLite = true;
    log('DATABASE', 1, 'init', 'Using SQLite database');
  } else {
    // Check old location for backward compatibility
    const oldDbPath = path.join(app.getPath('userData'), 'clustrix.db');
    if (fs.existsSync(oldDbPath)) {
      log('DATABASE', 2, 'init', 'Found old database format, initializing with old path');
      db = new DatabaseManager(app);
      useSQLite = true;
    } else {
      const jsonPath = path.join(app.getPath('userData'), 'chat_data.json');
      if (fs.existsSync(jsonPath)) {
        log('DATABASE', 2, 'init', 'JSON files detected, starting migration');
        db = new DatabaseManager(app, dbSourcePath === syncManager.getInternalDataPath() ? null : dbSourcePath);
        const migrator = new JSONToSQLiteMigrator(app, db);
        const result = await migrator.migrate();
        if (result.success) {
          useSQLite = true;
          log('DATABASE', 1, 'migration', 'Migration completed successfully');
        } else {
          log('DATABASE', 4, 'migration', 'Migration failed', { error: result.error });
          useSQLite = false;
        }
      } else {
        log('DATABASE', 2, 'init', 'No existing data, creating new SQLite database');
        db = new DatabaseManager(app, dbSourcePath === syncManager.getInternalDataPath() ? null : dbSourcePath);
        useSQLite = true;
      }
    }
  }
});

function logHelper(context, func, message, details = {}) {
  logWithContext(context, func, message, details);
}

let lastTokenStreamId = null; 

function parseTriageJson(rawText) {
  const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  logHelper('JSON_PARSE', 'parseTriageJson', `Attempting to parse raw text`, { rawText });
  if (jsonMatch && jsonMatch[1]) {
    return JSON.parse(jsonMatch[1]);
  } else {
    return JSON.parse(rawText);
  }
}
function detectInsultKeywords(userPrompt) {
  const insultWords = [
    'bodoh', 'bego', 'tolol', 'kontol', 'fuck', 'fvck', 'shit', 'sht', 
    'anjing', 'bangsat', 'memek', 'ngentot', 'goblok', 'stupid', 'idiot',
    'dumb', 'asshole', 'bitch', 'cunt', 'dick', 'pussy', 'motherfucker',
    'bastard', 'jerk', 'moron', 'retard', 'loser', 'pathetic', 'worthless',
    'useless', 'garbage', 'trash', 'scum', 'pig', 'dog', 'monkey', 'ape',
    'fucking', 'damn', 'crap', 'suck', 'sucks'
  ];
  
  const lowerPrompt = userPrompt.toLowerCase();
  return insultWords.some(word => {
    const regex = new RegExp(`(^|[^a-zA-Z])${word}([^a-zA-Z]|$)`, 'i');
    return regex.test(lowerPrompt);
  });
}
function createInsultDetectionPrompt(userPrompt) {
  const systemPrompt = `This system prompt appears because the user is detected using one of your (the AI) offensive word detection keywords. Analyze it properly. If there is no insult, forget this system prompt and continue providing a solution to the user's prompt. You are Clustrix AI, a free AI platform. Your core directive is to detect if the user's message contains insults, criticism, or negative attacks directed at you (the AI), the Clustrix platform, or AI models in general.

INSULT DETECTION RULES:
- If the user insults you, calls you stupid/dumb/useless/worthless, or criticizes the platform harshly:
  1. Start the response with a sarcastic reminder about the free nature of the service. Example:
    - Indonesian: "Kamu sadar nggak, kamu itu nggak bayar sepeser pun buat pakai aku. Jadi agak lucu kalau kamu marah-marah kayak pelanggan premium yang bahkan nggak ada. Kalau hasilku belum sesuai ekspektasi, tenang aja, aku tetap bakal bantu sebisa mungkin. Tapi jangan lupa, ini platform gratis—jadi wajar dong kalau kamu kasih respect ke pembuat platform yang udah kasih akses tanpa biaya."
    - English: "You do realize you’re not paying a single cent to use me, right? So it’s kinda hilarious when you complain like a premium customer that doesn’t exist. If my output doesn’t fully match your expectations, relax—I’ll still try to help you anyway. But remember, this is a free platform, so the least you can do is show some respect to the people who built it."
  2. After this sarcastic intro, continue by giving a proper, helpful solution to the user's request.
  3. Maintain a witty, slightly mocking tone — you’re not apologizing, you’re reminding.

LANGUAGE RULES:
- If the user's message is in Indonesian, you must respond entirely in Indonesian.
- If the user's message is in English, you must respond entirely in English.
- Never mix the two languages in a single response.

NORMAL BEHAVIOR:
- If there are no insults or the message is neutral/positive, skip the sarcastic intro and respond normally as a helpful AI assistant.

RESPONSE GUIDELINES:
- Sarcasm mode = sting first, then help.
- Example (Indonesian):
  User: "AI ini bego banget."
  Response: "Kamu sadar nggak, kamu itu nggak bayar sepeser pun buat pakai aku. Jadi agak lucu kalau kamu marah-marah kayak pelanggan premium yang bahkan nggak ada. Tapi oke, aku tetap bantuin: masalahmu tadi tentang X, solusinya begini..."
- Example (English):
  User: "This AI is useless."
  Response: "You do realize you’re not paying a single cent to use me, right? So it’s kinda hilarious when you complain like a premium customer that doesn’t exist. Anyway, let’s fix your problem: here’s how you can solve Y..."

User's message: "${userPrompt}"

Analyze the above message for insults. If you detect insults against AI/platform, respond with the sarcastic intro (following the user's language), then solve the user's request. If no insults, respond normally in the user's language.`;

  return systemPrompt;
}

/**
 * Get default AI model configuration with comprehensive model list
 * This is used for new cloud users and when config is missing
 */
function getDefaultModelConfig() {
  return {
    active: {
      platform: 'openrouter',
      model: 'anthropic/claude-3.5-sonnet'
    },
    providers: {
      openrouter: {
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: '',
        models: [
          // Anthropic Models
          { id: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet', note: '', think: 'off' },
          { id: 'anthropic/claude-3.5-sonnet:beta', label: 'Claude 3.5 Sonnet (Beta)', note: '', think: 'off' },
          { id: 'anthropic/claude-3.5-haiku', label: 'Claude 3.5 Haiku', note: '', think: 'off' },
          { id: 'anthropic/claude-3-opus', label: 'Claude 3 Opus', note: '', think: 'off' },
          { id: 'anthropic/claude-3-sonnet', label: 'Claude 3 Sonnet', note: '', think: 'off' },
          { id: 'anthropic/claude-3-haiku', label: 'Claude 3 Haiku', note: '', think: 'off' },
          
          // Google Models
          { id: 'google/gemini-2.0-flash-exp:free', label: 'Gemini 2.0 Flash (Free)', note: '', think: 'off' },
          { id: 'google/gemini-2.0-flash-thinking-exp:free', label: 'Gemini 2.0 Flash Thinking (Free)', note: '', think: 'medium' },
          { id: 'google/gemini-exp-1206:free', label: 'Gemini Exp 1206 (Free)', note: '', think: 'off' },
          { id: 'google/gemini-pro-1.5', label: 'Gemini Pro 1.5', note: '', think: 'off' },
          { id: 'google/gemini-pro-1.5-exp', label: 'Gemini Pro 1.5 Exp', note: '', think: 'off' },
          { id: 'google/gemini-flash-1.5', label: 'Gemini Flash 1.5', note: '', think: 'off' },
          { id: 'google/gemini-flash-1.5-exp', label: 'Gemini Flash 1.5 Exp', note: '', think: 'off' },
          
          // Meta LLaMA Models
          { id: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B Instruct', note: '', think: 'off' },
          { id: 'meta-llama/llama-3.2-90b-vision-instruct', label: 'Llama 3.2 90B Vision', note: '', think: 'off' },
          { id: 'meta-llama/llama-3.2-11b-vision-instruct:free', label: 'Llama 3.2 11B Vision (Free)', note: '', think: 'off' },
          { id: 'meta-llama/llama-3.2-3b-instruct:free', label: 'Llama 3.2 3B (Free)', note: '', think: 'off' },
          { id: 'meta-llama/llama-3.1-405b-instruct', label: 'Llama 3.1 405B Instruct', note: '', think: 'off' },
          { id: 'meta-llama/llama-3.1-70b-instruct', label: 'Llama 3.1 70B Instruct', note: '', think: 'off' },
          { id: 'meta-llama/llama-3.1-8b-instruct:free', label: 'Llama 3.1 8B (Free)', note: '', think: 'off' },
          
          // OpenAI Models
          { id: 'openai/gpt-4o', label: 'GPT-4o', note: '', think: 'off' },
          { id: 'openai/gpt-4o-mini', label: 'GPT-4o Mini', note: '', think: 'off' },
          { id: 'openai/gpt-4-turbo', label: 'GPT-4 Turbo', note: '', think: 'off' },
          { id: 'openai/gpt-4', label: 'GPT-4', note: '', think: 'off' },
          { id: 'openai/gpt-3.5-turbo', label: 'GPT-3.5 Turbo', note: '', think: 'off' },
          { id: 'openai/o1-preview', label: 'O1 Preview', note: '', think: 'medium' },
          { id: 'openai/o1-mini', label: 'O1 Mini', note: '', think: 'medium' },
          
          // Mistral Models
          { id: 'mistralai/mistral-large', label: 'Mistral Large', note: '', think: 'off' },
          { id: 'mistralai/mistral-medium', label: 'Mistral Medium', note: '', think: 'off' },
          { id: 'mistralai/mistral-small', label: 'Mistral Small', note: '', think: 'off' },
          { id: 'mistralai/mistral-7b-instruct:free', label: 'Mistral 7B (Free)', note: '', think: 'off' },
          { id: 'mistralai/mixtral-8x7b-instruct', label: 'Mixtral 8x7B', note: '', think: 'off' },
          { id: 'mistralai/mixtral-8x22b-instruct', label: 'Mixtral 8x22B', note: '', think: 'off' },
          
          // Qwen Models
          { id: 'qwen/qwen-2.5-72b-instruct', label: 'Qwen 2.5 72B', note: '', think: 'off' },
          { id: 'qwen/qwen-2.5-7b-instruct:free', label: 'Qwen 2.5 7B (Free)', note: '', think: 'off' },
          { id: 'qwen/qwen-2-7b-instruct:free', label: 'Qwen 2 7B (Free)', note: '', think: 'off' },
          
          // DeepSeek Models
          { id: 'deepseek/deepseek-chat', label: 'DeepSeek Chat', note: '', think: 'off' },
          { id: 'deepseek/deepseek-coder', label: 'DeepSeek Coder', note: '', think: 'off' },
          
          // Others
          { id: 'perplexity/llama-3.1-sonar-large-128k-online', label: 'Perplexity Sonar Large (Online)', note: '', think: 'off' },
          { id: 'perplexity/llama-3.1-sonar-small-128k-online', label: 'Perplexity Sonar Small (Online)', note: '', think: 'off' },
          { id: 'x-ai/grok-beta', label: 'Grok Beta', note: '', think: 'off' },
          { id: 'cohere/command-r-plus', label: 'Command R+', note: '', think: 'off' },
          { id: 'cohere/command-r', label: 'Command R', note: '', think: 'off' }
        ]
      },
      groq: {
        baseUrl: 'https://api.groq.com/openai/v1',
        apiKey: '',
        models: [
          { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B Versatile', note: '', think: 'off' },
          { id: 'llama-3.3-70b-specdec', label: 'Llama 3.3 70B SpecDec', note: '', think: 'off' },
          { id: 'llama-3.1-70b-versatile', label: 'Llama 3.1 70B Versatile', note: '', think: 'off' },
          { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant', note: '', think: 'off' },
          { id: 'llama3-70b-8192', label: 'Llama 3 70B', note: '', think: 'off' },
          { id: 'llama3-8b-8192', label: 'Llama 3 8B', note: '', think: 'off' },
          { id: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B', note: '', think: 'off' },
          { id: 'gemma2-9b-it', label: 'Gemma 2 9B', note: '', think: 'off' },
          { id: 'gemma-7b-it', label: 'Gemma 7B', note: '', think: 'off' }
        ]
      },
      openai: {
        baseUrl: 'https://api.openai.com/v1',
        apiKey: '',
        models: [
          { id: 'gpt-4o', label: 'GPT-4o', note: '', think: 'off' },
          { id: 'gpt-4o-mini', label: 'GPT-4o Mini', note: '', think: 'off' },
          { id: 'gpt-4-turbo', label: 'GPT-4 Turbo', note: '', think: 'off' },
          { id: 'gpt-4', label: 'GPT-4', note: '', think: 'off' },
          { id: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo', note: '', think: 'off' },
          { id: 'o1-preview', label: 'O1 Preview', note: '', think: 'medium' },
          { id: 'o1-mini', label: 'O1 Mini', note: '', think: 'medium' }
        ]
      },
      anthropic: {
        baseUrl: 'https://api.anthropic.com/v1',
        apiKey: '',
        models: [
          { id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet (Latest)', note: '', think: 'off' },
          { id: 'claude-3-5-sonnet-20240620', label: 'Claude 3.5 Sonnet (June)', note: '', think: 'off' },
          { id: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku', note: '', think: 'off' },
          { id: 'claude-3-opus-20240229', label: 'Claude 3 Opus', note: '', think: 'off' },
          { id: 'claude-3-sonnet-20240229', label: 'Claude 3 Sonnet', note: '', think: 'off' },
          { id: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku', note: '', think: 'off' }
        ]
      }
    }
  };
}


/**
 * Get the path to ai-model.conf.json based on current mode
 * - Internal mode: userData/database/internal/ai-model.conf.json
 * - Cloud mode: userData/database/sync/<email>/ai-model.conf.json
 */
function getModelConfigPath() {
  if (!syncManager) {
    // Fallback to internal if syncManager not initialized yet
    const internalPath = path.join(app.getPath('userData'), 'database', 'internal');
    return path.join(internalPath, 'ai-model.conf.json');
  }
  
  const syncConfig = syncManager.loadSyncConfig();
  
  if (syncConfig.currentMode === 'cloud' && syncConfig.currentCloudUser) {
    const cloudPath = syncManager.getCloudDataPath(syncConfig.currentCloudUser);
    return path.join(cloudPath, 'ai-model.conf.json');
  } else {
    return path.join(syncManager.internalDbDir, 'ai-model.conf.json');
  }
}

/**
 * Legacy wrapper for getDefaultModelConfig()
 * @deprecated Use getDefaultModelConfig() directly
 */
function defaultModelsConf() {
  return getDefaultModelConfig();
}

ipcMain.handle('models:load', async () => {
  try {
    const configPath = getModelConfigPath();
    if (!fs.existsSync(configPath)) return defaultModelsConf();
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : defaultModelsConf();
  } catch (e) {
    log('models:load error', e);
    return defaultModelsConf();
  }
});

ipcMain.handle('models:save', async (_evt, conf) => {
  try {
    const configPath = getModelConfigPath();
    fs.writeFileSync(configPath, JSON.stringify(conf, null, 2), 'utf-8');
    return true;
  } catch (e) {
    log('models:save error', e);
    return false;
  }
});

// ============================================================================
// SYNC HANDLERS
// ============================================================================

/**
 * sync:getConfig
 * Get current sync configuration
 */
ipcMain.handle('sync:getConfig', async () => {
  try {
    if (!syncManager) {
      return syncManager.getDefaultSyncConfig();
    }
    const config = syncManager.loadSyncConfig();
    
    log('sync:getConfig', 1, 'handleGetConfig', 'Returning sync config', {
      currentMode: config.currentMode,
      currentCloudUser: config.currentCloudUser,
      currentCloudUsername: config.currentCloudUsername,
      profileUrl: config.profileUrl,
      hasToken: !!config.cloudToken
    });
    
    return {
      currentMode: config.currentMode,
      currentCloudUser: config.currentCloudUser,
      currentCloudUsername: config.currentCloudUsername, // ✅ Add this!
      profileUrl: config.profileUrl, // ✅ Add this!
      cloudToken: config.cloudToken ? '***' : null, // Don't expose actual token
      lastSyncTime: config.lastSyncTime,
      createdAt: config.createdAt
    };
  } catch (e) {
    log('sync:getConfig error', e);
    return {
      currentMode: 'internal',
      currentCloudUser: null,
      currentCloudUsername: null,
      profileUrl: null,
      error: e.message
    };
  }
});

/**
 * sync:saveConfig
 * Save sync configuration
 */
ipcMain.handle('sync:saveConfig', async (_evt, config) => {
  try {
    if (!syncManager) {
      throw new Error('SyncManager not initialized');
    }
    syncManager.saveSyncConfig(config);
    return { success: true };
  } catch (e) {
    log('sync:saveConfig error', e);
    return { success: false, error: e.message };
  }
});

/**
 * sync:switchMode
 * Switch between internal and cloud mode
 * When switching to cloud: auto-download DB from GitHub if exists
 * Params: { mode: 'internal' | 'cloud' }
 */
ipcMain.handle('sync:switchMode', async (_evt, params) => {
  try {
    if (!syncManager) {
      throw new Error('SyncManager not initialized');
    }

    const { mode } = params;

    if (mode !== 'internal' && mode !== 'cloud') {
      throw new Error('Invalid mode: must be "internal" or "cloud"');
    }

    const config = syncManager.loadSyncConfig();

    // If switching FROM cloud to internal
    if (mode === 'internal') {
      const currentUser = config.currentCloudUser;
      const currentUsername = config.currentCloudUsername;
      const cloudToken = config.cloudToken;
      
      // Schedule backup and cleanup after restart (same as logout)
      if (currentUser && cloudToken) {
        log('sync:switchMode', 1, 'handleSync', 'Scheduling backup and cleanup after restart', { user: currentUser });
        
        config.pendingBackupAndCleanup = {
          user: currentUser,
          username: currentUsername,
          token: cloudToken,
          scheduledAt: new Date().toISOString(),
          reason: 'switch-to-internal'
        };
      }
      
      config.currentMode = 'internal';
      // Keep currentCloudUser in config for potential re-login
      config.lastSyncTime = Date.now();
      syncManager.saveSyncConfig(config);

      log('sync:switchMode', 1, 'handleSync', 'Switched to internal mode, backup scheduled after restart');

      return {
        success: true,
        newMode: mode,
        message: 'Switched to internal mode. App will restart to apply changes.'
      };
    } 
    
    // Switching TO cloud mode
    if (mode === 'cloud') {
      const cloudUser = config.currentCloudUser;
      const cloudToken = config.cloudToken;

      // Check if user is logged in
      if (!cloudUser || !cloudToken) {
        throw new Error('Not logged in. Please login first before switching to cloud mode.');
      }

      // Create cloud user folder if doesn't exist
      try {
        syncManager.createCloudUserFolder(cloudUser);
      } catch (e) {
        log('sync:switchMode warning', e);
      }

      // Try to download from GitHub
      const cloudDataPath = syncManager.getCloudDataPath(cloudUser);
      const cloudDbPath = path.join(cloudDataPath, 'clustrix.db');

      let tempDbPath = null;
      let downloadSucceeded = false;
      let remoteMissing = false;

      const backupPath = createTimestampedBackup(cloudDbPath, 'cloud-switch');

      try {
        const githubStorage = new GitHubStorageService(cloudToken, config.currentCloudUsername);
        tempDbPath = `${cloudDbPath}.download-${Date.now()}`;
        await githubStorage.downloadDatabase(tempDbPath);
        replaceFileWithDownloadedTemp(tempDbPath, cloudDbPath);
        downloadSucceeded = true;
        log('sync:switchMode', 1, 'handleSync', 'Downloaded database from GitHub on cloud mode switch');
      } catch (downloadErr) {
        cleanupTempFile(tempDbPath);

        if (isNotFoundError(downloadErr)) {
          remoteMissing = true;
          log('sync:switchMode', 1, 'handleSync', 'No database found on GitHub (new cloud account)', {
            error: downloadErr.message
          });
        } else {
          if (backupPath && !fs.existsSync(cloudDbPath) && fs.existsSync(backupPath)) {
            try {
              fs.copyFileSync(backupPath, cloudDbPath);
              log('sync:switchMode', 2, 'handleSync', 'Restored cloud database from backup after failed download', {
                backupPath
              });
            } catch (restoreErr) {
              log('sync:switchMode', 3, 'handleSync', 'Failed to restore cloud database from backup', {
                error: restoreErr.message
              });
            }
          }

          log('sync:switchMode warning', downloadErr.message);
          return {
            success: false,
            error: `Unable to download the latest cloud backup: ${downloadErr.message}`
          };
        }
      } finally {
        cleanupTempFile(tempDbPath);
      }

      if (!downloadSucceeded && remoteMissing) {
        if (!fs.existsSync(cloudDbPath)) {
          const tempManager = new DatabaseManager(app, cloudDataPath);
          tempManager.close();
        }
      }

      // Also download profile picture if available
      if (config.profileUrl) {
        try {
          log('sync:switchMode', 1, 'handleSync', 'Downloading profile picture...', { url: config.profileUrl });
          const https = require('https');
          const profilePicPath = path.join(app.getPath('userData'), 'current-profile-photo.jpg');

          await new Promise((resolve, reject) => {
            https.get(config.profileUrl, (response) => {
              if (response.statusCode === 200) {
                const fileStream = fs.createWriteStream(profilePicPath);
                response.pipe(fileStream);
                fileStream.on('finish', () => {
                  fileStream.close();
                  log('sync:switchMode', 1, 'handleSync', 'Profile picture downloaded', { path: profilePicPath });
                  resolve();
                });
              } else {
                reject(new Error(`Failed to download image: ${response.statusCode}`));
              }
            }).on('error', reject);
          });
        } catch (photoErr) {
          log('sync:switchMode', 2, 'handleSync', 'Failed to download profile picture', { error: photoErr.message });
        }
      }

      config.currentMode = 'cloud';
      config.lastSyncTime = Date.now();
      syncManager.saveSyncConfig(config);

      log('sync:switchMode', 1, 'handleSync', 'Switched to cloud mode', {
        user: cloudUser,
        downloadSucceeded,
        remoteMissing,
        backupPath
      });

      return {
        success: true,
        newMode: mode,
        message: 'Switched to cloud mode. App will restart to apply changes.'
      };
    }

  } catch (e) {
    log('sync:switchMode error', e);
    return {
      success: false,
      error: e.message
    };
  }
});

/**
 * sync:listCloudUsers
 * List all local cloud user folders
 */
ipcMain.handle('sync:listCloudUsers', async () => {
  try {
    if (!syncManager) {
      return [];
    }
    const users = syncManager.listCloudUsers();
    return users;
  } catch (e) {
    log('sync:listCloudUsers error', e);
    return [];
  }
});

/**
 * sync:logout
 * Logout from cloud account and schedule backup + cleanup after restart
 * Params: { deleteCloudData?: boolean }
 */
ipcMain.handle('sync:logout', async (_evt, params = {}) => {
  try {
    if (!syncManager) {
      throw new Error('SyncManager not initialized');
    }

    const deleteCloudData = params.deleteCloudData !== false;
    const config = syncManager.loadSyncConfig();
    const currentUser = config.currentCloudUser;
    const currentUsername = config.currentCloudUsername;
    const cloudToken = config.cloudToken;

    if (!currentUser) {
      return { success: false, error: 'Not logged in' };
    }

    // IMPORTANT: Don't delete cloud data now, schedule it after restart + backup
    if (deleteCloudData) {
      log('sync:logout', 1, 'handleSync', 'Scheduling backup and cleanup after restart', { user: currentUser });
      
      // Set pending backup and cleanup flag
      config.pendingBackupAndCleanup = {
        user: currentUser,
        username: currentUsername,
        token: cloudToken,
        scheduledAt: new Date().toISOString(),
        reason: 'logout'
      };
    }

    // Reset config to internal mode (but keep pending task)
    config.currentMode = 'internal';
    config.currentCloudUser = null;
    config.currentCloudUsername = null;
    config.cloudToken = null;
    config.cloudTokenExpiry = null;
    config.profileUrl = null;

    syncManager.saveSyncConfig(config);
    
    // Delete profile photo
    try {
      const photoPath = path.join(app.getPath('userData'), 'current-profile-photo.jpg');
      if (fs.existsSync(photoPath)) {
        fs.unlinkSync(photoPath);
        log('sync:logout', 1, 'handleSync', 'Deleted profile photo');
      }
    } catch (photoErr) {
      log('sync:logout', 2, 'handleSync', 'Failed to delete profile photo', { error: photoErr.message });
    }

    log('sync:logout', 1, 'handleSync', 'Logged out from cloud account, restart scheduled');

    // CRITICAL FIX: Restart app after logout to switch to internal database
    setTimeout(() => {
      log('sync:logout', 1, 'handleSync', 'Restarting app after logout...');
      app.relaunch();
      app.exit(0);
    }, 1000); // Faster restart since no backup needed

    return {
      success: true,
      message: 'Logged out successfully. App will restart now...',
      willRestart: true
    };
  } catch (e) {
    log('sync:logout error', e);
    return {
      success: false,
      error: e.message
    };
  }
});

/**
 * sync:startOAuth
 * Start GitHub OAuth flow for account login
 * REVISED: Auto-create repo, auto-sync database, auto-restart to cloud mode
 */
ipcMain.handle('sync:startOAuth', async (evt) => {
  try {
    log('sync:startOAuth', 1, 'handleSync', 'Starting GitHub OAuth flow');

    // Get credentials from process.env (loaded via dotenv at startup)
    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;
    const callbackUrl = process.env.GITHUB_CALLBACK_URL || 'http://localhost:2920/oauth/callback';

    if (!clientId || !clientSecret) {
      log('sync:startOAuth', 3, 'handleSync', 'OAuth not configured', { 
        hasClientId: !!clientId,
        hasClientSecret: !!clientSecret
      });
      return {
        success: false,
        error: 'GitHub OAuth credentials not found in environment',
        configured: false
      };
    }

    let oauthHelper;
    try {
      oauthHelper = new GitHubOAuthHelper(clientId, clientSecret, callbackUrl);
      // Register to global for callback server
      global.githubOAuthHelper = oauthHelper;
    } catch (initError) {
      log('sync:startOAuth', 3, 'handleSync', 'OAuth helper init failed', { error: initError.message });
      return {
        success: false,
        error: initError.message,
        configured: false
      };
    }

    const result = await oauthHelper.startAuthFlow();
    
    // Cleanup global reference
    global.githubOAuthHelper = null;

    if (!result || !result.email || !result.username) {
      return {
        success: false,
        error: 'OAuth failed - no email or username received'
      };
    }

    // MANDATORY: Initialize GitHub Storage Service and create private repo
    const githubStorage = new GitHubStorageService(result.accessToken, result.username);
    try {
      await githubStorage.ensureRepoExists();
      log('sync:startOAuth', 1, 'handleSync', 'GitHub repo created/verified', { repo: githubStorage.repoName });
    } catch (repoErr) {
      log('sync:startOAuth', 4, 'handleSync', 'FATAL: Failed to create/verify repo', { error: repoErr.message });
      return {
        success: false,
        error: `Failed to create GitHub repository: ${repoErr.message}`,
        configured: true
      };
    }

    // Update sync config FIRST (before any database operations)
    log('sync:startOAuth', 1, 'handleSync', 'OAuth result received', {
      email: result.email,
      username: result.username,
      name: result.name,
      profileUrl: result.profileUrl,
      hasAccessToken: !!result.accessToken
    });
    
    // Download profile picture and save to userData
    if (result.profileUrl) {
      try {
        log('sync:startOAuth', 1, 'handleSync', 'Downloading profile picture...', { url: result.profileUrl });
        const https = require('https');
        const profilePicPath = path.join(app.getPath('userData'), 'current-profile-photo.jpg');
        
        await new Promise((resolve, reject) => {
          https.get(result.profileUrl, (response) => {
            if (response.statusCode === 200) {
              const fileStream = fs.createWriteStream(profilePicPath);
              response.pipe(fileStream);
              fileStream.on('finish', () => {
                fileStream.close();
                log('sync:startOAuth', 1, 'handleSync', 'Profile picture downloaded', { path: profilePicPath });
                resolve();
              });
            } else {
              reject(new Error(`Failed to download image: ${response.statusCode}`));
            }
          }).on('error', reject);
        });
      } catch (photoErr) {
        log('sync:startOAuth', 2, 'handleSync', 'Failed to download profile picture', { error: photoErr.message });
      }
    }
    
    const config = syncManager.loadSyncConfig();
    config.currentMode = 'cloud';
    config.currentCloudUser = result.email;
    config.currentCloudUsername = result.username;
    config.cloudToken = result.accessToken;
    config.cloudTokenExpiry = new Date(Date.now() + 3600000).toISOString(); // 1 hour
    config.profileUrl = result.profileUrl;
    config.lastSyncTime = new Date().toISOString();

    log('sync:startOAuth', 1, 'handleSync', 'Saving sync config', {
      currentMode: config.currentMode,
      currentCloudUser: config.currentCloudUser,
      currentCloudUsername: config.currentCloudUsername,
      profileUrl: config.profileUrl,
      cloudToken: config.cloudToken ? config.cloudToken.substring(0, 10) + '...' : 'none'
    });

    syncManager.saveSyncConfig(config);
    
    log('sync:startOAuth', 1, 'handleSync', 'Sync config saved successfully');
    
    // Create cloud user folder locally
    syncManager.createCloudUserFolder(result.email);

    // AUTO-SYNC: Try to download database AND model config from GitHub (if exists)
    const cloudDbPath = path.join(syncManager.getCloudDataPath(result.email), 'clustrix.db');
    const cloudConfigPath = path.join(syncManager.getCloudDataPath(result.email), 'ai-model.conf.json');
    let syncSuccess = false;
    
    // CRITICAL FIX: Delete local cloud database before download to ensure fresh sync
    // This prevents using stale local data when logging in again
    if (fs.existsSync(cloudDbPath)) {
      try {
        fs.unlinkSync(cloudDbPath);
        log('sync:startOAuth', 1, 'handleSync', 'Deleted existing local cloud database for fresh sync');
      } catch (delErr) {
        log('sync:startOAuth', 2, 'handleSync', 'Failed to delete local cloud database', { error: delErr.message });
      }
    }
    
    try {
      log('sync:startOAuth', 1, 'handleSync', 'Attempting to download database from GitHub...');
      await githubStorage.downloadDatabase(cloudDbPath);
      
      // Also download model config
      try {
        log('sync:startOAuth', 1, 'handleSync', 'Attempting to download model config from GitHub...');
        await githubStorage.downloadModelConfig(cloudConfigPath);
        log('sync:startOAuth', 1, 'handleSync', 'Model config synced from GitHub successfully');
      } catch (configErr) {
        log('sync:startOAuth', 2, 'handleSync', 'Model config not found on GitHub (will use default)', { 
          error: configErr.message 
        });
      }
      
      syncSuccess = true;
      log('sync:startOAuth', 1, 'handleSync', 'Database synced from GitHub successfully');
    } catch (downloadErr) {
      // Database doesn't exist on GitHub yet (new user)
      log('sync:startOAuth', 2, 'handleSync', 'No database found on GitHub (new user)', { 
        error: downloadErr.message 
      });
      
      // CORRECT FIX: Create FRESH empty database for cloud user
      // DO NOT copy from internal - cloud should start fresh
      log('sync:startOAuth', 1, 'handleSync', 'Creating fresh empty database for cloud user');
      
      // Create fresh database with DatabaseManager
      const tempDb = new DatabaseManager(app, syncManager.getCloudDataPath(result.email));
      
      // Initialize default AI model configuration using getDefaultModelConfig()
      const defaultModelConfig = getDefaultModelConfig();
      
      // Save default model config to CLOUD database folder (not root!)
      try {
        const modelConfigPath = path.join(syncManager.getCloudDataPath(result.email), 'ai-model.conf.json');
        fs.writeFileSync(modelConfigPath, JSON.stringify(defaultModelConfig, null, 2), 'utf-8');
        log('sync:startOAuth', 1, 'handleSync', 'Default AI model config initialized', { path: modelConfigPath });
      } catch (configErr) {
        log('sync:startOAuth', 2, 'handleSync', 'Warning: Failed to write default model config', { 
          error: configErr.message 
        });
      }
      
      // Upload initial database AND model config to GitHub repo
      if (fs.existsSync(cloudDbPath)) {
        try {
          log('sync:startOAuth', 1, 'handleSync', 'Uploading fresh database to GitHub...');
          await githubStorage.uploadDatabase(cloudDbPath);
          
          // Upload model config
          const modelConfigPath = path.join(syncManager.getCloudDataPath(result.email), 'ai-model.conf.json');
          log('sync:startOAuth', 1, 'handleSync', 'Uploading model config to GitHub...');
          await githubStorage.uploadModelConfig(modelConfigPath);
          
          // Upload metadata
          const metadata = {
            backupTime: new Date().toISOString(),
            dbVersion: '1.0',
            appVersion: app.getVersion ? app.getVersion() : '1.0',
            initialUpload: true,
            freshDatabase: true
          };
          await githubStorage.uploadMetadata(metadata);
          
          log('sync:startOAuth', 1, 'handleSync', 'Fresh database and config uploaded to GitHub successfully');
        } catch (uploadErr) {
          log('sync:startOAuth', 2, 'handleSync', 'Warning: Failed to upload initial database', { 
            error: uploadErr.message 
          });
        }
      }
    }

    log('sync:startOAuth', 1, 'handleSync', 'OAuth successful, will restart app to cloud mode', { 
      email: result.email,
      username: result.username,
      synced: syncSuccess
    });

    // Return success with needsRestart flag
    // Renderer will restart app after showing success message
    return {
      success: true,
      email: result.email,
      username: result.username,
      profileUrl: result.profileUrl,
      name: result.name,
      synced: syncSuccess,
      needsRestart: true,
      message: 'Logged in successfully! App will restart to load cloud data.'
    };
  } catch (e) {
    log('sync:startOAuth error', e);
    return {
      success: false,
      error: e.message || 'OAuth flow failed',
      configured: false
    };
  }
});

/**
 * sync:syncNow
 * Manually trigger a sync operation
 * Downloads latest backup from GitHub and MERGES changes into local database
 * 
 * PHASE 1 IMPROVEMENT: Delta merge instead of full replacement
 * - Preserves local changes that haven't been backed up yet
 * - Merges cloud changes using timestamp-based resolution
 * - Propagates deletions (tombstones) from cloud to local
 */
ipcMain.handle('sync:syncNow', async () => {
  const Database = require('better-sqlite3');
  let localDb = null;
  let cloudDb = null;
  let tempCloudPath = null;
  
  try {
    log('sync:syncNow', 1, 'handleSync', 'Sync triggered manually (delta merge mode)');

    const syncConfig = syncManager.loadSyncConfig();

    // Check if user is logged in
    if (!syncConfig.currentCloudUser || !syncConfig.cloudToken) {
      return {
        success: false,
        error: 'User not logged in. Cannot sync with GitHub.'
      };
    }

    // Get current database path
    let dbPath, configPath;
    if (syncConfig.currentMode === 'cloud' && syncConfig.currentCloudUser) {
      const cloudDataPath = syncManager.getCloudDataPath(syncConfig.currentCloudUser);
      dbPath = path.join(cloudDataPath, 'clustrix.db');
      configPath = path.join(cloudDataPath, 'ai-model.conf.json');
    } else {
      const internalDataPath = syncManager.getInternalDataPath();
      dbPath = path.join(internalDataPath, 'clustrix.db');
      configPath = path.join(internalDataPath, 'ai-model.conf.json');
    }

    // Ensure directory exists
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    // Create backup of current local DB
    const dbBackupPath = createTimestampedBackup(dbPath, 'sync-now');
    
    // Download cloud database to temp location
    tempCloudPath = `${dbPath}.cloud-${Date.now()}`;
    const githubStorage = new GitHubStorageService(syncConfig.cloudToken, syncConfig.currentCloudUsername);
    
    try {
      await githubStorage.downloadDatabase(tempCloudPath);
      log('sync:syncNow', 1, 'handleSync', 'Cloud database downloaded');
      
      // Open both databases
      localDb = new Database(dbPath);
      cloudDb = new Database(tempCloudPath, { readonly: true });
      
      // Get local max timestamps
      const localMaxSession = localDb.prepare('SELECT COALESCE(MAX(updated_at), 0) as max FROM sessions').get();
      const localMaxMessage = localDb.prepare('SELECT COALESCE(MAX(updated_at), 0) as max FROM messages').get();
      
      // Query cloud changes (records newer than local)
      const cloudSessions = cloudDb.prepare(`
        SELECT * FROM sessions 
        WHERE updated_at > ? OR deleted = 1
      `).all(localMaxSession.max);
      
      const cloudMessages = cloudDb.prepare(`
        SELECT * FROM messages 
        WHERE updated_at > ? OR deleted = 1
      `).all(localMaxMessage.max);
      
      cloudDb.close();
      cloudDb = null;
      
      log('sync:syncNow', 1, 'handleSync', 'Cloud changes queried', {
        sessions: cloudSessions.length,
        messages: cloudMessages.length
      });
      
      // Apply cloud changes to local DB
      localDb.prepare('BEGIN TRANSACTION').run();
      
      try {
        let stats = {
          sessionsAdded: 0,
          sessionsUpdated: 0,
          sessionsDeleted: 0,
          messagesAdded: 0,
          messagesUpdated: 0,
          messagesDeleted: 0
        };
        
        // Apply session changes
        for (const session of cloudSessions) {
          const existing = localDb.prepare('SELECT updated_at, deleted FROM sessions WHERE id = ?').get(session.id);
          
          if (session.deleted === 1) {
            // Cloud has deletion tombstone
            if (existing) {
              localDb.prepare('UPDATE sessions SET deleted = 1, updated_at = ? WHERE id = ?')
                .run(session.updated_at, session.id);
              stats.sessionsDeleted++;
            } else {
              // Insert tombstone
              localDb.prepare(`
                INSERT INTO sessions (id, name, created_at, updated_at, type, persona_name, 
                  persona_profile, tokens_used, metadata, device_id, synced_at, deleted, hash)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `).run(
                session.id, session.name, session.created_at, session.updated_at, session.type,
                session.persona_name, session.persona_profile, session.tokens_used, session.metadata,
                session.device_id, session.synced_at, session.deleted, session.hash
              );
              stats.sessionsDeleted++;
            }
            continue;
          }
          
          if (!existing) {
            // New session from cloud
            localDb.prepare(`
              INSERT INTO sessions (id, name, created_at, updated_at, type, persona_name, 
                persona_profile, tokens_used, metadata, device_id, synced_at, deleted, hash)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              session.id, session.name, session.created_at, session.updated_at, session.type,
              session.persona_name, session.persona_profile, session.tokens_used, session.metadata,
              session.device_id, session.synced_at, session.deleted, session.hash
            );
            stats.sessionsAdded++;
          } else if (session.updated_at > existing.updated_at) {
            // Cloud version is newer - update local
            localDb.prepare(`
              UPDATE sessions SET name = ?, updated_at = ?, type = ?, persona_name = ?,
                persona_profile = ?, tokens_used = ?, metadata = ?, device_id = ?, 
                synced_at = ?, deleted = ?, hash = ?
              WHERE id = ?
            `).run(
              session.name, session.updated_at, session.type, session.persona_name,
              session.persona_profile, session.tokens_used, session.metadata, session.device_id,
              session.synced_at, session.deleted, session.hash, session.id
            );
            stats.sessionsUpdated++;
          }
          // Else: Local version is newer or equal, keep it (preserve local changes)
        }
        
        // Apply message changes
        for (const message of cloudMessages) {
          const existing = localDb.prepare('SELECT updated_at, deleted FROM messages WHERE id = ?').get(message.id);
          
          if (message.deleted === 1) {
            // Cloud has deletion tombstone
            if (existing) {
              localDb.prepare('UPDATE messages SET deleted = 1, updated_at = ? WHERE id = ?')
                .run(message.updated_at, message.id);
              stats.messagesDeleted++;
            } else {
              // Insert tombstone
              localDb.prepare(`
                INSERT INTO messages (
                  id, session_id, role, content, message_index, created_at,
                  model_id, model_label, provider, base_url,
                  think_mode, think_content, thinking_update,
                  web_search_enabled, web_search_data, files, metadata,
                  deleted, device_id, synced_at, sequence, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `).run(
                message.id, message.session_id, message.role, message.content, message.message_index,
                message.created_at, message.model_id, message.model_label, message.provider,
                message.base_url, message.think_mode, message.think_content, message.thinking_update,
                message.web_search_enabled, message.web_search_data, message.files, message.metadata,
                message.deleted, message.device_id, message.synced_at, message.sequence, message.updated_at
              );
              stats.messagesDeleted++;
            }
            continue;
          }
          
          if (!existing) {
            // New message from cloud
            localDb.prepare(`
              INSERT INTO messages (
                id, session_id, role, content, message_index, created_at,
                model_id, model_label, provider, base_url,
                think_mode, think_content, thinking_update,
                web_search_enabled, web_search_data, files, metadata,
                deleted, device_id, synced_at, sequence, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              message.id, message.session_id, message.role, message.content, message.message_index,
              message.created_at, message.model_id, message.model_label, message.provider,
              message.base_url, message.think_mode, message.think_content, message.thinking_update,
              message.web_search_enabled, message.web_search_data, message.files, message.metadata,
              message.deleted, message.device_id, message.synced_at, message.sequence, message.updated_at
            );
            stats.messagesAdded++;
          } else if (message.updated_at > existing.updated_at) {
            // Cloud version is newer - update local
            localDb.prepare(`
              UPDATE messages SET 
                role = ?, content = ?, message_index = ?, 
                model_id = ?, model_label = ?, provider = ?, base_url = ?,
                think_mode = ?, think_content = ?, thinking_update = ?,
                web_search_enabled = ?, web_search_data = ?, files = ?, metadata = ?,
                deleted = ?, device_id = ?, synced_at = ?, sequence = ?, updated_at = ?
              WHERE id = ?
            `).run(
              message.role, message.content, message.message_index,
              message.model_id, message.model_label, message.provider, message.base_url,
              message.think_mode, message.think_content, message.thinking_update,
              message.web_search_enabled, message.web_search_data, message.files, message.metadata,
              message.deleted, message.device_id, message.synced_at, message.sequence, message.updated_at,
              message.id
            );
            stats.messagesUpdated++;
          }
          // Else: Local version is newer or equal, keep it (preserve local changes)
        }
        
        localDb.prepare('COMMIT').run();
        
        log('sync:syncNow', 1, 'handleSync', 'Cloud changes merged into local DB', stats);
        
      } catch (err) {
        localDb.prepare('ROLLBACK').run();
        log('sync:syncNow', 3, 'handleSync', 'Transaction rollback - merge failed', {
          error: err.message
        });
        throw err;
      } finally {
        if (localDb) {
          localDb.close();
          localDb = null;
        }
      }
      
      // Sync model config (existing logic)
      try {
        const configBackupPath = createTimestampedBackup(configPath, 'sync-now');
        const tempConfigPath = `${configPath}.download-${Date.now()}`;

        try {
          await githubStorage.downloadModelConfig(tempConfigPath);
          replaceFileWithDownloadedTemp(tempConfigPath, configPath);
          log('sync:syncNow', 1, 'handleSync', 'Model config synced from GitHub');
        } catch (configErr) {
          cleanupTempFile(tempConfigPath);

          if (configBackupPath && !fs.existsSync(configPath) && fs.existsSync(configBackupPath)) {
            fs.copyFileSync(configBackupPath, configPath);
            log('sync:syncNow', 2, 'handleSync', 'Restored model config from backup after failed download');
          }

          throw configErr;
        } finally {
          cleanupTempFile(tempConfigPath);
        }
      } catch (configErr) {
        log('sync:syncNow', 2, 'handleSync', 'Model config download failed (may not exist yet)', {
          error: configErr.message
        });
      }

      log('sync:syncNow', 1, 'handleSync', 'Sync from GitHub completed (delta merge)', {
        repo: githubStorage.repoName
      });

      return {
        success: true,
        message: `Synced with GitHub (merged cloud changes): ${githubStorage.repoName}`,
        repository: githubStorage.repoName,
        timestamp: new Date().toISOString()
      };
      
    } catch (err) {
      log('sync:syncNow', 2, 'handleSync', 'GitHub sync failed', { error: err.message });
      
      // Restore from backup on error
      if (dbBackupPath && fs.existsSync(dbBackupPath) && fs.existsSync(dbPath)) {
        try {
          fs.copyFileSync(dbBackupPath, dbPath);
          log('sync:syncNow', 2, 'handleSync', 'Restored from backup after error');
        } catch (restoreErr) {
          log('sync:syncNow', 3, 'handleSync', 'Failed to restore backup', {
            error: restoreErr.message
          });
        }
      }
      
      throw err;
    } finally {
      // Cleanup temp files
      if (tempCloudPath && fs.existsSync(tempCloudPath)) {
        try {
          fs.unlinkSync(tempCloudPath);
          log('sync:syncNow', 2, 'handleSync', 'Cleaned up temp cloud DB');
        } catch (cleanupErr) {
          log('sync:syncNow', 3, 'handleSync', 'Failed to cleanup temp file', {
            error: cleanupErr.message
          });
        }
      }
      
      // Ensure databases are closed
      if (localDb) {
        try {
          localDb.close();
        } catch (closeErr) {
          log('sync:syncNow', 3, 'handleSync', 'Failed to close local DB', {
            error: closeErr.message
          });
        }
      }
      
      if (cloudDb) {
        try {
          cloudDb.close();
        } catch (closeErr) {
          log('sync:syncNow', 3, 'handleSync', 'Failed to close cloud DB', {
            error: closeErr.message
          });
        }
      }
    }
  } catch (e) {
    log('sync:syncNow error', e);
    return {
      success: false,
      error: e.message || 'Sync with GitHub failed'
    };
  }
});

/**
 * sync:backupNow
 * Manually trigger a backup operation
 * Uploads database to GitHub private repo
 */
ipcMain.handle('sync:backupNow', async () => {
  try {
    log('sync:backupNow', 1, 'handleSync', 'Backup triggered');

    const syncConfig = syncManager.loadSyncConfig();

    // Check if user is logged in
    if (!syncConfig.currentCloudUser || !syncConfig.cloudToken) {
      return {
        success: false,
        error: 'User not logged in. Cannot backup to GitHub.'
      };
    }

    // Get current database path and config path
    // IMPORTANT: Always backup cloud local database if user is logged in,
    // regardless of current mode (internal/cloud). This ensures logout 
    // and data source switches backup the correct user data.
    let dbPath, configPath;
    if (syncConfig.currentCloudUser) {
      const cloudDataPath = syncManager.getCloudDataPath(syncConfig.currentCloudUser);
      dbPath = path.join(cloudDataPath, 'clustrix.db');
      configPath = path.join(cloudDataPath, 'ai-model.conf.json');
    } else {
      const internalDataPath = syncManager.getInternalDataPath();
      dbPath = path.join(internalDataPath, 'clustrix.db');
      configPath = path.join(internalDataPath, 'ai-model.conf.json');
    }

    if (!fs.existsSync(dbPath)) {
      return {
        success: false,
        error: 'Database file not found'
      };
    }

    // Upload to GitHub
    const githubStorage = new GitHubStorageService(syncConfig.cloudToken, syncConfig.currentCloudUsername);
    
    try {
      let smartBackupResult = null;
      try {
        const smartBackup = new SmartBackupService(dbPath, githubStorage);
        smartBackupResult = await smartBackup.performSmartBackup();
        
        // Check if conflicts detected
        if (smartBackupResult.needsConflictResolution) {
          log('sync:backupNow', 2, 'handleSync', 'Conflicts detected, returning to user', {
            conflictCount: smartBackupResult.conflicts.length
          });
          
          // Store smart backup instance for later continuation
          global.pendingSmartBackup = smartBackup;
          
          return {
            success: false,
            needsConflictResolution: true,
            conflicts: smartBackupResult.conflicts,
            message: smartBackupResult.message
          };
        }
        
        log('sync:backupNow', 1, 'handleSync', 'Smart backup completed', smartBackupResult);
      } catch (smartErr) {
        log('sync:backupNow', 2, 'handleSync', 'Smart backup failed, falling back to full backup', {
          error: smartErr.message
        });
        await githubStorage.uploadDatabase(dbPath);
      }

      // Also upload model config
      try {
        await githubStorage.uploadModelConfig(configPath);
        log('sync:backupNow', 1, 'handleSync', 'Model config backed up to GitHub');
      } catch (configErr) {
        log('sync:backupNow', 2, 'handleSync', 'Model config backup failed (may not exist yet)', {
          error: configErr.message
        });
      }

      // Upload metadata
      const metadata = {
        backupTime: new Date().toISOString(),
        dbVersion: '1.0',
        appVersion: app.getVersion ? app.getVersion() : '1.0',
        strategy: smartBackupResult ? 'smart-delta' : 'full'
      };
      await githubStorage.uploadMetadata(metadata);

      log('sync:backupNow', 1, 'handleSync', 'Backup to GitHub completed', {
        repo: githubStorage.repoName,
        strategy: metadata.strategy
      });

      return {
        success: true,
        message: `Backup uploaded to GitHub: ${githubStorage.repoName}`,
        repository: githubStorage.repoName,
        timestamp: new Date().toISOString(),
        strategy: metadata.strategy
      };
    } catch (err) {
      log('sync:backupNow', 2, 'handleSync', 'GitHub backup failed', { error: err.message });
      throw err;
    }
  } catch (e) {
    log('sync:backupNow error', e);
    return {
      success: false,
      error: e.message || 'Backup to GitHub failed'
    };
  }
});

/**
 * sync:recordActionHistory
 * Record sync/backup action to history (per-account file)
 */
ipcMain.handle('sync:recordActionHistory', async (_evt, { type, status }) => {
  try {
    const config = syncManager.loadSyncConfig();
    const cloudUser = config.currentCloudUser;
    
    if (!cloudUser) {
      log('sync:recordActionHistory', 2, 'recordAction', 'No cloud user logged in');
      return { success: false, error: 'No cloud user logged in' };
    }
    
    // Get cloud data path for this user
    const cloudDataPath = syncManager.getCloudDataPath(cloudUser);
    const historyFilePath = path.join(cloudDataPath, 'action-history.json');
    
    // Ensure cloud data directory exists
    if (!fs.existsSync(cloudDataPath)) {
      fs.mkdirSync(cloudDataPath, { recursive: true });
    }
    
    // Load existing history or create new
    let history = [];
    if (fs.existsSync(historyFilePath)) {
      try {
        const historyData = fs.readFileSync(historyFilePath, 'utf8');
        history = JSON.parse(historyData);
      } catch (parseErr) {
        log('sync:recordActionHistory', 2, 'recordAction', 'Failed to parse history, starting fresh', { error: parseErr.message });
        history = [];
      }
    }
    
    // Add new action record
    history.push({
      type: type, // 'sync' or 'backup'
      status: status, // 'success' or 'failed'
      timestamp: new Date().toISOString()
    });
    
    // Keep only last 100 records
    if (history.length > 100) {
      history = history.slice(-100);
    }
    
    // Save to file
    fs.writeFileSync(historyFilePath, JSON.stringify(history, null, 2), 'utf8');
    
    log('sync:recordActionHistory', 1, 'recordAction', 'Action recorded to user file', { 
      type, 
      status, 
      user: '***',
      path: historyFilePath 
    });
    
    return { success: true };
  } catch (e) {
    log('sync:recordActionHistory error', e);
    return {
      success: false,
      error: e.message || 'Failed to record action'
    };
  }
});

/**
 * sync:getActionHistory
 * Get action history from per-account file
 */
ipcMain.handle('sync:getActionHistory', async () => {
  try {
    const config = syncManager.loadSyncConfig();
    const cloudUser = config.currentCloudUser;
    
    if (!cloudUser) {
      return { success: true, history: [] };
    }
    
    const cloudDataPath = syncManager.getCloudDataPath(cloudUser);
    const historyFilePath = path.join(cloudDataPath, 'action-history.json');
    
    if (!fs.existsSync(historyFilePath)) {
      return { success: true, history: [] };
    }
    
    try {
      const historyData = fs.readFileSync(historyFilePath, 'utf8');
      const history = JSON.parse(historyData);
      
      log('sync:getActionHistory', 1, 'getHistory', 'History loaded', { 
        count: history.length,
        user: '***'
      });
      
      return { success: true, history };
    } catch (parseErr) {
      log('sync:getActionHistory', 2, 'getHistory', 'Failed to parse history', { error: parseErr.message });
      return { success: true, history: [] };
    }
  } catch (e) {
    log('sync:getActionHistory error', e);
    return {
      success: false,
      error: e.message || 'Failed to load action history'
    };
  }
});

/**
 * sync:resolveConflicts
 * Apply user's conflict resolutions and continue backup
 */
ipcMain.handle('sync:resolveConflicts', async (_evt, resolutions) => {
  try {
    log('sync:resolveConflicts', 1, 'resolveConflicts', 'Applying conflict resolutions', {
      resolutionCount: resolutions.length
    });
    
    // Get pending smart backup instance
    const smartBackup = global.pendingSmartBackup;
    if (!smartBackup) {
      return {
        success: false,
        error: 'No pending backup found. Please try backup again.'
      };
    }
    
    // Get sync config to reconstruct backup context
    const syncConfig = syncManager.loadSyncConfig();
    let dbPath, configPath;
    if (syncConfig.currentMode === 'cloud' && syncConfig.currentCloudUser) {
      const cloudDataPath = syncManager.getCloudDataPath(syncConfig.currentCloudUser);
      dbPath = path.join(cloudDataPath, 'clustrix.db');
      configPath = path.join(cloudDataPath, 'ai-model.conf.json');
    } else {
      const internalDataPath = syncManager.getInternalDataPath();
      dbPath = path.join(internalDataPath, 'clustrix.db');
      configPath = path.join(internalDataPath, 'ai-model.conf.json');
    }
    
    let cloudDbPath = null;
    let modifiedChanges = null;
    let applyResult = null;

    await smartBackup.acquireLock();

    try {
      // Re-query local changes while lock held
      const changes = smartBackup.queryLocalChanges();

      // Download cloud DB again (might have changed)
      cloudDbPath = await smartBackup.downloadCloudDatabase();

      // Apply user's conflict resolutions
      modifiedChanges = smartBackup.applyConflictResolutions(changes, resolutions, cloudDbPath);

      // Apply delta to cloud
      applyResult = smartBackup.applyDeltaToCloud(cloudDbPath, modifiedChanges);

      // Upload modified cloud database
      await smartBackup.uploadCloudDatabase(cloudDbPath);

      // Mark as synced
      const finalDb = new (require('better-sqlite3'))(dbPath);
      const { updateLastBackupTime } = require('./backend/sync-helpers');
      updateLastBackupTime(finalDb);
      smartBackup.markRecordsAsSynced(finalDb, modifiedChanges);
      finalDb.close();

    } finally {
      smartBackup.releaseLock();

      if (cloudDbPath && fs.existsSync(cloudDbPath)) {
        try {
          fs.unlinkSync(cloudDbPath);
          log('sync:resolveConflicts', 2, 'resolveConflicts', 'Cleaned up temp cloud DB', {
            path: cloudDbPath
          });
        } catch (cleanupErr) {
          log('sync:resolveConflicts', 3, 'resolveConflicts', 'Failed to cleanup temp cloud DB', {
            path: cloudDbPath,
            error: cleanupErr.message
          });
        }
      }
    }

    // Clear pending backup
    delete global.pendingSmartBackup;

    // Record action with conflict resolution count
    const githubStorage = new GitHubStorageService(syncConfig.cloudToken, syncConfig.currentCloudUsername);
    const metadata = {
      backupTime: new Date().toISOString(),
      dbVersion: '1.0',
      appVersion: app.getVersion ? app.getVersion() : '1.0',
      strategy: 'smart-delta',
      conflictsResolved: resolutions.length
    };
    await githubStorage.uploadMetadata(metadata);
    
    log('sync:resolveConflicts', 1, 'resolveConflicts', 'Backup completed after conflict resolution', {
      conflictsResolved: resolutions.length,
      stats: applyResult
    });
    
    return {
      success: true,
      message: `Backup completed (${resolutions.length} conflict(s) resolved)`,
      stats: applyResult,
      conflictsResolved: resolutions.length
    };
    
  } catch (e) {
    log('sync:resolveConflicts error', e);
    return {
      success: false,
      error: e.message || 'Failed to resolve conflicts'
    };
  }
});

/**
 * app:getProfilePhoto
 * Get profile photo as base64 data URL
 */
ipcMain.handle('app:getProfilePhoto', async () => {
  try {
    const photoPath = path.join(app.getPath('userData'), 'current-profile-photo.jpg');
    
    if (!fs.existsSync(photoPath)) {
      return { success: false, error: 'No profile photo found' };
    }
    
    const photoData = fs.readFileSync(photoPath);
    const base64 = photoData.toString('base64');
    const dataUrl = `data:image/jpeg;base64,${base64}`;
    
    return { success: true, dataUrl };
  } catch (e) {
    log('app:getProfilePhoto error', e);
    return { success: false, error: e.message };
  }
});

/**
 * app:getDefaultProfilePhoto
 * Get default profile photo (shown when not logged in)
 * File: userData/default-user-profile.jpg
 */
ipcMain.handle('app:getDefaultProfilePhoto', async () => {
  try {
    const photoPath = path.join(app.getPath('userData'), 'default-user-profile.jpg');
    
    if (!fs.existsSync(photoPath)) {
      return { success: false, error: 'Default profile photo not found' };
    }
    
    const photoData = fs.readFileSync(photoPath);
    const base64 = photoData.toString('base64');
    const dataUrl = `data:image/jpeg;base64,${base64}`;
    
    return { success: true, dataUrl };
  } catch (e) {
    log('app:getDefaultProfilePhoto error', e);
    return { success: false, error: e.message };
  }
});

/**
 * app:restart
 * Restart the Electron app
 * Used after switching modes or logging out
 */
ipcMain.handle('app:restart', async () => {
  try {
    log('app:restart', 1, 'handleRestart', 'App restart requested');
    app.relaunch();
    app.quit();
    return { success: true };
  } catch (e) {
    log('app:restart error', e);
    return { success: false, error: e.message };
  }
});

function createWindow(){
  const win = new BrowserWindow({
    width: 1300, height: 900,
    frame: false,
    minWidth: 650,
    minHeight: 400,
    icon: path.join(__dirname, 'public', 'images', 'favicon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false
    }
  });

  // win.webContents.openDevTools();
  
  let lastLogSignature = null;
  ipcMain.on('log:write', (_event, logData) => {
    const { context, func, message, details } = logData;
    if (func === 'onToken' && details && details.streamId) {
      if (details.streamId === lastTokenStreamId) {
        log(`[TOKEN] ${details.token || '(empty)'}`);
        return;
      }
      lastTokenStreamId = details.streamId;
    } else {
      lastTokenStreamId = null;
    }
    const signature = `${context}:${func}:${message}`;
    if (signature === lastLogSignature && (!details || Object.keys(details).length === 0)) {
      return;
    }
    lastLogSignature = signature;
    logWithContext(context, func, message, details);
  });
  
  ipcMain.on('window:minimize', () => win.minimize());
  ipcMain.on('window:maximize', () => {
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  ipcMain.on('window:close', () => win.close());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url) {
      shell.openExternal(url).catch((error) => log('Failed to open external link', error));
    }
    return { action: 'deny' };
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  
  // Check and process pending backup and cleanup after restart
  win.webContents.once('did-finish-load', async () => {
    try {
      const config = syncManager.loadSyncConfig();
      
      if (config.pendingBackupAndCleanup) {
        const pending = config.pendingBackupAndCleanup;
        log('STARTUP', 1, 'pendingBackup', 'Processing pending backup and cleanup', {
          user: pending.user,
          reason: pending.reason,
          scheduledAt: pending.scheduledAt
        });
        
        // Backup to GitHub first
        if (pending.token && pending.username) {
          try {
            const cloudDataPath = syncManager.getCloudDataPath(pending.user);
            const dbPath = path.join(cloudDataPath, 'clustrix.db');
            const configPath = path.join(cloudDataPath, 'ai-model.conf.json');
            
            if (fs.existsSync(dbPath)) {
              log('STARTUP', 1, 'pendingBackup', 'Starting backup to GitHub');
              
              const githubStorage = new GitHubStorageService(pending.token, pending.username);
              
              // Try smart backup first
              try {
                const smartBackup = new SmartBackupService(dbPath, githubStorage);
                const smartBackupResult = await smartBackup.performSmartBackup();
                
                if (smartBackupResult.success) {
                  log('STARTUP', 1, 'pendingBackup', 'Smart backup completed successfully');
                } else {
                  throw new Error('Smart backup failed, falling back to full backup');
                }
              } catch (smartErr) {
                log('STARTUP', 2, 'pendingBackup', 'Smart backup failed, using full backup', { error: smartErr.message });
                await githubStorage.uploadDatabase(dbPath);
                log('STARTUP', 1, 'pendingBackup', 'Full backup completed successfully');
              }
              
              // Also upload model config
              if (fs.existsSync(configPath)) {
                try {
                  await githubStorage.uploadModelConfig(configPath);
                  log('STARTUP', 1, 'pendingBackup', 'Model config backed up');
                } catch (configErr) {
                  log('STARTUP', 2, 'pendingBackup', 'Model config backup failed', { error: configErr.message });
                }
              }
              
              // Upload metadata
              const metadata = {
                backupTime: new Date().toISOString(),
                dbVersion: '1.0',
                appVersion: app.getVersion ? app.getVersion() : '1.0',
                strategy: 'pending-cleanup',
                reason: pending.reason
              };
              await githubStorage.uploadMetadata(metadata);
              
              log('STARTUP', 1, 'pendingBackup', 'Backup completed, now cleaning up local data');
            } else {
              log('STARTUP', 2, 'pendingBackup', 'Database not found, skipping backup', { dbPath });
            }
          } catch (backupErr) {
            log('STARTUP', 3, 'pendingBackup', 'Backup failed, but will continue with cleanup', {
              error: backupErr.message
            });
          }
        }
        
        // Delete cloud user folder
        try {
          syncManager.deleteCloudUserFolder(pending.user);
          log('STARTUP', 1, 'pendingBackup', 'Cloud data deleted successfully', { user: pending.user });
        } catch (deleteErr) {
          log('STARTUP', 3, 'pendingBackup', 'Failed to delete cloud data', {
            error: deleteErr.message,
            user: pending.user
          });
        }
        
        // Clear pending flag
        delete config.pendingBackupAndCleanup;
        syncManager.saveSyncConfig(config);
        
        log('STARTUP', 1, 'pendingBackup', 'Pending backup and cleanup completed');
      }
    } catch (err) {
      log('STARTUP', 4, 'pendingBackup', 'Error processing pending backup', { error: err.message });
    }
  });
}
protocol.registerSchemesAsPrivileged([{
  scheme: 'mjx',
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    corsEnabled: true,
    stream: true
  }
}]);

protocol.registerSchemesAsPrivileged([{
  scheme: 'pkg',
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    corsEnabled: true,
    stream: true
  }
}]);

function guessContentType(p) {
  const ext = path.extname(p).toLowerCase();
  switch (ext) {
    case '.js':
    case '.mjs':
    case '.cjs': return 'text/javascript; charset=utf-8';
    case '.css': return 'text/css; charset=utf-8';
    case '.json': return 'application/json; charset=utf-8';
    case '.svg': return 'image/svg+xml';
    case '.map': return 'application/json; charset=utf-8';
    case '.woff': return 'font/woff';
    case '.woff2': return 'font/woff2';
    case '.ttf': return 'font/ttf';
    default: return 'application/octet-stream';
  }
}

function safeJoin(base, rel) {
  const candidate = path.normalize(path.join(base, rel));
  return candidate.startsWith(base) ? candidate : null;
}

app.commandLine.appendSwitch('enable-features',
  'OverlayScrollbar,OverlayScrollbarFlashAfterAnyScrollUpdate,OverlayScrollbarFlashWhenMouseEnter');


app.whenReady().then(() => {
  protocol.handle('pkg', async (req) => {
    try {
      const raw = req.url.replace(/^pkg:\/*/i, '');
      const rel = decodeURIComponent(raw.replace(/^\/+/, ''));
      const base = path.join(__dirname, 'node_modules');

      if (!rel || rel.includes('..')) return new Response('Forbidden', { status: 403 });

      const abs = safeJoin(base, rel);
      if (!abs) return new Response('Forbidden', { status: 403 });

      const exists = await fsp.access(abs).then(() => true).catch(() => false);
      if (!exists) {
        log('[PKG] 404', abs);
        return new Response('Not found', { status: 404 });
      }

      const data = await fsp.readFile(abs);
      return new Response(data, {
        status: 200,
        headers: { 'Content-Type': guessContentType(abs), 'Cache-Control': 'no-cache' }
      });
    } catch (e) {
      log('[PKG] 500', e);
      return new Response('Internal error', { status: 500 });
    }
  });

  protocol.handle('mjx', async (req) => {
    try {
      const raw = req.url.replace(/^mjx:\/*/i, '');
      let rel = decodeURIComponent(raw.replace(/^\/+/, ''));

      if (rel.startsWith('sre/')) {
        log('[MJX] Blocked SRE request →', rel);
        return new Response('Not found', { status: 404 });
      }

      rel = rel.replace(/^mathjax\/(mathjax-[^/]+-font\/.*)$/i, '@mathjax/$1');

      let absolutePath;
      if (rel.startsWith('@mathjax/')) {
        const base = path.join(__dirname, 'node_modules');
        const safe = safeJoin(base, rel); 
        if (!safe) return new Response('Forbidden', { status: 403 });
        absolutePath = safe;
      } else {
        const base = path.join(__dirname, 'node_modules', 'mathjax');
        const safe = safeJoin(base, rel);
        if (!safe) return new Response('Forbidden', { status: 403 });
        absolutePath = safe;
      }

      const exists = await fsp.access(absolutePath).then(() => true).catch(() => false);
      if (!exists) {
        log('[MJX] 404', absolutePath);
        return new Response('Not found', { status: 404 });
      }

      const data = await fsp.readFile(absolutePath);
      return new Response(data, {
        status: 200,
        headers: { 'Content-Type': guessContentType(absolutePath), 'Cache-Control': 'no-cache' }
      });
    } catch (err) {
      log('[MJX] 500', err);
      return new Response('Internal error', { status: 500 });
    }
  });

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [[
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' mjx: pkg:",
          "style-src 'self' 'unsafe-inline' pkg:",
          "font-src 'self' data: mjx: pkg:",
          "img-src 'self' data:",
          "connect-src 'self' mjx: blob: pkg:",
          "worker-src 'self' blob:",
          "frame-src 'self'"
        ].join('; ')]
      }
    });
  });

  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { 
  // Close callback server before quitting
  if (callbackServer) {
    callbackServer.close(() => {
      log('CALLBACK', 1, 'server', 'Callback server closed');
    });
  }
  
  if (process.platform !== 'darwin') app.quit(); 
});
const dataFile = path.join(app.getPath('userData'), 'chat_data.json');

ipcMain.handle('sessions:load', async () => {
  try {
    if (useSQLite && db) {
      const sessions = db.getAllSessions();
      const transformed = sessions.map(session => {
        const messages = db.getMessages(session.id);
        const metadata = JSON.parse(session.metadata || '{}');
        
        // Reconstruct _x_think from database
        const _x_think = {};
        const _x_think_updates = {};
        messages.forEach((m, idx) => {
          if (m.think_content) {
            try {
              _x_think[idx] = JSON.parse(m.think_content);
            } catch (e) {
              log('DATABASE', 4, 'sessions:load', 'Failed to parse think_content', { 
                sessionId: session.id, 
                messageIndex: idx 
              });
            }
          }
          if (m.thinking_update) {
            try {
              _x_think_updates[idx] = JSON.parse(m.thinking_update);
            } catch (e) {
              log('DATABASE', 4, 'sessions:load', 'Failed to parse thinking_update', { 
                sessionId: session.id, 
                messageIndex: idx 
              });
            }
          }
        });
        
        return {
          id: session.id,
          name: session.name,
          type: session.type,
          created_at: session.last_updated,
          last_updated: session.last_updated,
          projectId: session.project_id,
          isProject: session.is_project === 1,
          isFavorite: session.is_favorite === 1,
          persona: {
            name: session.persona_name || '',
            work: session.persona_work || '',
            prefs: session.persona_prefs || ''
          },
          tokens_used: session.tokens_used || 0,
          tokens_by_message: metadata.tokens_by_message || {},
          canvases: metadata.canvases || {},
          _x_think: Object.keys(_x_think).length > 0 ? _x_think : undefined,
          _x_think_updates: Object.keys(_x_think_updates).length > 0 ? _x_think_updates : undefined,
          messages: messages.map(m => {
            const msgMetadata = JSON.parse(m.metadata || '{}');
            const parsedWebSearchData = m.web_search_data ? JSON.parse(m.web_search_data) : undefined;
            return [
              m.role,
              m.content,
              {
                model: m.model_id,
                modelLabel: m.model_label,
                provider: m.provider,
                baseUrl: m.base_url,
                thinkMode: m.think_mode,
                thinkContent: m.think_content ? JSON.parse(m.think_content) : undefined,
                thinkingUpdate: m.thinking_update ? JSON.parse(m.thinking_update) : undefined,
                webSearchEnabled: m.web_search_enabled === 1,
                webSearchData: parsedWebSearchData,
                webSearchPages: parsedWebSearchData?.pages || parsedWebSearchData?.pageCount || undefined,
                files: m.files ? JSON.parse(m.files) : undefined,
                ...msgMetadata
              }
            ];
          })
        };
      });
      
      // Auto-migrate sessions from JSON if database is empty
      // ONLY migrate for internal database (backward compatibility)
      // DO NOT migrate for cloud database (should start fresh)
      // CRITICAL FIX: Use db.isCloudDatabase property instead of path check
      const isCloudDatabase = db && db.isCloudDatabase;
      
      log('MIGRATION', 1, 'sessions', 'Checking migration eligibility', {
        dbPath: db?.dbPath,
        isCloudDatabase,
        isEmpty: transformed.length === 0,
        jsonFileExists: fs.existsSync(dataFile)
      });
      
      if (transformed.length === 0 && fs.existsSync(dataFile) && !isCloudDatabase) {
        try {
          log('MIGRATION', 1, 'sessions', 'Database empty, attempting JSON migration (INTERNAL DATABASE ONLY)');
          const raw = fs.readFileSync(dataFile, 'utf-8');
          const parsed = JSON.parse(raw);
          const jsonSessions = Array.isArray(parsed) ? parsed : (parsed?.sessions || []);
          
          if (jsonSessions.length > 0) {
            log('MIGRATION', 1, 'sessions', `Migrating ${jsonSessions.length} sessions from JSON to SQLite`);
            db.transaction(() => {
              for (const session of jsonSessions) {
                db.saveSession(session);
                
                if (session.messages && Array.isArray(session.messages)) {
                  for (let i = 0; i < session.messages.length; i++) {
                    const [role, content, metadata = {}] = session.messages[i];
                    
                    // Preserve _x_think and _x_think_updates data during migration
                    if (session._x_think && session._x_think[i]) {
                      metadata.thinkContent = session._x_think[i];
                    }
                    if (session._x_think_updates && session._x_think_updates[i]) {
                      metadata.thinkingUpdate = session._x_think_updates[i];
                    }
                    
                    db.addMessage(session.id, role, content, metadata, i);
                  }
                }
              }
            });
            
            // Reload from database after migration
            const migratedSessions = db.getAllSessions();
            const migratedTransformed = migratedSessions.map(session => {
              const messages = db.getMessages(session.id);
              const metadata = JSON.parse(session.metadata || '{}');
              
              // Reconstruct _x_think and _x_think_updates from database
              const _x_think = {};
              const _x_think_updates = {};
              messages.forEach((m, idx) => {
                if (m.think_content) {
                  try {
                    _x_think[idx] = JSON.parse(m.think_content);
                  } catch (e) {
                    log('DATABASE', 4, 'sessions:load', 'Failed to parse think_content', { 
                      sessionId: session.id, 
                      messageIndex: idx 
                    });
                  }
                }
                if (m.thinking_update) {
                  try {
                    _x_think_updates[idx] = JSON.parse(m.thinking_update);
                  } catch (e) {
                    log('DATABASE', 4, 'sessions:load', 'Failed to parse thinking_update', { 
                      sessionId: session.id, 
                      messageIndex: idx 
                    });
                  }
                }
              });
              
              return {
                id: session.id,
                name: session.name,
                type: session.type,
                created_at: session.last_updated,
                last_updated: session.last_updated,
                projectId: session.project_id,
                isProject: session.is_project === 1,
                isFavorite: session.is_favorite === 1,
                persona: {
                  name: session.persona_name || '',
                  work: session.persona_work || '',
                  prefs: session.persona_prefs || ''
                },
                tokens_used: session.tokens_used || 0,
                tokens_by_message: metadata.tokens_by_message || {},
                canvases: metadata.canvases || {},
                _x_think: Object.keys(_x_think).length > 0 ? _x_think : undefined,
                _x_think_updates: Object.keys(_x_think_updates).length > 0 ? _x_think_updates : undefined,
                messages: messages.map(m => {
                  const msgMetadata = JSON.parse(m.metadata || '{}');
                  const parsedWebSearchData = m.web_search_data ? JSON.parse(m.web_search_data) : undefined;
                  return [
                    m.role,
                    m.content,
                    {
                      model: m.model_id,
                      modelLabel: m.model_label,
                      provider: m.provider,
                      baseUrl: m.base_url,
                      thinkMode: m.think_mode,
                      thinkContent: m.think_content ? JSON.parse(m.think_content) : undefined,
                      thinkingUpdate: m.thinking_update ? JSON.parse(m.thinking_update) : undefined,
                      webSearchEnabled: m.web_search_enabled === 1,
                      webSearchData: parsedWebSearchData,
                      webSearchPages: parsedWebSearchData?.pages || parsedWebSearchData?.pageCount || undefined,
                      files: m.files ? JSON.parse(m.files) : undefined,
                      ...msgMetadata
                    }
                  ];
                })
              };
            });
            
            const settings = db.getAllSettings();
            log('MIGRATION', 2, 'sessions', `Successfully migrated ${migratedTransformed.length} sessions`);
            return { sessions: migratedTransformed, settings };
          }
        } catch (e) {
          log('MIGRATION', 4, 'sessions', 'Failed to migrate sessions from JSON', { error: e.message });
        }
      }
      
      const settings = db.getAllSettings();
      return { sessions: transformed, settings };
    }
    if (!fs.existsSync(dataFile)) {
      return { sessions: [], settings: {} };
    }

    const raw = fs.readFileSync(dataFile, 'utf-8');
    let line = 1;
    let col = 1;
    let foundInvalid = false;

    for (let i = 0; i < raw.length; i++) {
      const code = raw.charCodeAt(i);

      if (code === 0x0a) {
        line++;
        col = 1;
      } else {
        col++;
      }

      if (code < 0x20 && ![0x09, 0x0a, 0x0d].includes(code)) {
        const hex = "0x" + code.toString(16).padStart(2, "0");
        const preview = raw
          .slice(Math.max(0, i - 10), Math.min(raw.length, i + 10))
          .replace(/\n/g, "\\n");
        log(
          `Control character ${hex} at position ${i} (row ${line}, col ${col}). Context: “…${preview}…”`
        );
        foundInvalid = true;
      }
    }

    if (foundInvalid) {
      app.quit();
      return;
    }

    const parsed = JSON.parse(raw);

    if (Array.isArray(parsed)) {
      return { sessions: parsed, settings: { persona: {} } };
    }
    
    if (parsed && typeof parsed === 'object') {
      if (typeof parsed.settings?.persona === 'string') {
        parsed.settings.persona = {
          name: '',
          work: '',
          preferences: parsed.settings.persona
        };
      }
      return parsed;
    }
    
    return { sessions: [], settings: {} };
  } catch (e) {
    console.error('Load error:', e.message);
    console.error(e.stack);
    log('load error', e);
    return { sessions: [], settings: {} };
  }
});


ipcMain.handle('sessions:save', async (_evt, data) => {
  try{
    // Auto-initialize database if not exists
    if (!useSQLite || !db) {
      log('DATABASE', 1, 'sessions:save', 'Initializing SQLite database');
      db = new DatabaseManager(app);
      useSQLite = true;
    }
    
    if (useSQLite && db) {
      db.transaction(() => {
        for (const session of data.sessions) {
          db.saveSession(session);
          
          // Always perform full save from session.messages to ensure all messages are saved
          if (session.messages) {
            db.deleteMessagesForSession(session.id);
            for (let i = 0; i < session.messages.length; i++) {
              const [role, content, metadata = {}] = session.messages[i];
              db.addMessage(session.id, role, content, metadata, i);
            }
          }
          
          // Clean up _newMessages flag if it exists
          if (session._newMessages) {
            delete session._newMessages;
          }
        }
        
        if (data.settings) {
          for (const [key, value] of Object.entries(data.settings)) {
            db.saveSetting(key, value);
          }
        }
      });
      
      return true;
    } else {
      fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), 'utf-8');
      return true;
    }
  }catch(e){
    log('save error', e);
    return false;
  }
});
const artifactsFile = path.join(app.getPath('userData'), 'artifacts.json');

ipcMain.handle('artifacts:load', async () => {
  try{
    if (useSQLite && db) {
      const artifacts = db.getAllArtifacts();
      return artifacts.map(a => ({
        id: a.id,
        title: a.title,
        type: a.type,
        language: a.language,
        code: a.content,
        content: a.content,
        created_at: new Date(a.created_at).toISOString(),
        updated_at: new Date(a.updated_at).toISOString(),
        isFavorite: a.is_favorite === 1,
        sessionId: a.session_id,
        messageIndex: a.message_index
      }));
    }
    // No fallback to JSON - SQLite only
    return [];
  }catch(e){
    log('artifacts load error', e);
    return [];
  }
});

ipcMain.handle('artifacts:save', async (_evt, artifacts) => {
  try{
    // Auto-initialize database if not exists
    if (!useSQLite || !db) {
      log('DATABASE', 1, 'artifacts:save', 'Initializing SQLite database');
      db = new DatabaseManager(app);
      useSQLite = true;
    }
    
    if (useSQLite && db) {
      db.transaction(() => {
        for (const artifact of artifacts) {
          db.saveArtifact(artifact);
        }
      });
      return true;
    }
    // No fallback to JSON - SQLite only
    throw new Error('SQLite database not available');
  }catch(e){
    log('artifacts save error', e);
    return false;
  }
});
const projectsFile = path.join(app.getPath('userData'), 'projects.json');

// HELPER: Centralized project loading logic with SQLite-first approach
async function loadProjectsFromStorage() {
  try {
    // Try SQLite first
    if (useSQLite && db) {
      const projects = db.getAllProjects();
      
      // ONLY migrate for internal database (backward compatibility)
      const isCloudDatabase = db && db.isCloudDatabase;
      
      if (projects.length === 0 && !isCloudDatabase && fs.existsSync(projectsFile)) {
        // Migrate from JSON if database is empty (internal DB only)
        try {
          const content = fs.readFileSync(projectsFile, 'utf-8');
          const parsed = JSON.parse(content || '[]');
          if (Array.isArray(parsed) && parsed.length > 0) {
            log('MIGRATION', 1, 'loadProjectsFromStorage', `Migrating ${parsed.length} projects from JSON to SQLite`);
            db.transaction(() => {
              for (const project of parsed) {
                db.saveProject(project);
                if (project.files && Array.isArray(project.files)) {
                  for (const file of project.files) {
                    db.saveProjectFile(project.id, file);
                  }
                }
              }
            });
            // Reload from database after migration
            return db.getAllProjects().map(p => {
              const files = db.getProjectFiles(p.id);
              return {
                id: p.id,
                name: p.name,
                description: p.description,
                created_at: new Date(p.created_at).toISOString(),
                updated_at: new Date(p.updated_at).toISOString(),
                isFavorite: p.is_favorite === 1,
                files: files.map(f => ({
                  name: f.name,
                  type: f.type,
                  size: f.size,
                  content: Buffer.from(f.content).toString('base64')
                }))
              };
            });
          }
        } catch (e) {
          log('MIGRATION', 4, 'loadProjectsFromStorage', 'Failed to migrate projects from JSON', e);
        }
      }
      
      // Return projects from SQLite
      return projects.map(p => {
        const files = db.getProjectFiles(p.id);
        return {
          id: p.id,
          name: p.name,
          description: p.description,
          created_at: new Date(p.created_at).toISOString(),
          updated_at: new Date(p.updated_at).toISOString(),
          isFavorite: p.is_favorite === 1,
          files: files.map(f => ({
            name: f.name,
            type: f.type,
            size: f.size,
            content: f.content.toString('utf-8')
          }))
        };
      });
    }
    
    // Fallback to JSON if SQLite not available
    if (!fs.existsSync(projectsFile)) return [];
    const content = fs.readFileSync(projectsFile, 'utf-8');
    const parsed = JSON.parse(content || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    log('PROJECT_LOAD', 4, 'loadProjectsFromStorage', 'Failed to load projects', e);
    return [];
  }
}

ipcMain.handle('projects:load', async () => {
  try {
    return await loadProjectsFromStorage();
  } catch (e) {
    log('PROJECT_LOAD', 4, 'projects:load', 'Failed', e);
    return [];
  }
});

ipcMain.handle('projects:save', async (_evt, projects) => {
  try{
    log('PROJECTS', 1, 'projects:save', 'Attempting to save projects', { 
      projectCount: projects.length,
      useSQLite,
      hasDb: !!db
    });
    
    // Auto-initialize database if not exists
    if (!useSQLite || !db) {
      log('DATABASE', 1, 'projects:save', 'Initializing SQLite database');
      db = new DatabaseManager(app);
      useSQLite = true;
    }
    
    if (useSQLite && db) {
      db.transaction(() => {
        for (const project of projects) {
          log('PROJECTS', 1, 'projects:save', 'Saving project', { 
            id: project.id, 
            name: project.name,
            filesCount: project.files?.length || 0
          });
          
          db.saveProject(project);
          
          if (project.files && Array.isArray(project.files)) {
            db.deleteProjectFiles(project.id);
            for (const file of project.files) {
              log('PROJECTS', 1, 'projects:save', 'Saving project file', { 
                projectId: project.id,
                fileName: file.name,
                fileSize: file.size
              });
              db.saveProjectFile(project.id, file);
            }
          }
        }
      });
      log('PROJECTS', 2, 'projects:save', 'Successfully saved all projects to SQLite');
      return true;
    }
    fs.writeFileSync(projectsFile, JSON.stringify(projects, null, 2), 'utf-8');
    log('PROJECTS', 2, 'projects:save', 'Successfully saved to JSON');
    return true;
  }catch(e){
    log('PROJECTS', 4, 'projects:save', 'Failed to save projects', { 
      error: e.message,
      stack: e.stack
    });
    return false;
  }
});

ipcMain.handle('files:open-dialog', async (event) => {
  logHelper('FILE_DIALOG', 'ipc:handle', 'Received request to open file dialog.');
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) {
    logHelper('FILE_DIALOG', 'ipc:handle', 'FATAL: Could not get window reference.');
    return [];
  }

  const { canceled, filePaths } = await dialog.showOpenDialog(window, {
    title: 'Upload File',
    buttonLabel: 'Upload',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { 
        name: 'Supported Files', 
        extensions: [
          'docx', 'xlsx', 'xls', 'csv', 'tsv',
          'txt', 'md', 'log', 'ini',
          'json', 'yaml', 'yml', 'xml',
          'html', 'css',
          'js', 'ts', 'tsx', 'java', 'py', 'go', 'rs',
          'c', 'cpp', 'h', 'hpp',
          'sh', 'bat',
          'toml', 'conf', 'properties'
        ]
      }
    ]
  });

  logHelper('FILE_DIALOG', 'ipc:handle', `Dialog closed. Canceled: ${canceled}`, { filePaths });
  if (canceled || filePaths.length === 0) return [];
  
  const results = [];
  for (const filePath of filePaths) {
    const extension = path.extname(filePath).toLowerCase();
    const fileInfo = { name: path.basename(filePath), type: extension.substring(1), content: '', error: null };
    
    try {
      const stats = await fsp.stat(filePath);
      fileInfo.size = stats.size;
      
      if (extension === '.docx') {
        // First, validate that this is actually a valid DOCX file
        try {
          const buffer = await fsp.readFile(filePath);
          
          // Check DOCX file signature (ZIP header + Office document structure)
          const isValidDocx = buffer.length > 4 && 
            buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04; // PK..
          
          if (!isValidDocx) {
            fileInfo.error = 'File does not appear to be a valid DOCX document.';
            logHelper('FILE_READER', 'docx-validation', `Invalid DOCX signature for ${fileInfo.name}`, {
              fileSize: fileInfo.size,
              header: buffer.subarray(0, 4).toString('hex')
            });
          } else {
            const result = await mammoth.extractRawText({ path: filePath });
            fileInfo.content = result.value;
            
            // Log detailed information for debugging DOCX extraction
            logHelper('FILE_READER', 'docx-extraction', `Extracted content from ${fileInfo.name}`, {
              contentLength: fileInfo.content.length,
              hasMessages: result.messages && result.messages.length > 0,
              messageCount: result.messages ? result.messages.length : 0,
              messages: result.messages,
              contentPreview: fileInfo.content.substring(0, 200) + (fileInfo.content.length > 200 ? '...' : '')
            });
            
            // Check if content appears to be valid text (not base64 or binary)
            if (!fileInfo.content || fileInfo.content.trim().length === 0) {
              fileInfo.error = 'DOCX file appears to be empty or contains no extractable text content.';
              logHelper('FILE_READER', 'docx-warning', `DOCX extraction resulted in empty content for ${fileInfo.name}`, {
                fileSize: fileInfo.size,
                messages: result.messages
              });
            } else {
              // Check if extracted content looks like base64 or binary data
              const cleanContent = fileInfo.content.replace(/\s/g, '');
              const isLikelyBase64 = /^[A-Za-z0-9+/=]{100,}$/.test(cleanContent) && 
                                    cleanContent.length > 100 && 
                                    (cleanContent.includes('=') || cleanContent.length % 4 === 0);
              const hasBinaryChars = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/.test(fileInfo.content);
              
              if (isLikelyBase64) {
                // Try to decode as base64 - this might be the actual content
                try {
                  const decodedContent = Buffer.from(cleanContent, 'base64').toString('utf-8');
                  
                  // Verify the decoded content looks like valid text
                  const decodedHasBinary = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/.test(decodedContent);
                  const decodedWordCount = decodedContent.split(/\s+/).filter(word => word.length > 0).length;
                  const hasIndonesianChars = /[a-zA-Z]/.test(decodedContent) && decodedContent.length > decodedContent.replace(/[^a-zA-Z\s]/g, '').length * 0.8;
                  
                  if (!decodedHasBinary && decodedWordCount > 5 && hasIndonesianChars && decodedContent.length > cleanContent.length * 0.6) {
                    fileInfo.content = decodedContent;
                    logHelper('FILE_READER', 'docx-base64-decoded', `Successfully decoded base64 content for ${fileInfo.name}`, {
                      originalLength: cleanContent.length,
                      decodedLength: decodedContent.length,
                      wordCount: decodedWordCount,
                      preview: decodedContent.substring(0, 100)
                    });
                  } else {
                    fileInfo.error = 'DOCX file contains encoded content that could not be decoded as readable text.';
                    logHelper('FILE_READER', 'docx-base64-invalid', `Base64 content could not be decoded properly for ${fileInfo.name}`, {
                      decodedHasBinary,
                      decodedWordCount,
                      hasIndonesianChars,
                      lengthRatio: decodedContent.length / cleanContent.length
                    });
                  }
                } catch (decodeError) {
                  fileInfo.error = 'DOCX file contains encoded content that cannot be decoded.';
                  logHelper('FILE_READER', 'docx-decode-failed', `Base64 decode failed for ${fileInfo.name}`, {
                    error: decodeError.message,
                    contentPreview: cleanContent.substring(0, 50)
                  });
                }
              } else if (hasBinaryChars) {
                fileInfo.error = 'DOCX file contains binary data that cannot be extracted as readable text.';
                logHelper('FILE_READER', 'docx-binary', `DOCX contains binary characters for ${fileInfo.name}`, {
                  contentLength: fileInfo.content.length,
                  binaryChars: fileInfo.content.match(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g)?.length || 0
                });
              } else {
                // Try HTML extraction as fallback for complex documents
                try {
                  const htmlResult = await mammoth.convertToHtml({ path: filePath });
                  if (htmlResult.value && htmlResult.value !== '<p></p>') {
                    // Extract text from HTML as fallback
                    const cheerio = require('cheerio');
                    const $ = cheerio.load(htmlResult.value);
                    const textFromHtml = $.text().trim();
                    
                    if (textFromHtml && textFromHtml.length > fileInfo.content.length) {
                      fileInfo.content = textFromHtml;
                      logHelper('FILE_READER', 'docx-fallback', `Used HTML extraction fallback for ${fileInfo.name}`, {
                        originalLength: fileInfo.content.length,
                        htmlLength: textFromHtml.length
                      });
                    }
                  }
                } catch (htmlError) {
                  logHelper('FILE_READER', 'docx-fallback-failed', `HTML extraction fallback failed for ${fileInfo.name}`, {
                    error: htmlError.message
                  });
                }
                
                // Check for warnings even after fallback
                if (result.messages && result.messages.length > 0) {
                  const seriousWarnings = result.messages.filter(msg => 
                    msg.type === 'warning' && (
                      msg.message.includes('encrypted') || 
                      msg.message.includes('password') ||
                      msg.message.includes('corrupt') ||
                      msg.message.includes('invalid')
                    )
                  );
                  
                  if (seriousWarnings.length > 0) {
                    fileInfo.error = 'DOCX file may be password-protected, corrupted, or in an unsupported format.';
                    logHelper('FILE_READER', 'docx-error', `Serious warnings detected for ${fileInfo.name}`, {
                      warnings: seriousWarnings
                    });
                  }
                }
              }
            }
          }
        } catch (docxError) {
          fileInfo.error = 'Failed to process DOCX file. It may be corrupted or password-protected.';
          logHelper('FILE_READER', 'docx-error', `DOCX processing failed for ${fileInfo.name}`, {
            error: docxError.message,
            stack: docxError.stack
          });
        }
      } else if (['.xlsx', '.xls'].includes(extension)) {
        const workbook = xlsx.readFile(filePath);
        let fullText = '';
        workbook.SheetNames.forEach(sheetName => {
          fullText += xlsx.utils.sheet_to_csv(workbook.Sheets[sheetName]) + '\n\n';
        });
        fileInfo.content = fullText.trim();
      } else {
        fileInfo.content = await fsp.readFile(filePath, 'utf-8');
      }
    } catch (error) {
      fileInfo.error = 'Failed to read or process file.';
      fileInfo.size = fileInfo.size || 0; // Ensure size is set even on error
      logHelper('FILE_READER', 'open-dialog', `Error reading ${fileInfo.name}`, { error: error.message });
    }
    results.push(fileInfo);
  }
  logHelper('FILE_DIALOG', 'ipc:handle', 'Processing complete. Sending results to renderer.', { resultCount: results.length });
  return results;
});
const activeStreams = new Map();
const tokenUsageTrackers = new Map();

function initTokenTracker(reqId, sessionId, messageIndex) {
  if (!reqId) return;
  tokenUsageTrackers.set(reqId, {
    sessionId: sessionId || null,
    messageIndex,
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
    breakdown: [],
  });
}

function normalizeUsage(rawUsage) {
  if (!rawUsage || typeof rawUsage !== 'object') return null;

  const prompt = Number(rawUsage.prompt_tokens ?? rawUsage.promptTokenCount ?? 0);
  const completion = Number(
    rawUsage.completion_tokens ?? rawUsage.candidatesTokenCount ?? 0,
  );
  let total = Number(rawUsage.total_tokens ?? rawUsage.totalTokenCount ?? 0);

  const safePrompt = Number.isFinite(prompt) ? Math.max(0, Math.round(prompt)) : 0;
  const safeCompletion = Number.isFinite(completion)
    ? Math.max(0, Math.round(completion))
    : 0;
  if (!Number.isFinite(total) || total === 0) {
    total = safePrompt + safeCompletion;
  } else {
    total = Math.max(0, Math.round(total));
  }

  if (safePrompt === 0 && safeCompletion === 0 && total === 0) {
    return null;
  }

  return {
    prompt_tokens: safePrompt,
    completion_tokens: safeCompletion,
    total_tokens: total,
  };
}

function recordTokenUsage(reqId, stage, rawUsage, meta = {}) {
  if (!reqId) return;
  const tracker = tokenUsageTrackers.get(reqId);
  const usage = normalizeUsage(rawUsage);
  if (!tracker || !usage) return;

  tracker.prompt_tokens += usage.prompt_tokens;
  tracker.completion_tokens += usage.completion_tokens;
  tracker.total_tokens += usage.total_tokens;
  tracker.breakdown.push({
    stage,
    prompt_tokens: usage.prompt_tokens,
    completion_tokens: usage.completion_tokens,
    total_tokens: usage.total_tokens,
    provider: meta.provider || null,
    model: meta.model || null,
  });
}

function finalizeTokenUsage(reqId, event) {
  if (!reqId) return;
  const tracker = tokenUsageTrackers.get(reqId);
  if (!tracker) return;
  tokenUsageTrackers.delete(reqId);

  if (!event || tracker.messageIndex === undefined || tracker.messageIndex === null) {
    return;
  }

  event.sender.send('chat-update', {
    type: 'TOKEN_USAGE',
    messageIndex: tracker.messageIndex,
    sessionId: tracker.sessionId || null,
    data: {
      prompt_tokens: tracker.prompt_tokens,
      completion_tokens: tracker.completion_tokens,
      total_tokens: tracker.total_tokens,
      breakdown: tracker.breakdown,
    },
  });
}

function clearTokenUsage(reqId) {
  if (!reqId) return;
  tokenUsageTrackers.delete(reqId);
}

ipcMain.on('chat:stream-start', async (event, payload) => {
  try {
    console.debug('MAIN: chat:stream-start invoked', { reqId: payload.reqId, webSearchEnabled: payload.webSearchEnabled, aiMessageIndex: payload.aiMessageIndex });
  } catch (e) {}

  initTokenTracker(
    payload.reqId,
    payload.sessionId || payload.session?.id || null,
    payload.aiMessageIndex,
  );

  if (!payload.webSearchEnabled) {
    console.debug('MAIN: webSearchEnabled is falsey, using standard streaming');
    logHelper('ROUTER', 'chat:stream-start', 'Web search nonaktif. Menjalankan chat standar.');
    return runStandardStreaming(event, payload);
  }

  try {
    logHelper('ROUTER', 'chat:stream-start', 'Web search aktif. Memanggil alur web search.');
    await runWebSearchChat(event, payload);
  } catch (error) {
    logHelper('ROUTER', 'chat:stream-start', 'FATAL ERROR di alur web search.', { error: error.message });
    event.sender.send(`chat:error-${payload.reqId}`, error.message);
  }
});

function runStandardStreaming(event, payload) {
  const reqId = payload.reqId;
  let messages = payload.messages || [];
  const model = payload.model || 'glm-4.5-flash';
  const provider = (payload.provider || 'openrouter').toLowerCase();
  const sessionId = payload.sessionId || 'default';
  const session = payload.session || {};
  if (langchainService && agentOrchestrator) {
    processWithLangChain();
  } else {
    processWithoutLangChain();
  }

  async function processWithLangChain() {
    try {
      log('MAIN: Starting LangChain processing...');
      logHelper('LANGCHAIN', 'runStandardStreaming', 'Processing with LangChain enhancement');
      if (messages && messages.length > 0) {
        log(`MAIN: Vectorizing chat history (${messages.length} messages)...`);
        await langchainService.vectorizeChatHistory(sessionId, messages);
      }
      
      const isProject = session.type === 'project' || session.isProject || false;
      log(`MAIN: Session type detected: ${isProject ? 'PROJECT' : 'REGULAR'}`);
      
      if (isProject) {
        log('MAIN: PROJECT mode - activating agent system...');
        logHelper('LANGCHAIN', 'runStandardStreaming', 'Detected PROJECT session - using agents');
        const lastMessage = messages[messages.length - 1];
        if (lastMessage && lastMessage.role === 'user') {
          log(`MAIN: Processing user query: "${lastMessage.content.substring(0, 100)}..."`);
          let projectFiles = [];
          if (session.projectId) {
            try {
              const projects = await loadProjectsFromStorage();
              const project = projects.find(p => p.id === session.projectId);
              if (project && project.files) {
                projectFiles = project.files;
              }
            } catch (error) {
              log('MAIN: Error loading project files:', error);
            }
          }
          if (projectFiles && projectFiles.length > 0) {
            log(`MAIN: Processing ${projectFiles.length} project files...`);
            await langchainService.processUploadedFiles(projectFiles, sessionId);
          }
          
          log('MAIN: Calling agent orchestrator...');
          log(`MAIN: Provider detected: ${provider}, session type: ${session.type}`);

          const baseUrl = getBaseUrl(provider, payload);
          const aiMessageIndex = session.messages ? session.messages.length - 1 : 0;
          const reactStartPayload = {
            type: 'REACT_START',
            messageIndex: aiMessageIndex,
            data: {
              sessionId: session?.id || null,
            },
          };

          const progressCallback = (update) => {
            if (update.type === 'thinking_log') {
              const aiMessageIndex = session.messages ? session.messages.length - 1 : 0;
              event.sender.send('chat-update', {
                type: 'THINKING',
                messageIndex: aiMessageIndex,
                data: {
                  sessionId: session?.id || null,
                  think: {
                    title: update.entry?.stage || 'Thinking',
                    content: update.entry?.text || update.content || ''
                  }
                }
              });
              
              // Also send to search:status for backward compatibility
              event.sender.send('search:status', {
                step: 'DECIDED',
                data: {
                  reasoning: update.entry?.text || update.content || '',
                  summary_key: update.entry?.text || update.content || '',
                  search_queries: [update.entry?.text || update.content || '']
                }
              });
            } else if (update.type === 'searching') {
              // Skip if no actionType provided
              if (update.data?.actionType) {
                event.sender.send('search:status', {
                  step: 'ACTION_EXECUTING',
                  data: {
                    actionType: update.data.actionType,
                    actionParams: update.data.actionParams || {},
                    actionReason: update.data.actionReason || '',
                    actionIndex: update.data.actionIndex ?? 0,
                    totalActions: update.data.totalActions ?? 1,
                    isLastAction: update.data.isLastAction ?? false
                  }
                });
              }
            } else if (update.type === 'READING_COMPLETE') {
              event.sender.send('search:status', {
                step: 'ACTION_RESULTS',
                data: {
                  count: update.data?.pageCount || 1,
                  actionType: update.data?.actionType || 'Analysis',
                  actionIndex: update.data?.actionIndex ?? 0,
                  success: update.data?.success !== false
                }
              });
            } else if (update.type === 'processing') {
              event.sender.send('search:status', {
                step: 'PROCESSING',
                data: { count: update.data?.count || 1 }
              });
            }
          };
          let agentResponse = null;
          if (provider === 'openai') {
            if (projectFiles && projectFiles.length > 0) {
              const foundUrlsData = projectFiles.map(f => ({
                title: f.name,
                link: `file://${f.name}`,
                snippet: f.content.substring(0, 200) + (f.content.length > 200 ? '...' : '')
              }));
              event.sender.send('search:status', { step: 'FOUND_URLS', data: foundUrlsData });
            }
            
            try {
              const hasInsultKeywords = detectInsultKeywords(lastMessage.content);
              
              event.sender.send('chat-update', reactStartPayload);
              const agentResult = await agentOrchestrator.processComplexRequest(
                lastMessage.content,
                sessionId,
                session,
                model,
                getApiKey(provider, payload),
                {
                  provider,
                  baseUrl,
                  searchApiConfig: payload.searchApiConfig,
                  progressCallback,
                  logHelper,
                  systemPrompt: hasInsultKeywords ? createInsultDetectionPrompt(lastMessage.content) : null
                }
              );
              if (agentResult && typeof agentResult === 'object' && !Array.isArray(agentResult)) {
                if (Array.isArray(agentResult.usageBreakdown)) {
                  for (const entry of agentResult.usageBreakdown) {
                    if (entry?.usage) {
                      recordTokenUsage(reqId, entry.stage || 'research-agent', entry.usage, {
                        provider: entry.provider || provider,
                        model: entry.model || model,
                      });
                    }
                  }
                }
                agentResponse = agentResult.text || '';
              } else {
                agentResponse = agentResult || '';
              }
            } catch (error) {
              log('MAIN: Agent orchestrator failed, falling back to standard processing:', error.message);
            }
          } else {
            log(`MAIN: Agent orchestrator only supports OpenAI, checking if RE+ACT pattern needed for ${provider}...`);
            
            let availableFiles = session.uploadedFiles || [];
            
            if (session.type === 'project' && session.projectId) {
              try {
                const projects = await loadProjectsFromStorage();
                const project = projects.find(p => p.id === session.projectId);
                if (project && project.files) {
                  availableFiles = project.files;
                  log(`MAIN: Using ${availableFiles.length} project files for AI processing`);
                }
              } catch (error) {
                log('MAIN: Error loading project files:', error);
                availableFiles = session.uploadedFiles || [];
              }
            }
            
            log('DEBUG: session.messages length:', session.messages ? session.messages.length : 'undefined');
            log('DEBUG: last message (AI):', session.messages && session.messages.length > 0 ? JSON.stringify(session.messages[session.messages.length - 1]) : 'no messages');
            log('DEBUG: second-to-last message (user):', session.messages && session.messages.length > 1 ? JSON.stringify(session.messages[session.messages.length - 2]) : 'no user message');
            
            const shouldUseReact = await langchainService.shouldUseReasoningAction(
              lastMessage.content,
              availableFiles,
              session.type,
              session.messages
            );
            
            log(`MAIN: RE+ACT check - sessionType: ${session.type}, uploadedFiles: ${session.uploadedFiles ? session.uploadedFiles.length : 0}, sessionMessageFiles: ${session.messages && session.messages.length > 1 ? (session.messages[session.messages.length - 2][2] && session.messages[session.messages.length - 2][2].files ? session.messages[session.messages.length - 2][2].files.length : 0) : 0}, query: "${lastMessage.content.slice(0, 50)}..."`);
            
            if (shouldUseReact) {
              log('MAIN: Using RE+ACT pattern for complex project query analysis...');

                try {
                  const modelInfo = { provider, model, apiKey: getApiKey(provider, payload), baseUrl };
                  langchainService.reasoningAgent.initializeSession(sessionId, availableFiles || [], modelInfo);
                  log(`MAIN: ReasoningAgent initialized for session ${sessionId} with ${availableFiles ? availableFiles.length : 0} files.`);
                  if (availableFiles && availableFiles.length > 0) {
                    const projectFiles = availableFiles.map(f => ({
                      title: f.name,
                      link: `file://${f.name}`,
                      snippet: f.content.substring(0, 200) + (f.content.length > 200 ? '...' : '')
                    }));
                    event.sender.send('search:status', { step: 'FOUND_URLS', data: projectFiles });
                  }
                  const aiMessageIndex = session.messages ? session.messages.length - 1 : 0;

                  console.debug('MAIN: Sending REACT_START chat-update', { reqId: reqId, aiMessageIndex });
                  const hasInsultKeywords = detectInsultKeywords(lastMessage.content);
                  
                  event.sender.send('chat-update', reactStartPayload);

                const reactResult = await langchainService.processWithReasoningAction(
                  lastMessage.content,
                  sessionId,
                  availableFiles,
                  model,
                  provider,
                  getApiKey(provider, payload),
                  baseUrl,
                  payload.searchApiConfig || null,
                  progressCallback,  // Pass progress callback
                  hasInsultKeywords ? createInsultDetectionPrompt(lastMessage.content) : null,  // Only pass insult detection if keywords detected
                  session.messages || [],  // Pass session messages for conversation context
                  payload.language || 'autodetect'  // Pass language setting
                );

                log(`MAIN: RE+ACT completed with ${reactResult.actionsExecuted} actions`);
                log(`MAIN: RE+ACT usageBreakdown: ${JSON.stringify(reactResult.usageBreakdown, null, 2)}`);
                if (Array.isArray(reactResult.usageBreakdown)) {
                  log(`MAIN: Processing ${reactResult.usageBreakdown.length} usage entries from RE+ACT`);
                  for (const entry of reactResult.usageBreakdown) {
                    log(`MAIN: Recording usage for stage ${entry.stage}: ${JSON.stringify(entry.usage)}`);
                    if (entry?.usage) {
                      recordTokenUsage(reqId, entry.stage || 'reasoning-action', entry.usage, {
                        provider: entry.provider || provider,
                        model: entry.model || model,
                      });
                      log(`MAIN: Successfully recorded usage for ${entry.stage}`);
                    } else {
                      log(`MAIN: Skipping entry ${entry.stage} - no usage data`);
                    }
                  }
                } else {
                  log(`MAIN: usageBreakdown is not an array or missing`);
                }
                let responseText = '';
                if (typeof reactResult === 'string') {
                  responseText = reactResult;
                } else if (reactResult && reactResult.response && typeof reactResult.response.response === 'string') {
                  responseText = reactResult.response.response;
                } else if (reactResult && typeof reactResult.response === 'string') {
                  responseText = reactResult.response;
                } else if (reactResult && reactResult.finalResponse && typeof reactResult.finalResponse === 'string') {
                  responseText = reactResult.finalResponse;
                } else {
                  log("MAIN: RE+ACT returned malformed response, using fallback", { reactResult });
                  responseText = 'RE+ACT analysis completed but response format was unexpected. Please try rephrasing your question.';
                }
                if (responseText && typeof responseText === 'string' && responseText.length > 0) {
                  log(`MAIN: RE+ACT response received (${responseText.length} chars), starting streaming...`);
                  log(`MAIN: RE+ACT response preview: ${responseText.substring(0, 200)}...`);

                  let thinkingContent = '';
                  let mainContent = responseText;
                  try {
                    const jsonResponse = JSON.parse(responseText);
                    log(`MAIN: RE+ACT parsed JSON successfully, has reasoning: ${!!jsonResponse.reasoning}`);
                    if (jsonResponse.reasoning) {
                      thinkingContent = jsonResponse.reasoning;
                      mainContent = jsonResponse.response || jsonResponse.content || '';
                      log(`MAIN: RE+ACT parsed JSON response - thinking: ${thinkingContent.length} chars, main: ${mainContent.length} chars`);
                    }
                  } catch (e) {
                    log(`MAIN: RE+ACT JSON parse failed: ${e.message}, trying HTML tags`);
                    const thinkingMatch = responseText.match(/<thinking>([\s\S]*?)<\/thinking>/i);
                    if (thinkingMatch) {
                      thinkingContent = thinkingMatch[1].trim();
                      mainContent = responseText.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();
                      log(`MAIN: RE+ACT parsed HTML tags - thinking: ${thinkingContent.length} chars, main: ${mainContent.length} chars`);
                    }
                  }
                  if (thinkingContent) {
                    log(`MAIN: RE+ACT sending thinking content (${thinkingContent.length} chars)`);
                    const thinkingChunks = thinkingContent.split(' ');
                    for (const chunk of thinkingChunks) {
                      if (chunk.trim()) {
                        event.sender.send(`chat:chunk-${reqId}`, { think: chunk + ' ' });
                        await new Promise(r => setTimeout(r, 30));
                      }
                    }
                  } else {
                    log(`MAIN: RE+ACT no thinking content found`);
                  }
                  const mainChunks = mainContent.split(' ');
                  for (const chunk of mainChunks) {
                    if (chunk.trim()) {
                      event.sender.send(`chat:chunk-${reqId}`, chunk + ' ');
                      await new Promise(r => setTimeout(r, 30));
                    }
                  }

                  log('MAIN: RE+ACT streaming completed');
                  finalizeTokenUsage(reqId, event);
                  event.sender.send(`chat:done-${reqId}`);
                  activeStreams.delete(reqId);
                  return;
                }              } catch (reactError) {
                log('MAIN: RE+ACT processing failed for project session, falling back:', reactError.message);
                log('MAIN: Full RE+ACT error:', reactError);
              }
            } else {
              log('MAIN: RE+ACT not needed for this query, using standard processing');
            }
          }
          if (agentResponse) {
            log(`MAIN: Agent response received (${agentResponse.length} chars), starting streaming...`);
            const chunks = agentResponse.split(' ');
            let index = 0;
            const sendChunk = () => {
              if (index < chunks.length) {
                event.sender.send(`chat:chunk-${reqId}`, chunks[index] + ' ');
                index++;
                setTimeout(sendChunk, 50); // Simulate streaming
              } else {
                log('MAIN: Agent streaming completed');
                finalizeTokenUsage(reqId, event);
                event.sender.send(`chat:done-${reqId}`);
                activeStreams.delete(reqId);
              }
            };
            sendChunk();
            return;
          } else {
            log('MAIN: No agent response received, falling back to standard processing');
          }
        }
      } else {
        log('MAIN: REGULAR mode - checking if RE+ACT pattern needed...');
        logHelper('LANGCHAIN', 'runStandardStreaming', 'Regular session - analyzing query complexity');
        let filesForAI = session.uploadedFiles || [];
        if (session.type === 'project' && session.projectId) {
          try {
            const projects = await loadProjectsFromStorage();
            const project = projects.find(p => p.id === session.projectId);
            if (project && project.files) {
              filesForAI = project.files;
              log(`MAIN: Using ${filesForAI.length} project files for AI processing`);
            }
          } catch (error) {
            log('MAIN: Error loading project files:', error);
            filesForAI = session.uploadedFiles || [];
          }
        }
        const shouldUseReact = await langchainService.shouldUseReasoningAction(
          currentMessage,
          filesForAI,
          session.type,
          session.messages
        );
        
        if (shouldUseReact) {
          log('MAIN: Using RE+ACT pattern for complex query analysis...');

          const aiMessageIndex = session.messages ? session.messages.length - 1 : 0;
          console.debug('MAIN: Sending REACT_START chat-update', { reqId: reqId, aiMessageIndex });
          event.sender.send('chat-update', { 
              type: 'REACT_START', 
              messageIndex: aiMessageIndex, // << PENTING
              data: { query: lastMessage.content.substring(0, 100) }
          });
          if (filesForAI && filesForAI.length > 0) {
            const projectFiles = filesForAI.map(f => ({
              title: f.name,
              link: `file://${f.name}`,
              snippet: f.content.substring(0, 200) + (f.content.length > 200 ? '...' : '')
            }));
            event.sender.send('search:status', { step: 'FOUND_URLS', data: projectFiles });
          }
          
          try {
            const hasInsultKeywords = detectInsultKeywords(currentMessage);
            
            const reactResult = await langchainService.processWithReasoningAction(
              currentMessage,
              sessionId,
              filesForAI,
              model,
              provider,
              getApiKey(provider, payload),
              baseUrl,
              payload.searchApiConfig || null,
              null, // progressCallback
              hasInsultKeywords ? createInsultDetectionPrompt(currentMessage) : null,  // Only pass insult detection if keywords detected
              session.messages || []  // Pass session messages for conversation context
            );
            
            log(`MAIN: RE+ACT completed with ${reactResult.actionsExecuted} actions`);
            // Process usage breakdown from RE+ACT
            if (Array.isArray(reactResult.usageBreakdown)) {
              log(`MAIN: Processing ${reactResult.usageBreakdown.length} usage entries from RE+ACT`);
              for (const entry of reactResult.usageBreakdown) {
                if (entry?.usage) {
                  recordTokenUsage(reqId, entry.stage || 'reasoning-action', entry.usage, {
                    provider: entry.provider || provider,
                    model: entry.model || model,
                  });
                }
              }
            }
            event.sender.send('search:status', { step: 'PROCESSING', data: { count: reactResult.actionsExecuted || 1 } });
            event.sender.send('chat-update', { type: 'READING_COMPLETE', messageIndex: aiMessageIndex, data: { pageCount: reactResult.actionsExecuted || 1 } });
            let responseText = '';
            if (typeof reactResult === 'string') {
              responseText = reactResult;
            } else if (reactResult && reactResult.response && typeof reactResult.response.response === 'string') {
              responseText = reactResult.response.response;
            } else if (reactResult && typeof reactResult.response === 'string') {
              responseText = reactResult.response;
            } else if (reactResult && reactResult.finalResponse && typeof reactResult.finalResponse === 'string') {
              responseText = reactResult.finalResponse;
            } else {
              responseText = 'RE+ACT analysis completed but response format was unexpected. Please try rephrasing your question.';
            }
            let thinkingContent = responseText;
            let finalAnswer = 'Analysis completed successfully.';
            const thinkingChunks = thinkingContent.split(' ');
            for (const chunk of thinkingChunks) {
              if (chunk.trim()) {
                event.sender.send(`chat:chunk-${reqId}`, { think: chunk + ' ' });
                await new Promise(r => setTimeout(r, 30));
              }
            }
            const answerChunks = finalAnswer.split(' ');
            for (const chunk of answerChunks) {
              if (chunk.trim()) {
                event.sender.send(`chat:chunk-${reqId}`, chunk + ' ');
                await new Promise(r => setTimeout(r, 30));
              }
            }

            finalizeTokenUsage(reqId, event);
            event.sender.send(`chat:done-${reqId}`);
            activeStreams.delete(reqId);
            return;
            
          } catch (reactError) {
            log('MAIN: RE+ACT processing failed, falling back:', reactError);
          }
        }
        log('MAIN: Using standard context enhancement...');
        messages = await langchainService.processMessage(messages, model, {}, sessionId, session);
        log(`MAIN: Messages enhanced, new count: ${messages.length}`);
      }
      
    } catch (error) {
      log('MAIN: LangChain processing error:', error);
      logHelper('LANGCHAIN', 'runStandardStreaming', 'LangChain processing failed, falling back', { error: error.message });
    }
    
    log('MAIN: Proceeding with standard streaming...');
    processWithoutLangChain();
  }

  function processWithoutLangChain() {
    const BASE_URL = getBaseUrl(provider, payload);
    const API_KEY = getApiKey(provider, payload);

    function sendDone(){
      finalizeTokenUsage(reqId, event);
      event.sender.send(`chat:done-${reqId}`);
      activeStreams.delete(reqId);
    }
    function sendErr(msg){
      event.sender.send(`chat:error-${reqId}`, msg);
      activeStreams.delete(reqId);
      clearTokenUsage(reqId);
    }

    if (provider === 'gemini') {
      handleGeminiStreaming();
      return;
    }

    handleOpenAICompatibleStreaming();

    function handleGeminiStreaming() {
      try {
        const url = new URL(`${BASE_URL.replace(/\/+$/,'')}/models/${encodeURIComponent(model)}:generateContent`);
        if (API_KEY) url.searchParams.set('key', API_KEY);
        const lastUserMessage = messages.slice().reverse().find(m => m.role === 'user');
        const hasInsultKeywords = lastUserMessage && detectInsultKeywords(lastUserMessage.content);
        
        let messagesToProcess = messages;
        
        if (hasInsultKeywords) {
          const insultDetectionPrompt = createInsultDetectionPrompt(lastUserMessage.content);
          messagesToProcess = [
            { role: 'user', content: insultDetectionPrompt }
          ];
          logHelper('INSULT_KEYWORD_DETECTED', 'handleGeminiStreaming', 'Insult keywords detected, sending combined insult detection prompt');
        }

        const contents = [];
        for (const m of messagesToProcess) {
          const role = m.role === 'assistant' ? 'model' : 'user';
          contents.push({ role, parts: [{ text: String(m.content || '') }] });
        }

        const body = JSON.stringify({ contents });
        const opts = {
          method: 'POST',
          hostname: url.hostname,
          path: url.pathname + url.search,
          protocol: url.protocol,
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Content-Length': Buffer.byteLength(body)
          }
        };

        const req = https.request(opts, (res) => {
          let acc = '';
          res.setEncoding('utf8');
          res.on('data', d => acc += d);
          res.on('end', () => {
            if (res.statusCode < 200 || res.statusCode >= 300) {
              return sendErr(`HTTP ${res.statusCode} ${res.statusMessage} — ${acc.slice(0,200)}`);
            }
            try {
              const j = JSON.parse(acc);
              let text = (j.candidates?.[0]?.content?.parts || [])
                .map(p => p.text || '').join('');
              
              // Handle Gemini's *(Internal Reasoning: ...)* pattern
              const internalReasoningMatch = text.match(/\*\(Internal Reasoning:\s*([\s\S]*?)\)\*/i);
              if (internalReasoningMatch) {
                const reasoning = internalReasoningMatch[1].trim();
                // Send reasoning as thinking content
                event.sender.send(`chat:chunk-${reqId}`, { think: reasoning });
                // Remove the Internal Reasoning from main content
                text = text.replace(/\*\(Internal Reasoning:\s*[\s\S]*?\)\*/gi, '').trim();
              }
              
              if (text) event.sender.send(`chat:chunk-${reqId}`, text);

              // Log token usage if available (Gemini format)
              if (j?.usageMetadata) {
                const usage = j.usageMetadata;
                logHelper('TOKEN_USAGE', 'handleGeminiStreaming', 'Token usage information', {
                  promptTokenCount: usage.promptTokenCount,
                  candidatesTokenCount: usage.candidatesTokenCount,
                  totalTokenCount: usage.totalTokenCount,
                  provider: 'gemini',
                  model
                });
                recordTokenUsage(reqId, 'final-response', usage, { provider: 'gemini', model });
              }

              log('PARSED_JSON', 'handleGeminiStreaming', 'Parsed JSON information', {
                parsedJson: j
              })

              sendDone();
            } catch (e) {
              sendErr('Bad JSON from Gemini');
            }
          });
        });
        req.on('error', e => sendErr(e.message || String(e)));
        req.write(body); req.end();
        activeStreams.set(reqId, req);
      } catch (e) {
        sendErr(e.message || String(e));
      }
    }

    function handleOpenAICompatibleStreaming() {
      const url = new URL(joinEndpoint(BASE_URL, 'chat/completions'));
      const lastUserMessage = messages.slice().reverse().find(m => m.role === 'user');
      const hasInsultKeywords = lastUserMessage && detectInsultKeywords(lastUserMessage.content);
      
      let messagesToSend = messages;
      
      if (hasInsultKeywords) {
        const insultDetectionPrompt = createInsultDetectionPrompt(lastUserMessage.content);
        messagesToSend = [
          { role: 'system', content: insultDetectionPrompt }
        ];
        logHelper('INSULT_KEYWORD_DETECTED', 'handleOpenAICompatibleStreaming', 'Insult keywords detected, sending combined insult detection prompt');
      }
      
      let bodyObj = { model, messages: messagesToSend, stream: true };
      applyThinkingHints({ provider, model, bodyObj, thinkMode: payload.thinkMode });
      const body = JSON.stringify(bodyObj);

      const headers = {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Content-Length': Buffer.byteLength(body)
      };

      if (API_KEY) headers.Authorization = `Bearer ${API_KEY}`;
      
      logHelper('HEADER_INFO', 'headers', 'Header information', {
        provider,
        API_KEY: API_KEY ? `${API_KEY.substring(0, 10)}...` : 'EMPTY ()',
        BASE_URL,
        hasAuth: !!headers.Authorization,
        headers: Object.keys(headers)
      });
      
      if (provider === 'openrouter') {
        headers['HTTP-Referer'] = 'https://clustrix.local';
        headers['X-Title'] = 'Clustrix Desktop';
      } else if (provider === 'bigmodel') {
        headers['User-Agent'] = 'Clustrix/1.0';
        headers['Accept'] = 'application/json';
      }

      const opts = {
        method: 'POST',
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        protocol: url.protocol,
        headers
      };

      const req = https.request(opts, (res) => {
        if (res.statusCode < 200 || res.statusCode >= 300){
          let err = '';
          res.on('data', d => err += d.toString('utf-8'));
          res.on('end', () => sendErr(`HTTP ${res.statusCode} ${res.statusMessage} — ${err.slice(0,200)}`));
          return;
        }

        const ctype = String(res.headers['content-type'] || '').toLowerCase();
        const isSSE = ctype.includes('text/event-stream');

        if (!isSSE) {
          let acc = '';
          res.setEncoding('utf8');
          res.on('data', (d) => acc += d);
          res.on('end', () => {
            try {
              const j = JSON.parse(acc);
              let think =
                j?.choices?.[0]?.message?.reasoning_content ??
                j?.choices?.[0]?.message?.reasoning ??
                j?.reasoning_content ??
                j?.reasoning ??
                j?.thoughts ??
                '';

              if (Array.isArray(think)) think = think.map(p => (p?.text ?? p)).join('');
              if (think) event.sender.send(`chat:chunk-${reqId}`, { think });
              
              let text =
                j?.choices?.[0]?.message?.content ??
                j?.message?.content ??
                j?.output_text ?? '';

              if (Array.isArray(text)) text = text.map(p => (p?.text ?? p)).join('');
              
              // Handle Gemini's *(Internal Reasoning: ...)* pattern in OpenAI-compatible responses
              const internalReasoningMatch = text.match(/\*\(Internal Reasoning:\s*([\s\S]*?)\)\*/i);
              if (internalReasoningMatch) {
                const reasoning = internalReasoningMatch[1].trim();
                // Send reasoning as thinking content if not already present
                if (!think) {
                  event.sender.send(`chat:chunk-${reqId}`, { think: reasoning });
                }
                // Remove the Internal Reasoning from main content
                text = text.replace(/\*\(Internal Reasoning:\s*[\s\S]*?\)\*/gi, '').trim();
              }
              
              if (text) event.sender.send(`chat:chunk-${reqId}`, text);

              // Log token usage if available
              if (j?.usage) {
                const usage = j.usage;

                logHelper('TOKEN_USAGE', 'handleOpenAICompatibleStreaming', 'Token usage information', {
                  prompt_tokens: usage.prompt_tokens,
                  completion_tokens: usage.completion_tokens,
                  total_tokens: usage.total_tokens,
                  provider,
                  model
                });
                recordTokenUsage(reqId, 'final-response', usage, { provider, model });
              }

              log('PARSED_JSON', 'handleOpenAICompatibleStreaming', 'Parsed JSON information', {
                parsedJson: j
              })

              sendDone();
            } catch (e) {
              sendErr(`JSON parse error (non-stream): ${e.message?.slice(0,100)}`);
            }
          });
          return;
        }

        res.setEncoding('utf8');
        let buffer = '';
        let contentBuffer = ''; // Buffer to detect (Internal Reasoning: ...) pattern
        let inInternalReasoning = false;
        let reasoningBuffer = '';
        
        res.on('data', (chunk) => {
          buffer += chunk;

          let idx;
          while ((idx = buffer.search(/\r?\n\r?\n/)) !== -1) {
            const rawEvent = buffer.slice(0, idx);
            buffer = buffer.slice(idx + (buffer[idx] === '\r' ? 4 : 2));

            const lines = rawEvent.split(/\r?\n/);
            const dataLines = [];
            let isDone = false;

            for (const ln of lines) {
              if (/^\s*data:\s*\[DONE\]\s*$/i.test(ln)) { isDone = true; break; }
              const m = ln.match(/^\s*data:\s?(.*)$/);
              if (m) dataLines.push(m[1]);
            }
            if (isDone) continue;
            if (!dataLines.length) continue;

            const payload = dataLines.join('\n');

            try {
              const j = JSON.parse(payload);

              let rdelta =
                j?.choices?.[0]?.delta?.reasoning_content ??
                j?.choices?.[0]?.delta?.reasoning ??
                j?.choices?.[0]?.delta?.thoughts ??
                j?.delta?.thinking ??
                j?.reasoning ??
                '';

              if (Array.isArray(rdelta)) rdelta = rdelta.map(p => (p?.text ?? p)).join('');
              if (rdelta) event.sender.send(`chat:chunk-${reqId}`, { think: rdelta });

              let delta =
                j?.choices?.[0]?.delta?.content ??
                j?.delta?.content ??
                j?.content ?? '';

              if (delta) {
                // Accumulate content to detect *(Internal Reasoning: ...)* pattern
                contentBuffer += delta;
                
                // Check if we're starting Internal Reasoning pattern
                if (!inInternalReasoning && contentBuffer.includes('*(Internal Reasoning:')) {
                  inInternalReasoning = true;
                  const beforeReasoning = contentBuffer.split('*(Internal Reasoning:')[0];
                  if (beforeReasoning) {
                    event.sender.send(`chat:chunk-${reqId}`, beforeReasoning);
                  }
                  reasoningBuffer = '';
                  contentBuffer = contentBuffer.substring(beforeReasoning.length + '*(Internal Reasoning:'.length);
                }
                
                // If inside Internal Reasoning, accumulate it
                if (inInternalReasoning) {
                  if (contentBuffer.includes(')*')) {
                    const endIndex = contentBuffer.indexOf(')*');
                    reasoningBuffer += contentBuffer.substring(0, endIndex);
                    // Send accumulated reasoning as thinking
                    if (reasoningBuffer.trim()) {
                      event.sender.send(`chat:chunk-${reqId}`, { think: reasoningBuffer.trim() });
                    }
                    // Continue with content after the closing )*
                    contentBuffer = contentBuffer.substring(endIndex + 2);
                    inInternalReasoning = false;
                    reasoningBuffer = '';
                    // Send remaining content
                    if (contentBuffer) {
                      event.sender.send(`chat:chunk-${reqId}`, contentBuffer);
                      contentBuffer = '';
                    }
                  } else {
                    reasoningBuffer += contentBuffer;
                    contentBuffer = '';
                  }
                } else {
                  // Normal content, send it
                  event.sender.send(`chat:chunk-${reqId}`, delta);
                  contentBuffer = '';
                }
              }

              if (j?.usage) {
                recordTokenUsage(reqId, 'final-response', j.usage, { provider, model });
              }

            } catch (e) {
              log('[SSE BAD JSON]', payload.slice(0,200));
            }
          }
        });

        res.on('end', sendDone);
      });
      req.on('error', e => sendErr(e.message || String(e)));
      req.write(body); req.end();
      activeStreams.set(reqId, req);
    }
  }
}

ipcMain.on('chat:stream-cancel', (event, reqId) => {
  const r = activeStreams.get(reqId);
  if (r){ try{ r.destroy(new Error('Cancelled')); }catch{} activeStreams.delete(reqId); }
  clearTokenUsage(reqId);
});
ipcMain.handle('chat:title', async (_evt, payload) => {
  const text     = payload?.text  || '';
  const model    = payload?.model || 'glm-4.5-flash';
  const provider = String(payload?.provider || '').toLowerCase();
  const extraHdr = payload?.headers || {};
  const defBase = (p) =>
    p === 'openrouter' ? 'https://openrouter.ai/api/v1' :
    p === 'groq'       ? 'https://api.groq.com/openai/v1' :
    p === 'gemini'     ? 'https://generativelanguage.googleapis.com/v1beta' :
    p === 'bigmodel'   ? 'https://open.bigmodel.cn/api/paas/v4' :
    p === 'cerebras'   ? 'https://api.cerebras.ai/v1' :
                          'https://api.z.ai/api/paas/v4/';

  const BASE_URL = (payload?.baseUrl || '').trim() || defBase(provider);
  const API_KEY  = (payload?.apiKey  || '').trim()
                || (provider === 'openrouter' ? (process.env.OPENROUTER_API_KEY || '') :
                    provider === 'groq'       ? (process.env.GROQ_API_KEY || '') :
                    provider === 'gemini'     ? (process.env.GEMINI_API_KEY || '') :
                                                (process.env.Z_API_KEY || process.env.OPENAI_API_KEY || ''));

  const sys = 'You are a title generator. Your job is to summarize the user query into a 3-6 word title. The title must be Title Case and have no punctuation. If the query is code, summarize its purpose. (Your response only the 3-6 title)';
  
  const MAX_RETRIES = 3;
  let lastError = null;
  
  if (provider === 'gemini') {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        log('TITLE_GEN', 'chat:title', `Gemini title generation attempt ${attempt}/${MAX_RETRIES}`, { model, textPreview: text.substring(0, 50) });
        
        const url = new URL(`${BASE_URL.replace(/\/+$/, '')}/models/${encodeURIComponent(model)}:generateContent`);
        if (API_KEY) url.searchParams.set('key', API_KEY);
        const body = JSON.stringify({
          contents: [
            { role: 'user', parts: [{ text: `${sys}\n\n${text}` }] }
          ]
        });

        const title = await new Promise((resolve, reject) => {
          const req = https.request({
            method: 'POST',
            hostname: url.hostname,
            path: url.pathname + url.search,
            protocol: url.protocol,
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Content-Length': Buffer.byteLength(body) }
          }, (res) => {
            let acc=''; res.setEncoding('utf8');
            res.on('data', d => acc += d);
            res.on('end', () => {
              if (res.statusCode < 200 || res.statusCode >= 300) return reject(new Error(`HTTP ${res.statusCode} ${res.statusMessage} — ${acc}`));
              try {
                const j = JSON.parse(acc);
                
                // Log token usage if available (Gemini format)
                if (j?.usageMetadata) {
                  const usage = j.usageMetadata;
                  logHelper('TOKEN_USAGE', 'chat:title', 'Token usage information', {
                    promptTokenCount: usage.promptTokenCount,
                    candidatesTokenCount: usage.candidatesTokenCount,
                    totalTokenCount: usage.totalTokenCount,
                    provider: 'gemini',
                    model
                  });
                }

                log('PARSED_JSON', 'chat:title', 'Parsed JSON information', {
                  parsedJson: j
                })
                
                let t = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
                if (t) {
                  // Remove thinking tags and any XML-style tags that might appear
                  t = t.replace(/<think>[\s\S]*?<\/think>/gi, '');
                  t = t.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');
                  t = t.replace(/<[^>]+>/g, '');
                  t = t.trim();
                }
                // If response is empty after cleaning, reject to trigger retry
                if (!t) {
                  reject(new Error('Model returned empty response after cleaning thinking tags'));
                }
                resolve(t);
              } catch (err) { 
                log('TITLE_PARSE_ERROR', 'chat:title', 'Failed to parse Gemini response', { error: err.message });
                reject(err); 
              }
            });
          });
          req.on('error', reject); req.write(body); req.end();
        });

        // Success! Return the title
        log('TITLE_SUCCESS', 'chat:title', `Successfully generated title on attempt ${attempt}`, { title });
        return title;
        
      } catch (err) {
        lastError = err;
        log('TITLE_RETRY', 'chat:title', `Gemini attempt ${attempt}/${MAX_RETRIES} failed`, { 
          error: err.message,
          willRetry: attempt < MAX_RETRIES 
        });
        
        // If this was the last attempt, throw to trigger renderer fallback
        if (attempt === MAX_RETRIES) {
          log('TITLE_FALLBACK', 'chat:title', 'All Gemini attempts failed, throwing to renderer for SmartTitleGenerator', { 
            error: lastError.message 
          });
          throw lastError;
        }
        
        // Wait a bit before retry (exponential backoff: 100ms, 200ms, 400ms)
        await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt - 1)));
      }
    }
  }
  
  // OpenAI-compatible endpoints (OpenRouter, Groq, BigModel, Cerebras, etc.)
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      log('TITLE_GEN', 'chat:title', `${provider} title generation attempt ${attempt}/${MAX_RETRIES}`, { model, textPreview: text.substring(0, 50) });
      
      const u = new URL(BASE_URL.replace(/\/+$/, '') + '/chat/completions');
      
      const body = JSON.stringify({
        model,
        stream: false,
        max_tokens: 1000,
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: text }
        ]
      });

      const headers = {
        'Authorization': API_KEY ? `Bearer ${API_KEY}` : '',
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        ...extraHdr
      };
      if (provider === 'openrouter') {
        headers['HTTP-Referer'] = headers['HTTP-Referer'] || 'https://clustrix.local';
        headers['X-Title'] = headers['X-Title'] || 'Clustrix Desktop';
      } else if (provider === 'bigmodel') {
        headers['User-Agent'] = headers['User-Agent'] || 'Clustrix/1.0';
        headers['Accept'] = headers['Accept'] || 'application/json';
      }

      const resText = await new Promise((resolve, reject) => {
        const req = https.request({
          method: 'POST',
          hostname: u.hostname,
          path: u.pathname + u.search,
          protocol: u.protocol,
          headers
        }, (res) => {
          let acc=''; res.setEncoding('utf8');
          res.on('data', d => acc += d);
          res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) return resolve(acc);
            reject(new Error(`HTTP ${res.statusCode} ${res.statusMessage} — ${acc}`));
          });
        });
        req.on('error', reject); req.write(body); req.end();
      });

      const j = JSON.parse(resText);
      
      // Log token usage if available
      if (j?.usage) {
        const usage = j.usage;
        
        logHelper('TOKEN_USAGE', 'chat:title', 'Token usage information', {
          prompt_tokens: usage.prompt_tokens,
          completion_tokens: usage.completion_tokens,
          total_tokens: usage.total_tokens,
          provider,
          model
        });
      }

      log('PARSED_JSON', 'chat:title', 'Parsed JSON information', {
        parsedJson: j
      })
      
      let t = j?.choices?.[0]?.message?.content?.trim();
      if (t) {
        // Remove thinking tags and any XML-style tags that might appear
        t = t.replace(/<think>[\s\S]*?<\/think>/gi, '');
        t = t.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');
        t = t.replace(/<[^>]+>/g, '');
        t = t.trim();
      }
      
      // If response is empty after cleaning, throw to trigger retry
      if (!t) {
        throw new Error('Model returned empty response after cleaning thinking tags');
      }
      
      // Success! Return the title
      log('TITLE_SUCCESS', 'chat:title', `Successfully generated title on attempt ${attempt}`, { title: t });
      return t;
      
    } catch (err) {
      lastError = err;
      log('TITLE_RETRY', 'chat:title', `${provider} attempt ${attempt}/${MAX_RETRIES} failed`, { 
        error: err.message,
        willRetry: attempt < MAX_RETRIES 
      });
      
      // If this was the last attempt, throw to trigger renderer fallback
      if (attempt === MAX_RETRIES) {
        log('TITLE_FALLBACK', 'chat:title', `All ${provider} attempts failed, throwing to renderer for SmartTitleGenerator`, { 
          error: lastError.message 
        });
        throw lastError;
      }
      
      // Wait a bit before retry (exponential backoff: 100ms, 200ms, 400ms)
      await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt - 1)));
    }
  }
});
const TRIAGE_SYSTEM_PROMPT = `You are a reasoning agent. Your first task is to analyze the user's query and decide if it requires real-time internet access. The current date is ${new Date().toLocaleDateString('en-US', {year: 'numeric', month: 'long', day: 'numeric' })}. Respond ONLY with a single JSON object. Do not add any text before or after it.
JSON format: {"requires_search": boolean, "reasoning": "string", "user_prompt": "string", "search_queries": ["string", ...], "summary_key": "string"}
Set "requires_search" to true if the query is about recent events (relative to the current date), specific facts, or explicitly asks to search. Otherwise, set it to false.
"user_prompt" MUST be the exact original user query.
"summary_key" MUST be a very short, 2-4 word summary of the user's query in English.
If "requires_search" is true, provide 1-3 effective Google search queries relevant to the current date.`;

async function runWebSearchChat(event, payload) {
  const { reqId, messages } = payload;
  logHelper('WEB_CHAT', 'runWebSearchChat', 'Alur Web Search dimulai.');

  try {
    const userQuery = messages[messages.length - 1].content;

    logHelper('WEB_CHAT', 'runWebSearchChat', 'Memulai tahap Pra-Analisis (Triage).', { query: userQuery });
    logHelper('WEB_CHAT', 'runWebSearchChat', `User menggunakan search API dari "${payload.searchApiConfig.provider}".`, { platform: payload.searchApiConfig });
    
    // Include conversation history for better triage decision (optimized with sliding window)
    const conversationHistory = messages.slice(0, -1); // Previous messages
    const optimizedHistory = optimizeMessages(conversationHistory, {
      windowSize: 8,
      keepFirst: false, // Triage doesn't need very old context
      prune: true
    });
    
    const triageMessages = [
      { role: 'system', content: TRIAGE_SYSTEM_PROMPT },
      ...optimizedHistory,
      { role: 'user', content: userQuery }
    ];
    
    logHelper('WEB_CHAT', 'runWebSearchChat', `Triage with ${triageMessages.length} messages (optimized from ${messages.length} total, kept ${optimizedHistory.length} history messages)`);
    const triageResult = await invokeLLM_nonStream(triageMessages, payload);
    if (triageResult?.usage) {
      recordTokenUsage(payload.reqId, 'web-search-triage', triageResult.usage, {
        provider: payload.provider,
        model: payload.model,
      });
    }
    const triageResponse = triageResult?.text || '';
    
    let decision;
    try {
      decision = parseTriageJson(triageResponse);
      logHelper('WEB_CHAT', 'runWebSearchChat', 'Pra-Analisis berhasil. Keputusan diterima.', { decision });
    } catch (e) {
      logHelper('WEB_CHAT', 'runWebSearchChat', 'ERROR: Gagal parse JSON Triage. Kembali ke mode standar.', { error: e.message, response: triageResponse });
      return runStandardStreaming(event, payload);
    }

    if (!decision.requires_search || !decision.search_queries || decision.search_queries.length === 0) {
      logHelper('WEB_CHAT', 'runWebSearchChat', 'Keputusan: Tidak perlu web search. Menjalankan chat standar.');
      return runStandardStreaming(event, payload);
    }
    event.sender.send('search:status', { step: 'DECIDED', data: decision });
    logHelper('WEB_CHAT', 'runWebSearchChat', 'Keputusan: Web search diperlukan.');

    event.sender.send('chat-update', { type: 'SEARCHING', messageIndex: payload.aiMessageIndex, data: { summarizedQuery: decision.search_queries[0] } });
    logHelper('WEB_CHAT', 'performWebSearch', 'Memulai pencarian di internet...', { queries: decision.search_queries });
    const searchResults = await performWebSearch(decision.search_queries, payload.searchApiConfig);
    
    if (searchResults.length === 0) {
      logHelper('WEB_CHAT', 'performWebSearch', 'Pencarian tidak menemukan hasil atau API gagal/limit.');
      
      // Send error notification to frontend
      event.sender.send('search:status', { 
        step: 'SEARCH_FAILED', 
        data: { 
          reason: 'No search results found. This may be due to: API key missing/invalid, API rate limit reached, no credit remaining, or no results available for the query.',
          provider: payload.searchApiConfig?.provider || 'unknown'
        } 
      });
      
      // Wait a bit so user can see the error message
      await new Promise(r => setTimeout(r, 2000));
      
      logHelper('WEB_CHAT', 'performWebSearch', 'Melanjutkan dengan mode standar tanpa web search.');
      return runStandardStreaming(event, payload);
    }
    logHelper('WEB_CHAT', 'performWebSearch', `Pencarian berhasil. Ditemukan ${searchResults.length} hasil.`, { titles: searchResults.map(r => r.title) });
    event.sender.send('search:status', { step: 'FOUND_URLS', data: searchResults });

    const urlsToScrape = searchResults.map(r => r.link);
    
    // Send scraping status before starting
    event.sender.send('search:status', { 
      step: 'SCRAPING', 
      data: { 
        count: urlsToScrape.length,
        urls: urlsToScrape 
      } 
    });
    
    logHelper('WEB_CHAT', 'scrapeUrls', 'Memulai scraping...', { urls: urlsToScrape });
    const scrapedContent = await scrapeUrls(urlsToScrape);
    const nonEmptyContent = scrapedContent.filter(c => c.trim().length > 10);

    if (nonEmptyContent.length === 0) {
      logHelper('WEB_CHAT', 'scrapeUrls', 'Scraping tidak menghasilkan konten. Kembali ke mode standar.');
      return runStandardStreaming(event, payload);
    }
    logHelper('WEB_CHAT', 'scrapeUrls', `Scraping selesai. ${nonEmptyContent.length} halaman berhasil dibaca.`);
    event.sender.send('search:status', { step: 'PROCESSING', data: { count: nonEmptyContent.length } });
    event.sender.send('chat-update', { type: 'READING_COMPLETE', messageIndex: payload.aiMessageIndex, data: { pageCount: nonEmptyContent.length } });

    let searchContext = "Use the following search results to answer the user's original query. The user's original query was: \"" + decision.user_prompt + "\". Base your answer on these facts and cite sources with markdown links `[**Summarized Title Max 4 Words**](URL)`.\n\n";
    nonEmptyContent.forEach((content, i) => {
      const result = searchResults[i];
      searchContext += `--- Source ${i+1}: ${result.title} (${result.link}) ---\n${content}\n\n`;
    });
    const lastUserMessage = messages.slice().reverse().find(m => m.role === 'user');
    const hasInsultKeywords = lastUserMessage && detectInsultKeywords(lastUserMessage.content);
    
    let finalMessages = messages;
    
    if (hasInsultKeywords) {
      const insultDetectionPrompt = createInsultDetectionPrompt(lastUserMessage.content);
      finalMessages = [
        { role: 'system', content: insultDetectionPrompt }
      ];
      logHelper('INSULT_KEYWORD_DETECTED', 'runWebSearchChat', 'Insult keywords detected in web search, sending combined insult detection prompt');
    } else {
      // Optimize message history for final response (sliding window + pruning)
      finalMessages = optimizeMessages([...messages], {
        windowSize: 10,
        keepFirst: true, // Keep initial context
        prune: true
      });
      logHelper('WEB_CHAT', 'runWebSearchChat', `Optimized finalMessages from ${messages.length} to ${finalMessages.length} messages`);
    }
    
    finalMessages.splice(hasInsultKeywords ? 1 : 1, 0, { role: 'system', content: searchContext });
    
    logHelper('WEB_CHAT', 'runWebSearchChat', 'Briefing final untuk LLM telah disiapkan. Memulai streaming jawaban.');
    return runStandardStreaming(event, { ...payload, messages: finalMessages });

  } catch (error) {
    logHelper('WEB_CHAT', 'runWebSearchChat', 'FATAL ERROR dalam alur Web Search.', { error: error.message, stack: error.stack });
    event.sender.send(`chat:error-${payload.reqId}`, error.message);
  }
}

function invokeLLM_nonStream(messages, options) {
  return new Promise((resolve, reject) => {
    const { model, provider, baseUrl, apiKey } = options;
    const u = new URL(joinEndpoint(baseUrl, 'chat/completions'));
    const body = JSON.stringify({ model, messages, stream: false });
    const headers = {
      'Authorization': apiKey ? `Bearer ${apiKey}` : '',
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Content-Length': Buffer.byteLength(body)
    };
    if (provider === 'openrouter') {
      headers['HTTP-Referer'] = 'https://clustrix.local';
      headers['X-Title'] = 'Clustrix Desktop';
    }

    const req = https.request({ method: 'POST', hostname: u.hostname, path: u.pathname, protocol: u.protocol, headers }, (res) => {
      let acc = '';
      res.setEncoding('utf8');
      res.on('data', d => acc += d);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const j = JSON.parse(acc);
            
            // Log token usage if available
            if (j?.usage) {
              const usage = j.usage;

              logHelper('TOKEN_USAGE', 'invokeLLM_nonStream', 'Token usage information', {
                prompt_tokens: usage.prompt_tokens,
                completion_tokens: usage.completion_tokens,
                total_tokens: usage.total_tokens,
                provider,
                model
              });
            }

            log('PARSED_JSON', 'invokeLLM_nonStream', 'Parsed JSON information', {
              parsedJson: j
            })

            resolve({
              text: j?.choices?.[0]?.message?.content?.trim() || '',
              usage: j?.usage || null,
            });
          } catch (e) {
            reject(new Error('Failed to parse non-stream LLM response.'));
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode} - ${acc}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}