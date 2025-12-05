const fs = require('fs');
const path = require('path');
const { applySetOperations } = require('./edit-operations');

const WORKSPACE = path.resolve(__dirname, '../../edit-operations-workspace');
const calcPath = path.join(WORKSPACE, 'calculator.js');

// Reset
fs.writeFileSync(calcPath, `// Line 1
// Line 2
// Line 3
// Line 4
// Line 5
`);

console.log('=== ORIGINAL ===');
console.log(fs.readFileSync(calcPath, 'utf8'));

// Test insert_before using add={} syntax
const cmd = `<set file="calculator.js" add={3}>
<![CDATA[
// INSERTED BEFORE LINE 3
]]>
</set>`;

console.log('Command:', cmd);

const result = applySetOperations(cmd, { workspacePath: WORKSPACE });
console.log('\nResult:', result.success ? 'SUCCESS' : 'FAILED');

console.log('\n=== AFTER INSERT ===');
console.log(fs.readFileSync(calcPath, 'utf8'));

// Verify
const content = fs.readFileSync(calcPath, 'utf8');
const lines = content.split('\n');
console.log('Line 3 is now:', JSON.stringify(lines[2]));
console.log('Expected: "// INSERTED BEFORE LINE 3"');
console.log('Test:', lines[2] === '// INSERTED BEFORE LINE 3' ? '✓ PASSED' : '✗ FAILED');
