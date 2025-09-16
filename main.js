const { app, BrowserWindow, ipcMain, dialog, session, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = require('fs').promises;
const https = require('https');
const cheerio = require('cheerio'); 
const { getJson } = require('serpapi');
const mammoth = require('mammoth');
const xlsx = require('./xlsx/xlsx');


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

// ---------- Models Config (providers) ----------
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
          'deepseek/deepseek-chat',
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

  // Logging
  ipcMain.on('log:write', (_event, logData) => {
    const { timestamp, context, func, message, details } = logData;
    const d = new Date(timestamp);
    const time = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}:${d.getMilliseconds().toString().padStart(3, '0')}`;

    if (func === 'onToken' && details && details.streamId) {
      if (details.streamId === lastTokenStreamId) {
        try {
          fs.appendFileSync(logFile, `- [${time}] token: ${details.token || '(empty)'}\n`);
        } catch (e) {}
        return;
      }
      
      lastTokenStreamId = details.streamId;
    } else {
      lastTokenStreamId = null;
    }

    let logLine = `[${context} - ${time}] ${func}() → ${message}`;
    if (details && Object.keys(details).length > 0) {
      for (const [key, value] of Object.entries(details)) {
        const valueString = (typeof value === 'object' && value !== null) ? JSON.stringify(value) : String(value);
        logLine += `\n- ${key}: ${valueString}`;
      }
    }

    try {
      fs.appendFileSync(logFile, logLine + '\n\n', 'utf-8');
    } catch (e) {
      console.error('Gagal menulis ke file log:', e);
    }
  });
  
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
  const appVersion = app.getVersion();
  console.log(`Application Version (from package.json): ${appVersion}`);
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
        extensions: ['docx', 'xlsx', 'xls', 'txt', 'md', 'js', 'ts', 'tsx', 'java', 'html', 'css', 'json', 'py'] 
      }
    ]
  });

  logHelper('FILE_DIALOG', 'ipc:handle', `Dialog closed. Canceled: ${canceled}`, { filePaths });
  if (canceled || filePaths.length === 0) return [];
  
  const MAX_FILES = 2;
  const MAX_SIZE_KB = 600;

  if (filePaths.length > MAX_FILES) {
    dialog.showErrorBox('Upload Failed', `You can select a maximum of ${MAX_FILES} files.`);
    return [];
  }

  try {
    let totalSize = 0;
    for (const filePath of filePaths) {
      const stats = await fsp.stat(filePath);
      totalSize += stats.size;
    }
    if (totalSize > MAX_SIZE_KB * 1024) {
      dialog.showErrorBox('Upload Failed', `Total file size cannot exceed ${MAX_SIZE_KB} KB.`);
      return [];
    }
  } catch (error) {
    logHelper('FILE_DIALOG', 'ipc:handle', 'Failed to validate file size.', { error: error.message });
    dialog.showErrorBox('Error', 'Failed to validate file size.');
    return [];
  }
  
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
function joinEndpoint(base, p){
  const b = String(base || '').replace(/\/+$/, '');
  const s = String(p || '').replace(/^\/+/, '');
  return `${b}/${s}`;
}

function mapEffort(mode){
  if (!mode || mode === 'off') return null;
  if (mode === 'low') return 'low';
  if (mode === 'medium') return 'medium';
  if (mode === 'high') return 'high';
  return null;
}

function applyThinkingHints({ provider, model, bodyObj, thinkMode }) {
  const effort = mapEffort(thinkMode);
  if (!effort && thinkMode !== 'auto') return;

  bodyObj.stream_options = Object.assign({}, bodyObj.stream_options, { include_reasoning: true });

  if (effort) {
    bodyObj.reasoning = Object.assign({}, bodyObj.reasoning, { effort }); // 'low' | 'medium' | 'high'
  }

  const mid = String(model || '').toLowerCase();
  if (mid.includes('deepseek')) {
    if (!bodyObj.max_thought_tokens && effort) {
      bodyObj.max_thought_tokens = effort === 'high' ? 2048 : effort === 'medium' ? 1024 : 512;
    }
    bodyObj.stream_options.include_reasoning = true;
  }

}

// ---------- Streaming from MAIN (SSE) ----------
const activeStreams = new Map();
ipcMain.on('chat:stream-start', async (event, payload) => {
  if (!payload.webSearchEnabled) {
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
  const messages = payload.messages || [];
  const model = payload.model || 'glm-4.5-flash';
  const provider = (payload.provider || 'openrouter').toLowerCase();

  let BASE_URL =
    (payload.baseUrl || '') ||
    (provider === 'openrouter' ? 'https://openrouter.ai/api/v1' :
    provider === 'groq'      ? 'https://api.groq.com/openai/v1' :
    provider === 'gemini'    ? 'https://generativelanguage.googleapis.com/v1beta' :
    provider === 'zhipu'       ? 'https://api.z.ai/api/paas/v4/' :
    provider === 'cerebras'  ? 'https://api.cerebras.ai/v1/' :
                                (process.env.BASE_URL || 'https://api.z.ai/api/paas/v4/'));

  let API_KEY =
    (payload.apiKey || '') ||
    (provider === 'openrouter' ? (process.env.OPENROUTER_API_KEY || '') :
    provider === 'groq'      ? (process.env.GROQ_API_KEY || '') :
    provider === 'gemini'    ? (process.env.GEMINI_API_KEY || '') :
    provider === 'zhipu'       ? (process.env.Z_API_KEY || '') :
    provider === 'cerebras'  ? (process.env.CEREBRAS_API_KEY || '') :
                                (process.env.Z_API_KEY || process.env.OPENAI_API_KEY || ''));

  function sendDone(){ event.sender.send(`chat:done-${reqId}`); activeStreams.delete(reqId); }
  function sendErr(msg){ 
    event.sender.send(`chat:error-${reqId}`, msg); 
    activeStreams.delete(reqId); 
  }

  if (provider === 'gemini') {
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
    return;
  }

  const url = new URL(joinEndpoint(BASE_URL, 'chat/completions'));
  let bodyObj = { model, messages, stream: true };
  applyThinkingHints({ provider, model, bodyObj, thinkMode: payload.thinkMode });
  const body = JSON.stringify(bodyObj);

  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream',
    'Content-Length': Buffer.byteLength(body)
  };
  if (API_KEY) headers['Authorization'] = `Bearer ${API_KEY}`;
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://clustrix.local';
    headers['X-Title'] = 'Clustrix Desktop';
  }

  const options = {
    method: 'POST',
    hostname: url.hostname,
    path: url.pathname + url.search,
    protocol: url.protocol,
    headers
  };

  const req = https.request(options, (res) => {
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