const input = '[![**Clickable Logo**](https://picsum.photos/seed/logo/150/50.jpg)](https://example.com)';
console.log('=== SIMULATE PARSING ===');
console.log('Input:', input);

// Step 1: Nested image parser
let text = input;
const imageBlocks = [];
text = text.replace(/\[!\[([^\]]*)\]\(([^)]+)\)\]\(([^)]+)\)/g, (match, alt, imgSrc, linkUrl) => {
  const cleanAlt = alt.replace(/\*\*|__|[\*_~`]/g, '');
  const labelHtml = cleanAlt ? `<span class="image-link-label">${cleanAlt}</span>` : '';
  imageBlocks.push(`<a href="${linkUrl}" class="link image-link"><div style="display: flex"><img src="${imgSrc}">${labelHtml}</div></a>`);
  return '__IMAGE_0__';
});
console.log('\nAfter nested parse:', text);
console.log('imageBlocks[0]:', imageBlocks[0]);

// Step 2: Inline link parser with skip
const linkBlocks = [];
const originalText = text;
text = text.replace(/\[([^\]]*)\]\(([^\s]+)\)/g, (match, textContent, url) => {
  console.log('\nInline link regex matched:', match);
  console.log('  textContent:', textContent);
  console.log('  url:', url);

  if (/^__IMAGE_\d+__$/.test(textContent.trim())) {
    console.log('  -> SKIPPED, returning placeholder:', textContent.trim());
    return textContent.trim();
  }
  linkBlocks.push('SHOULD NOT REACH HERE');
  return '__LINK_0__';
});
console.log('\nAfter inline link parse:', text);
console.log('Text changed?', originalText !== text);
console.log('linkBlocks:', linkBlocks);

// Step 3: Replace placeholder
let final = text;
imageBlocks.forEach((block, i) => {
  final = final.replace(`__IMAGE_${i}__`, block);
});
console.log('\nFinal HTML:', final);
