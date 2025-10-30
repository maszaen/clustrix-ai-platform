// Direct test of the regex in current environment
const text = '![alt](https://assetd.kompas.id/lNkp3Np1oXpc4Ajq6im57hp4vAs=/fit-in/1024x828/filters:format(webp):quality(80)/https://cdn-dam.kompas.id/images/2025/07/04/8cefa5565273179715410728aa37b89b-250704_3I_atlas.jpg)';

const regex = /!\[([^\]]*)\]\(([^\s]+)\)/g;
const match = regex.exec(text);

console.log('='.repeat(80));
console.log('DIRECT REGEX TEST');
console.log('='.repeat(80));
console.log('Input:', text);
console.log('\nRegex:', regex);
console.log('\nMatch found:', !!match);

if (match) {
  console.log('\nExtracted URL:', match[2]);
  console.log('\nURL Length:', match[2].length);
  console.log('\nExpected URL:', 'https://assetd.kompas.id/lNkp3Np1oXpc4Ajq6im57hp4vAs=/fit-in/1024x828/filters:format(webp):quality(80)/https://cdn-dam.kompas.id/images/2025/07/04/8cefa5565273179715410728aa37b89b-250704_3I_atlas.jpg');
  console.log('\nMatch:', match[2] === 'https://assetd.kompas.id/lNkp3Np1oXpc4Ajq6im57hp4vAs=/fit-in/1024x828/filters:format(webp):quality(80)/https://cdn-dam.kompas.id/images/2025/07/04/8cefa5565273179715410728aa37b89b-250704_3I_atlas.jpg' ? '✓ PASS' : '✗ FAIL');
} else {
  console.log('✗ No match found!');
}

console.log('='.repeat(80));
