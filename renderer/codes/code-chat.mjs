const deps = { log: () => {} };
let activeCodeStreamCancelFn = null;

/** Compatibility helper for callers that do not yet hold a request-specific controller. */
export function cancelActiveCodeStream() {
  const cancel = activeCodeStreamCancelFn;
  activeCodeStreamCancelFn = null;
  try { cancel?.(); }
  catch (error) { deps.log('CODES', 3, 'cancelActiveCodeStream', 'Failed to cancel code stream', { error: error.message }); }
}

/** Return an awaitable result AND a per-request controller for streamManager's existing contract. */
export function runCodeChatStream(options) {
  let cancel = () => {};
  const result = runRequest(options, callback => { cancel = callback; });
  result.controller = { cancel: () => cancel() };
  return result;
}

/** Keep cancellation ownership local: finishing session A must not clear session B's controller. */
async function runRequest({ session, userPrompt, modelOptions = {}, handler }, registerCancel) {
  if (!session?.id) throw new Error('Session metadata missing for code chat.');
  if (!userPrompt || typeof userPrompt !== 'string') throw new Error('User prompt missing for code chat.');
  const payload = {
    sessionId: session.id,
    codeId: session.codeId || null,
    userPrompt,
    provider: modelOptions.provider,
    model: modelOptions.model,
    baseUrl: modelOptions.baseUrl,
    apiKey: modelOptions.apiKey,
  };

  return new Promise((resolve, reject) => {
    let settled = false;
    let stopTransport = () => {};
    let stopRequested = false;
    const settle = (value, error) => {
      if (settled) return;
      settled = true;
      if (activeCodeStreamCancelFn === cancel) activeCodeStreamCancelFn = null;
      if (error) reject(error);
      else resolve(value);
    };
    const stop = () => {
      stopRequested = true;
      try { stopTransport(); }
      catch (error) { deps.log('CODES', 3, 'runRequest', 'Transport cancellation failed', { error: error.message }); }
    };
    const cancel = () => {
      if (settled) return;
      stop();
      // Preload detaches listeners on cancel, so no subsequent done event can settle this promise.
      settle({ usage: null, cancelled: true });
    };
    const fail = error => {
      if (settled) return;
      stop();
      settle(null, error instanceof Error ? error : new Error(String(error)));
    };
    registerCancel(cancel);
    activeCodeStreamCancelFn = cancel;

    if (typeof window.api?.codes?.stream === 'function') {
      try {
        const streamResult = window.api.codes.stream(payload, event => {
          if (settled || !event || typeof event !== 'object') return;
          try {
            if (event.type === 'chunk') handler?.(event.chunk ?? '');
            else if (event.type === 'error') fail(new Error(event.error || 'Code agent streaming failed.'));
            else if (event.type === 'done') settle({ usage: event.usage || null, cancelled: !!event.cancelled });
          } catch (error) { fail(error); }
        });
        stopTransport = () => streamResult?.cancel?.();
        // Covers synchronous callbacks before stream() returns its transport handle.
        if (stopRequested) stopTransport();
      } catch (error) { fail(error); }
      return;
    }

    // Old non-streaming bridge: suppress late results and request backend cancellation where supported.
    stopTransport = () => {
      const pending = window.api?.invoke?.('codes:set-interrupt', session.id);
      pending?.catch?.(error => deps.log('CODES', 3, 'runRequest', 'Backend interrupt failed', { error: error.message }));
    };
    Promise.resolve().then(() => {
      if (settled) return null;
      return window.api?.codes?.chat?.(payload);
    }).then(response => {
      if (settled) return;
      if (!response) throw new Error('No response from code agent.');
      for (const chunk of Array.isArray(response.chunks) ? response.chunks : []) {
        if (settled) break;
        if (chunk) handler?.(chunk);
      }
      settle({ usage: response.usage || null, cancelled: !!response.cancelled });
    }).catch(fail);
  });
}
