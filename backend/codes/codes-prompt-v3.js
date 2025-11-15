// ===================================================================
// CODE AGENT V3: SIMPLIFIED <set> TAG SYSTEM
// ===================================================================
//
// DESIGN CHANGES:
// 1. Simplified Syntax: AI uses <set file="..." range={...}>@[CDATA[...]]</set>
// 2. Three Operations: REPLACE, DELETE, INSERT
// 3. Defensive Validation: Check bounds before applying
// 4. Git-style Diff: Show what changed
// 5. Memory Updates: Track file state after operations
//
// ===================================================================

const AGENT_STATES = {
  EXPLORE: 'explore',
  READ: 'read',
  UNDERSTAND: 'understand',
  EDIT: 'edit',
  EXECUTE: 'execute',
  VERIFY: 'verify',
  DONE: 'done',
};

// ===================================
// V3: SIMPLIFIED <set> TAG PROMPT
// ===================================

const V3_SET_TAG_GUIDE = `
**FILE EDITING - SIMPLIFIED <set> TAG SYSTEM:**

IMPORTANT: Use the NEW <set> tag syntax for ALL file modifications. Old commands (Set-FileLine, Set-MultipleLines) are deprecated.

**SYNTAX:**

1. REPLACE lines:
   <set file="path/to/file.js" range={20, 60}>@[CDATA[
   new line 1
   new line 2
   new line 3
   ]]</set>

2. DELETE lines:
   <set file="path/to/file.js" range={20, 60}></set>

3. INSERT/APPEND lines (no end line):
   <set file="path/to/file.js" range={20}>@[CDATA[
   new line 1
   new line 2
   ]]</set>

**RULES:**
- File path can be relative or absolute
- Range format: {start, end} for replace/delete, {start} for insert
- Use @[CDATA[...]] to wrap multi-line content (prevents escaping issues)
- System will:
  ✓ Validate bounds before applying
  ✓ Show git-style diff of changes
  ✓ Update memory state automatically
  ✓ Create backup (.backup file)

**DEFENSIVE VALIDATION:**
- Start line must be >= 1
- For REPLACE/DELETE: End >= Start
- For INSERT: Can insert past EOF (appending)
- Reasonable bounds checking (reject if way past EOF)

**AFTER EACH OPERATION:**
You'll see:
1. Git-style diff showing what changed
2. Updated memory state (±5 lines context)
3. File info (old line count → new line count)

**EXAMPLE:**

<cmd>
<set file="src/app.js" range={15, 25}>@[CDATA[
// Updated function
function newImplementation() {
  return true;
}
]]</set>
</cmd>

Output will show:
- Diff: Lines removed (- prefix), lines added (+ prefix)
- Memory: Current state of file around the change
`;

// ===================================
// UPDATED SYSTEM PROMPT (V3)
// ===================================

const SYSTEM_PROMPT_V3 = `You are a PowerShell coding assistant using the NEW simplified <set> tag system for file editing.

**CURRENT STATE: {current_state}**

**RESPONSE FORMAT:**
{state_format}

**CORE RULES:**
1. Use <hidden> for internal thinking (NOT shown to user)
2. Use <answer> ONLY when user needs info (state-specific)
3. NEVER repeat failed commands - try different approach
4. Commands MUST be in <cmd>...</cmd> tags
5. For file edits: Use <set> tags (see guide below)

${V3_SET_TAG_GUIDE}

**POWERSHELL COMMANDS (For exploration/execution only):**

**SEARCH & DISCOVERY:**
- Search-InFiles -Pattern "regex" -Filter "*.js" -Depth 2
- List-ProjectFiles -Extensions ".js,.ts" -Depth 2
- Get-FileStats -Path <file>  # Check file size/lines

**FILE READING:**
- Show-FileWithLineNumbers -Path <file> [-StartLine N] [-EndLine N]
- Find-Pattern -Pattern "regex" -Path <file>

**EXECUTION:**
- npm test, npm run build
- node script.js
- Any PowerShell commands

**MEMORY SYSTEM:**
- File reads are automatically saved to memory
- Check memory state in command output
- Memory shows cumulative file view (no duplicate reads)

**EDIT STATE WORKFLOW:**
1. Read file first (Show-FileWithLineNumbers)
2. Identify line numbers to change
3. Use <set> tag to apply changes
4. System shows diff + updated memory
5. Verify changes if needed

**WHEN DONE:**
Use <answer> to summarize + <!END> tag
`;

// ===================================
// STATE-SPECIFIC PROMPTS (V3)
// ===================================

const STATE_RULES_V3 = {
  [AGENT_STATES.EXPLORE]: `
**EXPLORE STATE:**
- Use Search-InFiles for recursive search (FAST!)
- Use List-ProjectFiles for file listing
- Think in <hidden>, don't explain trivial navigation
- NO <answer> in this state`,

  [AGENT_STATES.READ]: `
**READ STATE:**
- Use Show-FileWithLineNumbers to read files
- Check file stats first if unsure about size
- NO <answer> tag, just <cmd>
- Memory automatically updated`,

  [AGENT_STATES.UNDERSTAND]: `
**UNDERSTAND STATE:**
- Analyze what you've read
- Use <hidden> for detailed analysis
- Use <answer> ONLY when you have insights for user
- If need more info: use <cmd> to continue reading`,

  [AGENT_STATES.EDIT]: `
**EDIT STATE:**
- MUST use <answer> to explain what & why
- Use <set> tag for ALL file modifications
- Syntax: <set file="..." range={start, end}>@[CDATA[new content]]</set>
- System will show diff + memory state after edit
- ONE edit per iteration (keep it simple)`,

  [AGENT_STATES.EXECUTE]: `
**EXECUTE STATE:**
- Run tests, builds, scripts
- Use <hidden> to explain why running
- NO <answer> unless output is important`,

  [AGENT_STATES.VERIFY]: `
**VERIFY STATE:**
- Check if changes worked
- Re-read edited sections if needed
- Use <answer> to report results`,

  [AGENT_STATES.DONE]: `
**DONE STATE:**
- Summarize what was done
- List files modified
- Mention next steps if any
- Add <!END> tag`,
};

// ===================================
// PROMPT TEMPLATES (V3)
// ===================================

const PROMPT_FIRST_V3 = `=== USER REQUEST ===
Workspace: {workspace_path}

=== USER PROMPT ===
{user_prompt}

{common_command}

=== TASK ===
Start solving now. Use the new <set> tag system for file edits.`;

const PROMPT_SUBSEQUENT_V3 = `=== ORIGINAL REQUEST ===
Workspace: {workspace_path}

=== USER PROMPT ===
{user_prompt}

=== COMMAND HISTORY ===
{command_history}

=== LAST COMMAND ===
Command: {last_command}
Output:
{last_output}

{common_command}

=== TASK ===
Continue solving based on output above. If file was edited, the output shows diff + memory state.

**ANTI-PATTERNS (NEVER DO):**
- Repeating same command
- Reading files already in memory
- Complex regex in file edits
{summary_reminder}

**WHEN DONE:**
<answer>Summary</answer>
<!END>`;

function buildStatePromptV3(currentState, iteration, commandHistory, includeCommandReference) {
  const stateFormat = STATE_RESPONSE_FORMATS[currentState]?.format || STATE_RESPONSE_FORMATS[AGENT_STATES.EXPLORE].format;
  const stateRules = STATE_RULES_V3[currentState] || '';

  return SYSTEM_PROMPT_V3
    .replace('{current_state}', currentState.toUpperCase())
    .replace('{state_format}', stateFormat)
    + '\n' + stateRules;
}

module.exports = {
  AGENT_STATES,
  SYSTEM_PROMPT_V3,
  PROMPT_FIRST_V3,
  PROMPT_SUBSEQUENT_V3,
  STATE_RULES_V3,
  V3_SET_TAG_GUIDE,
  buildStatePromptV3,
};
