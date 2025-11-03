const fs = require('fs');
const path = require('path');

const changelogDir = path.join(__dirname, '..', 'changelog', 'release-notes');

function compareVersions(a, b) {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const partA = partsA[i] || 0;
    const partB = partsB[i] || 0;

    if (partA > partB) return 1;
    if (partA < partB) return -1;
  }
  return 0;
}

try {
  const files = fs.readdirSync(changelogDir);
  const versionFiles = files.filter(file => file.startsWith('v') && file.endsWith('.md'));

  if (versionFiles.length === 0) {
    console.log('No changelog files found.');
    process.exit(0);
  }

  const versions = versionFiles.map(file => {
    const version = file.replace(/^v/, '').replace(/\.md$/, '');
    return { file, version };
  });

  versions.sort((a, b) => compareVersions(a.version, b.version));

  const latest = versions[versions.length - 1];
  console.log(`Current app version: v${latest.version}\n`);
  
  const filePath = path.join(changelogDir, latest.file);
  const content = fs.readFileSync(filePath, 'utf8');
  console.log(content);
} catch (error) {
  console.error('Error reading changelog directory:', error.message);
  process.exit(1);
}