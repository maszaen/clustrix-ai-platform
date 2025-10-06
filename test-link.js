// Test markdown link parsing with balanced parentheses
const testMarkdown = '[pedoman penulisan akademik](https://lib.ui.ac.id/unggah/sites/default/files/dokumen_pedoman/Format%20Penulisan%20Naskah%20Ringkas%20(Artikel%20Jurnal)%20dan%20Makalah.pdf)';

console.log('Original:', testMarkdown);

// Basic regex (fails on parentheses)
const basicRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
console.log('Basic regex result:', testMarkdown.replace(basicRegex, '<a href="$2">$1</a>'));

// Smart parsing function with balanced parentheses using stack
function parseMarkdownLink(text) {
  let result = text;
  let i = 0;

  while (i < text.length) {
    // Find opening bracket
    if (text[i] === '[') {
      const startBracket = i;
      let bracketCount = 1;
      let j = i + 1;

      // Find matching closing bracket
      while (j < text.length && bracketCount > 0) {
        if (text[j] === '[') bracketCount++;
        else if (text[j] === ']') bracketCount--;
        j++;
      }

      if (bracketCount === 0) {
        const linkText = text.substring(startBracket + 1, j - 1);

        // Check for opening parenthesis after closing bracket
        if (j < text.length && text[j] === '(') {
          const startParen = j;
          let parenCount = 1;
          let k = j + 1;

          // Find matching closing parenthesis using stack
          while (k < text.length && parenCount > 0) {
            if (text[k] === '(') parenCount++;
            else if (text[k] === ')') parenCount--;
            k++;
          }

          if (parenCount === 0) {
            const url = text.substring(startParen + 1, k - 1);
            const fullMatch = text.substring(startBracket, k);

            // Replace with HTML link
            const htmlLink = `<a href="${url}">${linkText}</a>`;
            result = result.replace(fullMatch, htmlLink);

            // Skip the processed part
            i = startBracket + htmlLink.length;
            continue;
          }
        }
      }
    }
    i++;
  }

  return result;
}

console.log('Smart parse result:', parseMarkdownLink(testMarkdown));

// Test additional cases
const testCases = [
  '[simple link](http://example.com)',
  '[link with spaces](http://example.com/path with spaces)',
  '[link with parentheses](http://example.com/path(with)parentheses)',
  '[complex link](https://lib.ui.ac.id/unggah/sites/default/files/dokumen_pedoman/Format%20Penulisan%20Naskah%20Ringkas%20(Artikel%20Jurnal)%20dan%20Makalah.pdf)',
  '[nested parens](http://example.com/path((nested))parens)',
];

console.log('\nAdditional test cases:');
testCases.forEach(test => {
  console.log(`Input:  ${test}`);
  console.log(`Output: ${parseMarkdownLink(test)}`);
  console.log('---');
});