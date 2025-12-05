/**
 * Debug Delete Undo Issue - Deep Debug
 */

const fs = require('fs');
const path = require('path');
const Diff = require('diff');

const WORKSPACE = path.resolve(__dirname, '../../edit-operations-workspace');
const calcPath = path.join(WORKSPACE, 'calculator.js');

// Reset file
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

const originalContent = fs.readFileSync(calcPath, 'utf8');
console.log('=== ORIGINAL FILE ===');
console.log(originalContent);

// Simulate what happens during delete
const beforeContent = "function subtract(a, b) {\n  return a - b;\n}\n";
const afterContent = "";

console.log('\n=== EDIT INFO ===');
console.log('before_content (what was deleted):', JSON.stringify(beforeContent));
console.log('after_content (replacement):', JSON.stringify(afterContent));

// After delete, file looks like this:
const afterDeleteContent = `// Calculator Module
function add(a, b) {
  return a + b;
}

function multiply(a, b) {
  return a * b;
}

module.exports = { add, subtract, multiply };
`;

console.log('\n=== FILE AFTER DELETE ===');
console.log(afterDeleteContent);

// Now test diff package behavior
console.log('\n=== TESTING DIFF PACKAGE ===');

// Create structured patch from before->after
const structuredPatch = Diff.structuredPatch(
  'calculator.js', 'calculator.js',
  beforeContent, afterContent,
  'original', 'modified',
  { context: 3 }
);
console.log('Structured patch (before->after):');
console.log(JSON.stringify(structuredPatch, null, 2));

// Reverse it
const reversed = {
  oldFileName: structuredPatch.newFileName,
  newFileName: structuredPatch.oldFileName,
  oldHeader: structuredPatch.newHeader,
  newHeader: structuredPatch.oldHeader,
  hunks: structuredPatch.hunks.map(hunk => ({
    oldStart: hunk.newStart,
    oldLines: hunk.newLines,
    newStart: hunk.oldStart,
    newLines: hunk.oldLines,
    lines: hunk.lines.map(line => {
      if (line.startsWith('+')) return '-' + line.slice(1);
      if (line.startsWith('-')) return '+' + line.slice(1);
      return line;
    })
  }))
};
console.log('\nReversed patch:');
console.log(JSON.stringify(reversed, null, 2));

// Try to apply reversed patch to current file
console.log('\n=== APPLYING REVERSED PATCH ===');
const patchResult = Diff.applyPatch(afterDeleteContent, reversed, { fuzzFactor: 2 });
console.log('Patch result:', patchResult === false ? 'FAILED' : 'SUCCESS');
if (patchResult !== false) {
  console.log('Result content:');
  console.log(patchResult);
}

// The problem: diff package creates patch based on beforeContent->afterContent
// But it doesn't know WHERE in the file this content was!
// It just sees "function subtract..." -> "" and tries to apply that anywhere

console.log('\n=== THE PROBLEM ===');
console.log('Diff package creates a patch from beforeContent to afterContent');
console.log('But it has NO context about where in the file this was!');
console.log('So when reversing, it just prepends the content to the file.');
