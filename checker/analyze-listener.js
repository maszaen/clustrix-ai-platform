const fs = require('fs');

const code = fs.readFileSync('renderer/renderer.js', 'utf-8');
const lines = code.split('\n');

// Extract setupEventListeners (line 14094-16172)
const monsterLines = lines.slice(14093, 16172);



// Extract setupEventListeners (line 14094-16172)
const monsterFunction = lines.slice(14093, 16172).join('\n');

// Cari pola addEventListener
const listeners = monsterFunction.match(/addEventListener\(['"](\w+)['"]/g);

console.log('Event types found:');
const eventTypes = {};
listeners.forEach(l => {
  const type = l.match(/['"](\w+)['"]/)[1];
  eventTypes[type] = (eventTypes[type] || 0) + 1;
});

Object.entries(eventTypes)
  .sort((a, b) => b[1] - a[1])
  .forEach(([type, count]) => {
    console.log(`  ${type}: ${count}x`);
  });


// Track event listeners dengan konteksnya
const events = [];
for (let i = 0; i < monsterLines.length; i++) {
  const line = monsterLines[i];
  
  if (line.includes('addEventListener')) {
    // Cari element selector (biasanya di line sebelumnya)
    let context = '';
    for (let j = Math.max(0, i - 5); j < i; j++) {
      const prevLine = monsterLines[j];
      
      // Cari getElementById, querySelector, dll
      if (prevLine.includes('getElementById') || 
          prevLine.includes('querySelector') ||
          prevLine.includes('querySelectorAll')) {
        const match = prevLine.match(/['"`]([^'"`]+)['"`]/);
        if (match) context = match[1];
      }
    }
    
    // Extract event type
    const eventMatch = line.match(/addEventListener\(['"](\w+)['"]/);
    const eventType = eventMatch ? eventMatch[1] : 'unknown';
    
    events.push({
      line: 14094 + i,
      element: context || 'unknown',
      event: eventType,
      code: line.trim()
    });
  }
}

// Group by element prefix (untuk identify feature)
const groups = {};
events.forEach(e => {
  // Extract prefix dari ID (e.g., "chatBtn" -> "chat")
  const prefix = e.element.match(/^([a-z]+)/i)?.[1]?.toLowerCase() || 'misc';
  
  if (!groups[prefix]) groups[prefix] = [];
  groups[prefix].push(e);
});

// Print grouped results
console.log('\n🎯 EVENT LISTENERS GROUPED BY FEATURE:\n');
Object.entries(groups)
  .sort((a, b) => b[1].length - a[1].length)
  .forEach(([prefix, items]) => {
    console.log(`\n${prefix.toUpperCase()} (${items.length} events):`);
    items.slice(0, 5).forEach(item => {
      console.log(`  Line ${item.line}: #${item.element} → ${item.event}`);
    });
    if (items.length > 5) {
      console.log(`  ... and ${items.length - 5} more`);
    }
  });

// Save detail ke file
fs.writeFileSync(
  'checker/results/listener.json', 
  JSON.stringify(events, null, 2)
);

console.log('\n Full detail saved to: results/listener.json');