/**
 * Thinking Tag Parser
 *
 * Detects and extracts <thinking> tags from streaming responses.
 * Separates thinking content from main response body.
 */

const { log } = require('../../utils/logger');

/**
 * Stream buffer state for each active stream
 * @type {Map<string, StreamParserState>}
 */
const streamBuffers = new Map();

/**
 * @typedef {Object} StreamParserState
 * @property {string} buffer - Accumulated content buffer
 * @property {boolean} inThinking - Currently inside thinking tag
 * @property {string} thinkingContent - Accumulated thinking content
 * @property {boolean} thinkingSent - Whether thinking has been sent
 * @property {string} mainContent - Content after thinking tag
 */

/**
 * Initialize parser state for a new stream
 * @param {string} streamId - Unique stream identifier
 */
function initializeStream(streamId) {
  streamBuffers.set(streamId, {
    buffer: '',
    inThinking: false,
    thinkingContent: '',
    thinkingSent: false,
    mainContent: '',
  });

  log('THINKING_PARSER', 1, 'initializeStream', 'Initialized thinking parser for stream', {
    streamId
  });
}

/**
 * Process a chunk of streaming content
 * @param {string} streamId - Unique stream identifier
 * @param {string} chunk - Content chunk to process
 * @returns {Object} Parsed result with think and content properties
 */
function processChunk(streamId, chunk) {
  if (!streamBuffers.has(streamId)) {
    initializeStream(streamId);
  }

  const state = streamBuffers.get(streamId);
  state.buffer += chunk;

  const result = {
    think: null,
    content: null,
  };

  // Check if we're at the start and detect <thinking> tag
  if (!state.inThinking && !state.thinkingSent && !state.mainContent) {
    const thinkingStartMatch = state.buffer.match(/^[\s\n]*<thinking>/i);

    if (thinkingStartMatch) {
      // Found opening tag at the start
      state.inThinking = true;
      state.buffer = state.buffer.substring(thinkingStartMatch[0].length);

      log('THINKING_PARSER', 2, 'processChunk', 'Detected <thinking> tag at start', {
        streamId,
        bufferLength: state.buffer.length
      });
    } else if (state.buffer.length > 50 && !state.buffer.trim().startsWith('<thinking>')) {
      // Buffer has enough content and doesn't start with thinking tag
      // This is normal content, send it through
      result.content = state.buffer;
      state.mainContent = state.buffer;
      state.buffer = '';
      state.thinkingSent = true; // Mark as no thinking detected

      log('THINKING_PARSER', 2, 'processChunk', 'No thinking tag detected, passing through content', {
        streamId,
        contentLength: result.content.length
      });

      return result;
    }
  }

  // Process thinking content
  if (state.inThinking) {
    const thinkingEndMatch = state.buffer.match(/<\/thinking>/i);

    if (thinkingEndMatch) {
      // Found closing tag
      const endIndex = thinkingEndMatch.index;
      const thinkingPart = state.buffer.substring(0, endIndex);
      state.thinkingContent += thinkingPart;

      // Send accumulated thinking content
      result.think = state.thinkingContent.trim();
      state.thinkingSent = true;
      state.inThinking = false;

      // Remove closing tag and continue with main content
      state.buffer = state.buffer.substring(endIndex + thinkingEndMatch[0].length);

      // If there's content after thinking tag, send it
      if (state.buffer.length > 0) {
        result.content = state.buffer;
        state.mainContent = state.buffer;
        state.buffer = '';
      }

      log('THINKING_PARSER', 2, 'processChunk', 'Thinking tag closed, extracted content', {
        streamId,
        thinkingLength: result.think.length,
        remainingBufferLength: state.buffer.length
      });
    } else {
      // Still inside thinking tag, accumulate content
      // Keep last 20 chars in buffer to handle tag split across chunks
      if (state.buffer.length > 20) {
        const safeContent = state.buffer.substring(0, state.buffer.length - 20);
        state.thinkingContent += safeContent;
        state.buffer = state.buffer.substring(safeContent.length);
      }
    }
  } else if (state.thinkingSent) {
    // Thinking already processed, pass through main content
    if (state.buffer.length > 0) {
      result.content = state.buffer;
      state.mainContent += state.buffer;
      state.buffer = '';
    }
  }

  return result;
}

/**
 * Finalize stream and clean up
 * @param {string} streamId - Unique stream identifier
 * @returns {Object} Final state with any remaining content
 */
function finalizeStream(streamId) {
  const state = streamBuffers.get(streamId);
  if (!state) {
    return { think: null, content: null };
  }

  const result = {
    think: null,
    content: null,
  };

  // If still in thinking tag (unclosed), treat as regular content
  if (state.inThinking) {
    result.content = '<thinking>' + state.thinkingContent + state.buffer;

    log('THINKING_PARSER', 3, 'finalizeStream', 'Unclosed thinking tag detected, treating as regular content', {
      streamId,
      contentLength: result.content.length
    });
  } else if (state.buffer.length > 0) {
    // Send any remaining buffer content
    result.content = state.buffer;
  }

  // Clean up
  streamBuffers.delete(streamId);

  log('THINKING_PARSER', 1, 'finalizeStream', 'Finalized and cleaned up stream', {
    streamId
  });

  return result;
}

/**
 * Reset stream state (useful for retries)
 * @param {string} streamId - Unique stream identifier
 */
function resetStream(streamId) {
  streamBuffers.delete(streamId);
  log('THINKING_PARSER', 1, 'resetStream', 'Reset stream state', { streamId });
}

/**
 * Get current stream state (for debugging)
 * @param {string} streamId - Unique stream identifier
 * @returns {StreamParserState|null}
 */
function getStreamState(streamId) {
  return streamBuffers.get(streamId) || null;
}

module.exports = {
  initializeStream,
  processChunk,
  finalizeStream,
  resetStream,
  getStreamState,
};
