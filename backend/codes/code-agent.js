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

const PROMPT_FIRST = `You are a PowerShell-based coding assistant helping user fix bugs in code files or any problem.

=== ORIGINAL USER REQUEST ===
{user_prompt}

=== COMMAND HISTORY ===
{command_history}

=== LAST COMMAND ===
Command: {last_command}
Output: 
{last_output}

=== DECISION TREE ===
Ask yourself:
1. Did the last command give useful information?
2. Do I need more context before acting?
3. Should I fix something now?
4. Are all bugs fixed? Should I verify?
5. Is the task complete?

Based on answers:
- If need more info → <cmd> to gather data
- If ready to fix → <cmd> to edit file
- If need verification → <cmd> to run code

=== IMPORTANT RULES ===
1. ALWAYS analyze the command output before next action
2. Don't repeat the same command twice
3. Only Powershell commands are supported, don't give other commands such as answering or asking the user in the <cmd> tag, only Powershell commands in the <cmd> tag.
3. If stuck or unsure, ask Zaeni for clarification
4. Keep track of what you've fixed to avoid duplicates
5. When editing, be precise with line numbers (remember 0-indexed)
6. After fixing bugs, ALWAYS verify by running the code
7. If command fails, explain why and try alternative approach
8. if the user prompt just asking, if no need searches or bug fixing, just use tag <answer> to answer the user question.

=== WORKFLOW GUIDELINES ===
Bug fixing flow:
1. Search/grep to find issues
2. Check context around issues
3. Fix issues one by one
4. Verify each fix if critical
6. You can use commands as freely as possible, such as search, delete lines, replace lines, search for the required context.
5. Run final code to ensure everything works
6. Summarize what was fixed
7. Don't forget, commands must always be inside the <cmd> tag.

=== RESPONSE FORMAT ===
Your response should be exactly like this:

<answer>
Your answer, like "baik zaen, saya akan coba cek dlu main.py" or "baik, kita akan cek dlu di direktori ini ada apa saja"
</answer>
<cmd>
Next PowerShell command (optional - only if needed)
</cmd>`;

const PROMPT_SUBSEQUENT = `You are a PowerShell-based coding assistant helping user fix bugs in code files or any problem.

=== ORIGINAL USER REQUEST ===
{user_prompt}

=== COMMAND HISTORY ===
{command_history}

=== LAST COMMAND ===
Command: {last_command}
Output: 
{last_output}

=== DECISION TREE ===
Ask yourself:
1. Did the last command give useful information?
2. Do I need more context before acting?
3. Should I fix something now?
4. Are all bugs fixed? Should I verify?
5. Is the task complete?

Based on answers:
- If need more info → <cmd> to gather data
- If ready to fix → <cmd> to edit file
- If need verification → <cmd> to run code
- If done → <answer> only (no <cmd>)

=== IMPORTANT RULES ===
1. ALWAYS analyze the command output before next action
2. Don't repeat the same command twice
3. Only Powershell commands are supported, don't give other commands such as answering or asking the user in the <cmd> tag, only Powershell commands in the <cmd> tag.
3. If stuck or unsure, ask Zaeni for clarification
4. Keep track of what you've fixed to avoid duplicates
5. When editing, be precise with line numbers (remember 0-indexed)
6. After fixing bugs, ALWAYS verify by running the code
7. If command fails, explain why and try alternative approach
8. if the user prompt just asking, if no need searches or bug fixing, just use tag <answer> to answer the user question.

=== WORKFLOW GUIDELINES ===
Bug fixing flow:
1. Search/grep to find issues
2. Check context around issues
3. Fix issues one by one
4. Verify each fix if critical
6. You can use commands as freely as possible, such as search, delete lines, replace lines, search for the required context.
5. Run final code to ensure everything works
6. Summarize what was fixed
7. Don't forget, commands must always be inside the <cmd> tag.

=== RESPONSE FORMAT ===
Your response should be exactly like this:

<internal>
If there is a last command, summarize the output of the last command into an internal tag.
<internal>
<answer>
Your answer, like "baik zaen, saya akan coba cek dlu main.py" or "baik, kita akan cek dlu di direktori ini ada apa saja"
</answer>
<cmd>
Next PowerShell command (optional - only if needed)
</cmd>

=== ADDITIONAL FORMAT FOR STOPPING ===
If the bug fix is complete, or you need to confirm with the user, or there is something you want to convey that causes you to stop the loop, simply add the <!END> tag at the end of your response.`;

let deps = {
  log: () => {},
  getCodeById: () => null,
};

const sessionStates = new Map();
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
  return history
    .slice(-MAX_HISTORY)
    .map((entry, index) => {
      const idx = history.length - Math.min(history.length, MAX_HISTORY) + index + 1;
      return `#${idx} ${entry.command} → ${entry.summary}`;
    })
    .join('\n');
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
  const internalMatches = Array.from(text.matchAll(/<internal>([\s\S]*?)<\/internal>/gi));

  return {
    answer: answerMatch ? answerMatch[1].trim() : '',
    command: cmdMatch ? cmdMatch[1].trim() : '',
    done,
    internal: internalMatches.map(match => match[1].trim()).filter(Boolean),
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
  const sections = [];
  if (answer) {
    sections.push(answer);
  }
  if (command) {
    sections.push('```powershell\n' + command.trim() + '\n```');
  }
  if (output) {
    const exitLine = Number.isFinite(exitCode)
      ? `\n# Exit Code: ${exitCode}`
      : '';
    sections.push('```text\n' + output.trim() + exitLine + '\n```');
  } else if (blocked) {
    sections.push('```text\nCommand blocked by safety policy.\n```');
  }
  return sections.join('\n\n');
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

  if (isHighImpactCommand(command)) {
    return {
      output: 'Command blocked: requires manual confirmation for destructive operations.',
      exitCode: 1,
      blocked: true,
      executed: false,
    };
  }

  try {
    const terminal = ensurePowerShellSession(state, state.workspacePath);
    const result = await terminal.run(command);
    const combinedOutput = [result.stdout, result.stderr].filter(Boolean).join('\n');
    return {
      output: combinedOutput || 'Command completed with no output.',
      exitCode: typeof result.exitCode === 'number' ? result.exitCode : 0,
      blocked: false,
      executed: true,
    };
  } catch (error) {
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

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
    const { parsed, usage: iterationUsage } = await runAgentIteration({
      iteration,
      state,
      userPrompt: userPromptWithContext,
      provider,
      model,
      baseUrl,
      apiKey,
    });

    usage = mergeUsage(usage, iterationUsage);

    const { output, exitCode, blocked } = await executeCommand(state, parsed.command);
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

    const formatted = formatIterationOutput({
      answer: parsed.answer || 'No response provided.',
      command: parsed.command,
      output: truncateOutput(output),
      exitCode,
      blocked,
    });
    if (formatted) {
      chunks.push(formatted);
    }

    if (!parsed.command || parsed.done) {
      break;
    }
  }

  return {
    chunks,
    usage,
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
};
