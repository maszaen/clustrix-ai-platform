/**
 * Edge Case Tests for Edit Operations
 * Tests critical scenarios that could cause data loss
 */

const fs = require('fs');
const path = require('path');
const { applySetOperations, undoEdit } = require('./edit-operations');

const WORKSPACE = path.resolve(__dirname, '../../edit-operations-workspace');
const calcPath = path.join(WORKSPACE, 'calculator.js');

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
}

function resetCalc() {
  fs.writeFileSync(calcPath, `// Calculator
function add(a, b) {
  return a + b;
}
function subtract(a, b) {
  return a - b;
}
function multiply(a, b) {
  return a * b;
}
module.exports = { add, subtract, multiply };
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
function assert(cond, msg) { if (!cond) throw new Error(msg); }

// ========== EDGE CASE TESTS ==========

test('EDGE 1: Empty Content Replace (Delete)', () => {
  resetCalc();
  const before = fs.readFileSync(calcPath, 'utf8');
  const linesBefore = before.split('\n').length;
  
  const cmd = `<set file="calculator.js" range={2, 4}>
<![CDATA[]]>
</set>`;
  const r = applySetOperations(cmd, { workspacePath: WORKSPACE });
  assert(r.success, 'Should succeed');
  
  const after = fs.readFileSync(calcPath, 'utf8');
  const linesAfter = after.split('\n').length;
  assert(linesAfter < linesBefore, `Lines should decrease (${linesBefore} -> ${linesAfter})`);
  assert(!after.includes('function add'), 'add function should be deleted');
});

test('EDGE 2: Single Line Replace', () => {
  resetCalc();
  const cmd = `<set file="calculator.js" range={1, 1}>
<![CDATA[
// Modified Calculator v2
]]>
</set>`;
  const r = applySetOperations(cmd, { workspacePath: WORKSPACE });
  assert(r.success, 'Should succeed');
  const content = fs.readFileSync(calcPath, 'utf8');
  assert(content.includes('v2'), 'Should have v2');
});

test('EDGE 3: Replace at End of File', () => {
  resetCalc();
  const before = fs.readFileSync(calcPath, 'utf8');
  const lines = before.split('\n');
  const lastLine = lines.length;
  
  const cmd = `<set file="calculator.js" range={${lastLine}, ${lastLine}}>
<![CDATA[
module.exports = { add, subtract, multiply, divide };
]]>
</set>`;
  const r = applySetOperations(cmd, { workspacePath: WORKSPACE });
  assert(r.success, 'Should succeed');
  const content = fs.readFileSync(calcPath, 'utf8');
  assert(content.includes('divide'), 'Should have divide in exports');
});

test('EDGE 4: Insert at Middle', () => {
  resetCalc();
  const cmd = `<set file="calculator.js" add={5}>
<![CDATA[
// Inserted comment
]]>
</set>`;
  const r = applySetOperations(cmd, { workspacePath: WORKSPACE });
  assert(r.success, 'Should succeed');
  const content = fs.readFileSync(calcPath, 'utf8');
  const lines = content.split('\n');
  assert(lines[4].includes('Inserted'), 'Line 5 should be inserted comment');
});

test('EDGE 5: Cascading Undo (2 edits)', () => {
  resetCalc();
  const db = new MockDB();
  const original = fs.readFileSync(calcPath, 'utf8');
  
  // Edit 1
  const cmd1 = `<set file="calculator.js" range={1, 1}>
<![CDATA[
// EDIT 1
]]>
</set>`;
  const r1 = applySetOperations(cmd1, { workspacePath: WORKSPACE, sessionId: 'test', db });
  const editId1 = r1.files[0].editId;
  
  // Small delay to ensure different timestamps
  const wait = (ms) => { const end = Date.now() + ms; while(Date.now() < end); };
  wait(10);
  
  // Edit 2
  const cmd2 = `<set file="calculator.js" range={2, 2}>
<![CDATA[
// EDIT 2
]]>
</set>`;
  const r2 = applySetOperations(cmd2, { workspacePath: WORKSPACE, sessionId: 'test', db });
  const editId2 = r2.files[0].editId;
  
  // Verify both edits applied
  let content = fs.readFileSync(calcPath, 'utf8');
  assert(content.includes('EDIT 1'), 'Should have EDIT 1');
  assert(content.includes('EDIT 2'), 'Should have EDIT 2');
  
  // Undo edit 1 (should cascade and undo edit 2 first)
  const undoResult = undoEdit(editId1, { workspacePath: WORKSPACE, db, sessionId: 'test' });
  console.log('  Undo output:', undoResult.output.slice(0, 100));
  
  content = fs.readFileSync(calcPath, 'utf8');
  assert(!content.includes('EDIT 1'), 'EDIT 1 should be undone');
  assert(!content.includes('EDIT 2'), 'EDIT 2 should also be undone (cascade)');
});

test('EDGE 6: Undo Non-existent Edit', () => {
  const db = new MockDB();
  const result = undoEdit('fake-edit-id', { workspacePath: WORKSPACE, db, sessionId: 'test' });
  assert(!result.success, 'Should fail');
  assert(result.output.includes('not found'), 'Should say not found');
});

test('EDGE 7: Range End Exceeds File (Clamp)', () => {
  resetCalc();
  const before = fs.readFileSync(calcPath, 'utf8');
  const lineCount = before.split('\n').length;
  
  // Try to replace lines 10-100 when file only has ~12 lines
  const cmd = `<set file="calculator.js" range={10, 100}>
<![CDATA[
// Replaced end
]]>
</set>`;
  const r = applySetOperations(cmd, { workspacePath: WORKSPACE });
  assert(r.success, 'Should succeed (clamped)');
  const content = fs.readFileSync(calcPath, 'utf8');
  assert(content.includes('Replaced end'), 'Should have replaced content');
});

test('EDGE 8: Preserve Trailing Newline', () => {
  // Create file with trailing newline
  fs.writeFileSync(calcPath, 'line1\nline2\nline3\n');
  
  const cmd = `<set file="calculator.js" range={2, 2}>
<![CDATA[
modified
]]>
</set>`;
  const r = applySetOperations(cmd, { workspacePath: WORKSPACE });
  assert(r.success, 'Should succeed');
  
  const content = fs.readFileSync(calcPath, 'utf8');
  assert(content.endsWith('\n'), 'Should preserve trailing newline');
});

test('EDGE 9: File Without Trailing Newline', () => {
  // Create file WITHOUT trailing newline
  fs.writeFileSync(calcPath, 'line1\nline2\nline3');
  
  const cmd = `<set file="calculator.js" range={2, 2}>
<![CDATA[
modified
]]>
</set>`;
  const r = applySetOperations(cmd, { workspacePath: WORKSPACE });
  assert(r.success, 'Should succeed');
  
  const content = fs.readFileSync(calcPath, 'utf8');
  assert(!content.endsWith('\n'), 'Should NOT add trailing newline');
});

test('EDGE 10: CRLF Line Endings', () => {
  // Create file with Windows line endings
  fs.writeFileSync(calcPath, 'line1\r\nline2\r\nline3\r\n');
  
  const cmd = `<set file="calculator.js" range={2, 2}>
<![CDATA[
modified
]]>
</set>`;
  const r = applySetOperations(cmd, { workspacePath: WORKSPACE });
  assert(r.success, 'Should succeed');
  
  const content = fs.readFileSync(calcPath, 'utf8');
  assert(content.includes('\r\n'), 'Should preserve CRLF');
});

test('EDGE 11: Empty File Edit', () => {
  fs.writeFileSync(calcPath, '');
  
  const cmd = `<set file="calculator.js" range={1}>
<![CDATA[
// New content for empty file
function test() {}
]]>
</set>`;
  const r = applySetOperations(cmd, { workspacePath: WORKSPACE });
  assert(r.success, 'Should succeed');
  
  const content = fs.readFileSync(calcPath, 'utf8');
  assert(content.includes('function test'), 'Should have content');
});

test('EDGE 12: Special Characters in Content', () => {
  resetCalc();
  const cmd = `<set file="calculator.js" range={1, 1}>
<![CDATA[
// Special: <tag> & "quotes" 'apostrophe' \\ $var
]]>
</set>`;
  const r = applySetOperations(cmd, { workspacePath: WORKSPACE });
  assert(r.success, 'Should succeed');
  
  const content = fs.readFileSync(calcPath, 'utf8');
  assert(content.includes('<tag>'), 'Should have <tag>');
  assert(content.includes('&'), 'Should have &');
  assert(content.includes('"quotes"'), 'Should have quotes');
});

test('EDGE 13: Nested Directory File Creation', () => {
  const nestedPath = path.join(WORKSPACE, 'deep/nested/file.js');
  if (fs.existsSync(nestedPath)) fs.unlinkSync(nestedPath);
  
  const cmd = `<set file="deep/nested/file.js" range={1}>
<![CDATA[
// Nested file
module.exports = {};
]]>
</set>`;
  const r = applySetOperations(cmd, { workspacePath: WORKSPACE });
  assert(r.success, 'Should succeed');
  assert(fs.existsSync(nestedPath), 'Nested file should exist');
  
  // Cleanup
  fs.rmSync(path.join(WORKSPACE, 'deep'), { recursive: true });
});

test('EDGE 14: Path Traversal Prevention', () => {
  try {
    const cmd = `<set file="../outside.js" range={1}>
<![CDATA[malicious]]>
</set>`;
    applySetOperations(cmd, { workspacePath: WORKSPACE });
    throw new Error('Should have thrown');
  } catch (e) {
    assert(e.message.includes('outside'), 'Should prevent path traversal');
  }
});

// ========== SUMMARY ==========
console.log('\n' + '='.repeat(50));
console.log(`EDGE CASES: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
if (failed === 0) {
  console.log('🎉 ALL EDGE CASES PASSED!');
} else {
  console.log('⚠️  Some edge cases failed - REVIEW BEFORE PRODUCTION');
}

// Reset workspace
resetCalc();
