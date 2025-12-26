/**
 * Admin API Route
 * 
 * Admin-only endpoints for management
 */

const express = require('express');
const router = express.Router();
const { getLogs } = require('../middleware/logger');
const { getAvailableModels, getAvailableProviders, getAllModelsStatus, setModelEnabled, PROVIDER_NAMES } = require('../config/models');

/**
 * Admin auth middleware
 */
function adminAuth(req, res, next) {
  const secret = req.headers['x-admin-secret'] || req.query.secret;
  
  if (!process.env.ADMIN_SECRET) {
    return res.status(500).json({ error: 'Admin secret not configured', code: 'CONFIG_ERROR' });
  }
  
  if (secret !== process.env.ADMIN_SECRET) {
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
 * POST /admin/models/:modelId/toggle
 * 
 * Toggle model enabled status
 */
router.post('/models/:modelId/toggle', (req, res) => {
  const { modelId } = req.params;
  const { enabled } = req.body;
  
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'enabled must be boolean', code: 'INVALID_REQUEST' });
  }
  
  const success = setModelEnabled(modelId, enabled);
  if (!success) {
    return res.status(404).json({ error: 'Model not found', code: 'NOT_FOUND' });
  }
  
  res.json({ success: true, modelId, enabled });
});

/**
 * GET /admin/config
 */
router.get('/config', (req, res) => {
  const envKeys = [
    'OPENAI_API_KEY',
    'GEMINI_API_KEY',
    'ANTHROPIC_API_KEY',
    'MISTRAL_API_KEY',
    'GROQ_API_KEY',
    'OPENROUTER_API_KEY',
    'DEEPSEEK_API_KEY',
    'XAI_API_KEY',
    'ZHIPU_API_KEY',
    'BIGMODEL_API_KEY',
    'PERPLEXITY_API_KEY',
    'CEREBRAS_API_KEY',
    'MEGALLM_API_KEY',
    'TAVILY_API_KEY',
    'SERPAPI_API_KEY',
  ];
  
  const config = {};
  for (const key of envKeys) {
    config[key] = !!process.env[key];
  }
  
  res.json({
    config,
    rateLimits: {
      free: parseInt(process.env.RATE_LIMIT_FREE) || 50,
      premium: parseInt(process.env.RATE_LIMIT_PREMIUM) || 1000,
    },
  });
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
  
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Clustrix Admin</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui; background: #0f0f1a; color: #eee; padding: 20px; margin: 0; }
    h1 { color: #00d4ff; margin-bottom: 5px; }
    h2 { color: #a5a5ff; font-size: 18px; margin: 20px 0 10px; }
    .subtitle { color: #888; margin-bottom: 20px; }
    .card { background: #1a1a2e; padding: 15px; border-radius: 12px; margin: 10px 0; }
    .stats { display: flex; flex-wrap: wrap; gap: 20px; }
    .stat { flex: 1; min-width: 100px; }
    .stat-value { font-size: 28px; font-weight: bold; color: #00d4ff; }
    .stat-label { font-size: 12px; color: #888; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid #333; }
    th { color: #00d4ff; font-weight: 500; }
    .success { color: #4ade80; }
    .error { color: #f87171; }
    .muted { color: #666; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; }
    .badge-success { background: #166534; color: #4ade80; }
    .badge-error { background: #7f1d1d; color: #fca5a5; }
    .badge-warn { background: #78350f; color: #fde047; }
    .toggle { cursor: pointer; padding: 5px 10px; border-radius: 6px; border: none; font-size: 12px; }
    .toggle-on { background: #166534; color: #4ade80; }
    .toggle-off { background: #374151; color: #9ca3af; }
    .model-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 10px; }
    .model-card { background: #16213e; padding: 12px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; }
    .model-info { flex: 1; }
    .model-name { font-weight: 500; }
    .model-provider { font-size: 12px; color: #888; }
  </style>
</head>
<body>
  <h1>🚀 Clustrix Cloud Admin</h1>
  <p class="subtitle">Backend Management Panel</p>
  
  <div class="card">
    <div class="stats">
      <div class="stat">
        <div class="stat-value">${availableModels.length}</div>
        <div class="stat-label">Available Models</div>
      </div>
      <div class="stat">
        <div class="stat-value">${providers.length}</div>
        <div class="stat-label">Providers</div>
      </div>
      <div class="stat">
        <div class="stat-value">${logs.length}</div>
        <div class="stat-label">Recent Requests</div>
      </div>
    </div>
  </div>
  
  <h2>📦 Models</h2>
  <div class="model-grid">
    ${models.map(m => `
    <div class="model-card">
      <div class="model-info">
        <div class="model-name">${m.name}</div>
        <div class="model-provider">${PROVIDER_NAMES[m.provider] || m.provider} ${m.hasApiKey ? '' : '<span class="badge badge-error">No API Key</span>'}</div>
      </div>
      <button class="toggle ${m.enabled && m.hasApiKey ? 'toggle-on' : 'toggle-off'}" 
              onclick="toggleModel('${m.id}', ${!m.enabled})"
              ${m.hasApiKey ? '' : 'disabled'}>
        ${m.enabled ? 'ON' : 'OFF'}
      </button>
    </div>
    `).join('')}
  </div>
  
  <h2>📝 Recent Requests</h2>
  <div class="card">
    <table>
      <tr>
        <th>Time</th>
        <th>User</th>
        <th>Path</th>
        <th>Status</th>
        <th>Duration</th>
      </tr>
      ${logs.slice(0, 15).map(l => `
      <tr>
        <td class="muted">${new Date(l.timestamp).toLocaleTimeString()}</td>
        <td>${l.userEmail || '<span class="muted">anonymous</span>'}</td>
        <td>${l.path}</td>
        <td class="${l.statusCode < 400 ? 'success' : 'error'}">${l.statusCode}</td>
        <td class="muted">${l.duration}ms</td>
      </tr>
      `).join('')}
    </table>
  </div>
  
  <script>
    async function toggleModel(modelId, enabled) {
      try {
        const res = await fetch('/admin/models/' + encodeURIComponent(modelId) + '/toggle?secret=${secret}', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled })
        });
        if (res.ok) {
          location.reload();
        } else {
          alert('Failed to toggle model');
        }
      } catch (e) {
        alert('Error: ' + e.message);
      }
    }
  </script>
</body>
</html>
  `);
});

module.exports = router;
