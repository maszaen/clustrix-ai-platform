// Debug test for blockquote collection
const testMarkdown = `> ## Problem: API Timeout Issue
>
> \`\`\`python
> # code
> \`\`\`
>
> > ### Analysis`;

const lines = testMarkdown.split('\n');

console.log('Original lines:');
lines.forEach((line, i) => {
  console.log(`${i}: "${line}"`);
});

// Simulate codeblock replacement
let processed = testMarkdown.replace(/```(\w*)\n?([\s\S]*?)(?:```|$)/g, (match, lang, code) => {
  return `__CODEBLOCK_0__`;
});

console.log('\nAfter codeblock replacement:');
console.log(processed);

const processedLines = processed.split('\n');
console.log('\nProcessed lines:');
processedLines.forEach((line, i) => {
  const hasGt = line.match(/^\s*>/);
  console.log(`${i}: "${line}" - has >: ${!!hasGt}`);
});
