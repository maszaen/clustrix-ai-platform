// Test md.js directly with nested image+link

const { md } = require('./renderer/core/md.js');

const input = `## **5. Images - All Variations**

### Images with Links
[![**Clickable Logo**](https://picsum.photos/seed/logo/150/50.jpg)](https://example.com)
`;

console.log('Input:');
console.log(input);
console.log('\n' + '='.repeat(60));
console.log('Output:');
const output = md(input);
console.log(output);
