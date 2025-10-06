// Test script for md.js fixes
const fs = require('fs');
const { JSDOM } = require('jsdom');

// Read the actual response markdown
const actualResponse = fs.readFileSync('./issues/actual-response.md', 'utf-8');

// Split into three responses
const responses = actualResponse.split(/Response AI \d+:/g).filter(r => r.trim());

// Create a DOM environment
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.document = dom.window.document;
global.window = dom.window;

// Mock highlight function
global.highlightAllUnder = () => {};
global.attachCodeBlockListeners = () => {};
global.updateCodeBlocksWithArtifactInfo = () => {};

// Load md.js
const mdModule = require('./local_modules/custom-formatter/md.js');
const md = mdModule.md || mdModule;

console.log('Testing MD.js with actual responses...\n');

// Test each response
responses.forEach((response, index) => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing Response AI ${index + 1}`);
  console.log('='.repeat(60));
  
  const html = md(response.trim());
  
  // Write to file
  const outputFile = `./test-output-response-${index + 1}.html`;
  const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Test Response AI ${index + 1}</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; max-width: 900px; margin: 0 auto; }
    pre { background: #f4f4f4; padding: 10px; border-radius: 4px; overflow-x: auto; }
    code { background: #f4f4f4; padding: 2px 4px; border-radius: 3px; }
    blockquote { border-left: 4px solid #ddd; margin: 10px 0; padding: 10px 20px; background: #f9f9f9; }
    blockquote blockquote { border-left-color: #bbb; background: #f0f0f0; }
    blockquote blockquote blockquote { border-left-color: #999; background: #e8e8e8; }
    ul, ol { margin: 10px 0; padding-left: 30px; }
    .code-block-container { margin: 10px 0; border: 1px solid #ddd; border-radius: 4px; }
    .code-block-header { background: #e8e8e8; padding: 5px 10px; }
    table { border-collapse: collapse; width: 100%; margin: 10px 0; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background: #f0f0f0; }
  </style>
</head>
<body>
  <h1>Test Response AI ${index + 1}</h1>
  <div id="output">
${html}
  </div>
</body>
</html>`;
  
  fs.writeFileSync(outputFile, fullHtml);
  console.log(`✅ Output written to: ${outputFile}`);
  
  // Analyze issues
  console.log('\n📊 Analysis:');
  
  if (index === 0) {
    // Issue #1: Check if codeblock is properly nested in list
    if (html.includes('<ol>') && html.includes('code-block-container')) {
      const hasProperNesting = html.match(/<li>.*?<div class="code-block-container">.*?<\/li>/s);
      if (hasProperNesting) {
        console.log('  ✅ Issue #1: Codeblock properly nested in list');
      } else {
        console.log('  ❌ Issue #1: Codeblock NOT properly nested in list');
      }
    }
  }
  
  if (index === 1) {
    // Issue #2: Check for '>' markers in codeblocks
    const codeBlocks = html.match(/<code[^>]*>[\s\S]*?<\/code>/g) || [];
    const hasGtInCode = codeBlocks.some(block => block.includes('&gt;') && block.match(/\s+&gt;\s*$/m));
    if (hasGtInCode) {
      console.log('  ❌ Issue #2: Found trailing ">" markers in codeblocks');
      // Show examples
      codeBlocks.forEach((block, i) => {
        if (block.includes('&gt;') && block.match(/\s+&gt;\s*$/m)) {
          const preview = block.substring(0, 200).replace(/\n/g, ' ');
          console.log(`    Block ${i}: ${preview}...`);
        }
      });
    } else {
      console.log('  ✅ Issue #2: No trailing ">" markers in codeblocks');
    }
    
    // Check for proper indentation
    const pythonBlock = codeBlocks.find(b => b.includes('def hitung_total'));
    if (pythonBlock && pythonBlock.includes('    return')) {
      console.log('  ✅ Issue #2: Code indentation preserved');
    } else if (pythonBlock) {
      console.log('  ❌ Issue #2: Code indentation lost');
    }
  }
  
  if (index === 2) {
    // Issue #3: Check for nested blockquotes
    const blockquoteCount = (html.match(/<blockquote>/g) || []).length;
    const expectedNested = html.includes('Level 2') || html.includes('Analysis: Database');
    
    if (expectedNested) {
      // Check if blockquotes are properly nested (not all at same level)
      // Properly nested: <blockquote>...<blockquote>...</blockquote>...</blockquote>
      // Wrongly separated: <blockquote>...</blockquote><blockquote>...</blockquote>
      
      // Count top-level blockquotes (those not inside another blockquote)
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = html;
      const topLevelBq = Array.from(tempDiv.querySelectorAll('blockquote')).filter(bq => {
        let parent = bq.parentElement;
        while (parent && parent !== tempDiv) {
          if (parent.tagName === 'BLOCKQUOTE') return false;
          parent = parent.parentElement;
        }
        return true;
      }).length;
      
      console.log(`  Found ${blockquoteCount} total blockquotes, ${topLevelBq} at top-level`);
      
      if (topLevelBq <= 2) {
        console.log(`  ✅ Issue #3: Nested blockquotes properly structured`);
      } else {
        console.log(`  ❌ Issue #3: Too many top-level blockquotes (should be 1-2, got ${topLevelBq})`);
      }
    }
  }
});

console.log('\n' + '='.repeat(60));
console.log('✅ All tests completed!');
console.log('Check the generated HTML files for visual inspection.');
console.log('='.repeat(60));
