/**
 * Rate Limiter Middleware
 * 
 * Simple in-memory rate limiting per user (by Google UID)
 * For production, consider using Redis
 */

// In-memory store: { [userId]: { count: number, resetAt: timestamp } }
const userLimits = new Map();

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
 * Rate limiter per user per day
 */
function rateLimiter(req, res, next) {
  const userId = req.user?.uid;
  if (!userId) {
    return res.status(401).json({ error: 'User not authenticated', code: 'AUTH_REQUIRED' });
  }
  
  const now = Date.now();
  const resetTime = getEndOfDay();
  
  // Get or create user limit data
  let userData = userLimits.get(userId);
  if (!userData || userData.resetAt < now) {
    userData = { count: 0, resetAt: resetTime };
    userLimits.set(userId, userData);
  }
  
  // Check limit
  const maxRequests = parseInt(process.env.RATE_LIMIT_FREE) || 50;
  
  if (userData.count >= maxRequests) {
    const resetIn = Math.ceil((userData.resetAt - now) / 1000 / 60); // minutes
    return res.status(429).json({
      error: `Rate limit exceeded. Resets in ${resetIn} minutes.`,
      code: 'RATE_LIMIT_EXCEEDED',
      limit: maxRequests,
      resetAt: new Date(userData.resetAt).toISOString(),
    });
  }
  
  // Increment count
  userData.count++;
  
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
  
  return {
    used: userData?.count || 0,
    limit: maxRequests,
    remaining: maxRequests - (userData?.count || 0),
    resetAt: userData?.resetAt ? new Date(userData.resetAt).toISOString() : null,
  };
}

module.exports = { rateLimiter, getUserUsage };
