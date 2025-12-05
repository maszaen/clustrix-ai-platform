/**
 * Stress Test for Edit Operations
 * Tests rapid sequential edits and concurrent-like scenarios
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
  const lines = [];
  for (let i = 1; i <= 50; i++) {
    lines.push(`// Line ${i}`);
  }
  fs.writeFileSync(calcPath, lines.join('\n') + '\n');
}

let passed = 0, failed = 0;
function test(name, fn) {
  console.log(`\n=== ${name} ===`);
  const start = Date.now();
  try {
    fn();
    const elapsed = Date.now() - start;
    console.log(`✓ PASSED (${elapsed}ms)`);
    passed++;
  } catch (e) {
    console.log('✗ FAILED:', e.message);
    failed++;
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

// ========== STRESS TESTS ==========

test('STRESS 1: 10 Sequential Edits Same File', () => {
  resetCalc();
  const db = new MockDB();
  
  for (let i = 0; i < 10; i++) {
    const line = i + 1;
    const cmd = `<set file="calculator.js" range={${line}, ${line}}>
<![CDATA[
// Modified Line ${line} - Edit #${i + 1}
]]>
</set>`;
    const r = applySetOperations(cmd, { workspacePath: WORKSPACE, sessionId: 'stress', db });
    assert(r.success, `Edit ${i + 1} should succeed`);
  }
  
  const content = fs.readFileSync(calcPath, 'utf8');
  for (let i = 1; i <= 10; i++) {
    assert(content.includes(`Modified Line ${i}`), `Should have Modified Line ${i}`);
  }
  
  assert(db.edits.length === 10, `Should have 10 edits in history (got ${db.edits.length})`);
});

test('STRESS 2: Undo All 10 Edits', () => {
  resetCalc();
  const db = new MockDB();
  const editIds = [];
  
  // Make 10 edits
  for (let i = 0; i < 10; i++) {
    const line = i + 1;
    const cmd = `<set file="calculator.js" range={${line}, ${line}}>
<![CDATA[
// Edit ${i + 1}
]]>
</set>`;
    const r = applySetOperations(cmd, { workspacePath: WORKSPACE, sessionId: 'stress', db });
    editIds.push(r.files[0].editId);
    // Small delay for timestamp ordering
    const wait = (ms) => { const end = Date.now() + ms; while(Date.now() < end); };
    wait(5);
  }
  
  // Undo from first edit (should cascade all)
  const undoResult = undoEdit(editIds[0], { workspacePath: WORKSPACE, db, sessionId: 'stress' });
  assert(undoResult.success, 'Undo should succeed');
  
  const content = fs.readFileSync(calcPath, 'utf8');
  assert(!content.includes('Edit 1'), 'All edits should be undone');
  assert(content.includes('// Line 1'), 'Original content should be restored');
});

test('STRESS 3: Large Content Edit (1000 lines)', () => {
  resetCalc();
  
  const largeContent = [];
  for (let i = 0; i < 1000; i++) {
    largeContent.push(`// Generated line ${i + 1}`);
  }
  
  const cmd = `<set file="calculator.js" range={1, 50}>
<![CDATA[
${largeContent.join('\n')}
]]>
</set>`;
  
  const r = applySetOperations(cmd, { workspacePath: WORKSPACE });
  assert(r.success, 'Large edit should succeed');
  
  const content = fs.readFileSync(calcPath, 'utf8');
  const lines = content.split('\n');
  assert(lines.length >= 1000, `Should have ~1000 lines (got ${lines.length})`);
});

test('STRESS 4: Rapid Append Operations', () => {
  resetCalc();
  
  for (let i = 0; i < 20; i++) {
    const cmd = `<set file="calculator.js" range={-1}>
<![CDATA[
// Appended ${i + 1}
]]>
</set>`;
    const r = applySetOperations(cmd, { workspacePath: WORKSPACE });
    assert(r.success, `Append ${i + 1} should succeed`);
  }
  
  const content = fs.readFileSync(calcPath, 'utf8');
  assert(content.includes('Appended 1'), 'Should have first append');
  assert(content.includes('Appended 20'), 'Should have last append');
});

test('STRESS 5: Multiple Files Simultaneous', () => {
  resetCalc();
  fs.writeFileSync(path.join(WORKSPACE, 'file1.js'), '// File 1\n');
  fs.writeFileSync(path.join(WORKSPACE, 'file2.js'), '// File 2\n');
  fs.writeFileSync(path.join(WORKSPACE, 'file3.js'), '// File 3\n');
  
  const cmd = `<set file="file1.js" range={1}>
<![CDATA[
// Modified File 1
]]>
</set>
<set file="file2.js" range={1}>
<![CDATA[
// Modified File 2
]]>
</set>
<set file="file3.js" range={1}>
<![CDATA[
// Modified File 3
]]>
</set>`;
  
  const r = applySetOperations(cmd, { workspacePath: WORKSPACE });
  assert(r.success, 'Multi-file edit should succeed');
  assert(r.files.length === 3, 'Should modify 3 files');
  
  // Verify all files
  for (let i = 1; i <= 3; i++) {
    const content = fs.readFileSync(path.join(WORKSPACE, `file${i}.js`), 'utf8');
    assert(content.includes(`Modified File ${i}`), `File ${i} should be modified`);
  }
  
  // Cleanup
  fs.unlinkSync(path.join(WORKSPACE, 'file1.js'));
  fs.unlinkSync(path.join(WORKSPACE, 'file2.js'));
  fs.unlinkSync(path.join(WORKSPACE, 'file3.js'));
});

test('STRESS 6: Edit History Integrity', () => {
  resetCalc();
  const db = new MockDB();
  
  // Make edits to different files
  const files = ['calculator.js', 'utils.js'];
  
  for (const file of files) {
    for (let i = 0; i < 5; i++) {
      const cmd = `<set file="${file}" range={1}>
<![CDATA[
// ${file} edit ${i + 1}
]]>
</set>`;
      applySetOperations(cmd, { workspacePath: WORKSPACE, sessionId: 'integrity', db });
    }
  }
  
  assert(db.edits.length === 10, `Should have 10 edits (got ${db.edits.length})`);
  
  // Verify each file has 5 edits
  const calcEdits = db.edits.filter(e => e.file_path === 'calculator.js');
  const utilsEdits = db.edits.filter(e => e.file_path === 'utils.js');
  assert(calcEdits.length === 5, 'Calculator should have 5 edits');
  assert(utilsEdits.length === 5, 'Utils should have 5 edits');
});

// ========== SUMMARY ==========
console.log('\n' + '='.repeat(50));
console.log(`STRESS TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
if (failed === 0) {
  console.log('🎉 ALL STRESS TESTS PASSED!');
} else {
  console.log('⚠️  Some stress tests failed');
}

// Reset
resetCalc();
