const fs = require('fs');
const path = require('path');
const { applySetOperations, undoEdit } = require('./edit-operations');

const WORKSPACE = path.resolve(__dirname, '../../edit-operations-workspace');
const calcPath = path.join(WORKSPACE, 'calculator.js');
const utilsPath = path.join(WORKSPACE, 'utils.js');

// Mock DB
class MockDB {
  constructor() { this.edits = []; }
  saveEditHistory(sid, eid, fp, op, s, e, before, after, diff) {
    this.edits.push({ id: eid, session_id: sid, file_path: fp, operation_type: op, 
      range_start: s, range_end: e, before_content: before, after_content: after, 
      diff, created_at: Date.now() });
  }
  getEditById(id) { return this.edits.find(e => e.id === id); }
  getEditsAfter(sid, id) {
    const t = this.getEditById(id);
    if (!t) return [];
    return this.edits.filter(e => e.session_id === sid && e.created_at >= t.created_at)
      .sort((a,b) => b.created_at - a.created_at);
  }
  deleteEditHistoryBatch(ids) { this.edits = this.edits.filter(e => !ids.includes(e.id)); }
  getEditHistory(sid) { return this.edits.filter(e => e.session_id === sid); }
}

function resetFiles() {
  fs.writeFileSync(calcPath, `// Simple Calculator Module
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
`);
  fs.writeFileSync(utilsPath, `// Utility Functions
function formatNumber(num) {
  return num.toFixed(2);
}
function sum(arr) {
  return arr.reduce((a, b) => a + b, 0);
}
module.exports = { formatNumber, sum };
`);
}

let passed = 0, failed = 0;
function test(name, fn) {
  console.log(`\n=== ${name} ===`);
  try {
    fn();
    console.log('✓ PASSED');
    passed++;
  } catch (e) {
    console.log('✗ FAILED:', e.message);
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}

// ========== TESTS ==========

test('TEST 1: Basic Replace', () => {
  resetFiles();
  const cmd = `<set file="calculator.js" range={4, 6}>
<![CDATA[
function add(a, b) {
  console.log('Adding');
  return a + b;
}
]]>
</set>`;
  const r = applySetOperations(cmd, { workspacePath: WORKSPACE });
  assert(r.success, 'Should succeed');
  const content = fs.readFileSync(calcPath, 'utf8');
  assert(content.includes('console.log'), 'Should have console.log');
});

test('TEST 2: Insert at Beginning (add={1})', () => {
  resetFiles();
  const cmd = `<set file="calculator.js" add={1}>
<![CDATA[
/** JSDoc Header */
]]>
</set>`;
  const r = applySetOperations(cmd, { workspacePath: WORKSPACE });
  assert(r.success, 'Should succeed');
  const content = fs.readFileSync(calcPath, 'utf8');
  assert(content.startsWith('/** JSDoc'), 'Should start with JSDoc');
});

test('TEST 3: Append to End (range={-1})', () => {
  resetFiles();
  const cmd = `<set file="calculator.js" range={-1}>
<![CDATA[

function power(a, b) {
  return Math.pow(a, b);
}
]]>
</set>`;
  const r = applySetOperations(cmd, { workspacePath: WORKSPACE });
  assert(r.success, 'Should succeed');
  const content = fs.readFileSync(calcPath, 'utf8');
  assert(content.includes('function power'), 'Should have power function');
});

test('TEST 4: Delete Lines', () => {
  resetFiles();
  const cmd = `<set file="calculator.js" range={8, 10}>
<![CDATA[]]>
</set>`;
  const r = applySetOperations(cmd, { workspacePath: WORKSPACE });
  assert(r.success, 'Should succeed');
  const content = fs.readFileSync(calcPath, 'utf8');
  assert(!content.includes('function subtract'), 'Should NOT have subtract');
});

test('TEST 5: Multiple Edits Same File', () => {
  resetFiles();
  const cmd = `<set file="calculator.js" range={4, 6}>
<![CDATA[
function add(a, b) {
  return a + b + 0;
}
]]>
</set>
<set file="calculator.js" range={12, 14}>
<![CDATA[
function multiply(a, b) {
  return a * b * 1;
}
]]>
</set>`;
  const r = applySetOperations(cmd, { workspacePath: WORKSPACE });
  assert(r.success, 'Should succeed');
  const content = fs.readFileSync(calcPath, 'utf8');
  assert(content.includes('a + b + 0'), 'Should have modified add');
  assert(content.includes('a * b * 1'), 'Should have modified multiply');
});

test('TEST 6: Create New File', () => {
  const newPath = path.join(WORKSPACE, 'newfile.js');
  if (fs.existsSync(newPath)) fs.unlinkSync(newPath);
  
  const cmd = `<set file="newfile.js" range={1}>
<![CDATA[
// New file
function hello() { return 'hi'; }
module.exports = { hello };
]]>
</set>`;
  const r = applySetOperations(cmd, { workspacePath: WORKSPACE });
  assert(r.success, 'Should succeed');
  assert(fs.existsSync(newPath), 'File should exist');
  fs.unlinkSync(newPath);
});

test('TEST 7: File Not Found Suggestion', () => {
  resetFiles();
  const cmd = `<set file="calculater.js" range={1}>
<![CDATA[test]]>
</set>`;
  try {
    applySetOperations(cmd, { workspacePath: WORKSPACE });
    throw new Error('Should have thrown');
  } catch (e) {
    assert(e.message.includes('Did you mean'), 'Should suggest similar file');
  }
});

test('TEST 8: Range Out of Bounds', () => {
  resetFiles();
  const cmd = `<set file="calculator.js" range={100, 110}>
<![CDATA[test]]>
</set>`;
  try {
    applySetOperations(cmd, { workspacePath: WORKSPACE });
    throw new Error('Should have thrown');
  } catch (e) {
    assert(e.message.includes('outside') || e.message.includes('bounds'), 'Should error on bounds');
  }
});

test('TEST 9: Undo Single Edit', () => {
  resetFiles();
  const db = new MockDB();
  const original = fs.readFileSync(calcPath, 'utf8');
  
  // Make edit
  const cmd = `<set file="calculator.js" range={4, 6}>
<![CDATA[
function add(a, b) {
  // MODIFIED
  return a + b;
}
]]>
</set>`;
  const r = applySetOperations(cmd, { workspacePath: WORKSPACE, sessionId: 'test', db });
  const editId = r.files[0].editId;
  
  // Verify edit applied
  let content = fs.readFileSync(calcPath, 'utf8');
  assert(content.includes('// MODIFIED'), 'Edit should be applied');
  
  // Undo
  const undoResult = undoEdit(editId, { workspacePath: WORKSPACE, db, sessionId: 'test' });
  console.log('  Undo result:', undoResult.success ? 'OK' : undoResult.output);
  
  content = fs.readFileSync(calcPath, 'utf8');
  assert(!content.includes('// MODIFIED'), 'Undo should restore original');
});

test('TEST 10: Multiple Files Edit', () => {
  resetFiles();
  const cmd = `<set file="calculator.js" range={1}>
<![CDATA[
// Modified calc
]]>
</set>
<set file="utils.js" range={1}>
<![CDATA[
// Modified utils
]]>
</set>`;
  const r = applySetOperations(cmd, { workspacePath: WORKSPACE });
  assert(r.success, 'Should succeed');
  assert(r.files.length === 2, 'Should modify 2 files');
  
  const calc = fs.readFileSync(calcPath, 'utf8');
  const utils = fs.readFileSync(utilsPath, 'utf8');
  assert(calc.includes('Modified calc'), 'Calc should be modified');
  assert(utils.includes('Modified utils'), 'Utils should be modified');
});

// ========== SUMMARY ==========
console.log('\n' + '='.repeat(50));
console.log(`TOTAL: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
if (failed === 0) {
  console.log('🎉 ALL TESTS PASSED!');
} else {
  console.log('⚠️  Some tests failed');
}
