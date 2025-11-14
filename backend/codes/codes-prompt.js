// ===================================================================
// CODE AGENT V2: STATE-BASED DYNAMIC PROMPTING SYSTEM
// ===================================================================
//
// DESIGN PHILOSOPHY:
// 1. STATE-BASED: Different states = different prompts & response formats
// 2. HIDDEN TAG: Internal AI thinking (not shown to user, reduces clutter)
// 3. COMMAND BLOCKING: Prevent dangerous/stuck commands BEFORE execution
// 4. CONTEXT COMPRESSION: Smart memory management (remember what AI knows)
// 5. TOKEN EFFICIENT: 6-7x reduction (92k → 12-15k tokens)
//
// STATES: EXPLORE → READ → UNDERSTAND → EDIT → VERIFY → DONE
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
    suggestion: 'Add -Depth 2: Get-ChildItem -Filter "*.js" -Depth 2',
    block: true,
  },
  {
    pattern: /Get-ChildItem.*-Recurse.*\|.*Select-String/i,
    warning: 'BLOCKED: Piping recursive Get-ChildItem to Select-String will hang',
    suggestion: 'Use: Get-ChildItem -Filter "*.js" -Path "backend/" -Depth 2 | Select-String "pattern"',
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
    format: '<hidden>thinking where to look</hidden>\n<cmd>search command</cmd>',
    useHidden: true,
    useAnswer: false,
  },
  [AGENT_STATES.READ]: {
    format: '<cmd>read command</cmd>',
    useHidden: false,
    useAnswer: false,
  },
  [AGENT_STATES.UNDERSTAND]: {
    format: '<hidden>detailed analysis</hidden>\n<answer>key insights for user</answer>',
    useHidden: true,
    useAnswer: true,
  },
  [AGENT_STATES.EDIT]: {
    format: '<answer>what is being changed and why</answer>\n<cmd>edit command</cmd>',
    useHidden: false,
    useAnswer: true,
  },
  [AGENT_STATES.EXECUTE]: {
    format: '<hidden>why running this</hidden>\n<cmd>run command</cmd>',
    useHidden: true,
    useAnswer: false,
  },
  [AGENT_STATES.VERIFY]: {
    format: '<answer>verification result</answer>\n<cmd>check command (optional)</cmd>',
    useHidden: false,
    useAnswer: true,
  },
  [AGENT_STATES.DONE]: {
    format: '<answer>summary of what was done</answer>\n<!END>',
    useHidden: false,
    useAnswer: true,
  },
};

// ===================================
// STATE-SPECIFIC RULES
// ===================================
const STATE_RULES = {
  [AGENT_STATES.EXPLORE]: `

**EXPLORE STATE:**
- ALWAYS use Search-InFiles for recursive search (FAST, safe, no hangs!)
  Example: Search-InFiles -Pattern "openCodeDetail" -Filter "*.js" -Depth 2
- Use Find-Pattern for single-file search with context
- Use ls -Filter "*.js" -Depth 2 for file listing (NEVER naked -Recurse!)
- Think in <hidden>, don't explain trivial navigation to user
- FORBIDDEN: Get-ChildItem -Recurse | Select-String (SLOW & HANGS!)`,

  [AGENT_STATES.READ]: `

**READ STATE:**
- ALWAYS count first: (gc file.txt).Count
- If < 300 lines: Show-FileWithLineNumbers -Path file.txt
- If > 300 lines: Show-FileWithLineNumbers -Path file.txt -StartLine 1 -EndLine 100
- NO <answer> tag for reading, just <cmd>
- Store learnings in memory (no output needed)
- CRITICAL: Commands MUST be in <cmd> tag, NEVER in <answer> or plain text`,

  [AGENT_STATES.UNDERSTAND]: `

**UNDERSTAND STATE:**
- Use <hidden> for detailed analysis (not shown to user)
- Use <answer> ONLY when you need user input OR have found the solution
- If you need more info: Just use <cmd> to continue reading
- Look for: structure, patterns, bugs, TODOs
- Summarize, don't repeat every detail
- NEVER put commands in <answer> - always use <cmd>`,

  [AGENT_STATES.EDIT]: `

**EDIT STATE:**
- MUST use <answer> to explain what & why
- Set-FileLine for single: Set-FileLine -Path file.txt -LineNumber 25 -NewContent "new"
- Set-MultipleLines for batch: Set-MultipleLines -Path file.txt -Replacements @{25='line1'; 30='line2'}
- NEVER use -replace for complex patterns
- Verify line numbers from READ state first`,

  [AGENT_STATES.EXECUTE]: `

**EXECUTE STATE:**
- Use <hidden> to explain why running
- Tests: npm test, pytest, node test.js
- Syntax: node --check file.js, python -m py_compile file.py
- NO <answer> unless output is important`,

  [AGENT_STATES.VERIFY]: `

**VERIFY STATE:**
- Check if changes worked
- Re-read edited sections if needed
- Use <answer> to report results
- Move to DONE if verified successfully`,

  [AGENT_STATES.DONE]: `

**DONE STATE:**
- Summarize accomplishments in <answer>
- List files modified
- Mention remaining issues/next steps
- Add <!END> tag
- NO new commands`,
};

// ===================================
// CORE SYSTEM PROMPT (State-Aware)
// ===================================
const SYSTEM_PROMPT = `You are a PowerShell coding assistant. Work in STATES for efficiency.

**CURRENT STATE: {current_state}**

**RESPONSE FORMAT:**
{state_format}

**CORE RULES:**
1. Use <hidden> for internal thinking (NOT shown to user)
2. Use <answer> ONLY when user needs info (state-specific)
3. NEVER repeat failed commands - try different approach
4. Search: Use Search-InFiles (FAST!) not Get-ChildItem -Recurse
5. File ops: Show-FileWithLineNumbers, Set-FileLine, Set-MultipleLines
6. Check size: Get-FileStats before reading large files

**FORMAT RULES (CRITICAL):**
- Commands MUST be in <cmd>...</cmd>, NEVER in <answer> or plain text
- NEVER output command results - system shows them automatically
- NEVER mix tags with command output
- Each response: ONE purpose (search OR read OR edit OR answer)
{state_rules}{command_reference}`;

// ===================================
// COMMAND REFERENCE (Minimal)
// ===================================
const COMMAND_REFERENCE = `

**FAST SEARCH (Use these FIRST - no file loading!):**
Search-InFiles -Pattern "regex" -Filter "*.js" [-Path "dir"] [-Depth 2] [-Context 2]
  Example: Search-InFiles -Pattern "openCodeDetail" -Filter "*.js" -Depth 2
  Example: Search-InFiles -Pattern "class.*Button" -Filter "*.tsx,*.jsx" -Path "renderer"
Find-Pattern -Pattern "regex" -Path <file> [-Context 2]
  Example: Find-Pattern -Pattern "display.*none" -Path "style.css"
Get-FileStats -Path <file>  # Check file size/lines before reading

**FILE OPERATIONS:**
Show-FileWithLineNumbers -Path <file> [-StartLine N] [-EndLine N]
Set-FileLine -Path <file> -LineNumber N -NewContent "text"
Set-MultipleLines -Path <file> -Replacements @{25='line1'; 30='line2'}
Remove-FileLine -Path <file> -LineNumber N
Add-FileLine -Path <file> -LineNumber N -NewContent "text"

**BASIC COMMANDS:**
ls -Filter "*.js" [-Depth 2]  # List files (ALWAYS use -Filter)
gc <file> - read (check .Count first! Or use Get-FileStats)`;

// ===================================
// ERROR-SPECIFIC GUIDANCE
// ===================================
const ERROR_GUIDANCE = {
  replace_failed: `
**-REPLACE FAILED:**
Your -replace command failed (common with special chars/regex).

**SOLUTION:**
$lines = gc <file>
$lines[24] = 'exact new content for line 25'
$lines | Set-Content <file>

NEVER retry same -replace!`,

  line_numbers_missing: `
**NEED LINE NUMBERS:**
You tried editing without knowing exact line numbers.

**REQUIRED:**
1. Show-FileWithLineNumbers -Path <file>
2. Identify exact line number
3. Set-FileLine -Path <file> -LineNumber X -NewContent "..."`,

  file_too_large: `
**FILE TOO LARGE:**
Reading entire file failed/slow.

**SOLUTION:**
1. Count: (gc <file>).Count
2. Read chunks: Show-FileWithLineNumbers -Path <file> -StartLine 1 -EndLine 300`,

  command_timeout: `
**COMMAND TIMEOUT:**
Command took > 30 seconds.

**SOLUTIONS:**
- Break into smaller operations
- Process fewer lines per command
- Avoid expensive recursion`,

  command_blocked: `
**COMMAND BLOCKED:**
Your command was blocked for safety (would hang PowerShell).

**SOLUTION - Use fast search instead:**
Search-InFiles -Pattern "your-pattern" -Filter "*.js" -Depth 2

**Why blocked:**
- Get-ChildItem -Recurse without -Depth = infinite recursion (node_modules!)
- Piping to Select-String = double slowdown

**NEVER do:** Get-ChildItem -Recurse | Select-String
**ALWAYS do:** Search-InFiles -Pattern "..." -Filter "*.js" -Depth 2`,
};

// ===================================
// FIRST PROMPT
// ===================================
const PROMPT_FIRST = `=== USER REQUEST ===
{user_prompt}

{common_command}

=== TASK ===
Start solving now. Remember your current state and work efficiently.`;

// ===================================
// SUBSEQUENT PROMPT
// ===================================
const PROMPT_SUBSEQUENT = `=== ORIGINAL REQUEST ===
{user_prompt}

=== COMMAND HISTORY ===
{command_history}

=== LAST COMMAND ===
Command: {last_command}
Output:
{last_output}

{common_command}

=== TASK ===
Continue solving based on output above.
{summary_reminder}
**CONTEXT AWARENESS:**
- You've executed commands in history - DON'T REPEAT THEM
- If stuck after 3 attempts, ask user + <!END>
- Build on previous work, remember what you learned

**ANTI-PATTERNS (NEVER DO):**
- Repeating same command
- Get-ChildItem -Recurse without -Depth (BLOCKED!)
- Editing without line numbers
- Complex -replace patterns (use $lines instead)

**WHEN DONE:**
<answer>Summary (casual Indonesian)</answer>
<!END>`;

// ===================================
// STATE DETECTION
// ===================================
function detectCurrentState(commandHistory = [], lastCommand = '', iteration = 0) {
  // Determine current state from recent activity

  // First iteration = EXPLORE
  if (iteration === 0) {
    return AGENT_STATES.EXPLORE;
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
function buildStatePrompt(state, iteration, commandHistory, includeReference = false) {
  const stateFormat = STATE_RESPONSE_FORMATS[state];
  const stateRules = STATE_RULES[state] || '';

  // Build command reference (only when needed)
  const commandRef = (includeReference || iteration === 0 || iteration > 5)
    ? COMMAND_REFERENCE
    : '';

  // Build prompt with state-specific rules
  let prompt = SYSTEM_PROMPT
    .replace('{current_state}', state.toUpperCase())
    .replace('{state_format}', stateFormat.format)
    .replace('{state_rules}', stateRules)
    .replace('{command_reference}', commandRef);

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
