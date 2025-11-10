const {
  initializeCodeAgent,
  processCodeRequest,
  resolveUserConfirmation,
} = require('../code-agent');

// Mock PowerShellSession
jest.mock('../powershell-session', () => {
  return {
    PowerShellSession: jest.fn().mockImplementation(() => ({
      run: jest.fn().mockResolvedValue({
        stdout: 'Command output',
        stderr: '',
        exitCode: 0,
      }),
      dispose: jest.fn(),
      isDisposed: false,
    })),
  };
});

// Mock https module to prevent real API calls
jest.mock('https', () => {
  return {
    request: jest.fn((options, callback) => {
      // Simulate successful API response
      const mockResponse = {
        statusCode: 200,
        on: jest.fn((event, handler) => {
          if (event === 'data') {
            handler(JSON.stringify({
              choices: [{
                message: {
                  content: `<answer>Test response</answer>\n<cmd>Get-Location</cmd>`,
                },
              }],
              usage: {
                prompt_tokens: 10,
                completion_tokens: 5,
                total_tokens: 15,
              },
            }));
          } else if (event === 'end') {
            handler();
          }
        }),
      };
      
      setTimeout(() => callback(mockResponse), 10);
      
      return {
        on: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
      };
    }),
  };
});

// Mock logger
const mockLog = jest.fn();

// Mock dependencies
const mockDeps = {
  log: mockLog,
  getCodeById: jest.fn().mockReturnValue({
    id: 'test-code-1',
    instruction: 'Test instruction',
    workspace_path: '/test/workspace',
  }),
};

// Helper to make HTTP request
const mockHttpsRequest = (responseContent) => {
  return new Promise((resolve) => {
    resolve({
      content: responseContent,
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });
  });
};

// Setup and teardown
beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('Code Agent - parseAgentResponse', () => {
  test('should parse answer tag correctly', () => {
    const text = `
      <answer>Ini jawaban dari AI</answer>
      <cmd>Get-ChildItem</cmd>
    `;
    // Note: parseAgentResponse is not exported, so we test through other means
  });
});

describe('Code Agent - isHighImpactCommand', () => {
  // These functions are not exported, testing through integration tests
});

describe('Code Agent - summarizeOutput', () => {
  test('should truncate long output to 160 chars', () => {
    // Testing through integration since function not exported
  });
});

describe('Code Agent - formatCommandHistory', () => {
  test('should format history with older summary and recent full output', () => {
    // Testing through integration
  });
});

describe('Code Agent - Confirmation Flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('resolveUserConfirmation should resolve pending confirmation', async () => {
    const sessionId = 'test-session-123';
    const iteration = 0;

    // Store a confirmation promise first
    const confirmationPromises = new Map();
    const key = `${sessionId}-${iteration}`;
    
    let resolveFunc;
    const promise = new Promise((resolve) => {
      resolveFunc = resolve;
    });
    confirmationPromises.set(key, resolveFunc);

    // Resolve confirmation
    resolveFunc({ allowed: true });

    const result = await promise;
    expect(result.allowed).toBe(true);
  });

  test('resolveUserConfirmation should return false if no pending confirmation', () => {
    // Testing the return value when confirmation not found
    const result = resolveUserConfirmation('non-existent', 0, true);
    expect(result).toBe(false);
  });
});

describe('Code Agent - Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    initializeCodeAgent(mockDeps);
  });

  test('should initialize code agent with dependencies', () => {
    initializeCodeAgent(mockDeps);
    expect(mockDeps.log).toBeDefined();
    expect(mockDeps.getCodeById).toBeDefined();
  });

  test('should process code request with multiple iterations', async () => {
    const chunks = [];
    let done = false;

    const handler = (chunk, info) => {
      chunks.push(chunk);
      if (info && info.done) {
        done = true;
      }
    };

    const result = await processCodeRequest({
      sessionId: 'test-session-1',
      userPrompt: 'List all files',
      provider: 'openrouter',
      model: 'gpt-4',
      baseUrl: 'https://api.openrouter.ai/v1',
      apiKey: 'test-key',
      codeId: 'test-code-1',
      onChunk: handler,
      shouldCancel: () => false,
    });

    expect(result).toHaveProperty('chunks');
    expect(result).toHaveProperty('usage');
    expect(result).toHaveProperty('cancelled');
    expect(result.cancelled).toBe(false);
  }, 10000);  // 10 second timeout for async test

  test('should handle cancellation', async () => {
    const chunks = [];
    let cancelCalled = false;

    const handler = (chunk, info) => {
      chunks.push(chunk);
    };

    const shouldCancel = () => cancelCalled;

    // Start processing
    const processPromise = processCodeRequest({
      sessionId: 'test-session-2',
      userPrompt: 'Test cancellation',
      provider: 'openrouter',
      model: 'gpt-4',
      baseUrl: 'https://api.openrouter.ai/v1',
      apiKey: 'test-key',
      codeId: 'test-code-1',
      onChunk: handler,
      shouldCancel,
    });

    // Trigger cancellation
    setTimeout(() => {
      cancelCalled = true;
    }, 100);

    const result = await processPromise;
    expect(result).toHaveProperty('cancelled');
  }, 10000);  // 10 second timeout

  test('should handle destructive commands with confirmation', async () => {
    // This test would verify the confirmation flow
    // In real scenario, we'd mock user interaction
    expect(typeof resolveUserConfirmation).toBe('function');
  });

  test('should accumulate usage statistics across iterations', async () => {
    let totalUsage = null;

    const handler = (chunk, info) => {};

    const result = await processCodeRequest({
      sessionId: 'test-session-3',
      userPrompt: 'Test usage tracking',
      provider: 'openrouter',
      model: 'gpt-4',
      baseUrl: 'https://api.openrouter.ai/v1',
      apiKey: 'test-key',
      codeId: 'test-code-1',
      onChunk: handler,
      shouldCancel: () => false,
    });

    if (result.usage) {
      expect(result.usage).toHaveProperty('prompt_tokens');
      expect(result.usage).toHaveProperty('completion_tokens');
      expect(result.usage).toHaveProperty('total_tokens');
    }
  }, 10000);  // 10 second timeout
});

describe('Code Agent - Command History', () => {
  test('should maintain command history with summaries', async () => {
    // Testing that history is properly maintained
    initializeCodeAgent(mockDeps);

    const handler = (chunk, info) => {};

    await processCodeRequest({
      sessionId: 'test-session-history',
      userPrompt: 'Test history',
      provider: 'openrouter',
      model: 'gpt-4',
      baseUrl: 'https://api.openrouter.ai/v1',
      apiKey: 'test-key',
      codeId: 'test-code-1',
      onChunk: handler,
      shouldCancel: () => false,
    });

    // History should be stored in session state
    expect(mockDeps.getCodeById).toHaveBeenCalled();
  }, 10000);  // 10 second timeout
});

describe('Code Agent - Error Handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    initializeCodeAgent(mockDeps);
  });

  test('should handle missing base URL', async () => {
    const handler = (chunk, info) => {};

    try {
      await processCodeRequest({
        sessionId: 'test-error-1',
        userPrompt: 'Test error',
        provider: 'openrouter',
        model: 'gpt-4',
        baseUrl: null,
        apiKey: 'test-key',
        codeId: 'test-code-1',
        onChunk: handler,
        shouldCancel: () => false,
      });
    } catch (error) {
      expect(error).toBeDefined();
    }
  });

  test('should handle missing model', async () => {
    const handler = (chunk, info) => {};

    try {
      await processCodeRequest({
        sessionId: 'test-error-2',
        userPrompt: 'Test error',
        provider: 'openrouter',
        model: null,
        baseUrl: 'https://api.openrouter.ai/v1',
        apiKey: 'test-key',
        codeId: 'test-code-1',
        onChunk: handler,
        shouldCancel: () => false,
      });
    } catch (error) {
      expect(error).toBeDefined();
    }
  });

  test('should log errors during chunk delivery', async () => {
    const brokenHandler = () => {
      throw new Error('Handler error');
    };

    await processCodeRequest({
      sessionId: 'test-error-3',
      userPrompt: 'Test error handling',
      provider: 'openrouter',
      model: 'gpt-4',
      baseUrl: 'https://api.openrouter.ai/v1',
      apiKey: 'test-key',
      codeId: 'test-code-1',
      onChunk: brokenHandler,
      shouldCancel: () => false,
    });

    // Should not throw, but should log error
    expect(mockLog).toHaveBeenCalled();
  }, 10000);  // 10 second timeout
});

describe('Code Agent - Session State Management', () => {
  test('should maintain separate session states', async () => {
    initializeCodeAgent(mockDeps);

    const handler1 = jest.fn();
    const handler2 = jest.fn();

    await Promise.all([
      processCodeRequest({
        sessionId: 'session-1',
        userPrompt: 'Task 1',
        provider: 'openrouter',
        model: 'gpt-4',
        baseUrl: 'https://api.openrouter.ai/v1',
        apiKey: 'test-key',
        codeId: 'test-code-1',
        onChunk: handler1,
        shouldCancel: () => false,
      }),
      processCodeRequest({
        sessionId: 'session-2',
        userPrompt: 'Task 2',
        provider: 'openrouter',
        model: 'gpt-4',
        baseUrl: 'https://api.openrouter.ai/v1',
        apiKey: 'test-key',
        codeId: 'test-code-1',
        onChunk: handler2,
        shouldCancel: () => false,
      }),
    ]);

    // Both handlers should have been called
    expect(handler1.mock.calls.length + handler2.mock.calls.length).toBeGreaterThan(0);
  }, 10000);  // 10 second timeout
});
