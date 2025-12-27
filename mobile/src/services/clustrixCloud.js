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

// Helper to get device name
function getDeviceName() {
  const model = Device.modelName || Device.designName || 'Unknown Device';
  return `${model} (${Platform.OS})`;
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
  if (!idToken) {
    onError?.('Authentication required. Please sign in with Google.');
    return;
  }
  const token = idToken;
  
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

export default {
  getCloudModels,
  getCloudUsage,
  streamCloudChat,
  getBackendUrl,
  setBackendUrl,
};
