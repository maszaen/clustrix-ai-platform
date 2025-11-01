/**
 * Thinking Parser Tests
 */

const thinkingParser = require('../thinking-parser');

describe('ThinkingParser', () => {
  beforeEach(() => {
    // Reset any active streams before each test
    thinkingParser.resetStream('test-stream');
  });

  describe('processChunk', () => {
    test('should extract thinking tag at the start of stream', () => {
      const streamId = 'test-1';

      const chunk1 = '<thinking>This is my';
      const result1 = thinkingParser.processChunk(streamId, chunk1);
      expect(result1.think).toBeNull(); // Not complete yet
      expect(result1.content).toBeNull();

      const chunk2 = ' thinking process</thinking>';
      const result2 = thinkingParser.processChunk(streamId, chunk2);
      expect(result2.think).toBe('This is my thinking process');
      expect(result2.content).toBe('');

      const chunk3 = 'Main content here';
      const result3 = thinkingParser.processChunk(streamId, chunk3);
      expect(result3.think).toBeNull();
      expect(result3.content).toBe('Main content here');

      thinkingParser.finalizeStream(streamId);
    });

    test('should handle thinking tag split across multiple chunks', () => {
      const streamId = 'test-2';

      const chunks = [
        '<think',
        'ing>Analyzing',
        ' the problem',
        '</thinking>',
        'Here is my answer'
      ];

      const results = chunks.map(chunk => thinkingParser.processChunk(streamId, chunk));

      // Last result should have extracted thinking
      expect(results[3].think).toBe('Analyzing the problem');
      expect(results[4].content).toBe('Here is my answer');

      thinkingParser.finalizeStream(streamId);
    });

    test('should pass through content without thinking tags', () => {
      const streamId = 'test-3';

      const chunk1 = 'This is regular';
      const result1 = thinkingParser.processChunk(streamId, chunk1);
      expect(result1.think).toBeNull();
      expect(result1.content).toBe('This is regular');

      const chunk2 = ' content without thinking';
      const result2 = thinkingParser.processChunk(streamId, chunk2);
      expect(result2.content).toBe(' content without thinking');

      thinkingParser.finalizeStream(streamId);
    });

    test('should handle thinking tag with content on same line', () => {
      const streamId = 'test-4';

      const chunk = '<thinking>Quick thought</thinking>Main response';
      const result = thinkingParser.processChunk(streamId, chunk);

      expect(result.think).toBe('Quick thought');
      expect(result.content).toBe('Main response');

      thinkingParser.finalizeStream(streamId);
    });

    test('should handle whitespace before thinking tag', () => {
      const streamId = 'test-5';

      const chunk = '  \n<thinking>Thought</thinking>Content';
      const result = thinkingParser.processChunk(streamId, chunk);

      expect(result.think).toBe('Thought');
      expect(result.content).toBe('Content');

      thinkingParser.finalizeStream(streamId);
    });

    test('should treat unclosed thinking tag as regular content', () => {
      const streamId = 'test-6';

      const chunk1 = '<thinking>This is incomplete';
      thinkingParser.processChunk(streamId, chunk1);

      const chunk2 = ' and never closes';
      thinkingParser.processChunk(streamId, chunk2);

      const final = thinkingParser.finalizeStream(streamId);

      // Should return unclosed tag as regular content
      expect(final.content).toContain('<thinking>');
      expect(final.content).toContain('This is incomplete and never closes');
    });

    test('should be case-insensitive for thinking tags', () => {
      const streamId = 'test-7';

      const chunk = '<THINKING>Capital letters</THINKING>Content';
      const result = thinkingParser.processChunk(streamId, chunk);

      expect(result.think).toBe('Capital letters');
      expect(result.content).toBe('Content');

      thinkingParser.finalizeStream(streamId);
    });
  });

  describe('finalizeStream', () => {
    test('should flush remaining buffer content', () => {
      const streamId = 'test-8';

      thinkingParser.processChunk(streamId, 'Some content');
      const final = thinkingParser.finalizeStream(streamId);

      // Should have content in final result (from buffer flush)
      expect(final.content).toBeTruthy();
    });

    test('should clean up stream state', () => {
      const streamId = 'test-9';

      thinkingParser.initializeStream(streamId);
      expect(thinkingParser.getStreamState(streamId)).toBeTruthy();

      thinkingParser.finalizeStream(streamId);
      expect(thinkingParser.getStreamState(streamId)).toBeNull();
    });
  });

  describe('resetStream', () => {
    test('should reset stream state', () => {
      const streamId = 'test-10';

      thinkingParser.processChunk(streamId, 'Some content');
      expect(thinkingParser.getStreamState(streamId)).toBeTruthy();

      thinkingParser.resetStream(streamId);
      expect(thinkingParser.getStreamState(streamId)).toBeNull();
    });
  });

  describe('multiple concurrent streams', () => {
    test('should handle multiple streams independently', () => {
      const stream1 = 'stream-1';
      const stream2 = 'stream-2';

      const result1a = thinkingParser.processChunk(stream1, '<thinking>Stream 1');
      const result2a = thinkingParser.processChunk(stream2, '<thinking>Stream 2');

      const result1b = thinkingParser.processChunk(stream1, ' thinking</thinking>Content 1');
      const result2b = thinkingParser.processChunk(stream2, ' thinking</thinking>Content 2');

      expect(result1b.think).toBe('Stream 1 thinking');
      expect(result2b.think).toBe('Stream 2 thinking');
      expect(result1b.content).toBe('Content 1');
      expect(result2b.content).toBe('Content 2');

      thinkingParser.finalizeStream(stream1);
      thinkingParser.finalizeStream(stream2);
    });
  });
});
