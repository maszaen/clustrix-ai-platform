// Test Issue #7: Unwanted <br> after codeblock in list
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

console.log('Testing Issue #7: <br> after codeblock in list...\n');

// Markdown source dari new-output2.html
const markdown = `1.  **\`let nextEl = p.nextElementSibling;\`**
    *   Ini adalah *key* utamanya. Dalam struktur HTML yang kamu berikan:
        \`\`\`html
        <p>teks p</p>
        <ol>...</ol>
        \`\`\`
        Ketika JavaScript memanggil \`p.nextElementSibling\`, ia akan **melewati *whitespace***.`;

const html = md(markdown);

// Check for <br> after code-block-container
const hasBrAfterCodeblock = html.includes('</div><br>Ketika');

console.log('=== Issue #7 Check ===');
if (hasBrAfterCodeblock) {
  console.log('❌ Found unwanted <br> after codeblock in list');
  
  // Find the exact location
  const idx = html.indexOf('</div><br>Ketika');
  if (idx !== -1) {
    const snippet = html.substring(idx, idx + 100);
    console.log(`   Location: ...${snippet}...`);
  }
} else {
  console.log('✅ No unwanted <br> after codeblock');
}

// Count <br> tags
const brCount = (html.match(/<br>/g) || []).length;
console.log(`\n=== <br> Count ===`);
console.log(`   Total <br> tags: ${brCount}`);

// Check structure
const tempDiv = document.createElement('div');
tempDiv.innerHTML = html;

const ol = tempDiv.querySelector('ol');
const li = ol ? ol.querySelector('li') : null;
const ul = li ? li.querySelector('ul') : null;
const nestedLi = ul ? ul.querySelector('li') : null;

console.log(`\n=== Structure Check ===`);
console.log(`   Found <ol>: ${!!ol ? '✅' : '❌'}`);
console.log(`   Found <li>: ${!!li ? '✅' : '❌'}`);
console.log(`   Found nested <ul>: ${!!ul ? '✅' : '❌'}`);
console.log(`   Found nested <li>: ${!!nestedLi ? '✅' : '❌'}`);

if (nestedLi) {
  const codeBlock = nestedLi.querySelector('.code-block-container');
  console.log(`   Found codeblock: ${!!codeBlock ? '✅' : '❌'}`);
  
  if (codeBlock) {
    // Check if there's a <br> right after the codeblock
    const nextNode = codeBlock.nextSibling;
    const hasBr = nextNode && nextNode.nodeName === 'BR';
    console.log(`   <br> after codeblock: ${hasBr ? '❌ YES (unwanted)' : '✅ NO (correct)'}`);
  }
}

// Write output
fs.writeFileSync('test-issue-7-output.html', `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Issue #7 Test</title>
<style>
body { font-family: Arial; padding: 20px; max-width: 900px; margin: 0 auto; }
ol, ul { margin: 10px 0; padding-left: 30px; }
li { margin: 5px 0; }
.code-block-container { margin: 10px 0; border: 1px solid #ddd; }
.code-block-header { background: #e8e8e8; padding: 5px 10px; }
pre { background: #f4f4f4; padding: 10px; margin: 0; }
code { background: #f0f0f0; padding: 2px 4px; }
</style></head><body>${html}</body></html>`);

console.log('\n✅ Output written to: test-issue-7-output.html');

if (hasBrAfterCodeblock) {
  console.log('\n❌ Issue #7 NOT FIXED: <br> still present after codeblock in list');
  process.exit(1);
} else {
  console.log('\n✅ Issue #7 FIXED: No unwanted <br> after codeblock');
}
