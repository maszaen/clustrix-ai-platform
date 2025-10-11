// Test the link formatter fix for issue #6
// Clear module cache to ensure we get the latest version
delete require.cache[require.resolve('./local_modules/custom-formatter/md.js')];
const { parseInlineMarkdown } = require('./local_modules/custom-formatter/md.js');

const testCases = [
  {
    name: "Citation format [Source: Title (URL)]",
    input: "Demonstran bertindak keras dengan membakar berbagai gedung pemerintah. Salah satu insiden yang sangat menonjol adalah terbakarnya kompleks administrasi pusat Nepal, Singha Durbar, di Kathmandu [Source: 2025 Nepalese Gen Z Protests | Background, Social Media Ban ... (https://www.britannica.com/event/2025-Nepalese-Gen-Z-Protests)].",
    expected: 'https://www.britannica.com/event/2025-Nepalese-Gen-Z-Protests',
    expectedText: 'Source: 2025 Nepalese Gen Z Protests | Background, Social Media Ban ...'
  },
  {
    name: "URL with trailing ).",
    input: "Check this out (https://example.com).",
    expected: 'https://example.com'
  },
  {
    name: "Multiple URLs with punctuation",
    input: "Visit https://site1.com), then https://site2.org], and finally https://site3.net.",
    expected: ['https://site1.com', 'https://site2.org', 'https://site3.net']
  },
  {
    name: "Standard markdown link [text](url)",
    input: "Check out [this website](https://example.com) for more info.",
    expected: 'https://example.com',
    expectedText: 'this website'
  }
];

console.log("Testing Link Formatter Fix\n" + "=".repeat(50));

testCases.forEach((testCase, index) => {
  console.log(`\nTest ${index + 1}: ${testCase.name}`);
  console.log(`Input: ${testCase.input}`);
  
  const result = parseInlineMarkdown(testCase.input);
  console.log(`Output: ${result}`);
  
  // Debug: Show raw output bytes for first test
  if (index === 0) {
    console.log(`Debug - checking for '<<<<': ${result.includes('<<<') ? 'YES' : 'NO'}`);
    console.log(`Debug - checking for 'LINKPLACEHOLDER': ${result.includes('LINKPLACEHOLDER') ? 'YES' : 'NO'}`);
    console.log(`Debug - checking for '&lt;&lt;&lt;': ${result.includes('&lt;&lt;&lt;') ? 'YES' : 'NO'}`);
    console.log(`Debug - Result snippet:`, result.slice(-200));
  }
  
  // Extract href values and link text from the result
  const linkMatches = result.match(/<a [^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/g);
  if (linkMatches) {
    const links = linkMatches.map(match => {
      const hrefMatch = match.match(/href="([^"]+)"/);
      const textMatch = match.match(/>([^<]+)<\/a>/);
      return {
        href: hrefMatch ? hrefMatch[1] : '',
        text: textMatch ? textMatch[1] : ''
      };
    });
    
    console.log(`Extracted Links:`);
    links.forEach(link => console.log(`  - href: ${link.href}`));
    links.forEach(link => console.log(`  - text: ${link.text}`));
    
    // Verify the URLs don't have trailing punctuation
    const expectedUrls = Array.isArray(testCase.expected) ? testCase.expected : [testCase.expected];
    const allMatch = links.every((link, i) => link.href === expectedUrls[i]);
    
    let textMatch = true;
    if (testCase.expectedText) {
      textMatch = links.some(link => link.text === testCase.expectedText);
    }
    
    if (allMatch && textMatch) {
      console.log("✓ PASS - Links correctly formatted");
    } else {
      if (!allMatch) {
        console.log("✗ FAIL - URLs incorrect");
        console.log(`Expected URLs: ${expectedUrls.join(', ')}`);
        console.log(`Got URLs: ${links.map(l => l.href).join(', ')}`);
      }
      if (!textMatch) {
        console.log("✗ FAIL - Link text incorrect");
        console.log(`Expected text: ${testCase.expectedText}`);
        console.log(`Got text: ${links.map(l => l.text).join(', ')}`);
      }
    }
  } else {
    console.log("✗ FAIL - No links found in output");
  }
});

console.log("\n" + "=".repeat(50));
