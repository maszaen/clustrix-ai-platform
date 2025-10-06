// Test nested list indentation with codeblock, table, and blockquote
const testMarkdown = `- Item 1
- Item 2
  \`\`\`javascript
  console.log('code in list');
  \`\`\`
- Item 3

| Header 1 | Header 2 |
|----------|----------|
| Cell 1   | Cell 2   |

- Item 4
  > This is a blockquote in a list
  > with multiple lines
- Item 5`;

console.log('Test markdown:');
console.log(testMarkdown);
console.log('\nProcessing...');

// Load md.js and test
const fs = require('fs');
const mdContent = fs.readFileSync('local_modules/custom-formatter/md.js', 'utf8');

// Extract the md function
const mdFunctionMatch = mdContent.match(/function md\(src, options = \{\} \) \{[\s\S]*?return tempDiv\.innerHTML;\s*\}/);
if (mdFunctionMatch) {
  const mdFunction = mdFunctionMatch[0];

  // Create test script
  const testScript = `
  ${mdFunction}
  console.log('Result:');
  console.log(md(\`${testMarkdown.replace(/`/g, '\\`')}\`));
  `;

  fs.writeFileSync('run_test.js', testScript);
  console.log('Running test...');

  require('child_process').execSync('node run_test.js', { stdio: 'inherit' });
  fs.unlinkSync('run_test.js');
} else {
  console.log('md function not found');
}