/**
 * Thinking Migration Tests
 */

const thinkingMigration = require('../thinking-migration');

describe('ThinkingMigration', () => {
  describe('extractThinkingContent', () => {
    test('should extract <thinking> tags', () => {
      const content = '<thinking>My thought process</thinking>Main response here';
      const result = thinkingMigration.extractThinkingContent(content);

      expect(result).toBeTruthy();
      expect(result.thinking).toBe('My thought process');
      expect(result.cleanContent).toBe('Main response here');
      expect(result.pattern).toBe('<thinking>');
    });

    test('should extract <thinking> tags with whitespace', () => {
      const content = '  \n<thinking>Analysis</thinking>\n\nResponse text';
      const result = thinkingMigration.extractThinkingContent(content);

      expect(result).toBeTruthy();
      expect(result.thinking).toBe('Analysis');
      expect(result.cleanContent).toBe('Response text');
    });

    test('should extract *(Internal Reasoning:)* pattern', () => {
      const content = 'Some text *(Internal Reasoning: thinking here)* more text';
      const result = thinkingMigration.extractThinkingContent(content);

      expect(result).toBeTruthy();
      expect(result.thinking).toBe('thinking here');
      expect(result.cleanContent).toBe('Some text  more text');
      expect(result.pattern).toBe('*(Internal Reasoning:)*');
    });

    test('should return null for content without thinking patterns', () => {
      const content = 'Regular content without any thinking tags';
      const result = thinkingMigration.extractThinkingContent(content);

      expect(result).toBeNull();
    });

    test('should handle multiline thinking content', () => {
      const content = `<thinking>
Step 1: Analyze
Step 2: Process
Step 3: Respond
</thinking>Final answer`;
      const result = thinkingMigration.extractThinkingContent(content);

      expect(result).toBeTruthy();
      expect(result.thinking).toContain('Step 1');
      expect(result.thinking).toContain('Step 3');
      expect(result.cleanContent).toBe('Final answer');
    });

    test('should be case-insensitive for thinking tags', () => {
      const content = '<THINKING>Capital case</THINKING>Response';
      const result = thinkingMigration.extractThinkingContent(content);

      expect(result).toBeTruthy();
      expect(result.thinking).toBe('Capital case');
    });
  });

  describe('migrateSession', () => {
    test('should migrate session with thinking tags', () => {
      const session = {
        id: 'test-session-1',
        messages: [
          ['user', 'Question?', {}],
          ['assistant', '<thinking>Analyzing question</thinking>Here is my answer', {}]
        ],
        _x_think: {}
      };

      const count = thinkingMigration.migrateSession(session);

      expect(count).toBe(1);
      expect(session._x_think[1]).toBeTruthy();
      expect(session._x_think[1].text).toBe('Analyzing question');
      expect(session._x_think[1].expanded).toBe(false);
      expect(session.messages[1][1]).toBe('Here is my answer');
    });

    test('should skip messages that already have _x_think data', () => {
      const session = {
        id: 'test-session-2',
        messages: [
          ['assistant', '<thinking>New thought</thinking>Response', {}]
        ],
        _x_think: {
          0: { text: 'Existing thought', expanded: false }
        }
      };

      const count = thinkingMigration.migrateSession(session);

      expect(count).toBe(0);
      expect(session._x_think[0].text).toBe('Existing thought'); // Unchanged
    });

    test('should only migrate assistant messages', () => {
      const session = {
        id: 'test-session-3',
        messages: [
          ['user', '<thinking>User thinking</thinking>Question', {}],
          ['assistant', '<thinking>AI thinking</thinking>Answer', {}]
        ],
        _x_think: {}
      };

      const count = thinkingMigration.migrateSession(session);

      expect(count).toBe(1);
      expect(session._x_think[0]).toBeUndefined(); // User message not migrated
      expect(session._x_think[1]).toBeTruthy(); // Assistant message migrated
    });

    test('should handle session without _x_think property', () => {
      const session = {
        id: 'test-session-4',
        messages: [
          ['assistant', '<thinking>Thought</thinking>Response', {}]
        ]
      };

      const count = thinkingMigration.migrateSession(session);

      expect(count).toBe(1);
      expect(session._x_think).toBeTruthy();
      expect(session._x_think[0].text).toBe('Thought');
    });

    test('should return 0 if migration is disabled', () => {
      // This test assumes ENABLE_MIGRATION can be toggled
      // In actual implementation, you'd need to mock or modify the module
      if (!thinkingMigration.ENABLE_MIGRATION) {
        const session = {
          id: 'test-session-5',
          messages: [
            ['assistant', '<thinking>Thought</thinking>Response', {}]
          ],
          _x_think: {}
        };

        const count = thinkingMigration.migrateSession(session);
        expect(count).toBe(0);
      }
    });
  });

  describe('migrateAllSessions', () => {
    test('should migrate multiple sessions', () => {
      const sessions = [
        {
          id: 'session-1',
          messages: [
            ['assistant', '<thinking>T1</thinking>R1', {}]
          ],
          _x_think: {}
        },
        {
          id: 'session-2',
          messages: [
            ['assistant', '<thinking>T2</thinking>R2', {}]
          ],
          _x_think: {}
        }
      ];

      const count = thinkingMigration.migrateAllSessions(sessions);

      expect(count).toBe(2);
      expect(sessions[0]._x_think[0].text).toBe('T1');
      expect(sessions[1]._x_think[0].text).toBe('T2');
    });

    test('should handle empty sessions array', () => {
      const count = thinkingMigration.migrateAllSessions([]);
      expect(count).toBe(0);
    });

    test('should handle invalid input', () => {
      const count1 = thinkingMigration.migrateAllSessions(null);
      expect(count1).toBe(0);

      const count2 = thinkingMigration.migrateAllSessions(undefined);
      expect(count2).toBe(0);
    });
  });

  describe('needsMigration', () => {
    test('should return true for content with thinking tags', () => {
      expect(thinkingMigration.needsMigration('<thinking>Test</thinking>Content')).toBe(true);
    });

    test('should return true for content with internal reasoning', () => {
      expect(thinkingMigration.needsMigration('*(Internal Reasoning: test)* content')).toBe(true);
    });

    test('should return false for regular content', () => {
      expect(thinkingMigration.needsMigration('Regular content')).toBe(false);
    });

    test('should return false if migration is disabled', () => {
      if (!thinkingMigration.ENABLE_MIGRATION) {
        expect(thinkingMigration.needsMigration('<thinking>Test</thinking>')).toBe(false);
      }
    });
  });

  describe('isMigrationEnabled', () => {
    test('should return boolean value', () => {
      const enabled = thinkingMigration.isMigrationEnabled();
      expect(typeof enabled).toBe('boolean');
    });

    test('should match ENABLE_MIGRATION constant', () => {
      expect(thinkingMigration.isMigrationEnabled()).toBe(thinkingMigration.ENABLE_MIGRATION);
    });
  });
});
