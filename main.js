const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');

const logFile = path.join(app.getPath('userData'), 'app.log');
let lastTokenStreamId = null; 

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
      zai: {
        baseUrl: 'https://api.z.ai/api/paas/v4/',
        apiKey: '',
        models: ['glm-4.5-flash']
      },
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
    width: 1200, height: 900,
    frame: false,
    minWidth: 850,
    minHeight: 400,
    icon: path.join(__dirname, 'public', 'images', 'favicon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false
    }
  });
  
  // win.webContents.openDevTools();

  // Logging
  ipcMain.on('log:write', (_event, logData) => {
    const { timestamp, context, func, message, details } = logData;
    const d = new Date(timestamp);
    const time = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}:${d.getMilliseconds().toString().padStart(3, '0')}`;

    if (func === 'onToken' && details && details.streamId) {
      if (details.streamId === lastTokenStreamId) {
        try {
          fs.appendFileSync(logFile, `- [${time}] token: ${details.token || '(empty)'}\n`);
        } catch (e) { /* silent fail */ }
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
app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// ---------- Persistence (sessions + settings) ----------
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
  // auto => biarin null, provider decide
  return null;
}

function applyThinkingHints({ provider, model, bodyObj, thinkMode }) {
  const effort = mapEffort(thinkMode);
  if (!effort && thinkMode !== 'auto') return;

  // Hint generik untuk OpenAI-style
  bodyObj.stream_options = Object.assign({}, bodyObj.stream_options, { include_reasoning: true });

  // Banyak proxy/vendor mengikuti kunci ini:
  if (effort) {
    bodyObj.reasoning = Object.assign({}, bodyObj.reasoning, { effort }); // 'low' | 'medium' | 'high'
  }

  // Heuristik ringan untuk beberapa model (aman diabaikan kalau tak dikenal)
  const mid = String(model || '').toLowerCase();
  if (mid.includes('deepseek')) {
    // beberapa adaptor memetakan ke internal "thoughts"; kita kasih hint token limit
    if (!bodyObj.max_thought_tokens && effort) {
      bodyObj.max_thought_tokens = effort === 'high' ? 2048 : effort === 'medium' ? 1024 : 512;
    }
    // tanda supaya server kirim stream thinking kalau bisa
    bodyObj.stream_options.include_reasoning = true;
  }

  // Untuk OpenRouter/Groq/ZAI (OpenAI-style) ini aman—server akan abaikan jika tidak support.
}

// ---------- Streaming from MAIN (SSE) ----------
const activeStreams = new Map();
ipcMain.on('chat:stream-start', (event, payload) => {
  const reqId = payload.reqId;
  const messages = payload.messages || [];
  const model = payload.model || 'glm-4.5-flash';
  const provider = (payload.provider || 'openrouter').toLowerCase();

  let BASE_URL =
    (payload.baseUrl || '') ||
    (provider === 'openrouter' ? 'https://openrouter.ai/api/v1' :
    provider === 'groq'      ? 'https://api.groq.com/openai/v1' :
    provider === 'gemini'    ? 'https://generativelanguage.googleapis.com/v1beta' :
    provider === 'zai'       ? 'https://api.z.ai/api/paas/v4/' :
                                (process.env.BASE_URL || 'https://api.z.ai/api/paas/v4/'));

  let API_KEY =
    (payload.apiKey || '') ||
    (provider === 'openrouter' ? (process.env.OPENROUTER_API_KEY || '') :
    provider === 'groq'      ? (process.env.GROQ_API_KEY || '') :
    provider === 'gemini'    ? (process.env.GEMINI_API_KEY || '') :
    provider === 'zai'       ? (process.env.Z_API_KEY || '') :
                                (process.env.Z_API_KEY || process.env.OPENAI_API_KEY || ''));


  function sendDone(){ event.sender.send(`chat:done-${reqId}`); activeStreams.delete(reqId); }
  function sendErr(msg){ event.sender.send(`chat:error-${reqId}`, msg); activeStreams.delete(reqId); }

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
    headers['HTTP-Referer'] = 'https://zenai.local';
    headers['X-Title'] = 'ZenAI Desktop';
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
        // ====> PASTE BLOK NON-SSE DI SINI (SEBELUM ambil text biasa)
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
});

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
          if (res.statusCode < 200 || res.statusCode >= 300) return reject(new Error(`HTTP ${res.statusCode} ${res.statusMessage} — ${acc.slice(0,200)}`));
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
    headers['HTTP-Referer'] = headers['HTTP-Referer'] || 'https://zenai.local';
    headers['X-Title'] = headers['X-Title'] || 'ZenAI Desktop';
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
        reject(new Error(`HTTP ${res.statusCode} ${res.statusMessage} — ${acc.slice(0,200)}`));
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