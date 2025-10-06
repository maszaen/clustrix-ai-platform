// Detailed trace of blockquote processing
const mdInput = `> Text before
> \`\`\`js
> code
> \`\`\`
> Text after`;

console.log('Input lines after "> " removal:');
console.log('Line 1: "Text before"');
console.log('Line 2: "```js"');
console.log('Line 3: "code"');
console.log('Line 4: "```"');
console.log('Line 5: "Text after"');

console.log('\nExpected processing:');
console.log('1. Line 1 "Text before" → goes to paragraphBuffer');
console.log('2. Lines 2-4 "```js...```" → becomes __CODEBLOCK_0__');
console.log('3. Codeblock placeholder triggers closeOpenBlocks() → flushes paragraph');
console.log('   Result so far: <p>Text before</p>__CODEBLOCK_0__');
console.log('4. Line 5 "Text after" → goes to paragraphBuffer');
console.log('5. End of content triggers closeOpenBlocks() → flushes paragraph');
console.log('   Final result: <p>Text before</p>__CODEBLOCK_0__<p>Text after</p>');

console.log('\nActual output has <br> tags - WHY?');
console.log('Hypothesis: The blockquote content extraction includes empty lines or extra characters');
