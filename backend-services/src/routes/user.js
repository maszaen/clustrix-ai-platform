/**
 * User API Route
 * 
 * User-specific endpoints (usage stats, etc)
 */

const express = require('express');
const router = express.Router();
const { getUserUsage } = require('../middleware/rateLimit');
const { getUserLogs } = require('../middleware/logger');

/**
 * GET /api/user/usage
 * 
 * Get current user's usage stats
 */
router.get('/usage', (req, res) => {
  const usage = getUserUsage(req.user.uid);
  
  res.json({
    user: {
      id: req.user.uid,
      email: req.user.email,
      name: req.user.name,
    },
    usage,
  });
});

/**
 * GET /api/user/history
 * 
 * Get user's recent request history
 */
router.get('/history', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const logs = getUserLogs(req.user.uid, limit);
  
  res.json({
    logs,
    count: logs.length,
  });
});

module.exports = router;
