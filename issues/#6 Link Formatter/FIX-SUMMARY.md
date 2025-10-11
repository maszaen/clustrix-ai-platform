# Issue #6 Link Formatter - Fix Summary

## Problems Identified

### Problem 1: Trailing Punctuation in Auto-Links
The auto-link detection regex was incorrectly including trailing punctuation like `)].` in the href attribute. When URLs appeared in text with surrounding punctuation like `(https://example.com)].`, the closing bracket and period were being included in the link.

### Problem 2: Citation Format Not Parsed
The format `[Source: Title (URL)]` was not being parsed correctly. This citation format should create a clickable link with "Source: Title" as the link text and the URL from inside the parentheses as the href.

### Example of the Issue:
**Input Markdown:**
```
[Source: ... (https://www.britannica.com/event/2025-Nepalese-Gen-Z-Protests)].
```

**Incorrect Output:**
```html
<a href="https://www.britannica.com/event/2025-Nepalese-Gen-Z-Protests)]." ...>
```

## Root Cause
The auto-link regex pattern `[^\s<>"]+` was matching all characters except whitespace and quotes, which included the trailing punctuation characters `)`, `]`, and `.`.

## Solutions Implemented

### Solution 1: Auto-Link Trailing Punctuation Fix
Updated the auto-link replacement function in both `md.js` and `md.worker.js`:
1. Added a cleanup loop that strips trailing punctuation characters: `)`, `]`, `.`, `,`, `;`, `:`, `!`, `?`
2. The stripped punctuation is preserved and appended after the closing `</a>` tag
3. The cleaned URL is used for the href attribute

### Solution 2: Citation Format Parser
Added a special citation format parser that runs BEFORE HTML escaping:
1. Regex pattern: `/\[([^\]]*?)\s*\((https?:\/\/[^)]+)\)\]/g` to match `[text (URL)]` format
2. Uses placeholder system (`LINKPLACEHOLDER0ENDLINK`) to protect parsed links from HTML escaping
   - Format chosen to avoid HTML-like characters (`<>`) that could be stripped by parser
   - No underscores to avoid markdown bold formatting interference
3. Placeholders are restored after all markdown formatting is complete
4. Works for both citation format `[Source: Title (URL)]` and standard markdown `[text](url)`

### Code Added:
```javascript
// Clean up trailing punctuation that's not part of the URL
let cleanMatch = match;
let trailingPunct = '';

// Remove trailing punctuation like )]., etc.
while (cleanMatch && /[)\].,;:!?]+$/.test(cleanMatch)) {
  const lastChar = cleanMatch[cleanMatch.length - 1];
  trailingPunct = lastChar + trailingPunct;
  cleanMatch = cleanMatch.slice(0, -1);
}

// Use cleaned match for href
if (protocolUrl) {
  href = cleanMatch;
} else if (domainUrl) {
  const domainMatch = cleanMatch.match(/([a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:\/[^\s<>"]*)?)/);
  href = domainMatch ? domainMatch[0] : cleanMatch;
}

return `<a class="link" href="${href}" ...>${cleanMatch}</a>${trailingPunct}`;
```

## Testing
Created `test_links.js` to verify the fix with multiple test cases:

1. ✓ URL with trailing `)]` - correctly stripped
2. ✓ URL with trailing `)` - correctly stripped  
3. ✓ Multiple URLs with various punctuation - all correctly handled

### Test Results:
All tests passed successfully. URLs are now properly formatted without trailing punctuation in the href attribute.

## Files Modified:
1. `local_modules/custom-formatter/md.js` - Updated auto-link regex replacement (2 occurrences)
2. `renderer/md.worker.js` - Updated auto-link regex replacement (2 occurrences)
3. `test_links.js` - Created test file

## Expected Behavior

### Citation Format Example
**Before Fix:**
```html
[Source: Title (https://example.com)].
↓
[Source: Title (<a href="https://example.com)]." ...>https://example.com)].</a>
```

**After Fix:**
```html
[Source: Title (https://example.com)].
↓
<a href="https://example.com" ...>Source: Title</a>.
```

### Auto-Link Example
**Before Fix:**
```html
Check (https://example.com).
↓
<a href="https://example.com).">https://example.com).</a>
```

**After Fix:**
```html
Check (https://example.com).
↓
(<a href="https://example.com">https://example.com</a>).
```

## Status
✅ **FIXED** - Both citation format and auto-link trailing punctuation issues resolved.

## Restart Required
The changes will take effect after restarting the Electron application, as the markdown formatter modules need to be reloaded.
