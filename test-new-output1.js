// Test new-output1.html for table issue fix
const fs = require('fs');
const { JSDOM } = require('jsdom');

// Read actual markdown from actual-response.md (Response AI 2)
const actualResponse = fs.readFileSync('./issues/actual-response.md', 'utf-8');
const response2 = actualResponse.split('Response AI 2:')[1].split('Response AI 3:')[0];

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.document = dom.window.document;
global.window = dom.window;

global.highlightAllUnder = () => {};
global.attachCodeBlockListeners = () => {};
global.updateCodeBlocksWithArtifactInfo = () => {};

const mdModule = require('./local_modules/custom-formatter/md.js');
const md = mdModule.md;

console.log('Testing Response AI 2 for table issues...\n');

const html = md(response2.trim());

// Check for table rows as plain text
const hasPlainTableRows = html.match(/<br>\|/);

console.log('=== Table Parsing Check ===');
if (hasPlainTableRows) {
  console.log('❌ Found table rows as plain text');
  const matches = html.match(/<br>\|[^<]+/g) || [];
  console.log(`   Found ${matches.length} plain text table rows:`);
  matches.slice(0, 3).forEach((m, i) => {
    console.log(`   ${i + 1}. ${m.substring(0, 60)}...`);
  });
} else {
  console.log('✅ All table rows properly parsed as tables');
}

// Count tables
const tempDiv = document.createElement('div');
tempDiv.innerHTML = html;
const tables = tempDiv.querySelectorAll('table');

console.log(`\n=== Table Count ===`);
console.log(`   Total tables found: ${tables.length}`);

// Check each table for completeness
tables.forEach((table, i) => {
  const rows = table.querySelectorAll('tbody tr').length;
  const headers = table.querySelectorAll('thead th').length;
  console.log(`   Table ${i + 1}: ${headers} columns, ${rows} rows`);
});

// Expected: Should have tables in blockquotes with proper row counts
const expectedTables = [
  { name: 'Tools table', expectedRows: 3 }, // Git, Docker, K8s
  { name: 'Struktur proyek', expectedRows: 3 }, // src, tests, docs  
  { name: 'Property CSS', expectedRows: 3 } // font-family, color, margin
];

console.log(`\n=== Expected vs Actual ===`);
let allCorrect = true;
expectedTables.forEach((expected, i) => {
  if (tables[i]) {
    const actualRows = tables[i].querySelectorAll('tbody tr').length;
    const status = actualRows === expected.expectedRows ? '✅' : '❌';
    console.log(`   ${status} ${expected.name}: expected ${expected.expectedRows}, got ${actualRows}`);
    if (actualRows !== expected.expectedRows) allCorrect = false;
  } else {
    console.log(`   ❌ ${expected.name}: table not found`);
    allCorrect = false;
  }
});

if (allCorrect) {
  console.log('\n✅ All tables have correct row counts!');
} else {
  console.log('\n❌ Some tables are incomplete');
}

// Write output
fs.writeFileSync('test-new-output1-fixed.html', `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Response AI 2 Fixed</title>
<style>
body { font-family: Arial; padding: 20px; max-width: 900px; margin: 0 auto; }
blockquote { border-left: 4px solid #ddd; margin: 10px 0; padding: 10px 20px; background: #f9f9f9; }
blockquote blockquote { border-left-color: #bbb; background: #f0f0f0; }
table { border-collapse: collapse; margin: 10px 0; width: 100%; }
th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
th { background: #f0f0f0; }
.code-block-container { margin: 10px 0; border: 1px solid #ddd; }
.code-block-header { background: #e8e8e8; padding: 5px 10px; }
pre { background: #f4f4f4; padding: 10px; }
</style></head><body>${html}</body></html>`);

console.log('\n✅ Output written to: test-new-output1-fixed.html');
