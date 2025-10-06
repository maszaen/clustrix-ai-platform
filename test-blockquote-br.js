// Test blockquote content processing directly
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

// Test without blockquote first
console.log('=== Test 1: Without blockquote ===');
const test1 = `Text before
\`\`\`js
code
\`\`\`
Text after`;
const html1 = md(test1);
console.log(html1);
console.log();

// Now with blockquote
console.log('=== Test 2: With blockquote ===');
const test2 = `> Text before
> \`\`\`js
> code
> \`\`\`
> Text after`;
const html2 = md(test2);
console.log(html2);
console.log();

// Check for <br>
console.log('=== Analysis ===');
console.log(`Test 1 has <br> before "Text after": ${html1.includes('<br>Text after') || html1.includes('</div><br>Text after')}`);
console.log(`Test 2 has <br> before "Text after": ${html2.includes('<br>Text after') || html2.includes('</div><br>Text after')}`);
