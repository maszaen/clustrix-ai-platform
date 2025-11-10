# Code Agent Unit Tests

Comprehensive test suite untuk Code Agent PowerShell integration.

## Test Structure

```
backend/codes/__tests__/
├── code-agent.test.js              # Unit tests untuk core functions
├── code-agent.integration.test.js  # Integration tests untuk full workflow
└── powershell-session.test.js      # Tests untuk PowerShell session execution
```

## Running Tests

### Run all tests
```bash
npm test
```

### Run codes agent tests only
```bash
npm run test:codes
```

### Run with watch mode (auto-rerun on changes)
```bash
npm run test:codes:watch
```

### Generate coverage report
```bash
npm run test:coverage
```

## Test Coverage

### code-agent.test.js

**Confirmation Flow Tests:**
- `resolveUserConfirmation` - Verify user confirmation resolution
- Destructive command blocking
- Confirmation timeout handling

**Integration Tests:**
- Agent initialization
- Multi-iteration processing
- Cancellation handling
- Usage statistics accumulation
- Session state management

**Command History Tests:**
- History maintenance with summaries
- Command ordering (FIFO)
- History truncation (MAX_HISTORY)

**Error Handling Tests:**
- Missing configuration (baseUrl, model)
- Handler errors (non-crashing)
- Invalid input handling

### code-agent.integration.test.js

**Full Workflow Tests:**
- Single iteration completion
- Multiple chunk handling
- Command history accumulation

**Context Preservation Tests:**
- Recent commands context provision
- Last 3 commands with full output
- Summary generation (AI vs auto)

**Cancellation Tests:**
- Processing stop on cancel
- Cleanup on cancellation

**Error Recovery Tests:**
- Error logging without crashing
- Handler error recovery
- Continuation after errors

**Usage Statistics Tests:**
- Token aggregation
- Multi-iteration totals

### powershell-session.test.js

**Command Execution Tests:**
- Simple command execution
- Multi-line commands
- Base64 encoding for special chars
- Error output capture

**Session Management Tests:**
- Session initialization
- Proper disposal
- Reuse detection

**Error Handling Tests:**
- stderr capture
- Exit code verification
- Workspace context

## Test Flow

### Typical Test Scenario

```
1. Initialize code agent dengan mock dependencies
   ↓
2. Create handler untuk capture chunks
   ↓
3. Call processCodeRequest dengan test parameters
   ↓
4. Verify results:
   - Chunks returned correctly
   - Usage stats aggregated
   - No errors thrown
   - Handler called appropriate times
```

### Example Test

```javascript
test('should complete single iteration', async () => {
  const chunks = [];
  const handler = (chunk, info) => {
    chunks.push(chunk);
  };

  const result = await processCodeRequest({
    sessionId: 'test-1',
    userPrompt: 'List files',
    provider: 'openrouter',
    model: 'gpt-4',
    baseUrl: 'https://api.openrouter.ai/v1',
    apiKey: 'test-key',
    codeId: 'code-123',
    onChunk: handler,
    shouldCancel: () => false,
  });

  // Assertions
  expect(result.chunks).toBeDefined();
  expect(result.cancelled).toBe(false);
  expect(chunks.length).toBeGreaterThan(0);
});
```

## Mocking Strategy

### PowerShellSession Mock
```javascript
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
```

Mock returns predictable command results untuk testing logic tanpa actual PowerShell execution.

### Dependencies Mock
```javascript
const mockDeps = {
  log: jest.fn(),
  getCodeById: jest.fn().mockReturnValue({
    id: 'code-123',
    instruction: 'Test instruction',
    workspace_path: '/test/workspace',
  }),
};
```

## Key Test Assertions

- **chunks**: Verify streaming chunks delivered correctly
- **usage**: Token accounting across iterations
- **cancelled**: Cancellation flag accuracy
- **error handling**: Graceful degradation without crashes
- **history**: Proper accumulation and formatting
- **session state**: Isolation between sessions
- **summary**: AI summaries used when provided

## Coverage Goals

- **Statements**: 80%+ coverage
- **Branches**: 75%+ coverage  
- **Functions**: 85%+ coverage
- **Lines**: 80%+ coverage

Current: Run `npm run test:coverage` untuk check actual metrics.

## Adding New Tests

### Pattern 1: Unit Test untuk Function
```javascript
describe('functionName', () => {
  test('should do specific thing', () => {
    // Setup
    // Execute
    // Assert
  });
});
```

### Pattern 2: Integration Test untuk Workflow
```javascript
describe('Full Workflow', () => {
  test('should complete workflow', async () => {
    const handler = (chunk, info) => {};
    const result = await processCodeRequest({...});
    expect(result).toHaveProperty('chunks');
  });
});
```

### Pattern 3: Error Test
```javascript
test('should handle error condition', async () => {
  try {
    await processCodeRequest({invalidConfig});
  } catch (error) {
    expect(error).toBeDefined();
  }
});
```

## Troubleshooting

### Test timeout
- Increase timeout: `jest.setTimeout(10000)`
- Check mock implementation

### Mock not working
- Verify mock before test file
- Use `jest.clearAllMocks()` in beforeEach

### Async issues
- Ensure `async/await` used correctly
- Return promises from tests

### Coverage gaps
- Run coverage report: `npm run test:coverage`
- Check uncovered branches
- Add tests for edge cases

## CI/CD Integration

Tests run automatically on:
- `npm test` - all tests
- `npm run test:codes` - codes agent only

Typical CI command:
```bash
npm run test:coverage && npm run test:codes:watch
```

## Performance Considerations

- Tests use mocked PowerShell for speed
- Each test isolated with beforeEach/afterEach
- Typical test execution: < 5 seconds for full suite

## Future Enhancements

- [ ] Add E2E tests dengan actual PowerShell
- [ ] Add performance benchmarks
- [ ] Add snapshot tests untuk output formatting
- [ ] Add stress tests untuk long-running sessions
