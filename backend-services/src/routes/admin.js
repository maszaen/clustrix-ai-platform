/**
 * Admin API Route
 * 
 * Admin-only endpoints for management
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { getLogs } = require('../middleware/logger');
const { getAvailableModels, getAvailableProviders, getAllModelsStatus, setModelEnabled, PROVIDER_NAMES } = require('../config/models');

/**
 * Admin auth middleware with security improvements
 */
function adminAuth(req, res, next) {
  const secret = req.headers['x-admin-secret'] || req.query.secret;
  const validSecret = process.env.ADMIN_SECRET;
  
  // Check if ADMIN_SECRET is configured
  if (!validSecret) {
    console.error('[AdminAuth] Error: ADMIN_SECRET not found in env!');
    return res.status(500).json({ error: 'Admin secret not configured', code: 'CONFIG_ERROR' });
  }
  
  // Warn if using default secret (security risk)
  if (validSecret === 'your-super-secret-admin-key-change-this') {
    console.warn('[AdminAuth] WARNING: Using default ADMIN_SECRET! Change this in production!');
  }
  
  // Check if secret is provided
  if (!secret) {
    return res.status(403).json({ error: 'Admin secret required', code: 'FORBIDDEN' });
  }
  
  // Timing-safe comparison to prevent timing attacks
  try {
    const secretBuffer = Buffer.from(String(secret));
    const validBuffer = Buffer.from(validSecret);
    
    // Length check (timingSafeEqual requires same length)
    if (secretBuffer.length !== validBuffer.length) {
      console.warn(`[AdminAuth] Access Denied. Invalid secret length.`);
      return res.status(403).json({ error: 'Invalid admin secret', code: 'FORBIDDEN' });
    }
    
    if (!crypto.timingSafeEqual(secretBuffer, validBuffer)) {
      console.warn(`[AdminAuth] Access Denied. Invalid secret.`);
      return res.status(403).json({ error: 'Invalid admin secret', code: 'FORBIDDEN' });
    }
  } catch (err) {
    console.warn(`[AdminAuth] Access Denied. Comparison error.`);
    return res.status(403).json({ error: 'Invalid admin secret', code: 'FORBIDDEN' });
  }
  
  next();
}

// Apply admin auth to all routes
router.use(adminAuth);

/**
 * GET /admin/stats
 */
router.get('/stats', (req, res) => {
  const { logs, total } = getLogs(1000);
  
  const last24h = logs.filter(l => 
    new Date(l.timestamp) > new Date(Date.now() - 24 * 60 * 60 * 1000)
  );
  
  const uniqueUsers = new Set(last24h.map(l => l.userId).filter(Boolean));
  const errorCount = last24h.filter(l => l.statusCode >= 400).length;
  const avgDuration = last24h.length > 0 
    ? Math.round(last24h.reduce((sum, l) => sum + l.duration, 0) / last24h.length)
    : 0;
  
  res.json({
    totalLogs: total,
    last24h: {
      requests: last24h.length,
      uniqueUsers: uniqueUsers.size,
      errors: errorCount,
      avgDuration,
    },
    availableModels: getAvailableModels().length,
    availableProviders: getAvailableProviders().length,
  });
});

// ===================================================================
// ANALYTICS ENDPOINTS (OpenRouter-style)
// ===================================================================

const { 
  getDashboardStats, 
  getRecentRequests, 
  getAllUserStats, 
  getUserDetails,
  getModelStats,
  getProviderStats,
  getOnlineUsers 
} = require('../services/analytics');

/**
 * GET /admin/analytics/dashboard
 * Main analytics dashboard with overview stats
 */
router.get('/analytics/dashboard', (req, res) => {
  const stats = getDashboardStats();
  res.json(stats);
});

/**
 * GET /admin/analytics/requests
 * Recent requests with filtering and pagination
 */
router.get('/analytics/requests', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const offset = parseInt(req.query.offset) || 0;
  
  const filters = {
    userId: req.query.userId,
    model: req.query.model,
    provider: req.query.provider,
    mode: req.query.mode,
    success: req.query.success === 'true' ? true : req.query.success === 'false' ? false : undefined,
  };
  
  const result = getRecentRequests(limit, offset, filters);
  res.json(result);
});

/**
 * GET /admin/analytics/users
 * All user statistics
 */
router.get('/analytics/users', (req, res) => {
  const users = getAllUserStats();
  res.json({ users, total: users.length });
});

/**
 * GET /admin/analytics/users/:userId
 * Detailed stats for a specific user
 */
router.get('/analytics/users/:userId', (req, res) => {
  const details = getUserDetails(req.params.userId);
  if (!details) {
    return res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' });
  }
  res.json(details);
});

/**
 * GET /admin/analytics/models
 * Model usage statistics
 */
router.get('/analytics/models', (req, res) => {
  const models = getModelStats();
  res.json({ models, total: models.length });
});

/**
 * GET /admin/analytics/providers
 * Provider statistics
 */
router.get('/analytics/providers', (req, res) => {
  const providers = getProviderStats();
  res.json({ providers, total: providers.length });
});

/**
 * GET /admin/analytics/online
 * Currently online users
 */
router.get('/analytics/online', (req, res) => {
  const online = getOnlineUsers();
  res.json({ 
    users: online.map(u => ({
      email: u.email,
      device: u.deviceName,
      lastActivity: new Date(u.lastActivity).toISOString(),
    })),
    count: online.length,
  });
});

/**
 * GET /admin/logs
 */
router.get('/logs', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 1000);
  const offset = parseInt(req.query.offset) || 0;
  
  const { logs, total } = getLogs(limit, offset);
  
  res.json({ logs, total, limit, offset });
});

/**
 * GET /admin/models
 * 
 * Get all models with status (enabled, hasApiKey, available)
 */
router.get('/models', (req, res) => {
  const models = getAllModelsStatus();
  res.json({ models });
});

/**
 * POST /admin/toggle-model
 * 
 * Toggle model enabled status (Model ID in body to avoid URL slash issues)
 */
router.post('/toggle-model', (req, res) => {
  console.log(`[AdminAPI] Received toggle request. Payload:`, req.body);
  
  const { modelId, enabled } = req.body;
  
  if (!modelId || typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'Invalid request format', code: 'INVALID_REQUEST' });
  }
  
  const success = setModelEnabled(modelId, enabled);
  if (!success) {
    return res.status(404).json({ error: 'Model not found', code: 'NOT_FOUND' });
  }
  
  res.json({ success: true, modelId, enabled });
});

/**
 * POST /admin/toggle-provider
 * 
 * Toggle all models for a provider
 */
router.post('/toggle-provider', (req, res) => {
  console.log(`[AdminAPI] Received provider toggle request. Payload:`, req.body);
  
  const { providerId, enabled } = req.body;
  
  if (!providerId || typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'Invalid request format', code: 'INVALID_REQUEST' });
  }
  
  // Requires setProviderEnabled to be imported from config/models
  // If not available yet, we iterate manually here or assume implementation matches previous step
  const { setProviderEnabled } = require('../config/models');
  
  const success = setProviderEnabled(providerId, enabled);
  // It returns boolean true if changed, or false if no change. 
  // But strictly speaking it "succeeds" even if no change needed.
  
  res.json({ success: true, providerId, enabled });
});

/**
 * Admin panel HTML
 */
router.get('/', (req, res) => {
  const models = getAllModelsStatus();
  const availableModels = models.filter(m => m.available);
  const providers = getAvailableProviders();
  const { logs } = getLogs(20);
  const secret = req.query.secret || '';
  
  // Group models for SSR
  const grouped = {};
  models.forEach(m => {
    if (!grouped[m.provider]) grouped[m.provider] = [];
    grouped[m.provider].push(m);
  });
  const sortedProviders = Object.keys(grouped).sort();

  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <title>Clustrix Cloud Console</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-dark: #0f172a;
      --bg-card: #1e293b;
      --bg-hover: #334155;
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
      --accent: #38bdf8;
      --success: #10b981;
      --error: #ef4444;
      --border: #334155;
    }
    * { box-sizing: border-box; }
    body { 
      font-family: 'Inter', system-ui, sans-serif; 
      background: var(--bg-dark); 
      color: var(--text-main); 
      margin: 0; 
      padding: 0;
      -webkit-font-smoothing: antialiased;
    }
    .container { max-width: 1200px; margin: 0 auto; padding: 40px 20px; }
    
    header { margin-bottom: 40px; border-bottom: 1px solid var(--border); padding-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }
    h1 { margin: 0; font-size: 24px; font-weight: 700;  }
    .subtitle { color: var(--text-muted); font-size: 14px; margin-top: 5px; }

    .grid-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 40px; }
    .stat-card { background: var(--bg-card); padding: 20px; border-radius: 12px; border: 1px solid var(--border); }
    .stat-val { font-size: 32px; font-weight: 700; color: var(--text-main); }
    .stat-label { font-size: 13px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; margin-top: 5px; }

    .provider-section { margin-bottom: 30px; background: var(--bg-card); border-radius: 16px; border: 1px solid var(--border); overflow: hidden; }
    .provider-header { 
      padding: 15px 20px; 
      background: rgba(255,255,255,0.03); 
      border-bottom: 1px solid var(--border);
      display: flex; justify-content: space-between; align-items: center;
    }
    .provider-title { font-size: 16px; font-weight: 600; display: flex; align-items: center; gap: 10px; }
    .provider-models-grid { 
      display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1px; 
      background: var(--border); 
    }
    .model-item { 
      background: var(--bg-card); 
      padding: 15px 20px; 
      display: flex; justify-content: space-between; align-items: center; 
    }
    .model-item:hover { background: var(--bg-hover); }
    
    .model-name { font-weight: 500; font-size: 14px; }
    .model-id { font-size: 11px; color: var(--text-muted); font-family: monospace; margin-top: 2px; }

    .badge { padding: 2px 8px; border-radius: 99px; font-size: 10px; font-weight: 600; background: #334155; }
    .badge.no-key { background: rgba(239, 68, 68, 0.2); color: var(--error); }
    .badge.key-ok { background: rgba(16, 185, 129, 0.2); color: var(--success); }

    .switch { position: relative; display: inline-block; width: 44px; height: 24px; flex-shrink: 0; }
    .switch input { opacity: 0; width: 0; height: 0; }
    .slider {
      position: absolute; cursor: pointer;
      top: 0; left: 0; right: 0; bottom: 0;
      background-color: #334155;
      transition: .2s;
      border-radius: 24px;
    }
    .slider:before {
      position: absolute; content: "";
      height: 18px; width: 18px;
      left: 3px; bottom: 3px;
      background-color: white;
      transition: .2s;
      border-radius: 50%;
    }
    input:checked + .slider { background-color: var(--success); }
    input:checked + .slider:before { transform: translateX(20px); }
    input:disabled + .slider { opacity: 0.3; cursor: not-allowed; }

    .table-container { background: var(--bg-card); border-radius: 12px; border: 1px solid var(--border); overflow: hidden; margin-top: 0px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { background: #0f172a; text-align: left; padding: 12px 20px; color: var(--text-muted); font-weight: 500; font-size: 12px; }
    td { padding: 12px 20px; border-top: 1px solid var(--border); color: var(--text-main); }
    .status-ok { color: var(--success); }
    .status-err { color: var(--error); font-weight: 600; }
    .method { font-family: monospace; font-size: 11px; padding: 2px 6px; background: #334155; border-radius: 4px; }
    .live-dot { height: 8px; width: 8px; background: var(--success); border-radius: 50%; display: inline-block; animation: pulse 1.5s infinite; }
    @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.3; } 100% { opacity: 1; } }
    
    .search-container { position: relative; margin-bottom: 30px; }
    .search-input { 
      width: 100%; 
      padding: 14px 20px; 
      padding-left: 45px;
      background: var(--bg-card); 
      border: 1px solid var(--border); 
      border-radius: 12px; 
      color: var(--text-main); 
      font-size: 14px; 
      font-family: inherit;
      transition: all 0.2s;
    }
    .search-input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.1); }
    .search-icon { position: absolute; left: 15px; top: 14px; color: var(--text-muted); pointer-events: none; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <h1>Clustrix Cloud Console</h1>
        <div class="subtitle">Backend Services Manager</div>
      </div>
      <div>
        <div id="live-indicator" style="font-size: 12px; color: var(--success); display: flex; align-items: center; gap: 6px;">
          <span class="live-dot"></span> LIVE CONNECTED
        </div>
      </div>
    </header>

    <div class="grid-stats">
      <div class="stat-card">
        <div class="stat-val">${availableModels.length}</div>
        <div class="stat-label">Active Models</div>
      </div>
      <div class="stat-card">
        <div class="stat-val">${providers.length}</div>
        <div class="stat-label">Connected Providers</div>
      </div>
      <div class="stat-card">
        <div class="stat-val" id="total-req">${logs.length}</div>
        <div class="stat-label">Total Requests</div>
      </div>
      <div class="stat-card" style="border: 1px solid var(--success);">
        <div class="stat-val" id="online-count" style="color: var(--success);">-</div>
        <div class="stat-label">🟢 Online Now</div>
      </div>
    </div>

    <!-- Analytics Quick View -->
    <div class="provider-section" style="margin-bottom: 30px;">
      <div class="provider-header">
        <div class="provider-title">📊 Analytics (Cloud Mode)</div>
        <button onclick="refreshAnalytics()" style="padding: 6px 12px; background: var(--accent); color: #000; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 12px;">Refresh</button>
      </div>
      <div style="padding: 20px;">
        <div class="grid-stats" style="margin-bottom: 0;">
          <div class="stat-card">
            <div class="stat-val" id="total-tokens">-</div>
            <div class="stat-label">Total Tokens (24h)</div>
          </div>
          <div class="stat-card">
            <div class="stat-val" id="total-cost">-</div>
            <div class="stat-label">Est. Cost (24h)</div>
          </div>
          <div class="stat-card">
            <div class="stat-val" id="unique-users">-</div>
            <div class="stat-label">Unique Users (24h)</div>
          </div>
          <div class="stat-card">
            <div class="stat-val" id="error-rate">-</div>
            <div class="stat-label">Error Rate (24h)</div>
          </div>
        </div>
        
        <!-- Online Users List -->
        <div style="margin-top: 20px;">
          <div style="font-size: 13px; color: var(--text-muted); margin-bottom: 10px;">ONLINE USERS</div>
          <div id="online-users-list" style="display: flex; flex-wrap: wrap; gap: 10px;"></div>
        </div>
        
        <!-- Top Models (24h) -->
        <div style="margin-top: 20px;">
          <div style="font-size: 13px; color: var(--text-muted); margin-bottom: 10px;">TOP MODELS (24h)</div>
          <div id="top-models-list" style="display: flex; flex-wrap: wrap; gap: 10px;"></div>
        </div>
      </div>
    </div>

    <!-- Search Bar -->
    <div class="search-container">
      <svg class="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
      <input type="text" id="search-input" class="search-input" placeholder="Search models, providers, or logs..." autocomplete="off">
    </div>

    <h2>📦 Model Configuration</h2>
    
    ${sortedProviders.map(providerId => {
       const providerModels = grouped[providerId];
       const providerName = PROVIDER_NAMES[providerId] || providerId;
       const hasKey = providerModels.some(m => m.hasApiKey);
       const allEnabled = providerModels.every(m => m.enabled);
       
       return `
       <div class="provider-section" data-provider="${providerId}" data-name="${providerName}">
         <div class="provider-header">
           <div class="provider-title">
             ${providerName}
             ${hasKey 
               ? '<span class="badge key-ok">API KEY DETECTED</span>' 
               : '<span class="badge no-key">MISSING API KEY</span>'}
           </div>
           <div style="display:flex; align-items:center; gap: 10px; font-size:12px; color:var(--text-muted);">
             <span>Toggle All</span>
             <label class="switch">
               <input type="checkbox" onchange="toggleProvider('${providerId}', this.checked)" 
                 ${allEnabled && hasKey ? 'checked' : ''} 
                 ${hasKey ? '' : 'disabled'}>
               <span class="slider"></span>
             </label>
           </div>
         </div>
         <div class="provider-models-grid">
           ${providerModels.map(m => `
             <div class="model-item">
               <div>
                  <div class="model-name">${m.name}</div>
                  <div class="model-id">${m.id}</div>
               </div>
               <label class="switch">
                 <input type="checkbox" class="model-check provider-${providerId}" onchange="toggleModel('${m.id}', this.checked, this)" 
                   ${m.enabled && m.hasApiKey ? 'checked' : ''} 
                   ${m.hasApiKey ? '' : 'disabled'}>
                 <span class="slider"></span>
               </label>
             </div>
           `).join('')}
         </div>
       </div>
       `;
    }).join('')}

    <h2>📡 Live Traffic</h2>
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>TIMESTAMP</th>
            <th>DEVICE</th>
            <th>USER</th>
            <th>ENDPOINT</th>
            <th>STATUS</th>
            <th>LATENCY</th>
          </tr>
        </thead>
        <tbody id="logs-body">
          ${logs.slice(0, 20).map(l => `
            <tr>
              <td style="color:var(--text-muted)">${new Date(l.timestamp).toLocaleTimeString()}</td>
              <td style="font-weight:500; font-size:12px;">${l.device || '-'}</td>
              <td>${l.userEmail || 'Anon'}</td>
              <td><span class="method">${l.method || 'REQ'}</span> ${l.path}</td>
              <td class="${l.statusCode < 400 ? 'status-ok' : 'status-err'}">${l.statusCode}</td>
              <td style="font-family:monospace">${l.duration}ms</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  </div>

  <script>
    const SECRET = "${secret}";
    const SECRET_PARAM = '?secret=' + encodeURIComponent(SECRET);
    
    // Search Logic
    let searchQuery = '';
    const searchInput = document.getElementById('search-input');
    
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.toLowerCase();
      applyFilters();
    });
    
    function applyFilters() {
      if (!searchQuery) {
        // Reset all
        document.querySelectorAll('.provider-section').forEach(el => el.style.display = '');
        document.querySelectorAll('.model-item').forEach(el => el.style.display = '');
        document.querySelectorAll('#logs-body tr').forEach(el => el.style.display = '');
        return;
      }
      
      // Filter Models
      const providers = document.querySelectorAll('.provider-section');
      providers.forEach(p => {
        const models = p.querySelectorAll('.model-item');
        let hasVisibleModel = false;
        const providerName = p.dataset.name.toLowerCase();
        const providerMatch = providerName.includes(searchQuery);

        models.forEach(m => {
          const text = m.innerText.toLowerCase();
          // If provider matches, show all its models? NO, let's filter specifically.
          // Unless user searched "OpenAI", then maybe they want to see all OpenAI models.
          const match = text.includes(searchQuery) || providerMatch;
          
          m.style.display = match ? 'flex' : 'none';
          if (match) hasVisibleModel = true;
        });
        
        // Show provider if it has visible models
        p.style.display = hasVisibleModel ? 'block' : 'none';
      });
      
      // Filter Logs
      const rows = document.querySelectorAll('#logs-body tr');
      rows.forEach(r => {
        const text = r.innerText.toLowerCase();
        // Skip log searching if query is clearly for a model/provider (optional heuristic)
        // But for now, search everything
        r.style.display = text.includes(searchQuery) ? 'table-row' : 'none';
      });
    }

    // 1. No-Reload Toggle Model
    async function toggleModel(modelId, enabled, checkbox) {
      try {
        const res = await fetch('/admin/toggle-model' + SECRET_PARAM, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ modelId, enabled })
        });
        
        if (!res.ok) {
          throw new Error(await res.text());
        }
        console.log('Model updated:', modelId);
      } catch (e) {
        console.error(e);
        checkbox.checked = !enabled; // Revert UI
        alert('Failed to update: ' + e.message);
      }
    }

    // 2. No-Reload Toggle Provider (Bulk)
    async function toggleProvider(providerId, enabled, checkbox) {
      // Optimistic UI update for all children
      const children = document.querySelectorAll('.model-check.provider-' + providerId);
      children.forEach(ch => {
        if (!ch.disabled) ch.checked = enabled;
      });

      try {
        const res = await fetch('/admin/toggle-provider' + SECRET_PARAM, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ providerId, enabled })
        });
        
        if (!res.ok) {
          throw new Error(await res.text());
        }
        console.log('Provider updated:', providerId);
      } catch (e) {
        console.error(e);
        // Revert parent and children
        checkbox.checked = !enabled;
        children.forEach(ch => { if (!ch.disabled) ch.checked = !enabled; });
        alert('Failed to update: ' + e.message);
      }
    }
    
    // 3. Realtime Log Polling with Smart Idle
    let lastActivity = Date.now();
    let isConnected = true;
    const IDLE_TIMEOUT = 5000; // Stop after 5 seconds of inactivity
    
    // Resume on interaction
    const resetIdle = () => {
      const wasIdle = Date.now() - lastActivity > IDLE_TIMEOUT;
      lastActivity = Date.now();
      if (wasIdle) {
          pollLogs(); // Wake up
          updateStatus(true);
      }
    };

    ['mousemove', 'click', 'scroll', 'keydown', 'touchstart'].forEach(evt => {
      window.addEventListener(evt, resetIdle, { passive: true });
    });
    
    // Resume on tab focus
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) resetIdle();
    });

    function updateStatus(active) {
        const el = document.getElementById('live-indicator');
        // Prevent unnecessary DOM updates
        if (el.dataset.state === (active ? 'active' : 'idle')) return;
        el.dataset.state = active ? 'active' : 'idle';

        if (active) {
            console.log('[Dashboard] Activity detected. Resuming live polling.');
            el.innerHTML = '<span class="live-dot"></span> LIVE CONNECTED';
            el.style.color = 'var(--success)';
            el.querySelector('.live-dot').style.background = 'var(--success)';
            el.querySelector('.live-dot').style.animation = 'pulse 1.5s infinite';
        } else {
            console.log('[Dashboard] Idle or hidden. Polling paused to save resources.');
            el.innerHTML = '<span class="live-dot"></span> IDLE (PAUSED)';
            el.style.color = 'var(--text-muted)';
            el.querySelector('.live-dot').style.background = 'var(--text-muted)';
            el.querySelector('.live-dot').style.animation = 'none';
        }
    }

    async function pollLogs() {
      // Check tab visibility first
      if (document.hidden) {
        updateStatus(false);
        return; 
      }

      // Check idle time
      if (Date.now() - lastActivity > IDLE_TIMEOUT) {
        updateStatus(false);
        return; 
      }
      
      updateStatus(true); // Ensure active visual
      try {
        const res = await fetch('/admin/logs' + SECRET_PARAM + '&limit=20');
        if (!res.ok) return;
        const data = await res.json();
        
        // Update stats
        if(data.total) document.getElementById('total-req').innerText = data.total;
        
        // Render rows
        const rows = data.logs.map(l => {
          const statusClass = l.statusCode < 400 ? 'status-ok' : 'status-err';
          const time = new Date(l.timestamp).toLocaleTimeString();
          const method = l.method || 'REQ';
          const email = l.userEmail || 'anonymous';
          
          return \`<tr>
              <td style="color:var(--text-muted)">\${time}</td>
              <td style="font-weight:500; font-size:12px;">\${l.device || '-'}</td>
              <td>\${email}</td>
              <td><span class="method">\${method}</span> \${l.path}</td>
              <td class="\${statusClass}">\${l.statusCode}</td>
              <td style="font-family:monospace">\${l.duration}ms</td>
            </tr>\`;
        }).join('');
        
        document.getElementById('logs-body').innerHTML = rows;
        // Re-apply filter after polling updates the table
        if (searchQuery) applyFilters();
        
      } catch(e) { console.error('Polling error', e); }
    }
    
    // Analytics polling
    async function refreshAnalytics() {
      try {
        const res = await fetch('/admin/analytics/dashboard?secret=' + SECRET);
        if (!res.ok) throw new Error('Failed to fetch analytics');
        const data = await res.json();
        
        // Update stats
        document.getElementById('online-count').textContent = data.overview?.onlineNow || 0;
        document.getElementById('total-tokens').textContent = formatNumber(data.last24h?.tokens || 0);
        document.getElementById('total-cost').textContent = '$' + (data.last24h?.cost || 0).toFixed(2);
        document.getElementById('unique-users').textContent = data.last24h?.uniqueUsers || 0;
        document.getElementById('error-rate').textContent = (data.last24h?.errorRate || 0) + '%';
        
        // Online users
        const onlineList = document.getElementById('online-users-list');
        if (data.onlineUsers && data.onlineUsers.length > 0) {
          onlineList.innerHTML = data.onlineUsers.map(u => 
            \`<div style="background: var(--bg-hover); padding: 8px 12px; border-radius: 8px; font-size: 12px;">
              <div style="font-weight: 600;">\${u.email}</div>
              <div style="color: var(--text-muted); font-size: 11px;">\${u.device}</div>
            </div>\`
          ).join('');
        } else {
          onlineList.innerHTML = '<div style="color: var(--text-muted); font-size: 12px;">No users online</div>';
        }
        
        // Top models
        const modelsList = document.getElementById('top-models-list');
        if (data.topModels && data.topModels.length > 0) {
          modelsList.innerHTML = data.topModels.map(m => 
            \`<div style="background: var(--bg-hover); padding: 8px 12px; border-radius: 8px; font-size: 12px;">
              <span style="font-weight: 600;">\${m.model}</span>
              <span style="color: var(--accent); margin-left: 8px;">\${m.count}x</span>
            </div>\`
          ).join('');
        } else {
          modelsList.innerHTML = '<div style="color: var(--text-muted); font-size: 12px;">No data yet</div>';
        }
      } catch(e) { 
        console.error('Analytics error', e); 
      }
    }
    
    function formatNumber(num) {
      if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
      if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
      return num.toString();
    }
    
    setInterval(pollLogs, 2000);
    setInterval(refreshAnalytics, 10000); // Refresh analytics every 10s
    pollLogs();
    refreshAnalytics();
  </script>
</body>
</html>
  `);
});
module.exports = router;
