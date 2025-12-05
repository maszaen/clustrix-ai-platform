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

// Reset
fs.writeFileSync(calcPath, `// Line 1
// Line 2
// Line 3
`);

const db = new MockDB();

console.log('=== ORIGINAL ===');
console.log(JSON.stringify(fs.readFileSync(calcPath, 'utf8')));

// Append
const cmd = `<set file="calculator.js" range={-1}>
<![CDATA[
// Appended
]]>
</set>`;

const res = applySetOperations(cmd, { workspacePath: WORKSPACE, sessionId: 'test', db });
const editId = res.files[0].editId;

console.log('\n=== AFTER APPEND ===');
console.log(JSON.stringify(fs.readFileSync(calcPath, 'utf8')));

// Undo
const undoRes = undoEdit(editId, { workspacePath: WORKSPACE, db, sessionId: 'test' });
console.log('\n=== AFTER UNDO ===');
console.log(JSON.stringify(fs.readFileSync(calcPath, 'utf8')));
console.log('Undo success:', undoRes.success);
