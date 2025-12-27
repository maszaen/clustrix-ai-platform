/**
 * Clustrix Cloud Service
 * 
 * Handles communication with Clustrix backend for cloud mode
 */

// Backend URL - change this after deployment
// For local testing: http://10.0.2.2:8080 (Android emulator) or http://localhost:8080 (web)
// For real device on same network: http://YOUR_PC_IP:8080
export const BACKEND_URL = 'http://192.168.100.18:8080'; // PC IP for real device

import { Platform } from 'react-native';
import * as Device from 'expo-device';
import { getValidAccessToken } from './auth';

// Helper to get device name
function getDeviceName() {
  const model = Device.modelName || Device.designName || 'Unknown Device';
  return `${model} (${Platform.OS})`;
}

// Helper to get fresh token (auto-refreshes if needed)
async function getFreshToken(fallbackToken) {
  // Try to get a fresh token via auto-refresh
  const freshToken = await getValidAccessToken();
  if (freshToken) {
    return freshToken;
  }
  // Fallback to passed token (might be expired but worth a try)
  return fallbackToken;
}

/**
 * Get available models from Clustrix Cloud
 */
export async function getCloudModels(idToken, userEmail) {
  try {
    const headers = {
      'X-Device-Name': getDeviceName(),
    };
    if (idToken) headers['Authorization'] = `Bearer ${idToken}`;
    if (userEmail) headers['X-User-Email'] = userEmail;

    const response = await fetch(`${BACKEND_URL}/api/models`, { headers });
    if (!response.ok) {
      throw new Error('Failed to fetch cloud models');
    }
    const data = await response.json();
    return {
      success: true,
      models: data.models || [],
      providers: data.providers || [],
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      models: [],
      providers: [],
    };
  }
}

/**
 * Get user usage stats
 */
export async function getCloudUsage(idToken, userEmail) {
  try {
    const headers = {
      'Authorization': `Bearer ${idToken}`,
      'X-Device-Name': getDeviceName(),
    };
    if (userEmail) headers['X-User-Email'] = userEmail;

    const response = await fetch(`${BACKEND_URL}/api/user/usage`, {
      headers,
    });
    if (!response.ok) {
      throw new Error('Failed to fetch usage');
    }
    return await response.json();
  } catch (error) {
    console.error('[ClustrixCloud] Error fetching usage:', error);
    return null;
  }
}

/**
 * Stream chat through Clustrix Cloud
 * 
 * @param {Object} options
 * @param {string} options.idToken - Google ID token for auth
 * @param {string} options.model - Model ID
 * @param {Array} options.messages - Chat messages
 * @param {AbortSignal} options.signal - Abort signal
 * @param {Function} options.onChunk - Callback for each text chunk
 * @param {Function} options.onDone - Callback when streaming completes
 * @param {Function} options.onError - Callback for errors
 */
export async function streamCloudChat({
  idToken,
  model,
  messages,
  signal,
  onChunk,
  onDone,
  onError,
  temperature,
  max_tokens,
  userEmail,
}) {
  // Get fresh token (auto-refreshes if expired)
  const token = await getFreshToken(idToken);
  
  if (!token) {
    onError?.('Authentication required. Please sign in with Google.');
    return;
  }
  
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    
    if (signal) {
      if (signal.aborted) return resolve();
      signal.addEventListener('abort', () => {
        xhr.abort();
        resolve();
      });
    }

    xhr.open('POST', `${BACKEND_URL}/api/chat`);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('X-Device-Name', getDeviceName());
    if (userEmail) xhr.setRequestHeader('X-User-Email', userEmail);

    let buffer = '';
    let lastIndex = 0;

    xhr.onprogress = () => {
      const newData = xhr.responseText.slice(lastIndex);
      lastIndex = xhr.responseText.length;
      buffer += newData;
      
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6);
        if (data === '[DONE]') continue;
        
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            onChunk?.(content);
          }
        } catch (e) {
          // ignore
        }
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 400) {
        let msg = `Request failed (${xhr.status})`;
        try {
            const errJson = JSON.parse(xhr.responseText);
            msg = errJson.error || errJson.message || msg;
        } catch {}
        onError?.(msg);
      } else {
        onDone?.();
      }
      resolve();
    };

    xhr.onerror = () => {
      onError?.('Network error');
      resolve();
    };

    xhr.send(JSON.stringify({
      model,
      messages,
      stream: true,
      temperature,
      max_tokens,
    }));
  });
}

/**
 * Get backend URL (for configuration)
 */
export function getBackendUrl() {
  return BACKEND_URL;
}

/**
 * Set backend URL (for testing/configuration)
 */
export function setBackendUrl(url) {
  // This is a placeholder - in real app, store in settings
  console.log('[ClustrixCloud] Backend URL would be set to:', url);
}

/**
 * Stream agentic chat (web search) through Clustrix Cloud
 */
export async function streamCloudAgentic({
  idToken,
  model,
  messages,
  signal,
  onChunk,
  onToolCall,
  onToolResult,
  onDone,
  onError,
  temperature,
  max_tokens,
  userEmail,
}) {
  // Get fresh token (auto-refreshes if expired)
  const token = await getFreshToken(idToken);
  
  if (!token) {
    onError?.('Authentication required. Please sign in with Google.');
    return;
  }
  
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    
    if (signal) {
      if (signal.aborted) return resolve();
      signal.addEventListener('abort', () => {
        xhr.abort();
        resolve();
      });
    }

    xhr.open('POST', `${BACKEND_URL}/api/agentic`);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('X-Device-Name', getDeviceName());
    if (userEmail) xhr.setRequestHeader('X-User-Email', userEmail);

    let buffer = '';
    let lastIndex = 0;

    xhr.onprogress = () => {
      const newData = xhr.responseText.slice(lastIndex);
      lastIndex = xhr.responseText.length;
      buffer += newData;
      
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6);
        if (data === '[DONE]') continue;
        
        try {
          const parsed = JSON.parse(data);
          
          // Handle tool result (triggers waiting for iteration loader)
          if (parsed.tool_result) {
            onToolResult?.({
              id: parsed.tool_result.id,
              name: parsed.tool_result.name,
              success: parsed.tool_result.success,
            });
            continue;
          }
          
          // Handle content chunk (command-input/command-output tags are now inside content)
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            onChunk?.(content);
          }
        } catch (e) {
          // ignore
        }
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 400) {
        let msg = `Request failed (${xhr.status})`;
        try {
            const errJson = JSON.parse(xhr.responseText);
            msg = errJson.error || errJson.message || msg;
        } catch {}
        onError?.(msg);
      } else {
        onDone?.();
      }
      resolve();
    };

    xhr.onerror = () => {
      onError?.('Network error');
      resolve();
    };

    xhr.send(JSON.stringify({
      model,
      messages,
      stream: true,
      temperature,
      max_tokens,
    }));
  });
}

/**
 * Stream image gen chat through Clustrix Cloud
 */
export async function streamCloudImageGen({
  idToken,
  model,
  messages,
  imageModel,
  signal,
  onChunk,
  onToolCall,
  onToolResult,
  onDone,
  onError,
  temperature,
  max_tokens,
  userEmail,
}) {
  // Get fresh token (auto-refreshes if expired)
  const token = await getFreshToken(idToken);
  
  if (!token) {
    onError?.('Authentication required. Please sign in with Google.');
    return;
  }
  
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    
    if (signal) {
      if (signal.aborted) return resolve();
      signal.addEventListener('abort', () => {
        xhr.abort();
        resolve();
      });
    }

    xhr.open('POST', `${BACKEND_URL}/api/image-gen`);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('X-Device-Name', getDeviceName());
    if (userEmail) xhr.setRequestHeader('X-User-Email', userEmail);

    let buffer = '';
    let lastIndex = 0;

    xhr.onprogress = () => {
      const newData = xhr.responseText.slice(lastIndex);
      lastIndex = xhr.responseText.length;
      buffer += newData;
      
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6);
        if (data === '[DONE]') continue;
        
        try {
          const parsed = JSON.parse(data);
          
          // Handle image result separately (not stored in message content)
          if (parsed.image_result) {
            onToolResult?.({
              name: 'generate_image',
              success: true,
              data: {
                imageUrl: parsed.image_result.imageUrl,
                imageBase64: parsed.image_result.imageBase64,
                prompt: parsed.image_result.prompt,
                style: parsed.image_result.style,
              },
            });
            continue;
          }
          
          // Handle content chunk (command-input/command-output tags are now inside content)
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            onChunk?.(content);
          }
        } catch (e) {
          // ignore
        }
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 400) {
        let msg = `Request failed (${xhr.status})`;
        try {
            const errJson = JSON.parse(xhr.responseText);
            msg = errJson.error || errJson.message || msg;
        } catch {}
        onError?.(msg);
      } else {
        onDone?.();
      }
      resolve();
    };

    xhr.onerror = () => {
      onError?.('Network error');
      resolve();
    };

    xhr.send(JSON.stringify({
      model,
      messages,
      imageModel,
      stream: true,
      temperature,
      max_tokens,
    }));
  });
}

export default {
  getCloudModels,
  getCloudUsage,
  streamCloudChat,
  streamCloudAgentic,
  streamCloudImageGen,
  getBackendUrl,
  setBackendUrl,
};
