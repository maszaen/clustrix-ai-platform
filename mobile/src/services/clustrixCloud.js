/**
 * Clustrix Cloud Service
 * 
 * Handles communication with Clustrix backend for cloud mode
 */

// Backend URL - change this after deployment
const BACKEND_URL = 'https://clustrix-backend-xxxxx-xx.a.run.app'; // TODO: Update after deploy

/**
 * Get available models from Clustrix Cloud
 */
export async function getCloudModels() {
  try {
    const response = await fetch(`${BACKEND_URL}/api/models`);
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
export async function getCloudUsage(idToken) {
  try {
    const response = await fetch(`${BACKEND_URL}/api/user/usage`, {
      headers: {
        'Authorization': `Bearer ${idToken}`,
      },
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
}) {
  try {
    const response = await fetch(`${BACKEND_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        temperature,
        max_tokens,
      }),
      signal,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Cloud API error: ${response.status}`);
    }

    // Read SSE stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            onDone?.();
            return;
          }
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              onChunk?.(content);
            }
          } catch (e) {
            // Ignore parse errors for partial data
          }
        }
      }
    }

    onDone?.();
  } catch (error) {
    if (error.name === 'AbortError') {
      onDone?.();
      return;
    }
    console.error('[ClustrixCloud] Stream error:', error);
    onError?.(error);
  }
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
