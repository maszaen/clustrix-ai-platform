// Simple test by evaluating the md.js file content
const fs = require('fs');
const path = require('path');

const mdPath = path.join(__dirname, 'local_modules', 'custom-formatter', 'md.js');
const mdContent = fs.readFileSync(mdPath, 'utf8');

// Extract the enhancedMarkdownParse function and dependencies
const functionMatch = mdContent.match(/function enhancedMarkdownParse[\s\S]*?function processMarkdownFormatting/);
if (!functionMatch) {
  console.error('Could not extract enhancedMarkdownParse function');
  process.exit(1);
}

// Add the esc function
const codeToEval = `
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
${functionMatch[0].replace('function processMarkdownFormatting', '')}
return enhancedMarkdownParse;
`;

try {
  const enhancedMarkdownParse = new Function(codeToEval)();
  
  // Test case untuk codeblock di dalam blockquote
  const testMarkdown = `> **Blockquote dengan kode:**
> "Contoh heading:"
>
> \`\`\`markdown
> # Heading 1
> ## Heading 2
> ### Heading 3
> \`\`\``;

  console.log('Input Markdown:');
  console.log(testMarkdown);
  console.log('\nParsed HTML:');
  console.log(enhancedMarkdownParse(testMarkdown));
} catch (error) {
  console.error('Error:', error.message);
}