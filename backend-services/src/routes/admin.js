/**
 * Admin API Route
 * 
 * Admin-only endpoints for management
 */

const express = require('express');
const router = express.Router();
const { getLogs } = require('../middleware/logger');
const { getAvailableModels, getAvailableProviders, getAllModelsStatus, setModelEnabled, PROVIDER_NAMES } = require('../config/models');
const { validateAdminSecret } = require('../middleware/validation');

// Apply admin auth to all routes
router.use(validateAdminSecret);

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

// ===================================================================
// USER MANAGEMENT ENDPOINTS
// ===================================================================

const { 
  getUserUsage, 
  resetUserLimit, 
  grantUnlimited, 
  revokeUnlimited,
  getUnlimitedUsers,
  blockUser,
  unblockUser,
  isBlocked,
  getBlockedUsers,
  getProviderTokenUsage,
  PROVIDER_TOKEN_LIMIT,
} = require('../middleware/rateLimit');

/**
 * GET /admin/users
 * List all users with their usage and config
 */
router.get('/users', (req, res) => {
  const users = getAllUserStats();
  const unlimitedList = getUnlimitedUsers();
  const blockedList = getBlockedUsers();
  
  // Enhance with usage, unlimited and blocked status
  const enhancedUsers = users.map(u => ({
    ...u,
    usage: getUserUsage(u.userId),
    isUnlimited: unlimitedList.includes(u.userId),
    isBlocked: blockedList.includes(u.userId),
  }));
  
  res.json({ users: enhancedUsers, total: enhancedUsers.length });
});

/**
 * GET /admin/users/:userId
 * Get detailed user info including recent logs, interactions, and rate limits
 */
router.get('/users/:userId', (req, res) => {
  const userId = req.params.userId;
  const details = getUserDetails(userId);
  
  if (!details) {
    return res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' });
  }
  
  const unlimitedList = getUnlimitedUsers();
  const providerTokens = getProviderTokenUsage(userId);
  
  res.json({
    ...details,
    devices: Array.from(details.devices || []),
    usage: getUserUsage(userId),
    isUnlimited: unlimitedList.includes(userId),
    recentLogs: details.recentLogs || [],
    recentInteractions: details.recentInteractions || [],
    // Rate limit details
    providerTokenUsage: providerTokens,
    providerTokenLimit: PROVIDER_TOKEN_LIMIT,
  });
});

/**
 * POST /admin/users/:userId/reset-limit
 * Reset user's daily limit
 */
router.post('/users/:userId/reset-limit', (req, res) => {
  const result = resetUserLimit(req.params.userId);
  console.log(`[Admin] Reset limit for user ${req.params.userId}`);
  res.json(result);
});

/**
 * POST /admin/users/:userId/grant-unlimited
 * Grant unlimited access to user
 */
router.post('/users/:userId/grant-unlimited', (req, res) => {
  const result = grantUnlimited(req.params.userId);
  console.log(`[Admin] Granted unlimited to user ${req.params.userId}`);
  res.json(result);
});

/**
 * POST /admin/users/:userId/revoke-unlimited
 * Revoke unlimited access from user
 */
router.post('/users/:userId/revoke-unlimited', (req, res) => {
  const result = revokeUnlimited(req.params.userId);
  console.log(`[Admin] Revoked unlimited from user ${req.params.userId}`);
  res.json(result);
});

/**
 * POST /admin/users/:userId/block
 * Block user from using the service
 */
router.post('/users/:userId/block', (req, res) => {
  const result = blockUser(req.params.userId);
  console.log(`[Admin] Blocked user ${req.params.userId}`);
  res.json(result);
});

/**
 * POST /admin/users/:userId/unblock
 * Unblock user
 */
router.post('/users/:userId/unblock', (req, res) => {
  const result = unblockUser(req.params.userId);
  console.log(`[Admin] Unblocked user ${req.params.userId}`);
  res.json(result);
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

    <!-- User Management Section -->
    <div class="provider-section" style="margin-bottom: 30px;">
      <div class="provider-header">
        <div class="provider-title">👥 User Management</div>
        <button onclick="loadUsers()" style="padding: 6px 12px; background: var(--accent); color: #000; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 12px;">Refresh</button>
      </div>
      <div style="padding: 20px;">
        <div class="table-container" style="margin-top: 0;">
          <table>
            <thead>
              <tr>
                <th>EMAIL</th>
                <th>REQUESTS</th>
                <th>TOKENS</th>
                <th>USAGE</th>
                <th>STATUS</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody id="users-body">
              <tr><td colspan="6" style="text-align: center; color: var(--text-muted);">Loading users...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- User Detail Modal -->
    <div id="user-modal" style="display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); z-index: 1000; overflow-y: auto;">
      <div style="max-width: 800px; margin: 50px auto; background: var(--bg-card); border-radius: 16px; border: 1px solid var(--border);">
        <div style="padding: 20px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="font-size: 18px; font-weight: 600;" id="modal-user-email">User Details</div>
            <div style="font-size: 12px; color: var(--text-muted);" id="modal-user-id"></div>
          </div>
          <button onclick="closeUserModal()" style="background: none; border: none; color: var(--text-muted); font-size: 24px; cursor: pointer;">&times;</button>
        </div>
        <div style="padding: 20px;">
          <!-- User Stats -->
          <div class="grid-stats" style="margin-bottom: 20px;">
            <div class="stat-card">
              <div class="stat-val" id="modal-requests">-</div>
              <div class="stat-label">Total Requests</div>
            </div>
            <div class="stat-card">
              <div class="stat-val" id="modal-tokens">-</div>
              <div class="stat-label">Total Tokens</div>
            </div>
            <div class="stat-card">
              <div class="stat-val" id="modal-usage">-</div>
              <div class="stat-label">Today's Usage</div>
            </div>
          </div>

          <!-- Admin Actions -->
          <div style="display: flex; gap: 10px; margin-bottom: 20px;">
            <button onclick="resetUserLimitAction()" style="padding: 10px 20px; background: var(--accent); color: #000; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">🔄 Reset Daily Limit</button>
            <button id="unlimited-btn" onclick="toggleUnlimitedAction()" style="padding: 10px 20px; background: var(--success); color: #fff; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">⚡ Grant Unlimited</button>
          </div>

          <!-- Recent Logs -->
          <div style="margin-bottom: 20px;">
            <div style="font-size: 14px; font-weight: 600; margin-bottom: 10px;">📋 Last 5 Logs</div>
            <div id="modal-logs" style="font-size: 12px; font-family: monospace; background: var(--bg-dark); padding: 15px; border-radius: 8px; max-height: 200px; overflow-y: auto;"></div>
          </div>

          <!-- Recent Interactions -->
          <div>
            <div style="font-size: 14px; font-weight: 600; margin-bottom: 10px;">💬 Last 5 Interactions</div>
            <div id="modal-interactions" style="font-size: 12px;"></div>
          </div>
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
    // Admin auth is handled via headers (e.g., Basic auth).
    
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
        const res = await fetch('/admin/toggle-model', {
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
        const res = await fetch('/admin/toggle-provider', {
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
        const res = await fetch('/admin/logs?limit=20');
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
        const res = await fetch('/admin/analytics/dashboard');
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
    
    // User Management
    let currentUserId = null;
    let currentUserUnlimited = false;
    
    async function loadUsers() {
      try {
        const res = await fetch('/admin/users');
        if (!res.ok) throw new Error('Failed to load users');
        const data = await res.json();
        
        const tbody = document.getElementById('users-body');
        if (data.users.length === 0) {
          tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">No users yet</td></tr>';
          return;
        }
        
        tbody.innerHTML = data.users.map(u => {
          const usageText = u.isUnlimited ? '∞' : \`\${u.usage?.used || 0}/\${u.usage?.limit || 50}\`;
          const statusBadge = u.isUnlimited 
            ? '<span class="badge key-ok">UNLIMITED</span>' 
            : '<span class="badge">NORMAL</span>';
          
          return \`<tr style="cursor: pointer;" onclick="showUserDetail('\${u.userId}')">
            <td style="font-weight: 500;">\${u.email}</td>
            <td>\${u.totalRequests}</td>
            <td>\${formatNumber(u.totalTokens)}</td>
            <td>\${usageText}</td>
            <td>\${statusBadge}</td>
            <td>
              <button onclick="event.stopPropagation(); showUserDetail('\${u.userId}')" style="padding: 4px 10px; background: var(--bg-hover); border: 1px solid var(--border); border-radius: 4px; color: var(--text-main); cursor: pointer; font-size: 11px;">View</button>
            </td>
          </tr>\`;
        }).join('');
      } catch(e) {
        console.error('Load users error', e);
      }
    }
    
    async function showUserDetail(userId) {
      currentUserId = userId;
      document.getElementById('user-modal').style.display = 'block';
      
      try {
        const res = await fetch('/admin/users/' + userId);
        if (!res.ok) throw new Error('Failed to load user');
        const u = await res.json();
        
        currentUserUnlimited = u.isUnlimited;
        
        document.getElementById('modal-user-email').textContent = u.email;
        document.getElementById('modal-user-id').textContent = 'ID: ' + u.userId;
        document.getElementById('modal-requests').textContent = u.totalRequests;
        document.getElementById('modal-tokens').textContent = formatNumber(u.totalTokens);
        document.getElementById('modal-usage').textContent = u.isUnlimited ? '∞' : \`\${u.usage?.used || 0}/\${u.usage?.limit || 50}\`;
        
        // Update unlimited button
        const btn = document.getElementById('unlimited-btn');
        if (u.isUnlimited) {
          btn.textContent = '🚫 Revoke Unlimited';
          btn.style.background = 'var(--error)';
        } else {
          btn.textContent = '⚡ Grant Unlimited';
          btn.style.background = 'var(--success)';
        }
        
        // Recent logs
        const logsDiv = document.getElementById('modal-logs');
        if (u.recentLogs && u.recentLogs.length > 0) {
          logsDiv.innerHTML = u.recentLogs.map(l => \`<div style="margin-bottom: 8px; padding: 8px; background: var(--bg-card); border-radius: 4px;">
            <span style="color: var(--text-muted);">\${new Date(l.timestamp).toLocaleString()}</span>
            <span style="color: \${l.success ? 'var(--success)' : 'var(--error)'}; margin-left: 10px;">\${l.success ? '✓' : '✗'}</span>
            <span style="margin-left: 10px;">\${l.model}</span>
            <span style="color: var(--text-muted); margin-left: 10px;">\${l.inputTokens || 0}→\${l.outputTokens || 0} tokens</span>
            \${l.errorMessage ? \`<div style="color: var(--error); margin-top: 4px;">\${l.errorMessage}</div>\` : ''}
          </div>\`).join('');
        } else {
          logsDiv.innerHTML = '<div style="color: var(--text-muted);">No logs yet</div>';
        }
        
        // Recent interactions
        const interDiv = document.getElementById('modal-interactions');
        if (u.recentInteractions && u.recentInteractions.length > 0) {
          interDiv.innerHTML = u.recentInteractions.map(i => \`<div style="margin-bottom: 12px; padding: 12px; background: var(--bg-dark); border-radius: 8px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span style="color: var(--text-muted); font-size: 11px;">\${new Date(i.timestamp).toLocaleString()}</span>
              <span style="font-size: 11px;">\${i.model}</span>
            </div>
            <div style="margin-bottom: 8px;">
              <div style="color: var(--accent); font-size: 11px; margin-bottom: 4px;">PROMPT:</div>
              <div style="background: var(--bg-card); padding: 8px; border-radius: 4px; word-break: break-word;">\${escapeHtml(i.prompt || '[empty]')}</div>
            </div>
            <div>
              <div style="color: var(--success); font-size: 11px; margin-bottom: 4px;">RESPONSE:</div>
              <div style="background: var(--bg-card); padding: 8px; border-radius: 4px; word-break: break-word;">\${escapeHtml(i.response || '[empty]')}</div>
            </div>
          </div>\`).join('');
        } else {
          interDiv.innerHTML = '<div style="color: var(--text-muted);">No interactions yet</div>';
        }
      } catch(e) {
        console.error('User detail error', e);
      }
    }
    
    function closeUserModal() {
      document.getElementById('user-modal').style.display = 'none';
      currentUserId = null;
    }
    
    async function resetUserLimitAction() {
      if (!currentUserId) return;
      try {
        const res = await fetch('/admin/users/' + currentUserId + '/reset-limit', { method: 'POST' });
        if (!res.ok) throw new Error('Failed to reset limit');
        alert('Limit reset successfully!');
        showUserDetail(currentUserId);
        loadUsers();
      } catch(e) {
        alert('Error: ' + e.message);
      }
    }
    
    async function toggleUnlimitedAction() {
      if (!currentUserId) return;
      const endpoint = currentUserUnlimited ? 'revoke-unlimited' : 'grant-unlimited';
      try {
        const res = await fetch('/admin/users/' + currentUserId + '/' + endpoint, { method: 'POST' });
        if (!res.ok) throw new Error('Failed to toggle unlimited');
        alert(currentUserUnlimited ? 'Unlimited revoked!' : 'Unlimited granted!');
        showUserDetail(currentUserId);
        loadUsers();
      } catch(e) {
        alert('Error: ' + e.message);
      }
    }
    
    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
    
    setInterval(pollLogs, 2000);
    setInterval(refreshAnalytics, 10000); // Refresh analytics every 10s
    pollLogs();
    refreshAnalytics();
    loadUsers(); // Load users on page load
  </script>
</body>
</html>
  `);
});
module.exports = router;
