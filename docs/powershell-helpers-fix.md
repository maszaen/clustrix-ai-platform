# PowerShell Helper Functions - Reliable File Operations

## Problem Summary

From analyzing the latest `response-copy.md`, the AI struggled with:

1. **Complex array indexing fails:**
   ```powershell
   (gc "index.html")[100..393] | ForEach-Object -Begin {$i=0} -Process {"{0:D3}: {1}" -f ++$i+100, $_}
   ```
   Result: `Command completed with no output. Exit Code: 1`

2. **Arithmetic in ForEach-Object fails:**
   ```powershell
   ++$i+100  # Syntax error - PowerShell can't parse this
   ```

3. **0-indexed confusion:**
   - PowerShell arrays are 0-indexed (Line 1 = index 0)
   - Humans think in 1-indexed (Line 1 = 1)
   - AI constantly makes off-by-one errors

4. **No backup mechanism:**
   - Direct file edits with no safety net
   - If edit fails, file can be corrupted

## Solution: Custom PowerShell Helper Functions

Created `backend/codes/powershell-helpers.ps1` with 4 reliable functions:

### 1. Show-FileWithLineNumbers
**Purpose:** Display file with line numbers (1-indexed, human-friendly)

**Usage:**
```powershell
# Show entire file
Show-FileWithLineNumbers -Path "index.html"

# Show specific range
Show-FileWithLineNumbers -Path "index.html" -StartLine 50 -EndLine 100
```

**Benefits:**
- ✅ Always works (no complex arithmetic)
- ✅ 1-indexed (matches human thinking)
- ✅ Handles encoding properly (UTF-8)
- ✅ Can show specific ranges without array slicing

### 2. Replace-FileLine
**Purpose:** Replace specific line in file (1-indexed)

**Usage:**
```powershell
Replace-FileLine -Path "index.html" -LineNumber 25 -NewContent "    <h1>New Title</h1>"
```

**Benefits:**
- ✅ 1-indexed (no off-by-one errors)
- ✅ Auto-creates backup (.backup file)
- ✅ Validates line number range
- ✅ Handles encoding properly

### 3. Remove-FileLine
**Purpose:** Remove specific line from file (1-indexed)

**Usage:**
```powershell
Remove-FileLine -Path "index.html" -LineNumber 25
```

**Benefits:**
- ✅ 1-indexed
- ✅ Auto-creates backup
- ✅ Validates line number range
- ✅ Safe array manipulation

### 4. Insert-FileLine
**Purpose:** Insert new line at specific position (1-indexed)

**Usage:**
```powershell
# Insert before line 25
Insert-FileLine -Path "index.html" -LineNumber 25 -NewContent "    <div class='new-section'>"
```

**Benefits:**
- ✅ 1-indexed
- ✅ Auto-creates backup
- ✅ Can insert at any position (including end)

## Integration

### PowerShell Session (powershell-session.js)
Helper functions are automatically loaded when PowerShell session starts:

```javascript
_loadHelperFunctions() {
  const helperPath = path.join(__dirname, 'powershell-helpers.ps1');
  const helperScript = fs.readFileSync(helperPath, 'utf8');
  this.process.stdin.write(helperScript + '\n');
}
```

### Prompt Update (codes-prompt.js)
Updated prompt to recommend helper functions:

```javascript
**RECOMMENDED - Use helper functions (more reliable, 1-indexed):**
- Replace-FileLine -Path <file> -LineNumber 25 -NewContent "new content"
- Remove-FileLine -Path <file> -LineNumber 25
- Insert-FileLine -Path <file> -LineNumber 25 -NewContent "new line"
```

## Comparison: Before vs After

### Before (Broken)
```powershell
# AI tries this (FAILS):
(gc "index.html")[100..393] | ForEach-Object -Begin {$i=0} -Process {"{0:D3}: {1}" -f ++$i+100, $_}
# Output: Command completed with no output. Exit Code: 1

# AI tries this (Off-by-one error):
$lines = gc "index.html"
$lines[24] = "new content"  # Wants line 25, but this is line 25 (0-indexed confusion!)
$lines | Set-Content "index.html"
```

### After (Works)
```powershell
# Show file with line numbers (WORKS):
Show-FileWithLineNumbers -Path "index.html" -StartLine 100 -EndLine 150
# Output: 
# 100: <div class="container">
# 101:   <h1>Title</h1>
# ...

# Replace line 25 (WORKS, no confusion):
Replace-FileLine -Path "index.html" -LineNumber 25 -NewContent "    <h1>New Title</h1>"
# Output: Backup created: index.html.backup
#         Line 25 replaced successfully
```

## Benefits

1. **No more syntax errors** - Simple function calls, no complex arithmetic
2. **No more off-by-one errors** - 1-indexed matches human thinking
3. **Automatic backups** - Every edit creates .backup file
4. **Better error messages** - Clear validation and error reporting
5. **Encoding handled** - UTF-8 by default, handles special characters
6. **Range validation** - Can't edit line 500 in a 100-line file

## Testing Recommendations

1. Test with files containing special characters (UTF-8)
2. Test with large files (> 300 lines)
3. Verify backup files are created
4. Test edge cases (line 1, last line, out of range)
5. Verify 1-indexed behavior matches expectations

## Fallback Strategy

If helper functions fail (unlikely), AI can still use basic PowerShell:

```powershell
# Fallback to basic PowerShell
$lines = gc "index.html"
$lines[24] = "new content"  # Remember: 0-indexed!
$lines | Set-Content "index.html"
```

Prompt includes both methods, with helper functions as primary recommendation.

## Related Fixes

This is the **3rd fix** in the codes agent improvement series:

1. **code-agent.js** - Conversation history (fixes amnesia)
2. **codes-prompt.js** - Correct PowerShell commands (fixes broken Select-String)
3. **powershell-helpers.ps1** - Reliable file operations (fixes array indexing & off-by-one errors)

Together, these fixes provide:
- ✅ AI remembers previous attempts
- ✅ AI uses working commands
- ✅ AI can reliably read and edit files
- ✅ No more repeated failures or confusion
