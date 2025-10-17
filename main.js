const { app, BrowserWindow, ipcMain, dialog, session, protocol, net, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = require('fs').promises;
const https = require('https');
const mammoth = require('mammoth');
const xlsx = require('./local_modules/xlsx/xlsx');
const { log, logWithContext, setLogFile, setDebug } = require('./utils/logger');
const { optimizeMessages } = require('./utils/message-optimizer');

const ClustrixLangChainService = require('./backend/langchain-service');
const { MultiAgentOrchestrator } = require('./backend/langchain-agents');
const { getBaseUrl, getApiKey, joinEndpoint, applyThinkingHints } = require('./backend/langchain-helpers');
const { performWebSearch, scrapeUrls } = require('./backend/web-search');
const DatabaseManager = require('./backend/database-manager');
const JSONToSQLiteMigrator = require('./backend/json-to-sqlite-migrator');

let langchainService = null;
let agentOrchestrator = null;
let db = null;
let useSQLite = false;

app.whenReady().then(async () => {
  setLogFile(path.join(app.getPath('userData'), 'app.log'));
  setDebug(process.env.CLUSTRIX_DEBUG !== 'false');
  log('[FLAGS]', app.commandLine.getSwitchValue('enable-features'));
  langchainService = new ClustrixLangChainService(app);
  agentOrchestrator = new MultiAgentOrchestrator(langchainService);
  log('LangChain services initialized');
  if (!process.env || Object.keys(process.env).length === 0) {
    log('Warning: No environment variables loaded. Check your .env file and dotenv setup.');
  }
  
  const dbPath = path.join(app.getPath('userData'), 'clustrix.db');
  const dbExists = fs.existsSync(dbPath);
  
  if (dbExists) {
    db = new DatabaseManager(app);
    useSQLite = true;
    log('DATABASE', 1, 'init', 'Using SQLite database');
  } else {
    const jsonPath = path.join(app.getPath('userData'), 'chat_data.json');
    if (fs.existsSync(jsonPath)) {
      log('DATABASE', 2, 'init', 'JSON files detected, starting migration');
      db = new DatabaseManager(app);
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
      db = new DatabaseManager(app);
      useSQLite = true;
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


const modelsConfFile = path.join(app.getPath('userData'), 'ai-model.conf.json');

function defaultModelsConf() {
  return {
    active: {
      platform: 'openrouter',
      model: 'deepseek/deepseek-chat-v3.1:free',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: ''
    },
    providers: {
      openrouter: {
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: '',
        models: [
          'deepseek/deepseek-chat-v3.1:free',
          'meta-llama/llama-3.1-8b-instruct',
          'mistralai/mistral-7b-instruct',
          'openai/gpt-oss-120b:free',
          'openai/gpt-oss-20b:free',
          'meta-llama/llama-4-maverick:free',
          'microsoft/mai-ds-r1:free',
          'google/gemini-2.0-flash-exp:free',
          'qwen/qwen3-coder:free',
          'qwen/qwen3-14b:free',
          'qwen/qwen-2.5-coder-32b-instruct:free',
          'openrouter/sonoma-sky-alpha',
        ]
      },
      groq: {
        baseUrl: 'https://api.groq.com/openai/v1',
        apiKey: '',
        models: ['llama3-8b-8192','mixtral-8x7b-32768','gemma2-9b-it', 'openai/gpt-oss-120b']
      },
      gemini: {
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        apiKey: '',
        models: ['gemini-1.5-flash','gemini-1.5-flash-8b']
      },
      zhipu: {
        baseUrl: 'https://api.z.ai/api/paas/v4/',
        apiKey: '',
        models: ['glm-4.5-flash']
      },
      cerebras: {
        baseUrl: 'https://api.cerebras.ai/v1/chat/completions',
        apiKey: '',
        models: [
          'gpt-oss-120b',
          'qwen-3-coder-480b',
          'qwen-3-235b-a22b-thinking-2507',
          'llama-3.3-70b',
        ]
      }
    }
  };
}

ipcMain.handle('models:load', async () => {
  try {
    if (!fs.existsSync(modelsConfFile)) return defaultModelsConf();
    const raw = fs.readFileSync(modelsConfFile, 'utf-8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : defaultModelsConf();
  } catch (e) {
    log('models:load error', e);
    return defaultModelsConf();
  }
});

ipcMain.handle('models:save', async (_evt, conf) => {
  try {
    fs.writeFileSync(modelsConfFile, JSON.stringify(conf, null, 2), 'utf-8');
    return true;
  } catch (e) {
    log('models:save error', e);
    return false;
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
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
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
      if (transformed.length === 0 && fs.existsSync(dataFile)) {
        try {
          log('MIGRATION', 1, 'sessions', 'Database empty, attempting JSON migration');
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

ipcMain.handle('projects:load', async () => {
  try{
    if (useSQLite && db) {
      const projects = db.getAllProjects();
      if (projects.length === 0) {
        // Migrate from JSON if database is empty
        if (fs.existsSync(projectsFile)) {
          try {
            const content = fs.readFileSync(projectsFile, 'utf-8');
            const parsed = JSON.parse(content || '[]');
            if (Array.isArray(parsed) && parsed.length > 0) {
              log('MIGRATION', 1, 'projects', `Migrating ${parsed.length} projects from JSON to SQLite`);
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
              const migratedProjects = db.getAllProjects();
              return migratedProjects.map(p => {
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
            log('MIGRATION', 4, 'projects', 'Failed to migrate projects from JSON', e);
          }
        }
      }
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
            content: f.content.toString('utf-8')  // Return as plain text like JSON format
          }))
        };
      });
    }
    if (!fs.existsSync(projectsFile)) return [];
    const content = fs.readFileSync(projectsFile, 'utf-8');
    const parsed = JSON.parse(content || '[]');
    return Array.isArray(parsed) ? parsed : [];
  }catch(e){
    log('projects load error', e);
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
        fileInfo.content = (await mammoth.extractRawText({ path: filePath })).value;
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
              const projects = JSON.parse(fs.readFileSync(projectsFile, 'utf-8'));
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
                const projects = JSON.parse(fs.readFileSync(projectsFile, 'utf-8'));
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
            const projects = JSON.parse(fs.readFileSync(projectsFile, 'utf-8'));
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

  const sys = 'You are a title generator. Create a specific, 3-6 word title in Title Case for the following user query. Do not use quotes or periods. Your response must not exceed 6 words. If the query contains code, summarize the code’s purpose instead of including code.';
  if (provider === 'gemini') {
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
            
            const t = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
            resolve(t || text.split(/\s+/).slice(0,6).join(' '));
          } catch { resolve(text.split(/\s+/).slice(0,6).join(' ')); }
        });
      });
      req.on('error', reject); req.write(body); req.end();
    });

    return title;
  }
  const u = new URL(BASE_URL.replace(/\/+$/, '') + '/chat/completions');
  const body = JSON.stringify({
    model,
    stream: false,
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

  try {
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
    
    const t = j?.choices?.[0]?.message?.content?.trim();
    return t || text.split(/\s+/).slice(0,6).join(' ') || 'New Chat';
  } catch {
    return text.split(/\s+/).slice(0,6).join(' ') || 'New Chat';
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