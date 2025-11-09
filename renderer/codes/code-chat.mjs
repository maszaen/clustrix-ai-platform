let deps = {
  log: () => {},
};

function log(context, level, func, message, details = {}) {
  try {
    deps.log?.(context, level, func, message, details);
  } catch (error) {
    console.debug(`[codes:${func}]`, message, details, error);
  }
}

export function configureCodeChat(options = {}) {
  deps = {
    ...deps,
    ...options,
  };
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
