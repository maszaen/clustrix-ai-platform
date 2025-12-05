// Debug exactly what happens during delete

const content = `// Calculator Module
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
`;

console.log('Original content:');
console.log(JSON.stringify(content));

// Simulate readFileWithMetadata
const rawLines = content.split(/\r?\n/);
const trailingNewline = /\r?\n$/.test(content);
if (trailingNewline) rawLines.pop();

console.log('\nLines array (after removing trailing empty):');
rawLines.forEach((l, i) => console.log(`  ${i}: "${l}"`));
console.log('Total lines:', rawLines.length);

// Delete lines 6-9 (1-indexed)
const start = 6;
const end = 9;
const startIndex = start - 1; // 5
const deleteCount = end - start + 1; // 4

console.log('\nDelete operation:');
console.log('  start:', start, '(index', startIndex, ')');
console.log('  end:', end);
console.log('  deleteCount:', deleteCount);

const removed = rawLines.slice(startIndex, startIndex + deleteCount);
console.log('\nRemoved lines:');
removed.forEach((l, i) => console.log(`  ${i}: "${l}"`));

const beforeContent = removed.join('\n');
console.log('\nbefore_content (joined):');
console.log(JSON.stringify(beforeContent));

// What we SHOULD store to restore correctly
console.log('\n=== ANALYSIS ===');
console.log('Lines 6-9 in original:');
console.log('  Line 6:', JSON.stringify(rawLines[5]));
console.log('  Line 7:', JSON.stringify(rawLines[6]));
console.log('  Line 8:', JSON.stringify(rawLines[7]));
console.log('  Line 9:', JSON.stringify(rawLines[8]));
