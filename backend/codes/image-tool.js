// ===================================================================
// IMAGE TOOL - Read and analyze images for code agents
// ===================================================================
//
// Provides image analysis capability for OpenAI, Claude, and Gemini agents.
// Reads image from workspace path, converts to base64, sends to vision API.
//
// ===================================================================

const path = require('path');
const fs = require('fs');
const https = require('https');
const { URL } = require('url');
const { log: appLog } = require('../../utils/logger');

function imageLog(level, fn, message, details = {}) {
  try {
    appLog('IMAGE-TOOL', level, fn, message, details);
  } catch (error) {
    console.error('[IMAGE-TOOL]', message, details, error?.message);
  }
}

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
 * Check if model supports vision
 */
function supportsVision(model, provider) {
  const modelLower = (model || '').toLowerCase();
  const providerLower = (provider || '').toLowerCase();

  // OpenAI vision models
  if (providerLower === 'openai' || modelLower.includes('gpt-4')) {
    if (modelLower.includes('gpt-4o') || modelLower.includes('gpt-4-turbo') || modelLower.includes('gpt-4-vision')) {
      return true;
    }
  }

  // Claude vision models (all Claude 3+ support vision)
  if (providerLower === 'anthropic' || modelLower.includes('claude')) {
    if (modelLower.includes('claude-3') || modelLower.includes('claude-3.5')) {
      return true;
    }
  }

  // Gemini vision models
  if (providerLower === 'google' || providerLower === 'gemini' || modelLower.includes('gemini')) {
    if (modelLower.includes('gemini-1.5') || modelLower.includes('gemini-2') || modelLower.includes('vision')) {
      return true;
    }
  }

  // OpenRouter models with vision
  if (modelLower.includes('vision') || modelLower.includes('4o') || modelLower.includes('gemini')) {
    return true;
  }

  return false;
}


/**
 * Call vision API based on provider
 */
async function callVisionAPI({ baseUrl, apiKey, model, provider, imageBase64, mimeType, prompt }) {
  const providerLower = (provider || '').toLowerCase();
  const modelLower = (model || '').toLowerCase();

  // Detect provider from model if not specified
  let detectedProvider = providerLower;
  if (!detectedProvider || detectedProvider === 'openrouter') {
    if (modelLower.includes('claude')) detectedProvider = 'anthropic';
    else if (modelLower.includes('gemini')) detectedProvider = 'google';
    else detectedProvider = 'openai'; // Default to OpenAI format
  }

  imageLog(1, 'callVisionAPI', 'Calling vision API', { provider: detectedProvider, model });

  if (detectedProvider === 'anthropic') {
    return callClaudeVision({ baseUrl, apiKey, model, imageBase64, mimeType, prompt });
  } else if (detectedProvider === 'google') {
    return callGeminiVision({ baseUrl, apiKey, model, imageBase64, mimeType, prompt });
  } else {
    return callOpenAIVision({ baseUrl, apiKey, model, imageBase64, mimeType, prompt });
  }
}

/**
 * OpenAI Vision API call
 */
async function callOpenAIVision({ baseUrl, apiKey, model, imageBase64, mimeType, prompt }) {
  return new Promise((resolve, reject) => {
    const endpoint = new URL((baseUrl || 'https://api.openai.com/v1').replace(/\/?$/, '') + '/chat/completions');

    const body = JSON.stringify({
      model,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } }
        ]
      }],
      max_tokens: 1024
    });

    const options = {
      method: 'POST',
      hostname: endpoint.hostname,
      port: endpoint.port || 443,
      path: endpoint.pathname,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const json = JSON.parse(data);
            resolve(json.choices?.[0]?.message?.content || 'No response from vision API');
          } catch (e) {
            reject(new Error('Failed to parse OpenAI vision response'));
          }
        } else {
          reject(new Error(`OpenAI Vision API error ${res.statusCode}: ${data.slice(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * Claude Vision API call
 */
async function callClaudeVision({ baseUrl, apiKey, model, imageBase64, mimeType, prompt }) {
  return new Promise((resolve, reject) => {
    let normalizedBase = baseUrl || 'https://api.anthropic.com';
    if (!normalizedBase.includes('/v1')) {
      normalizedBase = normalizedBase.replace(/\/?$/, '/v1');
    }
    const endpoint = new URL(normalizedBase.replace(/\/?$/, '') + '/messages');

    const body = JSON.stringify({
      model,
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } }
        ]
      }]
    });

    const options = {
      method: 'POST',
      hostname: endpoint.hostname,
      port: endpoint.port || 443,
      path: endpoint.pathname,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const json = JSON.parse(data);
            const textContent = json.content?.find(c => c.type === 'text');
            resolve(textContent?.text || 'No response from vision API');
          } catch (e) {
            reject(new Error('Failed to parse Claude vision response'));
          }
        } else {
          reject(new Error(`Claude Vision API error ${res.statusCode}: ${data.slice(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * Gemini Vision API call
 */
async function callGeminiVision({ baseUrl, apiKey, model, imageBase64, mimeType, prompt }) {
  return new Promise((resolve, reject) => {
    let normalizedBase = baseUrl || 'https://generativelanguage.googleapis.com';
    if (!normalizedBase.includes('/v1beta')) {
      normalizedBase = normalizedBase.replace(/\/?$/, '/v1beta');
    }
    const endpoint = new URL(`${normalizedBase}/models/${model}:generateContent`);
    endpoint.searchParams.set('key', apiKey);

    const body = JSON.stringify({
      contents: [{
        role: 'user',
        parts: [
          { text: prompt },
          { inlineData: { mimeType, data: imageBase64 } }
        ]
      }]
    });

    const options = {
      method: 'POST',
      hostname: endpoint.hostname,
      port: endpoint.port || 443,
      path: endpoint.pathname + endpoint.search,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const json = JSON.parse(data);
            const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
            resolve(text || 'No response from vision API');
          } catch (e) {
            reject(new Error('Failed to parse Gemini vision response'));
          }
        } else {
          reject(new Error(`Gemini Vision API error ${res.statusCode}: ${data.slice(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ===================================
// MAIN READ IMAGE FUNCTION
// ===================================

/**
 * Read and analyze an image from workspace
 * @param {Object} params
 * @param {string} params.imagePath - Relative path to image in workspace
 * @param {string} params.prompt - What to analyze in the image (optional)
 * @param {string} params.workspacePath - Workspace root path
 * @param {Object} params.apiConfig - API configuration { baseUrl, apiKey, model, provider }
 * @returns {Promise<{success: boolean, output: string}>}
 */
async function readImage({ imagePath, prompt, workspacePath, apiConfig }) {
  const { baseUrl, apiKey, model, provider } = apiConfig;
  
  imageLog(1, 'readImage', 'Starting image analysis', { imagePath, model, provider });
  
  // Validate inputs
  if (!imagePath) {
    return { success: false, output: 'Error: imagePath is required' };
  }
  
  if (!apiKey) {
    return { success: false, output: 'Error: API key not configured' };
  }
  
  // Check if model supports vision
  if (!supportsVision(model, provider)) {
    return { 
      success: false, 
      output: `Error: Model "${model}" does not support vision/image analysis. User uploaded an image but the current model cannot process it. Please use a vision-capable model like GPT-4o, Claude 3, or Gemini 1.5.`
    };
  }
  
  // Resolve full path
  const fullPath = path.isAbsolute(imagePath) 
    ? imagePath 
    : path.join(workspacePath || process.cwd(), imagePath);
  
  // Check if file exists
  if (!fs.existsSync(fullPath)) {
    return { success: false, output: `Error: Image file not found: ${imagePath}` };
  }
  
  // Check file size (max 20MB for most APIs)
  const stats = fs.statSync(fullPath);
  const maxSize = 20 * 1024 * 1024; // 20MB
  if (stats.size > maxSize) {
    return { success: false, output: `Error: Image file too large (${(stats.size / 1024 / 1024).toFixed(2)}MB). Maximum size is 20MB.` };
  }
  
  // Read and convert to base64
  let imageBase64;
  try {
    const imageBuffer = fs.readFileSync(fullPath);
    imageBase64 = imageBuffer.toString('base64');
  } catch (error) {
    return { success: false, output: `Error reading image file: ${error.message}` };
  }
  
  const mimeType = getMimeType(fullPath);
  const analysisPrompt = prompt || 'Describe this image in detail. What do you see?';
  
  imageLog(1, 'readImage', 'Calling vision API', { 
    mimeType, 
    imageSize: stats.size,
    promptLength: analysisPrompt.length 
  });
  
  // Call vision API
  try {
    const result = await callVisionAPI({
      baseUrl,
      apiKey,
      model,
      provider,
      imageBase64,
      mimeType,
      prompt: analysisPrompt
    });
    
    imageLog(1, 'readImage', 'Vision API success', { resultLength: result.length });
    
    return {
      success: true,
      output: `## Image Analysis: ${path.basename(imagePath)}\n\n${result}`
    };
  } catch (error) {
    imageLog(3, 'readImage', 'Vision API error', { error: error.message });
    return {
      success: false,
      output: `Error analyzing image: ${error.message}`
    };
  }
}

// ===================================
// TOOL DEFINITIONS FOR EACH AGENT FORMAT
// ===================================

/**
 * OpenAI format tool definition
 */
const READ_IMAGE_TOOL_OPENAI = {
  type: "function",
  function: {
    name: "read_image",
    description: `Analyze an image from the workspace using vision AI.

USE THIS TOOL WHEN:
- User uploads or references an image file
- You need to understand image content (screenshots, diagrams, UI mockups)
- Analyzing visual elements in code documentation

SUPPORTED FORMATS: .jpg, .jpeg, .png, .gif, .webp, .bmp

EXAMPLE:
  read_image with image_path="screenshot.png" and prompt="What UI elements are shown?"`,
    parameters: {
      type: "object",
      properties: {
        image_path: {
          type: "string",
          description: "Relative path to the image file in workspace"
        },
        prompt: {
          type: "string",
          description: "What to analyze or ask about the image (optional, defaults to general description)"
        },
        commentary: {
          type: "string",
          description: "Brief explanation of why you're analyzing this image"
        }
      },
      required: ["image_path"]
    }
  }
};

/**
 * Claude format tool definition
 */
const READ_IMAGE_TOOL_CLAUDE = {
  name: "read_image",
  description: `Analyze an image from the workspace using vision AI.

USE THIS TOOL WHEN:
- User uploads or references an image file
- You need to understand image content (screenshots, diagrams, UI mockups)
- Analyzing visual elements in code documentation

SUPPORTED FORMATS: .jpg, .jpeg, .png, .gif, .webp, .bmp`,
  input_schema: {
    type: "object",
    properties: {
      image_path: {
        type: "string",
        description: "Relative path to the image file in workspace"
      },
      prompt: {
        type: "string",
        description: "What to analyze or ask about the image (optional)"
      },
      commentary: {
        type: "string",
        description: "Brief explanation of why you're analyzing this image"
      }
    },
    required: ["image_path"]
  }
};

/**
 * Gemini format tool definition
 */
const READ_IMAGE_TOOL_GEMINI = {
  name: "read_image",
  description: `Analyze an image from the workspace using vision AI.

USE THIS TOOL WHEN:
- User uploads or references an image file
- You need to understand image content (screenshots, diagrams, UI mockups)
- Analyzing visual elements in code documentation

SUPPORTED FORMATS: .jpg, .jpeg, .png, .gif, .webp, .bmp`,
  parameters: {
    type: "object",
    properties: {
      image_path: {
        type: "string",
        description: "Relative path to the image file in workspace"
      },
      prompt: {
        type: "string",
        description: "What to analyze or ask about the image (optional)"
      },
      commentary: {
        type: "string",
        description: "Brief explanation of why you're analyzing this image"
      }
    },
    required: ["image_path"]
  }
};

/**
 * Execute read_image tool
 * @param {Object} input - Tool input { image_path, prompt, commentary }
 * @param {Object} context - Execution context { workspacePath, apiConfig }
 * @returns {Promise<{success: boolean, output: string}>}
 */
async function executeReadImage(input, context) {
  const { image_path, prompt } = input;
  const { workspacePath, apiConfig } = context;
  
  return readImage({
    imagePath: image_path,
    prompt,
    workspacePath,
    apiConfig
  });
}

// ===================================
// EXPORTS
// ===================================
module.exports = {
  // Main function
  readImage,
  executeReadImage,
  
  // Tool definitions
  READ_IMAGE_TOOL_OPENAI,
  READ_IMAGE_TOOL_CLAUDE,
  READ_IMAGE_TOOL_GEMINI,
  
  // Utility functions
  supportsVision,
  getMimeType
};
