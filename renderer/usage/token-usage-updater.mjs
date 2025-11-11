/**
 * Utilities for persisting streaming token usage metadata back into a session
 * so that code sessions retain the correct usage totals after refresh.
 */

/**
 * Normalize a raw token counter value to a non-negative integer.
 *
 * @param {unknown} value
 * @returns {number|null}
 */
function toNormalizedCount(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || Number.isNaN(numeric)) {
    return null;
  }
  const rounded = Math.round(numeric);
  if (rounded < 0) {
    return 0;
  }
  return rounded;
}

/**
 * Compute stable prompt/completion/total counts using the values returned by
 * the provider. If a total is not included, fall back to summing prompt and
 * completion counts when available.
 *
 * @param {object} usage
 * @returns {{promptTokens:number|null, completionTokens:number|null, totalTokens:number|null}}
 */
function normalizeUsageTotals(usage) {
  if (!usage || typeof usage !== 'object') {
    return {
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
    };
  }

  const promptTokens =
    toNormalizedCount(usage.prompt_tokens ?? usage.promptTokenCount) ?? null;
  const completionTokens =
    toNormalizedCount(
      usage.completion_tokens ?? usage.candidatesTokenCount,
    ) ?? null;

  let totalTokens = toNormalizedCount(
    usage.total_tokens ?? usage.totalTokenCount,
  );

  if (totalTokens === null && (promptTokens !== null || completionTokens !== null)) {
    const prompt = promptTokens ?? 0;
    const completion = completionTokens ?? 0;
    totalTokens = prompt + completion;
  }

  if (totalTokens !== null && totalTokens < 0) {
    totalTokens = 0;
  }

  return { promptTokens, completionTokens, totalTokens };
}

/**
 * Apply usage metadata to a session message and update aggregate token totals.
 *
 * The caller is responsible for providing an `ensureTokenFields` helper so this
 * module stays free of renderer-specific state dependencies.
 *
 * @param {object} session
 * @param {number} messageIndex
 * @param {object|undefined} usage
 * @param {{
 *   ensureTokenFields?: (session: object) => void,
 *   provider?: string,
 *   model?: string,
 * }} [options]
 * @returns {{
 *   persisted: boolean,
 *   shouldUpdateTokensUI: boolean,
 *   messageEntry: unknown[]|null,
 *   messageMeta: object|null,
 * }}
 */
export function applyStreamUsageToSession(
  session,
  messageIndex,
  usage,
  options = {},
) {
  if (!session || typeof session !== 'object') {
    return {
      persisted: false,
      shouldUpdateTokensUI: false,
      messageEntry: null,
      messageMeta: null,
    };
  }

  const { ensureTokenFields, provider, model } = options;
  const messageEntry = session.messages?.[messageIndex];
  if (!Array.isArray(messageEntry)) {
    return {
      persisted: false,
      shouldUpdateTokensUI: false,
      messageEntry: null,
      messageMeta: null,
    };
  }

  let messageMeta = messageEntry[2];
  if (!messageMeta || typeof messageMeta !== 'object') {
    messageMeta = {};
  }

  let shouldUpdateTokensUI = false;

  if (usage && typeof usage === 'object') {
    messageMeta.usage = usage;
    if (typeof ensureTokenFields === 'function') {
      ensureTokenFields(session);
    }

    const { totalTokens } = normalizeUsageTotals(usage);
    if (totalTokens !== null) {
      if (!Array.isArray(session.tokens_by_message)) {
        session.tokens_by_message = [];
      }

      const previousTokens =
        toNormalizedCount(session.tokens_by_message[messageIndex]) ?? 0;
      session.tokens_by_message[messageIndex] = totalTokens;

      if (!Number.isFinite(session.tokens_used)) {
        session.tokens_used = 0;
      }

      session.tokens_used += totalTokens - previousTokens;
      if (session.tokens_used < 0) {
        session.tokens_used = 0;
      }
      shouldUpdateTokensUI = true;
    }
  }

  if (provider) {
    messageMeta.provider = provider;
  }
  if (model) {
    messageMeta.model = model;
  }

  messageEntry[2] = messageMeta;

  if (!Array.isArray(session._newMessages)) {
    session._newMessages = [];
  }

  const payload = [messageIndex, messageEntry];
  const existingIndex = session._newMessages.findIndex(
    ([idx]) => idx === messageIndex,
  );
  if (existingIndex >= 0) {
    session._newMessages[existingIndex] = payload;
  } else {
    session._newMessages.push(payload);
  }

  return {
    persisted: true,
    shouldUpdateTokensUI,
    messageEntry,
    messageMeta,
  };
}

export { normalizeUsageTotals };
