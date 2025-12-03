// ===================================================================
// OPENAI-STYLE AGENT - NATIVE TOOL CALLING
// ===================================================================
//
// Uses OpenAI Chat Completions API format (compatible with GLM, Deepseek, etc)
// - Native tool_calls with role="tool" for results
// - Automatic prompt caching (5-10 min TTL)
// - Load last 2 conversations from DB (like Claude agent)
//
// ===================================================================

const https = require('https');
const { URL } = require('url');
const path = require('path');
const fs = require('fs');
const { PowerShellSession } = require('./powershell-session');
const { applySetOperations } = require('./edit-operations');
const { log: appLog } = require('../../utils/logger');

// ===================================
// OPENAI TOOLS (converted from Claude format)
// ===================================
const OPENAI_AGENT_TOOLS = [
  {
    type: "function",
    function: {
      name: "run_command",
      description: `Execute a PowerShell command in the workspace. ALL commands below are PowerShell commands that MUST be executed using THIS TOOL (run_command), NOT as separate tool calls.

AVAILABLE POWERSHELL HELPER COMMANDS:

SEARCH FILES (recursive, fast - uses ripgrep):
  Search-InFiles -Pattern "regex" -Filter "*.js" -Depth 2
  
READ FILE WITH LINE NUMBERS:
  Show-FileWithLineNumbers -Path "file.js"
  Show-FileWithLineNumbers -Path "file.js" -StartLine 50 -EndLine 100

LIST PROJECT FILES:
  List-ProjectFiles -Depth 2 -Extensions "*.js,*.ts"

FILE STATS (fast check before reading large files):
  Get-FileStats -Path "file.js"

CREATE NEW FILE:
  New-Item -ItemType File -Path "path/to/file.js" -Force

RUN TESTS/SCRIPTS:
  npm test | node script.js | python script.py

⚠️ IMPORTANT:
  - ALL commands above are PowerShell commands to be executed via THIS run_command tool
  - DO NOT try to call List-ProjectFiles, Search-InFiles, etc. as separate tools
  - Get-ChildItem -Recurse (without -Depth) will hang!
  - Use Show-FileWithLineNumbers instead of Get-Content`,
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "The PowerShell command to execute"
          },
          commentary: {
            type: "string",
            description: "Brief human-readable explanation of what this command does (e.g., 'Searching for config files', 'Reading package.json', 'Running tests'). Keep it concise and user-friendly."
          }
        },
        required: ["command"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "edit_file",
      description: `Edit a file by replacing, inserting, or deleting lines.

REPLACE LINES (delete old content, insert new):
  Use range with start and end line numbers
  Example: range={start:10, end:15} replaces lines 10-15

INSERT BEFORE A LINE (no deletion):
  Use insert_before with line number
  Example: insert_before=25 inserts new content before line 25

APPEND TO END OF FILE:
  Use append=true
  
DELETE LINES (empty content):
  Use range with empty content string

⚠️ IMPORTANT:
  - Line numbers are 1-indexed
  - Always read the file first to get accurate line numbers
  - You can provide multiple edit operations in multiple files
  - For NEW files, create them first with run_command`,
      parameters: {
        type: "object",
        properties: {
          file: {
            type: "string",
            description: "Relative path to the file"
          },
          range: {
            type: "object",
            properties: {
              start: { type: "integer", description: "Start line number (1-indexed)" },
              end: { type: "integer", description: "End line number (1-indexed, inclusive)" }
            },
            description: "Line range to replace/delete"
          },
          insert_before: {
            type: "integer", 
            description: "Insert content before this line number"
          },
          append: {
            type: "boolean",
            description: "Append content to end of file"
          },
          content: {
            type: "string",
            description: "New content goes here (empty string to delete lines)"
          },
          commentary: {
            type: "string",
            description: "Brief explanation of what you're editing (e.g., 'Adding error handling to fetchUser function', 'Fixing import path', 'Removing deprecated code'). Be specific and user-friendly."
          }
        },
        required: ["file", "content"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "update_checklist",
      description: `Update task checklist for complex multi-step tasks. Only use when user prompt requires multiple steps that need tracking.

CHECKLIST FORMAT:
- [x] Completed task
- [ ] Currently working on this
- [ ] Pending task

USAGE GUIDELINES:
- Only send when checklist changes (task completed, started, or status updated)
- Don't send in every iteration - only when status changes
- Use for complex tasks that span multiple steps
- Keep task descriptions clear and actionable`,
      parameters: {
        type: "object",
        properties: {
          checklist: {
            type: "array",
            description: "Array of checklist items",
            items: {
              type: "object",
              properties: {
                status: {
                  type: "string",
                  enum: ["completed", "in_progress", "pending"],
                  description: "Task status"
                },
                task: {
                  type: "string",
                  description: "Task description"
                }
              },
              required: ["status", "task"]
            }
          },
          commentary: {
            type: "string",
            description: "Optional brief description of checklist update (e.g., 'Starting database schema design', 'Completed all API endpoints')"
          }
        },
        required: ["checklist"]
      }
    }
  }
];

// ===================================
// SYSTEM PROMPT (shared with Claude agent)
// ===================================
const { SYSTEM_PROMPT } = require('./codes-prompt-shared');
const OPENAI_SYSTEM_PROMPT = SYSTEM_PROMPT;

// ===================================
// SESSION STATE
// ===================================
const openaiSessions = new Map();
const openaiConfirmationPromises = new Map();

function openaiLog(level, fn, message, details = {}) {
  try {
    appLog('OPENAI-AGENT', level, fn, message, details);
  } catch (error) {
    console.error('[OPENAI-AGENT]', message, details, error?.message);
  }
}

function getOpenAISession(sessionId, workspacePath) {
  if (!openaiSessions.has(sessionId)) {
    openaiSessions.set(sessionId, {
      conversationHistory: [],
      terminal: null,
      workspacePath: workspacePath || require('os').homedir(),
      lastUsed: Date.now()
    });
  }
  
  const session = openaiSessions.get(sessionId);
  session.lastUsed = Date.now();
  return session;
}

function ensureOpenAITerminal(session) {
  if (session.terminal && !session.terminal.isDisposed) {
    return session.terminal;
  }
  
  try { session.terminal?.dispose(); } catch {}
  session.terminal = new PowerShellSession({ 
    workspacePath: session.workspacePath, 
    log: openaiLog 
  });
  return session.terminal;
}

// ===================================
// CONFIRMATION SYSTEM
// ===================================
function isHighImpactCommand(command = '') {
  const normalized = command.trim().replace(/^\s+/gm, '').toLowerCase();
  const firstLine = normalized.split('\n').find(l => l.length > 0) || '';
  
  const dangerousPatterns = [
    'remove-item', 'rm ', 'rmdir', 'del ', 'git reset', 'git clean',
    'docker rm', 'npm uninstall', 'shutdown', 'chmod', 'sudo '
  ];
  
  return dangerousPatterns.some(p => firstLine.startsWith(p));
}

async function waitForOpenAIConfirmation(sessionId, toolCallId) {
  const key = `${sessionId}-${toolCallId}`;
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      openaiConfirmationPromises.delete(key);
      resolve({ allowed: false, timedOut: true });
    }, 5 * 60 * 1000);
    
    openaiConfirmationPromises.set(key, { resolve, timeoutId });
  });
}

function resolveOpenAIConfirmation(sessionId, toolCallId, allowed) {
  const key = `${sessionId}-${toolCallId}`;
  const entry = openaiConfirmationPromises.get(key);
  
  if (entry && typeof entry.resolve === 'function') {
    openaiConfirmationPromises.delete(key);
    if (entry.timeoutId) clearTimeout(entry.timeoutId);
    entry.resolve({ allowed, timedOut: false });
    return true;
  }
  return false;
}

// ===================================
// OPENAI API CALL (STREAMING)
// ===================================
async function callOpenAIAPI({ baseUrl, apiKey, model, messages, tools, onTextChunk }) {
  return new Promise((resolve, reject) => {
    const endpoint = new URL(baseUrl.replace(/\/?$/, '') + '/chat/completions');
    
    const body = JSON.stringify({
      model,
      messages,
      tools,
      tool_choice: "auto",
      stream: true
    });
    
    const options = {
      method: 'POST',
      hostname: endpoint.hostname,
      port: endpoint.port || 443,
      path: endpoint.pathname,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(body)
      }
    };
    
    const req = https.request(options, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        let errorData = '';
        res.on('data', chunk => errorData += chunk);
        res.on('end', () => {
          reject(new Error(`OpenAI API HTTP ${res.statusCode}: ${errorData.slice(0, 500)}`));
        });
        return;
      }
      
      // Accumulate full response while streaming
      const fullMessage = {
        role: 'assistant',
        content: '',
        tool_calls: []
      };
      const toolCallBuffers = new Map(); // id -> { index, name, arguments }
      let finishReason = null;
      let buffer = '';
      
      res.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr || jsonStr === '[DONE]') continue;
          
          try {
            const event = JSON.parse(jsonStr);
            const delta = event.choices?.[0]?.delta;
            
            if (!delta) continue;
            
            // Stream text content
            if (delta.content) {
              fullMessage.content += delta.content;
              if (onTextChunk) onTextChunk(delta.content);
            }
            
            // Accumulate tool calls
            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index;
                if (!toolCallBuffers.has(idx)) {
                  toolCallBuffers.set(idx, {
                    id: tc.id || '',
                    type: 'function',
                    function: { name: '', arguments: '' }
                  });
                }
                const buf = toolCallBuffers.get(idx);
                if (tc.id) buf.id = tc.id;
                if (tc.function?.name) buf.function.name += tc.function.name;
                if (tc.function?.arguments) buf.function.arguments += tc.function.arguments;
              }
            }
            
            // Capture finish reason
            if (event.choices?.[0]?.finish_reason) {
              finishReason = event.choices[0].finish_reason;
            }
          } catch (e) {
            openaiLog(2, 'callOpenAIAPI', 'Failed to parse SSE', { line, error: e.message });
          }
        }
      });
      
      res.on('end', () => {
        // Convert tool call buffers to array
        if (toolCallBuffers.size > 0) {
          fullMessage.tool_calls = Array.from(toolCallBuffers.values());
        } else {
          delete fullMessage.tool_calls;
        }
        
        // Build response in OpenAI format
        resolve({
          choices: [{
            message: fullMessage,
            finish_reason: finishReason
          }],
          usage: null // Streaming doesn't return usage
        });
      });
    });
    
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ===================================
// TOOL EXECUTION (same as Claude agent)
// ===================================
async function executeRunCommand(session, command, confirmed = false) {
  if (!confirmed && isHighImpactCommand(command)) {
    return { success: false, output: '', requiresConfirmation: true, command };
  }
  
  const terminal = ensureOpenAITerminal(session);
  const result = await terminal.run(command);
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n');
  
  return {
    success: result.exitCode === 0,
    output: output || 'Command completed with no output.',
    exitCode: result.exitCode
  };
}

async function executeEditFile(session, input) {
  const { file, range, insert_before, append, content } = input;
  
  try {
    let setCommand;
    
    if (append) {
      setCommand = `<set file="${file}" range={-1}>
<![CDATA[
${content}
]]>
</set>`;
    } else if (insert_before) {
      setCommand = `<set file="${file}" add={${insert_before}}>
<![CDATA[
${content}
]]>
</set>`;
    } else if (range?.start) {
      const end = range.end || range.start;
      setCommand = `<set file="${file}" range={${range.start}, ${end}}>
<![CDATA[
${content}
]]>
</set>`;
    } else {
      return { success: false, output: 'Error: Must specify range, insert_before, or append' };
    }
    
    const result = applySetOperations(setCommand, { workspacePath: session.workspacePath });
    return {
      success: result?.success || false,
      output: result?.text || 'Edit completed.'
    };
  } catch (error) {
    return {
      success: false,
      output: `Edit error: ${error.message}`
    };
  }
}

function formatChecklist(checklist) {
  if (!Array.isArray(checklist) || checklist.length === 0) return 'No checklist items';
  
  return checklist.map(item => {
    const status = item.status === 'completed' ? '[x]' : '[ ]';
    return `${status} ${item.task}`;
  }).join('\n');
}

async function executeTool(session, toolCall, confirmed, onChunk, sessionId) {
  const name = toolCall.function.name;
  const id = toolCall.id;
  const input = JSON.parse(toolCall.function.arguments);
  
  switch (name) {
    case 'run_command': {
      const result = await executeRunCommand(session, input.command, confirmed);
      
      if (result.requiresConfirmation && onChunk) {
        const confirmationChunk = JSON.stringify({
          type: 'confirmation-required',
          command: input.command,
          toolCallId: id,
          sessionId
        }) + '\n';
        onChunk(confirmationChunk, { type: 'confirmation' });
        
        const confirmation = await waitForOpenAIConfirmation(sessionId, id);
        if (confirmation.allowed) {
          const confirmedResult = await executeRunCommand(session, input.command, true);
          return { tool_call_id: id, output: confirmedResult.output, exitCode: confirmedResult.exitCode };
        } else {
          return { tool_call_id: id, output: 'User skipped this command.', exitCode: 0 };
        }
      }
      
      return { tool_call_id: id, output: result.output, exitCode: result.exitCode };
    }
    
    case 'edit_file': {
      const result = await executeEditFile(session, input);
      return { tool_call_id: id, output: result.output };
    }
    
    case 'update_checklist': {
      const checklistText = formatChecklist(input.checklist);
      return { tool_call_id: id, output: checklistText };
    }
    
    default: {
      // DEFENSIVE: If model calls unknown tool that looks like a PowerShell command,
      // automatically route it to run_command instead of failing
      openaiLog(2, 'executeTool', `Unknown tool "${name}" - attempting to route to run_command`, { toolCall });
      
      // Check if this looks like a PowerShell helper function
      const psHelpers = [
        'List-ProjectFiles', 'Search-InFiles', 'Show-FileWithLineNumbers',
        'Get-FileStats', 'Set-FileLine', 'Remove-FileLine', 'Add-FileLine',
        'Set-MultipleLines', 'Search-Pattern', 'Find-Pattern', 
        'Search-FileWithContext', 'Find-DuplicateLines', 'Get-FileLineRange',
        'Replace-InFile', 'Get-DirectoryStructure'
      ];
      
      const isPS = psHelpers.some(helper => name.toLowerCase() === helper.toLowerCase());
      
      if (isPS) {
        // Reconstruct PowerShell command from tool call arguments
        const args = Object.entries(input)
          .filter(([key]) => key !== 'commentary')
          .map(([key, val]) => {
            if (typeof val === 'string') return `-${key} "${val}"`;
            if (typeof val === 'number') return `-${key} ${val}`;
            if (typeof val === 'boolean') return val ? `-${key}` : '';
            return '';
          })
          .filter(Boolean)
          .join(' ');
        
        const command = `${name} ${args}`.trim();
        openaiLog(1, 'executeTool', `Auto-routing to run_command: ${command}`);
        
        const result = await executeRunCommand(session, command, confirmed);
        return { tool_call_id: id, output: result.output, exitCode: result.exitCode };
      }
      
      // If not a known PS helper, return error with helpful message
      return { 
        tool_call_id: id, 
        output: `Error: Unknown tool "${name}". If this is a PowerShell command, use the run_command tool instead. Available tools: run_command, edit_file, update_checklist.` 
      };
    }
  }
}

// ===================================
// MAIN AGENT LOOP
// ===================================
async function processOpenAICodeRequest({
  sessionId, userPrompt, baseUrl, apiKey, model,
  workspacePath, instruction = '', onChunk, shouldCancel, db
}) {
  openaiLog(1, 'processOpenAICodeRequest', 'Starting', { sessionId, model });
  
  const session = getOpenAISession(sessionId, workspacePath);
  let totalUsage = { prompt_tokens: 0, completion_tokens: 0 };
  const chunks = [];
  
  // Reset and load history (last 2 conversations like Claude)
  session.conversationHistory = [];
  
  if (db && sessionId) {
    const dbMessages = db.getMessages?.(sessionId) || [];
    const userMessages = dbMessages.filter(m => m.role === 'user').slice(-3, -1);
    
    for (const userMsg of userMessages) {
      const msgIndex = userMsg.message_index;
      
      session.conversationHistory.push({ role: 'user', content: userMsg.content });
      
      // Assistant message is at msgIndex + 1 (user=0, ai=1, user=2, ai=3, etc)
      const assistantMsg = dbMessages.find(m => m.role === 'assistant' && m.message_index === msgIndex + 1);
      if (assistantMsg) {
        session.conversationHistory.push({
          role: 'assistant',
          content: assistantMsg.content || null,
          tool_calls: assistantMsg.tool_calls || null
        });
        
        const toolMsgs = dbMessages.filter(m => m.role === 'tool' && m.message_index === msgIndex);
        for (const toolMsg of toolMsgs) {
          session.conversationHistory.push({
            role: 'tool',
            tool_call_id: toolMsg.tool_call_id,
            content: toolMsg.content
          });
        }
      }
    }
  }
  
  // Add current user prompt
  session.conversationHistory.push({ role: 'user', content: userPrompt });
  
  for (let iteration = 0; iteration < 50; iteration++) {
    if (shouldCancel && shouldCancel()) break;
    if (iteration > 0) await new Promise(r => setTimeout(r, 1500));
    
    const messages = [
      { role: 'system', content: OPENAI_SYSTEM_PROMPT },
      ...session.conversationHistory
    ];
    
    let hasStreamedText = false;
    const response = await callOpenAIAPI({
      baseUrl, apiKey, model, messages,
      tools: OPENAI_AGENT_TOOLS,
      onTextChunk: (textDelta) => {
        hasStreamedText = true;
        if (onChunk) onChunk(textDelta, { type: 'text', iteration, streaming: true });
      }
    });
    
    // Signal text stream complete
    if (hasStreamedText && onChunk) {
      onChunk('', { type: 'text-end', iteration });
    }
    
    if (response.usage) {
      totalUsage.prompt_tokens += response.usage.prompt_tokens || 0;
      totalUsage.completion_tokens += response.usage.completion_tokens || 0;
    }
    
    const assistantMsg = response.choices[0].message;
    
    if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
      session.conversationHistory.push(assistantMsg);
      if (onChunk) onChunk('', { type: 'end', done: true });
      break;
    }
    
    // Execute tools
    session.conversationHistory.push(assistantMsg);
    
    for (const toolCall of assistantMsg.tool_calls) {
      const args = JSON.parse(toolCall.function.arguments);
      let displayText = '';
      let actualCommand = '';
      
      // Prioritize AI commentary, fallback to humanized command
      if (args.commentary) {
        displayText = args.commentary;
        // Preserve actual command for icon detection
        if (toolCall.function.name === 'run_command') {
          actualCommand = args.command;
        } else if (toolCall.function.name === 'edit_file') {
          actualCommand = `<set file="${args.file}" range={${args.start_line || 1},${args.end_line || 1}}>`;
        }
      } else if (toolCall.function.name === 'run_command') {
        displayText = args.command;
        actualCommand = args.command;
      } else if (toolCall.function.name === 'edit_file') {
        displayText = `Edit file: ${args.file}`;
        actualCommand = `<set file="${args.file}" range={${args.start_line || 1},${args.end_line || 1}}>`;
      } else if (toolCall.function.name === 'update_checklist') {
        displayText = `Update checklist (${args.checklist?.length || 0} items)`;
      }
      
      if (displayText) {
        // Include real-cmd tag only if commentary differs from actual command
        const realCmdTag = actualCommand && actualCommand !== displayText ? `<real-cmd>${actualCommand}</real-cmd>` : '';
        const commandChunk = `<!--command-input-->\n${displayText}${realCmdTag}\n<!--/command-input-->\n`;
        chunks.push(commandChunk);
        if (onChunk) onChunk(commandChunk, { type: 'command', iteration, toolName: toolCall.function.name });
      }
      
      const result = await executeTool(session, toolCall, false, onChunk, sessionId);
      
      session.conversationHistory.push({
        role: 'tool',
        tool_call_id: result.tool_call_id,
        content: result.output
      });
      
      const exitLine = result.exitCode != null ? `\n# Exit Code: ${result.exitCode}` : '';
      const outputChunk = `<!--command-output-->\n${result.output}${exitLine}\n<!--/command-output-->\n\n`;
      chunks.push(outputChunk);
      if (onChunk) onChunk(outputChunk, { type: 'output', iteration, toolName: toolCall.function.name, exitCode: result.exitCode || 0 });
    }
  }
  
  return { chunks, usage: totalUsage };
}

module.exports = {
  processOpenAICodeRequest,
  resolveOpenAIConfirmation,
  OPENAI_AGENT_TOOLS
};
