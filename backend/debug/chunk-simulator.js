/**
 * Chunk Simulator - Realistic streaming simulation
 * Simulates token-by-token streaming with configurable speed and chunk size
 */

/**
 * Split text into chunks for streaming
 * @param {string} text - Full response text
 * @param {object} options - Chunking options
 * @param {number} options.minChars - Min chars per chunk (default: 10)
 * @param {number} options.maxChars - Max chars per chunk (default: 14)
 * @returns {Array<string>} - Array of chunks
 */
function chunkText(text, options = {}) {
  const { minChars = 10, maxChars = 14 } = options;

  if (!text || typeof text !== 'string') {
    return [];
  }

  const chunks = [];
  let currentPos = 0;

  while (currentPos < text.length) {
    // Random chunk size between min and max (inclusive)
    const chunkSize = Math.floor(Math.random() * (maxChars - minChars + 1)) + minChars;

    // Extract chunk (may be shorter than chunkSize if near end)
    const chunk = text.substring(currentPos, currentPos + chunkSize);

    if (chunk.length > 0) {
      chunks.push(chunk);
    }

    currentPos += chunkSize;
  }

  return chunks;
}

/**
 * Calculate delay for next chunk based on tokens per second
 * @param {number} minTPS - Min tokens per second
 * @param {number} maxTPS - Max tokens per second
 * @returns {number} - Delay in milliseconds
 */
function calculateDelay(minTPS, maxTPS) {
  // Random tokens per second between min and max
  const tokensPerSec = Math.random() * (maxTPS - minTPS) + minTPS;

  // Convert to milliseconds per token
  const msPerToken = 1000 / tokensPerSec;

  return Math.floor(msPerToken);
}

/**
 * Stream chunks with realistic timing
 * @param {Array<string>} chunks - Array of text chunks
 * @param {Function} onChunk - Callback for each chunk: (chunk, index, total) => void
 * @param {object} options - Timing options
 * @param {number} options.minTokensPerSec - Min speed (default: 20)
 * @param {number} options.maxTokensPerSec - Max speed (default: 25)
 * @param {Function} options.onComplete - Callback when streaming completes
 * @param {Function} options.onError - Callback on error
 * @returns {object} - Controller with cancel() method
 */
function streamChunks(chunks, onChunk, options = {}) {
  const {
    minTokensPerSec = 20,
    maxTokensPerSec = 25,
    onComplete = () => {},
    onError = () => {}
  } = options;

  let currentIndex = 0;
  let cancelled = false;
  let timeoutId = null;

  const streamNext = () => {
    if (cancelled) {
      return;
    }

    if (currentIndex >= chunks.length) {
      // Streaming complete
      try {
        onComplete();
      } catch (error) {
        console.error('Error in onComplete callback:', error);
      }
      return;
    }

    try {
      // Send current chunk
      onChunk(chunks[currentIndex], currentIndex, chunks.length);
      currentIndex++;

      // Schedule next chunk with random delay
      const delay = calculateDelay(minTokensPerSec, maxTokensPerSec);
      timeoutId = setTimeout(streamNext, delay);

    } catch (error) {
      console.error('Error streaming chunk:', error);
      try {
        onError(error);
      } catch (callbackError) {
        console.error('Error in onError callback:', callbackError);
      }
    }
  };

  // Start streaming
  streamNext();

  // Return controller
  return {
    cancel: () => {
      cancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    }
  };
}

/**
 * Simulate streaming with thinking phase
 * @param {object} params - Parameters
 * @param {string} params.thinkingContent - Thinking text
 * @param {number} params.thinkingDuration - Thinking duration in seconds
 * @param {string} params.responseContent - Response text
 * @param {Function} params.onThinkingChunk - Callback for thinking chunks
 * @param {Function} params.onThinkingComplete - Callback when thinking completes
 * @param {Function} params.onResponseChunk - Callback for response chunks
 * @param {Function} params.onComplete - Callback when everything completes
 * @param {object} params.streamingOptions - Options for streaming (speed, chunk size)
 * @returns {object} - Controller with cancel() method
 */
function simulateWithThinking(params) {
  const {
    thinkingContent,
    thinkingDuration = 0,
    responseContent,
    onThinkingChunk = () => {},
    onThinkingComplete = () => {},
    onResponseChunk = () => {},
    onComplete = () => {},
    streamingOptions = {}
  } = params;

  let cancelled = false;
  let currentController = null;

  const startResponseStreaming = () => {
    if (cancelled) return;

    const responseChunks = chunkText(responseContent, {
      minChars: streamingOptions.minCharsPerChunk || 10,
      maxChars: streamingOptions.maxCharsPerChunk || 14
    });

    currentController = streamChunks(
      responseChunks,
      onResponseChunk,
      {
        minTokensPerSec: streamingOptions.minTokensPerSec || 20,
        maxTokensPerSec: streamingOptions.maxTokensPerSec || 25,
        onComplete: () => {
          if (!cancelled) {
            onComplete();
          }
        }
      }
    );
  };

  // If thinking is enabled, stream thinking first
  if (thinkingContent && thinkingDuration > 0) {
    const thinkingChunks = chunkText(thinkingContent, {
      minChars: 15,
      maxChars: 25
    });

    currentController = streamChunks(
      thinkingChunks,
      onThinkingChunk,
      {
        minTokensPerSec: 30,
        maxTokensPerSec: 40,
        onComplete: () => {
          if (!cancelled) {
            try {
              onThinkingComplete(thinkingDuration);
            } catch (error) {
              console.error('Error in onThinkingComplete:', error);
            }

            // Add small delay before starting response
            setTimeout(startResponseStreaming, 100);
          }
        }
      }
    );
  } else {
    // No thinking, start response immediately
    startResponseStreaming();
  }

  return {
    cancel: () => {
      cancelled = true;
      if (currentController) {
        currentController.cancel();
      }
    }
  };
}

module.exports = {
  chunkText,
  calculateDelay,
  streamChunks,
  simulateWithThinking
};
