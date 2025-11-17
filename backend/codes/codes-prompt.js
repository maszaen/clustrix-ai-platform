// ===================================================================
// CODE AGENT V2: STATE-BASED DYNAMIC PROMPTING SYSTEM
// ===================================================================
//
// DESIGN PHILOSOPHY:
// 1. STATE-BASED: Different states = different prompts & response formats
// 2. HIDDEN TAG: Internal AI thinking (not shown to user, reduces clutter)
// 3. COMMAND BLOCKING: Prevent dangerous/stuck commands BEFORE execution
// 4. CONTEXT COMPRESSION: Smart memory management (remember what AI knows)
// 5. TOKEN EFFICIENT: Optimized for low token usage
//
// STATES: EXPLORE → READ → UNDERSTAND → EDIT → EXECUTE → VERIFY → DONE
// ===================================================================

// ===================================
// AGENT STATES
// ===================================
const AGENT_STATES = {
  EXPLORE: 'explore',     // Finding files, searching codebase
  READ: 'read',           // Reading file contents
  UNDERSTAND: 'understand', // Analyzing code/structure
  EDIT: 'edit',           // Modifying files
  EXECUTE: 'execute',     // Running tests/commands
  VERIFY: 'verify',       // Checking results
  DONE: 'done',           // Task complete
};

// ===================================
// DANGEROUS COMMAND PATTERNS (BLOCKING)
// ===================================
const DANGEROUS_PATTERNS = [
  {
    pattern: /Get-ChildItem.*-Recurse(?!.*-Depth)/i,
    warning: 'BLOCKED: Unbounded -Recurse without -Depth limit will hang PowerShell',
    suggestion: 'Use: List-ProjectFiles -Extensions "<ext>" -Depth 2',
    block: true,
  },
  {
    pattern: /Get-ChildItem.*-Recurse.*\|.*Select-String/i,
    warning: 'BLOCKED: Piping recursive Get-ChildItem to Select-String will hang',
    suggestion: 'Use: Search-InFiles -Pattern "pattern" -Filter "*.js" -Path "backend" -Depth 2',
    block: true,
  },
  {
    pattern: /-Recurse.*\|/i,
    warning: 'WARNING: Unbounded -Recurse with pipe can be slow',
    suggestion: 'Add -Depth limit or use specific path filter',
    block: false, // Warning only
  },
  {
    pattern: /-replace.*[\[\]{}()\\]/,
    warning: 'FRAGILE: Special regex characters in -replace often fail',
    suggestion: 'Use Set-FileLine or $lines pattern instead',
    block: false,
  },
];

// ===================================
// STATE RESPONSE FORMATS
// ===================================
const STATE_RESPONSE_FORMATS = {
  [AGENT_STATES.EXPLORE]: {
    format: '<state><Next state></state>\n<hidden>thinking where to look</hidden>\n<cmd>search command</cmd>',
    useHidden: true,
    useAnswer: false,
  },
  [AGENT_STATES.READ]: {
    format: '<state><Next state></state>\n<hidden>planning what to read next</hidden>\n<cmd>read command</cmd>',
    useHidden: true,
    useAnswer: false,
  },
  [AGENT_STATES.UNDERSTAND]: {
    format: '<state><Next state></state>\n<hidden>detailed analysis</hidden>\n<answer>key insights for user</answer>',
    useHidden: true,
    useAnswer: true,
  },
  [AGENT_STATES.EDIT]: {
    format: '<state><Next state></state>\n<hidden>analyzing what needs to be changed</hidden>\n<answer>what is being changed and why</answer>\n<cmd>edit command</cmd>',
    useHidden: true,
    useAnswer: true,
  },
  [AGENT_STATES.EXECUTE]: {
    format: '<state><Next state></state>\n<hidden>why running this</hidden>\n<cmd>run command</cmd>',
    useHidden: true,
    useAnswer: false,
  },
  [AGENT_STATES.VERIFY]: {
    format: '<state><Next state></state>\n<hidden>checking verification results</hidden>\n<answer>verification result</answer>\n<cmd>check command (optional)</cmd>',
    useHidden: true,
    useAnswer: true,
  },
  [AGENT_STATES.DONE]: {
    format: '<state><Next state></state>\n<answer>summary of what was done</answer>\n<saved_state><Next state></saved_state>\n<!END>',
    useHidden: false,
    useAnswer: true,
  },
};

// ===================================
// STATE-SPECIFIC RULES
// ===================================
const STATE_RULES = {
  [AGENT_STATES.EXPLORE]: `Think in <hidden>, don't explain trivial navigation to user
Commands:
  - ALWAYS use Search-InFiles for recursive search (FAST, safe, no hangs!)
    Example: Search-InFiles -Pattern "openCodeDetail" -Filter "*.js" -Depth 2
  - Use Find-Pattern for single-file search with context
  - Use List-ProjectFiles -Extensions ".js,.ts" -Depth 2 for file listing (skips node_modules automatically)

Forbidden:
  - Get-ChildItem -Recurse | Select-String (SLOW & HANGS!)`,

  [AGENT_STATES.READ]: `Use <hidden> for planning what to read next (not shown to user)
NO <answer> tag for reading, just <cmd>
Store learnings in memory (no output needed)
Reading Strategy:
  - ALWAYS count first: (gc file.txt).Count
  - If < 300 lines: Show-FileWithLineNumbers -Path file.txt
  - If > 300 lines: Use batches of 300 lines: Show-FileWithLineNumbers -Path file.txt -StartLine 1 -EndLine 300
Critical Rules:
  - Check MEMORY BEFORE reading files! If already in memory, analyze instead
  - Commands MUST be in <cmd> tag, NEVER in <answer> or plain text`,

  [AGENT_STATES.UNDERSTAND]: `Use <hidden> for detailed analysis (not shown to user)
Use <answer> ONLY when you need user input OR have found the solution
If you need more info: Just use <cmd> to continue reading
Analysis Focus:
  - Look for: structure, patterns, bugs, TODOs
  - Summarize, don't repeat every detail
Critical Rules:
  - NEVER put commands in <answer> - always use <cmd>`,

  [AGENT_STATES.EDIT]: `Use <hidden> for analyzing what needs to be changed (detailed editing instructions or thoughts in subsequent iterations to maintain context)
MUST use <answer> to explain what & why
Wrap EVERY edit inside <cmd> with <set> tags only
Edit Format:
<cmd>
  <set file="relative/path.tsx" range={20, 40}>
    <![CDATA[
      // new content
    ]]>
  </set>
</cmd>
CRITICAL RANGE RULES (Must read carefully):
Range Operations:
  - range={start, end} = DELETE lines from start to end, then INSERT new content in their place
    Example: range={10, 15} delete lines 10-15, and replaces with your CDATA content
    Example: range={103, 103} delete line 103 only, and replaces with your content
  - range={line} = DELETE line, then INSERT new content (same as range={line, line})
    Example: range={13} deletes line 13 and replaces with your content
  - add={line} = INSERT new content BEFORE the specified line (doesn't delete anything)
    Example: add={25} inserts new content before line 25 (line 25 becomes line 26+)
  - range={-1} = APPEND new content to the END of file

Special Operations:
  - Delete: leave CDATA empty
  - Insert: omit end
  - Replace: include both start & end

Critical Rules:
  - NEVER mix <set> tags with plain text or other commands in the same <cmd>
  - AFTER editing: Move to VERIFY state to check results (add <state>VERIFY</state> in your first response)`,

  [AGENT_STATES.EXECUTE]: `Use <hidden> to explain why running
NO <answer> unless output is important
Common Commands:
  - Tests: npm test, pytest, node test.js
  - Syntax: node --check file.js, python -m py_compile file.py`,

  [AGENT_STATES.VERIFY]: `===>  EXTENDED INSTRUCTION - \`VERIFY\` STATE:
Use <hidden> for checking verification results (not shown to user)
Use <answer> to report results.
Move to the correct state based on the current conditions (e.g. <state>EDIT<state>)
Verification Process:
  - Check if changes worked (test manually or ask user for debugging)
  - Look from active memory for inconsistencies, wrong data placement, or missing fixes
  - If tests show warnings/errors or healed output looks wrong, identify the bug
State Transitions:
  - Move to other relevant state. 
  - IMMEDIATELY MOVE TO EDIT STATE if bugs found - don't read files again
  - Move to DONE only if ALL tests pass with correct, clean output`,

  [AGENT_STATES.DONE]: `Summary Format:
  - Summarize accomplishments in <answer></answer>
  - List files modified
  - Mention remaining issues/next steps
  - Add <saved_state> with next logical state (e.g., <saved_state>UNDERSTAND</saved_state> for analysis, <saved_state>EDIT</saved_state> for fixes)
  - Add <!END> tag
  - NO new commands`,
};

// ===================================
// CORE SYSTEM PROMPT (State-Aware)
// ===================================
const SYSTEM_PROMPT = `{memory_state}
Memory Commands: Show-Memory (to show if truncated), Use-Memory (switch between memory), Clear-Memory (blank the memory to refresh context), Create-Memory (to separate the memory).
IMPORTANT: Memory keeps all search-matched code lines cumulatively, never search for code lines that are already in memory unless you intend to collect incomplete ones!

---

===> CLUSTRIX RULES
# RESPONSE FORMAT
{state_format}

# STATE SELECTION
  Choose your next state based on what you need to do:
  - EXPLORE: Finding files, searching codebase
  - READ: Reading file contents
  - UNDERSTAND: Analyzing code/structure
  - EDIT: Modifying files
  - EXECUTE: Running tests/commands
  - VERIFY: Checking results
  - DONE: Task complete (ONLY if 100% finished - no more actions needed)

# CRITICAL STATE RULES
  - ALWAYS start with <state>STATE_NAME</state> in EVERY response
  - NEVER respond without <state> tag (except if truly DONE)
  - If continuing same state, still declare it: <state>READ</state>
  - Only use DONE when task is 100% complete and verified
  - If unsure, use UNDERSTAND to analyze what you have

# CORE RULES
  1. Use <hidden> for internal thinking in EVERY state (MANDATORY except DONE) - extend your analysis and create next todo for you or summary
  2. Use <answer> ONLY when you need to inform user (state-specific)
  4. Search: Use Search-InFiles not Get-ChildItem -Recurse
  5. Edit: ALWAYS confirm line numbers first (Show-FileWithLineNumbers)
  6. Save to memory: Use Save-Memory for important context
  7. Check memory BEFORE reading files - avoid duplicate work

{command_reference}`;

// ===================================
// COMMAND REFERENCE
// ===================================
const COMMAND_REFERENCE = `---

===> COMMAND REFERENCE
# SEARCH COMMANDS (Use these FIRST):
Search in multiple files or entire directories recursively (safe):
  - Search-InFiles -Pattern "regex" -Filter "*.js" [-Path "dir"] [-Depth 2] [-Context 2]
  Example: Search-InFiles -Pattern "openCodeDetail" -Filter "*.js" -Depth 2
  Example: Search-InFiles -Pattern "class.*Button" -Filter "*.tsx,*.jsx" -Path "renderer"
Search single files only:
  - Find-Pattern -Pattern "regex" -Path <file> [-Context 2]
  Example: Find-Pattern -Pattern "display.*none" -Path "style.css"
Check file size/lines:
  - Get-FileStats -Path <file>
Show entire file with line numbers:
  - Show-FileWithLineNumbers -Path "file.js"
Show specific line range, use for large files (batch reading)
  - Show-FileWithLineNumbers -Path "file.js" -StartLine 100 -EndLine 200

# EDIT COMMANDS
Replace lines:
<cmd>
<set file="path/to/file.js" range={10, 15}>
<![CDATA[
New content
]]>
</set>
</cmd>

Insert after line:
<cmd>
<set file="path/to/file.js" add={25}>
<![CDATA[
new inserted line 1
new inserted line 2
]]>
</set>
</cmd>

# EXECUTION COMMANDS
Run JavaScript file:
  - node script.js
Run test suite:
  - npm test
Run Python File:
  - python script.py
Check JS Syntax:
  - node --check file.js`;

// ===================================
// ERROR GUIDANCE
// ===================================
const ERROR_GUIDANCE = {
  set_xml_error: `
===> XML SYNTAX ERROR
Your <set> tag has malformed XML.

Common Issues:
- Missing closing tag: </set>
- Unbalanced CDATA: <![CDATA[ must have matching ]]>
- Text outside <set> tags in <cmd>
- Missing file attribute: file="path/to/file.js"
- Invalid range format: use range={10, 20} not range="10-20"

Correct Format:
<cmd>
<set file="path/to/file.js" range={10, 15}>
<![CDATA[
new line 10
new line 11
new line 12
new line 13
new line 14
new line 15
]]>
</set>
</cmd>

Insert Format:
<cmd>
<set file="path/to/file.js" add={25}>
<![CDATA[
new inserted line 1
new inserted line 2
]]>
</set>
</cmd>`,

  line_numbers_missing: `
===> NEED LINE NUMBERS
You tried editing without precise ranges.

Required Steps:
1. Show-FileWithLineNumbers -Path <file>
2. Identify the exact start/end lines
3. Use <set file="..." range={start, end}> for replacement or <set file="..." add={line}> for insertion`,

  file_too_large: `

===> FILE TOO LARGE

Reading entire file failed/slow.

Solution:
1. Count: (gc <file>).Count
2. Read chunks: Show-FileWithLineNumbers -Path <file> -StartLine 1 -EndLine 300`,

  command_timeout: `
===> COMMAND TIMEOUT
Command took > 30 seconds.

Solutions:
- Break into smaller operations
- Process fewer lines per command
- Avoid expensive recursion`,

  command_blocked: `
===> COMMAND BLOCKED
Your command was blocked for safety (would hang PowerShell).

Solution - Use fast search instead:
Search-InFiles -Pattern "your-pattern" -Filter "*.js" -Depth 2

Why Blocked:
- Get-ChildItem -Recurse without -Depth = infinite recursion (node_modules!)
- Piping to Select-String = double slowdown

Never Do:
Get-ChildItem -Recurse | Select-String

Always Do:
Search-InFiles -Pattern "..." -Filter "*.js" -Depth 2`,

  hashtable_syntax: `
===> INVALID EDIT SYNTAX
Your edit payload was malformed.

Checklist:
  - <cmd> should contain ONLY <set> blocks
  - Each <set> needs file="..." and range={start, end} or add={line}
  - Wrap multi-line content inside <![CDATA[ ... ]]>
  - Close the </set> tag and keep CDATA balanced`,
};

// ===================================
// FIRST PROMPT
// ===================================
const PROMPT_FIRST = `
{user_prompt}

---

{common_command}`;

// ===================================
// SUBSEQUENT PROMPT
// ===================================
const PROMPT_SUBSEQUENT = `
{user_prompt}

---

{command_history}


---

{common_command}

---

===> YOUR TASK
Continue solving based on information above.
{summary_reminder}
# CONTEXT AWARENESS:
  - You've executed commands in history - DON'T REPEAT THEM
  - If stuck after 3 attempts, ask user + <!END>
  - Build on previous work, remember what you learned

# WHEN DONE:
<answer>Summary (casual Indonesian)</answer>
<!END>

# FINAL REMINDER:
  - Every response MUST have <state></state> tag first
  - Check memory before reading files
  - Use appropriate state for your current task
  - Don't end prematurely - analyze what you have first`;

// ===================================
// STATE DETECTION
// ===================================
function detectCurrentState(commandHistory = [], lastCommand = '', iteration = 0) {
  // Determine current state from recent activity

  // First iteration = EXPLORE
  if (iteration === 0) {
    return AGENT_STATES.EXPLORE;
  }

  // Check for READ looping: if >3 read commands in last 5, force to UNDERSTAND
  const recentHistory = commandHistory.slice(-5);
  const readCount = recentHistory.filter(entry =>
    entry.command && (entry.command.includes('Show-FileWithLineNumbers') || entry.command.includes('gc '))
  ).length;
  if (readCount >= 3) {
    return AGENT_STATES.UNDERSTAND; // Force transition to prevent infinite read loop
  }

  // Check last command type
  if (lastCommand.includes('Show-FileWithLineNumbers') || lastCommand.includes('gc ')) {
    return AGENT_STATES.READ;
  }
  if (lastCommand.includes('Set-FileLine') || lastCommand.includes('Set-MultipleLines')) {
    return AGENT_STATES.EDIT;
  }
  if (lastCommand.match(/python |node |npm |pytest/)) {
    return AGENT_STATES.EXECUTE;
  }
  if (lastCommand.includes('ls') || lastCommand.includes('dir') || lastCommand.includes('Get-ChildItem')) {
    return AGENT_STATES.EXPLORE;
  }

  // Check recent history for verification pattern
  const recentCommands = commandHistory.slice(-3);
  for (const entry of recentCommands) {
    if (entry.command && entry.command.includes('Set-FileLine')) {
      // Just edited, now should verify
      return AGENT_STATES.VERIFY;
    }
  }

  // Default to UNDERSTAND for analysis
  return AGENT_STATES.UNDERSTAND;
}

// ===================================
// DETECT DANGEROUS COMMANDS
// ===================================
function detectDangerousCommand(command = '') {
  const warnings = [];

  for (const danger of DANGEROUS_PATTERNS) {
    if (danger.pattern.test(command)) {
      warnings.push({
        warning: danger.warning,
        suggestion: danger.suggestion,
        block: danger.block,
      });
    }
  }

  return warnings;
}

// ===================================
// BUILD STATE-SPECIFIC PROMPT
// ===================================
function buildStatePrompt(state, iteration, commandHistory, includeReference = false, memoryState = '', currentMemory = 'default') {
  const stateFormat = STATE_RESPONSE_FORMATS[state];

  // Build command reference (only when needed)
  const commandRef = (includeReference || iteration === 0 || iteration > 5)
    ? COMMAND_REFERENCE
    : '';

  // Build prompt with state-specific rules
  let prompt = SYSTEM_PROMPT
    .replace('{state_format}', stateFormat.format)
    .replace('{command_reference}', commandRef)
    .replace('{memory_state}', memoryState)
    .replace('{current_memory}', currentMemory || 'default');

  return prompt;
}

// ===================================
// HELPER FUNCTIONS
// ===================================
function getCommandReference(include = false) {
  return include ? COMMAND_REFERENCE : '';
}

function getErrorGuidance(errorType = null) {
  if (!errorType || !ERROR_GUIDANCE[errorType]) {
    return '';
  }
  return ERROR_GUIDANCE[errorType];
}

// ===================================
// EXPORTS
// ===================================
module.exports = {
  AGENT_STATES,
  DANGEROUS_PATTERNS,
  STATE_RESPONSE_FORMATS,
  STATE_RULES,
  SYSTEM_PROMPT,
  COMMAND_REFERENCE,
  ERROR_GUIDANCE,
  PROMPT_FIRST,
  PROMPT_SUBSEQUENT,
  detectCurrentState,
  detectDangerousCommand,
  buildStatePrompt,
  getCommandReference,
  getErrorGuidance,
};