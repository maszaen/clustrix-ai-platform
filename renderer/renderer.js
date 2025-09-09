let state = { sessions: [], settings: { persona: { name: "", work: "", prefs: "" }, theme: "light" } };
let current = null;
let collapsed = false;
let loadedSessionCount = 0;
let isAdvancedSearch = false;
let onlineResumeTimer = null;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const THINKING_TIMER = new WeakMap();
const SESSIONS_PER_PAGE = 30;
const DEBUG_MODE = typeof window.api === "undefined";
const LOGGING = true;
const streamManager = {
  activeStreams: {},
  byKey: {},

  makeKey(session, messageIndex) {
    return `${session.created_at}:${messageIndex}`;
  },

  stopAllForKey(key) {
    const oldId = this.byKey[key];
    if (oldId && this.activeStreams[oldId]) {
      this.activeStreams[oldId].controller?.cancel?.();
      delete this.activeStreams[oldId];
    }
    delete this.byKey[key];
  },
  
  gcZombies() {
    for (const id in this.activeStreams) {
      const s = this.activeStreams[id];

      const wrongNode = s?.aiNode && s.aiNode.dataset?.streamId && s.aiNode.dataset.streamId !== id;
      if (wrongNode) {
        try { s.controller?.cancel?.(); } catch {}
        delete this.activeStreams[id];
        continue;
      }

      const offscreen = !s?.aiNode || !document.contains(s.aiNode);
      if (offscreen) {
        s.offscreen = true;
        continue;
      }
    }
  },

  markAwaitingResume() {
    this.gcZombies();
    const now = Date.now();
    for (const id in this.activeStreams) {
      const s = this.activeStreams[id];
      s.awaitingResume = true;
      if (!s.lastActivity) s.lastActivity = now;
    }
  },

  kickSoftResume(reason = 'online') {
    this.gcZombies();

    const now = Date.now();
    const STALE_MS = 6000;
    for (const id in this.activeStreams) {
      const s = this.activeStreams[id];

      if (s.isResuming) continue;

      if (s.sawEnd || s.endSeen) continue;

      const stale = now - (s.lastActivity || s.startedAt || 0);
      const shouldResume = s.awaitingResume || stale > STALE_MS;

      if (!shouldResume) continue;

      s.isResuming = true;

      try {
        if (typeof s.autoResume === 'function') {
          s.autoResume(reason);
        } else {
          const msgs = s.messages || buildResumeMessagesFromSession(s.session, s.messageIndex, s.fullResponse);
          startStream(
            s.session,
            s.contextPrompt ?? null,
            s.aiNode,
            s.messageIndex,
            false,
            msgs
          );
        }
      } catch (err) {
        console.warn('[RESUME] gagal soft resume', id, err);
      } finally {
        s.isResuming = false;
        s.awaitingResume = false;
      }
    }

    updateInputState?.();
  },

  startStream(streamId, data) {
    const key = this.makeKey(data.session, data.messageIndex);
    this.stopAllForKey(key);
    this.gcZombies();
    this.activeStreams[streamId] = { ...data, fullResponse: "" };
    this.byKey[key] = streamId;
    updateInputState();
  },

  stopStream(streamId) {
    this.gcZombies();
    log("STREAM", 1, "stopStream", "Attempting to stop stream", { streamId });
    log("STREAM", 0, "stopStream", "Active streams before stopping", { activeStreams: Object.keys(this.activeStreams) });

    if (this.activeStreams[streamId]) {
      this.activeStreams[streamId].controller?.cancel();
      const { [streamId]: _, ...rest } = this.activeStreams;
      this.activeStreams = rest;
      log("STREAM", 2, "stopStream", "Stream stopped and removed from active list", { streamId });
    } else {
      log("STREAM", 3, "stopStream", "Failed to stop stream: ID not found", { streamId });
    }

    for (const k in this.byKey) if (this.byKey[k] === streamId) delete this.byKey[k];
    log("STREAM", 0, "stopStream", "Active streams after stopping", { activeStreams: Object.keys(this.activeStreams) });
    updateInputState();
  },

  isStreaming() {
    return Object.keys(this.activeStreams).length > 0;
  },

  isStreamingInSession(session) {
    if (!session) return false;
    for (const streamId in this.activeStreams) {
      if (this.activeStreams[streamId].session === session) {
        return true;
      }
    }
    return false;
  },

  shutdownGracefully() {
    if (!this.isStreaming()) return;
    for (const streamId in this.activeStreams) {
      const stream = this.activeStreams[streamId];
      stream.controller?.cancel();
    }
    this.activeStreams = {};
    save();
    updateInputState();
  },
};


// Utility Functions
function nowISO() {
  return new Date().toISOString();
}

function newSessionName() {
  const d = new Date();
  return `Untitled chat ${d.toTimeString().slice(0, 5)}`;
}

function formatUserMessage(content) {
  return esc(content).replace(/\n/g, "<br/>");
}

function esc(s) {
  if (!s) return "";
  return s
    .toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function ensureThinkingUI(aiNode) {
  if (aiNode._thinkingReady) return;
  aiNode._thinkingReady = true;

  const wrap = document.createElement('div');
  wrap.className = 'thinking-wrap';

  const toggle = document.createElement('button');
  toggle.className = 'thinking-toggle';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.innerHTML = `
    <span>Thinking</span>
    <svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round"/></svg>
  `;

  const body = document.createElement('div');
  body.className = 'thinking-body';
  const text = document.createElement('div');
  text.className = 'thinking-text';
  body.appendChild(text);

  toggle.addEventListener('click', () => {
    const ex = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', ex ? 'false' : 'true');
    body.classList.toggle('expanded', !ex);
  });

  wrap.appendChild(toggle);
  wrap.appendChild(body);

  const content = aiNode.querySelector('.message-content') || aiNode;
  content.prepend(wrap);

  aiNode._thinkingEl = { wrap, toggle, body, text };
}

function appendThinking(aiNode, chunk, session, messageIndex) {
  if (!chunk) return;
  ensureThinkingUI(aiNode);

  // simpan ke session map
  session._x_think = session._x_think || {};
  session._x_think[messageIndex] = (session._x_think[messageIndex] || '') + String(chunk);

  // render pakai formatter yang sudah ada
  const el = aiNode._thinkingEl;
  if (el) {
    // auto expand saat token pertama
    if (!el.body.classList.contains('expanded')) {
      el.body.classList.add('expanded');
      el.toggle.setAttribute('aria-expanded', 'true');
    }
    el.text.innerHTML = renderWithExistingFormatter(session._x_think[messageIndex]);
  }

  // persist (debounce)
  saveThinkingDebounced();
}

function renderWithExistingFormatter(raw) {
  try {
    if (typeof window.renderMarkdown === 'function') return window.renderMarkdown(raw);
    if (typeof window.formatMessage === 'function') return window.formatMessage(raw);
  } catch {}
  // fallback aman
  const esc = (s) => String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return esc(raw).replace(/\n/g, '<br/>');
}

const saveThinkingDebounced = (() => {
  let t = null;
  return () => { clearTimeout(t); t = setTimeout(() => { try { save(); } catch {} }, 200); };
})();

function log(context, level, contextFunc, message, details = {}) {
  if (!LOGGING) return;

  const USE_CONSOLE_INFO = false;
  const config = {
    0: { label: 'TRACE', color: '#8a2be2', out: 'log', detailOut: 'log' },
    1: { label: 'DEBUG', color: '#e1e1e1ff', out: 'log', detailOut: 'log' },
    2: { label: 'INFO',  color: '#3498db', out: USE_CONSOLE_INFO ? 'info' : 'log', detailOut: USE_CONSOLE_INFO ? 'info' : 'log' },
    3: { label: 'WARN',  color: '#f39c12', out: 'warn',  detailOut: 'warn' },
    4: { label: 'ERROR', color: '#e74c3c', out: 'error', detailOut: 'error' },
  };
  const { label, color, out, detailOut } = config[level] || {
    label: 'LOG', color: '#95a5a6', out: 'log', detailOut: 'log'
  };
  const time = new Date().toISOString();
  const hasDetails = details && Object.keys(details).length > 0;
  const logMessage = `%c[${String(context).toUpperCase()} → ${label}, ${time}] ${contextFunc}() → ${message}`;
  const logStyle   = `color: ${color}; font-weight: bold;`;
  const printKV = (printer) => {
    Object.entries(details).forEach(([key, value]) => {
      printer(`%c${key}:`, `color: ${color}; font-weight: bold;`, value);
    });
  };
  
  if (level === 5) {
    console.log(`${contextFunc} → ${message}`)
  } else if (level === 0) {
    console.groupCollapsed(logMessage, logStyle);
    if (hasDetails) printKV(console.log);
    console.trace('Stack trace:');
    console.groupEnd();
  } else if (hasDetails) {
    console.groupCollapsed(logMessage, logStyle);
    printKV(console[detailOut]);
    console.groupEnd();
  } else {
    console[out](logMessage, logStyle);
  }

  if (window.api && window.api.logging && typeof window.api.logging.write === 'function') {
    window.api.logging.write({
      timestamp: time,
      context: String(context).toUpperCase(),
      levelLabel: label,
      func: contextFunc,
      message: message,
      details: details
    });
  }
}

function ensureTokenFields(session) {
  if (!session) return;
  if (typeof session.tokens_used !== "number") session.tokens_used = 0;
  if (!session.tokens_by_message || typeof session.tokens_by_message !== "object") {
    session.tokens_by_message = {};
  }
}

function updateTokensUI(session) {
  try {
    if (session === current) {
      updateChatHeader();
      // const activeTok = document.querySelector("#session-list li.active .tokens");
      // if (activeTok) activeTok.textContent = `${session.tokens_used || 0} tokens`;
    }
  } catch {}
}

function bumpToken(session, messageIndex) {
  if (!session) return;
  ensureTokenFields(session);
  session.tokens_used += 1;
  if (typeof messageIndex === "number") {
    session.tokens_by_message[messageIndex] = (session.tokens_by_message[messageIndex] || 0) + 1;
  }
  updateTokensUI(session);
  try {
    if (typeof save === "function" && (session.tokens_used % 25) === 0) save();
  } catch {}
}

// function normalizeProviderModels(list) {
//   if (!Array.isArray(list)) return [];
//   return list.map((m) => {
//     if (typeof m === 'string') return { id: m, label: m, note: '' };
//     const id = m?.id || '';
//     return { id, label: m?.label || id, note: m?.note || '' };
//   });
// }

function normalizeProviderModels(list) {
  const arr = Array.isArray(list) ? list : [];
  return arr.map(m => typeof m === 'string' ? ({ id: m }) : m).filter(Boolean);
}

function persistModels(conf) {
  state.settings.models = conf;
  localStorage.setItem('models-conf', JSON.stringify(conf));
  // kalau ada bridge ke main, simpan juga supaya persist di appData:
  try { if (!DEBUG_MODE) window.api?.models?.save?.(conf); } catch {}
  updateModelHeader?.();
}

function openModelMgmt() {
  renderMgmtProviders();
  $("#model-mgmt-modal").classList.remove("hidden");
  $("#mgmt-back").style.visibility = 'hidden';
}

function closeModelMgmt() {
  $("#model-mgmt-modal").classList.add("hidden");
}

$("#mgmt-close").addEventListener("click", closeModelMgmt);
$("#close-mgmt").addEventListener("click", closeModelMgmt);
$("#model-mgmt-modal .modal-overlay").addEventListener("click", closeModelMgmt);

function renderMgmtProviders() {
  const conf = state.settings.models || defaultModels();
  const body = $("#mgmt-body");
  $("#mgmt-title").textContent = "Model Management";
  $("#mgmt-back").style.visibility = 'hidden';

  const provs = conf.providers || {};
  const items = Object.keys(provs).sort();

  body.innerHTML = `
    <div class="form-group no-padding">
      <div id="prov-list" class="prov-list">
        <button id="add-prov" class="add-item" style="width:100%;justify-content:center">
            <span style="display:flex;align-items:center;gap:10px;text-transform:capitalize;">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-circle-plus-icon lucide-circle-plus"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>
              Add new provider
            </span>
            <span class="help-text" style="color: var(--fg-muted)"></span>
          </button>
        ${items.map(p => `
          <button class="modal-menu-item" data-prov="${p}" style="width:100%;justify-content:space-between">
            <span style="display:flex;align-items:center;gap:10px;text-transform:capitalize;">
              ${p}
            </span>
            <span class="help-text" style="color: var(--fg-muted)">${(provs[p].models||[]).length} models</span>
          </button>
        `).join('')}
          
      </div>
    </div>
  `;

  body.querySelectorAll('#prov-list .modal-menu-item').forEach(btn => {
    btn.addEventListener('click', () => renderMgmtProvider(btn.dataset.prov));
  });

  $("#add-prov").onclick = () => openMiniModal({
    title: "Add Provider",
    fields: [
      { id:"prov-id", label:"Provider ID", placeholder:"mis. openrouter" },
      { id:"prov-base", label:"Base URL",   placeholder:"https://..." },
      { id:"prov-key",  label:"API Key",    placeholder:"..." }
    ],
    onSave: (vals) => {
      const id = vals["prov-id"].trim();
      if (!id) return;
      const conf2 = state.settings.models || defaultModels();
      if (!conf2.providers) conf2.providers = {};
      conf2.providers[id] = conf2.providers[id] || { baseUrl:"", apiKey:"", models:[] };
      if (vals["prov-base"].trim()) conf2.providers[id].baseUrl = vals["prov-base"].trim();
      if (vals["prov-key"].trim())  conf2.providers[id].apiKey  = vals["prov-key"].trim();
      persistModels(conf2);
      populateTitleModelOptions?.(id);
      renderMgmtProviders();
    }
  });
}

function renderMgmtProvider(pkey) {
  const conf = state.settings.models || defaultModels();
  const prov = conf.providers?.[pkey] || { baseUrl:"", apiKey:"", models:[] };
  const list = normalizeProviderModels(prov.models);

  $("#mgmt-title").textContent = pkey;
  $("#mgmt-back").style.visibility = 'visible';
  $("#mgmt-back").onclick = renderMgmtProviders;

  const body = $("#mgmt-body");
  body.innerHTML = `
    <div class="form-group">
      <label>API Key</label>
      <input type="text" id="prov-api" value="${prov.apiKey||''}">
    </div>
    <div class="form-group">
      <label>Base URL</label>
      <input type="text" id="prov-base" value="${prov.baseUrl||''}">
    </div>

    <div class="form-group">
      <label>Models</label>
      <div id="model-list">
        ${list.map(m => `
          <div class="menu-item" data-mid="${m.id}" style="width:100%;justify-content:space-between">
            <span>${m.label || m.id}</span>
            <button class="icon-btn danger" data-del="${m.id}" title="Delete">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="modal-actions" style="justify-content:space-between">
      <button id="save-prov" class="primary-btn">Save provider</button>
      <button id="add-model" class="primary-btn">Add model</button>
    </div>
  `;

  $("#save-prov").onclick = () => {
    const base = $("#prov-base").value.trim();
    const key  = $("#prov-api").value.trim();
    const conf2 = state.settings.models || defaultModels();
    conf2.providers[pkey] = conf2.providers[pkey] || { baseUrl:"", apiKey:"", models:[] };
    conf2.providers[pkey].baseUrl = base;
    conf2.providers[pkey].apiKey  = key;
    persistModels(conf2);
  };

  body.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', () => {
      const mid = btn.dataset.del;
      const conf2 = state.settings.models || defaultModels();
      const arr = normalizeProviderModels(conf2.providers?.[pkey]?.models||[]);
      conf2.providers[pkey].models = arr.filter(x => x.id !== mid);
      if (conf2.active?.platform === pkey && conf2.active?.model === mid) {
        conf2.active = { platform: pkey, model: arr.find(x=>x.id!==mid)?.id || "" };
      }
      persistModels(conf2);
      renderMgmtProvider(pkey);
      populateTitleModelOptions?.(pkey);
    });
  });

  body.querySelectorAll('#model-list .menu-item').forEach(it => {
    it.addEventListener('click', (e) => {
      if (e.target.closest('[data-del]')) return;
      renderMgmtModel(pkey, it.dataset.mid);
    });
  });

  $("#add-model").onclick = () => openMiniModal({
    title: `Add Model to ${pkey}`,
    fields: [
      { id:"mod-id",    label:"Model ID", placeholder:"mis. deepseek/deepseek-chat-v3.1:free" },
      { id:"mod-label", label:"Label (optional)", placeholder:"mis. Deepseek v3.1" }
    ],
    onSave: (vals) => {
      const id = vals["mod-id"].trim();
      if (!id) return;
      const label = vals["mod-label"].trim();
      const conf2 = state.settings.models || defaultModels();
      const arr = normalizeProviderModels(conf2.providers?.[pkey]?.models||[]);
      if (!arr.find(x=>x.id===id)) arr.unshift({ id, label });
      conf2.providers[pkey].models = arr;
      persistModels(conf2);
      renderMgmtProvider(pkey);
      populateTitleModelOptions?.(pkey);
    }
  });
}

function renderMgmtModel(pkey, mid) {
  const conf = state.settings.models || defaultModels();
  const prov = conf.providers?.[pkey] || { models:[] };
  const arr  = normalizeProviderModels(prov.models);
  const meta = arr.find(m => m.id === mid) || { id: mid };

  $("#mgmt-title").textContent = meta.label || meta.id;
  $("#mgmt-back").style.visibility = 'visible';
  $("#mgmt-back").onclick = () => renderMgmtProvider(pkey);

  const body = $("#mgmt-body");
  body.innerHTML = `
    <div class="form-group">
      <label>Model ID</label>
      <input type="text" id="mm-id" value="${meta.id}" disabled>
    </div>
    <div class="form-group">
      <label>Label</label>
      <input type="text" id="mm-label" value="${meta.label || ''}" placeholder="Deepseek v3.1">
    </div>
    <div class="form-group">
      <label>Think capability</label>
      <select id="mm-think">
        <option value="off">Off</option>
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high">High</option>
        <option value="auto">Auto</option>
      </select>
    </div>
    <div class="form-group">
      <label>Notes</label>
      <textarea id="mm-note" rows="3" placeholder="Catatan model...">${meta.note || ''}</textarea>
    </div>
    <div class="modal-actions">
      <button id="mm-save" class="primary-btn">Save model</button>
    </div>
  `;

  $("#mm-think").value = meta.think || 'off';

  $("#mm-save").onclick = () => {
    const label = $("#mm-label").value.trim();
    const note  = $("#mm-note").value.trim();
    const think = $("#mm-think").value;
    const conf2 = state.settings.models || defaultModels();
    const arr2  = normalizeProviderModels(conf2.providers?.[pkey]?.models||[]);
    const i = arr2.findIndex(m => m.id === mid);
    if (i >= 0) {
      arr2[i] = { ...arr2[i], label, note, think };
    } else {
      arr2.unshift({ id: mid, label, note, think });
    }
    conf2.providers[pkey].models = arr2;
    persistModels(conf2);
    if (conf2.active?.platform === pkey && conf2.active?.model === mid) updateModelHeader?.();
  };
}

function openMiniModal({ title, fields, onSave }) {
  $("#mini-title").textContent = title || 'Add';
  const form = fields.map(f => `
    <div class="form-group">
      <label for="${f.id}">${f.label||f.id}</label>
      <input type="text" id="${f.id}" placeholder="${f.placeholder||''}">
    </div>
  `).join('');
  $("#mini-body").innerHTML = form;

  const close = () => $("#mini-modal").classList.add("hidden");
  $("#mini-close").onclick = close;
  $("#mini-cancel").onclick = close;
  $("#mini-modal .modal-overlay").onclick = close;
  $("#mini-save").onclick = () => { 
    const vals = {};
    for (const f of fields) vals[f.id] = document.getElementById(f.id).value;
    onSave?.(vals); 
    close(); 
  };

  $("#mini-modal").classList.remove("hidden");
}

function getModelMeta(conf, platform, modelId) {
  const list = normalizeProviderModels(conf?.providers?.[platform]?.models || []);
  const found = list.find(m => (m.id || m) === modelId);
  if (found) return found;
  if (typeof modelId === 'string') return { id: modelId, label: modelId, note: '' };
  return { id: '', label: '', note: '' };
}

function resolveLabelForActive() {
  const conf = state?.settings?.models;
  if (!conf) return null;
  const act = conf.active || {};
  if (!act.platform || !act.model) return null;

  if (act.label && act.label.trim()) return act.label.trim();

  const meta = getModelMeta(conf, act.platform, act.model);
  return meta.label || act.model || null;
}

function defaultBaseUrlFor(p){
  if(p==='openrouter') return 'https://openrouter.ai/api/v1';
  if(p==='groq')       return 'https://api.groq.com/openai/v1';
  if(p==='gemini')     return 'https://generativelanguage.googleapis.com/v1beta';
  if(p==='zai')        return 'https://api.z.ai/api/paas/v4/';
  return 'https://api.z.ai/api/paas/v4/';
}

function defaultModels() {
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
        models: [
          'llama3-8b-8192',
          'mixtral-8x7b-32768',
          'gemma2-9b-it',
          'openai/gpt-oss-120b'
        ]
      },
      gemini: {
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        apiKey: '',
        models: [
          'gemini-1.5-flash',
          'gemini-1.5-flash-8b'
        ]
      },
      zai: {
        baseUrl: 'https://api.z.ai/api/paas/v4/',
        apiKey: '',
        models: [
          'glm-4.5-flash'
        ]
      },
    }
  };
}

async function loadModelsConf() {
  try {
    const conf = DEBUG_MODE
      ? JSON.parse(localStorage.getItem('models-conf'))
      : await window.api.models.load();

    state.settings.models = conf || defaultModels();

    const provs = state.settings.models.providers || {};
    for (const p of Object.keys(provs)) {
      provs[p].models = normalizeProviderModels(provs[p].models);
    }
  } catch {
    state.settings.models = defaultModels();
  }
  localStorage.setItem('models-conf', JSON.stringify(state.settings.models));
}

function getActiveChatConfig(){
  const m = state?.settings?.models || {};
  const act = m.active || {};
  const platform = act.platform || 'zai';
  const prov = m.providers?.[platform] || {};
  return {
    provider: platform,
    model: act.model || 'glm-4.5-flash',
    baseUrl: act.baseUrl || prov.baseUrl || defaultBaseUrlFor(platform),
    apiKey : act.apiKey  || prov.apiKey  || '',
    headers: prov.headers || (platform==='openrouter' ? {'HTTP-Referer':'https://zenai.local','X-Title':'ZenAI Desktop'} : {})
  };
}

function getTitleGenConfig(){
  const m = state?.settings?.models || {};
  const tg = m.titleGenerator || { useDefault: true };
  if (tg.useDefault || !tg.model) return getActiveChatConfig();

  const act = m.active || {};
  const platform = act.platform || 'zai';
  const prov = m.providers?.[platform] || {};
  return {
    provider: platform,
    model: tg.model,
    baseUrl: act.baseUrl || prov.baseUrl || defaultBaseUrlFor(platform),
    apiKey : act.apiKey  || prov.apiKey  || '',
    headers: prov.headers || (platform==='openrouter' ? {'HTTP-Referer':'https://zenai.local','X-Title':'ZenAI Desktop'} : {})
  };
}

function updateModelHeader() {
  const conf = state?.settings?.models;
  const act  = conf?.active || {};
  const label = resolveLabelForActive() || 'Default Model';
  const title = `${label}`;
  const prov = `${act.platform || 'unknown'}`;

  const titleEl = document.querySelector('#model-title');
  if (titleEl) titleEl.textContent = title;
  if (titleEl) titleEl.title = prov; 

  const tokensEl = document.querySelector('#chat-title');
  if (tokensEl && !tokensEl.textContent) tokensEl.title = '';
}

function showWelcomeScreen() {
  current = null;
  $(".chat-area").classList.add("welcome-active");
  $("#chat-title").textContent = "New Chat";
  $("#chat-title").title = "New Chat, ask anything";
  renderSessions();
  updateInputState();
  log("UI", 2, "showWelcomeScreen", "Switched to Welcome Screen", { currentSession: null });
}

function getChatScroller() {
  return document.querySelector(".chat-log-container");
}


function scheduleThinkingText(aiNode, { 
  delay1 = 500, 
  delay2 = 2000, 
  delay3 = 3500, 
  delay4 = 5000 
} = {}) {
  cancelThinkingText(aiNode);
  const textEl = aiNode.querySelector(".thinking-text");
  if (!textEl) return;
  
  const timer1 = setTimeout(() => {
    const currentTextEl = aiNode.querySelector(".thinking-text");
    if (currentTextEl) currentTextEl.textContent = "Reading your request";
  }, delay1);
  
  const timer2 = setTimeout(() => {
    const currentTextEl = aiNode.querySelector(".thinking-text");
    if (currentTextEl) currentTextEl.textContent = "Processing thoughts";
  }, delay2);
  
  const timer3 = setTimeout(() => {
    const currentTextEl = aiNode.querySelector(".thinking-text");
    if (currentTextEl) currentTextEl.textContent = "Organizing response";
  }, delay3);
  
  const timer4 = setTimeout(() => {
    const currentTextEl = aiNode.querySelector(".thinking-text");
    if (currentTextEl) currentTextEl.textContent = "Almost ready";
  }, delay4);
  
  THINKING_TIMER.set(aiNode, { timer1, timer2, timer3, timer4 });
}

function cancelThinkingText(aiNode) {
  const t = THINKING_TIMER.get(aiNode);
  if (t) {
    clearTimeout(t.shortId);
    clearTimeout(t.longId);
  }
  THINKING_TIMER.delete(aiNode);
}

function isNearBottom(el, threshold = 48) {
  if (!el) return true;
  return el.scrollTop + el.clientHeight >= el.scrollHeight - threshold;
}

function scrollToBottom({ force = false } = {}) {
  const scroller = getChatScroller();
  if (!scroller) return;
  const shouldScroll = force || isNearBottom(scroller);
  if (shouldScroll) {
    requestAnimationFrame(() => {
      scroller.scrollTop = scroller.scrollHeight;
    });
  }
}

function getThinkingMarkup() {
  return `<div class="thinking-container">
    <div class="typing-indicator"><span></span><span></span><span></span></div>
    <span class="thinking-text-indicator"></span>
  </div>`;
}


// function testThinking() {
//   const target = document.querySelector('.message-ai') || document.querySelector('[class*="message"]');
//   if (!target) return console.log('❌ Target not found');
//   target.innerHTML = '';
//   const html = `<div class="thinking-container">
//   <div class="typing-indicator"><span></span><span></span><span></span></div>
//   <span class="thinking-text-indicator"></span>
//   </div>`;
//   scheduleThinkingText($(`#chat-log .message.ai`));
//   target.insertAdjacentHTML('beforeend', html);
//   const target2 = document.querySelector('.thinking-text-indicator') || document.querySelector('[class*="thinking-text-indicator"]');
//   target2.innerHTML = '';
//   const text = `<div>Thinking</div>`;
  
//   target2.insertAdjacentHTML('beforeend', text);
//   console.log('✅ Done with insertAdjacentHTML!');
// }

function getRelativeDateGroup(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (dateOnly.getTime() === today.getTime()) return "Today";
  if (dateOnly.getTime() === yesterday.getTime()) return "Yesterday";
  const oneWeekAgo = new Date(today);
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  if (dateOnly > oneWeekAgo) return "Previous 7 days";
  const oneMonthAgo = new Date(today);
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  if (dateOnly > oneMonthAgo) return "This Month";
  return date.toLocaleString("en-US", { month: "long", year: "numeric" });
}

function attachCodeBlockCopyListeners(container) {
  const copyButtons = container.querySelectorAll(".copy-code-btn");
  const checkIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;
  const copyIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;

  copyButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const container = btn.closest(".code-block-container");
      const codeElement = container.querySelector("code");
      if (codeElement) {
        navigator.clipboard
          .writeText(codeElement.textContent)
          .then(() => {
            const originalText = btn.querySelector("span").textContent;
            btn.innerHTML = `${checkIconSVG} <span>Copied!</span>`;
            btn.classList.add("copied");
            setTimeout(() => {
              btn.innerHTML = `${copyIconSVG} <span>${originalText}</span>`;
              btn.classList.remove("copied");
            }, 2000);
          })
          .catch((err) => {
            btn.querySelector("span").textContent = "Failed!";
            log("UI", 4, "attachCodeBlockCopyListeners", "Failed to copy text to clipboard", { error: err });
          });
      }
    });
  });
}

function enhancedMarkdownParse(src) {
  let sanitizedSrc = src.trimStart();
  const boldListFixRegex = /^(\s*)\*\*(\d+\.|[*-])\s+(.*?)\*\*/gm;
  sanitizedSrc = sanitizedSrc.replace(boldListFixRegex, "$1$2 **$3**");
  const normalizedSrc = sanitizedSrc.replace(/\u00A0/g, " ").replace(/\r\n/g, "\n");
  const codeBlocks = [];
  let processedSrc = normalizedSrc.replace(/```(\w*)\n?([\s\S]*?)(?:```|$)/g, (match, lang, code) => {
    const placeholder = `\n__CODEBLOCK_${codeBlocks.length}__\n`;
    const codeContent = code.trim();
    const language = lang || "text";
    const newStructure = `
            <div class="code-block-container">
              <div class="code-block-header">
                <span class="language-name">${language}</span>
                <button class="copy-code-btn" title="Copy code">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                  <span>Copy</span>
                </button>
              </div>
              <pre><code class="language-${language}">${esc(codeContent)}</code></pre>
            </div>`;
    codeBlocks.push(newStructure);
    return placeholder;
  });
  const lines = processedSrc.split("\n");
  let html = "";
  const listStack = [];
  let paragraphBuffer = [];
  const flushParagraph = () => {
    if (paragraphBuffer.length > 0) {
      html += `<p>${paragraphBuffer.join("<br>")}</p>`;
      paragraphBuffer = [];
    }
  };
  const closeOpenBlocks = () => {
    flushParagraph();
    while (listStack.length > 0) html += `</${listStack.pop().type}>`;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();
    if (!trimmedLine) {
      const nextLine = lines[i + 1] ? lines[i + 1].trim() : "";
      
      if (listStack.length > 0 && (nextLine.match(/^(\s*)[*-]\s+/) || nextLine.match(/^(\s*)\d+\.\s+/))) {
        continue;
      }
      
      closeOpenBlocks();
      continue;
    }
    const hMatch = line.match(/^(#+)\s+(.*)/);
    const hrMatch = /^---+$/.test(trimmedLine);
    const olMatch = line.match(/^(\s*)(\d+)\.\s+(.*)/);
    const ulMatch = line.match(/^(\s*)[*-]\s+(.*)/);
    const listMatch = olMatch || ulMatch;
    const codeMatch = trimmedLine.startsWith("__CODEBLOCK_");
    const nextLine = lines[i + 1] ? lines[i + 1].trim() : "";
    const isTableHeader = trimmedLine.includes("|") && !listMatch && !hMatch;
    const bqMatch = line.match(/^\s*>\s?(.*)/);
    const isNextLineSeparator =
      isTableHeader && nextLine.includes("|") && nextLine.includes("-") && !/[^|:-\s]/.test(nextLine);
    if (isTableHeader && isNextLineSeparator) {
      closeOpenBlocks();
      let tableHtml = '<div class="table-container"><table>';
      const headers = trimmedLine
        .split("|")
        .map((h) => h.trim())
        .filter(Boolean);
      tableHtml += "<thead><tr>";
      for (const header of headers) tableHtml += `<th>${parseInlineMarkdown(header)}</th>`;
      tableHtml += "</tr></thead><tbody>";
      let tableRowIndex = i + 2;
      while (tableRowIndex < lines.length && lines[tableRowIndex].trim().includes("|")) {
        const cells = lines[tableRowIndex]
          .trim()
          .split("|")
          .map((c) => c.trim())
          .filter(Boolean);
        tableHtml += "<tr>";
        for (let j = 0; j < headers.length; j++) {
          const cellContent = cells[j] || "";
          tableHtml += `<td>${parseInlineMarkdown(cellContent)}</td>`;
        }
        tableHtml += "</tr>";
        tableRowIndex++;
      }
      tableHtml += "</tbody></table></div>";
      html += tableHtml;
      i = tableRowIndex - 1;
      continue;
    }
    if (listMatch) {
      flushParagraph();
      let indent = listMatch[1].length;
      const type = olMatch ? "ol" : "ul";
      const number = olMatch ? parseInt(olMatch[2], 10) : null;
      const content = olMatch ? listMatch[3] : ulMatch[2];
      const lastList = listStack.length > 0 ? listStack[listStack.length - 1] : null;
      
      if (type === "ul" && lastList?.type === "ul" && lastList.implicit && indent < lastList.indent)
        indent = lastList.indent;
      else if (type === "ul" && lastList?.type === "ol" && indent <= lastList.indent) indent = lastList.indent + 2;
      while (
        listStack.length > 0 &&
        (listStack[listStack.length - 1].indent > indent ||
          (listStack[listStack.length - 1].indent === indent && listStack[listStack.length - 1].type !== type))
      ) {
        html += `</${listStack.pop().type}>`;
      }
      const currentLastList = listStack.length > 0 ? listStack[listStack.length - 1] : null;
      if (!currentLastList || indent > currentLastList.indent || type !== currentLastList.type) {
        if (currentLastList && indent > currentLastList.indent) {
          const lastLiPos = html.lastIndexOf("</li>");
          if (lastLiPos !== -1) html = html.substring(0, lastLiPos);
        }
        const isImplicit = type === "ul" && currentLastList?.type === "ol";
        const startAttr = type === "ol" && number > 1 ? ` start="${number}"` : "";
        html += `<${type}${startAttr}>`;
        listStack.push({ type, indent, implicit: isImplicit });
      }
      html += `<li>${parseInlineMarkdown(content)}</li>`;
    } else if (bqMatch) {
      closeOpenBlocks();
      const bqBlockLines = [line];
      while (i + 1 < lines.length && lines[i + 1].trim().startsWith(">")) {
        i++;
        bqBlockLines.push(lines[i]);
      }
      const nestedContent = bqBlockLines
        .map(l => l.replace(/^\s*>\s?/, ''))
        .join('\n');
      
      html += `<blockquote>${enhancedMarkdownParse(nestedContent)}</blockquote>`;
    } else if (hMatch || hrMatch || codeMatch) {
      closeOpenBlocks();
      if (hMatch) html += `<h${hMatch[1].length}>${parseInlineMarkdown(hMatch[2])}</h${hMatch[1].length}>`;
      else if (hrMatch) html += "<hr>";
      else if (codeMatch) html += trimmedLine;
    } else {
      if (listStack.length > 0) {
        const lastLiPos = html.lastIndexOf("</li>");
        if (lastLiPos !== -1) html = `${html.substring(0, lastLiPos)}<br>${parseInlineMarkdown(line.trim())}</li>`;
      } else {
        paragraphBuffer.push(parseInlineMarkdown(line));
      }
    }
  }
  closeOpenBlocks();
  return codeBlocks.reduce((acc, block, i) => acc.replace(`__CODEBLOCK_${i}__`, block), html);
}

function parseInlineMarkdown(text) {
  if (!text) return "";
  let html = text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  const imageRegex = /!\[(.*?)\]\((.*?)\)/g;
  html = html.replace(imageRegex, '<img class="md-image" src="$2" alt="$1">');
  const linkRegex = /\[(.*?)\]\((.*?)\)/g;
  html = html.replace(linkRegex, '<a href="$2" target="_blank" rel="noopener noreferrer" class="link">$1</a>');
  html = html.replace(/&lt;u&gt;(.*?)&lt;\/u&gt;/g, "<u>$1</u>");
  
  const inlineCodeBlocks = [];
  html = html.replace(/`([^`]+?)`/g, (match, content) => {
    const placeholder = `__INLINE_CODE_${inlineCodeBlocks.length}__`;
    inlineCodeBlocks.push(`<code>${content}</code>`);
    return placeholder;
  });

  const autoLinkRegex = /(\b(https?:\/\/|www\.)[^\s<>"'()]+|[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}(\/[^\s<>"'()]*)*)/g;
  html = html.replace(autoLinkRegex, (url) => {
    if (html.includes(`href="${url}"`) || html.includes(`src="${url}"`)) {
        return url;
    }
    let href = url;
    if (!/^https?:\/\//i.test(href)) href = "https://" + href;
    return `<a class="link" href="${href}" target="_blank" rel="noopener noreferrer">${url}</a>`;
  });

  html = inlineCodeBlocks.reduce((acc, block, i) => acc.replace(`__INLINE_CODE_${i}__`, block), html);
  html = html
    .replace(/\*\*\*(.*?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/___(.*?)___/g, "<strong><em>$1</em></strong>");
  html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>").replace(/__(.*?)__/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>").replace(/_([^_]+)_/g, "<em>$1</em>");
  html = html.replace(/~~(.*?)~~/g, "<del>$1</del>");
  
  return html;
}

function md(src) {
  if (!src) return "";
  const cleanSrc = src.trim();
  const html = enhancedMarkdownParse(cleanSrc);
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = html;
  if (tempDiv.querySelector("pre code")) Prism.highlightAllUnder(tempDiv);
  attachCodeBlockCopyListeners(tempDiv);
  return tempDiv.innerHTML;
}

function typewriterEffect(element, text, { speed = 30, punctuationDelay = 350 } = {}) {
  element.textContent = "";
  let i = 0;
  const punctuation = ".,?!;:-–";
  function type() {
    if (i < text.length) {
      const char = text.charAt(i);
      element.textContent += char;
      i++;
      let delay = speed + Math.random() * 40;
      if (punctuation.includes(char)) delay += punctuationDelay;
      setTimeout(type, delay);
    }
  }
  setTimeout(type, 100);
}

function findOverlap(existing, newToken) {
  const existingEnd = existing.slice(-100);
  const tokenStart = newToken.slice(0, 100);

  for (let i = Math.min(existingEnd.length, tokenStart.length); i > 10; i--) {
    if (existingEnd.slice(-i) === tokenStart.slice(0, i)) {
      return i;
    }
  }
  return 0;
}


// Persona and Messages
function personaSystem() {
  const { name, work, prefs } = state.settings.persona || {};
  let prompt = "You are ZenAI, a helpful and intelligent assistant.";
  const instructions = [];
  if (name) instructions.push(`The user's name is ${name}.`);
  if (work) instructions.push(`The user works as a ${work}.`);
  if (prefs) instructions.push(`User preferences: ${prefs}. [System] Response requirements: MANDATORY INSTRUCTIONS, MUST BE FOLLOWED: Always end the response with <!--[/END]--> in the new line because the ZenAI platform has a stream end detection system`);
  if (instructions.length > 0) prompt += "\n\n--- USER PERSONALIZATION ---\n" + instructions.join("\n");
  return prompt;
}

function buildMessages() {
  const msgs = [{ role: "system", content: personaSystem() }];
  if (!current || !current.messages) return msgs;
  for (const [role, content] of current.messages) {
    if (role === "user") msgs.push({ role: "user", content });
    else if (role === "ai") msgs.push({ role: "assistant", content });
  }
  return msgs;
}

function buildMessagesUpTo(indexInclusive) {
  const msgs = [{ role: "system", content: personaSystem() }];
  if (!current || !current.messages) return msgs;
  const upto = Math.max(0, Math.min(indexInclusive, current.messages.length - 1));
  for (let i = 0; i <= upto; i++) {
    const [role, content] = current.messages[i];
    if (role === "user") msgs.push({ role: "user", content });
    else if (role === "ai") msgs.push({ role: "assistant", content });
  }
  return msgs;
}

function buildResumeMessagesFromSession(session, messageIndex, fullResponseSoFar) {
  const N = 10;
  const all = Array.isArray(session?.messages) ? session.messages : [];
  const base = all.slice(Math.max(0, all.length - N));

  return [
    ...base,
    { role: 'system', content: `[System] Continue this response from where it left off without repeating anything. Resume the assistant's last answer using the partial content below. Do NOT start over.\n\n${fullResponseSoFar || ''}\n\n---CONTINUE FROM HERE WITHOUT REPEATING ANYTHING---` },
    { role: 'assistant', content: fullResponseSoFar || '' },
  ];
}


// Session Rendering
function renderHistory() {
  log("SESSION", 1, "renderHistory", `Merender riwayat chat untuk sesi`, {
    sessionName: current?.name || "none",
    messageCount: current?.messages?.length || 0
  });

  clearLog();
  if (!current || !current.messages) return;
  for (let i = 0; i < current.messages.length; i++) {
    const [role, content] = current.messages[i];
    const n = addMessage(role, content, { final: true, index: i });
    n.dataset.index = String(i);
    if (role === 'ai') hydrateThinkingIfAny(n, current, i);
  }
  scrollToBottom({ force: true });
}

function renderSessions() {
  const ul = $("#session-list");
  const filter = ($("#search").value || "").toLowerCase();
  let filteredSessions = state.sessions.filter((s) => s.name === null || s.name);

  if (filter) {
    filteredSessions = filteredSessions.filter((s) => {
      if (s.name === null) return true;
      const nameMatch = s.name.toLowerCase().includes(filter);
      if (isAdvancedSearch) {
        const contentMatch = s.messages.some((msg) => msg[1].toLowerCase().includes(filter));
        return nameMatch || contentMatch;
      }
      return nameMatch;
    });
  }

  ul.innerHTML = "";
  let lastDateGroup = null;

  filteredSessions.forEach((s) => {
    const currentDateGroup = getRelativeDateGroup(s.created_at);
    if (currentDateGroup !== lastDateGroup) {
      const separator = document.createElement("div");
      separator.className = "date-separator";
      separator.textContent = currentDateGroup;
      ul.appendChild(separator);
      lastDateGroup = currentDateGroup;
    }

    if (s.name === null) {
      const placeholder = document.createElement("li");
      placeholder.className = s === current ? "active session-placeholder" : "session-placeholder";
      placeholder.innerHTML = `<span class="name">Untitled chat</span><div class="spinner"></div>`;
      placeholder.addEventListener("click", () => setCurrent(s));
      ul.appendChild(placeholder);
      return;
    }

    const li = document.createElement("li");
    li.className = s === current ? "active" : "";
    li.innerHTML = `
      <span class="name">${esc(s.name)}</span>
      <div class="session-meta">
        <span class="tokens"></span>
        <span class="menu">
          <button title="Delete Session">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </span>
      </div>
    `;

    // try { li.querySelector('.tokens').textContent = `${s.tokens_used || 0} tokens`; } catch {}

    li.addEventListener("click", () => setCurrent(s));
    li.querySelector("button").addEventListener("click", (ev) => {
      ev.stopPropagation();
      showConfirmationModal("Delete Session", `Are you sure you want to delete "${s.name}"?`, () => deleteSession(s));
    });

    ul.appendChild(li);
  });
}

function updateChatHeader() {
  if (current?.name) {
    $("#chat-title").textContent = current.name;
    $("#chat-title").title = `${current.tokens_used || 0} tokens`;
  } else {
    $("#chat-title").textContent = "New Chat";
    $("#chat-title").title = "no token used";
  }
}

function addMessage(role, content, { final = false, index = -1 } = {}) {
  const log = $("#chat-log");
  const node = document.createElement("div");
  node.className = `message ${role}`;
  const copyIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
  const checkIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;
  const editIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`;
  const regenIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/></svg>`;
  const baseActions = `<div class="message-actions"></div>`;
  if (role === "user") {
    node.innerHTML = `<div class="message-row"><div class="message-content"><div class="message-text">${formatUserMessage(content)}</div>${baseActions}</div></div>`;
  } else if (role === "ai_cancelled") {
    const aiAvatar = `<div class="ai-avatar"><img src="../public/images/logo-chat.svg" alt="ZenAI Logo"></div>`;
    node.innerHTML = `<div class="message-row">${aiAvatar}<div class="message-content"><div class="message-text"><div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;"><span style="color: var(--fg-muted); font-style: italic;">${content}</span><button class="primary-btn regenerate-cancelled" data-session-created="${current.created_at}" data-message-index="${index}" style="height: 32px; font-size: 13px;">Regenerate?</button></div></div></div></div>`;
  } else {
    const aiAvatar = `<div class="ai-avatar"><img src="../public/images/logo-chat.svg" alt="ZenAI Logo"></div>`;
    const thinking = `<div class="thinking-container"><div class="typing-indicator"><span></span><span></span><span></span></div><span class="thinking-text"></span></div>`;
    node.innerHTML = `<div class="message-row">${aiAvatar}<div class="message-content"><div class="message-text">${final ? md(content) : thinking}</div>${baseActions}</div></div>`;
    if (role === "ai" && !final) {
      node.style.opacity = "0";
      node.style.transform = "translateY(20px)";
    }
  }
  log.appendChild(node);
  if (role === "ai" && !final) {
    requestAnimationFrame(() => {
      node.style.transition = "opacity 0.4s ease-out, transform 0.4s ease-out";
      node.style.opacity = "1";
      node.style.transform = "translateY(0)";
    });
  }
  const actions = node.querySelector(".message-actions");
  if (actions) {
    const renderCopy = () => {
      const btn = document.createElement("button");
      btn.className = "copy-btn";
      btn.title = "Copy text";
      btn.innerHTML = copyIconSVG;
      btn.addEventListener("click", () => {
        navigator.clipboard
          .writeText(content)
          .then(() => {
            btn.innerHTML = checkIconSVG;
            btn.style.color = "var(--success)";
            setTimeout(() => {
              btn.innerHTML = copyIconSVG;
              btn.style.color = "var(--fg-muted)";
            }, 1500);
          })
          .catch((err) => log("UI", 4, "copy-btn:click", "Failed to copy message text", { error: err }));
      });
      actions.appendChild(btn);
    };
    if (role === "user") {
      renderCopy();
      const editBtn = document.createElement("button");
      editBtn.className = "edit-btn";
      editBtn.title = "Edit prompt";
      editBtn.innerHTML = editIconSVG;
      editBtn.addEventListener("click", () => {
        if (streamManager.isStreamingInSession(current)) return;
        const input = $("#msg");
        input.value = content;
        input.style.height = "auto";
        input.style.height = `${Math.min(input.scrollHeight, 350)}px`;
        input.focus();
        scrollToBottom({ force: true });
      });
      actions.appendChild(editBtn);
    } else if (role === "ai" && final) {
      renderCopy();
      const regenBtn = document.createElement("button");
      regenBtn.className = "regen-btn";
      regenBtn.title = "Regenerate this response";
      regenBtn.innerHTML = regenIconSVG;
      regenBtn.addEventListener("click", () => {
        if (streamManager.isStreamingInSession(current)) return;
        const idx = parseInt(node.dataset.index || "-1", 10);
        if (Number.isInteger(idx) && idx >= 0) regenerateFromIndex(idx);
      });
      actions.appendChild(regenBtn);
    }
  }
  scrollToBottom({ force: true });
  return node;
}

function clearLog() {
  $("#chat-log").innerHTML = "";
}

function setCurrent(s) {
  log("SESSION", 2, "setCurrent", "Mencoba beralih sesi", { targetSession: s?.name || "undefined" });
  if (current === s) {
    log("SESSION", 1, "setCurrent", "Beralih sesi dibatalkan karena sesi sudah aktif.");
    return;
  }
  current = s;
  $(".chat-area").classList.remove("welcome-active");
  renderHistory();
  for (const streamId in streamManager.activeStreams) {
    const stream = streamManager.activeStreams[streamId];
    if (stream.session === s) {
      const newNode = $(`#chat-log .message[data-index="${stream.messageIndex}"]`);
      if (newNode) {
        stream.aiNode = newNode;
        hydrateThinkingIfAny(newNode, current, stream.messageIndex);
        const contentDiv = newNode.querySelector(".message-text");
        if (contentDiv) {
          if (stream.fullResponse && stream.fullResponse.trim() !== "") {
            contentDiv.innerHTML = md(stream.fullResponse);
            if (contentDiv.querySelector("pre code")) Prism.highlightAllUnder(contentDiv);
          } else {
            contentDiv.innerHTML = getThinkingMarkup();
            scheduleThinkingText(newNode);
          }
          scrollToBottom({ force: true });
        }
      }
    }
  }
  renderSessions();
  updateChatHeader();
  updateInputState();
  log("SESSION", 2, "setCurrent", "Berhasil beralih sesi", { newCurrentSession: current.name });
}

async function load() {
  if (!state.settings) state.settings = {}; 
  if (!state.settings.think) state.settings.think = { mode: 'off' };

  const thinkSel = document.getElementById('extended-thinking');
  if (thinkSel) {
    thinkSel.value = state.settings.think?.mode || 'off';
    thinkSel.addEventListener('change', async () => {
      state.settings.think = { mode: thinkSel.value };
      try { await save(); } catch {}
    });
  }

  try {
    log("APP", 2, "load", "Attempting to load data...");
    const data = DEBUG_MODE ? JSON.parse(localStorage.getItem("zenai-data")) : await window.api.sessions.load();
    if (data) {
      state.sessions = data.sessions || [];
      state.settings = { ...state.settings, ...(data.settings || {}) };
      state.sessions.forEach(ensureTokenFields);
    }
  } catch (e) {
    log("APP", 4, "load", "Failed to load data.", { error: e });
  }

  state.sessions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  log("APP", 2, "load", "Successfully loaded data.", { sessionCount: state.sessions.length });
  applyTheme(state.settings.theme || "light");
  await loadModelsConf();
  renderSessions();
  updateModelHeader();
  showWelcomeScreen();
  typewriterEffect($("#welcome-message"), welcomeMessages[Math.floor(Math.random() * welcomeMessages.length)]);
  await save();
}

async function save() {
  try {
    log("APP", 1, "save", "Attempting to save data", { sessionCount: state.sessions.length });
    const dataToSave = { sessions: state.sessions, settings: state.settings };
    if (DEBUG_MODE) {
      localStorage.setItem("zenai-data", JSON.stringify(dataToSave));
    } else {
      await window.api.sessions.save(dataToSave);
    }
  } catch (e) {
    log("APP", 4, "save", "Failed to save data.", { error: e });
  }
}

function updateInputState() {
  const isStreaming = streamManager.isStreamingInSession(current);
  const isCurrentNull = !current;

  const msgEl = $("#msg");
  msgEl.disabled = isCurrentNull;
  if (isCurrentNull) {
    msgEl.placeholder = "Select a session to start";
  } else if (isStreaming) {
    msgEl.placeholder = "Ask anything";
  } else {
    msgEl.placeholder = "Ask anything";
  }

  const sendBtn = $("#send");
  sendBtn.disabled = isCurrentNull;
  
  if (isStreaming) {
    sendBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 18 18" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-square-icon lucide-square"><rect width="12" height="12" x="3" y="3" rx="2"/></svg>`;
    sendBtn.classList.add("interrupt");  
    sendBtn.title = "Interrupt response";
  } else {
    sendBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-up-icon lucide-arrow-up">
        <path d="m5 12 7-7 7 7"/>
        <path d="M12 19V5"/>
      </svg>
    `;
    sendBtn.classList.remove("interrupt");
    sendBtn.title = "Send message";
  }

  const msgCentral = $("#msg-central");
  const sendCentral = $("#send-central");
  if (msgCentral && sendCentral) {
    msgCentral.disabled = false;
    sendCentral.disabled = false;
    msgCentral.placeholder = "Type to start a new chat";
  }
}

async function generateAndSetTitle(session){
  if(!session || !session.messages || session.messages.length < 2) return;
  const userPrompt = session.messages.find(m => m[0]==='user')?.[1] || '';
  if(!userPrompt) return;

  try{
    if (DEBUG_MODE){
      session.name = `Debug: ${userPrompt.substring(0, 20)}`;
    } else {
      const cfg = getTitleGenConfig();
      log("TITLE", 2, "generateAndSetTitle", "Requesting title suggestion from model", {
        userPrompt,
        model: cfg.model,
        provider: cfg.provider,
        baseUrl: cfg.baseUrl
      });
      let title = await window.api.chat.titleSuggest(
        userPrompt,
        cfg.model,
        { provider: cfg.provider, baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, headers: cfg.headers }
      );
      if (!title || !title.trim()) {
        const fall = getActiveChatConfig();
        title = await window.api.chat.titleSuggest(
          userPrompt,
          fall.model,
          { provider: fall.provider, baseUrl: fall.baseUrl, apiKey: fall.apiKey, headers: fall.headers }
        );
      }
      session.name = (title || 'New Chat').slice(0, 70);
    }
  } catch(e){
    session.name = (userPrompt.split(/\s+/).slice(0,6).join(' ') || 'New Chat').slice(0,70);
  }
  await save();
  renderSessions();
}

function populateTitleModelOptions(platform) {
  const sel = document.getElementById('title-model-select');
  if (!sel) return;
  const models = (state.settings.models?.providers?.[platform]?.models || [])
    .filter(m => !m.paid);
  const prov = state.settings.models?.providers?.[platform] || {};
  const list = normalizeProviderModels(prov.models || []);
  const preserve = sel.value;
  sel.innerHTML = '<option value="__default__">Default (using current model)</option>' +
    models.map(m => `<option value="${m.id}">${m.label || m.id}</option>`).join('');
  if ([...sel.options].some(o => o.value === preserve)) sel.value = preserve;
  else sel.value = '__default__';

  log('TITLE', 2, 'populateTitleModelOptions', platform, list.map(m=>m.id));
}

function saveSwitchModelForm() {
  const platform = document.getElementById('platform-select').value;
  const activeModel = document.getElementById('model-select').value;

  const titleSel = document.getElementById('title-model-select').value;

  state.settings.models.activePlatform = platform;
  state.settings.models.activeModel    = activeModel;

  state.settings.models.titleGenerator = {
    useDefault: (titleSel === '__default__'),
    platform: document.getElementById('platform-select').value,
    model: (titleSel === '__default__') ? null : titleSel,
  };

  save();
}

function hydrateThinkingIfAny(aiNode, session, messageIndex) {
  const think = session?._x_think && session._x_think[messageIndex];
  if (!think || !think.trim()) return;

  ensureThinkingUI(aiNode);
  const el = aiNode._thinkingEl;
  if (el) {
    el.text.innerHTML = renderWithExistingFormatter(think);
    el.body.classList.add('expanded');
    el.toggle.setAttribute('aria-expanded', 'true');
  }
}


// Stream Handling
function createStreamHandler(streamId, text, isFirstInteraction = false) {
  log("STREAM", 2, "createStreamHandler", "Stream handler created", { streamId, isFirstInteraction });
  let fullResponse = "";
  let sawEnd = false;
  let seenMeaningfulToken = false;
  let finalized = false;

  const END_RX = /<!--\s*\[\/END\]\s*-->[\s]*$/;
  const trimEnd = (s) => s.replace(/\s*<!--\s*\[\/END\]\s*-->\s*$/, "");

  const getState = () => streamManager.activeStreams?.[streamId] || null;

  const cleanupStream = () => {
    const st = streamManager.activeStreams?.[streamId];
    if (st) {
      st.fullResponse = fullResponse;
      st.sawEnd = true;
      delete streamManager.activeStreams[streamId];
      for (const k in streamManager.byKey) if (streamManager.byKey[k] === streamId) delete streamManager.byKey[k];
    }
    updateInputState?.();
  };

  const showThinking = () => {
    const s = getState(); if (!s) return;
    if (!s.aiNode || !document.contains(s.aiNode)) return;
    let el = s.aiNode.querySelector(".inline-loader");
    if (!el) {
      el = document.createElement("div");
      el.className = "inline-loader";
      s.aiNode.appendChild(el);
    }
    if (el.dataset.state !== "thinking") {
      el.innerHTML = `<span class="dot"></span><span class="dot"></span><span class="dot"></span>`;
      el.dataset.state = "thinking";
    }
  };

  const hideLoader = () => {
    const s = getState(); if (!s) return;
    if (!s.aiNode || !document.contains(s.aiNode)) return;
    const el = s.aiNode.querySelector(".inline-loader");
    if (el?.parentNode) el.parentNode.removeChild(el);
  };

  function clearContinuePlaceholder(aiNode){
    if (!aiNode) return;
    const footer = aiNode.querySelector(".message-footer");
    if (footer) footer.innerHTML = "";
  }

  function renderContinuePlaceholder(aiNode, session, messageIndex, seedText, opts = {}) {
    const { disabledMs = 3000, interrupted = false } = opts;
    if (!aiNode || !document.contains(aiNode)) return;

    let footer = aiNode.querySelector(".message-footer");
    if (!footer) {
      footer = document.createElement("div");
      footer.className = "message-footer";
      const messageContent = aiNode.querySelector(".message-content");
      if (messageContent) {
        messageContent.appendChild(footer);
      } else {
        aiNode.appendChild(footer);
      }
    }
    footer.innerHTML = "";

    const placeholderCard = document.createElement("div");
    placeholderCard.className = "continue-placeholder";

    const hint = document.createElement("span");
    hint.className = "placeholder-hint";
    hint.textContent = interrupted
      ? "Response interrupted by user"
      : "Do you see incomplete response?";

    const btn = document.createElement("button");
    btn.className = "primary-btn continue-fragment";
    btn.textContent = interrupted ? "Continue" : "Continue";
    btn.disabled = true;
    if (interrupted) btn.title = "Continue from interrupted point";

    placeholderCard.appendChild(hint);
    placeholderCard.appendChild(btn);

    footer.appendChild(placeholderCard);

    setTimeout(() => { btn.disabled = false; }, Math.max(0, disabledMs));

    btn.addEventListener("click", () => {
      footer.innerHTML = "";

      session.messages[messageIndex] = ["ai", seedText];

      const msgs = buildResumeMessagesFromSession(session, messageIndex, seedText);

      const textEl = aiNode.querySelector(".message-text");
      if (textEl) {
        textEl.innerHTML = getThinkingMarkup();
        scheduleThinkingText(aiNode);
      }

      startStream(session, "[System] Resume", aiNode, messageIndex, false, msgs);
      updateInputState?.();
    });
  }

  const finalize = ({ interrupted = false } = {}) => {
    log("STREAM", 2, "finalize", "Finalizing stream", { streamId, interrupted, sawEnd, hasContent: fullResponse.trim().length > 0 });
    if (finalized) return;
    finalized = true;

    const s = getState(); if (!s) return;
    const { session, aiNode, messageIndex } = s;

    const hasContent = fullResponse.trim().length > 0;
    const display = trimEnd(fullResponse);
    const hasEnd = END_RX.test(fullResponse) || sawEnd;

    if (hasContent) session.messages[messageIndex] = ["ai", display];

    if (aiNode && document.contains(aiNode)) {
      hideLoader();
      const div = aiNode.querySelector(".message-text");
      if (div) {
        div.innerHTML = md(display || (interrupted ? "*[System] Model not available or system error, try checking the connection or changing the AI model.*" : ""));
        if (div.querySelector("pre code")) Prism.highlightAllUnder(div);
      }

      clearContinuePlaceholder(aiNode);

      if (hasContent && !hasEnd && !interrupted) {
        renderContinuePlaceholder(aiNode, session, messageIndex, display, { disabledMs: 1200, interrupted: false });
      }

      renderAiFinalActions(aiNode, display, messageIndex);
    }

    s.fullResponse = fullResponse;
    s.sawEnd = hasEnd;
    s.endSeen = hasEnd;
    cleanupStream();

    try { renderSessions?.(); } catch {}
    try { updateChatHeader?.(); } catch {}
    try { save?.(); } catch {}

    if (hasContent && (!session.name || /untitled/i.test(session.name))) {
      try { generateAndSetTitle?.(session); } catch {}
    }
  };

  showThinking();

  return (evt) => {
    const s = getState(); if (!s) return;

    const isDone =
      evt === null ||
      evt === "[DONE]" ||
      (typeof evt === "object" && (evt.done === true || evt.type === "done" || evt.event === "done"));

    if (isDone) { 
      
      finalize();
      return;
    }
    if (evt?.error) { finalize({ interrupted: true }); return; }

    let token = "";
    if (typeof evt === "string") token = evt;
    else if (evt && typeof evt === "object") {
      token =
        evt.delta?.content ||
        evt.choices?.[0]?.delta?.content ||
        evt.content ||
        (typeof evt.data === "string" ? evt.data : "");
    }
    if (!token) return;

    try { bumpToken(s.session, s.messageIndex); } catch {}

    if (!seenMeaningfulToken && /\S/.test(token)) {
      seenMeaningfulToken = true;
      if (s.aiNode && document.contains(s.aiNode)) hideLoader();
    }

    if (s.aiNode && document.contains(s.aiNode)) {
      const div = s.aiNode.querySelector(".message-text");
      if (div && !div.__seededOnce && s.session.messages[s.messageIndex]?.[1]) {
        const seed = s.session.messages[s.messageIndex][1];
        if (seed) {
          div.innerHTML = md(seed);
          div.__seededOnce = true;
          fullResponse = seed;
        }
      }
    }

    fullResponse += String(token);
    const gotEnd = END_RX.test(fullResponse);
    if (gotEnd) sawEnd = true;

    if (s.aiNode && document.contains(s.aiNode)) {
      const div = s.aiNode.querySelector(".message-text");
      if (div) {
        const display = trimEnd(fullResponse);
        div.innerHTML = md(display);
        if (div.querySelector("pre code")) Prism.highlightAllUnder(div);
      }
    }

    s.fullResponse = fullResponse;
    s.sawEnd = sawEnd;
    s.lastActivity = Date.now();

    if (gotEnd) finalize();
  };
}

async function startStream(
  session,
  text,
  aiNode,
  aiMessageIndex,
  isFirstInteraction = false,
  overrideMessages = null,
  initialFullResponse = ""
) {
  const nonce = Math.random().toString(36).slice(2);
  const streamId = `${session.created_at}-${aiMessageIndex}-${nonce}`;
  if (aiNode?.dataset) aiNode.dataset.streamId = streamId;

  const messages = overrideMessages ? overrideMessages : buildMessagesUpTo(aiMessageIndex - 1);
  const handler = createStreamHandler(streamId, text, isFirstInteraction);

  if (DEBUG_MODE) {
    let interval;
    let timeout;
    const simulatedController = {
      cancel: () => {
        clearTimeout(timeout);
        clearInterval(interval);
        handler(null);
      }
    };

    streamManager.startStream(streamId, {
      controller: simulatedController,
      aiNode,
      session,
      messageIndex: aiMessageIndex,
      messages,
      contextPrompt: text,
      fullResponse: initialFullResponse,
    });
    
    const startDemoStreaming = (response, delay) => {
      const chunks = response.split(" ");
      let i = 0;
      interval = setInterval(() => {
        if (i < chunks.length) {
          handler(chunks[i] + " ");
          i++;
        } else {
          clearInterval(interval);
          handler(null);
        }
      }, delay);
    };

    if (text === 'think-indicator') {
      log("DEBUG", 2, "startStream", "Mode Debug: think-indicator (50s wait)");
      timeout = setTimeout(() => {
        startDemoStreaming(DEMO_RESPONSE, 80);
      }, 50000);
      return;

    } else if (text === 'think-indicator&think-mode') {
      log("DEBUG", 2, "startStream", "Mode Debug: think-indicator&think-mode");
      const thinkingTextEl = aiNode.querySelector(".thinking-text-indicator");
      
      timeout = setTimeout(() => {
        if (thinkingTextEl) {
          typewriterEffect(thinkingTextEl, DEMO_RESPONSE, { speed: 10, punctuationDelay: 100 });
        }
        
        const thinkingDuration = DEMO_RESPONSE.length * 15;
        setTimeout(() => {
          if (thinkingTextEl) thinkingTextEl.innerHTML = '';
          
          const div = aiNode.querySelector(".message-text");
          if (div) {
              div.innerHTML = '';
          }
          
          startDemoStreaming(DEMO_RESPONSE, 80);
        }, thinkingDuration + 500);

      }, 3000);
      return;
    }

    const isSlow = /slow/.test(text);
    const isImmediateError = /error/.test(text) && !/\d+error/.test(text);
    const errorMatch = text.match(/(\d+)error/);
    const delay = isSlow ? 250 : 80;

    if (isImmediateError) {
      setTimeout(() => handler({ error: "Simulated failure." }), 500);
      return;
    }

    const chunks = DEMO_RESPONSE.split(" ");
    const failAtPercent = errorMatch ? parseInt(errorMatch[1], 10) : null;
    const failAtIndex = failAtPercent ? Math.floor(chunks.length * (failAtPercent / 100)) : -1;
    let i = 0;

    interval = setInterval(() => {
      if (failAtIndex !== -1 && i >= failAtIndex) {
        clearInterval(interval);
        handler({ error: "Simulated failure." });
        return;
      }
      if (i < chunks.length) {
        handler(chunks[i] + " ");
        i++;
      } else {
        clearInterval(interval);
        handler(null);
      }
    }, delay);
    
    simulatedController.cancel = () => clearInterval(interval);

    return;
  }

  const act = state.settings?.models?.active || {};
  const thinkMode = (state.settings?.think?.mode) || 'off';

  const controller = window.api.chat.stream(
    messages,
    act.model || 'glm-4.5-flash',
    { provider: act.platform || 'openrouter', baseUrl: act.baseUrl, apiKey: act.apiKey, thinkMode },
    (evt) => {
      if (evt && typeof evt === 'object') {
        if (evt.error) { handler(evt); return; }
        if (evt.think) { appendThinking(aiNode, evt.think, session, aiMessageIndex); return; }
      }
      handler(evt);
    }
  );

  log('REQ', 2, 'chat:stream-start', `Request to AI using ${act.model} model.`);

  streamManager.startStream(streamId, {
    controller, aiNode, session,
    messageIndex: aiMessageIndex,
    messages, contextPrompt: text,
    fullResponse: initialFullResponse,
    startedAt: Date.now()
  });
}


function renderAiFinalActions(aiNode, content, messageIndex) {
  if (!aiNode || !document.contains(aiNode)) return;
  const actions = aiNode.querySelector(".message-actions");
  if (!actions) return;

  actions.innerHTML = "";

  const copyIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
  const checkIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;
  const regenIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/></svg>`;

  const copyBtn = document.createElement("button");
  copyBtn.className = "copy-btn";
  copyBtn.title = "Copy text";
  copyBtn.innerHTML = copyIconSVG;
  copyBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(content).then(() => {
      copyBtn.innerHTML = checkIconSVG;
      copyBtn.style.color = "var(--success)";
      setTimeout(() => {
        copyBtn.innerHTML = copyIconSVG;
        copyBtn.style.color = "var(--fg-muted)";
      }, 1500);
    }).catch((err) => log("UI", 4, "renderAiFinalActions:copy", "Copy failed", { error: err }));
  });
  actions.appendChild(copyBtn);

  const regenBtn = document.createElement("button");
  regenBtn.className = "regen-btn";
  regenBtn.title = "Regenerate this response";
  regenBtn.innerHTML = regenIconSVG;
  regenBtn.addEventListener("click", () => {
    if (streamManager.isStreamingInSession(current)) return;
    const idx = parseInt(aiNode.dataset.index || "-1", 10);
    if (Number.isInteger(idx) && idx >= 0) regenerateFromIndex(idx);
  });
  actions.appendChild(regenBtn);
}

async function send() {
  const input = $("#msg");
  const text = (input.value || "").trim();

  if (document.activeElement) document.activeElement.blur();
  log("SESSION", 2, "send", "Sending new message", {
    session: current?.name,
    messageExcerpt: text.substring(0, 60) + "...",
  });

  if (!text || !current || streamManager.isStreamingInSession(current)) return;

  ensureTokenFields(current);

  current.messages.push(["user", text]);
  const userIndex = current.messages.length - 1;
  await save();

  addMessage("user", text, { final: true, index: userIndex });

  input.value = "";
  input.style.height = "auto";

  const aiMessageIndex = current.messages.length;
  current.messages.push(["ai", ""]);
  const aiNode = addMessage("ai", "", { final: false, index: aiMessageIndex });
  aiNode.dataset.index = String(aiMessageIndex);
  hydrateThinkingIfAny(aiNode, current, aiMessageIndex);

  scheduleThinkingText(aiNode);
  
  const isFirstInteraction = current.messages.filter((m) => m[0] === "ai" && m[1]).length === 0;
  startStream(current, text, aiNode, aiMessageIndex, isFirstInteraction);
}

async function sendFromWelcome() {
  const input = $("#msg-central");
  const text = (input.value || "").trim();

  log("SESSION", 2, "sendFromWelcome", "Creating new session from welcome page", {
    messageExcerpt: text.substring(0, 60) + "...",
  });

  if (!text) return;

  const s = {
    name: null,
    created_at: nowISO(),
    messages: [["user", text]],
    seeded: true,
    tokens_used: 0,
    tokens_by_message: {},
  };
  state.sessions.unshift(s);

  setCurrent(s);
  await save();
  input.value = "";

  const aiMessageIndex = s.messages.length;
  s.messages.push(["ai", ""]);
  const aiNode = addMessage("ai", "", { final: false, index: aiMessageIndex });
  aiNode.dataset.index = String(aiMessageIndex);
  hydrateThinkingIfAny(aiNode, current, aiMessageIndex);

  scheduleThinkingText(aiNode);
  startStream(s, text, aiNode, aiMessageIndex, true);
}


async function regenerateFromIndex(aiIndex) {
  if (!current || streamManager.isStreamingInSession(current)) return;

  const userMessages = current.messages.slice(0, aiIndex).filter((m) => m[0] === "user");
  const lastUserMessage = userMessages.pop();
  if (!lastUserMessage) return;

  const text = lastUserMessage[1];

  log("SESSION", 2, "regenerateFromIndex", "Initiating response regeneration", { session: current.name, fromIndex: aiIndex });

  current.messages.length = aiIndex;
  await save();

  const chatLog = $("#chat-log");
  const allMessages = chatLog.querySelectorAll(".message");
  for (let i = allMessages.length - 1; i >= 0; i--) {
    const msgIndex = parseInt(allMessages[i].dataset.index || "-1", 10);
    if (msgIndex >= aiIndex) {
      allMessages[i].remove();
    }
  }

  const newAiMessageIndex = current.messages.length;
  current.messages.push(["ai", ""]);
  const aiNode = addMessage("ai", "", { final: false, index: newAiMessageIndex });
  aiNode.dataset.index = String(newAiMessageIndex);

  scheduleThinkingText(aiNode);
  const isFirstInteraction = aiIndex === 1;
  startStream(current, text, aiNode, newAiMessageIndex, isFirstInteraction);
}

async function regenerateFromCancelled(targetButton) {
  if (!current || streamManager.isStreamingInSession(current)) return;

  const messageNode = targetButton.closest(".message.ai_cancelled");
  if (!messageNode) return;

  const messageIndex = parseInt(targetButton.dataset.messageIndex, 10);
  if (isNaN(messageIndex)) return;

  const existingContent = current.messages[messageIndex]?.[1] || "";

  const msgs = buildMessagesUpTo(messageIndex - 1);

  let promptContent;
  if (existingContent && existingContent.length > 20) {
    promptContent = `[System] Continue this response from where it left off without repeating anything, without providing any additional response to reply to this:\n\n${existingContent}\n\n---CONTINUE FROM HERE WITHOUT REPEATING ANYTHING---`;
  } else {
    const userMessages = current.messages.slice(0, messageIndex).filter((m) => m[0] === "user");
    const lastUserMessage = userMessages.pop();
    if (!lastUserMessage) return;
    promptContent = lastUserMessage[1];
  }

  msgs.push({ role: "user", content: promptContent });

  current.messages[messageIndex] = ["ai", ""];
  await save();

  const newNode = addMessage("ai", "", { final: false, index: messageIndex });
  newNode.dataset.index = String(messageIndex);

  messageNode.parentNode.replaceChild(newNode, messageNode);

  scheduleThinkingText(newNode);
  startStream(current, promptContent, newNode, messageIndex, false, msgs);
}


// Session Management
function deleteSession(sessionToDelete) {
  if (!sessionToDelete) return;
  log("SESSION", 2, "deleteSession", "Deleting session", { sessionName: sessionToDelete.name, createdAt: sessionToDelete.created_at });
  state.sessions = state.sessions.filter((s) => s !== sessionToDelete);
  if (current === sessionToDelete) showWelcomeScreen();
  else renderSessions();
  save();
}

function deleteCurrentSession() {
  if (!current) return;
    log("UI", 1, "deleteCurrentSession", "Opening confirmation modal to delete current session", { sessionName: current?.name });  showConfirmationModal("Delete Current Session", `Are you sure you want to delete "${current.name}"?`, () =>
    deleteSession(current),
  );
}


// Theme and UI
function applyTheme(theme) {
  log("UI", 2, "applyTheme", "Applying new theme", { theme });
  document.body.className = theme === "dark" ? "dark-theme" : "light-theme";
  $("#theme-slider").checked = theme === "dark";
  $("#theme-label").textContent = theme === "dark" ? "Dark" : "Light";
  state.settings.theme = theme;
}

function toggleTheme() {
  const newTheme = state.settings.theme === "light" ? "dark" : "light";
  applyTheme(newTheme);
  save();
}

function showConfirmationModal(title, message, onConfirm) {
  const modal = $("#confirm-modal");
  $("#confirm-title").textContent = title;
  $("#confirm-message").textContent = message;
  modal.classList.remove("hidden");
  const okBtn = $("#confirm-ok");
  const newOkBtn = okBtn.cloneNode(true);
  okBtn.parentNode.replaceChild(newOkBtn, okBtn);
  const close = () => modal.classList.add("hidden");
  newOkBtn.addEventListener("click", () => {
    onConfirm();
    close();
  });
  $("#confirm-cancel").onclick = close;
  modal.querySelector(".modal-overlay").onclick = close;
}

function handleSidebarToggle() {
  if (window.innerWidth <= 768) {
    const sidebar = $("#sidebar");
    sidebar.classList.toggle("open");
    if (sidebar.classList.contains("open")) {
      setTimeout(() => {
        const closeOnClickOutside = (e) => {
          if (!sidebar.contains(e.target) && !$("#toggle-sidebar-2").contains(e.target)) {
            sidebar.classList.remove("open");
            document.removeEventListener("click", closeOnClickOutside);
          }
        };
        document.addEventListener("click", closeOnClickOutside);
      }, 100);
    }
  } else {
    collapsed = !collapsed;
    $("#app").classList.toggle("sidebar-collapsed", collapsed);
  }
}

function setupMobileSidebar() {
  const toggleBtn = $("#toggle-sidebar");
  const newBtn = toggleBtn.cloneNode(true);
  toggleBtn.parentNode.replaceChild(newBtn, toggleBtn);
  newBtn.addEventListener("click", handleSidebarToggle);
  const toggleBtn2 = $("#toggle-sidebar-2");
  const newBtn2 = toggleBtn2.cloneNode(true);
  toggleBtn2.parentNode.replaceChild(newBtn2, toggleBtn2);
  newBtn2.addEventListener("click", handleSidebarToggle);
}

function setupTextareaResize() {
  const msgInput = $("#msg");
  msgInput.addEventListener("input", function () {
    this.style.height = "auto";
    this.style.height = `${Math.min(this.scrollHeight, 350)}px`;
  });
}

function setupTextareaCentralResize() {
  const msgCentral = $("#msg-central");
  msgCentral.addEventListener("input", function () {
    this.style.height = "auto";
    this.style.height = `${Math.min(this.scrollHeight, 350)}px`;
  });
}

function setupResponsiveHandlers() {
  let isMobile = window.innerWidth <= 768;
  window.addEventListener("resize", () => {
    const stillMobile = window.innerWidth <= 768;
    if (isMobile !== stillMobile) {
      isMobile = stillMobile;
      $("#app").classList.remove("sidebar-collapsed");
      $("#sidebar").classList.remove("open");
    }
  });
}


// App Lifecycle
function setupEventListeners() {
  $("#minimize-btn").addEventListener("click", () => {
    log("UI", 0, "event:minimize-btn", "Minimize button clicked");
    window.api?.window.minimize();
  });

  $("#maximize-btn").addEventListener("click", () => {
    log("UI", 0, "event:maximize-btn", "Maximize button clicked");
    window.api?.window.maximize();
  });

  $("#close-btn").addEventListener("click", () => {
    log("UI", 0, "event:close-btn", "Close button clicked");
    window.api?.window.close();
  });

  (function wireWelcomeInputs() {
    const msgCentral = $("#msg-central");
    if (msgCentral) {
      const newMsgCentral = msgCentral.cloneNode(true);
      msgCentral.parentNode.replaceChild(newMsgCentral, msgCentral);
      newMsgCentral.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          log("UI", 0, "event:msg-central-keydown", "Enter pressed on welcome screen to start chat", {
            key: e.key, shift: e.shiftKey
          });
          sendFromWelcome();
        }
      });
    }

    const sendCentral = $("#send-central");
    if (sendCentral) {
      const newSendCentral = sendCentral.cloneNode(true);
      sendCentral.parentNode.replaceChild(newSendCentral, sendCentral);
      newSendCentral.addEventListener("click", () => {
        log("UI", 0, "event:send-central-click", "Send button clicked on welcome screen");
        sendFromWelcome();
      });
    }
  })();

  $("#open-model-mgmt").addEventListener("click", () => {
    openModelMgmt();
    $("#settings-menu").classList.add("hidden");
  });

  $("#open-model-switcher").addEventListener("click", () => {
    const modelsConf = state.settings.models || defaultModels();
    const platformEl = $("#platform-select");
    const modelSelEl = $("#model-select");
    const baseUrlEl  = $("#base-url");
    const apiKeyEl   = $("#api-key");
    const labelEl    = $("#model-label");
    const noteEl     = $("#model-note");
    const notePrev   = $("#model-title");

    function applyNotePreview(text) {
      notePrev.title = text && text.trim() ? text.trim() : "—";
    }

    function fillForProvider(p, keepCurrent = false) {
      const prov = modelsConf.providers?.[p] || { baseUrl: '', apiKey: '', models: [] };
      const list = normalizeProviderModels(prov.models);

      modelSelEl.innerHTML = "";
      if (list.length) {
        for (const m of list) {
          const opt = document.createElement('option');
          opt.value = m.id;
          opt.textContent = m.label || m.id;
          modelSelEl.appendChild(opt);
        }
      } else {
        const opt = document.createElement('option');
        opt.value = ""; opt.textContent = "(ketik manual di bawah)";
        modelSelEl.appendChild(opt);
      }

      const act = modelsConf.active || {};
      if (keepCurrent && act.platform === p && act.model) {
        modelSelEl.value = act.model;
        if (!modelSelEl.value) modelSelEl.selectedIndex = 0;
      } else {
        modelSelEl.selectedIndex = 0;
      }

      baseUrlEl.value = prov.baseUrl || '';
      apiKeyEl.value  = prov.apiKey  || '';

      const selectedId = modelSelEl.value;
      const meta = list.find(m => m.id === selectedId) || { id: selectedId, label: selectedId, note: '' };
      labelEl.value = meta.label || selectedId;
      noteEl.value  = meta.note  || '';
      applyNotePreview(meta.note);
    }

    const act = modelsConf.active || {};
    platformEl.value = act.platform || 'openrouter';
    fillForProvider(platformEl.value, true);
    populateTitleModelOptions(platformEl.value);

    platformEl.onchange = (e) => {
      const p = e.target.value;
      fillForProvider(p, false);
      populateTitleModelOptions(p);
    }
    modelSelEl.onchange = () => {
      const p = platformEl.value;
      const list = normalizeProviderModels(modelsConf.providers?.[p]?.models || []);
      const meta = list.find(m => m.id === modelSelEl.value) || { id: modelSelEl.value, label: modelSelEl.value, note: '' };
      $("#model-label").value = meta.label || meta.id;
      $("#model-note").value  = meta.note || '';
      notePrev.title    = meta.note?.trim() || '—';
    };

    // live note preview
    $("#model-note").addEventListener("input", (e) => applyNotePreview(e.target.value));

    $("#models-modal").classList.remove("hidden");
    $("#settings-menu").classList.add("hidden");
  });

  $("#close-models").addEventListener("click", () => $("#models-modal").classList.add("hidden"));
  $("#cancel-models").addEventListener("click", () => $("#models-modal").classList.add("hidden"));
  $("#models-modal .modal-overlay").addEventListener("click", () => $("#models-modal").classList.add("hidden"));

  $("#reset-models").addEventListener("click", () => {
    state.settings.models = defaultModels();
    localStorage.setItem('models-conf', JSON.stringify(state.settings.models));
    updateModelHeader();
  });

  $("#save-models").addEventListener("click", async () => {
    const platform = $("#platform-select").value;
    const modelId  = $("#model-select").value.trim();
    const baseUrl  = $("#base-url").value.trim();
    const apiKey   = $("#api-key").value.trim();
    const label    = $("#model-label").value.trim() || modelId;
    const note     = $("#model-note").value.trim();

    const conf = state.settings.models || defaultModels();
    if (!conf.providers[platform]) conf.providers[platform] = { baseUrl: '', apiKey: '', models: [] };

    conf.providers[platform].baseUrl = baseUrl;
    conf.providers[platform].apiKey  = apiKey;

    const list = normalizeProviderModels(conf.providers[platform].models);
    const idx  = list.findIndex(m => m.id === modelId);
    if (idx >= 0) {
      list[idx].label = label;
      list[idx].note  = note;
    } else {
      list.unshift({ id: modelId, label, note });
    }
    conf.providers[platform].models = list;

    conf.active = { platform, model: modelId, baseUrl, apiKey, label };

    state.settings.models = conf;
    localStorage.setItem('models-conf', JSON.stringify(conf));
    try { if (!DEBUG_MODE) await window.api.models.save(conf); } catch {}

    updateModelHeader();
    $("#models-modal").classList.add("hidden");
  });

  $("#new-chat").addEventListener("click", () => {
    log("UI", 0, "event:new-chat-click", "New chat button clicked");
    showWelcomeScreen();
  });

  $("#trigger-delete-session").addEventListener("click", () => {
    log("UI", 0, "event:trigger-delete-session-click", "Delete session button clicked");
    deleteCurrentSession();
  });

  $("#open-settings").addEventListener("click", (e) => {
    e.stopPropagation();
    const willShow = $("#settings-menu").classList.contains("hidden");
    log("UI", 0, "event:open-settings-click", "Settings menu toggled", { willShow });
    $("#settings-menu").classList.toggle("hidden");
  });

  $("#open-persona-settings").addEventListener("click", () => {
    const { name, work, prefs } = state.settings.persona;
    log("UI", 0, "event:open-persona-settings-click", "Persona settings modal opened", { hasName: !!name, hasWork: !!work, hasPrefs: !!prefs });
    $("#persona-name").value = name || "";
    $("#persona-work").value = work || "";
    $("#persona-prefs").value = prefs || "";
    $("#settings-modal").classList.remove("hidden");
    $("#settings-menu").classList.add("hidden");
  });

  $("#close-modal").addEventListener("click", () => {
    $("#settings-modal").classList.add("hidden");
  });

  $("#close-settings").addEventListener("click", () => {
    $("#settings-modal").classList.add("hidden");
  });

  $("#save-settings").addEventListener("click", async () => {
    const persona = {
      name: $("#persona-name").value.trim(),
      work: $("#persona-work").value.trim(),
      prefs: $("#persona-prefs").value.trim(),
    };
    log("SETTINGS", 2, "event:save-settings-click", "Saving persona settings", {
      hasName: !!persona.name,
      hasWork: !!persona.work,
      hasPrefs: !!persona.prefs,
    });
    state.settings.persona = persona;
    await save();
    $("#settings-modal").classList.add("hidden");
  });

  $("#delete-all").addEventListener("click", () => {
    log("SETTINGS", 3, "event:delete-all-click", "Delete all sessions process initiated");
    showConfirmationModal("Delete All Sessions", "Are you sure?", async () => {
      log("SETTINGS", 3, "confirm:delete-all:accepted", "Confirmation to delete all sessions received");
      streamManager.shutdownGracefully();
      state.sessions = [];
      current = null;
      await save();
      $("#settings-modal").classList.add("hidden");
      showWelcomeScreen();
      log("SETTINGS", 2, "delete-all:completed", "All sessions have been deleted", { sessionsCount: state.sessions.length });
    });
  });

  $("#search").addEventListener("input", () => {
    log("UI", 0, "event:search-input", "Search input changed", { valueLength: $("#search").value.length });
    renderSessions();
  });

  $("#advanced-search-switch").addEventListener("change", (e) => {
    isAdvancedSearch = e.target.checked;
    log("UI", 0, "event:advanced-search-change", "Advanced search toggled", { checked: isAdvancedSearch });
    renderSessions();
  });

  $("#theme-slider").addEventListener("change", () => {
    log("UI", 0, "event:theme-slider-change", "Theme toggled");
    toggleTheme();
  });

  $("#settings-modal .modal-overlay").addEventListener("click", () => {
    log("UI", 0, "event:modal-overlay-click", "Settings modal hidden via overlay click");
    $("#settings-modal").classList.add("hidden");
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      log("UI", 0, "event:keydown-Escape", "Escape key pressed, closing modals/menus");
      $("#settings-modal").classList.add("hidden");
      $("#confirm-modal").classList.add("hidden");
      $("#settings-menu").classList.add("hidden");
    }
  });

  $("#msg").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      if (streamManager.isStreamingInSession(current)) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      send();
    }
  });

  $("#send").addEventListener("click", () => {
    if (!current) return;
    

    const isStreaming = streamManager.isStreamingInSession(current);
    if (!isStreaming) {
      send();
      return;
    }

    log("STREAM", 3, "interrupt:click", "User clicked Interrupt button", { session: current.name });
    let interrupted = false;
    for (const id in streamManager.activeStreams) {
      const st = streamManager.activeStreams[id];
      if (st.session !== current) continue;

      interrupted = true;
      const { aiNode, session, messageIndex } = st;

      try { st.controller?.cancel?.(); } catch {}
      try { streamManager.stopStream(id); } catch {}

      const partial = (st.fullResponse || "").trim();
      session.messages[messageIndex] = ["ai", partial];

      const div = aiNode.querySelector(".message-text");
      if (div) {
        div.innerHTML = md(partial || "*[System] Model not available or system error, try checking the connection or changing the AI model.*");
        if (div.querySelector("pre code")) Prism.highlightAllUnder(div);
      }

      let footer = aiNode.querySelector(".message-footer");
      if (!footer) {
        footer = document.createElement("div");
        footer.className = "message-footer";
        const messageContent = aiNode.querySelector(".message-content");
        if (messageContent) messageContent.appendChild(footer);
        else aiNode.appendChild(footer);
      }
      footer.innerHTML = "";

      const placeholderCard = document.createElement("div");
      placeholderCard.className = "continue-placeholder";

      const hint = document.createElement("span");
      hint.className = "placeholder-hint";
      hint.textContent = "Response interrupted by user";

      const btn = document.createElement("button");
      btn.className = "primary-btn continue-fragment";
      btn.textContent = "Continue";
      btn.disabled = true;
      btn.title = "Continue from interrupted point";

      placeholderCard.appendChild(hint);
      placeholderCard.appendChild(btn);

      setTimeout(() => {
        btn.disabled = false;
      }, 1500);

      btn.addEventListener("click", () => {
        log(
          "STREAM",
          2,
          "continue:interrupted:click",
          "User clicked 'Continue' after manual interruption",
          { session: session.created_at, messageIndex }
        );

        btn.disabled = true;
        footer.innerHTML = "";

        const msgs = buildMessagesUpTo(messageIndex - 1);
        msgs.push({ role: "assistant", content: partial });

        const contextPrompt = `[System] Continue EXACTLY where the last assistant message stopped. Do NOT repeat previous text or acknowledge this instruction. Just provide the continuation.`;
        msgs.push({ role: "user", content: contextPrompt });

        startStream(
          session,
          contextPrompt,
          aiNode,
          messageIndex,
          false,
          msgs,
          partial
        );
        updateInputState();
      });

      footer.appendChild(placeholderCard);
      break;
    }

    if (interrupted) updateInputState();
  });

  document.addEventListener("click", (event) => {
    const copyBtn = event.target.closest(".copy-code-btn");
    if (copyBtn) {
      const block = copyBtn.closest(".code-block-container");
      const codeEl = block?.querySelector("pre code");
      const checkIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;
      const copyIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
      if (!codeEl) return;
      const originalLabel = copyBtn.querySelector("span")?.textContent || "Copy";
      navigator.clipboard
        .writeText(codeEl.textContent)
        .then(() => {
          copyBtn.innerHTML = `${checkIconSVG} <span>Copied!</span>`;
          copyBtn.classList.add("copied");
          setTimeout(() => {
            copyBtn.innerHTML = `${copyIconSVG} <span>${originalLabel}</span>`;
            copyBtn.classList.remove("copied");
          }, 2000);
        })
        .catch((err) => {
          log("UI", 4, "copy-code-btn:click", "Failed to copy code block", { error: err });
          const span = copyBtn.querySelector("span");
          if (span) span.textContent = "Failed!";
        });
    }

    if (!$("#settings-container").contains(event.target)) {
      $("#settings-menu").classList.add("hidden");
    }

    const regenCancelledTarget = event.target.closest(".regenerate-cancelled");
    if (regenCancelledTarget) {
      const messageIndex = parseInt(regenCancelledTarget.dataset.messageIndex, 10);
      log("UI", 0, "event:regenerate-cancelled-click", "Regenerate-cancelled button clicked", { messageIndex });
      regenerateFromCancelled(regenCancelledTarget);
    }
  });
}


function initializeApp() {
  log("APP", 2, "initializeApp", "Initializing application.");
  setupEventListeners();
  setupMobileSidebar();
  
  setupTextareaResize();
  setupTextareaCentralResize();
  setupResponsiveHandlers();
  window.addEventListener("beforeunload", () => { streamManager.shutdownGracefully(); });
  load();
}

document.addEventListener("DOMContentLoaded", initializeApp);