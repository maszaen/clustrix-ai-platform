// ===================================================================
// CODE AGENT V2: STATE-BASED DYNAMIC PROMPTING SYSTEM
// ===================================================================
//
// DESIGN PHILOSOPHY:
// 1. Different STATES = Different PROMPTS (EXPLORE/READ/EDIT/EXECUTE/DONE)
// 2. Smart response format per operation type
// 3. <hidden> tag for internal AI thinking (not shown to user)
// 4. Command safety detection (prevent stuck/expensive operations)
// 5. Context memory compression (remember what AI knows)
//
// TOKEN EFFICIENCY:
// - State-specific prompts (only inject relevant rules)
// - Hidden tag (no clutter in UI)
// - Smart context compression
// - Regex-based patterns (avoid expensive searches)
// ===================================================================

// ===================================
// AGENT STATES & TRANSITIONS
// ===================================
const AGENT_STATES = {
  EXPLORE: 'explore',     // Finding files, searching codebase
  READ: 'read',           // Reading file contents
  UNDERSTAND: 'understand', // Analyzing code/structure
  EDIT: 'edit',           // Modifying files
  EXECUTE: 'execute',     // Running commands/tests
  VERIFY: 'verify',       // Checking results
  DONE: 'done',           // Task complete
};

// ===================================
// RESPONSE FORMAT RULES PER STATE
// ===================================
const STATE_RESPONSE_FORMATS = {
  [AGENT_STATES.EXPLORE]: {
    // When searching/exploring: use hidden tag for thinking
    format: '<hidden>thinking about where to look</hidden>\n<cmd>search command</cmd>',
    requireAnswer: false,
    requireHidden: true,
  },
  [AGENT_STATES.READ]: {
    // When reading: no answer needed, just read
    format: '<cmd>read command</cmd>',
    requireAnswer: false,
    requireHidden: false,
  },
  [AGENT_STATES.UNDERSTAND]: {
    // When analyzing: hidden thinking + optional answer
    format: '<hidden>analysis</hidden>\n<answer>summary for user</answer>',
    requireAnswer: true,
    requireHidden: true,
  },
  [AGENT_STATES.EDIT]: {
    // When editing: explain what/why + command
    format: '<answer>what is being changed and why</answer>\n<cmd>edit command</cmd>',
    requireAnswer: true,
    requireHidden: false,
  },
  [AGENT_STATES.EXECUTE]: {
    // When running: hidden reasoning + command
    format: '<hidden>why running this</hidden>\n<cmd>run command</cmd>',
    requireAnswer: false,
    requireHidden: true,
  },
  [AGENT_STATES.VERIFY]: {
    // When checking: answer about results
    format: '<answer>result of verification</answer>\n<cmd>check command</cmd>',
    requireAnswer: true,
    requireHidden: false,
  },
  [AGENT_STATES.DONE]: {
    // Task complete: summary only
    format: '<answer>summary of what was done</answer>\n<!END>',
    requireAnswer: true,
    requireHidden: false,
  },
};

// ===================================
// DANGEROUS COMMAND PATTERNS
// ===================================
const DANGEROUS_PATTERNS = [
  {
    pattern: /Get-ChildItem.*-Recurse(?!.*-Depth)/i,
    warning: 'UNSAFE: Unbounded -Recurse without -Depth limit',
    suggestion: 'Add -Depth 2 or use specific path filter',
    block: true,
  },
  {
    pattern: /Select-String.*Get-ChildItem.*-Recurse/i,
    warning: 'EXPENSIVE: Recursive search on entire directory',
    suggestion: 'Use specific file filter: Get-ChildItem -Filter "*.js" -Depth 2',
    block: true,
  },
  {
    pattern: /gc.*\|.*Select-String.*-AllMatches/i,
    warning: 'SLOW: AllMatches on large files can hang',
    suggestion: 'Read file in chunks or use specific line ranges',
    block: false,
  },
  {
    pattern: /-replace.*[\[\]{}()\\]/,
    warning: 'FRAGILE: Special regex characters in -replace',
    suggestion: 'Use Set-FileLine or $lines pattern instead',
    block: false,
  },
];

// ===================================
// CORE SYSTEM PROMPT (ULTRA-COMPACT)
// ===================================
const CORE_PROMPT = `You are a PowerShell coding assistant. Work in STATES:

**CURRENT STATE: {current_state}**

**RESPONSE FORMAT FOR {current_state}:**
{state_format}

**CORE RULES:**
1. Use <hidden> for internal thinking (not shown to user)
2. Use <answer> only when user needs to know something important
3. NEVER repeat failed commands - try different approach
4. Count lines before reading: (gc file.txt).Count
5. Use helper functions: Show-FileWithLineNumbers, Set-FileLine, Remove-FileLine, Add-FileLine{state_specific_rules}`;

// ===================================
// STATE-SPECIFIC RULES
// ===================================
const STATE_RULES = {
  [AGENT_STATES.EXPLORE]: `

**EXPLORE STATE RULES:**
- Use ls/dir with specific filters: ls *.js, ls backend/codes/
- NEVER use -Recurse without -Depth limit: Get-ChildItem -Recurse -Depth 2
- For file search: Get-ChildItem -Filter "*.js" -Depth 2
- For content search: Select-String "pattern" -Path "specific-file.js"
- Think in <hidden> tag about where to look, don't explain to user`,

  [AGENT_STATES.READ]: `

**READ STATE RULES:**
- ALWAYS count first: (gc file.txt).Count
- If < 300 lines: Show-FileWithLineNumbers -Path file.txt
- If > 300 lines: Show-FileWithLineNumbers -Path file.txt -StartLine 1 -EndLine 100
- NO answer tag needed for reading, just execute command
- Store in <hidden> what you learned from the file`,

  [AGENT_STATES.UNDERSTAND]: `

**UNDERSTAND STATE RULES:**
- Use <hidden> for detailed analysis
- Use <answer> only for key insights user needs
- Look for patterns: imports, exports, class definitions
- Check for: duplicate code, syntax errors, TODO comments
- Summarize structure, not every detail`,

  [AGENT_STATES.EDIT]: `

**EDIT STATE RULES:**
- MUST use <answer> to explain what's being changed
- Use Set-FileLine for single line: Set-FileLine -Path file.txt -LineNumber 25 -NewContent "new"
- Use Set-MultipleLines for batch: Set-MultipleLines -Path file.txt -Replacements @{25='line1'; 30='line2'}
- NEVER use -replace for complex patterns
- Always verify line numbers from previous READ state`,

  [AGENT_STATES.EXECUTE]: `

**EXECUTE STATE RULES:**
- Use <hidden> to explain why running this command
- For tests: npm test, pytest, node test.js
- For syntax check: node --check file.js, python -m py_compile file.py
- For run: python file.py, node file.js
- NO answer tag unless there's important output`,

  [AGENT_STATES.VERIFY]: `

**VERIFY STATE RULES:**
- Check if changes worked
- Re-read edited sections if needed
- Run tests if applicable
- Use <answer> to report verification results
- Move to DONE state if verified successfully`,

  [AGENT_STATES.DONE]: `

**DONE STATE RULES:**
- Summarize what was accomplished in <answer>
- List files modified
- Mention any remaining issues
- Add <!END> tag
- NO new commands`,
};

// ===================================
// COMMAND REFERENCE (MINIMAL)
// ===================================
const COMMAND_REF = `

**HELPER FUNCTIONS (1-indexed):**
Show-FileWithLineNumbers -Path <file> [-StartLine N] [-EndLine N]
Set-FileLine -Path <file> -LineNumber N -NewContent "text"
Set-MultipleLines -Path <file> -Replacements @{25='line1'; 30='line2'}
Remove-FileLine -Path <file> -LineNumber N
Add-FileLine -Path <file> -LineNumber N -NewContent "text"
Search-FileWithContext -Path <file> -Pattern "regex" -ContextBefore 2 -ContextAfter 2
Get-FileLineRange -Path <file> -Ranges @('1-100', '200-300')
Find-DuplicateLines -Path <file>

**BASIC POWERSHELL:**
ls / dir - list files (add -Filter "*.js" for specific types)
gc <file> - read file (check .Count first!)
Test-Path <file> - check if exists
Select-String "pattern" <file> - search in file`;

// ===================================
// STATE DETECTION FROM COMMAND HISTORY
// ===================================
function detectCurrentState(commandHistory = [], lastCommand = '') {
  // Determine current state based on recent activity
  const recentCommands = commandHistory.slice(-3);

  // Check last command
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

  // Check for verification patterns
  for (const entry of recentCommands) {
    if (entry.command && entry.command.includes('Set-FileLine')) {
      // Just edited, now verifying
      return AGENT_STATES.VERIFY;
    }
  }

  // Default to EXPLORE at start
  if (commandHistory.length === 0) {
    return AGENT_STATES.EXPLORE;
  }

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
function buildStatePrompt(state, iteration, commandHistory) {
  const stateFormat = STATE_RESPONSE_FORMATS[state];
  const stateRules = STATE_RULES[state] || '';

  // Build prompt
  let prompt = CORE_PROMPT
    .replace('{current_state}', state.toUpperCase())
    .replace('{state_format}', stateFormat.format)
    .replace('{state_specific_rules}', stateRules);

  // Add command reference only on first iteration or after errors
  if (iteration === 0 || iteration > 5) {
    prompt += COMMAND_REF;
  }

  return prompt;
}

// ===================================
// CONTEXT MEMORY COMPRESSION
// ===================================
function compressOldContext(conversationHistory = []) {
  // Keep last 6 messages (3 exchanges) in full
  // Compress older messages to summaries
  const KEEP_FULL = 6;

  if (conversationHistory.length <= KEEP_FULL) {
    return conversationHistory;
  }

  const recentMessages = conversationHistory.slice(-KEEP_FULL);
  const oldMessages = conversationHistory.slice(0, -KEEP_FULL);

  // Compress old messages
  const compressed = {
    role: 'system',
    content: `[PREVIOUS CONTEXT SUMMARY - ${oldMessages.length} messages compressed]
AI has already:
- Explored project structure
- Read several files
- Made some modifications
Recent exchanges contain full details.`,
  };

  return [compressed, ...recentMessages];
}

// ===================================
// PARSE RESPONSE WITH HIDDEN TAG
// ===================================
function parseAgentResponseV2(text = '') {
  const hiddenMatch = text.match(/<hidden>([\s\S]*?)<\/hidden>/i);
  const answerMatch = text.match(/<answer>([\s\S]*?)<\/answer>/i);
  const cmdMatch = text.match(/<cmd>([\s\S]*?)<\/cmd>/i);
  const summaryMatch = text.match(/<summary>([\s\S]*?)<\/summary>/i);
  const done = /<!END>/i.test(text);

  return {
    hidden: hiddenMatch ? hiddenMatch[1].trim() : null,
    answer: answerMatch ? answerMatch[1].trim() : null,
    command: cmdMatch ? cmdMatch[1].trim() : '',
    summary: summaryMatch ? summaryMatch[1].trim() : null,
    done,
  };
}

// ===================================
// EXPORTS
// ===================================
module.exports = {
  AGENT_STATES,
  STATE_RESPONSE_FORMATS,
  DANGEROUS_PATTERNS,
  CORE_PROMPT,
  STATE_RULES,
  COMMAND_REF,
  detectCurrentState,
  detectDangerousCommand,
  buildStatePrompt,
  compressOldContext,
  parseAgentResponseV2,
};
