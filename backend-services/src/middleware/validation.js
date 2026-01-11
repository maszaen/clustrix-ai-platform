/**
 * Input Validation Middleware
 * 
 * Sanitizes and validates user input to prevent injection attacks
 */

const crypto = require('crypto');

// Maximum message sizes
const MAX_MESSAGE_LENGTH = 100000; // 100k chars per text message
const MAX_MESSAGES_COUNT = 100; // Max messages in conversation
const MAX_PROMPT_LENGTH = 10000; // Max image prompt length
const MAX_IMAGE_SIZE = 20 * 1024 * 1024; // 20MB per image (base64)

/**
 * Extract admin secret from headers (no query params for safety)
 */
function extractAdminSecret(req) {
  const headerSecret = req.headers['x-admin-secret'];
  if (headerSecret) return String(headerSecret);

  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Basic ')) return null;

  try {
    const decoded = Buffer.from(auth.split('Basic ')[1], 'base64').toString('utf-8');
    const [, password] = decoded.split(':');
    return password ? String(password) : null;
  } catch (err) {
    return null;
  }
}

/**
 * Timing-safe comparison for secrets
 */
function timingSafeEqual(provided, valid) {
  try {
    const providedBuffer = Buffer.from(String(provided));
    const validBuffer = Buffer.from(String(valid));
    if (providedBuffer.length !== validBuffer.length) return false;
    return crypto.timingSafeEqual(providedBuffer, validBuffer);
  } catch (err) {
    return false;
  }
}

/**
 * Calculate content length excluding image data
 * For multimodal messages, only count text content
 */
function getTextContentLength(content) {
  if (typeof content === 'string') {
    return content.length;
  }
  
  if (Array.isArray(content)) {
    // Multimodal content - only count text parts, skip image_url
    let textLength = 0;
    for (const part of content) {
      if (part.type === 'text' && part.text) {
        textLength += part.text.length;
      }
      // Skip image_url parts - they have separate size limits
    }
    return textLength;
  }
  
  return 0;
}

/**
 * Validate image parts in multimodal content
 */
function validateImageParts(content, messageIndex) {
  if (!Array.isArray(content)) return null;
  
  for (const part of content) {
    if (part.type === 'image_url' && part.image_url?.url) {
      const url = part.image_url.url;
      // Check if it's base64 data URL
      if (url.startsWith('data:')) {
        // Extract base64 part after comma
        const base64Part = url.split(',')[1] || '';
        if (base64Part.length > MAX_IMAGE_SIZE) {
          return {
            error: `Image in message ${messageIndex} exceeds maximum size of 20MB`,
            code: 'IMAGE_TOO_LARGE',
          };
        }
      }
    }
  }
  return null;
}

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
    
    // Check text content length (excluding images)
    const contentLength = getTextContentLength(msg.content);
      
    if (contentLength > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({
        error: `Message ${i} text exceeds maximum length of ${MAX_MESSAGE_LENGTH}`,
        code: 'MESSAGE_TOO_LONG',
      });
    }
    
    // Validate image parts separately
    const imageError = validateImageParts(msg.content, i);
    if (imageError) {
      return res.status(400).json(imageError);
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
  const validSecret = process.env.ADMIN_SECRET;
  if (!validSecret || validSecret === 'your-super-secret-admin-key-change-this') {
    return res.status(500).json({
      error: 'Admin secret not configured properly',
      code: 'ADMIN_NOT_CONFIGURED',
    });
  }

  const secret = extractAdminSecret(req);
  if (!secret) {
    return res.status(403).json({
      error: 'Admin secret required',
      code: 'FORBIDDEN',
    });
  }

  if (!timingSafeEqual(secret, validSecret)) {
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
  extractAdminSecret,
  sanitizeString,
  MAX_MESSAGE_LENGTH,
  MAX_MESSAGES_COUNT,
  MAX_PROMPT_LENGTH,
};
