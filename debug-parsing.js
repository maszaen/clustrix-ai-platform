// Debug command parsing
const test = `<!--command-input-->
Get-Process
<!--/command-input-->
<!--command-output-->
Output
<!--/command-output-->`;

console.log('Test string:', JSON.stringify(test));

// Test regex
const allCommandBlocks = [];
test.replace(/<!--command-(input|output)-->([\s\S]*?)<!--\/command-\1-->/gi, (match, type, content) => {
  allCommandBlocks.push({ type, content: content.trim() });
  return match;
});

console.log('All command blocks found:', allCommandBlocks);

// Test grouping
const commandGroups = [];
for (let i = 0; i < allCommandBlocks.length; i++) {
  const block = allCommandBlocks[i];
  if (block.type === 'input') {
    const group = { input: block.content };
    if (i + 1 < allCommandBlocks.length && allCommandBlocks[i + 1].type === 'output') {
      group.output = allCommandBlocks[i + 1].content;
      i++;
    }
    commandGroups.push(group);
  }
}

console.log('Grouped commands:', commandGroups);

// Test placeholder replacement
let srcWithPlaceholders = test;
commandGroups.forEach((group, index) => {
  const inputMatch = group.input ? `<!--command-input-->\n${group.input}\n<!--/command-input-->\n` : '';
  const outputMatch = group.output ? `<!--command-output-->\n${group.output}\n<!--/command-output-->\n` : '';
  const combinedMatch = inputMatch + outputMatch;
  console.log('Combined match:', JSON.stringify(combinedMatch));
  console.log('Test string contains match:', test.includes(combinedMatch));
  if (combinedMatch) {
    const placeholder = `__COMMAND_GROUP_${index}__`;
    console.log('Replacing with:', placeholder);
    srcWithPlaceholders = srcWithPlaceholders.replace(combinedMatch, placeholder);
  }
});

console.log('After replacement:', JSON.stringify(srcWithPlaceholders));

// Test enhancedMarkdownParse
const { enhancedMarkdownParse } = require('./renderer/core/md.js');
const result = enhancedMarkdownParse(srcWithPlaceholders);
console.log('Final result:', result);