/**
 * Request Logger Middleware
 * 
 * Logs all requests for debugging and analytics
 */

const fs = require('fs');
const path = require('path');

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
    
    const log = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      userId: req.user?.uid || null,
      userEmail: req.user?.email || null,
      statusCode: res.statusCode,
      duration,
      ip: req.ip || req.headers['x-forwarded-for'] || 'unknown',
      userAgent: req.headers['user-agent']?.substring(0, 100) || 'unknown',
      // Don't log request body for security
      bodySize: JSON.stringify(req.body || {}).length,
    };
    
    // Add to logs
    requestLogs.push(log);
    
    // Trim old logs
    if (requestLogs.length > MAX_LOGS) {
      requestLogs.splice(0, requestLogs.length - MAX_LOGS);
    }
    
    // Console log
    console.log(`[${log.timestamp}] ${log.method} ${log.path} - ${log.statusCode} (${log.duration}ms) - User: ${log.userEmail || 'anonymous'}`);
    
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
