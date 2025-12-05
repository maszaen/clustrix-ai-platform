/**
 * Slow Manual Test - Step by Step with File Reading
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
    console.log(`  [DB] Saved: ${eid}`);
  }
  getEditById(id) { return this.edits.find(e => e.id === id); }
  getEditsAfter(sid, id) {
    const t = this.getEditById(id);
    if (!t) return [];
    return this.edits.filter(e => e.session_id === sid && e.created_at >= t.created_at)
      .sort((a,b) => b.created_at - a.created_at);
  }
  deleteEditHistoryBatch(ids) { 
    console.log(`  [DB] Deleting: ${ids.join(', ')}`);
    this.edits = this.edits.filter(e => !ids.includes(e.id)); 
  }
  getEditHistory() { return this.edits; }
}

function showFile(label) {
  const content = fs.readFileSync(calcPath, 'utf8');
  const lines = content.split('\n');
  console.log(`\n[${label}] calculator.js (${lines.length} lines):`);
  console.log('-'.repeat(50));
  lines.forEach((line, i) => console.log(`${String(i+1).padStart(2)}: ${line}`));
  console.log('-'.repeat(50));
  return content;
}

function resetFile() {
  fs.writeFileSync(calcPath, `// Calculator Module
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

const db = new MockDB();
const SESSION = 'slow-test';

// Small delay helper
function wait(ms) { const end = Date.now() + ms; while(Date.now() < end); }

console.log('='.repeat(60));
console.log('SLOW MANUAL TEST - STEP BY STEP');
console.log('='.repeat(60));

// ============================================
// STEP 1: Reset and show original
// ============================================
console.log('\n>>> STEP 1: Reset file to original state');
resetFile();
showFile('ORIGINAL');

// ============================================
// STEP 2: Edit - Replace line 2-4
// ============================================
console.log('\n>>> STEP 2: Edit - Replace lines 2-4 (add function)');
const edit1Cmd = `<set file="calculator.js" range={2, 4}>
<![CDATA[
function add(a, b) {
  console.log('EDIT 1: Adding', a, b);
  return a + b;
}
]]>
</set>`;
console.log('Command:', edit1Cmd.slice(0, 80) + '...');

const result1 = applySetOperations(edit1Cmd, { workspacePath: WORKSPACE, sessionId: SESSION, db });
console.log('Result:', result1.success ? 'SUCCESS' : 'FAILED');
const editId1 = result1.files?.[0]?.editId;
console.log('Edit ID:', editId1);
wait(50);

showFile('AFTER EDIT 1');

// ============================================
// STEP 3: Undo 1x
// ============================================
console.log('\n>>> STEP 3: Undo Edit 1');
const undo1 = undoEdit(editId1, { workspacePath: WORKSPACE, db, sessionId: SESSION });
console.log('Undo Result:', undo1.success ? 'SUCCESS' : 'FAILED');
console.log('Undo Output:', undo1.output.slice(0, 200));

showFile('AFTER UNDO 1');

// ============================================
// STEP 4: Make 3 edits
// ============================================
console.log('\n>>> STEP 4: Make 3 sequential edits');
resetFile();
showFile('RESET');

// Edit A
const editA = `<set file="calculator.js" range={1, 1}>
<![CDATA[
// EDIT A: Modified header
]]>
</set>`;
const resA = applySetOperations(editA, { workspacePath: WORKSPACE, sessionId: SESSION, db });
const idA = resA.files?.[0]?.editId;
console.log('Edit A:', idA);
wait(50);

// Edit B
const editB = `<set file="calculator.js" range={6, 8}>
<![CDATA[
function subtract(a, b) {
  console.log('EDIT B');
  return a - b;
}
]]>
</set>`;
const resB = applySetOperations(editB, { workspacePath: WORKSPACE, sessionId: SESSION, db });
const idB = resB.files?.[0]?.editId;
console.log('Edit B:', idB);
wait(50);

// Edit C
const editC = `<set file="calculator.js" range={11, 13}>
<![CDATA[
function multiply(a, b) {
  console.log('EDIT C');
  return a * b;
}
]]>
</set>`;
const resC = applySetOperations(editC, { workspacePath: WORKSPACE, sessionId: SESSION, db });
const idC = resC.files?.[0]?.editId;
console.log('Edit C:', idC);

showFile('AFTER 3 EDITS (A, B, C)');

// ============================================
// STEP 5: Undo 3x (cascade from A)
// ============================================
console.log('\n>>> STEP 5: Undo from Edit A (should cascade B and C too)');
console.log('Edit history before undo:', db.edits.map(e => e.id));

const undo3 = undoEdit(idA, { workspacePath: WORKSPACE, db, sessionId: SESSION });
console.log('Undo Result:', undo3.success ? 'SUCCESS' : 'FAILED');
console.log('Edits undone:', undo3.editIds?.length || 0);

showFile('AFTER UNDO 3 (CASCADE)');

console.log('Edit history after undo:', db.edits.map(e => e.id));

// ============================================
// STEP 6: Append then Undo
// ============================================
console.log('\n>>> STEP 6: Append to end, then Undo');
resetFile();
db.edits = []; // Clear history
showFile('RESET');

const appendCmd = `<set file="calculator.js" range={-1}>
<![CDATA[

// APPENDED CONTENT
function power(a, b) {
  return Math.pow(a, b);
}
]]>
</set>`;
const appendRes = applySetOperations(appendCmd, { workspacePath: WORKSPACE, sessionId: SESSION, db });
const appendId = appendRes.files?.[0]?.editId;
console.log('Append Edit ID:', appendId);

showFile('AFTER APPEND');

const undoAppend = undoEdit(appendId, { workspacePath: WORKSPACE, db, sessionId: SESSION });
console.log('Undo Append:', undoAppend.success ? 'SUCCESS' : 'FAILED');

showFile('AFTER UNDO APPEND');

// ============================================
// STEP 7: Delete lines then Undo
// ============================================
console.log('\n>>> STEP 7: Delete lines 6-9 (subtract function), then Undo');
resetFile();
db.edits = [];
showFile('RESET');

const deleteCmd = `<set file="calculator.js" range={6, 9}>
<![CDATA[]]>
</set>`;
const deleteRes = applySetOperations(deleteCmd, { workspacePath: WORKSPACE, sessionId: SESSION, db });
const deleteId = deleteRes.files?.[0]?.editId;
console.log('Delete Edit ID:', deleteId);

showFile('AFTER DELETE');

const undoDelete = undoEdit(deleteId, { workspacePath: WORKSPACE, db, sessionId: SESSION });
console.log('Undo Delete:', undoDelete.success ? 'SUCCESS' : 'FAILED');

showFile('AFTER UNDO DELETE');

// ============================================
// SUMMARY
// ============================================
console.log('\n' + '='.repeat(60));
console.log('TEST COMPLETE');
console.log('='.repeat(60));

// Reset
resetFile();
