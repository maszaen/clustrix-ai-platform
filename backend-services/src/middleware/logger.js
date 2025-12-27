/**
 * Request Logger Middleware
 * 
 * Logs all requests for debugging and analytics
 */

const fs = require('fs');
const path = require('path');

// Lazy import analytics to avoid circular deps
let updateOnlineStatus = null;
function getAnalytics() {
  if (!updateOnlineStatus) {
    try {
      const analytics = require('../services/analytics');
      updateOnlineStatus = analytics.updateOnlineStatus;
    } catch (e) {
      updateOnlineStatus = () => {}; // noop if not available
    }
  }
  return { updateOnlineStatus };
}

// Logs storage (in-memory for now, can be replaced with DB)
const requestLogs = [];
const MAX_LOGS = 10000; // Keep last 10k logs in memory

/**
 * Log request middleware
 */
function requestLogger(req, res, next) {
  const startTime = Date.now();
  
  // Capture response
  const originalSend = res.send;
  res.send = function(body) {
    const duration = Date.now() - startTime;
    
    // Extract device name (Header or UserAgent)
    let device = req.headers['x-device-name'];
    if (!device) {
      const ua = req.headers['user-agent'] || '';
      if (ua.includes('Postman')) device = 'Postman';
      else if (ua.includes('okhttp')) device = 'Android App'; // Default for React Native
      else if (ua.includes('CFNetwork')) device = 'iOS App';
      else if (ua.includes('Chrome')) device = 'Chrome (Web)';
      else if (ua.includes('Firefox')) device = 'Firefox (Web)';
      else if (ua.includes('Safari')) device = 'Safari (Web)';
      else device = 'Unknown Device';
    }

    const log = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      userId: req.user?.uid || null,
      userEmail: req.user?.email || null,
      device: device, // Added device field
      statusCode: res.statusCode,
      duration,
      ip: req.ip || req.headers['x-forwarded-for'] || 'unknown',
      userAgent: req.headers['user-agent']?.substring(0, 100) || 'unknown',
      // Don't log request body for security
      bodySize: JSON.stringify(req.body || {}).length,
    };
    
    // Update online status for authenticated users
    if (req.user?.uid) {
      const { updateOnlineStatus } = getAnalytics();
      updateOnlineStatus(req.user.uid, req.user.email, device);
    }
    
    // Use originalUrl to capture full path including query params
    const fullPath = req.originalUrl || req.url;
    
    // Filter out polling noise only (logs and stats)
    // Allows GET /admin (dashboard view) to still be logged
    const isNoise = fullPath.includes('/logs') || 
                    fullPath.includes('/stats') || 
                    fullPath.includes('/analytics') ||
                    fullPath.includes('favicon.ico');

    if (!isNoise) {
      // Add to logs
      requestLogs.push(log);
      
      // Trim old logs
      if (requestLogs.length > MAX_LOGS) {
        requestLogs.splice(0, requestLogs.length - MAX_LOGS);
      }
      
      // Console log
      console.log(`[${log.timestamp}] ${log.device} | ${log.userEmail || 'Anon'} | ${log.method} ${fullPath.split('?')[0]} - ${log.statusCode} (${log.duration}ms)`);
    }
    
    return originalSend.call(this, body);
  };
  
  next();
}

/**
 * Get recent logs (for admin panel)
 */
function getLogs(limit = 100, offset = 0) {
  const sorted = [...requestLogs].reverse(); // Newest first
  return {
    logs: sorted.slice(offset, offset + limit),
    total: requestLogs.length,
  };
}

/**
 * Get user-specific logs
 */
function getUserLogs(userId, limit = 50) {
  return requestLogs
    .filter(log => log.userId === userId)
    .reverse()
    .slice(0, limit);
}

module.exports = { requestLogger, getLogs, getUserLogs };
