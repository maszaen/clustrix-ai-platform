// ===================================================================
// GEMINI AGENT - NATIVE TOOL CALLING
// ===================================================================
//
// Uses Google Gemini API format (generativelanguage.googleapis.com)
// - Native function calling with functionCall/functionResponse
// - Contents array with parts structure
// - Compatible with Gemini 1.5 Pro, Flash, etc.
//
// ===================================================================

const https = require('https');
const { URL } = require('url');
const path = require('path');
const fs = require('fs');
const { PowerShellSession } = require('./powershell-session');
const { applySetOperations, undoEdit, getFormattedEditHistory, getFormattedMemory } = require('./edit-operations');
const { log: appLog } = require('../../utils/logger');
const { SYSTEM_PROMPT } = require('./codes-prompt-shared');

// ===================================
// GEMINI TOOLS (function declarations)
// ===================================
const GEMINI_AGENT_TOOLS = [
  {
    functionDeclarations: [
      {
        name: "run_command",
        description: `Execute a PowerShell command in the workspace. ALL commands below are PowerShell commands that MUST be executed using THIS TOOL.

AVAILABLE POWERSHELL HELPER COMMANDS:

SEARCH FILES (recursive, fast - uses ripgrep):
  Search-InFiles -Pattern "regex" -Filter "*.js" -Depth 2
  
READ FILE WITH LINE NUMBERS:
  Show-FileWithLineNumbers -Path "file.js"
  Show-FileWithLineNumbers -Path "file.js" -StartLine 50 -EndLine 100

LIST PROJECT FILES:
  List-ProjectFiles -Depth 2 -Extensions "*.js,*.ts"

FILE STATS:
  Get-FileStats -Path "file.js"

CREATE NEW FILE:
  New-Item -ItemType File -Path "path/to/file.js" -Force

RUN TESTS/SCRIPTS:
  npm test | node script.js | python script.py

IMPORTANT: Get-ChildItem -Recurse without -Depth will hang!`,
        parameters: {
          type: "object",
          properties: {
            command: {
              type: "string",
              description: "The PowerShell command to execute"
            },
            commentary: {
              type: "string",
              description: "Brief human-readable short explanation of what this command does"
            }
          },
          required: ["command"]
        }
      },
      {
        name: "edit_file",
        description: `Edit an existing file by replacing lines, inserting new lines, or appending to the end.

OPERATION MODES (Mutually Exclusive - Choose One):
1. REPLACE LINES: Use 'range_start' and 'range_end' with the new 'content'.
2. DELETE LINES: Use 'range_start' and 'range_end' with empty 'content'.
3. INSERT LINES: Use 'insert_before' to add 'content' before a specific line.
4. APPEND: Set 'append' to true to add 'content' at the end of the file.

CRITICAL RULES:
- LINE NUMBERS: Must be 1-indexed and based on the MOST RECENT file read.
- PRECISION: Only include the lines you intend to modify. Do not include context lines.
- EXCLUSIVITY: Do not mix 'range_start'/'range_end' with 'insert_before' or 'append'.
- INSERTION: To insert, simply specify the line number to insert before. Do not use range parameters.
- APPENDING: To append, strictly set 'append' to true. Do not use range parameters or negative numbers.`,
        parameters: {
          type: "object",
          properties: {
            file: {
              type: "string",
              description: "Relative path to the file (must match exact path from file read)."
            },
            range_start: {
              type: "integer",
              description: "Start line number to replace/delete (1-indexed). Required for REPLACE/DELETE mode."
            },
            range_end: {
              type: "integer",
              description: "End line number to replace/delete (1-indexed, inclusive). Required for REPLACE/DELETE mode."
            },
            insert_before: {
              type: "integer",
              description: "Line number to insert content BEFORE. Use only for INSERT mode."
            },
            append: {
              type: "boolean",
              description: "Set to true to append content to the end of the file. Use only for APPEND mode."
            },
            content: {
              type: "string",
              description: "The text content to write. Use an empty string to delete lines."
            },
            commentary: {
              type: "string",
              description: "Brief short explanation of what you're editing."
            }
          },
          required: ["file", "content"]
        }
      },
      {
        name: "update_checklist",
        description: `Update task checklist for complex multi-step tasks.

Format: [x] Completed, [ ] Pending
Only send when checklist changes.`,
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
              description: "Optional brief description of checklist update"
            }
          },
          required: ["checklist"]
        }
      },
      {
        name: "show_history",
        description: `Show memory (explored file ranges) and/or edit history for this session.
Use this to recall what files you've read and what edits you've made.`,
        parameters: {
          type: "object",
          properties: {
            show_memory: {
              type: "boolean",
              description: "Show explored file ranges from memory"
            },
            show_edit_history: {
              type: "boolean",
              description: "Show recent edit history with edit IDs and diffs"
            }
          }
        }
      },
      {
        name: "undo_edit",
        description: `Undo a previous edit by its ID. Use show_history first to see available edit IDs.`,
        parameters: {
          type: "object",
          properties: {
            edit_id: {
              type: "string",
              description: "The edit ID to undo (from show_history)"
            },
            reason: {
              type: "string",
              description: "Brief reason for undoing this edit"
            }
          },
          required: ["edit_id"]
        }
      }
    ]
  }
];

// ===================================
// SESSION STATE
// ===================================
const geminiSessions = new Map();
const geminiConfirmationPromises = new Map();

function geminiLog(level, fn, message, details = {}) {
  try {
    appLog('GEMINI-AGENT', level, fn, message, details);
  } catch (error) {
    console.error('[GEMINI-AGENT]', message, details, error?.message);
  }
}

function getGeminiSession(sessionId, workspacePath) {
  if (!geminiSessions.has(sessionId)) {
    geminiSessions.set(sessionId, {
      conversationHistory: [],
      terminal: null,
      workspacePath: workspacePath || require('os').homedir(),
      lastUsed: Date.now()
    });
  }
  
  const session = geminiSessions.get(sessionId);
  session.lastUsed = Date.now();
  return session;
}

function ensureGeminiTerminal(session) {
  if (session.terminal && !session.terminal.isDisposed) {
    return session.terminal;
  }
  
  try { session.terminal?.dispose(); } catch {}
  session.terminal = new PowerShellSession({
    workspacePath: session.workspacePath,
    log: geminiLog
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

async function waitForGeminiConfirmation(sessionId, toolCallId) {
  const key = `${sessionId}-${toolCallId}`;
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      geminiConfirmationPromises.delete(key);
      resolve({ allowed: false, timedOut: true });
    }, 5 * 60 * 1000);
    
    geminiConfirmationPromises.set(key, { resolve, timeoutId });
  });
}

function resolveGeminiConfirmation(sessionId, toolCallId, allowed) {
  const key = `${sessionId}-${toolCallId}`;
  const entry = geminiConfirmationPromises.get(key);
  
  if (entry && typeof entry.resolve === 'function') {
    geminiConfirmationPromises.delete(key);
    if (entry.timeoutId) clearTimeout(entry.timeoutId);
    entry.resolve({ allowed, timedOut: false });
    return true;
  }
  return false;
}


// ===================================
// GEMINI API CALL (STREAMING)
// ===================================
async function callGeminiAPI({ baseUrl, apiKey, model, contents, tools, systemInstruction, onTextChunk }) {
  return new Promise((resolve, reject) => {
    let endpoint;
    let isOpenAICompatible = false;
    
    try {
      if (baseUrl.includes('/v1/') && !baseUrl.includes('/v1beta/')) {
        isOpenAICompatible = true;
        endpoint = new URL(baseUrl.replace(/\/?$/, '') + '/chat/completions');
      } else {
        let normalizedBase = baseUrl.replace(/\/?$/, '');
        if (!normalizedBase.includes('/v1beta')) {
          normalizedBase += '/v1beta';
        }
        // Use streamGenerateContent for streaming
        endpoint = new URL(`${normalizedBase}/models/${model}:streamGenerateContent`);
        endpoint.searchParams.set('key', apiKey);
        endpoint.searchParams.set('alt', 'sse');
      }
    } catch (error) {
      reject(new Error(`Invalid base URL: ${baseUrl}`));
      return;
    }
    
    let body;
    let headers;
    
    if (isOpenAICompatible) {
      const messages = [
        { role: 'system', content: systemInstruction },
        ...contents.map(c => ({
          role: c.role === 'model' ? 'assistant' : c.role,
          content: c.parts?.map(p => p.text || '').join('') || ''
        }))
      ];
      
      body = JSON.stringify({
        model,
        messages,
        tools: tools?.[0]?.functionDeclarations?.map(fn => ({
          type: 'function',
          function: fn
        })),
        tool_choice: 'auto',
        stream: true
      });
      
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(body)
      };
    } else {
      body = JSON.stringify({
        contents,
        tools,
        systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
        generationConfig: {
          maxOutputTokens: 8192,
          temperature: 0.7
        }
      });
      
      headers = {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      };
    }
    
    const options = {
      method: 'POST',
      hostname: endpoint.hostname,
      port: endpoint.port || 443,
      path: endpoint.pathname + endpoint.search,
      headers
    };
    
    geminiLog(1, 'callGeminiAPI', 'Making streaming API request', {
      hostname: endpoint.hostname,
      path: endpoint.pathname,
      model,
      isOpenAICompatible,
      contentsLength: contents.length
    });
    
    const req = https.request(options, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        let errorData = '';
        res.on('data', chunk => errorData += chunk);
        res.on('end', () => {
          reject(new Error(`Gemini API HTTP ${res.statusCode}: ${errorData.slice(0, 500)}`));
        });
        return;
      }
      
      // Accumulate full response
      const fullResponse = {
        candidates: [{
          content: { role: 'model', parts: [] },
          finishReason: 'STOP'
        }],
        usageMetadata: { promptTokenCount: 0, candidatesTokenCount: 0 }
      };
      
      let accumulatedText = '';
      const functionCalls = [];
      let buffer = '';
      
      res.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;
          
          try {
            const event = JSON.parse(jsonStr);
            
            if (isOpenAICompatible) {
              // OpenAI streaming format
              const delta = event.choices?.[0]?.delta;
              if (delta?.content) {
                accumulatedText += delta.content;
                if (onTextChunk) onTextChunk(delta.content);
              }
              if (event.choices?.[0]?.finish_reason) {
                fullResponse.candidates[0].finishReason = 
                  event.choices[0].finish_reason === 'tool_calls' ? 'TOOL_CALLS' : 'STOP';
              }
            } else {
              // Native Gemini streaming format
              const candidate = event.candidates?.[0];
              if (candidate?.content?.parts) {
                for (const part of candidate.content.parts) {
                  if (part.text) {
                    accumulatedText += part.text;
                    if (onTextChunk) onTextChunk(part.text);
                  }
                  if (part.functionCall) {
                    functionCalls.push(part.functionCall);
                  }
                }
              }
              if (candidate?.finishReason) {
                fullResponse.candidates[0].finishReason = candidate.finishReason;
              }
              if (event.usageMetadata) {
                fullResponse.usageMetadata = event.usageMetadata;
              }
            }
          } catch (e) {
            geminiLog(2, 'callGeminiAPI', 'Failed to parse SSE', { line, error: e.message });
          }
        }
      });
      
      res.on('end', () => {
        // Build final response
        if (accumulatedText) {
          fullResponse.candidates[0].content.parts.push({ text: accumulatedText });
        }
        for (const fc of functionCalls) {
          fullResponse.candidates[0].content.parts.push({ functionCall: fc });
        }
        
        resolve(fullResponse);
      });
    });
    
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ===================================
// TOOL EXECUTION
// ===================================
async function executeRunCommand(session, command, confirmed = false) {
  if (!confirmed && isHighImpactCommand(command)) {
    return { success: false, output: '', requiresConfirmation: true, command };
  }
  
  const terminal = ensureGeminiTerminal(session);
  
  try {
    const result = await terminal.run(command);
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n');
    
    // Truncate if too long
    let finalOutput = output || 'Command completed with no output.';
    if (finalOutput.length > 100000) {
      const half = 50000;
      finalOutput = finalOutput.slice(0, half) +
        `\n\n... [TRUNCATED ${finalOutput.length - 100000} chars] ...\n\n` +
        finalOutput.slice(-half);
    }
    
    return {
      success: result.exitCode === 0,
      output: finalOutput,
      exitCode: result.exitCode
    };
  } catch (error) {
    // Handle terminal errors - recreate if needed
    if (error.message?.includes('disposed') || error.message?.includes('busy')) {
      try { session.terminal?.dispose(); } catch {}
      session.terminal = null;
      
      const newTerminal = ensureGeminiTerminal(session);
      const result = await newTerminal.run(command);
      const output = [result.stdout, result.stderr].filter(Boolean).join('\n');
      
      return {
        success: result.exitCode === 0,
        output: output || 'Command completed with no output.',
        exitCode: result.exitCode
      };
    }
    
    return {
      success: false,
      output: `Error: ${error.message}`,
      exitCode: 1
    };
  }
}

async function executeEditFile(session, input, sessionId, db) {
  const { file, range_start, range_end, insert_before, append, content } = input;
  
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
    } else if (range_start) {
      const end = range_end || range_start;
      setCommand = `<set file="${file}" range={${range_start}, ${end}}>
<![CDATA[
${content}
]]>
</set>`;
    } else {
      return { success: false, output: 'Error: Must specify range_start/range_end, insert_before, or append' };
    }
    
    const result = applySetOperations(setCommand, { 
      workspacePath: session.workspacePath,
      sessionId,
      db
    });
    
    return {
      success: result?.success || false,
      output: result?.text || 'Edit completed.',
      editId: result?.files?.[0]?.editId || null
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

async function executeTool(session, functionCall, confirmed, onChunk, sessionId, iteration = 0, db = null) {
  const { name, args } = functionCall;
  const toolCallId = `${sessionId}-${iteration}-${name}`;
  
  geminiLog(1, 'executeTool', `Executing: ${name}`, { 
    args: JSON.stringify(args).slice(0, 150),
    toolCallId 
  });
  
  switch (name) {
    case 'run_command': {
      const result = await executeRunCommand(session, args.command, confirmed);
      
      if (result.requiresConfirmation && onChunk) {
        const confirmationChunk = JSON.stringify({
          type: 'confirmation-required',
          command: args.command,
          toolCallId,
          sessionId,
          provider: 'gemini'
        }) + '\n';
        onChunk(confirmationChunk, { type: 'confirmation' });
        
        const confirmation = await waitForGeminiConfirmation(sessionId, toolCallId);
        if (confirmation.allowed) {
          const confirmedResult = await executeRunCommand(session, args.command, true);
          return { name, output: confirmedResult.output, exitCode: confirmedResult.exitCode };
        } else {
          return { name, output: 'User skipped this command.', exitCode: 0 };
        }
      }
      
      return { name, output: result.output, exitCode: result.exitCode };
    }
    
    case 'edit_file': {
      const result = await executeEditFile(session, args, sessionId, db);
      let output = result.output;
      if (result.editId) {
        output += `\n\nEdit ID: ${result.editId}`;
      }
      return { name, output };
    }
    
    case 'update_checklist': {
      const checklistText = formatChecklist(args.checklist);
      return { name, output: checklistText };
    }
    
    case 'show_history': {
      // Build display text based on what's being shown
      const parts = [];
      if (args.show_memory) parts.push('Memory');
      if (args.show_edit_history) parts.push('Edit History');
      const displayText = parts.length > 0 ? `Show ${parts.join(' & ')}` : 'Show History';
      
      if (onChunk) {
        const commandChunk = `<!--command-input-->\n${displayText}\n<!--/command-input-->\n`;
        onChunk(commandChunk, { type: 'command', toolName: 'show_history' });
      }
      
      let output = '';
      if (args.show_memory) {
        output += '## Explored Files (Memory)\n\n' + getFormattedMemory(sessionId, db);
      }
      if (args.show_edit_history) {
        if (output) output += '\n\n---\n\n';
        output += '## Edit History\n\n' + getFormattedEditHistory(sessionId, db);
      }
      if (!output) {
        output = 'Specify show_memory=true and/or show_edit_history=true';
      }
      return { name, output };
    }
    
    case 'undo_edit': {
      // Send command-input tag first
      const displayText = `Undo Edit "${args.edit_id}"`;
      if (onChunk) {
        const commandChunk = `<!--command-input-->\n${displayText}\n<!--/command-input-->\n`;
        onChunk(commandChunk, { type: 'command', toolName: 'undo_edit' });
      }
      
      // First, do a dry run to get preview
      const preview = undoEdit(args.edit_id, { 
        workspacePath: session.workspacePath, 
        db, 
        sessionId,
        dryRun: true 
      });
      
      if (!preview.success) {
        return { name, output: preview.output };
      }
      
      // Undo always requires confirmation
      if (onChunk) {
        const confirmationChunk = JSON.stringify({
          type: 'confirmation-required',
          command: displayText,
          toolCallId,
          sessionId,
          provider: 'gemini',
          preview: preview.output,
        }) + '\n';
        onChunk(confirmationChunk, { type: 'confirmation' });
      }
      
      const confirmation = await waitForGeminiConfirmation(sessionId, toolCallId);
      
      if (confirmation.allowed) {
        const result = undoEdit(args.edit_id, { 
          workspacePath: session.workspacePath, 
          db, 
          sessionId,
          dryRun: false 
        });
        return { name, output: result.output };
      } else {
        const skipMessage = confirmation.timedOut 
          ? 'Undo operation timed out - user did not respond.'
          : 'User cancelled the undo operation.';
        return { name, output: skipMessage };
      }
    }
    
    default: {
      // Auto-route PowerShell helpers
      const psHelpers = [
        'List-ProjectFiles', 'Search-InFiles', 'Show-FileWithLineNumbers',
        'Get-FileStats', 'Set-FileLine', 'Find-Pattern'
      ];
      
      if (psHelpers.some(h => name.toLowerCase() === h.toLowerCase())) {
        const cmdArgs = Object.entries(args)
          .filter(([key]) => key !== 'commentary')
          .map(([key, val]) => {
            if (typeof val === 'string') return `-${key} "${val}"`;
            if (typeof val === 'number') return `-${key} ${val}`;
            return '';
          })
          .filter(Boolean)
          .join(' ');
        
        const command = `${name} ${cmdArgs}`.trim();
        geminiLog(1, 'executeTool', `Auto-routing to run_command: ${command}`);
        
        const result = await executeRunCommand(session, command, confirmed);
        return { name, output: result.output, exitCode: result.exitCode };
      }
      
      return { name, output: `Error: Unknown tool "${name}". Use run_command, edit_file, update_checklist, show_history, or undo_edit.` };
    }
  }
}


// ===================================
// PARSE GEMINI RESPONSE
// ===================================
function parseGeminiResponse(response) {
  const result = {
    text: '',
    functionCalls: [],
    finishReason: 'STOP',
    isComplete: false
  };
  
  if (!response?.candidates?.[0]?.content?.parts) {
    geminiLog(2, 'parseGeminiResponse', 'No content parts in response', { response });
    return result;
  }
  
  const candidate = response.candidates[0];
  result.finishReason = candidate.finishReason || 'STOP';
  
  for (const part of candidate.content.parts) {
    if (part.text) {
      result.text += part.text;
    }
    
    if (part.functionCall) {
      result.functionCalls.push({
        name: part.functionCall.name,
        args: part.functionCall.args || {}
      });
    }
  }
  
  // Check for completion markers
  if (result.text.includes('<!END>') || result.text.includes('Task Complete')) {
    result.isComplete = true;
  }
  
  return result;
}

// ===================================
// BUILD GEMINI CONTENTS
// ===================================
function buildGeminiContents(conversationHistory) {
  // Gemini uses 'contents' array with 'role' and 'parts'
  // Roles: 'user' and 'model' (not 'assistant')
  const contents = [];
  
  for (const msg of conversationHistory) {
    if (msg.role === 'user') {
      if (Array.isArray(msg.parts)) {
        // Already in Gemini format (function response)
        contents.push(msg);
      } else {
        contents.push({
          role: 'user',
          parts: [{ text: msg.content || msg.text || '' }]
        });
      }
    } else if (msg.role === 'model' || msg.role === 'assistant') {
      if (Array.isArray(msg.parts)) {
        contents.push({ role: 'model', parts: msg.parts });
      } else {
        contents.push({
          role: 'model',
          parts: [{ text: msg.content || msg.text || '' }]
        });
      }
    } else if (msg.role === 'function') {
      // Function response - add as user message with functionResponse part
      contents.push({
        role: 'user',
        parts: [{
          functionResponse: {
            name: msg.name,
            response: { result: msg.content || msg.output || '' }
          }
        }]
      });
    }
  }
  
  return contents;
}

// ===================================
// MAIN AGENT LOOP
// ===================================
async function processGeminiCodeRequest({
  sessionId,
  userPrompt,
  baseUrl,
  apiKey,
  model,
  workspacePath,
  instruction = '',
  onChunk,
  shouldCancel,
  db
}) {
  geminiLog(1, 'processGeminiCodeRequest', 'Starting', { sessionId, model, workspacePath });
  
  const session = getGeminiSession(sessionId, workspacePath);
  let totalUsage = { prompt_tokens: 0, completion_tokens: 0 };
  const chunks = [];
  
  // Reset conversation history
  session.conversationHistory = [];
  
  // Load previous conversations from database (last 2 like other agents)
  if (db && sessionId) {
    try {
      const dbMessages = db.getMessages?.(sessionId) || [];
      const userMessages = dbMessages.filter(m => m.role === 'user').slice(-3, -1);
      
      for (const userMsg of userMessages) {
        const msgIndex = userMsg.message_index;
        
        session.conversationHistory.push({
          role: 'user',
          content: userMsg.content
        });
        
        // Assistant message is at msgIndex + 1 (user=0, ai=1, user=2, ai=3, etc)
        const assistantMsg = dbMessages.find(m => m.role === 'assistant' && m.message_index === msgIndex + 1);
        if (assistantMsg) {
          session.conversationHistory.push({
            role: 'model',
            content: assistantMsg.content
          });
        }
      }
      
      geminiLog(1, 'processGeminiCodeRequest', `Loaded ${userMessages.length} previous conversations`);
    } catch (error) {
      geminiLog(3, 'processGeminiCodeRequest', 'Failed to load history', { error: error.message });
    }
  }
  
  // Add current user prompt
  session.conversationHistory.push({
    role: 'user',
    content: userPrompt
  });
  
  // Build system instruction
  const systemInstruction = instruction
    ? `${SYSTEM_PROMPT}\n\n## Additional Instructions\n${instruction}`
    : SYSTEM_PROMPT;
  
  const MAX_ITERATIONS = 50;
  
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    if (shouldCancel && shouldCancel()) {
      geminiLog(1, 'processGeminiCodeRequest', 'Cancelled by user');
      break;
    }
    
    // Rate limit protection
    if (iteration > 0) {
      await new Promise(r => setTimeout(r, 1500));
    }
    
    geminiLog(1, 'processGeminiCodeRequest', `=== Iteration ${iteration + 1} ===`);
    
    // Build contents for API
    const contents = buildGeminiContents(session.conversationHistory);
    
    // Call Gemini API with streaming
    let response;
    let hasStreamedText = false;
    try {
      response = await callGeminiAPI({
        baseUrl,
        apiKey,
        model,
        contents,
        tools: GEMINI_AGENT_TOOLS,
        systemInstruction,
        onTextChunk: (textDelta) => {
          hasStreamedText = true;
          if (onChunk) onChunk(textDelta, { type: 'text', iteration, streaming: true });
        }
      });
    } catch (error) {
      geminiLog(3, 'processGeminiCodeRequest', 'API Error', { error: error.message });
      if (onChunk) onChunk(`API Error: ${error.message}`, { type: 'error', done: true });
      break;
    }
    
    // Signal text stream complete
    if (hasStreamedText && onChunk) {
      onChunk('', { type: 'text-end', iteration });
    }
    
    // Track usage
    if (response.usageMetadata) {
      totalUsage.prompt_tokens += response.usageMetadata.promptTokenCount || 0;
      totalUsage.completion_tokens += response.usageMetadata.candidatesTokenCount || 0;
    }
    
    // Parse response (text already streamed)
    const parsed = parseGeminiResponse(response);
    
    // Check if complete
    if (parsed.isComplete || (parsed.functionCalls.length === 0 && parsed.finishReason === 'STOP')) {
      // Add model response to history
      session.conversationHistory.push({
        role: 'model',
        parts: response.candidates[0].content.parts
      });
      
      if (onChunk) onChunk('', { type: 'end', done: true });
      break;
    }
    
    // Execute function calls
    if (parsed.functionCalls.length > 0) {
      // Add model response with function calls to history
      session.conversationHistory.push({
        role: 'model',
        parts: response.candidates[0].content.parts
      });
      
      for (const functionCall of parsed.functionCalls) {
        // Send command input to UI
        let displayText = '';
        let actualCommand = '';
        
        if (functionCall.args.commentary) {
          displayText = functionCall.args.commentary;
          if (functionCall.name === 'run_command') {
            actualCommand = functionCall.args.command;
          } else if (functionCall.name === 'edit_file') {
            actualCommand = `<set file="${functionCall.args.file}">`;
          }
        } else if (functionCall.name === 'run_command') {
          displayText = functionCall.args.command;
          actualCommand = functionCall.args.command;
        } else if (functionCall.name === 'edit_file') {
          displayText = `Edit file: ${functionCall.args.file}`;
          actualCommand = `<set file="${functionCall.args.file}">`;
        } else if (functionCall.name === 'update_checklist') {
          displayText = `Update checklist (${functionCall.args.checklist?.length || 0} items)`;
        }
        
        if (displayText) {
          const realCmdTag = actualCommand && actualCommand !== displayText
            ? `<real-cmd>${actualCommand}</real-cmd>`
            : '';
          const commandChunk = `<!--command-input-->\n${displayText}${realCmdTag}\n<!--/command-input-->\n`;
          chunks.push(commandChunk);
          if (onChunk) onChunk(commandChunk, { type: 'command', iteration, toolName: functionCall.name });
        }
        
        // Execute tool (pass iteration for stable toolCallId and db for edit history)
        const result = await executeTool(session, functionCall, false, onChunk, sessionId, iteration, db);
        
        // Add function response to history (Gemini format)
        session.conversationHistory.push({
          role: 'function',
          name: result.name,
          content: result.output
        });
        
        // Send output to UI
        const exitLine = result.exitCode != null ? `\n# Exit Code: ${result.exitCode}` : '';
        const outputChunk = `<!--command-output-->\n${result.output}${exitLine}\n<!--/command-output-->\n\n`;
        chunks.push(outputChunk);
        if (onChunk) onChunk(outputChunk, {
          type: 'output',
          iteration,
          toolName: functionCall.name,
          exitCode: result.exitCode || 0
        });
      }
    }
  }
  
  // Cleanup old sessions
  cleanupGeminiSessions();
  
  return {
    chunks,
    usage: totalUsage,
    cancelled: shouldCancel ? shouldCancel() : false
  };
}

// ===================================
// SESSION MANAGEMENT
// ===================================
function cleanupGeminiSessions() {
  const maxAge = 2 * 60 * 60 * 1000; // 2 hours
  const now = Date.now();
  
  for (const [id, session] of geminiSessions) {
    if (now - session.lastUsed > maxAge) {
      try { session.terminal?.dispose(); } catch {}
      geminiSessions.delete(id);
    }
  }
}

function clearGeminiSession(sessionId) {
  const session = geminiSessions.get(sessionId);
  if (session) {
    session.conversationHistory = [];
    geminiLog(1, 'clearGeminiSession', `Cleared session ${sessionId}`);
  }
}

function disposeGeminiSession(sessionId) {
  const session = geminiSessions.get(sessionId);
  if (session) {
    try { session.terminal?.dispose(); } catch {}
    geminiSessions.delete(sessionId);
  }
}

// ===================================
// EXPORTS
// ===================================
module.exports = {
  processGeminiCodeRequest,
  resolveGeminiConfirmation,
  clearGeminiSession,
  disposeGeminiSession,
  GEMINI_AGENT_TOOLS
};
