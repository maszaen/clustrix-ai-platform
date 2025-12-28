/**
 * Analytics Service
 * 
 * Tracks usage analytics for Cloud Mode users
 * - Request/Response previews (100 char truncated for privacy)
 * - Token usage & estimated costs
 * - Real-time online users
 * - Model/provider statistics
 * 
 * PRIVACY: Cloud Mode = data shared with backend (user uses our API keys)
 *          Local Mode = full privacy, no data sent
 */

// In-memory storage (for production, use Redis/PostgreSQL)
const analytics = {
  requests: [],           // Recent requests log
  userStats: new Map(),   // Per-user statistics
  modelStats: new Map(),  // Per-model statistics  
  providerStats: new Map(), // Per-provider statistics
  onlineUsers: new Map(), // Currently active users (heartbeat)
  hourlyStats: [],        // Hourly aggregated stats
};

// Configuration
const MAX_REQUESTS_LOG = 10000;  // Keep last 10k requests
const PREVIEW_LENGTH = 100;      // Truncate prompts/responses
const ONLINE_TIMEOUT_MS = 5 * 60 * 1000; // 5 min = offline

// Cost estimates per 1M tokens (approximate, update as needed)
const COST_PER_MILLION = {
  // OpenAI
  'gpt-4o': { input: 2.50, output: 10.00 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4-turbo': { input: 10.00, output: 30.00 },
  'gpt-4': { input: 30.00, output: 60.00 },
  'gpt-3.5-turbo': { input: 0.50, output: 1.50 },
  'o1': { input: 15.00, output: 60.00 },
  'o1-mini': { input: 3.00, output: 12.00 },
  'o1-pro': { input: 150.00, output: 600.00 },
  
  // Anthropic
  'claude-3-5-sonnet': { input: 3.00, output: 15.00 },
  'claude-3-5-haiku': { input: 0.80, output: 4.00 },
  'claude-3-opus': { input: 15.00, output: 75.00 },
  
  // Google
  'gemini-2.0-flash': { input: 0.10, output: 0.40 },
  'gemini-1.5-pro': { input: 1.25, output: 5.00 },
  'gemini-1.5-flash': { input: 0.075, output: 0.30 },
  
  // DeepSeek
  'deepseek-chat': { input: 0.14, output: 0.28 },
  'deepseek-reasoner': { input: 0.55, output: 2.19 },
  
  // Groq (free tier, estimate)
  'llama-3.3-70b': { input: 0.59, output: 0.79 },
  'llama-3.1-8b': { input: 0.05, output: 0.08 },
  
  // xAI
  'grok-2': { input: 2.00, output: 10.00 },
  'grok-beta': { input: 5.00, output: 15.00 },
  
  // Default fallback
  'default': { input: 1.00, output: 3.00 },
};

/**
 * Truncate text for privacy-preserving preview
 */
function truncateText(text, maxLength = PREVIEW_LENGTH) {
  if (!text) return '';
  const str = typeof text === 'string' ? text : JSON.stringify(text);
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength) + '...';
}

/**
 * Estimate cost based on token usage
 */
function estimateCost(model, inputTokens, outputTokens) {
  // Find matching cost config
  let costConfig = COST_PER_MILLION['default'];
  for (const [key, config] of Object.entries(COST_PER_MILLION)) {
    if (model.toLowerCase().includes(key.toLowerCase())) {
      costConfig = config;
      break;
    }
  }
  
  const inputCost = (inputTokens / 1000000) * costConfig.input;
  const outputCost = (outputTokens / 1000000) * costConfig.output;
  
  return {
    inputCost: Math.round(inputCost * 1000000) / 1000000, // 6 decimal places
    outputCost: Math.round(outputCost * 1000000) / 1000000,
    totalCost: Math.round((inputCost + outputCost) * 1000000) / 1000000,
  };
}

/**
 * Extract last user message for prompt preview
 */
function extractPromptPreview(messages) {
  if (!Array.isArray(messages)) return '';
  
  // Find last user message
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      const content = messages[i].content;
      if (typeof content === 'string') {
        return truncateText(content);
      } else if (Array.isArray(content)) {
        // Multi-modal content
        const textPart = content.find(p => p.type === 'text');
        return truncateText(textPart?.text || '[Multi-modal content]');
      }
    }
  }
  return '';
}

/**
 * Track a request for analytics
 */
function trackRequest({
  userId,
  userEmail,
  deviceName,
  model,
  provider,
  messages,
  responsePreview,
  inputTokens = 0,
  outputTokens = 0,
  duration = 0,
  success = true,
  errorMessage = null,
  mode = 'chat', // 'chat' | 'agentic' | 'image-gen'
}) {
  const timestamp = new Date().toISOString();
  const promptPreview = extractPromptPreview(messages);
  const cost = estimateCost(model, inputTokens, outputTokens);
  
  const request = {
    id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp,
    userId,
    userEmail: userEmail || 'unknown',
    deviceName: deviceName || 'unknown',
    model,
    provider,
    mode,
    promptPreview,
    responsePreview: truncateText(responsePreview),
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    cost: cost.totalCost,
    duration,
    success,
    errorMessage,
  };
  
  // Add to requests log (FIFO)
  analytics.requests.unshift(request);
  if (analytics.requests.length > MAX_REQUESTS_LOG) {
    analytics.requests.pop();
  }
  
  // Update user stats
  updateUserStats(userId, userEmail, request);
  
  // Update model stats
  updateModelStats(model, request);
  
  // Update provider stats
  updateProviderStats(provider, request);
  
  // Update online status
  updateOnlineStatus(userId, userEmail, deviceName);
  
  return request;
}

/**
 * Update per-user statistics
 */
function updateUserStats(userId, userEmail, request) {
  let stats = analytics.userStats.get(userId);
  if (!stats) {
    stats = {
      userId,
      email: userEmail,
      firstSeen: request.timestamp,
      lastSeen: request.timestamp,
      totalRequests: 0,
      totalTokens: 0,
      totalCost: 0,
      successCount: 0,
      errorCount: 0,
      models: {},
      devices: new Set(),
      recentLogs: [],        // Last 5 request logs for tracing
      recentInteractions: [], // Last 5 prompt/response pairs
    };
    analytics.userStats.set(userId, stats);
  }
  
  stats.lastSeen = request.timestamp;
  stats.totalRequests++;
  stats.totalTokens += request.totalTokens;
  stats.totalCost += request.cost;
  stats.devices.add(request.deviceName);
  
  if (request.success) {
    stats.successCount++;
  } else {
    stats.errorCount++;
  }
  
  // Track model usage
  stats.models[request.model] = (stats.models[request.model] || 0) + 1;
  
  // Store last 5 logs for tracing (minimal info)
  stats.recentLogs.unshift({
    timestamp: request.timestamp,
    model: request.model,
    mode: request.mode,
    success: request.success,
    duration: request.duration,
    inputTokens: request.inputTokens,
    outputTokens: request.outputTokens,
    errorMessage: request.errorMessage,
  });
  if (stats.recentLogs.length > 5) stats.recentLogs.pop();
  
  // Store last 5 prompt/response pairs (500 char slice)
  stats.recentInteractions.unshift({
    timestamp: request.timestamp,
    model: request.model,
    prompt: (request.promptPreview || '').slice(0, 500),
    response: (request.responsePreview || '').slice(0, 500),
    success: request.success,
  });
  if (stats.recentInteractions.length > 5) stats.recentInteractions.pop();
}

/**
 * Update per-model statistics
 */
function updateModelStats(model, request) {
  let stats = analytics.modelStats.get(model);
  if (!stats) {
    stats = {
      model,
      provider: request.provider,
      totalRequests: 0,
      totalTokens: 0,
      totalCost: 0,
      uniqueUsers: new Set(),
      avgDuration: 0,
      totalDuration: 0,
    };
    analytics.modelStats.set(model, stats);
  }
  
  stats.totalRequests++;
  stats.totalTokens += request.totalTokens;
  stats.totalCost += request.cost;
  stats.uniqueUsers.add(request.userId);
  stats.totalDuration += request.duration;
  stats.avgDuration = Math.round(stats.totalDuration / stats.totalRequests);
}

/**
 * Update per-provider statistics  
 */
function updateProviderStats(provider, request) {
  let stats = analytics.providerStats.get(provider);
  if (!stats) {
    stats = {
      provider,
      totalRequests: 0,
      totalTokens: 0,
      totalCost: 0,
      uniqueUsers: new Set(),
      models: new Set(),
      errorCount: 0,
    };
    analytics.providerStats.set(provider, stats);
  }
  
  stats.totalRequests++;
  stats.totalTokens += request.totalTokens;
  stats.totalCost += request.cost;
  stats.uniqueUsers.add(request.userId);
  stats.models.add(request.model);
  
  if (!request.success) {
    stats.errorCount++;
  }
}

/**
 * Update user online status (heartbeat)
 */
function updateOnlineStatus(userId, email, deviceName) {
  analytics.onlineUsers.set(userId, {
    userId,
    email,
    deviceName,
    lastActivity: Date.now(),
  });
}

/**
 * Get currently online users
 */
function getOnlineUsers() {
  const now = Date.now();
  const online = [];
  
  for (const [userId, data] of analytics.onlineUsers) {
    if (now - data.lastActivity < ONLINE_TIMEOUT_MS) {
      online.push(data);
    } else {
      analytics.onlineUsers.delete(userId);
    }
  }
  
  return online;
}

/**
 * Get recent requests with pagination
 */
function getRecentRequests(limit = 100, offset = 0, filters = {}) {
  let filtered = analytics.requests;
  
  // Apply filters
  if (filters.userId) {
    filtered = filtered.filter(r => r.userId === filters.userId);
  }
  if (filters.model) {
    filtered = filtered.filter(r => r.model.includes(filters.model));
  }
  if (filters.provider) {
    filtered = filtered.filter(r => r.provider === filters.provider);
  }
  if (filters.mode) {
    filtered = filtered.filter(r => r.mode === filters.mode);
  }
  if (filters.success !== undefined) {
    filtered = filtered.filter(r => r.success === filters.success);
  }
  
  return {
    requests: filtered.slice(offset, offset + limit),
    total: filtered.length,
    hasMore: offset + limit < filtered.length,
  };
}

/**
 * Get aggregated dashboard stats
 */
function getDashboardStats() {
  const now = Date.now();
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  const oneHourAgo = now - 60 * 60 * 1000;
  
  const last24h = analytics.requests.filter(r => new Date(r.timestamp).getTime() > oneDayAgo);
  const lastHour = analytics.requests.filter(r => new Date(r.timestamp).getTime() > oneHourAgo);
  
  // Calculate totals
  const totalRequests = analytics.requests.length;
  const totalTokens = analytics.requests.reduce((sum, r) => sum + r.totalTokens, 0);
  const totalCost = analytics.requests.reduce((sum, r) => sum + r.cost, 0);
  
  // Online users
  const onlineUsers = getOnlineUsers();
  
  // Top models (last 24h)
  const modelCounts = {};
  last24h.forEach(r => {
    modelCounts[r.model] = (modelCounts[r.model] || 0) + 1;
  });
  const topModels = Object.entries(modelCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([model, count]) => ({ model, count }));
  
  // Top users (last 24h)
  const userCounts = {};
  const userEmails = {};
  last24h.forEach(r => {
    userCounts[r.userId] = (userCounts[r.userId] || 0) + 1;
    userEmails[r.userId] = r.userEmail;
  });
  const topUsers = Object.entries(userCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([userId, count]) => ({ 
      userId, 
      email: userEmails[userId],
      count 
    }));
  
  // Error rate
  const errorCount = last24h.filter(r => !r.success).length;
  const errorRate = last24h.length > 0 ? (errorCount / last24h.length * 100).toFixed(2) : 0;
  
  return {
    overview: {
      totalRequests,
      totalTokens,
      totalCost: Math.round(totalCost * 100) / 100,
      uniqueUsers: analytics.userStats.size,
      onlineNow: onlineUsers.length,
    },
    last24h: {
      requests: last24h.length,
      tokens: last24h.reduce((sum, r) => sum + r.totalTokens, 0),
      cost: Math.round(last24h.reduce((sum, r) => sum + r.cost, 0) * 100) / 100,
      uniqueUsers: new Set(last24h.map(r => r.userId)).size,
      errorRate: parseFloat(errorRate),
    },
    lastHour: {
      requests: lastHour.length,
      tokens: lastHour.reduce((sum, r) => sum + r.totalTokens, 0),
      avgDuration: lastHour.length > 0 
        ? Math.round(lastHour.reduce((sum, r) => sum + r.duration, 0) / lastHour.length)
        : 0,
    },
    topModels,
    topUsers,
    onlineUsers: onlineUsers.map(u => ({
      email: u.email,
      device: u.deviceName,
      lastActivity: new Date(u.lastActivity).toISOString(),
    })),
  };
}

/**
 * Get user details
 */
function getUserDetails(userId) {
  const stats = analytics.userStats.get(userId);
  if (!stats) return null;
  
  // Recent requests for this user
  const recentRequests = analytics.requests
    .filter(r => r.userId === userId)
    .slice(0, 50);
  
  return {
    ...stats,
    devices: Array.from(stats.devices),
    recentRequests,
  };
}

/**
 * Get all user statistics
 */
function getAllUserStats() {
  const users = [];
  for (const [userId, stats] of analytics.userStats) {
    users.push({
      userId,
      email: stats.email,
      totalRequests: stats.totalRequests,
      totalTokens: stats.totalTokens,
      totalCost: Math.round(stats.totalCost * 100) / 100,
      lastSeen: stats.lastSeen,
      devices: Array.from(stats.devices),
    });
  }
  return users.sort((a, b) => b.totalRequests - a.totalRequests);
}

/**
 * Get model statistics
 */
function getModelStats() {
  const models = [];
  for (const [model, stats] of analytics.modelStats) {
    models.push({
      model,
      provider: stats.provider,
      totalRequests: stats.totalRequests,
      totalTokens: stats.totalTokens,
      totalCost: Math.round(stats.totalCost * 100) / 100,
      uniqueUsers: stats.uniqueUsers.size,
      avgDuration: stats.avgDuration,
    });
  }
  return models.sort((a, b) => b.totalRequests - a.totalRequests);
}

/**
 * Get provider statistics
 */
function getProviderStats() {
  const providers = [];
  for (const [provider, stats] of analytics.providerStats) {
    providers.push({
      provider,
      totalRequests: stats.totalRequests,
      totalTokens: stats.totalTokens,
      totalCost: Math.round(stats.totalCost * 100) / 100,
      uniqueUsers: stats.uniqueUsers.size,
      models: Array.from(stats.models),
      errorRate: stats.totalRequests > 0 
        ? (stats.errorCount / stats.totalRequests * 100).toFixed(2)
        : 0,
    });
  }
  return providers.sort((a, b) => b.totalRequests - a.totalRequests);
}

module.exports = {
  trackRequest,
  getOnlineUsers,
  getRecentRequests,
  getDashboardStats,
  getUserDetails,
  getAllUserStats,
  getModelStats,
  getProviderStats,
  updateOnlineStatus,
  estimateCost,
  truncateText,
};
