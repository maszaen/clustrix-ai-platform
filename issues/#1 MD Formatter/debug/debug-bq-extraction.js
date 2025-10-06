// Debug blockquote content extraction
const input = `> Text before
> \`\`\`js
> code
> \`\`\`
> Text after`;

const lines = input.split('\n');
console.log('Original lines:');
lines.forEach((l, i) => console.log(`  ${i}: "${l}"`));

// Simulate blockquote extraction (removing "> ")
const extracted = lines.map(l => l.replace(/^\s*>\s?/, ''));
console.log('\nAfter removing "> ":');
extracted.forEach((l, i) => console.log(`  ${i}: "${l}"`));

// The codeblock lines should be collected into __CODEBLOCK_0__
// Let's simulate that
const withPlaceholder = [
  extracted[0],  // "Text before"
  '__CODEBLOCK_0__',
  extracted[4]   // "Text after"
];

console.log('\nAfter codeblock extraction:');
withPlaceholder.forEach((l, i) => console.log(`  ${i}: "${l}"`));

console.log('\n=== Processing simulation ===');
console.log('Line 0: "Text before" → paragraphBuffer');
console.log('Line 1: "__CODEBLOCK_0__" → closeOpenBlocks() flushes paragraph → <p>Text before</p>');
console.log('        Codeblock appended');
console.log('Line 2: "Text after" → paragraphBuffer');
console.log('End: closeOpenBlocks() → <p>Text after</p>');
console.log('\nExpected: <p>Text before</p>__CODEBLOCK_0__<p>Text after</p>');
console.log('Actual:   <p>Text before<br>\\n</p>__CODEBLOCK_0__<br>Text after<p></p>');
console.log('\n❓ Where do the extra <br> and \\n come from?');
