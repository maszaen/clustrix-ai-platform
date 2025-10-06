// Debug empty line logic - check both empty lines
const testLines = [
  "- **Item Pertama**",
  "  ```python",
  "  def hello():",
  "      print('Hello World')",
  "  ```",
  "",  // Line 5
  "  > **Blockquote dalam list:**",
  "  > \"Quote here\"",
  "",  // Line 8
  "  | Col1 | Col2 |",
  "  |------|------|",
  "  | A    | B    |"
];

console.log('Testing empty line logic for both empty lines:');

// Test empty line at position 5
console.log('\\n=== Empty line at position 5 ===');
let listStack = [{ type: 'ul', indent: 0 }];
let i = 5;

const line = testLines[i];
console.log(`Processing line ${i}: "${line}"`);

const nextLine = testLines[i + 1] ? testLines[i + 1] : "";
const nextLineTrimmed = nextLine.trim();
const nextLineIndent = nextLine.length - nextLine.trimStart().length;
const nextNextLine = testLines[i + 2] ? testLines[i + 2].trim() : "";
const upcomingTableSeparator = nextNextLine && nextNextLine.includes("|") && nextNextLine.includes("-") && !/[^|:-\s]/.test(nextNextLine);
const isUpcomingTableHeader = nextLineTrimmed && nextLineTrimmed.includes("|") && upcomingTableSeparator;

console.log('nextLine:', `"${nextLine}"`);
console.log('nextLineTrimmed:', `"${nextLineTrimmed}"`);
console.log('isUpcomingTableHeader:', isUpcomingTableHeader);

if (listStack.length > 0) {
  let shouldContinueList = false;
  if (nextLineTrimmed.startsWith("__CODEBLOCK_") || nextLineTrimmed.startsWith(">") || isUpcomingTableHeader) {
    console.log('Detected nested content, shouldContinueList = true');
    shouldContinueList = true;
  }
  console.log('shouldContinueList:', shouldContinueList);
}

// Test empty line at position 8
console.log('\\n=== Empty line at position 8 ===');
i = 8;

const line2 = testLines[i];
console.log(`Processing line ${i}: "${line2}"`);

const nextLine2 = testLines[i + 1] ? testLines[i + 1] : "";
const nextLineTrimmed2 = nextLine2.trim();
const nextLineIndent2 = nextLine2.length - nextLine2.trimStart().length;
const nextNextLine2 = testLines[i + 2] ? testLines[i + 2].trim() : "";
const upcomingTableSeparator2 = nextNextLine2 && nextNextLine2.includes("|") && nextNextLine2.includes("-") && !/[^|:-\s]/.test(nextNextLine2);
const isUpcomingTableHeader2 = nextLineTrimmed2 && nextLineTrimmed2.includes("|") && upcomingTableSeparator2;

console.log('nextLine:', `"${nextLine2}"`);
console.log('nextLineTrimmed:', `"${nextLineTrimmed2}"`);
console.log('nextNextLine:', `"${nextNextLine2}"`);
console.log('upcomingTableSeparator:', upcomingTableSeparator2);
console.log('isUpcomingTableHeader:', isUpcomingTableHeader2);

if (listStack.length > 0) {
  let shouldContinueList = false;
  if (nextLineTrimmed2.startsWith("__CODEBLOCK_") || nextLineTrimmed2.startsWith(">") || isUpcomingTableHeader2) {
    console.log('Detected nested content, shouldContinueList = true');
    shouldContinueList = true;
  }
  console.log('shouldContinueList:', shouldContinueList);
}