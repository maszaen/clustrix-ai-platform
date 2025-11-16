// Debug: Test if command extraction runs
const test = `<!--command-input-->
Get-Process
<!--/command-input-->
<!--command-output-->
Output
<!--/command-output-->`;

console.log('Input:', JSON.stringify(test));

// Simulate the exact logic from md.js
const commandGroups = [];
let commandIndex = 0;

// First pass: collect all command blocks
const allCommandBlocks = [];
test.replace(/<!--command-(input|output)-->([\s\S]*?)<!--\/command-\1-->/gi, (match, type, content) => {
  console.log('Found command block:', { type, content: content.trim() });
  allCommandBlocks.push({ type, content: content.trim() });
  return match; // Don't replace yet
});

console.log('All command blocks collected:', allCommandBlocks);

// Second pass: group consecutive input-output pairs
for (let i = 0; i < allCommandBlocks.length; i++) {
  const block = allCommandBlocks[i];
  console.log('Processing block:', block);
  if (block.type === 'input') {
    const group = { input: block.content };
    // Check if next block is output
    if (i + 1 < allCommandBlocks.length && allCommandBlocks[i + 1].type === 'output') {
      group.output = allCommandBlocks[i + 1].content;
      console.log('Grouping with output:', allCommandBlocks[i + 1].content);
      i++; // Skip the output block since it's grouped
    }
    commandGroups.push(group);
  } else if (block.type === 'output') {
    // Standalone output (shouldn't happen in our system, but handle it)
    commandGroups.push({ output: block.content });
  }
}

console.log('Final command groups:', commandGroups);