// Test untuk new-output.html source
const fs = require('fs');
const { JSDOM } = require('jsdom');

// Read source markdown dari new-output.html (bagian markdown raw)
const newOutputContent = fs.readFileSync('./issues/new-output.html', 'utf-8');

// Extract markdown dari file (ambil bagian sebelum <div class="message-text">)
const markdownPart = newOutputContent.split('<div class="message-text">')[0];

// Kemudian ambil juga markdown dari Response AI 3 di actual-response
const actualResponse = fs.readFileSync('./issues/actual-response.md', 'utf-8');
const response3 = actualResponse.split('Response AI 3:')[1];

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.document = dom.window.document;
global.window = dom.window;

global.highlightAllUnder = () => {};
global.attachCodeBlockListeners = () => {};
global.updateCodeBlocksWithArtifactInfo = () => {};

const mdModule = require('./local_modules/custom-formatter/md.js');
const md = mdModule.md;

console.log('Testing for undefined issue...\n');

const html = md(response3.trim());

// Check for undefined
const undefinedCount = (html.match(/undefined/g) || []).length;
const hasUndefined = html.includes('undefined');

console.log(`Found ${undefinedCount} occurrences of 'undefined'`);

if (hasUndefined) {
  console.log('❌ FAIL: Found undefined in output');
  
  // Show context
  const matches = html.match(/.{50}undefined.{50}/g) || [];
  console.log('\nSample contexts:');
  matches.slice(0, 3).forEach((match, i) => {
    console.log(`  ${i + 1}. ...${match}...`);
  });
} else {
  console.log('✅ SUCCESS: No undefined found!');
}

// Check for table inside blockquote
const tempDiv = document.createElement('div');
tempDiv.innerHTML = html;

const tablesInBlockquotes = tempDiv.querySelectorAll('blockquote table').length;
const allTables = tempDiv.querySelectorAll('table').length;
const tablesOutsideBlockquotes = allTables - tablesInBlockquotes;

console.log(`\nTable check:`);
console.log(`  Total tables: ${allTables}`);
console.log(`  Tables inside blockquotes: ${tablesInBlockquotes}`);
console.log(`  Tables outside blockquotes: ${tablesOutsideBlockquotes}`);

// Expected: tables yang ada di nested blockquotes harus di dalam blockquote
const expectedInside = response3.match(/>\s*\|/g) || [];
console.log(`  Expected tables in blockquotes: ${expectedInside.length}`);

if (tablesOutsideBlockquotes === 0 && tablesInBlockquotes > 0) {
  console.log('  ✅ All tables properly nested in blockquotes');
} else {
  console.log(`  ⚠️  Some tables might be outside blockquotes`);
}

// Write output
fs.writeFileSync('test-new-output-fixed.html', `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>New Output Fixed</title>
<style>
body { font-family: Arial; padding: 20px; max-width: 900px; margin: 0 auto; }
blockquote { border-left: 4px solid #ddd; margin: 10px 0; padding: 10px 20px; background: #f9f9f9; }
blockquote blockquote { border-left-color: #bbb; background: #f0f0f0; }
blockquote blockquote blockquote { border-left-color: #999; background: #e8e8e8; }
pre { background: #f4f4f4; padding: 10px; border-radius: 4px; }
code { background: #f4f4f4; padding: 2px 4px; border-radius: 3px; }
table { border-collapse: collapse; margin: 10px 0; }
th, td { border: 1px solid #ddd; padding: 8px; }
.code-block-container { margin: 10px 0; border: 1px solid #ddd; }
.code-block-header { background: #e8e8e8; padding: 5px 10px; }
</style></head><body>${html}</body></html>`);

console.log('\n✅ Output written to: test-new-output-fixed.html');
