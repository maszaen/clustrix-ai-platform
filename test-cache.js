// Test enhancedMarkdownParse with cache disabled
const test = `<!--command-input-->
Get-Process
<!--/command-input-->
<!--command-output-->
Output
<!--/command-output-->`;

console.log('Testing with command tags...');

// Clear cache first
const { enhancedMarkdownParse } = require('./renderer/core/md.js');

// Test without cache (simulate streaming)
const result = enhancedMarkdownParse(test, { isThinkingText: true });
console.log('Result with isThinkingText=true:', result);

// Test with cache disabled by passing sharedCodeBlocks
const result2 = enhancedMarkdownParse(test, {}, []);
console.log('Result with sharedCodeBlocks=[]:', result2);

// Test normal call
const result3 = enhancedMarkdownParse(test);
console.log('Result normal call:', result3);