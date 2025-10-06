// Comprehensive edge case tests for md.js
const fs = require('fs');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.document = dom.window.document;
global.window = dom.window;

global.highlightAllUnder = () => {};
global.attachCodeBlockListeners = () => {};
global.updateCodeBlocksWithArtifactInfo = () => {};

const mdModule = require('../../../local_modules/custom-formatter/md.js');
const md = mdModule.md;

console.log('Running comprehensive edge case tests...\n');

const tests = [
  {
    name: 'Basic markdown elements',
    input: `# Heading 1
## Heading 2
### Heading 3

**Bold text** and *italic text* and ***bold italic***.

\`inline code\` and [links](https://example.com).

---

Paragraph with line break.`,
    validate: (html) => {
      return html.includes('<h1>') && html.includes('<h2>') && html.includes('<h3>') &&
             html.includes('<strong>') && html.includes('<em>') &&
             html.includes('<code>') && html.includes('<a ') && html.includes('<hr>');
    }
  },
  {
    name: 'Lists without blockquotes',
    input: `- Item 1
- Item 2
  - Nested item
- Item 3

1. First
2. Second
3. Third`,
    validate: (html) => {
      return html.includes('<ul>') && html.includes('<ol>') && html.includes('<li>');
    }
  },
  {
    name: 'Codeblock outside blockquote',
    input: `Here's some code:

\`\`\`javascript
function test() {
  return "hello";
}
\`\`\`

More text.`,
    validate: (html) => {
      return html.includes('language-javascript') && 
             html.includes('function test()') &&
             !html.includes('&gt;') && // No stray > markers
             html.includes('return "hello"');
    }
  },
  {
    name: 'Codeblock in list',
    input: `1. First step
   
   \`\`\`python
   def example():
       return True
   \`\`\`
   
2. Second step`,
    validate: (html) => {
      // Check that codeblock is inside list item
      const listMatch = html.match(/<li>[\s\S]*?<div class="code-block-container">[\s\S]*?<\/li>/);
      return !!listMatch && html.includes('language-python') && html.includes('def example()');
    }
  },
  {
    name: 'Simple blockquote',
    input: `> This is a quote
> with multiple lines`,
    validate: (html) => {
      return html.includes('<blockquote>') && html.includes('This is a quote');
    }
  },
  {
    name: 'Blockquote with codeblock',
    input: `> Here's code in quote:
> 
> \`\`\`bash
> echo "test"
> \`\`\``,
    validate: (html) => {
      return html.includes('<blockquote>') && 
             html.includes('language-bash') &&
             html.includes('echo "test"') &&
             !html.includes('&gt;'); // No stray > markers in code
    }
  },
  {
    name: 'Nested blockquotes (2 levels)',
    input: `> Level 1
> 
> > Level 2
> > text`,
    validate: (html) => {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = html;
      const nested = tempDiv.querySelector('blockquote blockquote');
      return !!nested && html.includes('Level 1') && html.includes('Level 2');
    }
  },
  {
    name: 'Nested blockquotes (3 levels)',
    input: `> Level 1
> 
> > Level 2
> > 
> > > Level 3`,
    validate: (html) => {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = html;
      const nested3 = tempDiv.querySelector('blockquote blockquote blockquote');
      return !!nested3 && html.includes('Level 3');
    }
  },
  {
    name: 'Table',
    input: `| Header 1 | Header 2 |
|----------|----------|
| Cell 1   | Cell 2   |
| Cell 3   | Cell 4   |`,
    validate: (html) => {
      return html.includes('<table>') && html.includes('<thead>') && 
             html.includes('<tbody>') && html.includes('Header 1');
    }
  },
  {
    name: 'Mixed list with blockquote',
    input: `- Item 1
  
  > Quote in list
  > more text
  
- Item 2`,
    validate: (html) => {
      // Blockquote should be inside list item
      return html.includes('<ul>') && html.includes('<blockquote>') &&
             html.includes('Quote in list');
    }
  },
  {
    name: 'Multiple separate blockquotes',
    input: `> First quote

Some text

> Second quote`,
    validate: (html) => {
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
      // Should have 2 separate top-level blockquotes
      return topLevelBq === 2;
    }
  },
  {
    name: 'Code indentation preserved',
    input: `\`\`\`python
def example():
    if True:
        return "indented"
\`\`\``,
    validate: (html) => {
      // Check that indentation spaces are preserved
      return html.includes('def example()') && 
             html.includes('    if True:') &&
             html.includes('        return');
    }
  }
];

let passed = 0;
let failed = 0;

tests.forEach((test, index) => {
  try {
    const html = md(test.input);
    const isValid = test.validate(html);
    
    if (isValid) {
      console.log(`✅ Test ${index + 1}: ${test.name}`);
      passed++;
    } else {
      console.log(`❌ Test ${index + 1}: ${test.name}`);
      console.log(`   Input: ${test.input.substring(0, 50)}...`);
      console.log(`   HTML preview: ${html.substring(0, 100)}...`);
      failed++;
    }
  } catch (error) {
    console.log(`❌ Test ${index + 1}: ${test.name} - ERROR`);
    console.log(`   ${error.message}`);
    failed++;
  }
});

console.log(`\n${'='.repeat(60)}`);
console.log(`Results: ${passed} passed, ${failed} failed out of ${tests.length} tests`);
console.log('='.repeat(60));

if (failed === 0) {
  console.log('✅ All edge case tests passed!');
  process.exit(0);
} else {
  console.log('❌ Some tests failed!');
  process.exit(1);
}
