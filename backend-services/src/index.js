/**
 * Clustrix Backend Services
 * 
 * Main entry point - Express server for AI API proxy
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

const { verifyGoogleToken } = require('./middleware/auth');
const { rateLimiter } = require('./middleware/rateLimit');
const { requestLogger } = require('./middleware/logger');
const { validateChatRequest, validateImageGenRequest } = require('./middleware/validation');

const chatRouter = require('./routes/chat');
const modelsRouter = require('./routes/models');
const userRouter = require('./routes/user');
const adminRouter = require('./routes/admin');
const agenticRouter = require('./routes/agentic');
const imageGenRouter = require('./routes/imageGen');
const sandboxRouter = require('./routes/sandbox');

const app = express();
const PORT = process.env.PORT || 8080;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Allow inline scripts for Admin Panel
}));
app.use(cors({
  origin: '*', // Allow all origins (mobile app)
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Device-Name', 'X-User-Email'],
}));
app.use(express.json({ limit: '10mb' })); // For large PDF/image payloads

// Serve static files from public folder
app.use('/public', express.static(path.join(__dirname, '../public')));

// Request logging
app.use(requestLogger);

// Health check (for GCP)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// New admin console (sidebar version) - requires admin secret via query param
app.get('/console', (req, res) => {
  const secret = req.query.secret;
  const validSecret = process.env.ADMIN_SECRET;
  
  if (!secret || secret !== validSecret) {
    return res.status(403).send('Access denied. Append ?secret=YOUR_ADMIN_SECRET to the URL.');
  }
  
  res.sendFile(path.join(__dirname, '../public/admin.html'));
});

// Protected routes (require Google auth + validation)
app.use('/api/models', verifyGoogleToken, modelsRouter);
app.use('/api/chat', verifyGoogleToken, rateLimiter, validateChatRequest, chatRouter);
app.use('/api/agentic', verifyGoogleToken, rateLimiter, validateChatRequest, agenticRouter);
app.use('/api/image-gen', verifyGoogleToken, rateLimiter, validateImageGenRequest, imageGenRouter);
app.use('/api/user', verifyGoogleToken, userRouter);
app.use('/api/sandbox', verifyGoogleToken, rateLimiter, sandboxRouter);

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
