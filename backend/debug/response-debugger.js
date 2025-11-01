/**
 * Response Debugger - Main handler for debug mode
 * Simulates AI responses for testing without API calls
 */

const fs = require('fs');
const path = require('path');
const { chunkText, simulateWithThinking } = require('./chunk-simulator');

// Load scenarios
let scenarios = {};
try {
  const scenariosPath = path.join(__dirname, 'scenarios.json');
  const scenariosData = fs.readFileSync(scenariosPath, 'utf8');
  scenarios = JSON.parse(scenariosData);
} catch (error) {
  console.error('Failed to load scenarios.json:', error.message);
  // Fallback to default scenario
  scenarios = {
    default: {
      type: 'echo',
      description: 'Echo back user message',
      thinking: { enabled: true, duration: 'auto', content: 'Processing...' },
      response: { type: 'echo' },
      streaming: {
        minCharsPerChunk: 10,
        maxCharsPerChunk: 14,
        minTokensPerSec: 20,
        maxTokensPerSec: 25
      }
    }
  };
}

/**
 * Check if request should be handled by debugger
 * @param {string} provider - Provider name
 * @param {string} model - Model name
 * @returns {boolean}
 */
function isDebugRequest(provider, model) {
  const providerLower = (provider || '').toLowerCase();
  const modelLower = (model || '').toLowerCase();

  return providerLower === 'local' || modelLower === 'debugging';
}

/**
 * Parse user prompt for special commands
 * Examples:
 * - "[thinking:5s] your message" -> 5s thinking time
 * - "[speed:fast] your message" -> fast streaming
 * - "[scenario:markdown_showcase]" -> load scenario
 * - "[error] your message" -> simulate error
 * @param {string} prompt - User's raw prompt
 * @returns {object} - Parsed command and content
 */
function parsePromptCommands(prompt) {
  if (!prompt || typeof prompt !== 'string') {
    return {
      hasCommands: false,
      content: prompt || '',
      commands: {}
    };
  }

  const commands = {};
  let content = prompt;
  let hasCommands = false;

  // Parse thinking command: [thinking:5s] or [think:auto]
  const thinkingMatch = content.match(/\[(thinking|think):([^\]]+)\]/i);
  if (thinkingMatch) {
    hasCommands = true;
    const value = thinkingMatch[2].trim();
    if (value === 'auto') {
      commands.thinking = 'auto';
    } else if (value.endsWith('s')) {
      commands.thinking = parseFloat(value);
    } else {
      commands.thinking = parseFloat(value);
    }
    content = content.replace(thinkingMatch[0], '').trim();
  }

  // Parse speed command: [speed:fast] or [speed:slow]
  const speedMatch = content.match(/\[speed:(fast|slow|medium)\]/i);
  if (speedMatch) {
    hasCommands = true;
    commands.speed = speedMatch[1].toLowerCase();
    content = content.replace(speedMatch[0], '').trim();
  }

  // Parse scenario command: [scenario:name]
  const scenarioMatch = content.match(/\[scenario:([^\]]+)\]/i);
  if (scenarioMatch) {
    hasCommands = true;
    commands.scenario = scenarioMatch[1].trim();
    content = content.replace(scenarioMatch[0], '').trim();
  }

  // Parse error command: [error] or [error:50%]
  const errorMatch = content.match(/\[error(?::(\d+)%)?\]/i);
  if (errorMatch) {
    hasCommands = true;
    commands.error = errorMatch[1] ? parseInt(errorMatch[1]) : true;
    content = content.replace(errorMatch[0], '').trim();
  }

  return {
    hasCommands,
    content,
    commands
  };
}

/**
 * Build response based on scenario and commands
 * @param {string} userPrompt - User's message
 * @param {object} parsedCommands - Parsed commands from prompt
 * @returns {object} - Response configuration
 */
function buildResponse(userPrompt, parsedCommands) {
  const { content, commands } = parsedCommands;

  // Load scenario
  let scenario = scenarios.default;
  if (commands.scenario && scenarios[commands.scenario]) {
    scenario = scenarios[commands.scenario];
  }

  // Clone scenario to avoid modifying original
  const config = JSON.parse(JSON.stringify(scenario));

  // Override with commands
  if (commands.thinking !== undefined) {
    if (commands.thinking === 'auto') {
      config.thinking.enabled = true;
      config.thinking.duration = 'auto';
    } else if (typeof commands.thinking === 'number') {
      config.thinking.enabled = true;
      config.thinking.duration = commands.thinking;
    }
  }

  if (commands.speed) {
    if (commands.speed === 'fast') {
      config.streaming.minTokensPerSec = 35;
      config.streaming.maxTokensPerSec = 45;
      config.streaming.minCharsPerChunk = 8;
      config.streaming.maxCharsPerChunk = 10;
    } else if (commands.speed === 'slow') {
      config.streaming.minTokensPerSec = 8;
      config.streaming.maxTokensPerSec = 12;
      config.streaming.minCharsPerChunk = 5;
      config.streaming.maxCharsPerChunk = 8;
    } else if (commands.speed === 'medium') {
      config.streaming.minTokensPerSec = 15;
      config.streaming.maxTokensPerSec = 20;
      config.streaming.minCharsPerChunk = 8;
      config.streaming.maxCharsPerChunk = 12;
    }
  }

  if (commands.error !== undefined) {
    config.type = 'error';
    config.error = {
      message: 'Simulated error from debug mode',
      delayMs: 1000,
      percentage: typeof commands.error === 'number' ? commands.error : null
    };
  }

  // Build response content
  if (config.response.type === 'echo') {
    config.response.content = content || userPrompt;
  }

  // Calculate thinking duration for 'auto'
  if (config.thinking.enabled && config.thinking.duration === 'auto') {
    const responseLength = config.response.content?.length || 0;
    // Auto: roughly 1 second per 200 characters, min 1s, max 5s
    config.thinking.duration = Math.min(5, Math.max(1, Math.ceil(responseLength / 200)));
  }

  return config;
}

/**
 * Main entry point for debug requests
 * @param {object} event - IPC event
 * @param {object} payload - Request payload
 * @returns {Promise<void>}
 */
async function handleDebugRequest(event, payload) {
  const reqId = payload.reqId;
  const messages = payload.messages || [];
  const sessionId = payload.sessionId || 'debug-session';

  console.log(`[DEBUG] Handling debug request: ${reqId}`);

  try {
    // Get last user message
    const lastMessage = messages[messages.length - 1];
    const userPrompt = lastMessage?.content || '';

    // Parse commands from prompt
    const parsedCommands = parsePromptCommands(userPrompt);

    // Build response configuration
    const config = buildResponse(userPrompt, parsedCommands);

    console.log(`[DEBUG] Config:`, {
      type: config.type,
      scenario: parsedCommands.commands.scenario || 'default',
      thinking: config.thinking.enabled,
      hasCommands: parsedCommands.hasCommands
    });

    // Handle error simulation
    if (config.type === 'error') {
      const delayMs = config.error.delayMs || 1000;
      const errorMsg = config.error.message || 'Simulated error';

      setTimeout(() => {
        event.sender.send(`chat:error-${reqId}`, errorMsg);
        console.log(`[DEBUG] Sent error after ${delayMs}ms`);
      }, delayMs);

      return;
    }

    // Start streaming simulation
    const thinkingContent = config.thinking.enabled ? config.thinking.content : null;
    const thinkingDuration = config.thinking.enabled ? config.thinking.duration : 0;
    const responseContent = config.response.content || 'Debug response';

    let chunkCount = 0;
    let thinkingChunkCount = 0;

    const controller = simulateWithThinking({
      thinkingContent,
      thinkingDuration,
      responseContent,
      streamingOptions: config.streaming,

      onThinkingChunk: (chunk) => {
        thinkingChunkCount++;
        event.sender.send(`chat:chunk-${reqId}`, { think: chunk });
      },

      onThinkingComplete: (duration) => {
        console.log(`[DEBUG] Thinking complete: ${duration}s (${thinkingChunkCount} chunks)`);
        // Send thinking time to renderer for UI finalization
        event.sender.send('chat-update', {
          type: 'THINKING_TIME',
          messageIndex: payload.aiMessageIndex || 0,
          data: {
            sessionId,
            duration
          }
        });
      },

      onResponseChunk: (chunk) => {
        chunkCount++;
        event.sender.send(`chat:chunk-${reqId}`, chunk);
      },

      onComplete: () => {
        console.log(`[DEBUG] Streaming complete: ${chunkCount} chunks`);
        event.sender.send(`chat:done-${reqId}`);
      }
    });

    // Store controller for potential cancellation
    if (!global.debugControllers) {
      global.debugControllers = new Map();
    }
    global.debugControllers.set(reqId, controller);

  } catch (error) {
    console.error(`[DEBUG] Error handling debug request:`, error);
    event.sender.send(`chat:error-${reqId}`, error.message || 'Debug mode error');
  }
}

/**
 * Cancel debug request
 * @param {string} reqId - Request ID
 */
function cancelDebugRequest(reqId) {
  if (global.debugControllers && global.debugControllers.has(reqId)) {
    const controller = global.debugControllers.get(reqId);
    controller.cancel();
    global.debugControllers.delete(reqId);
    console.log(`[DEBUG] Cancelled request: ${reqId}`);
  }
}

module.exports = {
  isDebugRequest,
  handleDebugRequest,
  cancelDebugRequest,
  parsePromptCommands,
  buildResponse
};
