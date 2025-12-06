// ===================================================================
// IMAGE HANDLER - Handle images in regular chat sessions
// ===================================================================
//
// Detects image files in uploaded files and formats messages for
// vision-capable models (OpenAI, Claude, Gemini, OpenRouter).
//
// ===================================================================

const path = require('path');
const fs = require('fs');
const { log: appLog } = require('../../utils/logger');

function imageLog(level, fn, message, details = {}) {
  try {
    appLog('IMAGE-HANDLER', level, fn, message, details);
  } catch (error) {
    console.error('[IMAGE-HANDLER]', message, details, error?.message);
  }
}

// Supported image extensions
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];

/**
 * Get MIME type from file extension
 */
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
  };
  return mimeTypes[ext] || 'image/jpeg';
}

/**
 * Check if a file is an image based on extension or type
 */
function isImageFile(file) {
  if (!file) return false;
  
  // Check by isImage flag (set by main.js file handler)
  if (file.isImage === true) {
    console.log('[IMAGE-HANDLER] isImageFile: true (isImage flag)', file.name);
    return true;
  }
  
  // Check by type field
  if (file.type) {
    const typeLower = file.type.toLowerCase();
    if (typeLower.startsWith('image/') || IMAGE_EXTENSIONS.some(ext => ext.slice(1) === typeLower)) {
      console.log('[IMAGE-HANDLER] isImageFile: true (type field)', file.name, file.type);
      return true;
    }
  }
  
  // Check by name extension
  if (file.name) {
    const ext = path.extname(file.name).toLowerCase();
    if (IMAGE_EXTENSIONS.includes(ext)) {
      console.log('[IMAGE-HANDLER] isImageFile: true (extension)', file.name, ext);
      return true;
    }
  }
  
  console.log('[IMAGE-HANDLER] isImageFile: false', file.name, file.type);
  return false;
}

/**
 * Check if model supports vision
 * Most modern models support vision, so we default to true and only exclude known non-vision models
 */
function supportsVision(model, provider) {
  const modelLower = (model || '').toLowerCase();
  const providerLower = (provider || '').toLowerCase();

  // Models that explicitly DON'T support vision
  const nonVisionModels = [
    'gpt-3.5', 'gpt-3', 'text-davinci', 'text-curie', 'text-babbage', 'text-ada',
    'claude-2', 'claude-instant', 'claude-1',
    'llama-2', 'llama2', 'codellama',
    'mistral-7b', 'mixtral-8x7b',
    'glm-3', 'glm-4-flash', 'glm-4-air', 'glm-4-long', // GLM non-vision variants
    'deepseek-coder', 'deepseek-chat',
    'yi-34b', 'yi-6b',
    'phi-2', 'phi-1'
  ];

  // Check if model is in non-vision list
  for (const nonVision of nonVisionModels) {
    if (modelLower.includes(nonVision)) {
      // But check for vision-specific variants
      if (modelLower.includes('vision') || modelLower.includes('-v') || modelLower.includes('4v')) {
        return true;
      }
      return false;
    }
  }

  // Known vision-capable models (explicit support)
  const visionModels = [
    'gpt-4o', 'gpt-4-turbo', 'gpt-4-vision', 'gpt-4v',
    'claude-3', 'claude-sonnet', 'claude-opus', 'claude-haiku',
    'gemini', 'flash', 'pro',
    'glm-4v', 'glm-4-v',
    'qwen-vl', 'qwen2-vl', 'qwen-2-vl',
    'llava', 'pixtral', 'moondream',
    'vision', 'multimodal'
  ];

  for (const vision of visionModels) {
    if (modelLower.includes(vision)) {
      return true;
    }
  }

  // Default: assume modern models support vision
  // Most providers now have vision endpoints
  imageLog(1, 'supportsVision', 'Assuming vision support for model', { model, provider });
  return true;
}

/**
 * Extract images from uploaded files
 * @param {Array} uploadedFiles - Array of uploaded file objects
 * @returns {Array} Array of image file objects with base64 data
 */
function extractImages(uploadedFiles) {
  console.log('[IMAGE-HANDLER] extractImages called', {
    isArray: Array.isArray(uploadedFiles),
    count: uploadedFiles?.length || 0
  });
  
  if (!Array.isArray(uploadedFiles)) return [];
  
  const images = [];
  
  for (const file of uploadedFiles) {
    console.log('[IMAGE-HANDLER] Checking file:', {
      name: file.name,
      type: file.type,
      isImage: file.isImage,
      hasBase64: !!file.base64,
      base64Length: file.base64?.length || 0
    });
    
    if (!isImageFile(file)) continue;
    
    // If file already has base64 content
    if (file.base64) {
      console.log('[IMAGE-HANDLER] Adding image with base64:', file.name);
      images.push({
        name: file.name,
        mimeType: file.mimeType || getMimeType(file.name),
        base64: file.base64,
        size: file.size
      });
      continue;
    }
    
    // If file has a path, read and convert to base64
    if (file.path && fs.existsSync(file.path)) {
      try {
        console.log('[IMAGE-HANDLER] Reading image from path:', file.path);
        const buffer = fs.readFileSync(file.path);
        images.push({
          name: file.name,
          mimeType: getMimeType(file.path),
          base64: buffer.toString('base64'),
          size: buffer.length
        });
      } catch (error) {
        console.log('[IMAGE-HANDLER] Failed to read image:', file.name, error.message);
        imageLog(3, 'extractImages', `Failed to read image: ${file.name}`, { error: error.message });
      }
    }
  }
  
  return images;
}

/**
 * Format message content with images for OpenAI-compatible API
 * @param {string} textContent - The text content of the message
 * @param {Array} images - Array of image objects with base64 data
 * @returns {Array} Content array for OpenAI format
 */
function formatOpenAIContent(textContent, images) {
  const content = [];
  
  // Add text first
  if (textContent) {
    content.push({ type: 'text', text: textContent });
  }
  
  // Add images
  for (const img of images) {
    content.push({
      type: 'image_url',
      image_url: {
        url: `data:${img.mimeType};base64,${img.base64}`
      }
    });
  }
  
  return content;
}

/**
 * Format message content with images for Gemini API
 * @param {string} textContent - The text content of the message
 * @param {Array} images - Array of image objects with base64 data
 * @returns {Array} Parts array for Gemini format
 */
function formatGeminiParts(textContent, images) {
  const parts = [];
  
  // Add text first
  if (textContent) {
    parts.push({ text: textContent });
  }
  
  // Add images as inline data
  for (const img of images) {
    parts.push({
      inlineData: {
        mimeType: img.mimeType,
        data: img.base64
      }
    });
  }
  
  return parts;
}

/**
 * Extract non-image files from uploaded files
 * @param {Array} uploadedFiles - Array of uploaded file objects
 * @returns {Array} Array of non-image file objects
 */
function extractNonImageFiles(uploadedFiles) {
  if (!Array.isArray(uploadedFiles)) return [];
  return uploadedFiles.filter(file => !isImageFile(file) && file.content);
}

/**
 * Build file context string for non-image files
 * @param {Array} files - Array of non-image file objects
 * @returns {string} Context string to prepend to user message
 */
function buildFileContext(files) {
  if (!files || files.length === 0) return '';
  
  let context = '\n\n--- Attached Files ---\n';
  for (const file of files) {
    context += `\n### ${file.name}\n`;
    context += '```\n';
    context += (file.content || '').slice(0, 50000); // Limit per file
    context += '\n```\n';
  }
  return context;
}

/**
 * Process messages to include images for vision-capable models
 * Also handles non-image files by adding them as context
 * @param {Array} messages - Original messages array
 * @param {Array} uploadedFiles - Uploaded files that may contain images
 * @param {string} provider - API provider (openai, gemini, anthropic, openrouter, etc.)
 * @param {string} model - Model name
 * @returns {Object} { messages: processedMessages, hasImages: boolean, imageCount: number, nonImageCount: number }
 */
function processMessagesWithImages(messages, uploadedFiles, provider, model) {
  console.log('[IMAGE-HANDLER] processMessagesWithImages called', {
    provider, model, uploadedFilesCount: uploadedFiles?.length || 0
  });
  
  const images = extractImages(uploadedFiles);
  const nonImageFiles = extractNonImageFiles(uploadedFiles);
  const providerLower = (provider || '').toLowerCase();
  
  console.log('[IMAGE-HANDLER] Extracted', {
    imageCount: images.length,
    nonImageCount: nonImageFiles.length,
    providerLower,
    supportsVision: supportsVision(model, provider)
  });
  
  // Find the last user message
  const processedMessages = [...messages];
  let lastUserIndex = -1;
  
  for (let i = processedMessages.length - 1; i >= 0; i--) {
    if (processedMessages[i].role === 'user') {
      lastUserIndex = i;
      break;
    }
  }
  
  if (lastUserIndex === -1) {
    imageLog(2, 'processMessagesWithImages', 'No user message found');
    return { messages, hasImages: false, imageCount: 0, nonImageCount: 0 };
  }
  
  const lastUserMessage = processedMessages[lastUserIndex];
  let textContent = '';
  
  if (typeof lastUserMessage.content === 'string') {
    textContent = lastUserMessage.content;
  } else if (Array.isArray(lastUserMessage.content)) {
    const textParts = lastUserMessage.content.filter(p => p.type === 'text');
    textContent = textParts.map(p => p.text).join('\n');
  }
  
  // Add non-image file context to text
  if (nonImageFiles.length > 0) {
    textContent += buildFileContext(nonImageFiles);
    imageLog(1, 'processMessagesWithImages', `Added ${nonImageFiles.length} non-image file(s) as context`);
  }
  
  // If no images, just update text content with file context
  if (images.length === 0) {
    if (nonImageFiles.length > 0) {
      processedMessages[lastUserIndex] = {
        role: 'user',
        content: textContent
      };
      return { messages: processedMessages, hasImages: false, imageCount: 0, nonImageCount: nonImageFiles.length };
    }
    return { messages, hasImages: false, imageCount: 0, nonImageCount: 0 };
  }
  
  // Check if model supports vision
  if (!supportsVision(model, provider)) {
    // Add notice to user message so AI knows about the uploaded images
    const imageNames = images.map(img => img.name).join(', ');
    const unsupportedNotice = `\n\n[SYSTEM NOTICE: User uploaded ${images.length} image(s): ${imageNames}. However, the current model "${model}" does not support vision/image analysis. Please inform the user that image analysis is not available with this model and suggest using a vision-capable model like GPT-4o, Claude 3, or Gemini.]`;
    
    textContent += unsupportedNotice;
    processedMessages[lastUserIndex] = { role: 'user', content: textContent };
    
    return { 
      messages: processedMessages, 
      hasImages: false, 
      imageCount: 0, 
      nonImageCount: nonImageFiles.length,
      unsupportedImages: images.length
    };
  }
  
  imageLog(1, 'processMessagesWithImages', 'Processing messages with images', {
    provider, model, imageCount: images.length, nonImageCount: nonImageFiles.length
  });
  
  // Format based on provider
  if (providerLower === 'gemini') {
    processedMessages[lastUserIndex] = {
      ...lastUserMessage,
      content: textContent,
      _images: images
    };
  } else {
    processedMessages[lastUserIndex] = {
      role: 'user',
      content: formatOpenAIContent(textContent, images)
    };
  }
  
  imageLog(1, 'processMessagesWithImages', 'Messages processed', {
    lastUserIndex,
    format: providerLower === 'gemini' ? 'gemini' : 'openai-compatible',
    imageCount: images.length,
    nonImageCount: nonImageFiles.length
  });
  
  return { 
    messages: processedMessages, 
    hasImages: true, 
    imageCount: images.length,
    nonImageCount: nonImageFiles.length
  };
}

/**
 * Process Gemini contents array to include images
 * @param {Array} contents - Gemini contents array
 * @param {Array} images - Array of image objects with base64 data
 * @returns {Array} Processed contents with images
 */
function processGeminiContentsWithImages(contents, images) {
  if (!images || images.length === 0) return contents;
  
  const processedContents = [...contents];
  
  // Find last user content to attach images
  for (let i = processedContents.length - 1; i >= 0; i--) {
    if (processedContents[i].role === 'user') {
      const existingParts = processedContents[i].parts || [];
      const textParts = existingParts.filter(p => p.text);
      const textContent = textParts.map(p => p.text).join('\n');
      
      processedContents[i] = {
        role: 'user',
        parts: formatGeminiParts(textContent, images)
      };
      
      imageLog(1, 'processGeminiContentsWithImages', 'Added images to Gemini content', {
        contentIndex: i,
        imageCount: images.length
      });
      break;
    }
  }
  
  return processedContents;
}

/**
 * Process messages with images using Files API upload
 * Falls back to inline base64 if Files API fails
 * @param {Array} messages - Original messages array
 * @param {Array} uploadedFiles - Uploaded files that may contain images
 * @param {string} provider - API provider
 * @param {string} model - Model name
 * @param {Object} apiConfig - API config { baseUrl, apiKey }
 * @returns {Promise<Object>} { messages: processedMessages, hasImages: boolean, imageCount: number }
 */
async function processMessagesWithFilesAPI(messages, uploadedFiles, provider, model, apiConfig) {
  const images = extractImages(uploadedFiles);
  const nonImageFiles = extractNonImageFiles(uploadedFiles);
  const providerLower = (provider || '').toLowerCase();
  
  // If no images, just process non-image files
  if (images.length === 0) {
    return processMessagesWithImages(messages, uploadedFiles, provider, model);
  }
  
  // If model doesn't support vision, fallback to regular processing (handles non-image files)
  if (!supportsVision(model, provider)) {
    imageLog(2, 'processMessagesWithFilesAPI', 'Model does not support vision, falling back', { model, provider });
    return processMessagesWithImages(messages, uploadedFiles, provider, model);
  }
  
  const { uploadImages, formatOpenAIContentWithFiles } = require('./files-upload');
  
  imageLog(1, 'processMessagesWithFilesAPI', 'Uploading images via Files API', {
    provider, model, imageCount: images.length
  });
  
  // Try to upload images to Files API
  let uploaded = [];
  try {
    uploaded = await uploadImages({
      images,
      provider,
      baseUrl: apiConfig.baseUrl,
      apiKey: apiConfig.apiKey
    });
  } catch (err) {
    imageLog(2, 'processMessagesWithFilesAPI', 'Files API upload failed', { error: err.message });
  }
  
  // If Files API failed, fallback to inline base64
  if (uploaded.length === 0) {
    imageLog(2, 'processMessagesWithFilesAPI', 'No images uploaded, falling back to inline base64');
    return processMessagesWithImages(messages, uploadedFiles, provider, model);
  }
  
  // Find last user message
  const processedMessages = [...messages];
  let lastUserIndex = -1;
  
  for (let i = processedMessages.length - 1; i >= 0; i--) {
    if (processedMessages[i].role === 'user') {
      lastUserIndex = i;
      break;
    }
  }
  
  if (lastUserIndex === -1) {
    return { messages, hasImages: false, imageCount: 0, nonImageCount: 0 };
  }
  
  const lastUserMessage = processedMessages[lastUserIndex];
  let textContent = typeof lastUserMessage.content === 'string' 
    ? lastUserMessage.content 
    : (Array.isArray(lastUserMessage.content) 
        ? lastUserMessage.content.filter(p => p.type === 'text').map(p => p.text).join('\n')
        : '');
  
  // Add non-image file context
  if (nonImageFiles.length > 0) {
    textContent += buildFileContext(nonImageFiles);
  }
  
  if (providerLower === 'gemini' || providerLower === 'google') {
    processedMessages[lastUserIndex] = {
      ...lastUserMessage,
      content: textContent,
      _uploadedFiles: uploaded
    };
  } else {
    processedMessages[lastUserIndex] = {
      role: 'user',
      content: formatOpenAIContentWithFiles(textContent, uploaded)
    };
  }
  
  imageLog(1, 'processMessagesWithFilesAPI', 'Messages processed with Files API', {
    uploadedCount: uploaded.length,
    nonImageCount: nonImageFiles.length
  });
  
  return {
    messages: processedMessages,
    hasImages: true,
    imageCount: uploaded.length,
    nonImageCount: nonImageFiles.length,
    useFilesAPI: true
  };
}

module.exports = {
  isImageFile,
  supportsVision,
  extractImages,
  extractNonImageFiles,
  buildFileContext,
  formatOpenAIContent,
  formatGeminiParts,
  processMessagesWithImages,
  processMessagesWithFilesAPI,
  processGeminiContentsWithImages,
  getMimeType,
  IMAGE_EXTENSIONS
};
