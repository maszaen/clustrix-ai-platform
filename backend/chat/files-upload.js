// ===================================================================
// FILES UPLOAD - Upload files to provider's Files API
// ===================================================================
//
// Supports uploading files to:
// - OpenAI Files API: POST /v1/files
// - Gemini Files API: POST /upload/v1beta/files
//
// ===================================================================

const https = require('https');
const http = require('http');
const { URL } = require('url');
const { log: appLog } = require('../../utils/logger');

function filesLog(level, fn, message, details = {}) {
  try {
    appLog('FILES-UPLOAD', level, fn, message, details);
  } catch (error) {
    console.error('[FILES-UPLOAD]', message, details, error?.message);
  }
}

/**
 * Upload file to OpenAI Files API
 * @param {Object} params
 * @param {string} params.baseUrl - API base URL
 * @param {string} params.apiKey - API key
 * @param {string} params.fileName - File name
 * @param {Buffer|string} params.fileData - File data (Buffer or base64 string)
 * @param {string} params.mimeType - MIME type
 * @param {string} params.purpose - Purpose (default: 'vision')
 * @returns {Promise<{success: boolean, fileId?: string, error?: string}>}
 */
async function uploadToOpenAI({ baseUrl, apiKey, fileName, fileData, mimeType, purpose = 'vision' }) {
  return new Promise((resolve) => {
    try {
      const endpoint = new URL((baseUrl || 'https://api.openai.com/v1').replace(/\/?$/, '') + '/files');
      
      // Convert base64 to Buffer if needed
      const buffer = typeof fileData === 'string' ? Buffer.from(fileData, 'base64') : fileData;
      
      // Create multipart form data
      const boundary = '----FormBoundary' + Math.random().toString(36).substring(2);
      const parts = [];
      
      // Add purpose field
      parts.push(`--${boundary}\r\n`);
      parts.push('Content-Disposition: form-data; name="purpose"\r\n\r\n');
      parts.push(`${purpose}\r\n`);
      
      // Add file field
      parts.push(`--${boundary}\r\n`);
      parts.push(`Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n`);
      parts.push(`Content-Type: ${mimeType}\r\n\r\n`);
      
      const header = Buffer.from(parts.join(''));
      const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
      const body = Buffer.concat([header, buffer, footer]);

      const options = {
        method: 'POST',
        hostname: endpoint.hostname,
        port: endpoint.port || 443,
        path: endpoint.pathname,
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Authorization': `Bearer ${apiKey}`,
          'Content-Length': body.length
        }
      };

      filesLog(1, 'uploadToOpenAI', 'Uploading file to OpenAI', { fileName, size: buffer.length });

      const protocol = endpoint.protocol === 'https:' ? https : http;
      const req = protocol.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const json = JSON.parse(data);
              filesLog(1, 'uploadToOpenAI', 'File uploaded successfully', { fileId: json.id });
              resolve({ success: true, fileId: json.id, fileInfo: json });
            } catch (e) {
              resolve({ success: false, error: 'Failed to parse response' });
            }
          } else {
            filesLog(3, 'uploadToOpenAI', 'Upload failed', { status: res.statusCode, response: data.slice(0, 200) });
            resolve({ success: false, error: `HTTP ${res.statusCode}: ${data.slice(0, 200)}` });
          }
        });
      });

      req.on('error', (err) => {
        filesLog(3, 'uploadToOpenAI', 'Request error', { error: err.message });
        resolve({ success: false, error: err.message });
      });

      req.write(body);
      req.end();
    } catch (error) {
      filesLog(3, 'uploadToOpenAI', 'Upload error', { error: error.message });
      resolve({ success: false, error: error.message });
    }
  });
}


/**
 * Upload file to Gemini Files API
 * @param {Object} params
 * @param {string} params.baseUrl - API base URL
 * @param {string} params.apiKey - API key
 * @param {string} params.fileName - File name
 * @param {Buffer|string} params.fileData - File data (Buffer or base64 string)
 * @param {string} params.mimeType - MIME type
 * @returns {Promise<{success: boolean, fileUri?: string, error?: string}>}
 */
async function uploadToGemini({ baseUrl, apiKey, fileName, fileData, mimeType }) {
  return new Promise((resolve) => {
    try {
      // Gemini uses a different upload endpoint
      const uploadBase = (baseUrl || 'https://generativelanguage.googleapis.com').replace(/\/v1beta.*$/, '');
      const endpoint = new URL(`${uploadBase}/upload/v1beta/files`);
      endpoint.searchParams.set('key', apiKey);
      
      // Convert base64 to Buffer if needed
      const buffer = typeof fileData === 'string' ? Buffer.from(fileData, 'base64') : fileData;
      
      // Gemini expects JSON metadata + raw file data
      const metadata = JSON.stringify({
        file: {
          displayName: fileName,
          mimeType: mimeType
        }
      });

      const options = {
        method: 'POST',
        hostname: endpoint.hostname,
        port: endpoint.port || 443,
        path: endpoint.pathname + endpoint.search,
        headers: {
          'Content-Type': mimeType,
          'X-Goog-Upload-Protocol': 'raw',
          'X-Goog-Upload-Command': 'upload, finalize',
          'Content-Length': buffer.length
        }
      };

      filesLog(1, 'uploadToGemini', 'Uploading file to Gemini', { fileName, size: buffer.length });

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const json = JSON.parse(data);
              const fileUri = json.file?.uri || json.uri;
              filesLog(1, 'uploadToGemini', 'File uploaded successfully', { fileUri });
              resolve({ success: true, fileUri, fileInfo: json });
            } catch (e) {
              resolve({ success: false, error: 'Failed to parse response' });
            }
          } else {
            filesLog(3, 'uploadToGemini', 'Upload failed', { status: res.statusCode, response: data.slice(0, 200) });
            resolve({ success: false, error: `HTTP ${res.statusCode}: ${data.slice(0, 200)}` });
          }
        });
      });

      req.on('error', (err) => {
        filesLog(3, 'uploadToGemini', 'Request error', { error: err.message });
        resolve({ success: false, error: err.message });
      });

      req.write(buffer);
      req.end();
    } catch (error) {
      filesLog(3, 'uploadToGemini', 'Upload error', { error: error.message });
      resolve({ success: false, error: error.message });
    }
  });
}

/**
 * Upload file to appropriate provider's Files API
 * @param {Object} params
 * @param {string} params.provider - Provider name
 * @param {string} params.baseUrl - API base URL
 * @param {string} params.apiKey - API key
 * @param {string} params.fileName - File name
 * @param {Buffer|string} params.fileData - File data
 * @param {string} params.mimeType - MIME type
 * @returns {Promise<{success: boolean, fileId?: string, fileUri?: string, error?: string}>}
 */
async function uploadFile({ provider, baseUrl, apiKey, fileName, fileData, mimeType }) {
  const providerLower = (provider || '').toLowerCase();
  
  if (providerLower === 'gemini' || providerLower === 'google') {
    return uploadToGemini({ baseUrl, apiKey, fileName, fileData, mimeType });
  }
  
  // Default to OpenAI-compatible (works for OpenAI, OpenRouter)
  return uploadToOpenAI({ baseUrl, apiKey, fileName, fileData, mimeType });
}

/**
 * Upload multiple images and return formatted content for API
 * @param {Object} params
 * @param {Array} params.images - Array of image objects with base64, mimeType, name
 * @param {string} params.provider - Provider name
 * @param {string} params.baseUrl - API base URL
 * @param {string} params.apiKey - API key
 * @returns {Promise<Array>} Array of uploaded file references
 */
async function uploadImages({ images, provider, baseUrl, apiKey }) {
  const results = [];
  
  for (const img of images) {
    const result = await uploadFile({
      provider,
      baseUrl,
      apiKey,
      fileName: img.name,
      fileData: img.base64,
      mimeType: img.mimeType
    });
    
    if (result.success) {
      results.push({
        name: img.name,
        fileId: result.fileId,
        fileUri: result.fileUri,
        mimeType: img.mimeType
      });
    } else {
      filesLog(2, 'uploadImages', `Failed to upload ${img.name}`, { error: result.error });
    }
  }
  
  return results;
}

/**
 * Format uploaded files for OpenAI chat completion
 * @param {string} textContent - Text content
 * @param {Array} uploadedFiles - Array of uploaded file objects with fileId
 * @returns {Array} Content array for OpenAI format
 */
function formatOpenAIContentWithFiles(textContent, uploadedFiles) {
  const content = [];
  
  if (textContent) {
    content.push({ type: 'text', text: textContent });
  }
  
  for (const file of uploadedFiles) {
    if (file.fileId) {
      content.push({
        type: 'image_file',
        image_file: { file_id: file.fileId }
      });
    }
  }
  
  return content;
}

/**
 * Format uploaded files for Gemini chat
 * @param {string} textContent - Text content
 * @param {Array} uploadedFiles - Array of uploaded file objects with fileUri
 * @returns {Array} Parts array for Gemini format
 */
function formatGeminiPartsWithFiles(textContent, uploadedFiles) {
  const parts = [];
  
  if (textContent) {
    parts.push({ text: textContent });
  }
  
  for (const file of uploadedFiles) {
    if (file.fileUri) {
      parts.push({
        fileData: {
          mimeType: file.mimeType,
          fileUri: file.fileUri
        }
      });
    }
  }
  
  return parts;
}

module.exports = {
  uploadToOpenAI,
  uploadToGemini,
  uploadFile,
  uploadImages,
  formatOpenAIContentWithFiles,
  formatGeminiPartsWithFiles
};
