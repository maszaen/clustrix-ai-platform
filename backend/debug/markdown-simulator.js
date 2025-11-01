/**
 * Debug Markdown Simulator
 *
 * Simulates AI streaming for testing markdown rendering and thinking parser
 * WITHOUT making actual API requests to AI models.
 */

const { log } = require('../../utils/logger');

/**
 * Default demo response with thinking tags for testing
 */
const DEFAULT_DEMO_RESPONSE = `<thinking>
Analyzing the user's request for markdown testing...
I should provide a comprehensive markdown showcase that tests all renderer features.
Let me structure this properly with various markdown elements.
</thinking>

## Markdown Showcase

Here are common markdown elements:

### Text Formatting
- **Bold text** and *italic text*
- ~~Strikethrough~~ and \`inline code\`
- Combined: **_bold italic_**

### Lists
Numbered list:
1. First step
2. Second step with [link](https://example.com)
3. Third step

Nested list:
- Item 1
  - Subitem 1.1
  - Subitem 1.2
- Item 2

### Code Block
\`\`\`javascript
function hello() {
  console.log("Hello World!");
  return 42;
}
\`\`\`

### Blockquote
> This is a blockquote
> with multiple lines

### Math (if supported)
Inline: $E = mc^2$

Block:
$$
\\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}
$$

### Table
| Feature | Status |
|---------|--------|
| Parser  | ✅ Working |
| Renderer | ✅ Working |

That covers the basics!`;

/**
 * Generate response based on user prompt
 * @param {string} userPrompt - User's input message
 * @returns {string} Generated response with thinking tags
 */
function generateResponse(userPrompt) {
  const prompt = userPrompt?.trim() || '';

  // If empty prompt, return default showcase
  if (!prompt || prompt === '[MARKDOWN TEST]') {
    return DEFAULT_DEMO_RESPONSE;
  }

  // Generate custom response based on prompt
  const thinking = `Analyzing the request: "${prompt}"\nDetermining the best way to respond with markdown examples that match this request.`;

  const response = `## Response to: "${prompt}"

<thinking>
${thinking}
</thinking>

Based on your request, here's a markdown demonstration:

### Example Content

Your input was: **${prompt}**

Here's some sample markdown:
- List item 1
- List item 2
- List item 3

\`\`\`javascript
// Example code block
const input = "${prompt}";
console.log(input);
\`\`\`

> Blockquote: "${prompt}"

| Column 1 | Column 2 |
|----------|----------|
| Data     | More data |

That's the markdown showcase for your input!`;

  return response;
}

/**
 * Simulate SSE streaming exactly like OpenAI API
 * @param {string} content - Content to stream
 * @param {Function} onChunk - Callback for each SSE chunk
 * @param {Function} onDone - Callback when done
 * @param {Object} options - Streaming options
 */
async function simulateStreaming(content, onChunk, onDone, options = {}) {
  const {
    tokenSpeed = 30, // ms per token (30ms = ~33 tokens/sec)
    chunkSize = 1, // chars per chunk
  } = options;

  log('DEBUG_MARKDOWN', 1, 'simulateStreaming', 'Starting SSE simulation', {
    contentLength: content.length,
    tokenSpeed,
    chunkSize,
  });

  // Split content into chunks (char by char or word by word)
  const tokens = content.split('');

  let i = 0;
  const streamInterval = setInterval(() => {
    if (i >= tokens.length) {
      clearInterval(streamInterval);

      // Send [DONE] marker
      log('DEBUG_MARKDOWN', 1, 'simulateStreaming', 'Streaming completed, sending [DONE]');
      onDone();
      return;
    }

    // Get next chunk
    const delta = tokens.slice(i, i + chunkSize).join('');
    i += chunkSize;

    // Format as SSE OpenAI-style JSON
    const ssePayload = {
      choices: [{
        delta: {
          content: delta
        },
        index: 0,
        finish_reason: null
      }]
    };

    onChunk(ssePayload);
  }, tokenSpeed);

  return {
    cancel: () => {
      clearInterval(streamInterval);
      log('DEBUG_MARKDOWN', 1, 'simulateStreaming', 'Streaming cancelled');
      onDone();
    }
  };
}

/**
 * Handle debug markdown request - Simulate exact OpenAI API response
 * @param {Object} event - IPC event
 * @param {string} reqId - Request ID
 * @param {Array} messages - Message history
 * @param {Object} options - Request options
 * @returns {Object} Controller with cancel method
 */
function handleDebugMarkdownRequest(event, reqId, messages, options) {
  log('DEBUG_MARKDOWN', 1, 'handleDebugMarkdownRequest', 'Processing debug markdown request', {
    messageCount: messages.length,
    sessionId: options.sessionId,
    reqId,
  });

  // Get last user message
  const lastUserMsg = messages.slice().reverse().find(m => m.role === 'user');
  const userPrompt = lastUserMsg?.content || '';

  log('DEBUG_MARKDOWN', 2, 'handleDebugMarkdownRequest', 'User prompt extracted', {
    prompt: userPrompt.substring(0, 100),
  });

  // Generate response with thinking tags
  const response = generateResponse(userPrompt);

  const words = response.split(/\s+/).length;
  const promptTokens = Math.floor(userPrompt.split(/\s+/).length * 1.3);
  const completionTokens = Math.floor(words * 1.3);

  // Simulate streaming
  return simulateStreaming(
    response,
    (ssePayload) => {
      // Send SSE chunk exactly like OpenAI - will be parsed by existing handler
      // The existing handler expects: data: {json}\n\n format
      // We just send the JSON, the handler in main.js will process it
      const delta = ssePayload.choices[0].delta.content;

      // Just send raw delta content - existing SSE parser will handle it
      if (delta) {
        // Simulate what the SSE parser receives
        event.sender.send(`chat:chunk-${reqId}`, delta);
      }
    },
    () => {
      // Send final usage
      const usage = {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
      };

      log('DEBUG_MARKDOWN', 1, 'handleDebugMarkdownRequest', 'Sending token usage', {
        usage,
      });

      event.sender.send(`chat:usage-${reqId}`, usage);
      event.sender.send(`chat:done-${reqId}`);
    },
    {
      tokenSpeed: options.tokenSpeed || 30,
      chunkSize: options.chunkSize || 1,
    }
  );
}

/**
 * Check if request should use debug mode
 * @param {string} provider - Provider name
 * @param {string} model - Model name
 * @returns {boolean}
 */
function isDebugMarkdownRequest(provider, model) {
  return provider === 'debug' ||
         provider === 'markdown-test' ||
         model === 'markdown-test' ||
         model === 'debug-markdown';
}

module.exports = {
  handleDebugMarkdownRequest,
  isDebugMarkdownRequest,
  generateResponse,
  simulateStreaming,
  DEFAULT_DEMO_RESPONSE,
};
