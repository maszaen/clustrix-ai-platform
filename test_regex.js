const testInput = "[Source: 2025 Nepalese Gen Z Protests | Background, Social Media Ban ... (https://www.britannica.com/event/2025-Nepalese-Gen-Z-Protests)].";

const citationRegex = /\[([^\]]*?)\s*\((https?:\/\/[^)]+)\)\]/g;

const matches = testInput.matchAll(citationRegex);

console.log("Testing citation regex:");
console.log("Input:", testInput);
console.log("\nMatches:");
for (const match of matches) {
  console.log("Full match:", match[0]);
  console.log("Text:", match[1]);
  console.log("URL:", match[2]);
}

// Try the replacement
const result = testInput.replace(citationRegex, (match, linkText, url) => {
  console.log("\nReplacement called:");
  console.log("Match:", match);
  console.log("Link text:", linkText);
  console.log("URL:", url);
  return `<REPLACED>`;
});

console.log("\nResult after replace:", result);
