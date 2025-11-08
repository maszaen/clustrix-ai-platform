const fs = require('fs');
const path = require('path');

// Parse command line arguments
const targetFile = process.argv[2] || 'renderer/renderer.js';
const startLine = process.argv[3] ? parseInt(process.argv[3]) : null;
const endLine = process.argv[4] ? parseInt(process.argv[4]) : null;

// Validate file existence
if (!fs.existsSync(targetFile)) {
  console.error(`❌ Error: File not found: ${targetFile}`);
  console.log('\nUsage: node checker/listener-analyzer.js [file] [start-line] [end-line]');
  console.log('Example: node checker/listener-analyzer.js renderer/renderer.js 14094 16172');
  console.log('Example: node checker/listener-analyzer.js renderer/pages/chat.js');
  process.exit(1);
}

console.log(`\nAnalyzing event listeners in: ${targetFile}`);
if (startLine && endLine) {
  console.log(`Focusing on lines ${startLine}-${endLine}\n`);
} else {
  console.log(`Analyzing entire file\n`);
}

// Read file
const code = fs.readFileSync(targetFile, 'utf-8');
const lines = code.split('\n');

// Extract target lines
let targetLines, lineOffset;
if (startLine && endLine) {
  targetLines = lines.slice(startLine - 1, endLine);
  lineOffset = startLine;
} else {
  targetLines = lines;
  lineOffset = 1;
}

const targetCode = targetLines.join('\n');

// Find all addEventListener patterns
const listenerMatches = targetCode.match(/addEventListener\(['"](\w+)['"]/g);

if (!listenerMatches || listenerMatches.length === 0) {
  console.log('No event listeners found in the specified range');
  process.exit(0);
}

console.log(`Found ${listenerMatches.length} event listeners\n`);

// Count event types
console.log('EVENT TYPES DISTRIBUTION:\n');
const eventTypes = {};
listenerMatches.forEach(l => {
  const type = l.match(/['"](\w+)['"]/)[1];
  eventTypes[type] = (eventTypes[type] || 0) + 1;
});

Object.entries(eventTypes)
  .sort((a, b) => b[1] - a[1])
  .forEach(([type, count]) => {
    const bar = '█'.repeat(Math.min(count, 50));
    console.log(`  ${type.padEnd(15)} ${bar} ${count}x`);
  });

// Track detailed event listeners with context
const events = [];
for (let i = 0; i < targetLines.length; i++) {
  const line = targetLines[i];
  
  if (line.includes('addEventListener')) {
    // Find element selector (look back up to 10 lines)
    let element = 'unknown';
    let selectorType = '';
    
    for (let j = Math.max(0, i - 10); j < i; j++) {
      const prevLine = targetLines[j];
      
      // getElementById
      if (prevLine.includes('getElementById')) {
        const match = prevLine.match(/getElementById\(['"`]([^'"`]+)['"`]\)/);
        if (match) {
          element = match[1];
          selectorType = 'id';
          break;
        }
      }
      
      // querySelector
      if (prevLine.includes('querySelector(') && !prevLine.includes('querySelectorAll')) {
        const match = prevLine.match(/querySelector\(['"`]([^'"`]+)['"`]\)/);
        if (match) {
          element = match[1].replace(/^[#.]/, '');
          selectorType = match[1].startsWith('#') ? 'id' : 'class';
          break;
        }
      }
      
      // querySelectorAll
      if (prevLine.includes('querySelectorAll')) {
        const match = prevLine.match(/querySelectorAll\(['"`]([^'"`]+)['"`]\)/);
        if (match) {
          element = match[1].replace(/^[#.]/, '');
          selectorType = 'multiple';
          break;
        }
      }
      
      // Variable assignment (const btn = ...)
      const varMatch = prevLine.match(/(?:const|let|var)\s+(\w+)\s*=/);
      if (varMatch && !element.startsWith('unknown')) {
        element = varMatch[1];
        break;
      }
    }
    
    // Extract event type and handler
    const eventMatch = line.match(/addEventListener\(['"](\w+)['"],\s*(?:function\s*\(|async\s+function\s*\(|\(|(\w+))/);
    const eventType = eventMatch ? eventMatch[1] : 'unknown';
    const handlerName = eventMatch && eventMatch[2] ? eventMatch[2] : 'inline';
    
    // Check if it's an arrow function or named function
    let handlerType = 'inline';
    if (line.includes('=>')) handlerType = 'arrow';
    else if (line.includes('function')) handlerType = 'function';
    else if (eventMatch && eventMatch[2]) handlerType = 'named';
    
    events.push({
      line: lineOffset + i,
      element: element,
      selectorType: selectorType,
      event: eventType,
      handler: handlerName,
      handlerType: handlerType,
      code: line.trim().substring(0, 80) + (line.length > 80 ? '...' : '')
    });
  }
}

// Group by feature (extract prefix from element name)
const groups = {};
events.forEach(e => {
  let prefix = 'misc';
  
  // Try to extract meaningful prefix
  if (e.element !== 'unknown') {
    // camelCase: chatBtn, loginForm -> chat, login
    const camelMatch = e.element.match(/^([a-z]+)(?=[A-Z]|Btn|Form|Input|Modal|Panel|Container)/i);
    if (camelMatch) {
      prefix = camelMatch[1].toLowerCase();
    } else {
      // kebab-case or snake_case: chat-btn, login_form -> chat, login
      const kebabMatch = e.element.match(/^([a-z]+)[-_]/i);
      if (kebabMatch) {
        prefix = kebabMatch[1].toLowerCase();
      } else {
        // Single word or unknown pattern
        prefix = e.element.substring(0, Math.min(10, e.element.length)).toLowerCase();
      }
    }
  }
  
  if (!groups[prefix]) groups[prefix] = [];
  groups[prefix].push(e);
});

// Print grouped results
console.log('\nEVENT LISTENERS GROUPED BY FEATURE:\n');
Object.entries(groups)
  .sort((a, b) => b[1].length - a[1].length)
  .forEach(([prefix, items]) => {
    console.log(`\n${prefix.toUpperCase()} (${items.length} events):`);
    items.slice(0, 8).forEach(item => {
      const icon = item.event === 'click' ? '🖱️' : 
                   item.event === 'input' ? '⌨️' :
                   item.event === 'change' ? '🔄' :
                   item.event === 'submit' ? '📤' : '⚡';
      console.log(`  ${icon} Line ${item.line}: #${item.element} → ${item.event} (${item.handlerType})`);
    });
    if (items.length > 8) {
      console.log(`  ... and ${items.length - 8} more`);
    }
  });

// Statistics
console.log('\nSTATISTICS:\n');
console.log(`  Total listeners: ${events.length}`);
console.log(`  Unique elements: ${new Set(events.map(e => e.element)).size}`);
console.log(`  Event types: ${Object.keys(eventTypes).length}`);

const handlerTypes = {};
events.forEach(e => {
  handlerTypes[e.handlerType] = (handlerTypes[e.handlerType] || 0) + 1;
});
console.log('\n  Handler types:');
Object.entries(handlerTypes).forEach(([type, count]) => {
  console.log(`    ${type}: ${count}x`);
});

// Create results directory
const resultsDir = 'checker/results';
if (!fs.existsSync(resultsDir)) {
  fs.mkdirSync(resultsDir, { recursive: true });
}

// Save detailed JSON
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const outputFile = path.join(
  resultsDir,
  `listeners-${path.basename(targetFile, path.extname(targetFile))}-${timestamp}.json`
);

const report = {
  file: targetFile,
  range: startLine && endLine ? { start: startLine, end: endLine } : 'entire file',
  analyzedAt: new Date().toISOString(),
  summary: {
    totalListeners: events.length,
    uniqueElements: new Set(events.map(e => e.element)).size,
    eventTypes: eventTypes,
    handlerTypes: handlerTypes
  },
  groups: groups,
  details: events
};

fs.writeFileSync(outputFile, JSON.stringify(report, null, 2));

console.log(`\nFull report saved to: ${outputFile}`);