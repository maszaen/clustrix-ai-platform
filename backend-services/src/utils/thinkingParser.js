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
  // We use simple regex matching since we expect one main thinking block usually
  const patterns = [
    { open: /<thinking>/i, close: /<\/thinking>/i, tagOpen: '<thinking>', tagClose: '</thinking>' },
    { open: /<think>/i, close: /<\/think>/i, tagOpen: '<think>', tagClose: '</think>' },
    { open: /<reasoning>/i, close: /<\/reasoning>/i, tagOpen: '<reasoning>', tagClose: '</reasoning>' },
    { open: /\*\(reasoning:\s*/i, close: /\)\*/i, tagOpen: '*(reasoning:', tagClose: ')*' },
  ];

  for (const pattern of patterns) {
    const openMatch = response.match(pattern.open);
    if (openMatch) {
      // Find closing tag AFTER the opening tag
      const openIndex = openMatch.index;
      const remainder = response.substring(openIndex + openMatch[0].length);
      const closeMatch = remainder.match(pattern.close);
      
      if (closeMatch) {
        // Extract thinking content
        const thinkingContent = remainder.substring(0, closeMatch.index);
        thinking += thinkingContent.trim() + '\n\n';

        // Remove thinking block from response
        // Reconstruct response without this block
        const preBlock = response.substring(0, openIndex);
        const postBlock = remainder.substring(closeMatch.index + closeMatch[0].length);
        response = preBlock + postBlock;
        
        // We found a block, continue to next pattern or restart? 
        // Usually only one type is present. We continue in case there are mixed types (rare)
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


/**
 * Create thinking parser state (like Electron preload.js)
 * State machine for tracking thinking blocks across chunks
 */
function createThinkingParserState() {
  return {
    partialTag: '',
    insideThinkingBlock: false,
    currentBlockType: null,
    hasSeenContent: false
  };
}

/**
 * Robust thinking pattern parser (ported from Electron preload.js)
 * 
 * Features:
 * - Only detects thinking tags at START of response (tolerant to whitespace)
 * - Supports multiple tag types: think, thinking, reasoning
 * - Handles partial/incomplete tags across chunks
 * - Once regular content is seen, stops looking for thinking tags
 */
function parseThinkingPatterns(chunkText, state = {}) {
  if (!chunkText || typeof chunkText !== 'string') {
    return {
      thinkingText: '',
      cleanedContent: chunkText || '',
      insideThinkingBlock: state.insideThinkingBlock || false,
      currentBlockType: state.currentBlockType || null,
      hasSeenContent: state.hasSeenContent || false,
      partialTag: state.partialTag || ''
    };
  }

  const fullText = (state.partialTag || '') + chunkText;
  let thinkingText = '';
  let cleanedContent = '';
  let insideThinkingBlock = state.insideThinkingBlock || false;
  let currentBlockType = state.currentBlockType || null;
  let hasSeenContent = state.hasSeenContent || false;
  let partialTag = '';

  let position = 0;

  while (position < fullText.length) {
    // If inside a thinking block, look for closing tag
    if (insideThinkingBlock) {
      let closeRegex;
      if (currentBlockType === 'think') {
        closeRegex = /<\/think>/i;
      } else if (currentBlockType === 'thinking') {
        closeRegex = /<\/thinking>/i;
      } else if (currentBlockType === 'reasoning') {
        closeRegex = /<\/reasoning>/i;
      } else if (currentBlockType === 'reasoning-prefix') {
        closeRegex = /\)\*/;
      } else {
        insideThinkingBlock = false;
        currentBlockType = null;
        continue;
      }

      const remainingText = fullText.substring(position);
      const match = remainingText.match(closeRegex);
      
      if (match && match.index !== undefined) {
        thinkingText += remainingText.substring(0, match.index);
        position += match.index + match[0].length;
        insideThinkingBlock = false;
        currentBlockType = null;
        partialTag = ''; // Clear partial tag buffer when exiting thinking block
        // After thinking ends, mark that we've seen content so regular content follows
        hasSeenContent = true;
        continue;
      } else {
        // Check if remainingText ENDS with a partial closing tag
        // If so, buffer it and only add the safe content to thinkingText
        let closeTagPrefix = '';
        if (currentBlockType === 'thinking') closeTagPrefix = '</thinking';
        else if (currentBlockType === 'think') closeTagPrefix = '</think';
        else if (currentBlockType === 'reasoning') closeTagPrefix = '</reasoning';
        else if (currentBlockType === 'reasoning-prefix') closeTagPrefix = ')*';
        
        // Check for any partial match at end of remainingText
        let partialCloseLen = 0;
        if (closeTagPrefix) {
          for (let len = 1; len <= closeTagPrefix.length; len++) {
            const suffix = closeTagPrefix.substring(0, len);
            if (remainingText.endsWith(suffix)) {
              partialCloseLen = len;
            }
          }
        }
        
        if (partialCloseLen > 0) {
          // Found partial closing tag at end - buffer it
          const safeContent = remainingText.substring(0, remainingText.length - partialCloseLen);
          thinkingText += safeContent;
          partialTag = remainingText.substring(remainingText.length - partialCloseLen);
        } else {
          thinkingText += remainingText;
          partialTag = '';
        }
        position = fullText.length;
        break;
      }
    }

    // Only look for opening tags if we haven't seen regular content yet
    if (!hasSeenContent) {
      const remainingText = fullText.substring(position);
      const trimmed = remainingText.trimStart();
      const whitespaceLen = remainingText.length - trimmed.length;

      const openPatterns = [
        { regex: /^<thinking>/i, type: 'thinking', tagLen: 10 },
        { regex: /^<think>/i, type: 'think', tagLen: 7 },
        { regex: /^<reasoning>/i, type: 'reasoning', tagLen: 11 },
        { regex: /^\*\(reasoning:\s*/i, type: 'reasoning-prefix', tagLen: null }
      ];

      let foundOpening = false;
      for (const { regex, type, tagLen } of openPatterns) {
        if (regex.test(trimmed)) {
          insideThinkingBlock = true;
          currentBlockType = type;
          
          let actualTagLen = tagLen;
          if (tagLen === null) {
            const tagMatch = trimmed.match(regex);
            actualTagLen = tagMatch ? tagMatch[0].length : 0;
          }
          
          position += whitespaceLen + actualTagLen;
          foundOpening = true;
          partialTag = ''; // Clear partial tag buffer - we found the opening!
          break;
        }
      }

      if (foundOpening) continue;

      // Check for incomplete/partial tags (tag cut off mid-chunk)
      // This includes very short partials like <t, <th, <thi that could become <thinking>
      const incompletePatterns = [
        /^<thinking[^>]*$/i,
        /^<think[^>]*$/i,
        /^<thinki[^>]*$/i,
        /^<thinkn[^>]*$/i,
        /^<thin[^>]*$/i,
        /^<thi[^>]*$/i,
        /^<th[^>]*$/i,
        /^<t$/i,
        /^<reasoning[^>]*$/i,
        /^<reasonin[^>]*$/i,
        /^<reasoni[^>]*$/i,
        /^<reason[^>]*$/i,
        /^<reaso[^>]*$/i,
        /^<reas[^>]*$/i,
        /^<rea[^>]*$/i,
        /^<re[^>]*$/i,
        /^<r$/i,
        /^\*\(reasoning:[^)]*$/i,
        /^\*\(reasoning$/i,
        /^\*\(reasonin$/i,
        /^\*\($/i,
        /^\*$/
      ];

      let foundIncomplete = false;
      for (const pattern of incompletePatterns) {
        if (pattern.test(trimmed)) {
          partialTag = trimmed;
          position = fullText.length;
          foundIncomplete = true;
          break;
        }
      }

      if (foundIncomplete) break;
      
      // If we're here and haven't seen content yet, check if remaining is just whitespace
      // If so, don't mark as hasSeenContent - keep looking for thinking tags in next chunk
      const remainingFromPosition = fullText.substring(position);
      if (!remainingFromPosition.trim()) {
        // Only whitespace remains - don't set hasSeenContent, skip this whitespace
        position = fullText.length;
        break;
      }
    }

    // Regular content - add to cleaned output
    // Only set hasSeenContent if there's actual non-whitespace content
    if (position < fullText.length) {
      const remaining = fullText.substring(position);
      if (remaining.trim()) {
        hasSeenContent = true;
        cleanedContent += remaining;
      }
      position = fullText.length;
    }
  }

  return {
    thinkingText,
    cleanedContent,
    insideThinkingBlock,
    currentBlockType,
    hasSeenContent,
    partialTag
  };
}

module.exports = {
  parseThinkingFromResponse,
  startsWithThinkingTag,
  isThinkingModel,
  createThinkingParserState,
  parseThinkingPatterns
};
