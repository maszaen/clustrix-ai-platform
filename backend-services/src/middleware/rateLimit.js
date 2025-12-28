/**
 * Rate Limiter Middleware
 * 
 * In-memory rate limiting per user (by Google UID)
 * 
 * PRODUCTION NOTE: For high-traffic production with multiple server instances,
 * replace this with Redis-based rate limiting (e.g., ioredis + rate-limiter-flexible)
 * to ensure consistent rate limiting across all instances.
 */

// In-memory store: { [userId]: { count: number, resetAt: timestamp, lastRequest: timestamp } }
const userLimits = new Map();

// Unlimited users (admin granted)
const unlimitedUsers = new Set();

// Burst protection: max requests per minute
const BURST_LIMIT = 10;
const BURST_WINDOW_MS = 60 * 1000; // 1 minute

// Clean up old entries every hour
setInterval(() => {
  const now = Date.now();
  for (const [userId, data] of userLimits) {
    if (data.resetAt < now) {
      userLimits.delete(userId);
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
  const isUnlimited = unlimitedUsers.has(userId);
  
  return {
    used: userData?.count || 0,
    limit: isUnlimited ? 'unlimited' : maxRequests,
    remaining: isUnlimited ? 'unlimited' : maxRequests - (userData?.count || 0),
    resetAt: userData?.resetAt ? new Date(userData.resetAt).toISOString() : null,
    isUnlimited,
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
  return { success: true, message: `Unlimited access granted to ${userId}` };
}

/**
 * Revoke unlimited access from user (admin function)
 */
function revokeUnlimited(userId) {
  unlimitedUsers.delete(userId);
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

module.exports = { 
  rateLimiter, 
  getUserUsage,
  resetUserLimit,
  grantUnlimited,
  revokeUnlimited,
  isUnlimited,
  getUnlimitedUsers,
};
