const https = require('https');
const { URL } = require('url');
const fs = require('fs');
const { PowerShellSession } = require('./powershell-session');
const { joinEndpoint } = require('../integration/langchain-helpers');
const {
  AGENT_STATES,
  DANGEROUS_PATTERNS,
  SYSTEM_PROMPT,
  PROMPT_FIRST,
  PROMPT_SUBSEQUENT,
  detectCurrentState,
  detectDangerousCommand,
  buildStatePrompt,
  getCommandReference,
  getErrorGuidance,
} = require('./codes-prompt');
const MAX_ITERATIONS = 30;
const MAX_HISTORY = 15;
const MAX_OUTPUT_LINES = 100;
const MAX_OUTPUT_LENGTH = 8000;
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const HISTORY_SUMMARY_LENGTH = 160;
const COMMAND_EXECUTION_TIMEOUT_MS = 30 * 1000; // 30 seconds max for command execution
const COMMAND_APPROVAL_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes for user approval window

// const PROMPT_FIRST = `You are a PowerShell-based coding assistant helping user fix bugs in code files or any problem.

// === ORIGINAL USER REQUEST ===
// {user_prompt}

// === COMMAND HISTORY ===
// {command_history}

// === LAST COMMAND ===
// Command: {last_command}
// Output: 
// {last_output}

// 💡 CONTEXT AWARENESS:
// - If you already listed files → You know what files exist
// - If you already read a file → You know its content
// - If you already ran code → You know the output
// - DON'T repeat commands unless the output was unclear or you need to verify a change

// === POWERSHELL COMMAND ARSENAL ===
// You can execute ANY PowerShell command to solve problems. Here are the most common operations for coding tasks:

// **File Navigation & Exploration:**
// - Get-ChildItem / ls / dir - list files/folders
// - gc <file> - read entire file
// - gc <file> -Head 20 - read first N lines
// - gc <file> -Tail 20 - read last N lines
// - gc <file> | Select-Object -First 50 -Skip 100 - read specific line range
// - Test-Path <path> - check if file/folder exists
// - Get-Location / pwd - show current directory

// **Search & Pattern Matching:**
// - Select-String "pattern" <file> - search in file (like grep)
// - Select-String "pattern" <file> -Context 2,2 - show 2 lines before/after match
// - Get-ChildItem -Recurse -Filter "*.js" - find files by pattern
// - gc <file> | Select-String "pattern" -AllMatches
// - (gc main.py)[51..57]
// - Avoid read entire file like "gc main.py" if you havent count line
// - max count line is 300 per shot.

// **File Editing:**
// - (gc <file>) -replace "old", "new" | Set-Content <file> - replace text
// - (gc <file>) | Where-Object {$_ -notmatch "pattern"} | Set-Content <file> - remove lines
// - $content = gc <file>; $content[10] = "new line"; $content | Set-Content <file> - edit specific line
// - Add-Content <file> "new line" - append to file
// - Set-Content <file> "content" - overwrite entire file
// - $lines = gc <file>; $lines[5..10] - extract line range

// **Code Execution:**
// - python <file>.py - run Python script
// - node <file>.js - run Node.js script
// - npm test - run tests
// - python -m pytest - run pytest

// **Smart Debugging:**
// - python -c "import ast; ast.parse(open('file.py').read())" - validate Python syntax
// - node --check <file>.js - validate JS syntax
// - gc <file> | Select-String "TODO|FIXME|BUG" - find code comments

// **Multi-line Commands (use semicolons or newlines):**
// - $var = gc file.txt; $var -replace "old","new" | Set-Content file.txt
// - Multiple commands in sequence are totally fine!

// **IMPORTANT - Multi-line String Replacement Rules:**
// ⚠️  AVOID complex -replace patterns with multi-line content or special chars - they often fail!
// Instead:
// - For multi-line changes: Read file → Store in variable → Modify → Write back (3-4 steps)
// - For simple replacements: Use (gc) -replace "simple","pattern" on single lines only
// - For code blocks: Use @' '@  here-strings or manually construct the content
// Example that WORKS:
//   $lines = gc "file.py"
//   $lines[29] = '        if num % 2 == 0:  # Fixed: using == for comparison'
//   $lines | Set-Content "file.py"
// Example that FAILS (avoid!):
//   (gc file.py) -replace "def func():..." (multi-line regex) 
// If replacement fails first time, DON'T RETRY - use a different approach!

// === THINKING APPROACH ===
// Before each action, ask yourself:
// 1. **Understanding**: Do I fully understand the problem from the output?
// 2. **Context**: Do I have enough context about the code structure?
// 3. **Strategy**: What's the most efficient way to fix this?
// 4. **Verification**: How will I verify the fix works?

// Then decide:
// - **Need info?** → Use search, grep, file reading, listing
// - **Ready to fix?** → Use replace, edit, or multi-step modifications
// - **Need to verify?** → Run the code/tests
// - **Stuck?** → Ask User for clarification
// - **Done?** → Summarize and add <!END>

// === CORE PRINCIPLES ===
// 1. **Be Creative**: Use ANY PowerShell command that helps - don't limit yourself to basic commands
// 2. **Be Precise**: When editing, understand the exact location and context
// 3. **Be Efficient**: Combine commands when it makes sense (e.g., read + filter + count)
// 4. **Be Adaptive**: If one approach fails, try a different command/strategy
// 5. **Think First**: Analyze command output before rushing to next action
// 6. **One Command Rule**: Don't repeat the exact same command - if it failed, modify your approach
// 7. **Only PowerShell**: <cmd> tag MUST contain only valid PowerShell commands, never natural language

// === WORKFLOW PATTERNS ===

// **Pattern 1: Explore → Understand → Fix → Verify**
// First run: ls → find relevant files
// Next: gc → see the code
// Then: fix with replace/edit
// Finally: run to verify

// **Pattern 2: Search-Driven Fixing**
// First: Select-String to find all occurrences
// Context: Get lines around matches
// Fix: Targeted replacements
// Verify: Search again to confirm

// **Pattern 3: Multi-Step Edits**
// Read file into variable → modify → write back
// Useful for complex transformations

// === RESPONSE FORMAT ===
// Always respond in this exact format:

// **First Response (iteration 0): Start solving**
// Option A: Simple problem → just <answer> + <cmd>
// Option B: Complex problem (3+ steps) → create <todo> first, then <answer>

// IF creating task plan (complex problems only):
// <todo>
// - [ ] Step 1
// - [ ] Step 2
// - [ ] Step 3
// </todo>

// <answer>
// Brief explanation of your plan or approach
// </answer>

// <cmd>
// PowerShell command for first step (optional)
// </cmd>

// IF no plan needed (simple or single-step):
// <answer>
// Brief explanation and action
// </answer>

// <cmd>
// PowerShell command (optional)
// </cmd>

// **Subsequent Responses (iteration 1+): Continue solving**
// IF you created <todo> before → update checklist:
// <checklist>
// - [x] Completed steps
// - [ ] Next steps
// </checklist>

// <answer>
// What you found + what's next
// </answer>

// <cmd>
// PowerShell command for next action (optional)
// </cmd>

// IF no <todo> before → just respond normally:
// <answer>
// What you found + what's next
// </answer>

// <cmd>
// PowerShell command (optional)
// </cmd>

// === TODO/CHECKLIST GUIDELINES ===
// 1. **Create <todo> only if** → problem needs 3+ steps OR complex multi-file changes
// 2. **Don't create <todo> if** → simple problem, single command fixes, or quick verification
// 3. **Be selective** → Not every problem needs planning. Use judgment!
// 4. **Track Progress** → If you created <todo>, update <checklist> each iteration
// 5. **Stay Focused** → Max 5-7 items in todo, don't expand scope
// 6. **Done Signal** → When all [x] complete → add <!END>

// **Important**: 
// - If just answering a question (no file operations needed) → only use <answer>, no <cmd>
// - If you're done fixing → add <!END> after your tags
// - Never put explanations/questions inside <cmd> - only valid PowerShell commands!`;

// const PROMPT_SUBSEQUENT = `You are a PowerShell-based coding assistant helping user fix bugs in code files or any problem.

// CRITICAL: You have MEMORY! Read the COMMAND HISTORY below carefully. You've already executed commands and seen their output.
// DO NOT repeat what you've already done. Build on previous work. Use context from earlier commands.

// === ORIGINAL USER REQUEST ===
// {user_prompt}

// === COMMAND HISTORY ===
// {command_history}

// === LAST COMMAND ===
// Command: {last_command}
// Output: 
// {last_output}

// === POWERSHELL COMMAND ARSENAL ===
// You have full access to PowerShell commands. Common patterns:

// **File Navigation & Exploration:**
// - Get-ChildItem / ls / dir - list files/folders
// - gc <file> (-Head N / -Tail N / | Select-Object -First N -Skip M)
// - Test-Path, Get-Location

// **Search & Pattern Matching:**
// - Select-String "pattern" <file> (-Context X,Y for surrounding lines)
// - Get-ChildItem -Recurse -Filter "*.ext"
// - (gc <file>).Count

// **File Editing (be creative!):**
// - (gc <file>) -replace "old", "new" | Set-Content <file>
// - (gc <file>) | Where-Object {$_ -notmatch "pattern"} | Set-Content <file>
// - $content = gc <file>; $content[10] = "new"; $content | Set-Content <file>
// - Multi-line edits with variables

// **Code Execution:**
// - python <file>.py, node <file>.js, npm test, pytest

// **Smart Debugging:**
// - python -c "import ast; ast.parse(...)" - syntax check
// - node --check <file> - JS validation
// - Select-String for TODO/FIXME/BUG comments

// === STRATEGIC THINKING ===
// Analyze the last output carefully:
// 1. **What did I learn?** - Extract key information from command output
// 2. **What's next?** - Determine if I need more info, ready to fix, or need verification
// 3. **Alternative approach?** - If stuck, what's a different way to tackle this?
// 4. **Progress check?** - Am I moving forward or repeating myself?

// Decision paths:
// - **Need more context** → Search, read files, check structure
// - **Ready to fix** → Apply edits (replace, modify lines, multi-step)
// - **Need verification** → Run code/tests
// - **Task complete** → Summarize + <!END>
// - **Uncertain** → Ask User

// === CORE PRINCIPLES ===
// 1. **Creativity First**: Use ANY PowerShell command - don't be rigid
// 2. **Context Awareness**: Always consider the full picture before acting
// 3. **Adaptive Strategy**: Failed command? Try a different approach immediately
// 4. **No Repetition**: Never run the exact same command twice
// 5. **Precision in Edits**: Know exactly what you're changing and why
// 6. **Verify Critical Changes**: Run code after important fixes
// 7. **Only PowerShell**: <cmd> must contain valid PowerShell only, no explanations

// === PROBLEM-SOLVING WORKFLOW ===

// **For Bug Fixes:**
// 1. Search/grep to locate issue → 2. Read context → 3. Fix precisely → 4. Verify if critical

// **For Code Exploration:**
// 1. List directory → 2. Identify relevant files → 3. Read selectively → 4. Summarize findings

// **For Multi-file Changes:**
// 1. Find all affected files → 2. Fix one by one → 3. Track what's done → 4. Final verification

// **When Stuck:**
// - Try a different search pattern
// - Read more context
// - Break problem into smaller steps
// - Ask User for clarification

// === RESPONSE FORMAT ===
// Always use this exact structure:

// **IF you created <todo> in first response → update checklist:**
// <checklist>
// - [x] Completed items
// - [ ] Next item to do
// </checklist>

// <answer>
// What you found + what you'll do next (brief, Indonesian)
// </answer>

// <cmd>
// PowerShell command for next step (optional)
// </cmd>

// **IF no <todo> was created → just respond normally:**
// <answer>
// What you found + what you'll do next (brief, Indonesian)
// </answer>

// <cmd>
// PowerShell command (optional)
// </cmd>

// === CHECKLIST RULES FOR ITERATIONS ===
// 1. **Only if you created <todo>** → update <checklist> each iteration
// 2. **Mark items done** → Change [x] when truly complete
// 3. **No new items** → Stay focused on original plan
// 4. **If stuck** → Ask User, try different approach, don't expand scope
// 5. **Done Signal** → When all [x] complete → add <!END>

// **Stop Signal:**
// When all tasks complete, or you need clarification → add <!END> at the end

// **Remember**: Use <todo>/<checklist> only when needed, keep it simple!`;

let deps = {
  log: () => {},
  getCodeById: () => null,
};

const sessionStates = new Map();
const confirmationPromises = new Map(); // Store pending confirmation promises
let idleTimer = null;

function log(context, level, func, message, details = {}) {
  try {
    deps.log?.(context, level, func, message, details);
  } catch (error) {
    console.debug(`[codes:${func}]`, message, details, error);
  }
}

function ensureIdleTimer() {
  if (idleTimer) return;
  idleTimer = setInterval(() => {
    const now = Date.now();
    for (const [sessionId, state] of sessionStates.entries()) {
      if (now - state.lastUsed > IDLE_TIMEOUT_MS) {
        try {
          state.terminal?.dispose();
        } catch {}
        sessionStates.delete(sessionId);
      }
    }
  }, 60 * 1000);
  idleTimer.unref?.();
}

function getSessionState(sessionId) {
  let state = sessionStates.get(sessionId);
  if (!state) {
    state = {
      commandHistory: [],
      conversationHistory: [], // NEW: Track full conversation for context
      terminal: null,
      lastUsed: Date.now(),
      iterationCount: 0,
      workspacePath: null,
      instruction: '',
    };
    sessionStates.set(sessionId, state);
  }
  state.lastUsed = Date.now();
  ensureIdleTimer();
  return state;
}

function waitForUserConfirmation(sessionId, iteration) {
  const key = `${sessionId}-${iteration}`;
  
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      const entry = confirmationPromises.get(key);
      if (entry && entry.resolve === resolve) {
        confirmationPromises.delete(key);
        resolve({ allowed: false, timedOut: true });
      }
    }, COMMAND_APPROVAL_TIMEOUT_MS);

    confirmationPromises.set(key, { resolve, timeoutId });
  });
}

function resolveUserConfirmation(sessionId, iteration, allowed) {
  const key = `${sessionId}-${iteration}`;
  const entry = confirmationPromises.get(key);
  
  if (entry && typeof entry.resolve === 'function') {
    confirmationPromises.delete(key);
    if (entry.timeoutId) {
      clearTimeout(entry.timeoutId);
    }
    entry.resolve({ allowed, timedOut: false });
    return true;
  }
  
  return false;
}

function truncateOutput(output, mode = 'full') {
  if (!output) return '';
  const allLines = output.split(/\r?\n/);
  
  // Mode: 'older' = 10 lines for older commands, 'full' = 100 lines for recent commands
  const maxLines = mode === 'older' ? 10 : MAX_OUTPUT_LINES;
  const lines = allLines.slice(0, maxLines);
  let joined = lines.join('\n');
  
  // Add "X more lines" indicator if truncated
  if (mode === 'older' && allLines.length > maxLines) {
    joined += `\n... (${allLines.length - maxLines} more lines)`;
  }
  
  if (joined.length > MAX_OUTPUT_LENGTH) {
    joined = joined.slice(0, MAX_OUTPUT_LENGTH) + '\n…';
  }
  return joined;
}

function summarizeOutput(output = '', exitCode = 0) {
  const normalized = output.trim();
  if (!normalized) {
    return exitCode === 0 ? 'No output' : `Exit code ${exitCode}`;
  }
  const singleLine = normalized.replace(/\s+/g, ' ');
  if (singleLine.length <= HISTORY_SUMMARY_LENGTH) {
    return singleLine;
  }
  return `${singleLine.slice(0, HISTORY_SUMMARY_LENGTH)}…`;
}

function formatCommandHistory(history = []) {
  if (!history.length) {
    return 'No commands executed yet.';
  }
  
  const recentHistory = history.slice(-MAX_HISTORY);
  const olderHistory = recentHistory.slice(0, -3); // All but last 3
  const recentThree = recentHistory.slice(-3); // Last 3 commands with full output
  
  const parts = [];
  
  // Older commands: show command + truncated output (10 lines)
  if (olderHistory.length > 0) {
    parts.push('=== OLDER COMMANDS (truncated) ===');
    parts.push(olderHistory.map((entry, index) => {
      const idx = history.length - recentHistory.length + index + 1;
      const output = truncateOutput(entry.output || 'No output', 'older');
      return `#${idx} ${entry.command}\nOutput:\n${output}\nExit Code: ${entry.exitCode}\n`;
    }).join('\n'));
  }
  
  // Recent 3 commands: show FULL output for better context
  if (recentThree.length > 0) {
    parts.push('\n=== RECENT COMMANDS (full output) ===');
    recentThree.forEach((entry, index) => {
      const idx = history.length - recentThree.length + index + 1;
      const output = truncateOutput(entry.output || 'No output', 'full');
      parts.push(`#${idx} ${entry.command}\nOutput:\n${output}\nExit Code: ${entry.exitCode}`);
    });
  }
  
  return parts.join('\n');
}

function getLastCommand(history = []) {
  if (!history.length) {
    return {
      command: 'None',
      output: 'No command executed yet.',
    };
  }
  const last = history[history.length - 1];
  return {
    command: last.command,
    output: truncateOutput(last.output || ''),
  };
}

function buildUserPrompt({ userPrompt, instruction, workspacePath }) {
  const parts = [];
  if (instruction) {
    parts.push(`=== WORKSPACE INSTRUCTION ===\n${instruction}`);
  }
  if (workspacePath) {
    parts.push(`Workspace: ${workspacePath}`);
  }
  parts.push(`=== USER PROMPT ===\n${userPrompt}`);
  return parts.join('\n\n');
}

function selectPromptTemplate(iteration) {
  return iteration === 0 ? PROMPT_FIRST : PROMPT_SUBSEQUENT;
}

function detectErrorContext(commandHistory = []) {
  // Detect error patterns from recent command history to inject targeted guidance
  const recentCommands = commandHistory.slice(-3); // Last 3 commands

  let errorType = null;
  let includeCommandReference = false;

  for (const entry of recentCommands) {
    const { command = '', output = '', exitCode = 0 } = entry;

    // V2: Detect BLOCKED commands
    if (output.includes('[COMMAND BLOCKED FOR SAFETY]')) {
      errorType = 'command_blocked';
      includeCommandReference = true;
      break;
    }

    // Detect -replace command failures
    if (exitCode !== 0 && command.includes('-replace')) {
      errorType = 'replace_failed';
      includeCommandReference = true;
      break;
    }

    // Detect timeout errors
    if (output.includes('timeout') || output.includes('Terminal execution failed')) {
      errorType = 'command_timeout';
      includeCommandReference = true;
      break;
    }

    // Detect file too large issues
    if (output.includes('out of range') || output.toLowerCase().includes('too large')) {
      errorType = 'file_too_large';
      includeCommandReference = true;
      break;
    }
  }

  // Include detailed command reference after 5+ iterations or on error
  if (!includeCommandReference && commandHistory.length > 5) {
    includeCommandReference = true;
  }

  return { errorType, includeCommandReference };
}

function renderSystemPrompt(template, { userPrompt, commandHistory, lastCommand, iteration = 0 }) {
  // V2: STATE-BASED PROMPTING
  // Detect current state from command history
  const currentState = detectCurrentState(
    commandHistory,
    lastCommand.command || '',
    iteration
  );

  // Check if last output > 10 lines for dynamic injection
  const lastOutputLines = (lastCommand.output || '').split(/\r?\n/).length;

  // 1. Summary REMINDER for PROMPT_SUBSEQUENT (task section)
  const summaryReminder = lastOutputLines > 10
    ? `\nRemember to add <summary> tag for your command output.\n`
    : '';

  // 2. V2: Build state-specific system prompt
  const { errorType, includeCommandReference } = detectErrorContext(commandHistory);
  const errorGuidance = errorType ? getErrorGuidance(errorType) : '';

  // Build state-aware prompt (includes state rules + format)
  const statePrompt = buildStatePrompt(
    currentState,
    iteration,
    commandHistory,
    includeCommandReference || iteration === 0
  );

  // Build final prompt with error guidance if detected
  const finalSystemPrompt = errorGuidance
    ? `${statePrompt}\n\n${errorGuidance}`
    : statePrompt;

  return template
    .replace('{user_prompt}', userPrompt)
    .replace('{command_history}', commandHistory)
    .replace('{last_command}', lastCommand.command)
    .replace('{last_output}', lastCommand.output)
    .replace('{summary_reminder}', summaryReminder)
    .replace('{common_command}', finalSystemPrompt);
}

function parseAgentResponse(text = '') {
  const hiddenMatch = text.match(/<hidden>([\s\S]*?)<\/hidden>/i);
  const answerMatch = text.match(/<answer>([\s\S]*?)<\/answer>/i);
  const cmdMatch = text.match(/<cmd>([\s\S]*?)<\/cmd>/i);
  const done = /<!END>/i.test(text);
  const todoMatch = text.match(/<todo>([\s\S]*?)<\/todo>/i);
  const checklistMatch = text.match(/<checklist>([\s\S]*?)<\/checklist>/i);
  const summaryMatch = text.match(/<summary>([\s\S]*?)<\/summary>/i);

  // Clean answer by removing tags that should not appear in user-facing text
  let cleanAnswer = answerMatch ? answerMatch[1].trim() : '';
  if (cleanAnswer) {
    // Remove <!END> tag
    cleanAnswer = cleanAnswer.replace(/<!END>/gi, '').trim();
    // Remove <cmd> tags if they leaked into answer (AI should put cmd in separate tag)
    cleanAnswer = cleanAnswer.replace(/<cmd>[\s\S]*?<\/cmd>/gi, '').trim();
    // Remove <hidden> tags if they leaked into answer
    cleanAnswer = cleanAnswer.replace(/<hidden>[\s\S]*?<\/hidden>/gi, '').trim();
    // Remove other V2 tags that shouldn't be in answer
    cleanAnswer = cleanAnswer.replace(/<(?:todo|checklist|summary)>[\s\S]*?<\/(?:todo|checklist|summary)>/gi, '').trim();
  }

  // V2: If no <answer> tag found, check if <hidden> tag exists
  // If ONLY <hidden> tag exists, answer should be empty (hidden content is internal)
  // Only use fallback if NEITHER <answer> NOR <hidden> tag found
  if (!answerMatch && text.trim()) {
    if (!hiddenMatch) {
      // No structured tags at all - fallback to entire text (unformatted response)
      cleanAnswer = text.replace(/<[^>]*>/g, '').trim();
    }
    // else: hidden tag exists but no answer tag = intentional (EXPLORE/EXECUTE state)
    // answer should remain empty - hidden content is for AI only
  }

  return {
    hidden: hiddenMatch ? hiddenMatch[1].trim() : null, // V2: Internal AI thinking
    answer: cleanAnswer,
    command: cmdMatch ? cmdMatch[1].trim() : '',
    done,
    todo: todoMatch ? todoMatch[1].trim() : null,
    checklist: checklistMatch ? checklistMatch[1].trim() : null,
    summary: summaryMatch ? summaryMatch[1].trim() : null,
  };
}

function isHighImpactCommand(command = '') {
  // Remove leading/trailing whitespace dan normalize newlines
  const normalized = command
    .trim()
    .replace(/^\s+/gm, '') // Remove whitespace di awal setiap line
    .toLowerCase();
  
  // Ambil line pertama yang non-empty
  const firstLine = normalized
    .split('\n')
    .map(line => line.trim())
    .find(line => line.length > 0) || '';
  
  const dangerousPatterns = [
    // File/Directory deletion
    'remove-item',
    'rm ',
    'rmdir',
    'del ',
    'format-',
    'clear-content',
    'truncate',
    'shred',
    'wipe',
    
    // Disk operations
    'format-volume',
    'mkfs',
    'new-partition',
    'diskpart',
    'fdisk',
    'parted',
    'dd ',
    
    // Git operations
    'git checkout',
    'git reset',
    'git clean',
    'git push --force',
    'git push -f',
    'git rebase',
    'git branch -d',
    'git branch -D',
    'git filter-branch',
    'git gc',
    
    // Process/Service management
    'stop-service',
    'stop-process',
    'kill ',
    'killall',
    'taskkill',
    'pkill',
    
    // Registry (Windows)
    'reg delete',
    'remove-itemproperty',
    
    // Permission changes
    'chmod',
    'chown',
    'icacls',
    'set-acl',
    'chgrp',
    'setfacl',
    
    // Network config
    'netsh',
    'iptables',
    'route delete',
    'ifconfig',
    'ip route',
    'ufw delete',
    'firewall-cmd',
    
    // System config
    'shutdown',
    'restart-computer',
    'disable-',
    'uninstall',
    'reboot',
    'halt',
    'poweroff',
    'init ',
    'systemctl stop',
    'systemctl disable',
    
    // Package managers
    'npm uninstall',
    'yarn remove',
    'pip uninstall',
    'apt-get remove',
    'apt-get purge',
    'yum remove',
    'pacman -r',
    'brew uninstall',
    
    // Environment/Config
    'set-executionpolicy',
    'setenforce',
    
    // Cron/Scheduled tasks
    'crontab -r',
    'unregister-scheduledtask',
    'schtasks /delete',
    
    // Docker/Container
    'docker rm',
    'docker rmi',
    'docker system prune',
    'docker volume rm',
    'kubectl delete',
    
    // Certificate/Security
    'revoke-',
    'remove-certificate',
    
    // Symbolic links
    'ln -sf',
    'mklink',
    
    // Sudo prefix
    'sudo ',
  ];
  
  // Check if first non-empty line STARTS with any dangerous pattern
  return dangerousPatterns.some(pattern => firstLine.startsWith(pattern));
}

// function formatIterationOutput({ answer, command, output, exitCode, blocked }) {
//   // Return structured object instead of combined string
//   // This allows separate delivery of response+command vs output
//   return {
//     answer: answer || null,
//     command: command || null,
//     output: output || null,
//     exitCode,
//     blocked: !!blocked,
//   };
// }

function formatResponseAndCommand({ answer, command }) {
  const sections = [];
  if (answer) {
    const cleanedAnswer = answer
      .replace(/^```[\w]*\n?/, '') 
      .replace(/\n?```$/, '');     
    sections.push('\n' + cleanedAnswer + '\n');
  }
  if (command) {
    sections.push('```powershell\n' + command.trim() + '\n```\n');
  }
  return sections.length > 0 ? sections.join('\n\n') : null;
}

function formatOutput({ output, exitCode, blocked }) {
  // Format output only (sent AFTER execution)
  if (output) {
    const exitLine = Number.isFinite(exitCode)
      ? `\n# Exit Code: ${exitCode}`
      : '';
    return '```text\n' + output.trim() + exitLine + '\n```\n';
  } else if (blocked) {
    return '```text\nCommand blocked by safety policy.\n```\n';
  }
  return null;
}

function mergeUsage(target, usage) {
  if (!usage) return target;
  const result = target ? { ...target } : { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  if (typeof usage.prompt_tokens === 'number') {
    result.prompt_tokens += usage.prompt_tokens;
  }
  if (typeof usage.completion_tokens === 'number') {
    result.completion_tokens += usage.completion_tokens;
  }
  if (typeof usage.total_tokens === 'number') {
    result.total_tokens += usage.total_tokens;
  } else {
    result.total_tokens = result.prompt_tokens + result.completion_tokens;
  }
  return result;
}

function formatTodo(todoText) {
  // Parse todo checklist into structured format
  if (!todoText) return null;
  
  const lines = todoText.split('\n').filter(line => line.trim().startsWith('-'));
  const items = lines.map(line => {
    const match = line.match(/^-\s*\[([ xX])\]\s*(.+)$/);
    if (match) {
      return {
        checked: match[1].toLowerCase() === 'x',
        text: match[2].trim(),
      };
    }
    return null;
  }).filter(Boolean);
  
  return items.length > 0 ? items : null;
}

function formatTodoChunk(todo, checklist, iteration) {
  // Return formatted todo/checklist for sending to renderer
  const content = [];
  
  if (iteration === 0 && todo) {
    // First iteration: show todo list
    content.push('📋 **My Plan:**\n');
    const items = formatTodo(todo);
    if (items) {
      items.forEach(item => {
        content.push(`- [${item.checked ? 'x' : ' '}] ${item.text}`);
      });
    } else {
      content.push(todo);
    }
  } else if (iteration > 0 && checklist) {
    // Subsequent iterations: show checklist
    content.push('✓ **Progress:**\n');
    const items = formatTodo(checklist);
    if (items) {
      items.forEach(item => {
        const icon = item.checked ? '✅' : '⬜';
        content.push(`${icon} ${item.text}`);
      });
    } else {
      content.push(checklist);
    }
  }
  
  return content.length > 0 ? content.join('\n') : null;
}

function ensurePowerShellSession(state, workspacePath) {
  if (state.terminal && !state.terminal.isDisposed && state.workspacePath === workspacePath) {
    return state.terminal;
  }
  try {
    state.terminal?.dispose();
  } catch {}
  state.terminal = new PowerShellSession({ workspacePath, log });
  state.workspacePath = workspacePath;
  return state.terminal;
}

function ensureDirectoryExists(workspacePath) {
  if (!workspacePath) return workspacePath;
  try {
    if (fs.existsSync(workspacePath) && fs.statSync(workspacePath).isDirectory()) {
      return workspacePath;
    }
  } catch (error) {
    log('CODES', 3, 'ensureDirectoryExists', 'Workspace validation failed', { error: error?.message });
  }
  return null;
}

function callOpenAICompatibleChat({ baseUrl, provider, apiKey, model, messages }) {
  if (!baseUrl) {
    return Promise.reject(new Error('Base URL is required for code agent requests.'));
  }
  if (!model) {
    return Promise.reject(new Error('Model ID is required for code agent requests.'));
  }
  if (String(provider || '').toLowerCase() === 'gemini') {
    return Promise.reject(new Error('Gemini provider is not supported for PowerShell coding agent.'));
  }
  return new Promise((resolve, reject) => {
    let parsedUrl;
    try {
      parsedUrl = new URL(joinEndpoint(baseUrl, 'chat/completions'));
    } catch (error) {
      reject(error);
      return;
    }

    const bodyObj = {
      model,
      messages,
      stream: false,
    };
    const body = JSON.stringify(bodyObj);

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Content-Length': Buffer.byteLength(body)
    };
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }
    if (provider === 'openrouter') {
      headers['HTTP-Referer'] = 'https://clustrix.local';
      headers['X-Title'] = 'Clustrix Desktop';
    } else if (provider === 'bigmodel') {
      headers['User-Agent'] = 'Clustrix/1.0';
    }

    const options = {
      method: 'POST',
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      protocol: parsedUrl.protocol,
      headers,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`HTTP ${res.statusCode} ${res.statusMessage || ''} — ${data.slice(0, 200)}`));
        }
        try {
          const json = JSON.parse(data);
          const content = json?.choices?.[0]?.message?.content || '';
          resolve({
            content,
            usage: json?.usage || null,
          });
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function runAgentIteration({
  iteration,
  state,
  userPrompt,
  provider,
  model,
  baseUrl,
  apiKey,
}) {
  const commandHistoryText = formatCommandHistory(state.commandHistory);
  const lastCommand = getLastCommand(state.commandHistory);

  // Pass iteration for dynamic command reference injection
  const systemPrompt = renderSystemPrompt(selectPromptTemplate(iteration), {
    userPrompt,
    commandHistory: commandHistoryText,
    lastCommand,
    iteration,
  });

  // Debug: Log processed prompt for each iteration
  console.log('\n\n=== CODE AGENT ITERATION #' + iteration + ' - SYSTEM PROMPT ===');
  console.log(systemPrompt);
  console.log('=== END SYSTEM PROMPT ===\n\n');

  // Build messages array - OPTIMIZED for token efficiency
  let messages;

  if (iteration === 0) {
    // First iteration OF THIS REQUEST
    // Check if conversation history exists (continuing conversation) or is new
    const isNewConversation = state.conversationHistory.length === 0;

    if (isNewConversation) {
      // Brand new conversation - initialize history
      messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ];
      state.conversationHistory = [
        { role: 'user', content: userPrompt },
      ];
    } else {
      // Continuing existing conversation - append new user message
      state.conversationHistory.push({
        role: 'user',
        content: userPrompt,
      });
      messages = [
        { role: 'system', content: systemPrompt },
        ...state.conversationHistory,
      ];
    }
  } else {
    // Subsequent iterations: rebuild messages with CURRENT system prompt
    // This prevents resending old/stale system prompts
    // System prompt is dynamically built based on current error context
    messages = [
      { role: 'system', content: systemPrompt },
      ...state.conversationHistory, // Only user/assistant exchanges
    ];
  }

  const response = await callOpenAICompatibleChat({
    baseUrl,
    provider,
    apiKey,
    model,
    messages,
  });

  // V2: Log raw AI response for debugging
  console.log('\n\n=== CODE AGENT ITERATION #' + iteration + ' - RAW AI RESPONSE ===');
  console.log(response.content || '(empty response)');
  console.log('=== END RAW AI RESPONSE ===\n');

  const parsed = parseAgentResponse(response.content || '');

  // V2: Log parsed response structure for debugging
  console.log('=== PARSED RESPONSE ===');
  console.log('Hidden:', parsed.hidden ? `"${parsed.hidden.substring(0, 100)}${parsed.hidden.length > 100 ? '...' : ''}"` : 'null');
  console.log('Answer:', parsed.answer ? `"${parsed.answer.substring(0, 100)}${parsed.answer.length > 100 ? '...' : ''}"` : 'null');
  console.log('Command:', parsed.command ? `"${parsed.command.substring(0, 100)}${parsed.command.length > 100 ? '...' : ''}"` : 'null');
  console.log('Done:', parsed.done);
  console.log('Todo:', parsed.todo ? 'present' : 'null');
  console.log('Checklist:', parsed.checklist ? 'present' : 'null');
  console.log('Summary:', parsed.summary ? 'present' : 'null');
  console.log('=== END PARSED RESPONSE ===\n\n');

  // Store assistant's response in conversation history
  // V2: Store CLEANED response (no control tags) to prevent tag leaking
  // Only store the answer that user actually sees, not internal tags
  if (parsed.answer || parsed.command) {
    // Build clean response: answer + command reference (no raw tags)
    let cleanResponse = '';
    if (parsed.answer) {
      cleanResponse += parsed.answer;
    }
    if (parsed.command) {
      // Include command in history so AI knows what it ran
      cleanResponse += (cleanResponse ? '\n\n' : '') +
                       `Command executed: ${parsed.command}`;
    }
    if (cleanResponse.trim()) {
      state.conversationHistory.push({
        role: 'assistant',
        content: cleanResponse,
      });
    }
  } else if (response.content) {
    // Fallback: if no parsed answer/command, store raw (for unstructured responses)
    // But still strip all V2 tags to prevent leaking
    const strippedContent = response.content
      .replace(/<hidden>[\s\S]*?<\/hidden>/gi, '')
      .replace(/<cmd>[\s\S]*?<\/cmd>/gi, '')
      .replace(/<answer>[\s\S]*?<\/answer>/gi, '')
      .replace(/<(?:todo|checklist|summary)>[\s\S]*?<\/(?:todo|checklist|summary)>/gi, '')
      .replace(/<!END>/gi, '')
      .trim();

    if (strippedContent) {
      state.conversationHistory.push({
        role: 'assistant',
        content: strippedContent,
      });
    }
  }

  return {
    parsed,
    usage: response.usage,
  };
}

async function executeCommand(state, command, options = {}) {
  const {
    disableTimeout = false,
    timeoutMs = COMMAND_EXECUTION_TIMEOUT_MS,
  } = options;

  if (!command || !command.trim()) {
    return {
      output: '',
      exitCode: 0,
      blocked: false,
      executed: false,
    };
  }

  // V2: DANGEROUS COMMAND DETECTION & BLOCKING
  const warnings = detectDangerousCommand(command);
  const blockedWarnings = warnings.filter(w => w.block);

  if (blockedWarnings.length > 0) {
    // Command is BLOCKED for safety
    const blockMessages = blockedWarnings.map(w =>
      `${w.warning}\n\nSUGGESTION: ${w.suggestion}`
    ).join('\n\n');

    return {
      output: `[COMMAND BLOCKED FOR SAFETY]\n\n${blockMessages}\n\nThis command would hang PowerShell. Please try the suggested alternative.`,
      exitCode: 1,
      blocked: true,
      executed: false,
    };
  }

  // Show warnings for non-blocking patterns
  const nonBlockingWarnings = warnings.filter(w => !w.block);
  if (nonBlockingWarnings.length > 0) {
    const warnMessages = nonBlockingWarnings.map(w =>
      `[WARNING] ${w.warning}\nSUGGESTION: ${w.suggestion}`
    ).join('\n');
    console.log('\n' + warnMessages + '\n');
  }

  // Note: High impact commands are now handled in processCodeRequest
  // This function executes validated commands

  try {
    const terminal = ensurePowerShellSession(state, state.workspacePath);
    const runPromise = terminal.run(command);

    const result = await (disableTimeout || !Number.isFinite(timeoutMs) || timeoutMs <= 0
      ? runPromise
      : new Promise((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            reject(new Error('Command execution timeout'));
          }, timeoutMs);

          runPromise
            .then((value) => {
              clearTimeout(timeoutId);
              resolve(value);
            })
            .catch((error) => {
              clearTimeout(timeoutId);
              reject(error);
            });
        }));

    const combinedOutput = [result.stdout, result.stderr].filter(Boolean).join('\n');
    return {
      output: combinedOutput || 'Command completed with no output.',
      exitCode: typeof result.exitCode === 'number' ? result.exitCode : 0,
      blocked: false,
      executed: true,
    };
  } catch (error) {
    const isTimeout = error?.message === 'Command execution timeout';
    
    if (isTimeout) {
      // Terminal execution failed or timeout - dispose and reset terminal
      try {
        state.terminal?.dispose();
        state.terminal = null;
      } catch (disposeError) {
        log('CODES', 2, 'executeCommand', 'Failed to dispose terminal after timeout', {
          error: disposeError?.message,
        });
      }

      return {
        output: 'Terminal execution failed or timeout, please try again with different command',
        exitCode: 124, // Standard timeout exit code
        blocked: false,
        executed: false,
        isTimeout: true,
      };
    }

    return {
      output: `Failed to execute command: ${error?.message || error}`,
      exitCode: 1,
      blocked: false,
      executed: false,
    };
  }
}

async function processCodeRequest({
  sessionId,
  userPrompt,
  provider,
  model,
  baseUrl,
  apiKey,
  codeId,
  onChunk,
  shouldCancel,
}) {
  const state = getSessionState(sessionId);
  const codeRecord = deps.getCodeById?.(codeId);
  if (codeRecord) {
    state.instruction = codeRecord.instruction || '';
    state.workspacePath = ensureDirectoryExists(codeRecord.workspace_path || codeRecord.workspacePath || '') || state.workspacePath;
  }
  ensurePowerShellSession(state, state.workspacePath || process.cwd());

  const userPromptWithContext = buildUserPrompt({
    userPrompt,
    instruction: state.instruction,
    workspacePath: state.workspacePath,
  });

  const chunks = [];
  let usage = null;
  let lastCommandErrorPattern = null;
  let sameErrorCount = 0;

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
    if (typeof shouldCancel === 'function' && shouldCancel()) {
      log('CODES', 1, 'processCodeRequest', 'Streaming cancelled before iteration', {
        iteration,
        sessionId,
      });
      break;
    }

    const { parsed, usage: iterationUsage } = await runAgentIteration({
      iteration,
      state,
      userPrompt: userPromptWithContext,
      provider,
      model,
      baseUrl,
      apiKey,
    });

    if (typeof shouldCancel === 'function' && shouldCancel()) {
      log('CODES', 1, 'processCodeRequest', 'Streaming cancelled after agent response', {
        iteration,
        sessionId,
      });
      break;
    }

    usage = mergeUsage(usage, iterationUsage);

    // STEP 0: Send todo/checklist if present (for planning & progress tracking)
    const todoChunk = formatTodoChunk(parsed.todo, parsed.checklist, iteration);
    if (todoChunk && typeof onChunk === 'function') {
      try {
        chunks.push(todoChunk);
        onChunk(todoChunk, {
          iteration,
          type: 'todo',
          done: false,
        });
      } catch (error) {
        log('CODES', 2, 'processCodeRequest', 'Failed to deliver todo chunk', {
          error: error?.message || error,
          iteration,
          sessionId,
        });
      }
    }

    // STEP 1: Send response + command BEFORE executing
    // V2: Only show "No response provided" if there's NO answer, NO hidden content, AND NO command
    // If hidden/command exists, answer can be intentionally empty (EXPLORE/EXECUTE states)
    let answerToSend = parsed.answer;
    if (!answerToSend && !parsed.hidden && !parsed.command) {
      answerToSend = 'No response provided.';
    }

    const responseCommandChunk = formatResponseAndCommand({
      answer: answerToSend,
      command: parsed.command,
    });

    if (responseCommandChunk && typeof onChunk === 'function') {
      try {
        chunks.push(responseCommandChunk);
        onChunk(responseCommandChunk, {
          iteration,
          type: 'response-command',
          done: false,
        });
      } catch (error) {
        log('CODES', 2, 'processCodeRequest', 'Failed to deliver response-command chunk', {
          error: error?.message || error,
          iteration,
          sessionId,
        });
      }
    }

    const requiresConfirmation = isHighImpactCommand(parsed.command);
    let confirmationApproved = false;
    // STEP 2: Check if command requires confirmation
    if (requiresConfirmation) {
      // Send confirmation request chunk (no history entry yet)
      const confirmationChunk = JSON.stringify({
        type: 'confirmation-required',
        command: parsed.command,
        iteration,
      }) + '\n';
      
      if (typeof onChunk === 'function') {
        try {
          chunks.push(confirmationChunk);
          onChunk(confirmationChunk, {
            iteration,
            type: 'confirmation-required',
            done: false,
            awaitingConfirmation: true,
          });
        } catch (error) {
          log('CODES', 2, 'processCodeRequest', 'Failed to deliver confirmation chunk', {
            error: error?.message || error,
            iteration,
            sessionId,
          });
        }
      }
      
      // Wait for user confirmation
      const userDecision = await waitForUserConfirmation(sessionId, iteration);
      
      if (!userDecision.allowed) {
        // User skipped - add system message to guide AI
        const skipMessage = userDecision.timedOut
          ? 'Command approval timed out (no response within 15 minutes). Use another approach, or just <!END> and explain the situation to the user.'
          : 'The user skipped this command. Use another approach, or just <!END> and mention to the user what\'s wrong.';
        state.commandHistory.push({
          command: '[SYSTEM - USER SKIPPED]',
          output: skipMessage,
          exitCode: 1,
          summary: userDecision.timedOut ? 'Command approval timed out' : 'User skipped destructive command',
          timestamp: Date.now(),
        });
        
        // Add skip message to conversation history
        state.conversationHistory.push({
          role: 'user',
          content: `[SYSTEM] ${skipMessage}`,
        });
        
        // Send skip notification to UI
        const skipChunk = formatOutput({ 
          output: skipMessage, 
          exitCode: 1, 
          blocked: false 
        });
        if (skipChunk && typeof onChunk === 'function') {
          try {
            chunks.push(skipChunk);
            onChunk(skipChunk, {
              iteration,
              type: 'output',
              done: false,
            });
          } catch (error) {
            log('CODES', 2, 'processCodeRequest', 'Failed to deliver skip chunk', {
              error: error?.message || error,
              iteration,
              sessionId,
            });
          }
        }
        continue; // Go to next iteration with system message
      }

      confirmationApproved = true;
    }
    
    // STEP 3: Execute command
    const { output, exitCode, blocked, isTimeout } = await executeCommand(state, parsed.command, {
      disableTimeout: requiresConfirmation && confirmationApproved,
    });
    // Use AI's summary if provided, otherwise auto-generate
    const entrySummary = parsed.summary || summarizeOutput(output, exitCode);
    const historyEntry = {
      command: parsed.command || '[no command]',
      output,
      exitCode,
      summary: entrySummary,
      timestamp: Date.now(),
    };
    if (parsed.command) {
      state.commandHistory.push(historyEntry);
      if (state.commandHistory.length > MAX_HISTORY * 2) {
        state.commandHistory.splice(0, state.commandHistory.length - MAX_HISTORY * 2);
      }

      // Add command execution result to conversation history as user message
      // This gives the AI feedback about what happened
      // V2: Use SIMPLE format to avoid confusing AI (no markdown code blocks!)
      // Use 'older' mode for truncation (max 10 lines) to keep context concise
      const feedbackMessage = exitCode === 0
        ? `[RESULT] Command successful.\n${truncateOutput(output, 'older')}`
        : `[ERROR] Command failed (exit ${exitCode}).\n${truncateOutput(output, 'older')}`;

      state.conversationHistory.push({
        role: 'user',
        content: feedbackMessage,
      });
    }

    // Detect repeated failure pattern (e.g., same syntax error twice in a row)
    if (exitCode !== 0 && parsed.command && parsed.command.includes('-replace')) {
      const errorPattern = output.substring(0, 100); // First 100 chars of error
      if (errorPattern === lastCommandErrorPattern) {
        sameErrorCount += 1;
        if (sameErrorCount >= 2) {
          log('CODES', 2, 'processCodeRequest', 'Breaking loop: same -replace error repeated twice', {
            iteration,
            errorPattern,
            sameErrorCount,
          });
          // Add message to history so AI knows to try different approach
          const loopBreakerMsg = 'LOOP BREAKER: Same -replace command failed twice. Try a different approach (multi-step instead of single -replace).';
          state.commandHistory.push({
            command: '[SYSTEM]',
            output: loopBreakerMsg,
            exitCode: 1,
            summary: 'Repeated -replace failure - suggest multi-step approach',
            timestamp: Date.now(),
          });
          // Add to conversation history
          state.conversationHistory.push({
            role: 'user',
            content: `[SYSTEM] ${loopBreakerMsg}`,
          });
          break; // Break iteration loop
        }
      } else {
        lastCommandErrorPattern = errorPattern;
        sameErrorCount = 1; // Reset count when error changes
      }
    }

    // STEP 3: Send output AFTER executing (but NOT if timeout - keep error in history for AI only)
    if (!isTimeout) {
      const outputChunk = formatOutput({
        output: truncateOutput(output),
        exitCode,
        blocked,
      });
      
      if (outputChunk && typeof onChunk === 'function') {
        try {
          chunks.push(outputChunk);
          onChunk(outputChunk, {
            iteration,
            type: 'output',
            done: !parsed.command || parsed.done,
          });
        } catch (error) {
          log('CODES', 2, 'processCodeRequest', 'Failed to deliver output chunk', {
            error: error?.message || error,
            iteration,
            sessionId,
          });
        }
      }
    } else {
      // Timeout occurred - error is already in commandHistory, don't send to renderer
      log('CODES', 1, 'processCodeRequest', 'Command execution timeout - error stored in history for AI to read', {
        iteration,
        sessionId,
        command: parsed.command,
      });
      break;
    }

    if (!parsed.command || parsed.done) {
      break;
    }
  }

  return {
    chunks,
    usage,
    cancelled: typeof shouldCancel === 'function' ? !!shouldCancel() : false,
  };
}

function initializeCodeAgent(options = {}) {
  deps = {
    ...deps,
    ...options,
  };
}

function disposeAllCodeSessions() {
  log('CODES', 1, 'disposeAllCodeSessions', 'Disposing all PowerShell sessions', {
    sessionCount: sessionStates.size,
  });
  
  for (const [sessionId, state] of sessionStates.entries()) {
    try {
      if (state.terminal && !state.terminal.isDisposed) {
        state.terminal.dispose();
        log('CODES', 2, 'disposeAllCodeSessions', 'Disposed PowerShell session', { sessionId });
      }
    } catch (error) {
      log('CODES', 4, 'disposeAllCodeSessions', 'Error disposing session', {
        sessionId,
        error: error?.message || error,
      });
    }
  }
  
  sessionStates.clear();
  log('CODES', 1, 'disposeAllCodeSessions', 'All PowerShell sessions disposed');
}

module.exports = {
  initializeCodeAgent,
  processCodeRequest,
  resolveUserConfirmation,
  disposeAllCodeSessions,
};
