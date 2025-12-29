/**
 * Clustrix Cloud Service
 * 
 * Handles communication with Clustrix backend for cloud mode
 */

// Backend URL - Production (Cloud Run)
export const BACKEND_URL = 'https://clustrix-backend-50765975600.asia-southeast1.run.app';

// For local development, uncomment this:
// export const BACKEND_URL = 'http://192.168.100.18:8080';

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
 * Format messages with attachments for cloud API
 * Converts images/files to OpenAI-compatible multimodal format
 * Same logic as formatMessagesOpenAI in api.js
 */
function formatMessagesForCloud(messages) {
  return messages
    .filter(m => {
      // Filter out empty assistant messages
      if (m.role !== 'assistant') return true;
      return m.content && m.content.trim().length > 0;
    })
    .map(m => {
      // Check if message has attachments
      const images = m.attachments?.filter(a => a.type === 'image' && a.base64) || [];
      const readableFiles = m.attachments?.filter(a => a.type === 'file' && a.textContent) || [];
      const pdfDocs = m.attachments?.filter(a => 
        a.type === 'file' && a.base64 && !a.textContent && 
        (a.mimeType === 'application/pdf' || a.name?.toLowerCase().endsWith('.pdf'))
      ) || [];
      const otherDocs = m.attachments?.filter(a => 
        a.type === 'file' && a.base64 && !a.textContent && 
        a.mimeType !== 'application/pdf' && !a.name?.toLowerCase().endsWith('.pdf')
      ) || [];
      const unreadableFiles = m.attachments?.filter(a => a.type === 'file' && !a.textContent && !a.base64) || [];
      
      // Cloud backend supports PDFs via vision
      const documentsToInclude = [...pdfDocs, ...otherDocs];
      
      const hasAttachments = images.length > 0 || readableFiles.length > 0 || 
                             documentsToInclude.length > 0 || unreadableFiles.length > 0;
      
      if (hasAttachments && m.role === 'user') {
        // Build text content with file contents
        let textParts = [];
        
        // Add readable file contents first
        for (const file of readableFiles) {
          textParts.push(`[File: ${file.name}]\n${file.textContent}\n[End File]`);
        }
        
        // Mention unreadable binary files
        for (const file of unreadableFiles) {
          textParts.push(`[Attached file: ${file.name} (${file.mimeType || 'binary'}) - Content cannot be read directly]`);
        }
        
        // Add user text
        if (m.content?.trim()) {
          textParts.push(m.content);
        }
        
        const fullText = textParts.join('\n\n');
        
        // If has images or documents, use multi-modal format
        if (images.length > 0 || documentsToInclude.length > 0) {
          const content = [];
          
          // Add images first
          for (const img of images) {
            content.push({
              type: 'image_url',
              image_url: {
                url: `data:${img.mimeType || 'image/jpeg'};base64,${img.base64}`,
                detail: 'auto'
              }
            });
          }
          
          // Add PDF/documents as images
          for (const doc of documentsToInclude) {
            content.push({
              type: 'image_url',
              image_url: {
                url: `data:${doc.mimeType || 'application/pdf'};base64,${doc.base64}`,
                detail: 'auto'
              }
            });
          }
          
          // Add text
          if (fullText.trim()) {
            content.push({ type: 'text', text: fullText });
          }
          
          return { role: m.role, content };
        }
        
        // Text only (with file contents)
        return { role: m.role, content: fullText };
      }
      
      // No attachments - return as-is
      return { role: m.role, content: m.content };
    });
}

/**
 * Get available models from Clustrix Cloud
 */
export async function getCloudModels(idToken, userEmail) {
  try {
    // Get fresh token (auto-refreshes if needed)
    const token = await getFreshToken(idToken);
    
    if (!token) {
      return {
        success: false,
        error: 'Failed to authenticate. Please login first to use Clustrix Cloud Services',
        models: [],
        providers: [],
      };
    }
    
    const headers = {
      'X-Device-Name': getDeviceName(),
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
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
    // Get fresh token (auto-refreshes if needed)
    const token = await getFreshToken(idToken);
    
    const headers = {
      'Authorization': `Bearer ${token}`,
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
  onThink,
  onDone,
  onError,
  temperature,
  max_tokens,
  userEmail,
}) {
  // Get fresh token (auto-refreshes if expired)
  const token = await getFreshToken(idToken);
  
  if (!token) {
    onError?.('Failed to authenticate. Please login first to use Clustrix Cloud Services');
    return;
  }
  
  // Format messages with attachments (same as local mode)
  const formattedMessages = formatMessagesForCloud(messages);
  
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
    let usageData = null;  // Track usage from backend

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
          
          // Capture usage event from backend
          if (parsed.usage) {
            usageData = parsed.usage;
          }
          
          const delta = parsed.choices?.[0]?.delta;
          const content = delta?.content;
          
          // Check for any potential thinking key
          const thoughts = delta?.thoughts || delta?.thinking || delta?.reasoning || delta?.reasoning_content;
          
          if (thoughts) {
            onThink?.(thoughts);
          }
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
        // Check for Perplexity non-streaming response (has search_results)
        try {
          const jsonResponse = JSON.parse(xhr.responseText);
          if (jsonResponse.choices && !usageData) {
            // Non-streaming response (Perplexity)
            const content = jsonResponse.choices?.[0]?.message?.content || '';
            if (content) {
              onChunk?.(content);
            }
            // Extract Perplexity search results
            const searchResults = jsonResponse.search_results || [];
            const citations = jsonResponse.citations || [];
            
            onDone?.({ 
              usage: jsonResponse.usage,
              // Pass search results for Perplexity UI
              searchResults: searchResults.length > 0 ? { results: searchResults, citations } : null,
            });
            resolve();
            return;
          }
        } catch (e) {
          // Not JSON or streaming response, continue normally
        }
        onDone?.({ usage: usageData });
      }
      resolve();
    };

    xhr.onerror = () => {
      onError?.('Network error');
      resolve();
    };

    xhr.send(JSON.stringify({
      model,
      messages: formattedMessages,
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
  onThink,
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
    onError?.('Failed to authenticate. Please login first to use Clustrix Cloud Services');
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
    let usageData = null;  // Track usage from backend (may be cumulative for agentic)

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
          
          // Capture usage event from backend (incremental for agentic)
          if (parsed.usage) {
            // Accumulate usage for multi-iteration agentic calls
            if (!usageData) {
              usageData = parsed.usage;
            } else {
              usageData.prompt_tokens = (usageData.prompt_tokens || 0) + (parsed.usage.prompt_tokens || 0);
              usageData.completion_tokens = (usageData.completion_tokens || 0) + (parsed.usage.completion_tokens || 0);
              usageData.total_tokens = (usageData.total_tokens || 0) + (parsed.usage.total_tokens || 0);
            }
          }
          
          // Handle tool result (triggers waiting for iteration loader)
          if (parsed.tool_result) {
            onToolResult?.({
              id: parsed.tool_result.id,
              name: parsed.tool_result.name,
              input: parsed.tool_result.input,
              success: parsed.tool_result.success,
              output: parsed.tool_result.output,
              data: parsed.tool_result.data,
            });
            continue;
          }
          
          // Handle content chunk (command-input/command-output tags are now inside content)
          const delta = parsed.choices?.[0]?.delta;
          const content = delta?.content;
          const thoughts = delta?.thoughts || delta?.thinking || delta?.reasoning || delta?.reasoning_content;

          if (thoughts) {
             onThink?.(thoughts);
          }
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
        onDone?.({ usage: usageData });
      }
      resolve();
    };

    xhr.onerror = () => {
      onError?.('Network error');
      resolve();
    };

    xhr.send(JSON.stringify({
      model,
      messages: formatMessagesForCloud(messages),
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
    onError?.('Failed to authenticate. Please login first to use Clustrix Cloud Services');
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
    let usageData = null;  // Track usage from backend

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
          
          // Capture usage event from backend
          if (parsed.usage) {
            // Accumulate usage for multi-iteration image gen calls
            if (!usageData) {
              usageData = parsed.usage;
            } else {
              usageData.prompt_tokens = (usageData.prompt_tokens || 0) + (parsed.usage.prompt_tokens || 0);
              usageData.completion_tokens = (usageData.completion_tokens || 0) + (parsed.usage.completion_tokens || 0);
              usageData.total_tokens = (usageData.total_tokens || 0) + (parsed.usage.total_tokens || 0);
            }
          }
          
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
        onDone?.({ usage: usageData });
      }
      resolve();
    };

    xhr.onerror = () => {
      onError?.('Network error');
      resolve();
    };

    xhr.send(JSON.stringify({
      model,
      messages: formatMessagesForCloud(messages),
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
