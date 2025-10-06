// Test comprehensive nested list parsing
const fs = require('fs');
const path = require('path');

// Read the md.js file and extract the enhancedMarkdownParse function
const mdJsPath = path.join(__dirname, 'local_modules', 'custom-formatter', 'md.js');
const mdJsContent = fs.readFileSync(mdJsPath, 'utf8');

// Extract the function (this is a hack, but works for testing)
const funcMatch = mdJsContent.match(/function enhancedMarkdownParse\([\s\S]*?\n}/);
if (!funcMatch) {
  console.error('Could not extract enhancedMarkdownParse function');
  process.exit(1);
}

const funcCode = funcMatch[0];

// Create a test script that includes the function
const testScript = `
${funcCode}

const testMarkdown = \`- **Item Pertama**
  \`\`\`python
  def hello():
      print('Hello World')
  \`\`\`

  > **Blockquote dalam list:**
  > "Quote here"

  | Col1 | Col2 |
  |------|------|
  | A    | B    |\`;

console.log('Testing nested list parsing...');
console.log('Input:');
console.log(testMarkdown);
console.log('\\nOutput:');
try {
  const result = enhancedMarkdownParse(testMarkdown);
  console.log(result);

  // Check if content is properly nested
  const hasCodeInList = result.includes('<li>') && result.includes('code-block-container') && result.indexOf('code-block-container') > result.indexOf('<li>');
  const hasBlockquoteInList = result.includes('<li>') && result.includes('<blockquote>') && result.indexOf('<blockquote>') > result.indexOf('<li>');
  const hasTableInList = result.includes('<li>') && result.includes('<table>') && result.indexOf('<table>') > result.indexOf('<li>');

  console.log('\\nValidation:');
  console.log('Code block in list:', hasCodeInList);
  console.log('Blockquote in list:', hasBlockquoteInList);
  console.log('Table in list:', hasTableInList);

  if (hasCodeInList && hasBlockquoteInList && hasTableInList) {
    console.log('\\n✅ All nested content properly contained within list items!');
  } else {
    console.log('\\n❌ Some nested content is not properly contained within list items');
  }
} catch (error) {
  console.error('Error:', error.message);
}
`;

fs.writeFileSync('test_comprehensive.js', testScript);
console.log('Test script created. Run with: node test_comprehensive.js');