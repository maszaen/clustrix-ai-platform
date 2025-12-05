/**
 * Manual Test Script for Edit Operations
 * Run: node backend/codes/manual-test-edit.js
 * 
 * This tests the EXACT same logic used by the coding agents
 */

const fs = require('fs');
const path = require('path');
const { applySetOperations, undoEdit, getFormattedEditHistory } = require('./edit-operations');

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(color, ...args) {
  console.log(color, ...args, colors.reset);
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  log(colors.cyan, `  ${title}`);
  console.log('='.repeat(60));
}

function logResult(success, message) {
  if (success) {
    log(colors.green, `✓ PASS: ${message}`);
  } else {
    log(colors.red, `✗ FAIL: ${message}`);
  }
}

function showFileContent(filePath, label = 'File Content') {
  if (!fs.existsSync(filePath)) {
    log(colors.yellow, `[${label}] File does not exist: ${filePath}`);
    return;
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  console.log(`\n[${label}] ${filePath} (${lines.length} lines):`);
  console.log('-'.repeat(40));
  lines.forEach((line, idx) => {
    console.log(`${String(idx + 1).padStart(3)}: ${line}`);
  });
  console.log('-'.repeat(40));
}

// Mock database for edit history
class MockDB {
  constructor() {
    this.editHistory = [];
  }
  
  saveEditHistory(sessionId, editId, filePath, opType, start, end, before, after, diff) {
    this.editHistory.push({
      id: editId,
      session_id: sessionId,
      file_path: filePath,
      operation_type: opType,
      range_start: start,
      range_end: end,
      before_content: before,
      after_content: after,
      diff: diff,
      created_at: Date.now()
    });
    console.log(`[DB] Saved edit: ${editId} (${opType})`);
  }
  
  getEditHistory(sessionId, limit = 20) {
    return this.editHistory
      .filter(e => e.session_id === sessionId)
      .sort((a, b) => b.created_at - a.created_at)
      .slice(0, limit);
  }
  
  getEditById(editId) {
    return this.editHistory.find(e => e.id === editId);
  }
  
  getEditsAfter(sessionId, editId) {
    const target = this.getEditById(editId);
    if (!target) return [];
    return this.editHistory
      .filter(e => e.session_id === sessionId && e.created_at >= target.created_at)
      .sort((a, b) => b.created_at - a.created_at);
  }
  
  deleteEditHistoryBatch(editIds) {
    this.editHistory = this.editHistory.filter(e => !editIds.includes(e.id));
  }
}

// Workspace setup
const WORKSPACE = path.resolve(__dirname, '../../edit-operations-workspace');
const SESSION_ID = 'test-session-001';

function resetWorkspace() {
  // Reset calculator.js
  fs.writeFileSync(path.join(WORKSPACE, 'calculator.js'), `// Simple Calculator Module
// Version 1.0.0

function add(a, b) {
  return a + b;
}

function subtract(a, b) {
  return a - b;
}

function multiply(a, b) {
  return a * b;
}

function divide(a, b) {
  if (b === 0) {
    throw new Error('Division by zero');
  }
  return a / b;
}

module.exports = { add, subtract, multiply, divide };
`, 'utf8');

  // Reset utils.js
  fs.writeFileSync(path.join(WORKSPACE, 'utils.js'), `// Utility Functions
// Helper module for common operations

function formatNumber(num, decimals = 2) {
  return Number(num.toFixed(decimals));
}

function isValidNumber(value) {
  return typeof value === 'number' && !isNaN(value);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sum(arr) {
  return arr.reduce((acc, val) => acc + val, 0);
}

function average(arr) {
  if (arr.length === 0) return 0;
  return sum(arr) / arr.length;
}

module.exports = {
  formatNumber,
  isValidNumber,
  clamp,
  randomInt,
  sum,
  average
};
`, 'utf8');
}

// ============================================
// TEST CASES
// ============================================

async function runTests() {
  const db = new MockDB();
  let testsPassed = 0;
  let testsFailed = 0;
  
  // ==========================================
  // TEST 1: Basic Replace
  // ==========================================
  logSection('TEST 1: Basic Replace (line 4-6)');
  resetWorkspace();
  showFileContent(path.join(WORKSPACE, 'calculator.js'), 'BEFORE');
  
  const test1Command = `<set file="calculator.js" range={4, 6}>
<![CDATA[
function add(a, b) {
  // Enhanced add with logging
  console.log('Adding:', a, '+', b);
  return a + b;
}
]]>
</set>`;
  
  console.log('\n[COMMAND]:', test1Command);
  
  try {
    const result = applySetOperations(test1Command, { 
      workspacePath: WORKSPACE, 
      sessionId: SESSION_ID, 
      db 
    });
    
    console.log('\n[RESULT]:', result.success ? 'SUCCESS' : 'FAILED');
    console.log('[DIFF]:\n', result.text);
    
    showFileContent(path.join(WORKSPACE, 'calculator.js'), 'AFTER');
    
    // Verify
    const content = fs.readFileSync(path.join(WORKSPACE, 'calculator.js'), 'utf8');
    const hasLogging = content.includes('console.log');
    logResult(hasLogging, 'Replace operation added logging');
    if (hasLogging) testsPassed++; else testsFailed++;
  } catch (e) {
    log(colors.red, '[ERROR]:', e.message);
    testsFailed++;
  }
  
  // ==========================================
  // TEST 2: Insert Before Line
  // ==========================================
  logSection('TEST 2: Insert Before Line (add={1})');
  resetWorkspace();
  showFileContent(path.join(WORKSPACE, 'calculator.js'), 'BEFORE');
  
  const test2Command = `<set file="calculator.js" add={1}>
<![CDATA[
/**
 * @fileoverview Calculator module with basic math operations
 * @author Test Suite
 */
]]>
</set>`;
  
  console.log('\n[COMMAND]:', test2Command);
  
  try {
    const result = applySetOperations(test2Command, { 
      workspacePath: WORKSPACE, 
      sessionId: SESSION_ID, 
      db 
    });
    
    console.log('\n[RESULT]:', result.success ? 'SUCCESS' : 'FAILED');
    showFileContent(path.join(WORKSPACE, 'calculator.js'), 'AFTER');
    
    const content = fs.readFileSync(path.join(WORKSPACE, 'calculator.js'), 'utf8');
    const hasJSDoc = content.startsWith('/**');
    logResult(hasJSDoc, 'Insert at beginning added JSDoc');
    if (hasJSDoc) testsPassed++; else testsFailed++;
  } catch (e) {
    log(colors.red, '[ERROR]:', e.message);
    testsFailed++;
  }
  
  // ==========================================
  // TEST 3: Append to End
  // ==========================================
  logSection('TEST 3: Append to End (range={-1})');
  resetWorkspace();
  showFileContent(path.join(WORKSPACE, 'calculator.js'), 'BEFORE');
  
  const test3Command = `<set file="calculator.js" range={-1}>
<![CDATA[

// New function appended
function power(base, exp) {
  return Math.pow(base, exp);
}
]]>
</set>`;
  
  console.log('\n[COMMAND]:', test3Command);
  
  try {
    const result = applySetOperations(test3Command, { 
      workspacePath: WORKSPACE, 
      sessionId: SESSION_ID, 
      db 
    });
    
    console.log('\n[RESULT]:', result.success ? 'SUCCESS' : 'FAILED');
    showFileContent(path.join(WORKSPACE, 'calculator.js'), 'AFTER');
    
    const content = fs.readFileSync(path.join(WORKSPACE, 'calculator.js'), 'utf8');
    const hasPower = content.includes('function power');
    logResult(hasPower, 'Append added power function');
    if (hasPower) testsPassed++; else testsFailed++;
  } catch (e) {
    log(colors.red, '[ERROR]:', e.message);
    testsFailed++;
  }
  
  // ==========================================
  // TEST 4: Delete Lines
  // ==========================================
  logSection('TEST 4: Delete Lines (range={8,10} with empty content)');
  resetWorkspace();
  showFileContent(path.join(WORKSPACE, 'calculator.js'), 'BEFORE');
  
  const test4Command = `<set file="calculator.js" range={8, 10}>
<![CDATA[]]>
</set>`;
  
  console.log('\n[COMMAND]:', test4Command);
  
  try {
    const result = applySetOperations(test4Command, { 
      workspacePath: WORKSPACE, 
      sessionId: SESSION_ID, 
      db 
    });
    
    console.log('\n[RESULT]:', result.success ? 'SUCCESS' : 'FAILED');
    showFileContent(path.join(WORKSPACE, 'calculator.js'), 'AFTER');
    
    const content = fs.readFileSync(path.join(WORKSPACE, 'calculator.js'), 'utf8');
    const noSubtract = !content.includes('function subtract');
    logResult(noSubtract, 'Delete removed subtract function');
    if (noSubtract) testsPassed++; else testsFailed++;
  } catch (e) {
    log(colors.red, '[ERROR]:', e.message);
    testsFailed++;
  }
  
  // ==========================================
  // TEST 5: Multiple Edits Same File
  // ==========================================
  logSection('TEST 5: Multiple Edits Same File (descending order)');
  resetWorkspace();
  showFileContent(path.join(WORKSPACE, 'calculator.js'), 'BEFORE');
  
  const test5Command = `<set file="calculator.js" range={4, 6}>
<![CDATA[
function add(a, b) {
  return a + b + 0; // Modified
}
]]>
</set>
<set file="calculator.js" range={12, 14}>
<![CDATA[
function multiply(a, b) {
  return a * b * 1; // Modified
}
]]>
</set>`;
  
  console.log('\n[COMMAND]:', test5Command);
  
  try {
    const result = applySetOperations(test5Command, { 
      workspacePath: WORKSPACE, 
      sessionId: SESSION_ID, 
      db 
    });
    
    console.log('\n[RESULT]:', result.success ? 'SUCCESS' : 'FAILED');
    showFileContent(path.join(WORKSPACE, 'calculator.js'), 'AFTER');
    
    const content = fs.readFileSync(path.join(WORKSPACE, 'calculator.js'), 'utf8');
    const hasAddMod = content.includes('a + b + 0');
    const hasMulMod = content.includes('a * b * 1');
    logResult(hasAddMod && hasMulMod, 'Multiple edits applied correctly');
    if (hasAddMod && hasMulMod) testsPassed++; else testsFailed++;
  } catch (e) {
    log(colors.red, '[ERROR]:', e.message);
    testsFailed++;
  }
  
  // ==========================================
  // TEST 6: Create New File
  // ==========================================
  logSection('TEST 6: Create New File');
  const newFilePath = path.join(WORKSPACE, 'newfile.js');
  if (fs.existsSync(newFilePath)) fs.unlinkSync(newFilePath);
  
  const test6Command = `<set file="newfile.js" range={1}>
<![CDATA[
// Brand new file
function hello() {
  return 'Hello World';
}

module.exports = { hello };
]]>
</set>`;
  
  console.log('\n[COMMAND]:', test6Command);
  
  try {
    const result = applySetOperations(test6Command, { 
      workspacePath: WORKSPACE, 
      sessionId: SESSION_ID, 
      db 
    });
    
    console.log('\n[RESULT]:', result.success ? 'SUCCESS' : 'FAILED');
    showFileContent(newFilePath, 'NEW FILE');
    
    const exists = fs.existsSync(newFilePath);
    logResult(exists, 'New file created');
    if (exists) testsPassed++; else testsFailed++;
  } catch (e) {
    log(colors.red, '[ERROR]:', e.message);
    testsFailed++;
  }
  
  // ==========================================
  // TEST 7: File Not Found Suggestion
  // ==========================================
  logSection('TEST 7: File Not Found with Suggestions');
  
  const test7Command = `<set file="calculater.js" range={1, 2}>
<![CDATA[
// typo test
]]>
</set>`;
  
  console.log('\n[COMMAND]:', test7Command);
  
  try {
    applySetOperations(test7Command, { workspacePath: WORKSPACE });
    log(colors.red, 'Should have thrown error!');
    testsFailed++;
  } catch (e) {
    console.log('\n[ERROR MESSAGE]:', e.message);
    const hasSuggestion = e.message.includes('Did you mean');
    logResult(hasSuggestion, 'Error includes file suggestions');
    if (hasSuggestion) testsPassed++; else testsFailed++;
  }
  
  // ==========================================
  // TEST 8: Range Exceeds File Length
  // ==========================================
  logSection('TEST 8: Range Exceeds File Length');
  resetWorkspace();
  
  const test8Command = `<set file="calculator.js" range={100, 110}>
<![CDATA[
// This should fail
]]>
</set>`;
  
  console.log('\n[COMMAND]:', test8Command);
  
  try {
    applySetOperations(test8Command, { workspacePath: WORKSPACE });
    log(colors.red, 'Should have thrown error!');
    testsFailed++;
  } catch (e) {
    console.log('\n[ERROR MESSAGE]:', e.message);
    const hasRangeError = e.message.includes('outside') || e.message.includes('bounds');
    logResult(hasRangeError, 'Error for out-of-bounds range');
    if (hasRangeError) testsPassed++; else testsFailed++;
  }
  
  // ==========================================
  // TEST 9: Undo Single Edit
  // ==========================================
  logSection('TEST 9: Undo Single Edit');
  resetWorkspace();
  const db9 = new MockDB();
  
  showFileContent(path.join(WORKSPACE, 'calculator.js'), 'ORIGINAL');
  
  // First, make an edit
  const test9EditCommand = `<set file="calculator.js" range={4, 6}>
<![CDATA[
function add(a, b) {
  // MODIFIED FOR UNDO TEST
  return a + b;
}
]]>
</set>`;
  
  const editResult = applySetOperations(test9EditCommand, { 
    workspacePath: WORKSPACE, 
    sessionId: SESSION_ID, 
    db: db9 
  });
  
  const editId = editResult.files?.[0]?.editId;
  console.log('\n[EDIT MADE] Edit ID:', editId);
  showFileContent(path.join(WORKSPACE, 'calculator.js'), 'AFTER EDIT');
  
  // Now undo
  console.log('\n[ATTEMPTING UNDO]...');
  const undoResult = undoEdit(editId, {
    workspacePath: WORKSPACE,
    db: db9,
    sessionId: SESSION_ID,
    dryRun: false
  });
  
  console.log('\n[UNDO RESULT]:', undoResult.success ? 'SUCCESS' : 'FAILED');
  console.log('[UNDO OUTPUT]:', undoResult.output);
  showFileContent(path.join(WORKSPACE, 'calculator.js'), 'AFTER UNDO');
  
  const contentAfterUndo = fs.readFileSync(path.join(WORKSPACE, 'calculator.js'), 'utf8');
  const undoWorked = !contentAfterUndo.includes('MODIFIED FOR UNDO TEST');
  logResult(undoWorked, 'Undo restored original content');
  if (undoWorked) testsPassed++; else testsFailed++;
  
  // ==========================================
  // TEST 10: Edit History Display
  // ==========================================
  logSection('TEST 10: Edit History Display');
  resetWorkspace();
  const db10 = new MockDB();
  
  // Make several edits
  applySetOperations(`<set file="calculator.js" range={1}>
<![CDATA[
// Edit 1
]]>
</set>`, { workspacePath: WORKSPACE, sessionId: SESSION_ID, db: db10 });
  
  applySetOperations(`<set file="utils.js" range={1}>
<![CDATA[
// Edit 2
]]>
</set>`, { workspacePath: WORKSPACE, sessionId: SESSION_ID, db: db10 });
  
  const history = db10.getEditHistory(SESSION_ID);
  console.log('\n[EDIT HISTORY]:');
  history.forEach(h => {
    console.log(`  - ${h.id}: ${h.file_path} (${h.operation_type})`);
  });
  
  logResult(history.length === 2, `Edit history has ${history.length} entries`);
  if (history.length === 2) testsPassed++; else testsFailed++;
  
  // ==========================================
  // SUMMARY
  // ==========================================
  logSection('TEST SUMMARY');
  console.log(`\nTotal Tests: ${testsPassed + testsFailed}`);
  log(colors.green, `Passed: ${testsPassed}`);
  log(colors.red, `Failed: ${testsFailed}`);
  
  if (testsFailed === 0) {
    log(colors.green, '\n🎉 ALL TESTS PASSED! Ready for production.');
  } else {
    log(colors.red, `\n⚠️  ${testsFailed} test(s) failed. Review above.`);
  }
}

// Run
runTests().catch(console.error);
