// Debug dedent logic
const codeContent = `        <p>teks p</p>
        <ol>...</ol>`;

console.log('Original code:');
console.log(codeContent);
console.log();

const lines = codeContent.split('\n');
console.log('Lines:', lines);
console.log();

const cleanedLines = [...lines]; // Start with copy

// Get indentation of non-empty lines
const nonEmptyLines = cleanedLines.filter(line => line.trim().length > 0);
console.log('Non-empty lines:', nonEmptyLines);

const indents = nonEmptyLines.map(line => {
  const match = line.match(/^(\s*)/);
  const indent = match ? match[1].length : 0;
  console.log(`  "${line}" → indent: ${indent}`);
  return indent;
});

const minIndent = Math.min(...indents);
console.log(`\nMin indent: ${minIndent}`);

if (minIndent > 0) {
  console.log(`\nRemoving ${minIndent} spaces from each line...`);
  for (let i = 0; i < cleanedLines.length; i++) {
    if (cleanedLines[i].trim().length > 0) {
      const before = cleanedLines[i];
      cleanedLines[i] = cleanedLines[i].substring(minIndent);
      console.log(`  "${before}" → "${cleanedLines[i]}"`);
    }
  }
}

console.log('\nFinal result:');
console.log(cleanedLines.join('\n'));
