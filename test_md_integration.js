// Test the parseMarkdownLinks function from md.js
const fs = require('fs');
const mdContent = fs.readFileSync('local_modules/custom-formatter/md.js', 'utf8');

// Extract the parseMarkdownLinks function
const funcMatch = mdContent.match(/function parseMarkdownLinks\([^)]+\) \{[\s\S]*?return result;\s*\}/);
if (funcMatch) {
  const funcCode = funcMatch[0];
  console.log('Function extracted successfully');

  // Test cases
  const testCases = [
    '[simple link](http://example.com)',
    '[link with parentheses](http://example.com/path(with)parentheses)',
    '[complex link](https://lib.ui.ac.id/unggah/sites/default/files/dokumen_pedoman/Format%20Penulisan%20Naskah%20Ringkas%20(Artikel%20Jurnal)%20dan%20Makalah.pdf)',
    '[nested parens](http://example.com/path((nested))parens)',
  ];

  // Create test function
  const testFunction = `
${funcCode}

const testCases = [
  '[simple link](http://example.com)',
  '[link with parentheses](http://example.com/path(with)parentheses)',
  '[complex link](https://lib.ui.ac.id/unggah/sites/default/files/dokumen_pedoman/Format%20Penulisan%20Naskah%20Ringkas%20(Artikel%20Jurnal)%20dan%20Makalah.pdf)',
  '[nested parens](http://example.com/path((nested))parens)',
];

console.log('Testing parseMarkdownLinks function:');
testCases.forEach((test, index) => {
  console.log(\`Test \${index + 1}:\`);
  console.log('Input: ', test);
  console.log('Output:', parseMarkdownLinks(test));
  console.log('---');
});
`;

  fs.writeFileSync('test_md_function.js', testFunction);
  console.log('Test file created. Running...');

  require('child_process').execSync('node test_md_function.js', { stdio: 'inherit' });
  fs.unlinkSync('test_md_function.js');
} else {
  console.log('Function not found in md.js');
}