const fs = require('fs');
const path = require('path');

const ws = path.resolve(__dirname, '../../edit-operations-workspace');
console.log('Workspace:', ws);
console.log('Files in workspace:', fs.readdirSync(ws));

// Test similarity function directly
function calculateSimilarity(str1, str2) {
  const len1 = str1.length;
  const len2 = str2.length;
  const maxLen = Math.max(len1, len2);
  if (maxLen === 0) return 1;
  if (str1 === str2) return 1;
  if (str1.includes(str2) || str2.includes(str1)) return 0.8;
  
  const matrix = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));
  for (let i = 0; i <= len1; i++) matrix[i][0] = i;
  for (let j = 0; j <= len2; j++) matrix[0][j] = j;
  
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  
  const distance = matrix[len1][len2];
  return 1 - (distance / maxLen);
}

console.log('\nSimilarity tests:');
console.log('calculater.js vs calculator.js:', calculateSimilarity('calculater.js', 'calculator.js'));
console.log('newfile.js vs calculator.js:', calculateSimilarity('newfile.js', 'calculator.js'));

// Now test the actual function
const { applySetOperations } = require('./edit-operations');

const cmd = `<set file="calculater.js" range={1}>
<![CDATA[test]]>
</set>`;

console.log('\nTrying edit with typo file...');
try {
  const result = applySetOperations(cmd, { workspacePath: ws });
  console.log('Result:', result.success);
  console.log('Files:', result.files?.map(f => f.filePath));
} catch(e) {
  console.log('Error:', e.message);
}

// Check if file was created
const typoPath = path.join(ws, 'calculater.js');
console.log('\nTypo file exists:', fs.existsSync(typoPath));
if (fs.existsSync(typoPath)) {
  console.log('Content:', fs.readFileSync(typoPath, 'utf8'));
  fs.unlinkSync(typoPath); // cleanup
}
