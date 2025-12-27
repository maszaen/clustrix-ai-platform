/**
 * Clustrix Backend Services
 * 
 * Main entry point - Express server for AI API proxy
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const { verifyGoogleToken } = require('./middleware/auth');
const { rateLimiter } = require('./middleware/rateLimit');
const { requestLogger } = require('./middleware/logger');

const chatRouter = require('./routes/chat');
const modelsRouter = require('./routes/models');
const userRouter = require('./routes/user');
const adminRouter = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 8080;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Allow inline scripts for Admin Panel
}));
app.use(cors({
  origin: '*', // Allow all origins (mobile app)
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '10mb' })); // For large PDF/image payloads

// Request logging
app.use(requestLogger);

// Health check (for GCP)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Protected routes (require Google auth)
app.use('/api/models', verifyGoogleToken, modelsRouter);
app.use('/api/chat', verifyGoogleToken, rateLimiter, chatRouter);
app.use('/api/user', verifyGoogleToken, userRouter);

// Admin routes (require admin secret)
app.use('/admin', adminRouter);

// Error handler
app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    code: err.code || 'INTERNAL_ERROR',
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Clustrix Backend running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
});
