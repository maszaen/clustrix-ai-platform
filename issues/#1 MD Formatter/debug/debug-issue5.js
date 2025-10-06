// Debug Issue #5
const fs = require('fs');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.document = dom.window.document;
global.window = dom.window;

global.highlightAllUnder = () => {};
global.attachCodeBlockListeners = () => {};
global.updateCodeBlocksWithArtifactInfo = () => {};

const mdModule = require('../../../local_modules/custom-formatter/md.js');
const md = mdModule.md;

const issue5Md = `> Text before
> \`\`\`js
> code
> \`\`\`
> Text after`;

const html = md(issue5Md);

console.log('=== Issue #5 Debug ===\n');
console.log('Input markdown:');
console.log(issue5Md);
console.log('\n' + '='.repeat(60) + '\n');
console.log('Output HTML:');
console.log(html);
console.log('\n' + '='.repeat(60) + '\n');

// Check for the specific pattern
if (html.includes('</div><br>Text after')) {
  console.log('❌ FOUND: </div><br>Text after');
  const idx = html.indexOf('</div><br>Text after');
  console.log(`\nContext around the issue:`);
  console.log(html.substring(Math.max(0, idx - 100), idx + 100));
} else if (html.includes('</div>Text after')) {
  console.log('✅ CORRECT: </div>Text after (no <br>)');
} else {
  console.log('⚠️  Pattern not found, checking alternatives...');
  
  // Check for <br> anywhere after code-block-container
  const codeBlockEndIdx = html.lastIndexOf('</div>');
  const textAfterIdx = html.indexOf('Text after');
  
  if (codeBlockEndIdx !== -1 && textAfterIdx !== -1) {
    const between = html.substring(codeBlockEndIdx, textAfterIdx + 15);
    console.log(`\nBetween code-block-container and "Text after":`);
    console.log(between);
    
    if (between.includes('<br>')) {
      console.log('\n❌ Found <br> between codeblock and text');
    } else {
      console.log('\n✅ No <br> between codeblock and text');
    }
  }
}

fs.writeFileSync('debug-issue5.html', `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Debug Issue 5</title>
<style>
body { font-family: monospace; padding: 20px; white-space: pre-wrap; }
blockquote { border-left: 3px solid #ddd; margin: 10px 0; padding: 10px; background: #f9f9f9; }
.code-block-container { background: #f0f0f0; border: 1px solid #ccc; margin: 10px 0; }
.code-block-header { background: #e0e0e0; padding: 5px; }
pre { margin: 0; padding: 10px; }
</style></head><body>${html}</body></html>`);

console.log('\n✅ Debug output written to: debug-issue5.html');
