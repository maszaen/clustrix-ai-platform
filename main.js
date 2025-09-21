const { app, BrowserWindow, ipcMain, dialog, session, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = require('fs').promises;
const https = require('https');
const cheerio = require('cheerio'); 
const { getJson } = require('serpapi');
const mammoth = require('mammoth');
const xlsx = require('./local_modules/xlsx/xlsx');

const ClustrixLangChainService = require('./backend/langchain-service');
const { MultiAgentOrchestrator } = require('./backend/langchain-agents');
const { getBaseUrl, getApiKey, joinEndpoint, applyThinkingHints } = require('./backend/langchain-helpers');

let langchainService = null;
let agentOrchestrator = null;

app.whenReady().then(() => {
  langchainService = new ClustrixLangChainService(app);
  agentOrchestrator = new MultiAgentOrchestrator(langchainService);
  console.log('LangChain services initialized');
});

const logFile = path.join(app.getPath('userData'), 'app.log');

if (!process.env || Object.keys(process.env).length === 0) {
  console.warn('Warning: No environment variables loaded. Check your .env file and dotenv setup.');
}

function logHelper(context, func, message, details = {}) {
  const time = new Date().toISOString();
  let logLine = `[${context.toUpperCase()} - ${time}] ${func}() → ${message}`;
  if (Object.keys(details).length > 0) {
    logLine += `\n${JSON.stringify(details, null, 2)}`;
  }
  try {
    fs.appendFileSync(logFile, logLine + '\n\n', 'utf-8');
  } catch (e) {
    console.error('Gagal menulis ke file log:', e);
  }
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
    console.error('models:load error', e);
    return defaultModelsConf();
  }
});

ipcMain.handle('models:save', async (_evt, conf) => {
  try {
    fs.writeFileSync(modelsConfFile, JSON.stringify(conf, null, 2), 'utf-8');
    return true;
  } catch (e) {
    console.error('models:save error', e);
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
  
  win.webContents.openDevTools();

  let logState = {
    lastSignature: null,
    lastDetails: null,
    sequenceCount: 0
  };
  ipcMain.on('log:write', (_event, logData) => {
    const { timestamp, context, levelLabel, func, message, details } = logData;
    
    let time;
    if (timestamp && timestamp.includes(':')) {
      time = timestamp;
    } else {
      const d = new Date();
      time = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}.${d.getMilliseconds().toString().padStart(3, '0')}`;
    }

    const signature = `${context}:${func}:${message}`;
    const detailsStr = details ? JSON.stringify(details, Object.keys(details).sort()) : '';
    const isSameBase = signature === logState.lastSignature;
    const hasDetails = details && Object.keys(details).length > 0;

    if (func === 'onToken' && details && details.streamId) {
      if (details.streamId === lastTokenStreamId) {
        try {
          fs.appendFileSync(logFile, `- [${time}] token: ${details.token || '(empty)'}\n`);
          console.log(`- [${time}] token: ${details.token || '(empty)'}`);
        } catch (e) {}
        return;
      }
      lastTokenStreamId = details.streamId;
    } else {
      lastTokenStreamId = null;
    }

    if (isSameBase && hasDetails) {
      logState.sequenceCount++;
      const changedDetails = getChangedDetails(details, logState.lastDetails || {});
      
      if (Object.keys(changedDetails).length > 0) {
        const shortTime = time.split(':').slice(1).join(':');
        let logLine = `${logState.sequenceCount}. [${shortTime}] ${func}().\n${message}`;
        
        console.log(`${logState.sequenceCount}. [${context} - ${shortTime}] ${func}() -> ${message}`);
        
        for (const [key, value] of Object.entries(changedDetails)) {
          const valueString = (typeof value === 'object' && value !== null) ? JSON.stringify(value) : String(value);
          logLine += `\n- ${key}: ${valueString}`;
          console.log(`   - ${key}: ${valueString}`);
        }
        
        try {
          fs.appendFileSync(logFile, logLine + '\n\n', 'utf-8');
        } catch (e) {
          console.error('Gagal menulis ke file log:', e);
        }
      } else {
        // No changes, minimal log
        logState.sequenceCount++;
        const shortTime = time.split(':').slice(1).join(':');
        const minimalLog = `${logState.sequenceCount}. [${shortTime}] ${func}().`;
        
        console.log(`${logState.sequenceCount}. [${context} - ${shortTime}] ${func}().`);
        
        try {
          fs.appendFileSync(logFile, minimalLog + '\n', 'utf-8');
        } catch (e) {}
      }
      
      logState.lastDetails = hasDetails ? {...details} : null;
      
    } else if (isSameBase && !hasDetails) {
      // Same function/message, no data - ultra minimal
      logState.sequenceCount++;
      const shortTime = time.split(':').slice(1).join(':');
      const ultraMinimal = `${logState.sequenceCount}. [${shortTime}]`;
      
      console.log(`${logState.sequenceCount}. [${context} - ${shortTime}]`);
      
      try {
        fs.appendFileSync(logFile, ultraMinimal + '\n', 'utf-8');
      } catch (e) {}
      
    } else {
      // New signature - full format
      logState.lastSignature = signature;
      logState.lastDetails = hasDetails ? {...details} : null;
      logState.sequenceCount = 0;
      
      let logLine = `[${context} ${levelLabel || 'LOG'}] [${time}] ${func}().\n${message}`;
      console.log(`[${context} ${levelLabel || 'LOG'} - ${time}] ${func}() -> ${message}`);
      
      if (hasDetails) {
        for (const [key, value] of Object.entries(details)) {
          const valueString = (typeof value === 'object' && value !== null) ? JSON.stringify(value) : String(value);
          logLine += `\n- ${key}: ${valueString}`;
          console.log(`   - ${key}: ${valueString}`);
        }
      }
      
      try {
        fs.appendFileSync(logFile, logLine + '\n\n', 'utf-8');
      } catch (e) {
        console.error('Gagal menulis ke file log:', e);
      }
    }
  });

function getChangedDetails(current, previous) {
  const changed = {};
  for (const [key, value] of Object.entries(current)) {
    if (previous[key] !== value) {
      changed[key] = value;
    }
  }
  return changed;
}
  
  ipcMain.on('window:minimize', () => win.minimize());
  ipcMain.on('window:maximize', () => {
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  ipcMain.on('window:close', () => win.close());

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
console.log('[FLAGS]', app.commandLine.getSwitchValue('enable-features'));


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
        console.warn('[PKG] 404', abs);
        return new Response('Not found', { status: 404 });
      }

      const data = await fsp.readFile(abs);
      return new Response(data, {
        status: 200,
        headers: { 'Content-Type': guessContentType(abs), 'Cache-Control': 'no-cache' }
      });
    } catch (e) {
      console.error('[PKG] 500', e);
      return new Response('Internal error', { status: 500 });
    }
  });

  protocol.handle('mjx', async (req) => {
    try {
      const raw = req.url.replace(/^mjx:\/*/i, '');
      let rel = decodeURIComponent(raw.replace(/^\/+/, ''));

      if (rel.startsWith('sre/')) {
        console.warn('[MJX] Blocked SRE request →', rel);
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
        console.warn('[MJX] 404', absolutePath);
        return new Response('Not found', { status: 404 });
      }

      const data = await fsp.readFile(absolutePath);
      return new Response(data, {
        status: 200,
        headers: { 'Content-Type': guessContentType(absolutePath), 'Cache-Control': 'no-cache' }
      });
    } catch (err) {
      console.error('[MJX] 500', err);
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


// Persistence (sessions + settings)
const dataFile = path.join(app.getPath('userData'), 'chat_data.json');

ipcMain.handle('sessions:load', async () => {
  try{
    if (!fs.existsSync(dataFile)) return { sessions: [], settings: { persona: {} } };
    const raw = fs.readFileSync(dataFile, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return { sessions: parsed, settings: { persona: {} } }; // legacy
    if (parsed && typeof parsed === 'object') {
        if (typeof parsed.settings.persona === 'string') {
            parsed.settings.persona = { name: '', work: '', preferences: parsed.settings.persona };
        }
        return parsed;
    }
    return { sessions: [], settings: { persona: {} } };
  }catch(e){
    console.error('load error', e);
    return { sessions: [], settings: { persona: {} } };
  }
});

ipcMain.handle('sessions:save', async (_evt, data) => {
  try{
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  }catch(e){
    console.error('save error', e);
    return false;
  }
});

// Artifacts persistence
const artifactsFile = path.join(app.getPath('userData'), 'artifacts.json');

ipcMain.handle('artifacts:load', async () => {
  try{
    if (!fs.existsSync(artifactsFile)) return [];
    const raw = fs.readFileSync(artifactsFile, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  }catch(e){
    console.error('artifacts load error', e);
    return [];
  }
});

ipcMain.handle('artifacts:save', async (_evt, artifacts) => {
  try{
    fs.writeFileSync(artifactsFile, JSON.stringify(artifacts, null, 2), 'utf-8');
    return true;
  }catch(e){
    console.error('artifacts save error', e);
    return false;
  }
});

// Projects IPC handlers
const projectsFile = path.join(app.getPath('userData'), 'projects.json');

ipcMain.handle('projects:load', async () => {
  try{
    if (!fs.existsSync(projectsFile)) return [];
    const content = fs.readFileSync(projectsFile, 'utf-8');
    const parsed = JSON.parse(content || '[]');
    return Array.isArray(parsed) ? parsed : [];
  }catch(e){
    console.error('projects load error', e);
    return [];
  }
});

ipcMain.handle('projects:save', async (_evt, projects) => {
  try{
    fs.writeFileSync(projectsFile, JSON.stringify(projects, null, 2), 'utf-8');
    return true;
  }catch(e){
    console.error('projects save error', e);
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
      logHelper('FILE_READER', 'open-dialog', `Error reading ${fileInfo.name}`, { error: error.message });
    }
    results.push(fileInfo);
  }
  logHelper('FILE_DIALOG', 'ipc:handle', 'Processing complete. Sending results to renderer.', { resultCount: results.length });
  return results;
});

// ---------- Helpers ----------
function mapEffort(mode){
  if (!mode || mode === 'off') return null;
  if (mode === 'low') return 'low';
  if (mode === 'medium') return 'medium';
  if (mode === 'high') return 'high';
  return null;
}

// ---------- Streaming from MAIN (SSE) ----------
const activeStreams = new Map();
ipcMain.on('chat:stream-start', async (event, payload) => {
  try {
    console.debug('MAIN: chat:stream-start invoked', { reqId: payload.reqId, webSearchEnabled: payload.webSearchEnabled, aiMessageIndex: payload.aiMessageIndex });
  } catch (e) {}

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

  // ==================== LANGCHAIN ENHANCEMENT ====================
  // Process messages through LangChain if available
  if (langchainService && agentOrchestrator) {
    processWithLangChain();
  } else {
    processWithoutLangChain();
  }

  async function processWithLangChain() {
    try {
      console.log('MAIN: Starting LangChain processing...');
      logHelper('LANGCHAIN', 'runStandardStreaming', 'Processing with LangChain enhancement');
      
      // Vectorize chat history for better context retrieval
      if (messages && messages.length > 0) {
        console.log(`MAIN: Vectorizing chat history (${messages.length} messages)...`);
        await langchainService.vectorizeChatHistory(sessionId, messages);
      }
      
      const isProject = session.type === 'project' || session.isProject || false;
      console.log(`📋 MAIN: Session type detected: ${isProject ? 'PROJECT' : 'REGULAR'}`);
      
      if (isProject) {
        console.log('MAIN: PROJECT mode - activating agent system...');
        logHelper('LANGCHAIN', 'runStandardStreaming', 'Detected PROJECT session - using agents');
        
        // For project sessions, use agent system for complex processing
        const lastMessage = messages[messages.length - 1];
        if (lastMessage && lastMessage.role === 'user') {
          console.log(`💭 MAIN: Processing user query: "${lastMessage.content.substring(0, 100)}..."`);
          
          // Process uploaded files if any
          if (session.uploadedFiles && session.uploadedFiles.length > 0) {
            console.log(`MAIN: Processing ${session.uploadedFiles.length} uploaded files...`);
            await langchainService.processUploadedFiles(session.uploadedFiles, sessionId);
          }
          
          console.log('MAIN: Calling agent orchestrator...');
          console.log(`MAIN: Provider detected: ${provider}, session type: ${session.type}`);
          
          // Use agent orchestrator for project sessions (OpenAI only for now)
          let agentResponse = null;
          if (provider === 'openai') {
            try {
              agentResponse = await agentOrchestrator.processComplexRequest(
                lastMessage.content, 
                sessionId, 
                session, 
                model, 
                getApiKey(provider, payload)
              );
            } catch (error) {
              console.log('MAIN: Agent orchestrator failed, falling back to standard processing:', error.message);
            }
          } else {
            console.log(`MAIN: Agent orchestrator only supports OpenAI, checking if RE+ACT pattern needed for ${provider}...`);
            
            // For non-OpenAI providers, check if we should use RE+ACT pattern
            // Get files from session.uploadedFiles or from the session's last user message metadata
            let availableFiles = session.uploadedFiles || [];
            if (availableFiles.length === 0 && session.messages && session.messages.length > 1) {
              // Look at the last user message (second-to-last message, since AI message was just added)
              const lastUserMessage = session.messages[session.messages.length - 2];
              if (lastUserMessage && lastUserMessage.length >= 3 && lastUserMessage[2] && lastUserMessage[2].files) {
                availableFiles = lastUserMessage[2].files;
              }
            }
            
            console.log('DEBUG: session.messages length:', session.messages ? session.messages.length : 'undefined');
            console.log('DEBUG: last message (AI):', session.messages && session.messages.length > 0 ? JSON.stringify(session.messages[session.messages.length - 1]) : 'no messages');
            console.log('DEBUG: second-to-last message (user):', session.messages && session.messages.length > 1 ? JSON.stringify(session.messages[session.messages.length - 2]) : 'no user message');
            
            const shouldUseReact = langchainService.shouldUseReasoningAction(
              lastMessage.content,
              availableFiles,
              session.type
            );
            
            console.log(`MAIN: RE+ACT check - sessionType: ${session.type}, uploadedFiles: ${session.uploadedFiles ? session.uploadedFiles.length : 0}, sessionMessageFiles: ${session.messages && session.messages.length > 1 ? (session.messages[session.messages.length - 2][2] && session.messages[session.messages.length - 2][2].files ? session.messages[session.messages.length - 2][2].files.length : 0) : 0}, query: "${lastMessage.content.slice(0, 50)}..."`);
            
            if (shouldUseReact) {
              console.log('MAIN: Using RE+ACT pattern for complex project query analysis...');

              try {
                if (availableFiles && availableFiles.length > 0) {
                    const modelInfo = { provider, model, apiKey: getApiKey(provider, payload), baseUrl: getBaseUrl(provider, payload) };
                    langchainService.reasoningAgent.initializeSession(sessionId, availableFiles, modelInfo);
                    console.log(`MAIN: ReasoningAgent re-initialized for session ${sessionId} with ${availableFiles.length} files.`);
                }
                const aiMessageIndex = session.messages ? session.messages.length - 1 : 0;
                // Send event to initialize thinking UI

                console.debug('MAIN: Sending REACT_START chat-update', { reqId: reqId, aiMessageIndex: payload.aiMessageIndex });
                event.sender.send('chat-update', {
                  type: 'REACT_START',
                  messageIndex: aiMessageIndex,
                  data: {
                    sessionId: session?.id || null
                  }
                });

                // Progress callback to send thinking updates
                const progressCallback = (update) => {
                  if (update.type === 'thinking') {
                    // Calculate the AI message index (should be the last message in the session)
                    const aiMessageIndex = session.messages ? session.messages.length - 1 : 0;
                    // Send thinking update over the same 'chat-update' channel (like web-search does)
                    console.debug('MAIN: Sending THINKING chat-update', { reqId, sessionId, aiMessageIndex, len: String(update.content).length });
                    const safeThink =
                    (update && typeof update.content === 'string' && update.content.trim())
                      ? update.content.trim()
                      : 'Menganalisis berkas proyek, menyusun rencana aksi, dan mengeksekusi langkah-langkah awal.';

                  event.sender.send('chat-update', {
                    type: 'THINKING',
                    messageIndex: aiMessageIndex,
                    data: {
                      sessionId: session?.id,
                      think: safeThink
                    }
                  });
                  } else if (update.type === 'action_result') {
                      const actionData = update.data || {};
                      const results = Array.isArray(actionData.results) ? actionData.results : [];
                      const aiMessageIndex = session.messages ? session.messages.length - 1 : 0;

                      // Buat ringkasan hasil aksi dalam format teks
                      let resultSummary = `\n✅ Aksi '${actionData.action}' selesai.`;

                      if (results.length > 0) {
                          resultSummary += ` Ditemukan ${results.length} hasil:\n`;
                          // Batasi hanya beberapa hasil untuk ditampilkan di log agar tidak terlalu panjang
                          resultSummary += results.slice(0, 5).map(r => 
                              `- **${r.fileName}:${r.lineNumber || '?'}**: \`${r.snippet.trim().substring(0, 80)}...\``
                          ).join('\n');
                          if (results.length > 5) {
                              resultSummary += `\n- ... dan ${results.length - 5} hasil lainnya.`;
                          }
                      } else {
                          resultSummary += ` Tidak ada hasil yang ditemukan.`;
                      }

                      // Kirim ringkasan ini sebagai bagian dari alur pemikiran (THINKING)
                      console.debug('MAIN: Sending formatted ACTION_RESULT as THINKING update');
                      event.sender.send('chat-update', {
                          type: 'THINKING',
                          messageIndex: aiMessageIndex,
                          data: {
                              think: resultSummary,
                              reqId,
                              sessionId
                          }
                      });
                  }
                };

                if (availableFiles && availableFiles.length > 0) {
                const modelInfo = { provider, model, apiKey: getApiKey(provider, payload), baseUrl: getBaseUrl(provider, payload) };
                langchainService.reasoningAgent.initializeSession(sessionId, availableFiles, modelInfo);
            }

                const reactResult = await langchainService.processWithReasoningAction(
                  lastMessage.content,
                  sessionId,
                  availableFiles,
                  model,
                  provider,
                  getApiKey(provider, payload),
                  getBaseUrl(provider, payload),
                  progressCallback  // Pass progress callback
                );

                console.log(`MAIN: RE+ACT completed with ${reactResult.actionsExecuted} actions`);

                // CAREFULLY: Ensure response is a string before processing
                let responseText = '';
                if (typeof reactResult === 'string') {
                  responseText = reactResult;
                } else if (reactResult && reactResult.response && typeof reactResult.response.response === 'string') {
                  // <<< TAMBAHKAN KONDISI INI
                  responseText = reactResult.response.response;
                } else if (reactResult && typeof reactResult.response === 'string') {
                  responseText = reactResult.response;
                } else if (reactResult && reactResult.finalResponse && typeof reactResult.finalResponse === 'string') {
                  responseText = reactResult.finalResponse;
                } else {
                  // Fallback for malformed response
                  console.log("MAIN: RE+ACT returned malformed response, using fallback", { reactResult });
                  responseText = 'RE+ACT analysis completed but response format was unexpected. Please try rephrasing your question.';
                }

                // CAREFULLY: Safe string operations with validation
                // CAREFULLY: Safe string operations with validation
                if (responseText && typeof responseText === 'string' || responseText && responseText.length > 0) {
                  const tokens = responseText.split(/\s+/);
                  for (const t of tokens) {
                    event.sender.send(`chat:chunk-${reqId}`, t + ' ');
                    await new Promise(r => setTimeout(r, 18)); // kecilin/naikin sesuai selera
                  }
                  event.sender.send(`chat:done-${reqId}`);
                  activeStreams.delete(reqId);
                  return;
                }

              } catch (reactError) {
                console.error('MAIN: RE+ACT processing failed for project session, falling back:', reactError.message);
                console.error('MAIN: Full RE+ACT error:', reactError);
                // Fall through to standard processing
              }
            } else {
              console.log('MAIN: RE+ACT not needed for this query, using standard processing');
            }
          }
          
          // Send agent response as stream chunks
          if (agentResponse) {
            console.log(`MAIN: Agent response received (${agentResponse.length} chars), starting streaming...`);
            const chunks = agentResponse.split(' ');
            let index = 0;
            const sendChunk = () => {
              if (index < chunks.length) {
                event.sender.send(`chat:chunk-${reqId}`, chunks[index] + ' ');
                index++;
                setTimeout(sendChunk, 50); // Simulate streaming
              } else {
                console.log('MAIN: Agent streaming completed');
                event.sender.send(`chat:done-${reqId}`);
                activeStreams.delete(reqId);
              }
            };
            sendChunk();
            return;
          } else {
            console.log('MAIN: No agent response received, falling back to standard processing');
          }
        }
      } else {
        console.log('MAIN: REGULAR mode - checking if RE+ACT pattern needed...');
        logHelper('LANGCHAIN', 'runStandardStreaming', 'Regular session - analyzing query complexity');
        
        // Get current message content
        const currentMessage = messages[messages.length - 1].content;
        
        // Check if we should use RE+ACT pattern
        const shouldUseReact = langchainService.shouldUseReasoningAction(
          currentMessage,
          session.uploadedFiles || [],
          session.type
        );
        
        if (shouldUseReact) {
          console.log('MAIN: Using RE+ACT pattern for complex query analysis...');

          const aiMessageIndex = session.messages ? session.messages.length - 1 : 0;

          // Kirim event untuk memulai UI pemikiran DENGAN menyertakan index yang benar
          console.debug('MAIN: Sending REACT_START chat-update', { reqId: reqId, aiMessageIndex });
          event.sender.send('chat-update', { 
              type: 'REACT_START', 
              messageIndex: aiMessageIndex, // << PENTING
              data: { query: lastMessage.content.substring(0, 100) }
          });
          
          try {
            const reactResult = await langchainService.processWithReasoningAction(
              currentMessage,
              sessionId,
              session.uploadedFiles || [],
              model
            );
            
            console.log(`MAIN: RE+ACT completed with ${reactResult.actionsExecuted} actions`);
            
            // CAREFULLY: Ensure response is a string before processing
            let responseText = '';
            if (typeof reactResult === 'string') {
              responseText = reactResult;
            } else if (reactResult && reactResult.response && typeof reactResult.response.response === 'string') {
              // <<< TAMBAHKAN KONDISI INI
              responseText = reactResult.response.response;
            } else if (reactResult && typeof reactResult.response === 'string') {
              responseText = reactResult.response;
            } else if (reactResult && reactResult.finalResponse && typeof reactResult.finalResponse === 'string') {
              responseText = reactResult.finalResponse;
            } else {
              // Fallback for malformed response
              logHelper("MAIN", "runStandardStreaming", "RE+ACT returned malformed response, using fallback", { reactResult });
              responseText = 'RE+ACT analysis completed but response format was unexpected. Please try rephrasing your question.';
            }

            // CAREFULLY: Safe string operations with validation
            if (responseText && typeof responseText === 'string' || responseText && responseText.length > 0) {
                const tokens = responseText.split(/\s+/);
                for (const t of tokens) {
                  event.sender.send(`chat:chunk-${reqId}`, t + ' ');
                  await new Promise(r => setTimeout(r, 18)); // kecilin/naikin sesuai selera
                }
                logHelper("MAIN", "Line 925", "This line is executed")
                event.sender.send(`chat:done-${reqId}`);
                activeStreams.delete(reqId);
                return;
              } else {
              logHelper("MAIN", "runStandardStreaming", "RE+ACT response is not a valid string, falling back to standard processing");
              // Fall through to standard processing
            }
            
          } catch (reactError) {
            console.error('MAIN: RE+ACT processing failed, falling back:', reactError);
            // Fall through to standard processing
          }
        }
        
        // Standard context enhancement for simple queries
        console.log('MAIN: Using standard context enhancement...');
        messages = await langchainService.processMessage(messages, model, {}, sessionId, session);
        console.log(`MAIN: Messages enhanced, new count: ${messages.length}`);
      }
      
    } catch (error) {
      console.error('MAIN: LangChain processing error:', error);
      logHelper('LANGCHAIN', 'runStandardStreaming', 'LangChain processing failed, falling back', { error: error.message });
    }
    
    console.log('MAIN: Proceeding with standard streaming...');
    // Continue with standard streaming
    processWithoutLangChain();
  }

  function processWithoutLangChain() {
    // Original streaming logic
    const BASE_URL = getBaseUrl(provider, payload);
    const API_KEY = getApiKey(provider, payload);

    function sendDone(){ event.sender.send(`chat:done-${reqId}`); activeStreams.delete(reqId); }
    function sendErr(msg){ 
      event.sender.send(`chat:error-${reqId}`, msg); 
      activeStreams.delete(reqId); 
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

        const contents = [];
        for (const m of messages) {
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
              const text = (j.candidates?.[0]?.content?.parts || [])
                .map(p => p.text || '').join('');
              if (text) event.sender.send(`chat:chunk-${reqId}`, text);
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
      let bodyObj = { model, messages, stream: true };
      applyThinkingHints({ provider, model, bodyObj, thinkMode: payload.thinkMode });
      const body = JSON.stringify(bodyObj);

      const headers = {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Content-Length': Buffer.byteLength(body)
      };

      if (API_KEY) headers.Authorization = `Bearer ${API_KEY}`;
      if (provider === 'openrouter') {
        headers['HTTP-Referer'] = 'https://clustrix.local';
        headers['X-Title'] = 'Clustrix Desktop';
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

              // 'thinking' / 'reasoning'
              let think =
                j?.choices?.[0]?.message?.reasoning_content ??
                j?.choices?.[0]?.message?.reasoning ??
                j?.reasoning_content ??
                j?.reasoning ??
                j?.thoughts ??
                '';

              if (Array.isArray(think)) think = think.map(p => (p?.text ?? p)).join('');
              if (think) event.sender.send(`chat:chunk-${reqId}`, { think });

              // text biasa
              let text =
                j?.choices?.[0]?.message?.content ??
                j?.message?.content ??
                j?.output_text ?? '';

              if (Array.isArray(text)) text = text.map(p => (p?.text ?? p)).join('');
              if (text) event.sender.send(`chat:chunk-${reqId}`, text);

              sendDone();
            } catch (e) {
              sendErr(`JSON parse error (non-stream): ${e.message?.slice(0,100)}`);
            }
          });
          return;
        }

        res.setEncoding('utf8');
        let buffer = '';
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

              const delta =
                j?.choices?.[0]?.delta?.content ??
                j?.delta?.content ??
                j?.content ?? '';

              if (delta) event.sender.send(`chat:chunk-${reqId}`, delta);

            } catch (e) {
              console.log('[SSE BAD JSON]', payload.slice(0,200));
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
});


// ---------- Title suggestion (non-stream) ----------
ipcMain.handle('chat:title', async (_evt, payload) => {
  const text     = payload?.text  || '';
  const model    = payload?.model || 'glm-4.5-flash';
  const provider = String(payload?.provider || '').toLowerCase();
  const extraHdr = payload?.headers || {};

  // default base URL per provider
  const defBase = (p) =>
    p === 'openrouter' ? 'https://openrouter.ai/api/v1' :
    p === 'groq'       ? 'https://api.groq.com/openai/v1' :
    p === 'gemini'     ? 'https://generativelanguage.googleapis.com/v1beta' :
                          'https://api.z.ai/api/paas/v4/';

  const BASE_URL = (payload?.baseUrl || '').trim() || defBase(provider);
  const API_KEY  = (payload?.apiKey  || '').trim()
                || (provider === 'openrouter' ? (process.env.OPENROUTER_API_KEY || '') :
                    provider === 'groq'       ? (process.env.GROQ_API_KEY || '') :
                    provider === 'gemini'     ? (process.env.GEMINI_API_KEY || '') :
                                                (process.env.Z_API_KEY || process.env.OPENAI_API_KEY || ''));

  const sys = 'You are a title generator. Create a specific, 3-6 word title in Title Case for the following user query. Do not use quotes or periods. Your response must not exceed 6 words. If the query contains code, summarize the code’s purpose instead of including code.';

  // --- Gemini (non-OpenAI style)
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
            const t = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
            resolve(t || text.split(/\s+/).slice(0,6).join(' '));
          } catch { resolve(text.split(/\s+/).slice(0,6).join(' ')); }
        });
      });
      req.on('error', reject); req.write(body); req.end();
    });

    return title;
  }

  // --- OpenAI-style (OpenRouter/Groq/Z AI/Custom)
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
    const t = j?.choices?.[0]?.message?.content?.trim();
    return t || text.split(/\s+/).slice(0,6).join(' ') || 'New Chat';
  } catch {
    return text.split(/\s+/).slice(0,6).join(' ') || 'New Chat';
  }
});

// Search capability
const TRIAGE_SYSTEM_PROMPT = `You are a reasoning agent. Your first task is to analyze the user's query and decide if it requires real-time internet access. The current date is ${new Date().toISOString()}. Respond ONLY with a single JSON object. Do not add any text before or after it.
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
    const triageMessages = [{ role: 'system', content: TRIAGE_SYSTEM_PROMPT }, { role: 'user', content: userQuery }];
    const triageResponse = await invokeLLM_nonStream(triageMessages, payload);
    
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
      logHelper('WEB_CHAT', 'performWebSearch', 'Pencarian tidak menemukan hasil. Kembali ke mode standar.');
      return runStandardStreaming(event, payload);
    }
    logHelper('WEB_CHAT', 'performWebSearch', `Pencarian berhasil. Ditemukan ${searchResults.length} hasil.`, { titles: searchResults.map(r => r.title) });
    event.sender.send('search:status', { step: 'FOUND_URLS', data: searchResults });

    const urlsToScrape = searchResults.map(r => r.link);
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

    let searchContext = "Use the following search results to answer the user's original query. The user's original query was: \"" + decision.user_prompt + "\". Base your answer on these facts and cite sources with markdown links `[Source: Title](URL)`.\n\n";
    nonEmptyContent.forEach((content, i) => {
      const result = searchResults[i];
      searchContext += `--- Source ${i+1}: ${result.title} (${result.link}) ---\n${content}\n\n`;
    });
    
    const finalMessages = [ ...messages ];
    finalMessages.splice(messages.length - 1, 0, { role: 'system', content: searchContext });
    
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
            resolve(j?.choices?.[0]?.message?.content?.trim() || '');
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

async function performWebSearch(queries, config) {
  if (!config || typeof config !== 'object') {
    logHelper('WEB_SEARCH', 'performWebSearch', 'FATAL ERROR: Konfigurasi pencarian tidak valid atau hilang.', { receivedConfig: config });
    return [];
  }

  const provider = config.provider || 'serpapi';
  logHelper('WEB_SEARCH', 'performWebSearch', `Fungsi dipanggil dengan provider: ${provider}`, { queries });

  if (provider === 'google') {
    if (!config.googleApiKey || !config.googleCseId) {
      logHelper('WEB_SEARCH', 'performWebSearch', 'ERROR: Google API Key atau CX (Search Engine ID) tidak diatur.');
      return [];
    }
    try {
      const promises = queries.map(q => new Promise((resolve, reject) => {
        const url = new URL('https://www.googleapis.com/customsearch/v1');
        url.searchParams.set('key', config.googleApiKey);
        url.searchParams.set('cx', config.googleCseId);
        url.searchParams.set('q', q);
        url.searchParams.set('hl', 'id');
        url.searchParams.set('gl', 'id');
        
        logHelper('WEB_SEARCH', 'performWebSearch', 'Membuat request ke Google CSE API', { url: url.toString() });

        const req = https.get(url, (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(JSON.parse(data));
            } else {
              logHelper('WEB_SEARCH', 'performWebSearch', `Google API HTTP Error ${res.statusCode}`, { response: data });
              resolve({ items: [] });
            }
          });
        });
        req.on('error', (err) => {
          logHelper('WEB_SEARCH', 'performWebSearch', 'Google API Request Error', { error: err.message });
          resolve({ items: [] });
        });
      }));

      const results = await Promise.all(promises);
      logHelper('WEB_SEARCH', 'performWebSearch', `Menerima ${results.length} respons dari Google CSE API.`);

      const transformedResults = results.flatMap(res => res.items || [])
        .map(item => ({
          link: item.link,
          title: item.title,
          snippet: item.snippet
        }))
        .filter(r => r.link && !r.link.includes("youtube.com"))
        .slice(0, 5);
      
      logHelper('WEB_SEARCH', 'performWebSearch', `Transformasi hasil Google selesai. Ditemukan ${transformedResults.length} hasil organik.`);
      return transformedResults;

    } catch (error) {
      logHelper('WEB_SEARCH', 'performWebSearch', 'FATAL ERROR: Pencarian Google CSE API gagal.', { error: error.message });
      return [];
    }
  } else {
    if (!config.serpApiKey) {
      logHelper('WEB_SEARCH', 'performWebSearch', 'ERROR: SerpAPI Key tidak diatur.');
      return [];
    }
    try {
      const promises = queries.map(q => getJson({ q, api_key: config.serpApiKey, hl: 'id', gl: 'id' }));
      const results = await Promise.all(promises);
      logHelper('WEB_SEARCH', 'performWebSearch', `Menerima ${results.length} respons dari SerpAPI.`);

      const organicResults = results.flatMap(r => r.organic_results || [])
        .filter(r => r.link && !r.link.includes("youtube.com"))
        .slice(0, 5);
      logHelper('WEB_SEARCH', 'performWebSearch', `Filter hasil SerpAPI selesai. Ditemukan ${organicResults.length} hasil organik.`);
      return organicResults;
    } catch (error) {
      logHelper('WEB_SEARCH', 'performWebSearch', 'FATAL ERROR: Pencarian SerpApi gagal.', { error: error.message });
      return [];
    }
  }
}

async function scrapeUrls(urls) {
  const MAX_CHARS_PER_PAGE = 2000;
  const scrapePromises = urls.map(url => new Promise(async (resolve) => {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) return resolve("");
      const html = await response.text();
      const $ = cheerio.load(html);
      $('script, style, nav, footer, header, aside, form').remove();
      const text = $('body').text().replace(/\s\s+/g, ' ').trim();
      resolve(text.substring(0, MAX_CHARS_PER_PAGE));
    } catch (e) {
      resolve("");
    }
  }));
  return Promise.all(scrapePromises);
}