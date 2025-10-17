const { enhancedMarkdownParse } = require('./local_modules/custom-formatter/md.js');

const testInput = `Sebuah analisis.

<brain>
<bli>Pertanyaan reflektif 1?</bli>
<bli>Pertanyaan reflektif 2?</bli>
</brain>

<prompt>
<pli>Suggest 1</pli>
<pli>Suggest 2</pli>
<pli>Suggest 3</pli>
</prompt>

Dan lanjut ke konten berikutnya.`;

console.log('Final Test Input:');
console.log(testInput);
console.log('\n' + '='.repeat(60) + '\n');

const result = enhancedMarkdownParse(testInput);
console.log('Final Output:');
console.log(result);
