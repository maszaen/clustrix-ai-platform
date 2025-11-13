# Codes Prompt Fix - Select-String Line Number Bug

## Problem Summary

From analyzing `response-copy.md`, the AI repeatedly tried to use:
```powershell
gc index.html | Select-String "Stay once" | Select-Object LineNumber, Line
```

This command was executed **15+ times** and ALWAYS returned:
```
Command completed with no output.
```

The AI was stuck in a loop trying the same broken command because the prompt told it to use this pattern.

## Root Cause

**The prompt contained WRONG PowerShell syntax** that doesn't work:

```javascript
// WRONG - This is in the prompt but DOESN'T WORK in PowerShell!
- gc <file> | Select-String "pattern" | Select-Object LineNumber, Line
```

**Why it fails:**
- `Select-String` output cannot be piped to `Select-Object LineNumber, Line`
- PowerShell doesn't support this pattern
- The command always returns empty/no output

## Evidence from response-copy.md

**AI Response 1 (first user prompt):**
- Iteration 1: `Select-String "error|Error|ERROR" | Select-Object LineNumber, Line` → No output
- Iteration 2: `Select-String "<[^/>]+>" | Select-Object LineNumber, Line` → No output
- Iteration 3-15: Keeps trying variations of Select-String → All fail

**AI Response 2 (user says "different approach"):**
- Finally uses: `gc index.html | ForEach-Object -Begin {$i=0} -Process {"{0:D3}: {1}" -f ++$i, $_}`
- **THIS WORKS!** Shows file with line numbers
- AI can finally see line numbers and edit correctly

## Solution

### 1. Removed broken Select-String pattern
```diff
- **CRITICAL**: ALWAYS use line numbers when searching before editing!
- - gc <file> | Select-String "pattern" | Select-Object LineNumber, Line   # With line numbers (ALWAYS USE THIS)
+ **BEST METHOD - Show file with line numbers:**
+ - gc <file> | ForEach-Object -Begin {$i=0} -Process {"{0:D3}: {1}" -f ++$i, $_}  # ALWAYS USE THIS for line numbers!
```

### 2. Added explicit warning
```javascript
**IMPORTANT**: Select-String does NOT support "| Select-Object LineNumber, Line" - that command will ALWAYS return empty!
```

### 3. Updated workflow rules
```diff
**BEFORE EDITING ANY FILE**:
- 1. MUST find exact line numbers first using: gc <file> | Select-String "pattern" | Select-Object LineNumber, Line
+ 1. MUST show file with line numbers first using: gc <file> | ForEach-Object -Begin {$i=0} -Process {"{0:D3}: {1}" -f ++$i, $_}
```

### 4. Added critical workflow steps
```javascript
**CRITICAL WORKFLOW FOR FILE EDITING**:
Step 1: Count lines → (gc file.txt).Count
Step 2: Show with line numbers → gc file.txt | ForEach-Object -Begin {$i=0} -Process {"{0:D3}: {1}" -f ++$i, $_}
Step 3: Identify exact line numbers to edit
Step 4: Edit using $lines pattern → $lines = gc file.txt; $lines[13] = 'new content'; $lines | Set-Content file.txt
```

### 5. Updated anti-patterns
```diff
**Anti-patterns to AVOID**:
- Repeating same search command multiple times
+ - Using "Select-String | Select-Object LineNumber, Line" (THIS NEVER WORKS!)
- Searching without line numbers before editing
```

## Expected Behavior After Fix

**Before:**
```
AI: gc index.html | Select-String "Stay" | Select-Object LineNumber, Line
Output: Command completed with no output.

AI: gc index.html | Select-String "Stay once" | Select-Object LineNumber, Line
Output: Command completed with no output.

AI: gc index.html | Select-String "Stay" -Context 2,2 | Select-Object LineNumber, Line
Output: Command completed with no output.

... repeats 15+ times ...
```

**After:**
```
AI: gc index.html | ForEach-Object -Begin {$i=0} -Process {"{0:D3}: {1}" -f ++$i, $_}
Output: 
001: <!DOCTYPE html>
002: <html lang="en">
003:   <head>
...
060:             <h1>Stay once,</h1>
061:             <h1>carry memories</h1>
...

AI: Now I can see line 60-61 need to be edited!
AI: $lines = gc index.html; $lines[59] = 'new content'; $lines | Set-Content index.html
Output: Command completed with no output.

AI: Success! File edited.
```

## Benefits

1. **No more broken commands** - AI uses working PowerShell syntax
2. **Faster file editing** - AI sees line numbers immediately
3. **No repeated failures** - AI doesn't waste iterations on broken commands
4. **Better accuracy** - AI can see exact line numbers before editing

## Related Fixes

This fix works together with the conversation history fix in `code-agent.js`:
- **code-agent.js**: Gives AI memory of previous attempts
- **codes-prompt.js**: Gives AI correct commands to use

Together, these fixes ensure:
- AI remembers what it tried (conversation history)
- AI uses commands that actually work (correct prompt)
- AI doesn't repeat failed attempts (both fixes combined)

## Testing Recommendations

1. Test with HTML file editing (like in response-copy.md)
2. Verify AI uses ForEach-Object pattern for line numbers
3. Confirm AI doesn't try Select-String | Select-Object pattern
4. Check AI can edit files accurately on first or second attempt
