// Final Comprehensive Test - All 7 Issues
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

console.log('🚀 Running Final Comprehensive Test\n');
console.log('Testing ALL 7 issues...\n');

let totalTests = 0;
let passedTests = 0;

function test(name, condition, details = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`✅ ${name}`);
    if (details) console.log(`   ${details}`);
  } else {
    console.log(`❌ ${name}`);
    if (details) console.log(`   ${details}`);
  }
}

// Issue #1: Codeblock in list
console.log('=== Issue #1: Codeblock Indentation in Lists ===');
const issue1Md = `1. List item before code
   \`\`\`javascript
   const x = 1;
   \`\`\`
2. List item after code`;
const issue1Html = md(issue1Md);
const div1 = document.createElement('div');
div1.innerHTML = issue1Html;
const ol1 = div1.querySelector('ol');
const li1 = ol1 ? ol1.querySelectorAll('li') : [];
const codeInList1 = li1[0] ? li1[0].querySelector('.code-block-container') : null;
test('Issue #1', !!codeInList1 && li1.length === 2, 'Codeblock nested in first list item');
console.log();

// Issue #2: No '>' markers in codeblocks
console.log('=== Issue #2: Remove ">" Markers in Codeblocks ===');
const issue2Md = `> Blockquote with code
> \`\`\`python
> def hello():
>     print("world")
> \`\`\``;
const issue2Html = md(issue2Md);
const hasGtMarker = issue2Html.includes('&gt;') && issue2Html.includes('<code');
test('Issue #2', !hasGtMarker, 'No ">" markers in codeblock output');
console.log();

// Issue #3: Nested blockquotes
console.log('=== Issue #3: Nested Blockquotes Structure ===');
const issue3Md = `> Level 1
>
> > Level 2
> >
> > > Level 3`;
const issue3Html = md(issue3Md);
const div3 = document.createElement('div');
div3.innerHTML = issue3Html;
const topBlockquotes = Array.from(div3.children).filter(el => el.tagName === 'BLOCKQUOTE');
const hasNestedBq = div3.querySelector('blockquote blockquote blockquote');
test('Issue #3', topBlockquotes.length === 1 && !!hasNestedBq, 'Single top-level blockquote with 3 levels nested');
console.log();

// Issue #4: No "undefined" in output
console.log('=== Issue #4: No "undefined" Text ===');
const issue4Md = `> Outer blockquote
> \`\`\`js
> code here
> \`\`\`
> > Nested blockquote
> > \`\`\`python
> > nested code
> > \`\`\``;
const issue4Html = md(issue4Md);
const hasUndefined = issue4Html.includes('undefined');
test('Issue #4', !hasUndefined, 'No "undefined" in nested blockquote output');
console.log();

// Issue #5: No <br> after codeblock in blockquote
console.log('=== Issue #5: No <br> After Codeblock (Blockquote) ===');
const issue5Md = `> Text before
> \`\`\`js
> code
> \`\`\`
> Text after`;
const issue5Html = md(issue5Md);
const hasBrAfterCode5 = issue5Html.includes('</div><br>Text after');
test('Issue #5', !hasBrAfterCode5, 'No <br> immediately after codeblock in blockquote');
console.log();

// Issue #6: Complete table parsing in blockquote
console.log('=== Issue #6: Complete Table Parsing ===');
const issue6Md = `> | Col1 | Col2 |
> |------|------|
> | A    | B    |
| C    | D    |
| E    | F    |`;
const issue6Html = md(issue6Md);
const div6 = document.createElement('div');
div6.innerHTML = issue6Html;
const table6 = div6.querySelector('table');
const rows6 = table6 ? table6.querySelectorAll('tbody tr').length : 0;
test('Issue #6', rows6 === 3, `Complete table with 3 rows (found: ${rows6})`);
console.log();

// Issue #7: No <br> after codeblock in list
console.log('=== Issue #7: No <br> After Codeblock (List) ===');
const issue7Md = `1. Item with code
   * Nested item
     \`\`\`html
     <p>code</p>
     \`\`\`
     Text after code`;
const issue7Html = md(issue7Md);
const hasBrAfterCode7 = issue7Html.includes('</div><br>Text after');
test('Issue #7', !hasBrAfterCode7, 'No <br> immediately after codeblock in list');
console.log();

// Additional regression tests
console.log('=== Regression Tests ===');

// Test: Basic inline markdown
const inlineHtml = md('**bold** and *italic* and `code`');
test('Inline Markdown', 
  inlineHtml.includes('<strong>') && inlineHtml.includes('<em>') && inlineHtml.includes('<code>'),
  'Bold, italic, code still work');

// Test: Headers
const headerHtml = md('# H1\n## H2\n### H3');
test('Headers', 
  headerHtml.includes('<h1>') && headerHtml.includes('<h2>') && headerHtml.includes('<h3>'),
  'All header levels work');

// Test: Simple list
const listHtml = md('1. First\n2. Second\n3. Third');
const divList = document.createElement('div');
divList.innerHTML = listHtml;
const listItems = divList.querySelectorAll('li');
test('Simple Lists', listItems.length === 3, 'Basic ordered list works');

// Test: Horizontal rule
const hrHtml = md('Text\n---\nMore text');
test('Horizontal Rule', hrHtml.includes('<hr>'), 'Horizontal rule works');

// Test: Mixed nested structures
const mixedHtml = md(`
1. List item
   > Blockquote in list
   > \`\`\`js
   > code
   > \`\`\`
   > Text after
2. Second item
`);
const divMixed = document.createElement('div');
divMixed.innerHTML = mixedHtml;
const bqInList = divMixed.querySelector('li blockquote');
const codeInBq = bqInList ? bqInList.querySelector('.code-block-container') : null;
test('Complex Nesting', !!codeInBq, 'Blockquote with codeblock inside list item');

console.log();
console.log('='.repeat(60));
console.log(`📊 Final Results: ${passedTests}/${totalTests} tests passed`);
console.log('='.repeat(60));

if (passedTests === totalTests) {
  console.log('\n🎉 ALL TESTS PASSED! All 7 issues are FIXED! 🎉');
  console.log('\n✅ Ready for production');
  process.exit(0);
} else {
  console.log(`\n❌ ${totalTests - passedTests} test(s) failed`);
  process.exit(1);
}
