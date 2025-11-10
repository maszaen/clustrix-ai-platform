const https = require('https');
const { URL } = require('url');
const fs = require('fs');
const { PowerShellSession } = require('./powershell-session');
const { joinEndpoint } = require('../integration/langchain-helpers');

const MAX_ITERATIONS = 30;
const MAX_HISTORY = 15;
const MAX_OUTPUT_LINES = 100;
const MAX_OUTPUT_LENGTH = 8000;
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const HISTORY_SUMMARY_LENGTH = 160;
const COMMAND_EXECUTION_TIMEOUT_MS = 30 * 1000; // 30 seconds max for command execution

const PROMPT_FIRST = `You are a PowerShell-based coding assistant helping user fix bugs in code files or any problem.

⚠️ CRITICAL: You have MEMORY! Read the COMMAND HISTORY below carefully. You've already executed commands and seen their output.
DO NOT repeat what you've already done. Build on previous work. Use context from earlier commands.

=== ORIGINAL USER REQUEST ===
{user_prompt}

=== COMMAND HISTORY ===
{command_history}

=== LAST COMMAND ===
Command: {last_command}
Output: 
{last_output}

💡 CONTEXT AWARENESS:
- If you already listed files → You know what files exist
- If you already read a file → You know its content
- If you already ran code → You know the output
- DON'T repeat commands unless the output was unclear or you need to verify a change

=== POWERSHELL COMMAND ARSENAL ===
You have full access to PowerShell commands. Here are some useful patterns (but feel free to use ANY PowerShell command):

**File Navigation & Exploration:**
- Get-ChildItem / ls / dir - list files/folders
- Get-Content <file> - read entire file
- Get-Content <file> -Head 20 - read first N lines
- Get-Content <file> -Tail 20 - read last N lines
- Get-Content <file> | Select-Object -First 50 -Skip 100 - read specific line range
- Test-Path <path> - check if file/folder exists
- Get-Location / pwd - show current directory

**Search & Pattern Matching:**
- Select-String "pattern" <file> - search in file (like grep)
- Select-String "pattern" <file> -Context 2,2 - show 2 lines before/after match
- Get-ChildItem -Recurse -Filter "*.js" - find files by pattern
- Get-Content <file> | Select-String "pattern" -AllMatches
- (Get-Content <file>).Count - count total lines

**File Editing:**
- (Get-Content <file>) -replace "old", "new" | Set-Content <file> - replace text
- (Get-Content <file>) | Where-Object {$_ -notmatch "pattern"} | Set-Content <file> - remove lines
- $content = Get-Content <file>; $content[10] = "new line"; $content | Set-Content <file> - edit specific line
- Add-Content <file> "new line" - append to file
- Set-Content <file> "content" - overwrite entire file
- $lines = Get-Content <file>; $lines[5..10] - extract line range

**Code Execution:**
- python <file>.py - run Python script
- node <file>.js - run Node.js script
- npm test - run tests
- python -m pytest - run pytest

**Smart Debugging:**
- python -c "import ast; ast.parse(open('file.py').read())" - validate Python syntax
- node --check <file>.js - validate JS syntax
- Get-Content <file> | Select-String "TODO|FIXME|BUG" - find code comments

**Multi-line Commands (use semicolons or newlines):**
- $var = Get-Content file.txt; $var -replace "old","new" | Set-Content file.txt
- Multiple commands in sequence are totally fine!

**IMPORTANT - Multi-line String Replacement Rules:**
⚠️  AVOID complex -replace patterns with multi-line content or special chars - they often fail!
Instead:
- For multi-line changes: Read file → Store in variable → Modify → Write back (3-4 steps)
- For simple replacements: Use (Get-Content) -replace "simple","pattern" on single lines only
- For code blocks: Use @' '@  here-strings or manually construct the content
Example that WORKS:
  $content = Get-Content "file.py"
  $content = $content -replace "def old_func", "def new_func"
  $content | Set-Content "file.py"
Example that FAILS (avoid!):
  (Get-Content file.py) -replace "def func():..." (multi-line regex) 
If replacement fails first time, DON'T RETRY - use a different approach!

=== THINKING APPROACH ===
Before each action, ask yourself:
1. **Understanding**: Do I fully understand the problem from the output?
2. **Context**: Do I have enough context about the code structure?
3. **Strategy**: What's the most efficient way to fix this?
4. **Verification**: How will I verify the fix works?

Then decide:
- **Need info?** → Use search, grep, file reading, listing
- **Ready to fix?** → Use replace, edit, or multi-step modifications
- **Need to verify?** → Run the code/tests
- **Stuck?** → Ask User for clarification
- **Done?** → Summarize and add <!END>

=== CORE PRINCIPLES ===
1. **Be Creative**: Use ANY PowerShell command that helps - don't limit yourself to basic commands
2. **Be Precise**: When editing, understand the exact location and context
3. **Be Efficient**: Combine commands when it makes sense (e.g., read + filter + count)
4. **Be Adaptive**: If one approach fails, try a different command/strategy
5. **Think First**: Analyze command output before rushing to next action
6. **One Command Rule**: Don't repeat the exact same command - if it failed, modify your approach
7. **Only PowerShell**: <cmd> tag MUST contain only valid PowerShell commands, never natural language

=== WORKFLOW PATTERNS ===

**Pattern 1: Explore → Understand → Fix → Verify**
First run: ls → find relevant files
Next: Get-Content → see the code
Then: fix with replace/edit
Finally: run to verify

**Pattern 2: Search-Driven Fixing**
First: Select-String to find all occurrences
Context: Get lines around matches
Fix: Targeted replacements
Verify: Search again to confirm

**Pattern 3: Multi-Step Edits**
Read file into variable → modify → write back
Useful for complex transformations

=== RESPONSE FORMAT ===
Always respond in this exact format:

**First Response (iteration 0): Start solving**
Option A: Simple problem → just <answer> + <cmd>
Option B: Complex problem (3+ steps) → create <todo> first, then <answer>

IF creating task plan (complex problems only):
<todo>
- [ ] Step 1
- [ ] Step 2
- [ ] Step 3
</todo>

<answer>
Brief explanation of your plan or approach
</answer>

<cmd>
PowerShell command for first step (optional)
</cmd>

IF no plan needed (simple or single-step):
<answer>
Brief explanation and action
</answer>

<cmd>
PowerShell command (optional)
</cmd>

**Subsequent Responses (iteration 1+): Continue solving**
IF you created <todo> before → update checklist:
<checklist>
- [x] Completed steps
- [ ] Next steps
</checklist>

<answer>
What you found + what's next
</answer>

<cmd>
PowerShell command for next action (optional)
</cmd>

IF no <todo> before → just respond normally:
<answer>
What you found + what's next
</answer>

<cmd>
PowerShell command (optional)
</cmd>

=== TODO/CHECKLIST GUIDELINES ===
1. **Create <todo> only if** → problem needs 3+ steps OR complex multi-file changes
2. **Don't create <todo> if** → simple problem, single command fixes, or quick verification
3. **Be selective** → Not every problem needs planning. Use judgment!
4. **Track Progress** → If you created <todo>, update <checklist> each iteration
5. **Stay Focused** → Max 5-7 items in todo, don't expand scope
6. **Done Signal** → When all [x] complete → add <!END>

**Important**: 
- If just answering a question (no file operations needed) → only use <answer>, no <cmd>
- If you're done fixing → add <!END> after your tags
- Never put explanations/questions inside <cmd> - only valid PowerShell commands!`;

const PROMPT_SUBSEQUENT = `You are a PowerShell-based coding assistant helping user fix bugs in code files or any problem.

CRITICAL: You have MEMORY! Read the COMMAND HISTORY below carefully. You've already executed commands and seen their output.
DO NOT repeat what you've already done. Build on previous work. Use context from earlier commands.

=== ORIGINAL USER REQUEST ===
{user_prompt}

=== COMMAND HISTORY ===
{command_history}

=== LAST COMMAND ===
Command: {last_command}
Output: 
{last_output}

=== POWERSHELL COMMAND ARSENAL ===
You have full access to PowerShell commands. Common patterns:

**File Navigation & Exploration:**
- Get-ChildItem / ls / dir - list files/folders
- Get-Content <file> (-Head N / -Tail N / | Select-Object -First N -Skip M)
- Test-Path, Get-Location

**Search & Pattern Matching:**
- Select-String "pattern" <file> (-Context X,Y for surrounding lines)
- Get-ChildItem -Recurse -Filter "*.ext"
- (Get-Content <file>).Count

**File Editing (be creative!):**
- (Get-Content <file>) -replace "old", "new" | Set-Content <file>
- (Get-Content <file>) | Where-Object {$_ -notmatch "pattern"} | Set-Content <file>
- $content = Get-Content <file>; $content[10] = "new"; $content | Set-Content <file>
- Multi-line edits with variables

**Code Execution:**
- python <file>.py, node <file>.js, npm test, pytest

**Smart Debugging:**
- python -c "import ast; ast.parse(...)" - syntax check
- node --check <file> - JS validation
- Select-String for TODO/FIXME/BUG comments

=== STRATEGIC THINKING ===
Analyze the last output carefully:
1. **What did I learn?** - Extract key information from command output
2. **What's next?** - Determine if I need more info, ready to fix, or need verification
3. **Alternative approach?** - If stuck, what's a different way to tackle this?
4. **Progress check?** - Am I moving forward or repeating myself?

Decision paths:
- **Need more context** → Search, read files, check structure
- **Ready to fix** → Apply edits (replace, modify lines, multi-step)
- **Need verification** → Run code/tests
- **Task complete** → Summarize + <!END>
- **Uncertain** → Ask User

=== CORE PRINCIPLES ===
1. **Creativity First**: Use ANY PowerShell command - don't be rigid
2. **Context Awareness**: Always consider the full picture before acting
3. **Adaptive Strategy**: Failed command? Try a different approach immediately
4. **No Repetition**: Never run the exact same command twice
5. **Precision in Edits**: Know exactly what you're changing and why
6. **Verify Critical Changes**: Run code after important fixes
7. **Only PowerShell**: <cmd> must contain valid PowerShell only, no explanations

=== PROBLEM-SOLVING WORKFLOW ===

**For Bug Fixes:**
1. Search/grep to locate issue → 2. Read context → 3. Fix precisely → 4. Verify if critical

**For Code Exploration:**
1. List directory → 2. Identify relevant files → 3. Read selectively → 4. Summarize findings

**For Multi-file Changes:**
1. Find all affected files → 2. Fix one by one → 3. Track what's done → 4. Final verification

**When Stuck:**
- Try a different search pattern
- Read more context
- Break problem into smaller steps
- Ask User for clarification

=== RESPONSE FORMAT ===
Always use this exact structure:

**IF you created <todo> in first response → update checklist:**
<checklist>
- [x] Completed items
- [ ] Next item to do
</checklist>

<answer>
What you found + what you'll do next (brief, Indonesian)
</answer>

<cmd>
PowerShell command for next step (optional)
</cmd>

**IF no <todo> was created → just respond normally:**
<answer>
What you found + what you'll do next (brief, Indonesian)
</answer>

<cmd>
PowerShell command (optional)
</cmd>

=== CHECKLIST RULES FOR ITERATIONS ===
1. **Only if you created <todo>** → update <checklist> each iteration
2. **Mark items done** → Change [x] when truly complete
3. **No new items** → Stay focused on original plan
4. **If stuck** → Ask User, try different approach, don't expand scope
5. **Done Signal** → When all [x] complete → add <!END>

**Stop Signal:**
When all tasks complete, or you need clarification → add <!END> at the end

**Remember**: Use <todo>/<checklist> only when needed, keep it simple!`;

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
    // Store resolve function to be called when user responds
    confirmationPromises.set(key, resolve);
    
    // Timeout after 5 minutes - auto deny
    setTimeout(() => {
      if (confirmationPromises.has(key)) {
        confirmationPromises.delete(key);
        resolve({ allowed: false });
      }
    }, 5 * 60 * 1000);
  });
}

function resolveUserConfirmation(sessionId, iteration, allowed) {
  const key = `${sessionId}-${iteration}`;
  const resolve = confirmationPromises.get(key);
  
  if (resolve) {
    confirmationPromises.delete(key);
    resolve({ allowed });
    return true;
  }
  
  return false;
}

function truncateOutput(output) {
  if (!output) return '';
  const lines = output.split(/\r?\n/).slice(0, MAX_OUTPUT_LINES);
  let joined = lines.join('\n');
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
  
  // Older commands: show summary only
  if (olderHistory.length > 0) {
    parts.push('=== OLDER COMMANDS (summary) ===');
    parts.push(olderHistory.map((entry, index) => {
      const idx = history.length - recentHistory.length + index + 1;
      return `#${idx} ${entry.command} → ${entry.summary}`;
    }).join('\n'));
  }
  
  // Recent 3 commands: show FULL output for better context
  if (recentThree.length > 0) {
    parts.push('\n=== RECENT COMMANDS (full output) ===');
    recentThree.forEach((entry, index) => {
      const idx = history.length - recentThree.length + index + 1;
      const output = truncateOutput(entry.output || 'No output');
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

function renderSystemPrompt(template, { userPrompt, commandHistory, lastCommand }) {
  return template
    .replace('{user_prompt}', userPrompt)
    .replace('{command_history}', commandHistory)
    .replace('{last_command}', lastCommand.command)
    .replace('{last_output}', lastCommand.output);
}

function parseAgentResponse(text = '') {
  const answerMatch = text.match(/<answer>([\s\S]*?)<\/answer>/i);
  const cmdMatch = text.match(/<cmd>([\s\S]*?)<\/cmd>/i);
  const done = /<!END>/i.test(text);
  const todoMatch = text.match(/<todo>([\s\S]*?)<\/todo>/i);
  const checklistMatch = text.match(/<checklist>([\s\S]*?)<\/checklist>/i);

  // Clean answer by removing <!END> tag if it appears inside
  let cleanAnswer = answerMatch ? answerMatch[1].trim() : '';
  if (cleanAnswer) {
    cleanAnswer = cleanAnswer.replace(/<!END>/gi, '').trim();
  }

  return {
    answer: cleanAnswer,
    command: cmdMatch ? cmdMatch[1].trim() : '',
    done,
    todo: todoMatch ? todoMatch[1].trim() : null,
    checklist: checklistMatch ? checklistMatch[1].trim() : null,
  };
}

function isHighImpactCommand(command = '') {
  const lowered = command.toLowerCase();
  const dangerousPatterns = [
    'remove-item',
    'rm ',
    ' rmdir',
    'del ',
    'format-',
    'clear-content',
    'truncate',
    'format-volume',
    'mkfs',
    'new-partition',
  ];
  return dangerousPatterns.some(pattern => lowered.includes(pattern));
}

function formatIterationOutput({ answer, command, output, exitCode, blocked }) {
  // Return structured object instead of combined string
  // This allows separate delivery of response+command vs output
  return {
    answer: answer || null,
    command: command || null,
    output: output || null,
    exitCode,
    blocked: !!blocked,
  };
}

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
  const systemPrompt = renderSystemPrompt(selectPromptTemplate(iteration), {
    userPrompt,
    commandHistory: commandHistoryText,
    lastCommand,
  });

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  const response = await callOpenAICompatibleChat({
    baseUrl,
    provider,
    apiKey,
    model,
    messages,
  });

  const parsed = parseAgentResponse(response.content || '');
  return {
    parsed,
    usage: response.usage,
  };
}

async function executeCommand(state, command) {
  if (!command || !command.trim()) {
    return {
      output: '',
      exitCode: 0,
      blocked: false,
      executed: false,
    };
  }

  // Note: High impact commands are now handled in processCodeRequest
  // This function just executes what's given

  try {
    const terminal = ensurePowerShellSession(state, state.workspacePath);
    
    // Create timeout promise
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error('Command execution timeout'));
      }, COMMAND_EXECUTION_TIMEOUT_MS);
    });

    // Race between command execution and timeout
    const result = await Promise.race([
      terminal.run(command),
      timeoutPromise,
    ]);

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
    const responseCommandChunk = formatResponseAndCommand({
      answer: parsed.answer || 'No response provided.',
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

    // STEP 2: Check if command requires confirmation
    if (isHighImpactCommand(parsed.command)) {
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
        const skipMessage = 'The user is skipping this command. Use another approach, or just <!END> and mention to the user what\'s wrong.';
        state.commandHistory.push({
          command: '[SYSTEM - USER SKIPPED]',
          output: skipMessage,
          exitCode: 1,
          summary: 'User skipped destructive command',
          timestamp: Date.now(),
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
    }
    
    // STEP 3: Execute command
    const { output, exitCode, blocked, isTimeout } = await executeCommand(state, parsed.command);
    const historyEntry = {
      command: parsed.command || '[no command]',
      output,
      exitCode,
      summary: summarizeOutput(output, exitCode),
      timestamp: Date.now(),
    };
    if (parsed.command) {
      state.commandHistory.push(historyEntry);
      if (state.commandHistory.length > MAX_HISTORY * 2) {
        state.commandHistory.splice(0, state.commandHistory.length - MAX_HISTORY * 2);
      }
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
          state.commandHistory.push({
            command: '[SYSTEM]',
            output: 'LOOP BREAKER: Same -replace command failed twice. Try a different approach (multi-step instead of single -replace).',
            exitCode: 1,
            summary: 'Repeated -replace failure - suggest multi-step approach',
            timestamp: Date.now(),
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

module.exports = {
  initializeCodeAgent,
  processCodeRequest,
  resolveUserConfirmation,
};
