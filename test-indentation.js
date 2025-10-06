// Test code indentation in nested lists
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

console.log('Testing code indentation normalization...\n');

const markdown = `1.  **\`let nextEl = p.nextElementSibling;\`**
    *   Ini adalah *key* utamanya. Dalam struktur HTML yang kamu berikan:
        \`\`\`html
        <p>teks p</p>
        <ol>...</ol>
        \`\`\`
        Ketika JavaScript memanggil \`p.nextElementSibling\`.`;

const html = md(markdown);

console.log('=== Checking Code Content ===');

// Extract code content from HTML
const codeMatch = html.match(/<code class="language-html">(.*?)<\/code>/s);
if (codeMatch) {
  const codeContent = codeMatch[1]
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
  
  console.log('Code content:');
  console.log('---');
  console.log(codeContent);
  console.log('---\n');
  
  const lines = codeContent.split('\n');
  console.log('Line-by-line analysis:');
  lines.forEach((line, i) => {
    const leadingSpaces = line.match(/^(\s*)/)[1].length;
    console.log(`  Line ${i + 1}: ${leadingSpaces} leading spaces | "${line}"`);
  });
  
  // Check if second line has unwanted indentation
  if (lines.length >= 2) {
    const line2Indent = lines[1].match(/^(\s*)/)[1].length;
    console.log(`\n=== Result ===`);
    if (line2Indent > 0) {
      console.log(`❌ Line 2 has ${line2Indent} unwanted leading spaces`);
      console.log(`   Expected: "<ol>..."`);
      console.log(`   Actual:   "${lines[1]}"`);
    } else {
      console.log(`✅ Line 2 has correct indentation (0 spaces)`);
      console.log(`   Content: "${lines[1]}"`);
    }
  }
} else {
  console.log('❌ Could not extract code content from HTML');
}

fs.writeFileSync('test-indentation-output.html', `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Indentation Test</title>
<style>
body { font-family: Arial; padding: 20px; }
.code-block-container { background: #f4f4f4; border: 1px solid #ddd; margin: 10px 0; }
.code-block-header { background: #e0e0e0; padding: 5px 10px; }
pre { margin: 0; padding: 10px; white-space: pre-wrap; }
</style></head><body>${html}</body></html>`);

console.log('\n✅ Output written to: test-indentation-output.html');
