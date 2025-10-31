const input = '[![**Clickable Logo**](https://picsum.photos/seed/logo/150/50.jpg)](https://example.com)';

console.log('Input:', input);
console.log('\nisNestedImageLink:', /^\[!\[.*?\]\([^)]+\)\]\([^)]+\)$/.test(input));
console.log('isImageOnly (original):', /^!\[.*?\]\([^\s]+\)(\s*=\s*\d+x\d+)?$/.test(input));

const isNestedImageLink = /^\[!\[.*?\]\([^)]+\)\]\([^)]+\)$/.test(input);
const isImageOnly = !isNestedImageLink && /^!\[.*?\]\([^\s]+\)(\s*=\s*\d+x\d+)?$/.test(input);
console.log('\nisImageOnly AFTER fix:', isImageOnly);
console.log('Will go to imageBuffer?', isImageOnly);
console.log('Will go to paragraphBuffer?', !isImageOnly);
