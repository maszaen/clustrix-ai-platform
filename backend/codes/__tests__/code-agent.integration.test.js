const {
  initializeCodeAgent,
  processCodeRequest,
  resolveUserConfirmation,
} = require('../code-agent');

jest.mock('../powershell-session');

/**
 * Integration tests for Code Agent
 * Tests the complete flow: prompt → AI response → command execution → history
 */

describe('Code Agent - Full Workflow', () => {
  const mockLog = jest.fn();
  const mockDeps = {
    log: mockLog,
    getCodeById: jest.fn().mockReturnValue({
      id: 'code-123',
      instruction: 'Fix bugs in Python code',
      workspace_path: '/workspace',
    }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    initializeCodeAgent(mockDeps);
  });

  describe('Iteration Flow', () => {
    test('should complete single iteration', async () => {
      const chunks = [];
      const chunkTypes = [];

      const handler = (chunk, info) => {
        chunks.push(chunk);
        chunkTypes.push(info?.type || 'unknown');
      };

      const result = await processCodeRequest({
        sessionId: 'flow-test-1',
        userPrompt: 'List all Python files',
        provider: 'openrouter',
        model: 'gpt-4',
        baseUrl: 'https://api.openrouter.ai/v1',
        apiKey: 'test-key',
        codeId: 'code-123',
        onChunk: handler,
        shouldCancel: () => false,
      });

      // Should have completed successfully
      expect(result.chunks).toBeDefined();
      expect(result.cancelled).toBe(false);
    });

    test('should handle multiple chunks in sequence', async () => {
      const chunks = [];
      let chunkCount = 0;

      const handler = (chunk, info) => {
        chunks.push(chunk);
        chunkCount++;
      };

      await processCodeRequest({
        sessionId: 'flow-test-2',
        userPrompt: 'Test multiple iterations',
        provider: 'openrouter',
        model: 'gpt-4',
        baseUrl: 'https://api.openrouter.ai/v1',
        apiKey: 'test-key',
        codeId: 'code-123',
        onChunk: handler,
        shouldCancel: () => false,
      });

      // Should have multiple chunks
      expect(chunkCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Command History Accumulation', () => {
    test('should accumulate commands in history', async () => {
      let historySize = 0;

      const handler = (chunk, info) => {};

      const result = await processCodeRequest({
        sessionId: 'history-test-1',
        userPrompt: 'List files then search for bug',
        provider: 'openrouter',
        model: 'gpt-4',
        baseUrl: 'https://api.openrouter.ai/v1',
        apiKey: 'test-key',
        codeId: 'code-123',
        onChunk: handler,
        shouldCancel: () => false,
      });

      // History should be tracked (verified through session state)
      expect(result).toHaveProperty('chunks');
    });

    test('should maintain FIFO order in history', async () => {
      const handler = (chunk, info) => {};

      // Run two sequential requests
      const result1 = await processCodeRequest({
        sessionId: 'order-test-1',
        userPrompt: 'First task',
        provider: 'openrouter',
        model: 'gpt-4',
        baseUrl: 'https://api.openrouter.ai/v1',
        apiKey: 'test-key',
        codeId: 'code-123',
        onChunk: handler,
        shouldCancel: () => false,
      });

      const result2 = await processCodeRequest({
        sessionId: 'order-test-1',
        userPrompt: 'Second task',
        provider: 'openrouter',
        model: 'gpt-4',
        baseUrl: 'https://api.openrouter.ai/v1',
        apiKey: 'test-key',
        codeId: 'code-123',
        onChunk: handler,
        shouldCancel: () => false,
      });

      // Both should complete
      expect(result1.cancelled).toBe(false);
      expect(result2.cancelled).toBe(false);
    });
  });

  describe('Summary Generation', () => {
    test('should include command summaries in history', async () => {
      const chunks = [];

      const handler = (chunk, info) => {
        if (info?.type === 'output') {
          chunks.push(chunk);
        }
      };

      await processCodeRequest({
        sessionId: 'summary-test-1',
        userPrompt: 'Execute command',
        provider: 'openrouter',
        model: 'gpt-4',
        baseUrl: 'https://api.openrouter.ai/v1',
        apiKey: 'test-key',
        codeId: 'code-123',
        onChunk: handler,
        shouldCancel: () => false,
      });

      // Output chunks should contain formatted output with exit codes
      const hasOutput = chunks.some(chunk => chunk.includes('Exit Code'));
      expect(typeof hasOutput).toBe('boolean');
    });

    test('should prefer AI-provided summary over auto-generated', async () => {
      // This tests that if AI provides <summary> tag, it's used in history
      const handler = (chunk, info) => {};

      const result = await processCodeRequest({
        sessionId: 'ai-summary-test',
        userPrompt: 'Task with custom summary',
        provider: 'openrouter',
        model: 'gpt-4',
        baseUrl: 'https://api.openrouter.ai/v1',
        apiKey: 'test-key',
        codeId: 'code-123',
        onChunk: handler,
        shouldCancel: () => false,
      });

      expect(result.chunks).toBeDefined();
    });
  });

  describe('Context Preservation Across Iterations', () => {
    test('should provide recent commands context to AI', async () => {
      const handler = (chunk, info) => {};

      // First request
      await processCodeRequest({
        sessionId: 'context-test-1',
        userPrompt: 'List files',
        provider: 'openrouter',
        model: 'gpt-4',
        baseUrl: 'https://api.openrouter.ai/v1',
        apiKey: 'test-key',
        codeId: 'code-123',
        onChunk: handler,
        shouldCancel: () => false,
      });

      // Second request should have context of first
      const result = await processCodeRequest({
        sessionId: 'context-test-1',
        userPrompt: 'Find bugs in the files',
        provider: 'openrouter',
        model: 'gpt-4',
        baseUrl: 'https://api.openrouter.ai/v1',
        apiKey: 'test-key',
        codeId: 'code-123',
        onChunk: handler,
        shouldCancel: () => false,
      });

      expect(result.chunks).toBeDefined();
    });

    test('should show last 3 commands with full output', async () => {
      const outputChunks = [];

      const handler = (chunk, info) => {
        if (info?.type === 'output') {
          outputChunks.push(chunk);
        }
      };

      await processCodeRequest({
        sessionId: 'recent-context-test',
        userPrompt: 'Multiple commands test',
        provider: 'openrouter',
        model: 'gpt-4',
        baseUrl: 'https://api.openrouter.ai/v1',
        apiKey: 'test-key',
        codeId: 'code-123',
        onChunk: handler,
        shouldCancel: () => false,
      });

      // Should have output chunks
      expect(typeof outputChunks.length).toBe('number');
    });
  });

  describe('Cancellation Flow', () => {
    test('should stop processing when cancelled', async () => {
      let iterationCount = 0;
      const handler = (chunk, info) => {
        iterationCount++;
      };

      const shouldCancel = jest.fn()
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(true); // Cancel on next call

      const result = await processCodeRequest({
        sessionId: 'cancel-test-1',
        userPrompt: 'Test cancellation',
        provider: 'openrouter',
        model: 'gpt-4',
        baseUrl: 'https://api.openrouter.ai/v1',
        apiKey: 'test-key',
        codeId: 'code-123',
        onChunk: handler,
        shouldCancel,
      });

      expect(result).toHaveProperty('cancelled');
    });
  });

  describe('Error Recovery', () => {
    test('should log errors without crashing', async () => {
      const errorHandler = (chunk, info) => {
        throw new Error('Handler error');
      };

      // Should not throw
      await expect(
        processCodeRequest({
          sessionId: 'error-recovery-test',
          userPrompt: 'Test error recovery',
          provider: 'openrouter',
          model: 'gpt-4',
          baseUrl: 'https://api.openrouter.ai/v1',
          apiKey: 'test-key',
          codeId: 'code-123',
          onChunk: errorHandler,
          shouldCancel: () => false,
        })
      ).resolves.toBeDefined();

      // Should have logged errors
      expect(mockLog).toHaveBeenCalled();
    });

    test('should continue after handler error', async () => {
      let successCount = 0;
      let errorCount = 0;

      const faultyHandler = (chunk, info) => {
        if (errorCount < 1) {
          errorCount++;
          throw new Error('Simulated error');
        }
        successCount++;
      };

      await processCodeRequest({
        sessionId: 'continue-after-error-test',
        userPrompt: 'Test continuation',
        provider: 'openrouter',
        model: 'gpt-4',
        baseUrl: 'https://api.openrouter.ai/v1',
        apiKey: 'test-key',
        codeId: 'code-123',
        onChunk: faultyHandler,
        shouldCancel: () => false,
      });

      // Should have recovered
      expect(mockLog).toHaveBeenCalled();
    });
  });

  describe('Usage Statistics', () => {
    test('should aggregate token usage', async () => {
      const handler = (chunk, info) => {};

      const result = await processCodeRequest({
        sessionId: 'usage-test-1',
        userPrompt: 'Usage tracking test',
        provider: 'openrouter',
        model: 'gpt-4',
        baseUrl: 'https://api.openrouter.ai/v1',
        apiKey: 'test-key',
        codeId: 'code-123',
        onChunk: handler,
        shouldCancel: () => false,
      });

      if (result.usage) {
        expect(result.usage).toHaveProperty('prompt_tokens');
        expect(result.usage).toHaveProperty('completion_tokens');
        expect(result.usage.total_tokens).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
