// Debug nested image+link parsing

const input = '[![**Clickable Logo**](https://picsum.photos/seed/logo/150/50.jpg)](https://example.com)';

console.log('Input:', input);
console.log('\n=== STEP 1: Check if detected as nested image+link ===');
const isNestedImageLink = /^\[!\[.*?\]\([^)]+\)\]\([^)]+\)$/.test(input);
console.log('isNestedImageLink:', isNestedImageLink);

console.log('\n=== STEP 2: Check if detected as image-only ===');
const isImageOnly = /^!\[.*?\]\([^\s]+\)(\s*=\s*\d+x\d+)?$/.test(input);
console.log('isImageOnly (before fix):', isImageOnly);
console.log('isImageOnly (after fix):', !isNestedImageLink && isImageOnly);

console.log('\n=== STEP 3: Simulate nested image+link parsing ===');
const nestedRegex = /\[!\[([^\]]*)\]\(([^)]+)\)\]\(([^)]+)\)/g;
const match = nestedRegex.exec(input);
if (match) {
  console.log('Match found!');
  console.log('  alt:', match[1]);
  console.log('  imgSrc:', match[2]);
  console.log('  linkUrl:', match[3]);

  const cleanAlt = match[1].replace(/\*\*|__|[\*_~`]/g, '');
  console.log('  cleanAlt:', cleanAlt);

  const labelHtml = cleanAlt ? `<span class="image-link-label">${cleanAlt}</span>` : '';
  console.log('  labelHtml:', labelHtml);

  const output = `<a href="${match[3]}" target="_blank" rel="noopener noreferrer" class="link image-link image-link-with-label"><div style="display: flex; align-items: center; gap: 12px;"><img class="md-image" src="${match[2]}" alt="" loading="lazy">${labelHtml}</div></a>`;
  console.log('\nExpected output:');
  console.log(output);

  // Simulate placeholder
  const placeholder = '__IMAGE_0__';
  const afterParsing = input.replace(nestedRegex, placeholder);
  console.log('\nAfter nested parsing, text becomes:', afterParsing);

  console.log('\n=== STEP 4: Check if inline link parser will match ===');
  const inlineLinkRegex = /\[([^\]]*)\]\(([^\s]+)\)/g;
  const linkMatch = inlineLinkRegex.exec(afterParsing);
  if (linkMatch) {
    console.log('PROBLEM! Inline link parser matched:', linkMatch[0]);
    console.log('  text:', linkMatch[1]);
    console.log('  url:', linkMatch[2]);

    const isOnlyPlaceholder = /^__IMAGE_\d+__$/.test(linkMatch[1].trim());
    console.log('  isOnlyPlaceholder:', isOnlyPlaceholder);
    console.log('  Should skip?', isOnlyPlaceholder);
  } else {
    console.log('Good! Inline link parser did NOT match (placeholder already consumed)');
  }
}
