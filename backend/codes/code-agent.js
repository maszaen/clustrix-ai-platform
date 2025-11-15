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
const {
  hasSetTags,
  wrapSetCommand,
  parseSetCommandOutput,
} = require('./set-command-integration');
const MAX_ITERATIONS = 30;
const MAX_HISTORY = 15;
const MAX_OUTPUT_LINES = 100;
const MAX_OUTPUT_LENGTH = 8000;
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const HISTORY_SUMMARY_LENGTH = 160;
const COMMAND_EXECUTION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes max for command execution
const COMMAND_APPROVAL_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes for user approval window

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
      conversationHistory: [], // Iteration history within current request
      terminal: null,
      lastUsed: Date.now(),
      iterationCount: 0,
      workspacePath: null,
      instruction: '',
      // Memory system: cumulative file view
      memories: {
        default: {
          visible: true,
          files: {} // { 'path/to/file.js': { ranges: [{ start, end, lines: [...] }] } }
        }
      },
      activeMemoryNames: ['default'], // Visible memories
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

// ============================================================================
// MEMORY SYSTEM: Cumulative file view management
// ============================================================================

function addToMemory(state, filePath, startLine, endLine, lines, memoryName = 'default') {
  if (!state.memories[memoryName]) {
    state.memories[memoryName] = { visible: true, files: {} };
  }

  const memory = state.memories[memoryName];
  if (!memory.files[filePath]) {
    memory.files[filePath] = { ranges: [] };
  }

  const fileMemory = memory.files[filePath];
  const newRange = { start: startLine, end: endLine, lines };

  // Merge overlapping or adjacent ranges
  const merged = [];
  let currentRange = newRange;

  for (const existing of fileMemory.ranges) {
    if (currentRange.end < existing.start - 1) {
      // No overlap, current comes before
      merged.push(currentRange);
      currentRange = existing;
    } else if (currentRange.start > existing.end + 1) {
      // No overlap, existing comes before
      merged.push(existing);
    } else {
      // Overlap or adjacent - merge
      const mergedStart = Math.min(currentRange.start, existing.start);
      const mergedEnd = Math.max(currentRange.end, existing.end);
      const mergedLines = [];

      // Combine lines from both ranges
      for (let i = mergedStart; i <= mergedEnd; i++) {
        const fromCurrent = currentRange.lines[i - currentRange.start];
        const fromExisting = existing.lines[i - existing.start];
        mergedLines.push(fromCurrent !== undefined ? fromCurrent : fromExisting);
      }

      currentRange = { start: mergedStart, end: mergedEnd, lines: mergedLines };
    }
  }

  merged.push(currentRange);
  merged.sort((a, b) => a.start - b.start);
  fileMemory.ranges = merged;
}

function formatMemoryOutput(state) {
  const output = [];
  const visibleMemories = state.activeMemoryNames || ['default'];
  const hiddenMemories = [];

  for (const [memName, memory] of Object.entries(state.memories || {})) {
    if (visibleMemories.includes(memName)) {
      output.push(`=== MEMORY STATE: ${memName} ===\n`);

      for (const [filePath, fileData] of Object.entries(memory.files || {})) {
        output.push(`/${filePath}`);

        for (const range of fileData.ranges) {
          for (let i = 0; i < range.lines.length; i++) {
            const lineNum = range.start + i;
            output.push(`${lineNum}: ${range.lines[i]}`);
          }

          // Show gap indicator if there's a next range
          const currentIndex = fileData.ranges.indexOf(range);
          const nextRange = fileData.ranges[currentIndex + 1];
          if (nextRange && nextRange.start > range.end + 1) {
            output.push(`[Lines ${range.end + 1}-${nextRange.start - 1} not explored]`);
          }
        }

        // Add end-of-file marker after last range
        if (fileData.ranges.length > 0) {
          const lastRange = fileData.ranges[fileData.ranges.length - 1];
          output.push(`[End of file at line ${lastRange.end}]`);
        }

        output.push(''); // Empty line between files
      }
    } else {
      hiddenMemories.push(memName);
    }
  }

  if (hiddenMemories.length > 0) {
    output.push(`[Hidden memories: ${hiddenMemories.join(', ')}]`);
  }

  return output.join('\n');
}

function hideMemory(state, memoryNames) {
  state.activeMemoryNames = state.activeMemoryNames.filter(
    name => !memoryNames.includes(name)
  );
}

function useMemory(state, memoryNames) {
  for (const name of memoryNames) {
    if (state.memories[name] && !state.activeMemoryNames.includes(name)) {
      state.activeMemoryNames.push(name);
    }
  }
}

function clearMemory(state, memoryNames) {
  for (const name of memoryNames) {
    if (name === '--all') {
      state.memories = { default: { visible: true, files: {} } };
      state.activeMemoryNames = ['default'];
      return;
    }
    delete state.memories[name];
    state.activeMemoryNames = state.activeMemoryNames.filter(n => n !== name);
  }
}

function captureFileOutput(state, command, output, memoryName) {
  // Parse Show-FileWithLineNumbers output
  // Format: "001: line content"
  const showFileMatch = command.match(/Show-FileWithLineNumbers\s+-Path\s+"?([^"\s]+)"?/i);
  if (showFileMatch) {
    const filePath = showFileMatch[1].replace(/\\/g, '/');
    const lines = output.split(/\r?\n/);
    const parsedLines = [];
    let minLine = Infinity;
    let maxLine = -Infinity;

    for (const line of lines) {
      const match = line.match(/^(\d+):\s*(.*)$/);
      if (match) {
        const lineNum = parseInt(match[1], 10);
        parsedLines[lineNum] = match[2];
        minLine = Math.min(minLine, lineNum);
        maxLine = Math.max(maxLine, lineNum);
      }
    }

    if (parsedLines.length > 0) {
      const actualLines = [];
      for (let i = minLine; i <= maxLine; i++) {
        actualLines.push(parsedLines[i] || '');
      }
      addToMemory(state, filePath, minLine, maxLine, actualLines, memoryName);
      return true;
    }
    return false;
  }

  // Parse Search-InFiles / ripgrep output
  // Format: "path/to/file.js:123: content"
  const searchMatch = command.match(/Search-InFiles|rg\s/i);
  if (searchMatch) {
    const lines = output.split(/\r?\n/);
    const fileMatches = {};

    for (const line of lines) {
      const match = line.match(/^([^:]+):(\d+):\s*(.*)$/);
      if (match) {
        const filePath = match[1].replace(/\\/g, '/');
        const lineNum = parseInt(match[2], 10);
        const content = match[3];

        if (!fileMatches[filePath]) {
          fileMatches[filePath] = [];
        }
        fileMatches[filePath].push({ lineNum, content });
      }
    }

    // Save each file's matches to memory
    for (const [filePath, matches] of Object.entries(fileMatches)) {
      const minLine = Math.min(...matches.map(m => m.lineNum));
      const maxLine = Math.max(...matches.map(m => m.lineNum));
      const lines = [];

      for (let i = minLine; i <= maxLine; i++) {
        const match = matches.find(m => m.lineNum === i);
        lines.push(match ? match.content : '');
      }

      addToMemory(state, filePath, minLine, maxLine, lines, memoryName);
    }

    return Object.keys(fileMatches).length > 0;
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

    // Detect hashtable syntax errors (inline comments in Set-MultipleLines)
    if (
      exitCode !== 0 &&
      command.includes('Set-MultipleLines') &&
      (output.includes('hash literal was incomplete') ||
        output.includes('Unexpected token') ||
        output.includes('Missing closing'))
    ) {
      errorType = 'hashtable_syntax';
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

function renderSystemPrompt(template, { userPrompt, commandHistory, lastCommand, iteration = 0, previousMessagesHistory = '' }) {
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

  // Inject previous messages history before current user prompt
  const fullContext = previousMessagesHistory
    ? `${previousMessagesHistory}\n=== CURRENT USER PROMPT ===\n{user_prompt}`
    : '{user_prompt}';

  return template
    .replace('{user_prompt}', fullContext)
    .replace('{command_history}', commandHistory)
    .replace('{last_command}', lastCommand.command)
    .replace('{last_output}', lastCommand.output)
    .replace('{summary_reminder}', summaryReminder)
    .replace('{common_command}', finalSystemPrompt)
    .replace('{user_prompt}', userPrompt); // Replace the placeholder with actual user prompt
}

function parseAgentResponse(text = '') {
  const hiddenMatch = text.match(/<hidden>([\s\S]*?)<\/hidden>/i);
  const answerMatch = text.match(/<answer>([\s\S]*?)<\/answer>/i);
  const cmdMatch = text.match(/<cmd>([\s\S]*?)<\/cmd>/i);
  let done = /<!END>/i.test(text);
  const todoMatch = text.match(/<todo>([\s\S]*?)<\/todo>/i);
  const checklistMatch = text.match(/<checklist>([\s\S]*?)<\/checklist>/i);
  const summaryMatch = text.match(/<summary>([\s\S]*?)<\/summary>/i);

  // Detect malformed responses: AI outputting "Command executed: X" without tags
  // This happens when AI forgets to use <cmd> tags
  let extractedCommand = '';
  if (!cmdMatch && text.trim().startsWith('Command executed:')) {
    // Try to extract command from plain text
    const commandMatch = text.match(/^Command executed:\s*(.+?)(?:\n|$)/i);
    if (commandMatch) {
      extractedCommand = commandMatch[1].trim();
      log('CODES', 2, 'parseAgentResponse', 'Malformed response: AI output plain "Command executed:" without <cmd> tags', {
        extractedCommand: extractedCommand.substring(0, 100),
      });
      // This is malformed, but we'll treat it as done since there's no actual <cmd> tag
      done = true;
    }
  }

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

  // V2: If no <answer> tag found, check if other structured tags exist
  // Only use fallback if NO structured tags at all (unformatted response)
  if (!answerMatch && text.trim()) {
    if (!hiddenMatch && !cmdMatch) {
      // No structured tags at all - check if it's malformed "Command executed:" text
      if (extractedCommand) {
        // Don't put the malformed command text in answer
        cleanAnswer = '';
      } else {
        // Truly unformatted response - fallback to entire text
        cleanAnswer = text.replace(/<[^>]*>/g, '').trim();
      }
    }
    // else: has hidden/cmd tag but no answer tag = intentional (EXPLORE/READ/EXECUTE state)
    // answer should remain empty - hidden/cmd content is for specific purposes
  }

  const command = cmdMatch ? cmdMatch[1].trim() : '';

  // Auto-detect done: if no command and no answer and no hidden, we're done
  if (!command && !cleanAnswer && !hiddenMatch && !done) {
    log('CODES', 2, 'parseAgentResponse', 'Auto-detected done: no command, no answer, no hidden content');
    done = true;
  }

  return {
    hidden: hiddenMatch ? hiddenMatch[1].trim() : null, // V2: Internal AI thinking
    answer: cleanAnswer,
    command,
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

function formatResponseAndCommand({ answer, command, hidden }) {
  const sections = [];
  
  // 1. Format hidden as codeblock with '>' prefix
  if (hidden) {
    const hiddenLines = hidden
      .split('\n')
      .map(line => `> ${line}`)
      .join('\n');
    sections.push('\n' + hiddenLines + '\n');
  }
  
  // 2. Add answer (already handled)
  if (answer) {
    const cleanedAnswer = answer
      .replace(/^```[\w]*\n?/, '') 
      .replace(/\n?```$/, '');  
    sections.push(cleanedAnswer);
  }
  
  // 3. Add command (already handled)
  if (command) {
    sections.push('```powershell\n' + command.trim() + '\n```');
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
  db,
  sessionId,
}) {
  const commandHistoryText = formatCommandHistory(state.commandHistory);
  const lastCommand = getLastCommand(state.commandHistory);

  // Load previous message iterations from database and format into system prompt
  let previousMessagesHistory = '';
  if (db && sessionId) {
    try {
      const dbMessages = db.getMessages?.(sessionId) || [];

      // Get last 3 user messages (max)
      const userMessages = dbMessages.filter(m => m.role === 'user').slice(-3);

      if (userMessages.length > 0) {
        const historyParts = [];

        for (let i = 0; i < userMessages.length; i++) {
          const msgIndex = userMessages[i].message_index;
          const msgContent = userMessages[i].content;

          // Load iterations for this message
          const iterations = db.getCodeIterations?.(sessionId, msgIndex) || [];

          if (iterations.length > 0) {
            historyParts.push(`\nPREVIOUS USER PROMPT (message ${msgIndex}):`);
            historyParts.push(msgContent);
            historyParts.push('\n=== COMMAND HISTORY (MESSAGE ' + msgIndex + ') ===');

            iterations.forEach((iter, idx) => {
              const cmd = iter.command || '[no command]';
              const output = iter.output || 'No output';
              const exitCode = iter.exit_code ?? 0;
              historyParts.push(`#${idx + 1} ${cmd}`);
              historyParts.push(`Output:\n${output}`);
              historyParts.push(`Exit Code: ${exitCode}\n`);
            });
          }
        }

        if (historyParts.length > 0) {
          previousMessagesHistory = historyParts.join('\n') + '\n';
        }
      }
    } catch (error) {
      log('CODES', 3, 'runAgentIteration', 'Failed to load previous iterations', {
        sessionId,
        error: error?.message || error,
      });
    }
  }

  // Pass iteration for dynamic command reference injection
  const systemPrompt = renderSystemPrompt(selectPromptTemplate(iteration), {
    userPrompt,
    commandHistory: commandHistoryText,
    lastCommand,
    iteration,
    previousMessagesHistory,
  });

  // Debug: Log processed prompt for each iteration
  console.log('\n\n=== CODE AGENT ITERATION #' + iteration + ' - SYSTEM PROMPT ===');
  console.log(systemPrompt);
  console.log('=== END SYSTEM PROMPT ===\n\n');

  // Build messages array - OPTIMIZED for token efficiency
  let messages;

  if (iteration === 0) {
    // First iteration OF THIS REQUEST
    // Previous iterations loaded into system prompt, not message bodies
    messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }, // Current request
    ];

    // Reset iteration history for this new request
    state.conversationHistory = [
      { role: 'user', content: userPrompt },
    ];
  } else {
    // Subsequent iterations: rebuild messages with CURRENT system prompt
    // Include: system + conversationHistory (current request iterations)
    messages = [
      { role: 'system', content: systemPrompt },
      ...state.conversationHistory, // Current request's iteration history
    ];
  }

  const response = await callOpenAICompatibleChat({
    baseUrl,
    provider,
    apiKey,
    model,
    messages,
  });

  // V2: Log messages sent to LLM for debugging conversation history
  console.log('\n\n=== MESSAGES SENT TO LLM (Iteration #' + iteration + ') ===');
  console.log('Total messages:', messages.length);
  messages.forEach((msg, idx) => {
    const preview = msg.content.substring(0, 150).replace(/\n/g, ' ');
    console.log(`[${idx}] ${msg.role}: ${preview}${msg.content.length > 150 ? '...' : ''}`);
  });
  console.log('=== END MESSAGES ===\n');

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
  // DON'T add "Command executed: X" - it makes AI mimic that format
  if (parsed.answer && parsed.answer.trim()) {
    state.conversationHistory.push({
      role: 'assistant',
      content: parsed.answer,
    });
  } else if (!parsed.answer && !parsed.command && response.content) {
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

function parseMemoryCommand(command) {
  const trimmed = command.trim();

  // Hide memory <name1> <name2>
  const hideMatch = trimmed.match(/^hide\s+memory\s+(.+)$/i);
  if (hideMatch) {
    return { type: 'hide', names: hideMatch[1].split(/\s+/) };
  }

  // Use memory <name1> <name2>
  const useMatch = trimmed.match(/^use\s+memory\s+(.+)$/i);
  if (useMatch) {
    return { type: 'use', names: useMatch[1].split(/\s+/) };
  }

  // Clear memory <name1> <name2>
  const clearMatch = trimmed.match(/^clear\s+memory\s+(.+)$/i);
  if (clearMatch) {
    return { type: 'clear', names: clearMatch[1].split(/\s+/) };
  }

  // Command | Save memory <name>
  const saveMatch = trimmed.match(/^(.+?)\s*\|\s*save\s+memory\s+(\S+)$/i);
  if (saveMatch) {
    return { type: 'save', name: saveMatch[2], actualCommand: saveMatch[1].trim() };
  }

  return null;
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

  // Handle memory management commands
  const memoryCmd = parseMemoryCommand(command);
  if (memoryCmd) {
    if (memoryCmd.type === 'hide') {
      hideMemory(state, memoryCmd.names);
      return {
        output: formatMemoryOutput(state),
        exitCode: 0,
        blocked: false,
        executed: true,
        isMemoryCommand: true,
      };
    }
    if (memoryCmd.type === 'use') {
      useMemory(state, memoryCmd.names);
      return {
        output: formatMemoryOutput(state),
        exitCode: 0,
        blocked: false,
        executed: true,
        isMemoryCommand: true,
      };
    }
    if (memoryCmd.type === 'clear') {
      clearMemory(state, memoryCmd.names);
      return {
        output: formatMemoryOutput(state),
        exitCode: 0,
        blocked: false,
        executed: true,
        isMemoryCommand: true,
      };
    }
    if (memoryCmd.type === 'save') {
      // Execute actual command but save to named memory
      command = memoryCmd.actualCommand;
      options.saveToMemory = memoryCmd.name;
    }
  }

  // V3: DETECT AND ROUTE <set> TAG COMMANDS
  if (hasSetTags(command)) {
    log('CODES', 1, 'executeCommand', 'Detected <set> tag command, routing to Invoke-SetCommand');

    try {
      const terminal = ensurePowerShellSession(state, state.workspacePath);
      const psCommand = wrapSetCommand(command);

      const result = await terminal.run(psCommand);
      const combinedOutput = [result.stdout, result.stderr].filter(Boolean).join('\n');
      const parsed = parseSetCommandOutput(combinedOutput);

      log('CODES', 1, 'executeCommand', '<set> command executed', {
        success: parsed.success,
        operations: parsed.operations.length,
        diffs: parsed.diffs.length,
      });

      // Update memory state after successful file edit
      // The output already includes memory state, so we don't need to capture separately
      return {
        output: combinedOutput,
        exitCode: parsed.success ? 0 : 1,
        blocked: false,
        executed: true,
        isSetCommand: true,
        setResult: parsed,
      };
    } catch (error) {
      log('CODES', 3, 'executeCommand', 'Failed to execute <set> command', {
        error: error?.message || error,
      });
      return {
        output: `Failed to execute <set> command: ${error?.message || error}`,
        exitCode: 1,
        blocked: false,
        executed: false,
      };
    }
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
    const exitCode = typeof result.exitCode === 'number' ? result.exitCode : 0;

    // Capture file read output and save to memory
    let capturedToMemory = false;
    if (exitCode === 0 && combinedOutput) {
      const memoryName = options.saveToMemory || 'default';
      capturedToMemory = captureFileOutput(state, command, combinedOutput, memoryName);
    }

    // Return memory state if captured, otherwise return raw output
    const output = capturedToMemory
      ? formatMemoryOutput(state)
      : (combinedOutput || 'Command completed with no output.');

    return {
      output,
      exitCode,
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
  db, // Database manager for loading chat history
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

  // Get current message index for this request
  const existingMessages = db?.getMessages?.(sessionId) || [];
  const currentMessageIndex = existingMessages.length;

  const chunks = [];
  let usage = null;
  let lastCommandErrorPattern = null;
  let sameErrorCount = 0;
  let finalAnswer = null; // Track final answer to save to messages table

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
      db,
      sessionId,
    });

    if (typeof shouldCancel === 'function' && shouldCancel()) {
      log('CODES', 1, 'processCodeRequest', 'Streaming cancelled after agent response', {
        iteration,
        sessionId,
      });
      break;
    }

    usage = mergeUsage(usage, iterationUsage);

    // Track final answer if this is meaningful content (not just command)
    if (parsed.answer && parsed.answer.trim() && parsed.done) {
      finalAnswer = parsed.answer.trim();
    }

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

    // Add assistant's decision to conversation history to prevent looping
    // This gives the model context about what commands were already tried
    const assistantMessage = [];
    if (parsed.hidden) {
      assistantMessage.push(`[Internal reasoning: ${parsed.hidden.substring(0, 200)}...]`);
    }
    if (parsed.answer) {
      assistantMessage.push(parsed.answer);
    }
    if (parsed.command) {
      assistantMessage.push(`<cmd>${parsed.command}</cmd>`);
    }

    if (assistantMessage.length > 0) {
      state.conversationHistory.push({
        role: 'assistant',
        content: assistantMessage.join('\n'),
      });
    }


    const responseCommandChunk = formatResponseAndCommand({
      hidden: parsed.hidden,  // ← Pass hidden langsung
      answer: answerToSend,   // ← Pass answer langsung
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

    // GENERIC LOOP DETECTION: Check for repeated identical commands
    let loopDetectedOutput = null;
    if (parsed.command && state.commandHistory.length >= 1) {
      const recentCommands = state.commandHistory.slice(-5);
      const sameCommandCount = recentCommands.filter(
        entry => entry.command === parsed.command
      ).length;

      if (sameCommandCount >= 1) {
        log('CODES', 2, 'processCodeRequest', 'Loop detected: same command repeated', {
          iteration,
          command: parsed.command.substring(0, 100),
          count: sameCommandCount + 1,
        });

        const loopBreakerMsg = `[SYSTEM NOTICE] You've already run this command before. Check MEMORY STATE for previously read files - all file reads are automatically saved to memory. If the file is already in memory, analyze what you have instead of re-reading.

Current memory state:
${formatMemoryOutput(state)}

If you need different information, try a different command or approach.`;

        loopDetectedOutput = loopBreakerMsg;
      }
    }

    // SMART FILE READ DETECTION: Check if trying to read file that's already fully in memory
    if (!loopDetectedOutput && parsed.command) {
      const showFileMatch = parsed.command.match(/Show-FileWithLineNumbers\s+-Path\s+"?([^"\s]+)"?(?:\s+-StartLine\s+(\d+))?(?:\s+-EndLine\s+(\d+))?/i);
      if (showFileMatch) {
        const requestedPath = showFileMatch[1].replace(/\\/g, '/');
        const startLine = showFileMatch[2] ? parseInt(showFileMatch[2], 10) : null;
        const endLine = showFileMatch[3] ? parseInt(showFileMatch[3], 10) : null;

        // Check if file exists in memory
        const defaultMemory = state.memories?.default;
        if (defaultMemory && defaultMemory.files) {
          for (const [memPath, fileData] of Object.entries(defaultMemory.files)) {
            if (memPath.includes(requestedPath) || requestedPath.includes(memPath)) {
              // File is in memory - check if requested range is already covered
              if (!startLine && !endLine && fileData.ranges.length > 0) {
                // Full file read requested, and we have at least some data
                const lastRange = fileData.ranges[fileData.ranges.length - 1];
                const loopMsg = `[SYSTEM NOTICE] This file is already in MEMORY STATE. You can see it above in the output. The file shows "[End of file at line ${lastRange.end}]" - this means you've already read the entire file.

Instead of re-reading, analyze what you already have in memory. If you need specific information, use Find-Pattern or check the memory output above.`;

                loopDetectedOutput = loopMsg;
                log('CODES', 2, 'processCodeRequest', 'Smart file read detection: file already in memory', {
                  iteration,
                  requestedPath,
                  memoryPath: memPath,
                });
              }
              break;
            }
          }
        }
      }
    }

    // STEP 3: Execute command (or skip if loop detected)
    let output, exitCode, blocked, isTimeout;

    if (loopDetectedOutput) {
      // Skip execution, return loop detection feedback
      output = loopDetectedOutput;
      exitCode = 0;
      blocked = false;
      isTimeout = false;

      log('CODES', 1, 'processCodeRequest', 'Skipped command execution due to loop detection', {
        iteration,
        command: parsed.command.substring(0, 100),
      });
    } else {
      const result = await executeCommand(state, parsed.command, {
        disableTimeout: requiresConfirmation && confirmationApproved,
      });
      output = result.output;
      exitCode = result.exitCode;
      blocked = result.blocked;
      isTimeout = result.isTimeout;
    }

    // Check if user cancelled (interrupt button) after command execution
    if (typeof shouldCancel === 'function' && shouldCancel()) {
      log('CODES', 1, 'processCodeRequest', 'Streaming cancelled after command execution', {
        iteration,
        sessionId,
      });
      break;
    }

    // Detect ripgrep auto-install - restart terminal and retry ONCE
    if (output && output.includes('[RG_INSTALLED]')) {
      log('CODES', 1, 'processCodeRequest', 'Ripgrep installed', {
        iteration,
        sessionId,
        alreadyAttempted: state.rgInstallAttempted || false,
      });

      // Track installation attempt to prevent infinite loop
      if (!state.rgInstallAttempted) {
        state.rgInstallAttempted = true;

        // Dispose current terminal to restart with new PATH
        try {
          state.terminal?.dispose();
          state.terminal = null;
          log('CODES', 1, 'processCodeRequest', 'Terminal disposed for ripgrep PATH update', { sessionId });
        } catch (error) {
          log('CODES', 2, 'processCodeRequest', 'Failed to dispose terminal', {
            error: error?.message || error,
          });
        }

        // Add system message to conversation history
        const systemMsg = '[SYSTEM] Ripgrep installed successfully. Terminal restarted. Please retry the Search-InFiles command once.';
        state.conversationHistory.push({
          role: 'user',
          content: systemMsg,
        });

        state.commandHistory.push({
          command: '[SYSTEM - RG INSTALLED]',
          output: systemMsg,
          exitCode: 0,
          summary: 'Ripgrep auto-installed, terminal restarted',
          timestamp: Date.now(),
        });

        // Continue to next iteration - allow ONE retry
        continue;
      } else {
        // Already attempted install - PATH update requires app restart
        const restartMsg = '[SYSTEM] Ripgrep was installed but requires application restart to update PATH. Please ask the user to restart Clustrix, or use alternative commands (ls, gc, etc.) instead of Search-InFiles.';

        state.conversationHistory.push({
          role: 'user',
          content: restartMsg,
        });

        state.commandHistory.push({
          command: '[SYSTEM - RG INSTALL FAILED]',
          output: restartMsg,
          exitCode: 1,
          summary: 'Ripgrep install requires app restart',
          timestamp: Date.now(),
        });

        log('CODES', 2, 'processCodeRequest', 'Ripgrep install requires app restart - preventing infinite loop', {
          iteration,
          sessionId,
        });

        // Continue to let AI know about the issue and use fallback
        continue;
      }
    }

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

      // Save iteration to code_iterations table
      if (db && sessionId) {
        try {
          db.addCodeIteration?.(sessionId, currentMessageIndex, iteration, {
            command: parsed.command,
            output: truncateOutput(output, 'older'),
            exitCode,
            answer: parsed.answer || null,
            hidden: parsed.hidden || null,
            summary: entrySummary,
          });
        } catch (error) {
          log('CODES', 3, 'processCodeRequest', 'Failed to save iteration', {
            sessionId,
            iteration,
            error: error?.message || error,
          });
        }
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

  // SKIP saving user/assistant messages to database here
  // Frontend (renderer) already saved them before calling processCodeRequest
  // to prevent duplicate messages after reload
  // Only code_iterations table is updated during agent execution
  log('CODES', 1, 'processCodeRequest', 'Skipping message save (frontend already saved)', {
    sessionId,
    messageIndex: currentMessageIndex,
    hasFinalAnswer: !!finalAnswer,
  });

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

function cancelCodeSession(sessionId) {
  log('CODES', 1, 'cancelCodeSession', 'Cancelling code session', { sessionId });

  const state = sessionStates.get(sessionId);
  if (!state) {
    log('CODES', 2, 'cancelCodeSession', 'Session not found', { sessionId });
    return false;
  }

  try {
    // Dispose terminal to immediately kill any running commands
    if (state.terminal && !state.terminal.isDisposed) {
      state.terminal.dispose();
      state.terminal = null;
      log('CODES', 1, 'cancelCodeSession', 'PowerShell terminal disposed', { sessionId });
    }
    return true;
  } catch (error) {
    log('CODES', 3, 'cancelCodeSession', 'Failed to dispose terminal', {
      sessionId,
      error: error?.message || error,
    });
    return false;
  }
}

module.exports = {
  initializeCodeAgent,
  processCodeRequest,
  resolveUserConfirmation,
  disposeAllCodeSessions,
  cancelCodeSession,
};
