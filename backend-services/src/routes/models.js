/**
 * Models API Route
 * 
 * Returns available models for Clustrix Cloud
 */

const express = require('express');
const router = express.Router();
const { getAvailableModels, getAvailableProviders } = require('../config/models');

/**
 * GET /api/models
 * 
 * Returns list of available models (no auth required)
 */
router.get('/', (req, res) => {
  const models = getAvailableModels();
  const providers = getAvailableProviders();
  
  res.json({
    models,
    providers,
    count: models.length,
  });
});

module.exports = router;
