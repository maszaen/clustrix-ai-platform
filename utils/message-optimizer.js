/**
 * Message Context Optimizer
 * 
 * Provides functions to optimize message history for AI requests
 * while maintaining conversation context and reducing token usage.
 */

/**
 * Build context window using sliding window strategy
 * @param {Array} messages - Array of messages in format [{role, content}, ...] or [[role, content, metadata], ...]
 * @param {number} windowSize - Number of recent messages to include
 * @param {boolean} keepFirst - Whether to always keep the first message (usually system prompt)
 * @returns {Array} Optimized messages array
 */
function buildContextWindow(messages, windowSize = 10, keepFirst = true) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return [];
  }

  // If messages array is already smaller than window, return as-is
  if (messages.length <= windowSize + (keepFirst ? 1 : 0)) {
    return messages;
  }

  const result = [];

  // Keep first message if requested (usually system prompt or initial context)
  if (keepFirst && messages.length > 0) {
    result.push(messages[0]);
  }

  // Take last N messages
  const recentMessages = messages.slice(-windowSize);
  result.push(...recentMessages);

  return result;
}

/**
 * Remove noise messages (short acknowledgments, empty messages, etc.)
 * @param {Array} messages - Array of messages
 * @param {number} minLength - Minimum content length to keep (default: 20 characters)
 * @returns {Array} Filtered messages array
 */
function pruneMessages(messages, minLength = 20) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return [];
  }

  return messages.filter((msg, idx) => {
    // Always keep first message (system prompt)
    if (idx === 0) return true;

    // Always keep last 3 messages to maintain immediate context
    if (idx >= messages.length - 3) return true;

    // Get content based on message format
    let content = '';
    if (Array.isArray(msg) && msg.length >= 2) {
      // Format: [role, content, metadata]
      content = msg[1] || '';
    } else if (msg && typeof msg === 'object' && msg.content) {
      // Format: {role, content}
      content = msg.content || '';
    }

    // Remove very short messages (likely acknowledgments like "ok", "thanks", "yes")
    if (typeof content === 'string' && content.trim().length < minLength) {
      return false;
    }

    return true;
  });
}

/**
 * Optimize messages with both sliding window and pruning
 * @param {Array} messages - Array of messages
 * @param {Object} options - Optimization options
 * @param {number} options.windowSize - Sliding window size (default: 10)
 * @param {boolean} options.keepFirst - Keep first message (default: true)
 * @param {number} options.minLength - Minimum message length (default: 20)
 * @param {boolean} options.prune - Enable pruning (default: true)
 * @returns {Array} Optimized messages array
 */
function optimizeMessages(messages, options = {}) {
  const {
    windowSize = 10,
    keepFirst = true,
    minLength = 20,
    prune = true
  } = options;

  if (!Array.isArray(messages) || messages.length === 0) {
    return [];
  }

  let optimized = messages;

  // Step 1: Apply smart pruning first to remove noise
  if (prune) {
    optimized = pruneMessages(optimized, minLength);
  }

  // Step 2: Apply sliding window to limit total count
  optimized = buildContextWindow(optimized, windowSize, keepFirst);

  return optimized;
}

/**
 * Estimate token count from messages
 * @param {Array} messages - Array of messages
 * @returns {number} Estimated token count
 */
function estimateTokens(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return 0;
  }

  const CHARS_PER_TOKEN = 4; // Rough estimate
  let totalChars = 0;

  for (const msg of messages) {
    let content = '';
    if (Array.isArray(msg) && msg.length >= 2) {
      content = msg[1] || '';
    } else if (msg && typeof msg === 'object' && msg.content) {
      content = msg.content || '';
    }

    if (typeof content === 'string') {
      totalChars += content.length;
    }
  }

  return Math.ceil(totalChars / CHARS_PER_TOKEN);
}

module.exports = {
  buildContextWindow,
  pruneMessages,
  optimizeMessages,
  estimateTokens
};
