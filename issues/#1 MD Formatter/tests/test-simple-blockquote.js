// Simple test for blockquote nesting
const fs = require('fs');
const { JSDOM } = require('jsdom');

const testMarkdown = `> ## Problem: API Timeout Issue
>
> \`\`\`python
> # Initial debugging step
> import requests
> \`\`\`
>
> > ### Analysis: Database Connection Pool
> >
> > - ✅ Health check passed
> > - ❌ Connection pool exhausted
> >
> > > #### Deep Dive: Query Performance
> > >
> > > Steps to fix:
> > > 1. Implement rate limiting ✅
> > > 2. Add database indexing 🔧`;

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.document = dom.window.document;
global.window = dom.window;

global.highlightAllUnder = () => {};
global.attachCodeBlockListeners = () => {};
global.updateCodeBlocksWithArtifactInfo = () => {};

const mdModule = require('../../../local_modules/custom-formatter/md.js');
const md = mdModule.md;

console.log('Testing nested blockquotes...\n');

const html = md(testMarkdown);

// Count blockquotes
const bqMatches = html.match(/<blockquote>/g) || [];
console.log(`Total <blockquote> tags: ${bqMatches.length}`);

// Check nesting
const tempDiv = document.createElement('div');
tempDiv.innerHTML = html;
const topLevelBq = Array.from(tempDiv.querySelectorAll('blockquote')).filter(bq => {
  let parent = bq.parentElement;
  while (parent && parent !== tempDiv) {
    if (parent.tagName === 'BLOCKQUOTE') return false;
    parent = parent.parentElement;
  }
  return true;
}).length;

console.log(`Top-level blockquotes: ${topLevelBq}`);
console.log(`Expected: 1 top-level blockquote with nested blockquotes inside`);

if (topLevelBq === 1) {
  console.log('✅ SUCCESS: Blockquotes properly nested!');
} else {
  console.log(`❌ FAIL: Expected 1 top-level, got ${topLevelBq}`);
}

// Write output
fs.writeFileSync('test-simple-blockquote.html', `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Simple BQ Test</title>
<style>
body { font-family: Arial; padding: 20px; }
blockquote { border-left: 4px solid #ddd; margin: 10px 0; padding: 10px 20px; background: #f9f9f9; }
blockquote blockquote { border-left-color: #bbb; background: #f0f0f0; }
blockquote blockquote blockquote { border-left-color: #999; background: #e8e8e8; }
pre { background: #f4f4f4; padding: 10px; }
</style></head><body>${html}</body></html>`);

console.log('\nOutput written to: test-simple-blockquote.html');
