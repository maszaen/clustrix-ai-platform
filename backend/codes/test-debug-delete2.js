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
    console.log('[DB SAVE]');
    console.log('  before_content:', JSON.stringify(before));
    console.log('  after_content:', JSON.stringify(after));
    console.log('  range:', s, '-', e);
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

// Reset - exact same as test-slow.js
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

const db = new MockDB();

console.log('=== ORIGINAL (15 lines) ===');
const orig = fs.readFileSync(calcPath, 'utf8');
console.log(JSON.stringify(orig));
console.log('Lines:', orig.split('\n').length);

// Delete lines 6-9
const cmd = `<set file="calculator.js" range={6, 9}>
<![CDATA[]]>
</set>`;

const res = applySetOperations(cmd, { workspacePath: WORKSPACE, sessionId: 'test', db });
const editId = res.files[0].editId;

console.log('\n=== AFTER DELETE (11 lines) ===');
const afterDel = fs.readFileSync(calcPath, 'utf8');
console.log(JSON.stringify(afterDel));
console.log('Lines:', afterDel.split('\n').length);

// Check saved edit
const saved = db.getEditById(editId);
console.log('\n=== SAVED EDIT ===');
console.log('before_content lines:', saved.before_content.split('\n'));
console.log('after_content:', JSON.stringify(saved.after_content));

// Undo
const undoRes = undoEdit(editId, { workspacePath: WORKSPACE, db, sessionId: 'test' });

console.log('\n=== AFTER UNDO ===');
const afterUndo = fs.readFileSync(calcPath, 'utf8');
console.log(JSON.stringify(afterUndo));
console.log('Lines:', afterUndo.split('\n').length);

console.log('\n=== COMPARISON ===');
console.log('Original === After Undo:', orig === afterUndo);
if (orig !== afterUndo) {
  console.log('Diff:');
  const origLines = orig.split('\n');
  const undoLines = afterUndo.split('\n');
  for (let i = 0; i < Math.max(origLines.length, undoLines.length); i++) {
    if (origLines[i] !== undoLines[i]) {
      console.log(`  Line ${i+1}: "${origLines[i]}" vs "${undoLines[i]}"`);
    }
  }
}
