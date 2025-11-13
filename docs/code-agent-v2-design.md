# Code Agent V2: State-Based Dynamic Prompting System

## Problem Analysis (from response-copy.md)

### Issues Identified:
1. **AI forgets context** (lines 115-272) - AI restarts from scratch, doesn't remember previous conversation
2. **Answer tag clutter** - Too many `<answer>` tags for trivial operations (reading files, listing directories)
3. **Stuck commands** (lines 658-662) - Recursive search without limits hangs PowerShell:
   ```powershell
   Get-ChildItem -Recurse -Filter "*.js" | Select-String "pattern"
   # STUCK! No output, terminal hangs indefinitely
   ```
4. **Token waste** - Verbose prompts sent every iteration regardless of operation type
5. **No operation-specific guidance** - Same rules for READ, EDIT, SEARCH, EXECUTE

---

## V2 Design Philosophy

### **1. STATE-BASED PROMPTING**

Different operations = Different states = Different prompts + Different response formats

```
WORKFLOW:
EXPLORE → READ → UNDERSTAND → EDIT → VERIFY → DONE
```

Each state has:
- Specific rules relevant ONLY to that operation
- Expected response format (when to use `<answer>`, `<hidden>`, etc.)
- Safety constraints

### **2. RESPONSE TAG SYSTEM**

| Tag | Purpose | When to Use |
|-----|---------|-------------|
| `<hidden>` | Internal AI thinking, NOT shown to user | EXPLORE, EXECUTE, UNDERSTAND states |
| `<answer>` | Important info for user | EDIT, VERIFY, DONE states |
| `<cmd>` | PowerShell command to execute | All states except DONE |
| `<summary>` | Summarize long output (> 10 lines) | Optional, when output is verbose |

**Example:**
```xml
<!-- EXPLORE state: search for files -->
<hidden>Need to find where user config is stored. Should check backend/data/ first.</hidden>
<cmd>ls backend/data/*.js</cmd>

<!-- READ state: read a file -->
<cmd>Show-FileWithLineNumbers -Path "backend/data/database-manager.js"</cmd>

<!-- EDIT state: modify file -->
<answer>Fixing line 45 to use proper error handling instead of throwing unhandled exception.</answer>
<cmd>Set-FileLine -Path "backend/data/database-manager.js" -LineNumber 45 -NewContent "  return { error: err.message };"</cmd>

<!-- DONE state: task complete -->
<answer>Successfully fixed error handling in database-manager.js (line 45). File now returns error object instead of throwing exception.</answer>
<!END>
```

---

## State Transitions & Rules

### **EXPLORE State**
**When:** AI needs to find files, search codebase structure

**Rules:**
- Use `ls/dir` with **specific filters**: `ls *.js`, `ls backend/codes/`
- **NEVER** use `-Recurse` without `-Depth` limit
- For file search: `Get-ChildItem -Filter "*.js" -Depth 2`
- For content search: `Select-String "pattern" -Path "specific-file.js"`
- Use `<hidden>` tag to think about where to look

**Response Format:**
```xml
<hidden>thinking about where to look</hidden>
<cmd>search command</cmd>
```

**Bad Example:**
```powershell
# DON'T DO THIS - will hang!
Get-ChildItem -Recurse -Filter "*.js" | Select-String "pattern"
```

**Good Example:**
```powershell
# DO THIS - bounded search
Get-ChildItem -Filter "*.js" -Path "backend/codes/" -Depth 2
```

---

### **READ State**
**When:** AI needs to read file contents

**Rules:**
- **ALWAYS** count first: `(gc file.txt).Count`
- If < 300 lines: `Show-FileWithLineNumbers -Path file.txt`
- If > 300 lines: `Show-FileWithLineNumbers -Path file.txt -StartLine 1 -EndLine 100`
- **NO** `<answer>` tag for reading - just execute command
- Store learnings in `<hidden>` tag for internal memory

**Response Format:**
```xml
<cmd>read command</cmd>
```

**Example:**
```powershell
# Step 1: Count lines
(gc "backend/codes/code-agent.js").Count

# Step 2: Read in chunks if large
Show-FileWithLineNumbers -Path "backend/codes/code-agent.js" -StartLine 1 -EndLine 100
```

---

### **UNDERSTAND State**
**When:** AI analyzing code structure, patterns, bugs

**Rules:**
- Use `<hidden>` for detailed analysis
- Use `<answer>` **only** for key insights user needs
- Look for: imports, exports, class definitions, TODOs
- Summarize structure, not every detail

**Response Format:**
```xml
<hidden>detailed analysis for AI memory</hidden>
<answer>key insights for user</answer>
```

**Example:**
```xml
<hidden>
File structure:
- 15 functions exported
- Uses LangChain for AI orchestration
- Main entry point: processCodeRequest()
- Error handling: try-catch in each function
- Potential issue: no timeout on line 245
</hidden>
<answer>
This file handles AI code generation. Main concern: missing timeout on API call (line 245) - could cause hangs if provider is slow.
</answer>
```

---

### **EDIT State**
**When:** AI modifying files

**Rules:**
- **MUST** use `<answer>` to explain what's being changed and why
- Use `Set-FileLine` for single line edits
- Use `Set-MultipleLines` for batch edits (efficient!)
- **NEVER** use `-replace` for complex patterns (use `$lines` approach)
- Verify line numbers from previous READ state

**Response Format:**
```xml
<answer>what is being changed and why</answer>
<cmd>edit command</cmd>
```

**Example:**
```xml
<answer>
Fixing error handling in processCodeRequest() at line 245. Currently throws unhandled exception on timeout, changing to return error object for better error recovery.
</answer>
<cmd>Set-FileLine -Path "backend/codes/code-agent.js" -LineNumber 245 -NewContent "    return { error: 'Request timeout', timedOut: true };"</cmd>
```

**Batch Edit Example:**
```xml
<answer>
Fixing 3 duplicate import statements (lines 10, 15, 20). Removing duplicates to clean up code.
</answer>
<cmd>Set-MultipleLines -Path "backend/codes/code-agent.js" -Replacements @{10='// Removed duplicate'; 15='// Removed duplicate'; 20='// Removed duplicate'}</cmd>
```

---

### **EXECUTE State**
**When:** Running tests, syntax checks, executing scripts

**Rules:**
- Use `<hidden>` to explain why running this command
- For tests: `npm test`, `pytest`, `node test.js`
- For syntax check: `node --check file.js`, `python -m py_compile file.py`
- **NO** `<answer>` tag unless output is important

**Response Format:**
```xml
<hidden>why running this</hidden>
<cmd>run command</cmd>
```

**Example:**
```xml
<hidden>Need to verify syntax is valid after edits to code-agent.js</hidden>
<cmd>node --check backend/codes/code-agent.js</cmd>
```

---

### **VERIFY State**
**When:** Checking if changes worked

**Rules:**
- Re-read edited sections if needed
- Run tests if applicable
- Use `<answer>` to report verification results
- Move to DONE state if verified successfully

**Response Format:**
```xml
<answer>result of verification</answer>
<cmd>check command</cmd>
```

---

### **DONE State**
**When:** Task complete

**Rules:**
- Summarize what was accomplished in `<answer>`
- List files modified
- Mention any remaining issues or next steps
- Add `<!END>` tag
- **NO** new commands

**Response Format:**
```xml
<answer>summary of what was done</answer>
<!END>
```

**Example:**
```xml
<answer>
Successfully fixed error handling in backend/codes/code-agent.js:
- Line 245: Changed from throw to return error object
- Syntax check passed
- File ready for testing

Next steps: Run integration tests to verify error handling works as expected.
</answer>
<!END>
```

---

## Dangerous Command Detection

### **Blocked Patterns (will prevent execution):**

1. **Unbounded Recursion**
   ```powershell
   # BLOCKED
   Get-ChildItem -Recurse  # No -Depth limit!

   # ALLOWED
   Get-ChildItem -Recurse -Depth 2
   ```

2. **Expensive Recursive Search**
   ```powershell
   # BLOCKED - will hang
   Get-ChildItem -Recurse | Select-String "pattern"

   # ALLOWED
   Get-ChildItem -Filter "*.js" -Depth 2 | Select-String "pattern"
   ```

### **Warned Patterns (allowed but warned):**

1. **Complex -replace Patterns**
   ```powershell
   # WARNED - likely to fail
   (gc file.txt) -replace "complex[]{} regex", "new"

   # RECOMMENDED
   Set-FileLine -Path file.txt -LineNumber 25 -NewContent "new line"
   ```

2. **AllMatches on Large Files**
   ```powershell
   # WARNED - can be slow
   gc large-file.txt | Select-String "pattern" -AllMatches

   # RECOMMENDED
   Search-FileWithContext -Path large-file.txt -Pattern "pattern"
   ```

---

## Context Memory Compression

### **Problem:**
Resending full conversation history = expensive tokens (92k → unbounded growth)

### **Solution:**
- Keep **last 6 messages** (3 exchanges) in full detail
- **Compress older messages** into single summary message
- Track "what AI knows" to avoid re-reading files

### **Example:**

**Before (expensive):**
```
Message 1: [system] Full prompt (6k tokens)
Message 2: [user] "Check autoheal.js"
Message 3: [assistant] Full response
Message 4: [user] "Now check renderer.js"
Message 5: [assistant] Full response
Message 6: [user] "What's the difference?"
Message 7: [system] Full prompt (6k tokens) <-- DUPLICATE!
Message 8: [assistant] Response
... continues growing
```

**After (efficient):**
```
Message 1: [system] "[CONTEXT SUMMARY] AI explored autoheal.js and renderer.js. Key findings stored."
Message 2-7: Last 3 exchanges in full (most relevant context)
Message 8: [system] Current prompt (dynamic, state-specific)
```

---

## Helper Functions (PowerShell)

All helpers create **automatic backups** and show **before/after** for verification:

### **File Reading:**
```powershell
Show-FileWithLineNumbers -Path "file.txt"
Show-FileWithLineNumbers -Path "file.txt" -StartLine 50 -EndLine 100
Get-FileLineRange -Path "file.txt" -Ranges @('1-100', '200-300')
```

### **File Editing:**
```powershell
# Single line
Set-FileLine -Path "file.txt" -LineNumber 25 -NewContent "new line"

# Multiple lines (batch)
Set-MultipleLines -Path "file.txt" -Replacements @{25='line1'; 30='line2'; 45='line3'}

# Add/Remove lines
Add-FileLine -Path "file.txt" -LineNumber 25 -NewContent "new line"
Remove-FileLine -Path "file.txt" -LineNumber 25
```

### **Searching:**
```powershell
# Search with context
Search-FileWithContext -Path "file.txt" -Pattern "TODO" -ContextBefore 2 -ContextAfter 3

# Find duplicates
Find-DuplicateLines -Path "file.txt"
```

---

## Token Efficiency Comparison

### **Scenario: Simple HTML Bug Fix**

**V1 (Old System):**
```
Iteration 1: 6k (system prompt) + 2k (user) = 8k
Iteration 2: 6k + 8k (history) = 14k
Iteration 3: 6k + 14k = 20k
...
Iteration 10: ~92k total
```

**V2 (New System):**
```
Iteration 1: 2k (state prompt: EXPLORE) + 2k (user) = 4k
Iteration 2: 1.5k (state prompt: READ) + 4k (compressed) = 5.5k
Iteration 3: 1.5k (state prompt: EDIT) + 5.5k = 7k
...
Iteration 10: ~12-15k total
```

**Savings: 6-7x reduction!**

---

## Migration Path

### **Current Files:**
- `codes-prompt.js` (V1 - keep for backward compatibility)
- `code-agent.js` (V1 - uses codes-prompt.js)
- `powershell-helpers.ps1` (V1)

### **New Files:**
- `codes-prompt-v2.js` (V2 - state-based system) ✅ **CREATED**
- `code-agent-v2.js` (V2 - uses new prompting) → **TODO**
- `powershell-helpers-v2.ps1` (V2 - improved safety) ✅ **CREATED**

### **Testing Plan:**
1. Test V2 with simple bug fixes
2. Compare token usage V1 vs V2
3. Verify dangerous command blocking works
4. Check context compression effectiveness
5. Switch to V2 when stable

---

## Next Steps

1. **Create `code-agent-v2.js`** - Integration layer using state-based prompting
2. **Add tests** - Verify state transitions and safety checks
3. **Test with real repos** - Clone Calculator, Vanilla Web Projects, Flask Todo
4. **Measure token usage** - Compare V1 vs V2 on same tasks
5. **Document migration** - Guide for switching from V1 to V2

---

## Expected Results

| Metric | V1 | V2 | Improvement |
|--------|----|----|-------------|
| **Tokens (simple bug)** | 92k | 12-15k | **6-7x faster** |
| **Response clarity** | Cluttered with `<answer>` | Clean, state-appropriate | **Better UX** |
| **Safety** | No blocking | Dangerous commands blocked | **Prevents hangs** |
| **Context memory** | Full duplication | Compressed old messages | **Sustainable** |
| **AI confusion** | Repeats exploration | Remembers what it knows | **More efficient** |

---

## Feedback Integration

Based on user feedback (response-copy.md analysis):

✅ **"Masih ga inget konteks"** → Fixed with context compression & state memory
✅ **"Answer tag berantakan"** → Fixed with state-based format rules
✅ **"Perlu dynamic prompting"** → Implemented state-specific prompts
✅ **"Perlu regex"** → Added smart search patterns & safety checks
✅ **"Tag baru <hidden>"** → Implemented for internal AI thinking
✅ **"Command stuck"** → Added dangerous command detection & blocking

---

**Status:** V2 Core Design Complete ✅
**Next:** Integration with code-agent-v2.js & Testing
