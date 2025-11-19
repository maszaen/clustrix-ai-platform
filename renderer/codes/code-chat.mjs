let deps = {
  log: () => {},
};

let activeCodeStreamCancelFn = null;

export function cancelActiveCodeStream() {
  if (activeCodeStreamCancelFn) {
    try {
      activeCodeStreamCancelFn();
      activeCodeStreamCancelFn = null;
    } catch (error) {
      log('CODES', 3, 'cancelActiveCodeStream', 'Failed to cancel code stream', { error: error.message });
    }
  }
}

export async function runCodeChatStream({
  session,
  userPrompt,
  modelOptions = {},
  handler,
}) {
  if (!session?.id) {
    throw new Error('Session metadata missing for code chat.');
  }
  if (!userPrompt || typeof userPrompt !== 'string') {
    throw new Error('User prompt missing for code chat.');
  }

  const payload = {
    sessionId: session.id,
    codeId: session.codeId || null,
    userPrompt,
    provider: modelOptions.provider,
    model: modelOptions.model,
    baseUrl: modelOptions.baseUrl,
    apiKey: modelOptions.apiKey,
  };

  if (typeof window.api?.codes?.stream === 'function') {
    return new Promise((resolve, reject) => {
      let settled = false;
      const resolveOnce = (value) => {
        if (settled) return;
        settled = true;
        activeCodeStreamCancelFn = null;
        resolve(value);
      };
      const rejectOnce = (error) => {
        if (settled) return;
        settled = true;
        activeCodeStreamCancelFn = null;
        reject(error);
      };

      try {
        const streamResult = window.api.codes.stream(payload, (event) => {
          if (!event || typeof event !== 'object') {
            return;
          }

          if (event.type === 'chunk') {
            handler(event.chunk ?? '');
            return;
          }

          if (event.type === 'error') {
            rejectOnce(new Error(event.error || 'Code agent streaming failed.'));
            return;
          }

          if (event.type === 'done') {
            resolveOnce({
              usage: event.usage || null,
              cancelled: !!event.cancelled,
            });
          }
        });

        if (streamResult?.cancel) {
          activeCodeStreamCancelFn = streamResult.cancel;
        }
      } catch (error) {
        rejectOnce(error);
      }
    });
  }

  try {
    const response = await window.api?.codes?.chat?.(payload);
    if (!response) {
      throw new Error('No response from code agent.');
    }
    const chunks = Array.isArray(response.chunks) ? response.chunks : [];
    for (const chunk of chunks) {
      if (chunk) {
        handler(chunk);
      }
    }
    return {
      usage: response.usage || null,
    };
  } catch (error) {
    log('CODES', 4, 'runCodeChatStream', 'Failed to run code chat', {
      error: error?.message || error,
      sessionId: session.id,
    });
    throw error;
  }
}
