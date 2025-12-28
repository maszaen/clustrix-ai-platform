/**
 * Thinking Parser Utility
 * 
 * Parses and separates thinking/reasoning content from AI responses.
 * Supports multiple tag formats:
 * - <think>...</think>
 * - <thinking>...</thinking>
 * - <reasoning>...</reasoning>
 * - *(reasoning: ...)*
 */

/**
 * Parse thinking content from a complete response
 * @param {string} text - Full response text
 * @returns {{ thinking: string, response: string }} Separated content
 */
function parseThinkingFromResponse(text) {
  if (!text || typeof text !== 'string') {
    return { thinking: '', response: text || '' };
  }

  let thinking = '';
  let response = text;

  // Patterns to match thinking blocks (case insensitive)
  const patterns = [
    // <thinking>...</thinking>
    { open: /<thinking>/gi, close: /<\/thinking>/gi },
    // <think>...</think>
    { open: /<think>/gi, close: /<\/think>/gi },
    // <reasoning>...</reasoning>
    { open: /<reasoning>/gi, close: /<\/reasoning>/gi },
    // *(reasoning: ...)*
    { open: /\*\(reasoning:\s*/gi, close: /\)\*/gi },
  ];

  for (const pattern of patterns) {
    // Reset regex indices
    pattern.open.lastIndex = 0;
    pattern.close.lastIndex = 0;

    const openMatch = pattern.open.exec(response);
    if (openMatch) {
      const closeMatch = pattern.close.exec(response);
      if (closeMatch && closeMatch.index > openMatch.index) {
        // Extract thinking content
        const thinkingContent = response.substring(
          openMatch.index + openMatch[0].length,
          closeMatch.index
        );
        thinking += thinkingContent.trim();

        // Remove thinking block from response
        response = 
          response.substring(0, openMatch.index) + 
          response.substring(closeMatch.index + closeMatch[0].length);
        response = response.trim();
      }
    }
  }

  return {
    thinking: thinking.trim(),
    response: response.trim(),
  };
}

/**
 * Check if content appears to be thinking content (starts with thinking tag)
 * @param {string} text - Text to check
 * @returns {boolean}
 */
function startsWithThinkingTag(text) {
  if (!text || typeof text !== 'string') return false;
  
  const trimmed = text.trimStart();
  const patterns = [
    /^<thinking>/i,
    /^<think>/i,
    /^<reasoning>/i,
    /^\*\(reasoning:/i,
  ];

  return patterns.some(p => p.test(trimmed));
}

/**
 * Check if a model is known to produce thinking output
 * @param {string} modelId - Model ID
 * @returns {boolean}
 */
function isThinkingModel(modelId) {
  if (!modelId) return false;
  
  const lower = modelId.toLowerCase();
  return (
    lower.includes('thinking') ||
    lower.includes('deepseek-r1') ||
    lower.includes('deepseek-reasoner') ||
    lower.includes('qwq') ||
    lower.includes('o1') ||
    lower.includes('o3') ||
    lower.includes('gemini-2') // Gemini 2.x can have native thinking
  );
}

module.exports = {
  parseThinkingFromResponse,
  startsWithThinkingTag,
  isThinkingModel,
};
