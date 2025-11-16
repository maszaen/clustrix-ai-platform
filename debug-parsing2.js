// Debug command parsing - FULL FLOW
const test = `<!--command-input-->
Get-Process
<!--/command-input-->
<!--command-output-->
Output
<!--/command-output-->`;

console.log('Original test string:', JSON.stringify(test));

// Simulate the full enhancedMarkdownParse logic
function debugEnhancedMarkdownParse(src) {
  // Extract command input/output tags BEFORE any markdown processing
  const commandGroups = [];
  let commandIndex = 0;

  // First pass: collect all command blocks
  const allCommandBlocks = [];
  src.replace(/<!--command-(input|output)-->([\s\S]*?)<!--\/command-\1-->/gi, (match, type, content) => {
    allCommandBlocks.push({ type, content: content.trim() });
    return match; // Don't replace yet
  });

  console.log('All command blocks found:', allCommandBlocks);

  // Second pass: group consecutive input-output pairs
  for (let i = 0; i < allCommandBlocks.length; i++) {
    const block = allCommandBlocks[i];
    if (block.type === 'input') {
      const group = { input: block.content };
      // Check if next block is output
      if (i + 1 < allCommandBlocks.length && allCommandBlocks[i + 1].type === 'output') {
        group.output = allCommandBlocks[i + 1].content;
        i++; // Skip the output block since it's grouped
      }
      commandGroups.push(group);
    } else if (block.type === 'output') {
      // Standalone output (shouldn't happen in our system, but handle it)
      commandGroups.push({ output: block.content });
    }
  }

  console.log('Grouped commands:', commandGroups);

  // Third pass: replace with grouped placeholders
  let srcAfterCommandExtraction = src;
  commandGroups.forEach((group, index) => {
    const inputMatch = group.input ? `<!--command-input-->\n${group.input}\n<!--/command-input-->\n` : '';
    const outputMatch = group.output ? `<!--command-output-->\n${group.output}\n<!--/command-output-->\n` : '';
    const combinedMatch = (inputMatch + outputMatch).trim();
    if (combinedMatch) {
      const placeholder = `__COMMAND_GROUP_${index}__`;
      console.log('Replacing:', JSON.stringify(combinedMatch));
      console.log('With:', placeholder);
      srcAfterCommandExtraction = srcAfterCommandExtraction.replace(combinedMatch, placeholder);
    }
  });

  console.log('After command extraction:', JSON.stringify(srcAfterCommandExtraction));

  // Simulate basic markdown processing (just paragraphs for now)
  let html = srcAfterCommandExtraction
    .split('\n\n')
    .map(para => para.trim() ? `<p>${para.replace(/\n/g, '<br>')}</p>` : '')
    .join('');

  console.log('After basic markdown:', html);

  // Restore command groups
  commandGroups.forEach((group, index) => {
    const placeholder = `__COMMAND_GROUP_${index}__`;
    let replacement = '';

    if (group.input) {
      // Create expandable command input with output
      const outputHtml = group.output ?
        '<div class="command-output" style="display: none;">' + group.output.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>' : '';

      const toggleButton = group.output ? '<button class="command-toggle"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6,9 12,15 18,9"></polyline></svg></button>' : '';

      replacement = '<div class="command-input"><div class="command-header"><svg class="command-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4,17 10,11 4,5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg><code class="command-code language-powershell">' +
        group.input.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') +
        '</code>' + toggleButton + '</div>' + outputHtml + '</div>';
    } else if (group.output) {
      // Standalone output (fallback)
      replacement = '<div class="command-output">' + group.output.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>';
    }

    console.log('Restoring placeholder:', placeholder);
    console.log('With replacement:', replacement);
    html = html.replace(placeholder, replacement);
  });

  return html;
}

const result = debugEnhancedMarkdownParse(test);
console.log('Final result:', result);