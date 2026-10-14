/** Public facade tests: routing and lifecycle must reach the shared runtime, independently of model names. */
jest.mock('../runtime/agent', () => ({
  processRequest: jest.fn().mockResolvedValue({ chunks: ['done'], usage: {}, cancelled: false }),
  resolveApproval: jest.fn(), cancelSession: jest.fn(), disposeSessions: jest.fn(),
}));
jest.mock('../code-agent-claude', () => ({ processClaudeCodeRequest: jest.fn().mockResolvedValue({ chunks: ['legacy'] }) }));
jest.mock('../code-agent-openai', () => ({ processOpenAICodeRequest: jest.fn().mockResolvedValue({ chunks: ['legacy'] }) }));
jest.mock('../code-agent-gemini', () => ({ processGeminiCodeRequest: jest.fn().mockResolvedValue({ chunks: ['legacy'] }) }));
const runtime = require('../runtime/agent');
const { initializeCodeAgent, processCodeRequest, cancelCodeSession, disposeAllCodeSessions, resolveUserConfirmation } = require('../code-agent');

beforeEach(() => {
  jest.clearAllMocks();
  initializeCodeAgent({ log: jest.fn(), getCodeById: () => ({ workspace_path: '/project', instruction: 'Preserve UX' }) });
});

test.each(['anthropic/claude-future', 'google/gemini-future', 'unknown-model'])('default gateway routing does not inspect model names: %s', async model => {
  await processCodeRequest({ sessionId: 's', userPrompt: 'fix', provider: 'openrouter', model, codeId: 'p' });
  expect(runtime.processRequest).toHaveBeenCalledWith(expect.objectContaining({ provider: 'openrouter', model, workspacePath: '/project', instruction: 'Preserve UX' }));
});

test('provider overrides come from application settings, not project instructions', async () => {
  const db = { getSetting: jest.fn(() => ({ contextWindow: 64000, providers: { custom: { protocol: 'anthropic' } } })) };
  await processCodeRequest({ sessionId: 's', userPrompt: 'fix', provider: 'custom', model: 'new', db });
  expect(db.getSetting).toHaveBeenCalledWith('codes.agent');
  expect(runtime.processRequest.mock.calls[0][0].options).toMatchObject({ protocol: 'anthropic', contextWindow: 64000 });
});

test('legacy rollback is explicit and does not silently activate after a modern API error', async () => {
  const legacy = require('../code-agent-openai').processOpenAICodeRequest;
  await processCodeRequest({ sessionId: 's', provider: 'openai', model: 'gpt-4', db: { getSetting: () => ({ runtime: 'legacy' }) } });
  expect(legacy).toHaveBeenCalledTimes(1);
  expect(runtime.processRequest).not.toHaveBeenCalled();
  runtime.processRequest.mockRejectedValueOnce(new Error('401'));
  await expect(processCodeRequest({ sessionId: 's', provider: 'openai', model: 'new' })).rejects.toThrow('401');
  expect(legacy).toHaveBeenCalledTimes(1);
});

test('existing cancel, shutdown and confirmation IPC functions delegate to the runtime', () => {
  runtime.cancelSession.mockReturnValue(true);
  runtime.resolveApproval.mockReturnValue(true);
  expect(cancelCodeSession('s')).toBe(true);
  expect(resolveUserConfirmation('s', 1000001, true)).toBe(true);
  expect(runtime.resolveApproval).toHaveBeenCalledWith('s', 1000001, true);
  disposeAllCodeSessions();
  expect(runtime.disposeSessions).toHaveBeenCalledTimes(1);
});
