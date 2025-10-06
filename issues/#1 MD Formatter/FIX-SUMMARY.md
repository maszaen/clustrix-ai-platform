# Fix Summary - md.js Markdown Formatter Issues

## Date: October 6, 2025

## Issues Fixed

### Issue #1: Codeblock Indentation in Lists
**Problem:** Codeblocks inside list items were appearing outside the list structure instead of being properly nested.

**Root Cause:** The codeblock placeholder included newlines (`\n__CODEBLOCK_X__\n`), which caused the placeholder to appear on a separate line without the blockquote marker (`>`), breaking the blockquote continuation logic.

**Fix:** Removed the newlines from the codeblock placeholder.
- Changed: `const placeholder = \`\n__CODEBLOCK_\${codeBlocks.length}__\n\`;`
- To: `const placeholder = \`__CODEBLOCK_\${codeBlocks.length}__\`;`

**File:** `local_modules/custom-formatter/md.js` (line ~26)

---

### Issue #2: Trailing '>' Markers in Codeblocks Inside Blockquotes
**Problem:** When codeblocks appeared inside blockquotes, the code content had trailing `>` characters and lost proper indentation.

**Root Cause:** The cleaning logic for removing blockquote markers from codeblock content was incomplete. It would check if a line started with `>` and try to remove it, but wouldn't handle all cases properly, leaving trailing `>` markers.

**Fix:** Rewrote the cleaning logic to use a loop that repeatedly removes all leading `>` markers from each line until none remain.

**Code Changes:**
```javascript
// Old logic (incomplete)
const cleanedLines = lines.map(line => {
  const trimmed = line.trimStart();
  if (trimmed.startsWith('>') && trimmed.length > 1) {
    const afterMarker = trimmed.substring(1).trimStart();
    if (afterMarker && !afterMarker.startsWith('>')) {
      return afterMarker;
    }
  }
  return line;
});

// New logic (complete)
const cleanedLines = lines.map(line => {
  let cleaned = line;
  while (true) {
    const beforeClean = cleaned;
    cleaned = cleaned.replace(/^\s*>\s?/, '');
    if (cleaned === beforeClean) break;
  }
  return cleaned;
});
```

**File:** `local_modules/custom-formatter/md.js` (lines ~23-36)

---

### Issue #3: Nested Blockquotes Separated Instead of Nested
**Problem:** Nested blockquotes (e.g., `> > Level 2`) were being rendered as separate blockquotes at the same level instead of properly nested inside a parent blockquote.

**Root Cause:** The blockquote collection logic stopped when encountering empty lines, even if those empty lines had `>` markers (which should continue the blockquote). This caused deeply nested blockquotes to be split into multiple separate top-level blockquotes.

**Fix:** Updated the blockquote line collection logic to:
1. Continue collecting lines that have `>` markers even if they're otherwise empty
2. Only stop when encountering a truly empty line (no `>` marker) or a new block-level element

**Code Changes:**
```javascript
// Old logic
while (i + 1 < lines.length && lines[i + 1].trim() !== "") {
  const nextLine = lines[i + 1];
  const nextTrimmed = nextLine.trim();
  const isNewBlock = /^(#|---|```|[*-] |\d+\.\s)/.test(nextTrimmed) && 
                     (nextLine.length - nextTrimmed.length === 0);
  if (isNewBlock) break;
  i++;
  bqBlockLines.push(nextLine);
}

// New logic
while (i + 1 < lines.length) {
  const nextLine = lines[i + 1];
  const nextTrimmed = nextLine.trim();
  
  // Stop if we hit a truly empty line (no > marker)
  if (nextTrimmed === "" && !nextLine.match(/^\s*>/)) break;
  
  // Stop if we hit a non-blockquote block-level element at root level
  const isNewBlock = /^(#|---|```|[*-] |\d+\.\s)/.test(nextTrimmed) && 
                     (nextLine.length - nextTrimmed.length === 0);
  if (isNewBlock) break;
  
  // Stop if line doesn't start with > and isn't empty
  if (!nextLine.match(/^\s*>/) && nextTrimmed !== "") break;
  
  i++;
  bqBlockLines.push(nextLine);
}
```

**File:** `local_modules/custom-formatter/md.js` (lines ~218-235)

---

## Additional Improvements

### Added `esc()` Function
Added a proper HTML escape function at the beginning of the file to handle special characters in code content.

```javascript
function esc(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
```

### Added Module Exports
Added Node.js module exports for testing purposes:

```javascript
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { md, mdThinking, enhancedMarkdownParse, parseInlineMarkdown };
}
```

---

## Test Results

### Actual Response Tests
All three actual responses from `issues/actual-response.md` now render correctly:
- ✅ Response AI 1: Codeblocks properly nested in lists
- ✅ Response AI 2: No trailing `>` markers in codeblocks, indentation preserved
- ✅ Response AI 3: Nested blockquotes properly structured (1 top-level with 3 nested)

### Edge Case Tests
Created comprehensive edge case tests covering:
- Basic markdown elements (headings, bold, italic, links, etc.)
- Lists with and without nesting
- Codeblocks in various contexts
- Blockquotes (simple, nested, with code)
- Tables
- Mixed structures

**Result:** 12/12 tests passed ✅

### Files Created
1. `test-md-fixes.js` - Main test script for the three actual responses
2. `test-edge-cases.js` - Comprehensive edge case test suite
3. `test-simple-blockquote.js` - Simplified blockquote nesting test
4. `test-debug-bq.js` - Debug script for blockquote collection

### Test Output Files
- `test-output-response-1.html`
- `test-output-response-2.html`
- `test-output-response-3.html`
- `test-simple-blockquote.html`

---

## Verification Commands

```bash
# Run all tests
node test-md-fixes.js
node test-edge-cases.js

# Check specific metrics
# Response 1: Codeblock in list
Get-Content test-output-response-1.html | Select-String -Pattern '<li>.*code-block-container'

# Response 2: No stray > markers
Get-Content test-output-response-2.html | Select-String -Pattern '&gt;\s*</code>'

# Response 3: Blockquote nesting
Get-Content test-output-response-3.html -Raw | Select-String -Pattern '<blockquote>' -AllMatches
```

---

## Impact Assessment

### Functionality Preserved
- ✅ All existing markdown features work correctly
- ✅ List handling (ordered and unordered)
- ✅ Heading rendering
- ✅ Table parsing
- ✅ Inline formatting (bold, italic, code)
- ✅ Links and images
- ✅ Code syntax highlighting integration

### No Breaking Changes
- All 12 edge case tests pass
- No regression in existing functionality
- Code artifact buttons still work
- Thinking-text mode still works

---

## Conclusion

All three reported issues have been successfully fixed:
1. ✅ Codeblocks now properly nest within list items
2. ✅ No more trailing `>` markers in codeblocks inside blockquotes
3. ✅ Nested blockquotes maintain proper parent-child structure

The fixes are minimal, targeted, and don't break any existing functionality. All tests pass successfully.
