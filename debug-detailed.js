// Test with console logs added to md.js logic
const test = `<!--command-input-->
Get-Process
<!--/command-input-->
<!--command-output-->
Output
<!--/command-output-->`;

console.log('Testing command parsing with detailed logs...');

// Simulate the exact logic from md.js with logs
const commandGroups = [];
let commandIndex = 0;

// First pass: collect all command blocks
const allCommandBlocks = [];
test.replace(/<!--command-(input|output)-->([\s\S]*?)<!--\/command-\1-->/gi, (match, type, content) => {
  console.log('REGEX MATCH - Type:', type, 'Content:', JSON.stringify(content.trim()));
  allCommandBlocks.push({ type, content: content.trim() });
  return match;
});

console.log('All command blocks after regex:', allCommandBlocks.length, allCommandBlocks);

// Second pass: group consecutive input-output pairs
for (let i = 0; i < allCommandBlocks.length; i++) {
  const block = allCommandBlocks[i];
  console.log('Processing block', i, ':', block);
  if (block.type === 'input') {
    const group = { input: block.content };
    console.log('Created input group:', group);
    // Check if next block is output
    if (i + 1 < allCommandBlocks.length && allCommandBlocks[i + 1].type === 'output') {
      group.output = allCommandBlocks[i + 1].content;
      console.log('Added output to group:', group);
      i++; // Skip the output block since it's grouped
    }
    commandGroups.push(group);
    console.log('Pushed to commandGroups:', commandGroups);
  } else if (block.type === 'output') {
    // Standalone output (shouldn't happen in our system, but handle it)
    console.log('Standalone output block');
    commandGroups.push({ output: block.content });
  }
}

console.log('Final commandGroups:', commandGroups);

// Third pass: replace with grouped placeholders
let srcAfterCommandExtraction = test;
commandGroups.forEach((group, index) => {
  const inputMatch = group.input ? `<!--command-input-->\n${group.input}\n<!--/command-input-->\n` : '';
  const outputMatch = group.output ? `<!--command-output-->\n${group.output}\n<!--/command-output-->\n` : '';
  const combinedMatch = (inputMatch + outputMatch).trim(); // TRIM HERE
  console.log('Group', index, '- Combined match (trimmed):', JSON.stringify(combinedMatch));
  console.log('Test string includes match:', test.includes(combinedMatch));
  if (combinedMatch) {
    const placeholder = `__COMMAND_GROUP_${index}__`;
    console.log('Replacing with placeholder:', placeholder);
    srcAfterCommandExtraction = srcAfterCommandExtraction.replace(combinedMatch, placeholder);
  }
});

console.log('srcAfterCommandExtraction:', JSON.stringify(srcAfterCommandExtraction));

// Simulate basic markdown processing - USE srcAfterCommandExtraction
let html = srcAfterCommandExtraction
  .split('\n\n')
  .map(para => para.trim() ? `<p>${para.replace(/\n/g, '<br>')}</p>` : '')
  .join('');

console.log('HTML after basic processing:', html);

// Restore command groups
console.log('Restoring command groups, count:', commandGroups.length);
commandGroups.forEach((group, index) => {
  const placeholder = `__COMMAND_GROUP_${index}__`;
  console.log('Restoring placeholder:', placeholder, 'for group:', group);
  let replacement = '';

  if (group.input) {
    const outputHtml = group.output ?
      '<div class="command-output" style="display: none;">' + group.output.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>' : '';

    const toggleButton = group.output ? '<button class="command-toggle"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6,9 12,15 18,9"></polyline></svg></button>' : '';

    replacement = '<div class="command-input"><div class="command-header"><svg class="command-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4,17 10,11 4,5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg><code class="command-code language-powershell">' +
      group.input.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') +
      '</code>' + toggleButton + '</div>' + outputHtml + '</div>';
  } else if (group.output) {
    replacement = '<div class="command-output">' + group.output.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>';
  }

  console.log('Replacement HTML:', replacement);
  html = html.replace(placeholder, replacement);
});

console.log('Final HTML:', html);