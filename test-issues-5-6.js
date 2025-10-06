// Test for new issues #5 and #6
const fs = require('fs');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.document = dom.window.document;
global.window = dom.window;

global.highlightAllUnder = () => {};
global.attachCodeBlockListeners = () => {};
global.updateCodeBlocksWithArtifactInfo = () => {};

const mdModule = require('./local_modules/custom-formatter/md.js');
const md = mdModule.md;

console.log('Testing Issue #5 and #6...\n');

// Issue #5: Unwanted <br> after codeblock in list
const issue5Input = `1. **Item with code**
   
   \`\`\`html
   <p>test</p>
   \`\`\`
   
   Next paragraph after code.`;

console.log('=== Issue #5: <br> after codeblock ===');
const html5 = md(issue5Input);

if (html5.match(/<\/div><br>/)) {
  console.log('❌ Found unwanted <br> after codeblock');
  const match = html5.match(/<\/div><br>.{0,50}/);
  if (match) console.log(`   Example: ${match[0]}...`);
} else {
  console.log('✅ No unwanted <br> after codeblock');
}

// Issue #6: Incomplete table parsing in blockquote
const issue6Input = `> **Blockquote dengan tabel:**  
> "Struktur proyek dasar:"  
> 
> | Folder | Isi | Keterangan |
> |--------|-----|------------|
> | src    | Kode sumber | Utama |
| tests  | Test case | Untuk QA |
| docs   | Dokumentasi | Bisa skip dulu |`;

console.log('\n=== Issue #6: Incomplete table in blockquote ===');
const html6 = md(issue6Input);

// Check for table rows as plain text with <br>|
if (html6.match(/<br>\|/)) {
  console.log('❌ Found table rows as plain text (not parsed as table)');
  const matches = html6.match(/<br>\|[^<]+/g) || [];
  matches.forEach((m, i) => {
    console.log(`   Row ${i + 1}: ${m.substring(0, 50)}...`);
  });
} else {
  console.log('✅ All table rows properly parsed');
}

// Check table row count
const tempDiv = document.createElement('div');
tempDiv.innerHTML = html6;
const tableRows = tempDiv.querySelectorAll('tbody tr').length;
console.log(`   Table rows found: ${tableRows}`);
console.log(`   Expected: 3 rows (src, tests, docs)`);

if (tableRows === 3) {
  console.log('   ✅ Correct number of table rows');
} else {
  console.log(`   ❌ Incorrect row count (expected 3, got ${tableRows})`);
}

// Write outputs
fs.writeFileSync('test-issue5-output.html', `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Issue #5 Test</title>
<style>
body { font-family: Arial; padding: 20px; }
.code-block-container { margin: 10px 0; border: 1px solid #ddd; }
.code-block-header { background: #e8e8e8; padding: 5px 10px; }
pre { background: #f4f4f4; padding: 10px; }
</style></head><body>${html5}</body></html>`);

fs.writeFileSync('test-issue6-output.html', `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Issue #6 Test</title>
<style>
body { font-family: Arial; padding: 20px; }
blockquote { border-left: 4px solid #ddd; margin: 10px 0; padding: 10px 20px; background: #f9f9f9; }
table { border-collapse: collapse; margin: 10px 0; }
th, td { border: 1px solid #ddd; padding: 8px; }
</style></head><body>${html6}</body></html>`);

console.log('\n✅ Test outputs written to:');
console.log('   - test-issue5-output.html');
console.log('   - test-issue6-output.html');
