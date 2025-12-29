/**
 * Rate Limiter Middleware
 * 
 * In-memory rate limiting per user (by Google UID)
 * - Daily request limit (50 requests/day)
 * - Burst protection (10 requests/minute)
 * - Provider token limit (100k tokens per provider per 12 hours)
 * 
 * PRODUCTION NOTE: For high-traffic production with multiple server instances,
 * replace this with Redis-based rate limiting (e.g., ioredis + rate-limiter-flexible)
 * to ensure consistent rate limiting across all instances.
 */

const { saveUnlimitedUser, loadUnlimitedUsers, saveBlockedUser, loadBlockedUsers } = require('../services/database');

// In-memory store: { [userId]: { count: number, resetAt: timestamp, lastRequest: timestamp } }
const userLimits = new Map();

// Provider token usage: { [userId]: { [provider]: { tokens: number, resetAt: timestamp } } }
const providerTokenUsage = new Map();

// Unlimited users (admin granted)
const unlimitedUsers = new Set();

// Blocked users (admin blocked)
const blockedUsers = new Set();

// Load unlimited users from Firestore on init
(async function initUnlimitedUsers() {
  try {
    const users = await loadUnlimitedUsers();
    users.forEach(userId => unlimitedUsers.add(userId));
    console.log(`[RateLimit] Loaded ${users.length} unlimited users from Firestore`);
  } catch (e) {
    console.error('[RateLimit] Failed to load unlimited users:', e.message);
  }
})();

// Load blocked users from Firestore on init
(async function initBlockedUsers() {
  try {
    const users = await loadBlockedUsers();
    users.forEach(userId => blockedUsers.add(userId));
    console.log(`[RateLimit] Loaded ${users.length} blocked users from Firestore`);
  } catch (e) {
    console.error('[RateLimit] Failed to load blocked users:', e.message);
  }
})();

// Burst protection: max requests per minute
const BURST_LIMIT = 10;
const BURST_WINDOW_MS = 60 * 1000; // 1 minute

// Provider token limits
const PROVIDER_TOKEN_LIMIT = 100000; // 100k tokens per provider
const PROVIDER_RESET_HOURS = 12; // Reset every 12 hours

// Clean up old entries every hour
setInterval(() => {
  const now = Date.now();
  for (const [userId, data] of userLimits) {
    if (data.resetAt < now) {
      userLimits.delete(userId);
    }
  }
  // Clean up provider token usage
  for (const [userId, providers] of providerTokenUsage) {
    for (const [provider, data] of Object.entries(providers)) {
      if (data.resetAt < now) {
        delete providers[provider];
      }
    }
    if (Object.keys(providers).length === 0) {
      providerTokenUsage.delete(userId);
    }
  }
}, 60 * 60 * 1000);

/**
 * Rate limiter per user per day with burst protection
 */
function rateLimiter(req, res, next) {
  const userId = req.user?.uid;
  if (!userId) {
    return res.status(401).json({ error: 'User not authenticated', code: 'AUTH_REQUIRED' });
  }
  
  // Check if user is blocked
  if (blockedUsers.has(userId)) {
    return res.status(403).json({ 
      error: 'Your account has been blocked. Contact support for assistance.', 
      code: 'USER_BLOCKED' 
    });
  }
  
  // Skip rate limiting for unlimited users
  if (unlimitedUsers.has(userId)) {
    res.setHeader('X-RateLimit-Limit', 'unlimited');
    res.setHeader('X-RateLimit-Remaining', 'unlimited');
    return next();
  }
  
  const now = Date.now();
  const resetTime = getEndOfDay();
  
  // Get or create user limit data (atomic check-and-set)
  let userData = userLimits.get(userId);
  if (!userData || userData.resetAt < now) {
    userData = { 
      count: 0, 
      resetAt: resetTime,
      burstCount: 0,
      burstResetAt: now + BURST_WINDOW_MS,
    };
    userLimits.set(userId, userData);
  }
  
  // Burst protection: reset burst counter if window expired
  if (userData.burstResetAt < now) {
    userData.burstCount = 0;
    userData.burstResetAt = now + BURST_WINDOW_MS;
  }
  
  // Check burst limit
  if (userData.burstCount >= BURST_LIMIT) {
    const retryAfter = Math.ceil((userData.burstResetAt - now) / 1000);
    res.setHeader('Retry-After', retryAfter);
    return res.status(429).json({
      error: `Too many requests. Please wait ${retryAfter} seconds.`,
      code: 'BURST_LIMIT_EXCEEDED',
      retryAfter,
    });
  }
  
  // Check daily limit
  const maxRequests = parseInt(process.env.RATE_LIMIT_FREE) || 50;
  
  if (userData.count >= maxRequests) {
    const resetIn = Math.ceil((userData.resetAt - now) / 1000 / 60); // minutes
    return res.status(429).json({
      error: `Daily limit exceeded. Resets in ${resetIn} minutes.`,
      code: 'RATE_LIMIT_EXCEEDED',
      limit: maxRequests,
      resetAt: new Date(userData.resetAt).toISOString(),
    });
  }
  
  // Increment counters atomically
  userData.count++;
  userData.burstCount++;
  
  // Add rate limit headers
  res.setHeader('X-RateLimit-Limit', maxRequests);
  res.setHeader('X-RateLimit-Remaining', maxRequests - userData.count);
  res.setHeader('X-RateLimit-Reset', userData.resetAt);
  
  next();
}

/**
 * Get end of current day (midnight UTC)
 */
function getEndOfDay() {
  const now = new Date();
  return new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0, 0, 0, 0
  )).getTime();
}

/**
 * Get user's current usage
 */
function getUserUsage(userId) {
  const userData = userLimits.get(userId);
  const maxRequests = parseInt(process.env.RATE_LIMIT_FREE) || 50;
  const isUnlimitedUser = unlimitedUsers.has(userId);
  const isBlockedUser = blockedUsers.has(userId);
  
  return {
    used: userData?.count || 0,
    limit: isUnlimitedUser ? 'unlimited' : maxRequests,
    remaining: isUnlimitedUser ? 'unlimited' : maxRequests - (userData?.count || 0),
    resetAt: userData?.resetAt ? new Date(userData.resetAt).toISOString() : null,
    isUnlimited: isUnlimitedUser,
    isBlocked: isBlockedUser,
  };
}

/**
 * Reset user's daily limit (admin function)
 */
function resetUserLimit(userId) {
  userLimits.delete(userId);
  return { success: true, message: `Limit reset for user ${userId}` };
}

/**
 * Grant unlimited access to user (admin function)
 */
function grantUnlimited(userId) {
  unlimitedUsers.add(userId);
  saveUnlimitedUser(userId, true); // Persist to Firestore
  return { success: true, message: `Unlimited access granted to ${userId}` };
}

/**
 * Revoke unlimited access from user (admin function)
 */
function revokeUnlimited(userId) {
  unlimitedUsers.delete(userId);
  saveUnlimitedUser(userId, false); // Persist to Firestore
  return { success: true, message: `Unlimited access revoked from ${userId}` };
}

/**
 * Check if user has unlimited access
 */
function isUnlimited(userId) {
  return unlimitedUsers.has(userId);
}

/**
 * Get all unlimited users
 */
function getUnlimitedUsers() {
  return Array.from(unlimitedUsers);
}

/**
 * Block user (admin function)
 */
function blockUser(userId) {
  blockedUsers.add(userId);
  saveBlockedUser(userId, true); // Persist to Firestore
  return { success: true, message: `User ${userId} has been blocked` };
}

/**
 * Unblock user (admin function)
 */
function unblockUser(userId) {
  blockedUsers.delete(userId);
  saveBlockedUser(userId, false); // Persist to Firestore
  return { success: true, message: `User ${userId} has been unblocked` };
}

/**
 * Check if user is blocked
 */
function isBlocked(userId) {
  return blockedUsers.has(userId);
}

/**
 * Get all blocked users
 */
function getBlockedUsers() {
  return Array.from(blockedUsers);
}

// ===================================================================
// PROVIDER TOKEN LIMITS (100k tokens per provider per 12 hours)
// ===================================================================

/**
 * Format time remaining for error message
 */
function formatTimeRemaining(ms) {
  const hours = Math.floor(ms / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes} minutes`;
}

/**
 * Get provider reset time (12 hours from now, aligned to 00:00 or 12:00 UTC)
 */
function getProviderResetTime() {
  const now = new Date();
  const currentHour = now.getUTCHours();
  
  // Align to next 00:00 or 12:00 UTC
  let nextReset;
  if (currentHour < 12) {
    nextReset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0, 0));
  } else {
    nextReset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0));
  }
  
  return nextReset.getTime();
}

/**
 * Check if user has exceeded provider token limit
 * Returns null if OK, or error object if limit exceeded
 */
function checkProviderTokenLimit(userId, provider) {
  // Skip for unlimited users
  if (unlimitedUsers.has(userId)) {
    return null;
  }
  
  const now = Date.now();
  let userProviders = providerTokenUsage.get(userId);
  
  if (!userProviders) {
    return null; // No usage yet
  }
  
  const providerData = userProviders[provider];
  if (!providerData) {
    return null; // No usage for this provider
  }
  
  // Check if reset time has passed
  if (providerData.resetAt < now) {
    delete userProviders[provider];
    return null;
  }
  
  // Check if limit exceeded
  if (providerData.tokens >= PROVIDER_TOKEN_LIMIT) {
    const timeRemaining = providerData.resetAt - now;
    const resetTime = new Date(providerData.resetAt).toISOString();
    
    return {
      error: `Provider limit reached: You've used ${providerData.tokens.toLocaleString()} tokens on ${provider} (limit: ${PROVIDER_TOKEN_LIMIT.toLocaleString()}). Limit resets in ${formatTimeRemaining(timeRemaining)}. Try using a different provider.`,
      code: 'PROVIDER_TOKEN_LIMIT_EXCEEDED',
      provider,
      tokensUsed: providerData.tokens,
      tokenLimit: PROVIDER_TOKEN_LIMIT,
      resetAt: resetTime,
      timeRemaining: formatTimeRemaining(timeRemaining),
    };
  }
  
  return null;
}

/**
 * Track token usage for a provider (call after successful request)
 */
function trackProviderTokens(userId, provider, tokens) {
  // Skip for unlimited users
  if (unlimitedUsers.has(userId)) {
    return;
  }
  
  const now = Date.now();
  let userProviders = providerTokenUsage.get(userId);
  
  if (!userProviders) {
    userProviders = {};
    providerTokenUsage.set(userId, userProviders);
  }
  
  let providerData = userProviders[provider];
  
  // Initialize or reset if expired
  if (!providerData || providerData.resetAt < now) {
    providerData = {
      tokens: 0,
      resetAt: getProviderResetTime(),
    };
    userProviders[provider] = providerData;
  }
  
  // Add tokens
  providerData.tokens += tokens;
}

/**
 * Get user's provider token usage
 */
function getProviderTokenUsage(userId) {
  const userProviders = providerTokenUsage.get(userId);
  if (!userProviders) {
    return {};
  }
  
  const now = Date.now();
  const result = {};
  
  for (const [provider, data] of Object.entries(userProviders)) {
    if (data.resetAt > now) {
      result[provider] = {
        tokensUsed: data.tokens,
        tokenLimit: PROVIDER_TOKEN_LIMIT,
        remaining: Math.max(0, PROVIDER_TOKEN_LIMIT - data.tokens),
        resetAt: new Date(data.resetAt).toISOString(),
        timeRemaining: formatTimeRemaining(data.resetAt - now),
      };
    }
  }
  
  return result;
}

module.exports = { 
  rateLimiter, 
  getUserUsage,
  resetUserLimit,
  grantUnlimited,
  revokeUnlimited,
  isUnlimited,
  getUnlimitedUsers,
  blockUser,
  unblockUser,
  isBlocked,
  getBlockedUsers,
  // Provider token limits
  checkProviderTokenLimit,
  trackProviderTokens,
  getProviderTokenUsage,
  PROVIDER_TOKEN_LIMIT,
};

