// Test for the specific issue with text positioning in nested lists
const fs = require('fs');

// Mock browser environment
global.document = {
  createElement: () => ({
    innerHTML: '',
    querySelector: () => null,
    querySelectorAll: () => []
  })
};

// HTML escape function
function esc(s) {
  if (!s) return "";
  return s
    .toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
global.esc = esc;

// Load md.js
const mdJsContent = fs.readFileSync('./local_modules/custom-formatter/md.js', 'utf8');
eval(mdJsContent.replace('function enhancedMarkdownParse', 'global.enhancedMarkdownParse = function'));

const testMarkdown = `- **Sub Item 2**
  Sub item lain dengan blockquote:

  > **Blockquote CSS:**
  > "CSS itu styling, pilih font yang enak dibaca."
  > - UI Designer

  > **Blockquote dengan tabel:**
  > "Property CSS penting:"

  | Property | Value | Keterangan |
  |----------|-------|------------|
  | font-family | Arial | Font utama |
  | color | #333 | Warna teks |
  | margin | 0 auto | Centering |`;

console.log('Testing text positioning issue:');
console.log('Input:');
console.log(testMarkdown);
console.log('\nOutput:');
try {
  const result = global.enhancedMarkdownParse(testMarkdown);
  console.log(result);

  // Check if "Sub item lain dengan blockquote:" appears at the end instead of beginning
  const hasTextAtEnd = result.includes('<br>Sub item lain dengan blockquote:</li>');
  const hasTextAtBeginning = result.includes('<li><strong>Sub Item 2</strong>  <br>Sub item lain dengan blockquote:');

  console.log('\nAnalysis:');
  console.log('Text at end:', hasTextAtEnd);
  console.log('Text at beginning:', hasTextAtBeginning);

  if (hasTextAtEnd) {
    console.log('❌ ISSUE: Text appears at the end of list item instead of beginning');
  }
  if (hasTextAtBeginning) {
    console.log('✅ Text appears at the beginning as expected');
  }
} catch (error) {
  console.error('Error:', error.message);
}

// Test codeblock in blockquote
console.log('\n\nTesting codeblock in blockquote:');
const codeblockTest = `> **Blockquote dengan kode:**
> "Contoh heading:"
>
> \`\`\`markdown
> # Heading 1
> ## Heading 2
> ### Heading 3
> \`\`\``;

console.log('Input:');
console.log(codeblockTest);
console.log('\nOutput:');
try {
  const codeblockResult = global.enhancedMarkdownParse(codeblockTest);
  console.log(codeblockResult);

  // Check if blockquote markers appear in the code content
  const hasBlockquoteInCode = codeblockResult.includes('&gt; # Heading 1') || 
                             codeblockResult.includes('>&gt; # Heading 1');

  console.log('\nAnalysis:');
  console.log('Has blockquote markers in code:', hasBlockquoteInCode);

  if (hasBlockquoteInCode) {
    console.log('❌ ISSUE: Blockquote markers appear in codeblock content');
  } else {
    console.log('✅ Codeblock content is clean of blockquote markers');
  }
} catch (error) {
  console.error('Error in codeblock test:', error.message);
}