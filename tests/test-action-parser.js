/**
 * Test script for Action Parser Regex
 * Tests the regex pattern used in reasoning-action-agent.js line 1139
 */

// The new regex pattern we're testing
const actionPattern = /(\d+)\.\s*ACTION:\s*[`*]?([A-Za-z0-9_]+(?:\(\))?)[`*]?\s*with\s*/gi;

// Test cases
const testCases = [
  {
    name: "Function with parentheses",
    input: "1. ACTION: listAvailableFiles() with {}",
    expectedMatch: true,
    expectedAction: "listAvailableFiles",
    expectedNumber: "1"
  },
  {
    name: "Function without parentheses",
    input: "2. ACTION: listAvailableFiles with {}",
    expectedMatch: true,
    expectedAction: "listAvailableFiles",
    expectedNumber: "2"
  },
  {
    name: "Function with backticks and parentheses",
    input: "3. ACTION: `searchPattern()` with {\"pattern\": \"test\"}",
    expectedMatch: true,
    expectedAction: "searchPattern",
    expectedNumber: "3"
  },
  {
    name: "Function with asterisks",
    input: "4. ACTION: *searchFunctions* with {\"name\": \"test\"}",
    expectedMatch: true,
    expectedAction: "searchFunctions",
    expectedNumber: "4"
  },
  {
    name: "Multiple spaces",
    input: "5.   ACTION:   searchCSS   with   {\"selector\": \".test\"}",
    expectedMatch: true,
    expectedAction: "searchCSS",
    expectedNumber: "5"
  },
  {
    name: "Real AI response format (from log) - NOTE: regex only captures function NAME, not params",
    input: `PLAN:
1. ACTION: listAvailableFiles() with {}
   WHY: To understand the project structure
2. ACTION: searchFunctions with {"functionName": "personaSystem"}
   WHY: To locate the exact position
3. ACTION: searchPattern with {"pattern": "system.*prompt", "options": {"file": "renderer.js"}}
   WHY: To find the system prompt`,
    expectedMatch: true,
    expectedActions: ["listAvailableFiles", "searchFunctions", "searchPattern"],
    expectedNumbers: ["1", "2", "3"],
    multipleMatches: true
  },
  {
    name: "Snake_case function names",
    input: "6. ACTION: analyze_file_structure with {\"file\": \"test.js\"}",
    expectedMatch: true,
    expectedAction: "analyze_file_structure",
    expectedNumber: "6"
  },
  {
    name: "CamelCase with numbers",
    input: "7. ACTION: searchHTML5 with {\"element\": \"div\"}",
    expectedMatch: true,
    expectedAction: "searchHTML5",
    expectedNumber: "7"
  },
  {
    name: "Should NOT match - missing 'with'",
    input: "8. ACTION: listFiles {}",
    expectedMatch: false
  },
  {
    name: "Should NOT match - wrong format",
    input: "Do something with listAvailableFiles()",
    expectedMatch: false
  },
  {
    name: "Edge case: Double parentheses (invalid format - should NOT match)",
    input: "8. ACTION: testFunction()() with {}",
    expectedMatch: false,
    comment: "Double parentheses is invalid - function names should only have () once"
  },
  {
    name: "Edge case: Parentheses with params BEFORE 'with' (AI sometimes does this wrong)",
    input: `9. ACTION: searchFunctions("personaSystem") with {}`,
    expectedMatch: false,
    comment: "This format is WRONG - params should be in JSON after 'with', not in function call"
  },
  {
    name: "Tab characters instead of spaces",
    input: "10.\tACTION:\tsearchPattern\twith\t{\"pattern\": \"test\"}",
    expectedMatch: true,
    expectedAction: "searchPattern",
    expectedNumber: "10"
  }
];

// Helper function to normalize action name (remove parentheses)
function normalizeActionType(actionName) {
  return actionName.trim().replace(/\(\)$/, '');
}

// Run tests
console.log("🧪 Testing Action Parser Regex Pattern\n");
console.log("Pattern:", actionPattern.source);
console.log("Flags:", actionPattern.flags);
console.log("\n" + "=".repeat(80) + "\n");

let passed = 0;
let failed = 0;

testCases.forEach((test, index) => {
  console.log(`Test ${index + 1}: ${test.name}`);
  console.log(`Input: ${test.input.substring(0, 100)}${test.input.length > 100 ? '...' : ''}`);
  
  const regex = new RegExp(actionPattern.source, actionPattern.flags);
  const matches = Array.from(test.input.matchAll(regex));
  
  let testPassed = true;
  
  if (test.multipleMatches) {
    // Test for multiple matches
    if (matches.length === 0 && test.expectedMatch) {
      console.log(`❌ FAIL: Expected matches but got none`);
      testPassed = false;
    } else if (matches.length > 0) {
      console.log(`✓ Found ${matches.length} matches`);
      
      // Check each match
      matches.forEach((match, i) => {
        const number = match[1];
        const action = normalizeActionType(match[2]);
        
        console.log(`  Match ${i + 1}:`);
        console.log(`    Number: ${number}`);
        console.log(`    Action: ${action}`);
        
        if (test.expectedNumbers && test.expectedNumbers[i] !== number) {
          console.log(`    ❌ Expected number: ${test.expectedNumbers[i]}, got: ${number}`);
          testPassed = false;
        }
        
        if (test.expectedActions && test.expectedActions[i] !== action) {
          console.log(`    ❌ Expected action: ${test.expectedActions[i]}, got: ${action}`);
          testPassed = false;
        }
      });
    }
  } else {
    // Single match test
    if (test.expectedMatch && matches.length === 0) {
      console.log(`❌ FAIL: Expected to match but didn't`);
      testPassed = false;
    } else if (!test.expectedMatch && matches.length > 0) {
      console.log(`❌ FAIL: Should NOT match but did`);
      console.log(`   Matched: ${matches[0][0]}`);
      testPassed = false;
    } else if (test.expectedMatch && matches.length > 0) {
      const match = matches[0];
      const number = match[1];
      const action = normalizeActionType(match[2]);
      
      console.log(`✓ Matched: "${match[0]}"`);
      console.log(`  Capture group 1 (number): ${number}`);
      console.log(`  Capture group 2 (action): ${match[2]}`);
      console.log(`  Normalized action: ${action}`);
      
      if (test.expectedNumber && test.expectedNumber !== number) {
        console.log(`❌ Expected number: ${test.expectedNumber}, got: ${number}`);
        testPassed = false;
      }
      
      if (test.expectedAction && test.expectedAction !== action) {
        console.log(`❌ Expected action: ${test.expectedAction}, got: ${action}`);
        testPassed = false;
      }
    } else {
      console.log(`✓ Correctly did not match`);
    }
  }
  
  if (testPassed) {
    console.log(`✅ PASS\n`);
    passed++;
  } else {
    console.log(`❌ FAIL\n`);
    failed++;
  }
});

console.log("=".repeat(80));
console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed out of ${testCases.length} tests\n`);

if (failed === 0) {
  console.log("🎉 All tests passed! Regex is working correctly.\n");
  process.exit(0);
} else {
  console.log("⚠️  Some tests failed. Please review the regex pattern.\n");
  process.exit(1);
}
