/**
 * Input Validation Middleware
 * 
 * Sanitizes and validates user input to prevent injection attacks
 */

// Maximum message sizes
const MAX_MESSAGE_LENGTH = 100000; // 100k chars per message
const MAX_MESSAGES_COUNT = 100; // Max messages in conversation
const MAX_PROMPT_LENGTH = 10000; // Max image prompt length

/**
 * Validate chat request body
 */
function validateChatRequest(req, res, next) {
  const { model, messages } = req.body;
  
  // Validate model
  if (!model || typeof model !== 'string') {
    return res.status(400).json({
      error: 'Model is required and must be a string',
      code: 'INVALID_MODEL',
    });
  }
  
  // Sanitize model name (alphanumeric, dash, underscore, dot, colon, slash only)
  if (!/^[\w\-.:\/]+$/.test(model)) {
    return res.status(400).json({
      error: 'Invalid model name format',
      code: 'INVALID_MODEL_FORMAT',
    });
  }
  
  // Validate messages array
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({
      error: 'Messages must be an array',
      code: 'INVALID_MESSAGES',
    });
  }
  
  if (messages.length > MAX_MESSAGES_COUNT) {
    return res.status(400).json({
      error: `Too many messages. Maximum is ${MAX_MESSAGES_COUNT}`,
      code: 'TOO_MANY_MESSAGES',
    });
  }
  
  // Validate each message
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    
    if (!msg || typeof msg !== 'object') {
      return res.status(400).json({
        error: `Message ${i} is invalid`,
        code: 'INVALID_MESSAGE',
      });
    }
    
    if (!['system', 'user', 'assistant', 'tool'].includes(msg.role)) {
      return res.status(400).json({
        error: `Message ${i} has invalid role`,
        code: 'INVALID_ROLE',
      });
    }
    
    // Check content length
    const contentLength = typeof msg.content === 'string' 
      ? msg.content.length 
      : JSON.stringify(msg.content || '').length;
      
    if (contentLength > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({
        error: `Message ${i} exceeds maximum length of ${MAX_MESSAGE_LENGTH}`,
        code: 'MESSAGE_TOO_LONG',
      });
    }
  }
  
  next();
}

/**
 * Validate image generation request
 */
function validateImageGenRequest(req, res, next) {
  const { imageModel } = req.body;
  
  // Optional imageModel validation
  if (imageModel && typeof imageModel !== 'string') {
    return res.status(400).json({
      error: 'imageModel must be a string',
      code: 'INVALID_IMAGE_MODEL',
    });
  }
  
  // Continue with chat validation
  validateChatRequest(req, res, next);
}

/**
 * Sanitize string to prevent XSS/injection
 */
function sanitizeString(str) {
  if (typeof str !== 'string') return str;
  // Remove null bytes and control characters (except newlines, tabs)
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

/**
 * Validate admin secret
 */
function validateAdminSecret(req, res, next) {
  const secret = req.headers['x-admin-secret'] || req.query.secret;
  const validSecret = process.env.ADMIN_SECRET;
  
  if (!validSecret || validSecret === 'your-super-secret-admin-key-change-this') {
    return res.status(500).json({
      error: 'Admin secret not configured properly',
      code: 'ADMIN_NOT_CONFIGURED',
    });
  }
  
  if (!secret || secret !== validSecret) {
    return res.status(403).json({
      error: 'Invalid admin secret',
      code: 'FORBIDDEN',
    });
  }
  
  next();
}

module.exports = {
  validateChatRequest,
  validateImageGenRequest,
  validateAdminSecret,
  sanitizeString,
  MAX_MESSAGE_LENGTH,
  MAX_MESSAGES_COUNT,
  MAX_PROMPT_LENGTH,
};
