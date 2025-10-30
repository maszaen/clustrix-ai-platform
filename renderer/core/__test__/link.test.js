/**
 * Test for markdown link/image parsing with complex URLs containing parentheses
 */

// Test cases
const testCases = [
  {
    name: "Simple URL",
    input: "![alt](https://example.com/image.jpg)",
    expectedUrl: "https://example.com/image.jpg"
  },
  {
    name: "URL with nested parentheses - Kompas case",
    input: "![alt](https://assetd.kompas.id/lNkp3Np1oXpc4Ajq6im57hp4vAs=/fit-in/1024x828/filters:format(webp):quality(80)/https://cdn-dam.kompas.id/images/2025/07/04/8cefa5565273179715410728aa37b89b-250704_3I_atlas.jpg)",
    expectedUrl: "https://assetd.kompas.id/lNkp3Np1oXpc4Ajq6im57hp4vAs=/fit-in/1024x828/filters:format(webp):quality(80)/https://cdn-dam.kompas.id/images/2025/07/04/8cefa5565273179715410728aa37b89b-250704_3I_atlas.jpg"
  },
  {
    name: "URL with multiple filter params",
    input: "![image](https://cdn.example.com/transform:resize(800):format(webp):quality(90)/photo.jpg)",
    expectedUrl: "https://cdn.example.com/transform:resize(800):format(webp):quality(90)/photo.jpg"
  }
];

// Test patterns
const patterns = [
  {
    name: "Current lookahead",
    regex: /!\[([^\]]*)\]\(([^)\s]+(?:\)(?=[^)\s])[^)\s]+)*)\)/g
  },
  {
    name: "Match non-whitespace, allow ) if NOT followed by whitespace/end",
    regex: /!\[([^\]]*)\]\(((?:[^)\s]|\)(?=\S))+)\)/g
  },
  {
    name: "Match until ) followed by whitespace or end",
    regex: /!\[([^\]]*)\]\(([^\s]+?)\)(?=\s|$)/g
  },
  {
    name: "Greedy non-whitespace",
    regex: /!\[([^\]]*)\]\(([^\s]+)\)/g
  }
];

console.log("Testing URL parsing patterns:\n");

patterns.forEach((pattern) => {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Pattern: ${pattern.name}`);
  console.log(`Regex: ${pattern.regex}`);
  console.log(`${"=".repeat(60)}`);
  
  testCases.forEach((test) => {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    const match = regex.exec(test.input);
    
    const passed = match && match[2] === test.expectedUrl;
    const result = passed ? "✓ PASS" : "✗ FAIL";
    
    console.log(`\n${test.name}: ${result}`);
    console.log(`  Input: ${test.input.substring(0, 80)}...`);
    console.log(`  Expected: ${test.expectedUrl}`);
    console.log(`  Got: ${match ? match[2] : "(no match)"}`);
  });
});
