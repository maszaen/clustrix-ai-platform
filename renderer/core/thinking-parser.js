/**
 * Thinking Pattern Parser (Renderer-side)
 * Extracts thinking/reasoning tags from AI response chunks in real-time
 * Handles: <thinking>, <think>, <reasoning>, *(reasoning: ...)*
 *
 * IMPORTANT: Only detects patterns at the BEGINNING of content
 * Tags in the middle (e.g., "hello <think>...") are treated as regular content
 */

/**
 * Create a parser state object for maintaining context across chunks
 * @returns {object} - Parser state with partialTag buffer
 */
function createThinkingParserState() {
  return {
    partialTag: ''
  };
}

/**
 * Parse chunk for thinking patterns and extract them
 * @param {string} chunkText - Raw chunk text from AI
 * @param {object} state - Parser state for handling partial tags
 * @returns {object} - { thinkingText, cleanedContent, partialTag }
 */
function parseThinkingPatterns(chunkText, state = {}) {
  if (!chunkText || typeof chunkText !== 'string') {
    return { thinkingText: '', cleanedContent: chunkText || '', partialTag: '' };
  }

  // Combine with any buffered partial tag from previous chunk
  const fullText = (state.partialTag || '') + chunkText;

  let thinkingText = '';
  let cleanedContent = fullText;
  let partialTag = '';

  // Keep processing as long as the content starts with a thinking pattern
  while (cleanedContent.length > 0) {
    // Trim only to check for pattern, but preserve whitespace in original
    const trimmedContent = cleanedContent.trimStart();

    // If after trimming we have no content, break
    if (trimmedContent.length === 0) {
      break;
    }

    // Calculate how much whitespace was trimmed
    const whitespaceTrimmed = cleanedContent.length - trimmedContent.length;

    // Check if content starts with any thinking pattern
    let matched = false;

    // Pattern 1: <thinking>...</thinking>
    const thinkingMatch = trimmedContent.match(/^<thinking>([\s\S]*?)<\/thinking>/i);
    if (thinkingMatch) {
      thinkingText += thinkingMatch[1].trim() + '\n';
      cleanedContent = cleanedContent.slice(whitespaceTrimmed + thinkingMatch[0].length);
      matched = true;
      continue;
    }

    // Pattern 2: <think>...</think>
    const thinkMatch = trimmedContent.match(/^<think>([\s\S]*?)<\/think>/i);
    if (thinkMatch) {
      thinkingText += thinkMatch[1].trim() + '\n';
      cleanedContent = cleanedContent.slice(whitespaceTrimmed + thinkMatch[0].length);
      matched = true;
      continue;
    }

    // Pattern 3: <reasoning>...</reasoning>
    const reasoningMatch = trimmedContent.match(/^<reasoning>([\s\S]*?)<\/reasoning>/i);
    if (reasoningMatch) {
      thinkingText += reasoningMatch[1].trim() + '\n';
      cleanedContent = cleanedContent.slice(whitespaceTrimmed + reasoningMatch[0].length);
      matched = true;
      continue;
    }

    // Pattern 4: *(reasoning: ...)*
    const reasoningPrefixMatch = trimmedContent.match(/^\*\(reasoning:\s*([\s\S]*?)\)\*/i);
    if (reasoningPrefixMatch) {
      thinkingText += reasoningPrefixMatch[1].trim() + '\n';
      cleanedContent = cleanedContent.slice(whitespaceTrimmed + reasoningPrefixMatch[0].length);
      matched = true;
      continue;
    }

    // Check for incomplete/partial tags at the START
    // This handles cases where a tag is split across chunks
    const incompletePatterns = [
      /^<thinking[^>]*$/i,           // "<thinking" or "<thinking " at end
      /^<think[^>]*$/i,              // "<think" or "<think " at end
      /^<reasoning[^>]*$/i,          // "<reasoning" or "<reasoning " at end
      /^\*\(reasoning:[^)]*$/i,      // "*(reasoning:" at end without closing
    ];

    for (const pattern of incompletePatterns) {
      const incompleteMatch = trimmedContent.match(pattern);
      if (incompleteMatch) {
        partialTag = incompleteMatch[0];
        cleanedContent = ''; // Clear content since it's all partial
        matched = true;
        break;
      }
    }

    // If no pattern matched, stop processing
    if (!matched) {
      break;
    }
  }

  return {
    thinkingText: thinkingText.trim(),
    cleanedContent: cleanedContent, // Keep original whitespace
    partialTag: partialTag
  };
}
