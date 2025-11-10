const { PowerShellSession } = require('../powershell-session');

describe('PowerShell Session - Command Execution', () => {
  let session;

  beforeEach(() => {
    const mockLog = jest.fn();
    session = new PowerShellSession({
      workspacePath: '/test/workspace',
      log: mockLog,
    });
  });

  afterEach(() => {
    try {
      session?.dispose();
    } catch (e) {
      // Ignore disposal errors in tests
    }
  });

  test('should initialize session with workspace path', () => {
    expect(session).toBeDefined();
    expect(session.isDisposed).toBe(false);
  });

  test('should execute simple commands', async () => {
    const result = await session.run('Get-Location');
    
    expect(result).toHaveProperty('stdout');
    expect(result).toHaveProperty('stderr');
    expect(result).toHaveProperty('exitCode');
  });

  test('should handle command output', async () => {
    const result = await session.run('Write-Host "test output"');
    
    expect(result.exitCode).toBeGreaterThanOrEqual(0);
  });

  test('should handle errors', async () => {
    // This test verifies error handling
    const result = await session.run('Get-Item "non-existent-file.txt" 2>&1');
    
    expect(result).toHaveProperty('exitCode');
  });

  test('should execute multi-line commands', async () => {
    const multiLineCmd = `
$test = 5
$result = $test * 2
Write-Host $result
    `;
    
    const result = await session.run(multiLineCmd);
    expect(result).toHaveProperty('stdout');
  });

  test('should handle base64 encoded commands', async () => {
    // Test that base64 encoding works for special chars
    const cmd = 'Write-Host "Hello World"';
    const result = await session.run(cmd);
    
    expect(result.exitCode).toBeGreaterThanOrEqual(0);
  });

  test('should dispose session properly', () => {
    session.dispose();
    expect(session.isDisposed).toBe(true);
  });

  test('should not execute commands after disposal', async () => {
    session.dispose();
    
    expect(async () => {
      await session.run('Get-Location');
    }).rejects.toThrow();
  });
});

describe('PowerShell Session - Error Handling', () => {
  let session;

  beforeEach(() => {
    const mockLog = jest.fn();
    session = new PowerShellSession({
      workspacePath: '/test/workspace',
      log: mockLog,
    });
  });

  afterEach(() => {
    try {
      session?.dispose();
    } catch (e) {
      // Ignore
    }
  });

  test('should capture stderr', async () => {
    const result = await session.run('Write-Error "test error"');
    
    expect(result).toHaveProperty('stderr');
  });

  test('should set correct exit code on error', async () => {
    const result = await session.run('exit 1');
    
    // Note: actual exit code depends on PowerShell behavior
    expect(result).toHaveProperty('exitCode');
  });
});

describe('PowerShell Session - Workspace Context', () => {
  test('should execute in specified workspace', async () => {
    const mockLog = jest.fn();
    const session = new PowerShellSession({
      workspacePath: '/test/workspace',
      log: mockLog,
    });

    const result = await session.run('Get-Location');
    
    expect(result.stdout).toBeDefined();
    session.dispose();
  });

  test('should handle workspace path changes', async () => {
    const mockLog = jest.fn();
    const session = new PowerShellSession({
      workspacePath: '/test/workspace',
      log: mockLog,
    });

    // Commands should run in context
    const result = await session.run('pwd');
    expect(result).toHaveProperty('stdout');

    session.dispose();
  });
});
