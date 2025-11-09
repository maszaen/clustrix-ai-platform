let helpers;

beforeAll(async () => {
  helpers = await import('../agent-helpers.mjs');
});

const getHelper = (name) => {
  if (!helpers || !helpers[name]) {
    throw new Error(`Helper ${name} not loaded`);
  }
  return helpers[name];
};

describe('agent helpers', () => {
  test('parseCodeAgentResponse extracts structured fields', () => {
    const parse = getHelper('parseCodeAgentResponse');
    const result = parse('<internal>ctx</internal><answer> hello </answer><cmd>Get-ChildItem</cmd><end />');
    expect(result).toEqual({
      answer: 'hello',
      command: 'Get-ChildItem',
      end: true,
      internal: 'ctx',
    });
  });

  test('parseCodeAgentResponse falls back to raw text', () => {
    const parse = getHelper('parseCodeAgentResponse');
    const result = parse('Just a plain response without tags');
    expect(result).toEqual({
      answer: 'Just a plain response without tags',
      command: '',
      end: false,
      internal: '',
    });
  });

  test('isHighImpactCommand detects destructive commands', () => {
    const detector = getHelper('isHighImpactCommand');
    expect(detector('Remove-Item -Recurse -Force .\\bin')).toBe(true);
    expect(detector('Get-ChildItem')).toBe(false);
  });

  test('summarizeCommandOutput prefers error information', () => {
    const summarize = getHelper('summarizeCommandOutput');
    expect(summarize('line one\nline two', 'Fatal: denied')).toBe('Fatal: denied');
  });

  test('summarizeCommandOutput truncates verbose output', () => {
    const summarize = getHelper('summarizeCommandOutput');
    const longText = 'a'.repeat(200);
    expect(summarize(longText, '')).toBe(`${'a'.repeat(177)}…`);
  });

  test('truncateText limits string length with ellipsis', () => {
    const truncate = getHelper('truncateText');
    expect(truncate('abcdefghijk', 10)).toBe('abcdefghi…');
  });

  test('buildCodeAgentSystemPrompt includes history and metadata', () => {
    const buildPrompt = getHelper('buildCodeAgentSystemPrompt');
    const session = {
      type: 'code',
      id: 'sess-1',
      code: {
        originalRequest: 'Fix the failing tests',
        commandHistory: [
          {
            command: 'Get-ChildItem src',
            output: 'index.js\nutil.js',
            error: '',
            summary: '',
          },
        ],
      },
    };

    const prompt = buildPrompt(session, '', session.code.commandHistory[0]);
    expect(prompt).toContain('=== ORIGINAL USER REQUEST ===');
    expect(prompt).toContain('Fix the failing tests');
    expect(prompt).toContain('Current working directory:');
    expect(prompt).toContain('- #1 Get-ChildItem src');
    expect(prompt).toContain('=== LAST COMMAND ===');
  });

  test('buildCodeAgentMessages switches user prompt after first iteration', () => {
    const buildMessages = getHelper('buildCodeAgentMessages');
    const firstRunSession = {
      type: 'code',
      id: 'code-1',
      code: {
        iteration: 0,
        originalRequest: 'Help fix bug',
      },
    };
    const firstMessages = buildMessages(firstRunSession, 'User prompt', null);
    expect(firstMessages).toHaveLength(2);
    expect(firstMessages[1].content).toBe('User prompt');

    const followUpSession = {
      type: 'code',
      id: 'code-2',
      code: {
        iteration: 2,
        originalRequest: 'Help fix bug',
      },
    };
    const followUpMessages = buildMessages(followUpSession, '', null);
    expect(followUpMessages[1].content).toContain('Continue assisting');
  });
});
