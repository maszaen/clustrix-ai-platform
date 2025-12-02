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
const { applySetOperations } = require('./edit-operations');
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
              description: "Brief human-readable explanation of what this command does"
            }
          },
          required: ["command"]
        }
      },
      {
        name: "edit_file",
        description: `Edit a file by replacing, inserting, or deleting lines.

REPLACE LINES: Use range with start and end line numbers
INSERT BEFORE: Use insertBefore with line number  
APPEND TO END: Use append=true
DELETE LINES: Use range with empty content

Line numbers are 1-indexed. Always read the file first to get accurate line numbers.`,
        parameters: {
          type: "object",
          properties: {
            file: {
              type: "string",
              description: "Relative path to the file"
            },
            range_start: {
              type: "integer",
              description: "Start line number for replace/delete (1-indexed)"
            },
            range_end: {
              type: "integer",
              description: "End line number for replace/delete (1-indexed, inclusive)"
            },
            insertBefore: {
              type: "integer",
              description: "Insert content before this line number"
            },
            append: {
              type: "boolean",
              description: "Append content to end of file"
            },
            content: {
              type: "string",
              description: "New content (empty string to delete lines)"
            },
            commentary: {
              type: "string",
              description: "Brief explanation of what you're editing"
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
// GEMINI API CALL
// ===================================
async function callGeminiAPI({ baseUrl, apiKey, model, contents, tools, systemInstruction }) {
  return new Promise((resolve, reject) => {
    // Gemini API endpoint format: /v1beta/models/{model}:generateContent
    // Or for OpenAI-compatible: /v1/chat/completions
    let endpoint;
    let isOpenAICompatible = false;
    
    try {
      // Check if using OpenAI-compatible endpoint (e.g., via proxy or AI Studio)
      if (baseUrl.includes('/v1/') && !baseUrl.includes('/v1beta/')) {
        isOpenAICompatible = true;
        endpoint = new URL(baseUrl.replace(/\/?$/, '') + '/chat/completions');
      } else {
        // Native Gemini API
        let normalizedBase = baseUrl.replace(/\/?$/, '');
        if (!normalizedBase.includes('/v1beta')) {
          normalizedBase += '/v1beta';
        }
        endpoint = new URL(`${normalizedBase}/models/${model}:generateContent`);
        endpoint.searchParams.set('key', apiKey);
      }
    } catch (error) {
      reject(new Error(`Invalid base URL: ${baseUrl}`));
      return;
    }
    
    let body;
    let headers;
    
    if (isOpenAICompatible) {
      // Convert to OpenAI format
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
        tool_choice: 'auto'
      });
      
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(body)
      };
    } else {
      // Native Gemini format
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
    
    geminiLog(1, 'callGeminiAPI', 'Making API request', {
      hostname: endpoint.hostname,
      path: endpoint.pathname,
      model,
      isOpenAICompatible,
      contentsLength: contents.length
    });
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          geminiLog(3, 'callGeminiAPI', 'API error response', {
            statusCode: res.statusCode,
            response: data.slice(0, 500)
          });
          reject(new Error(`Gemini API HTTP ${res.statusCode}: ${data.slice(0, 500)}`));
          return;
        }
        
        try {
          const parsed = JSON.parse(data);
          
          // If OpenAI-compatible, convert response back to Gemini format
          if (isOpenAICompatible && parsed.choices) {
            const choice = parsed.choices[0];
            const converted = {
              candidates: [{
                content: {
                  role: 'model',
                  parts: []
                },
                finishReason: choice.finish_reason === 'tool_calls' ? 'TOOL_CALLS' : 'STOP'
              }],
              usageMetadata: {
                promptTokenCount: parsed.usage?.prompt_tokens || 0,
                candidatesTokenCount: parsed.usage?.completion_tokens || 0
              }
            };
            
            if (choice.message?.content) {
              converted.candidates[0].content.parts.push({ text: choice.message.content });
            }
            
            if (choice.message?.tool_calls) {
              for (const tc of choice.message.tool_calls) {
                converted.candidates[0].content.parts.push({
                  functionCall: {
                    name: tc.function.name,
                    args: JSON.parse(tc.function.arguments)
                  }
                });
              }
            }
            
            resolve(converted);
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error(`Failed to parse Gemini response: ${e.message}`));
        }
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

async function executeEditFile(session, input) {
  const { file, range_start, range_end, insertBefore, append, content } = input;
  
  try {
    let setCommand;
    
    if (append) {
      setCommand = `<set file="${file}" range={-1}>
<![CDATA[
${content}
]]>
</set>`;
    } else if (insertBefore) {
      setCommand = `<set file="${file}" add={${insertBefore}}>
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
      return { success: false, output: 'Error: Must specify range_start/range_end, insertBefore, or append' };
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

async function executeTool(session, functionCall, confirmed, onChunk, sessionId, iteration = 0) {
  const { name, args } = functionCall;
  // Use stable ID based on session + iteration + function name (not timestamp)
  // This ensures the same ID is used for confirmation request and resolution
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
          sessionId
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
      const result = await executeEditFile(session, args);
      return { name, output: result.output };
    }
    
    case 'update_checklist': {
      const checklistText = formatChecklist(args.checklist);
      return { name, output: checklistText };
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
      
      return { name, output: `Error: Unknown tool "${name}". Use run_command, edit_file, or update_checklist.` };
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
        
        const assistantMsg = dbMessages.find(m => m.role === 'assistant' && m.message_index === msgIndex);
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
    
    // Call Gemini API
    let response;
    try {
      response = await callGeminiAPI({
        baseUrl,
        apiKey,
        model,
        contents,
        tools: GEMINI_AGENT_TOOLS,
        systemInstruction
      });
    } catch (error) {
      geminiLog(3, 'processGeminiCodeRequest', 'API Error', { error: error.message });
      const errorChunk = `<!--command-output-->\nAPI Error: ${error.message}\n<!--/command-output-->\n\n`;
      chunks.push(errorChunk);
      if (onChunk) onChunk(errorChunk, { type: 'error', done: true });
      break;
    }
    
    // Track usage
    if (response.usageMetadata) {
      totalUsage.prompt_tokens += response.usageMetadata.promptTokenCount || 0;
      totalUsage.completion_tokens += response.usageMetadata.candidatesTokenCount || 0;
    }
    
    // Parse response
    const parsed = parseGeminiResponse(response);
    
    // Send text content to UI
    if (parsed.text) {
      const cleanedText = parsed.text
        .replace(/^```[\w]*\n?/, '')
        .replace(/\n?```$/, '')
        .replace(/<!END>/g, '')
        .trim();
      
      if (cleanedText) {
        const textChunk = `${cleanedText}\n\n`;
        chunks.push(textChunk);
        if (onChunk) onChunk(textChunk, { type: 'text', iteration, done: false });
      }
    }
    
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
        
        // Execute tool (pass iteration for stable toolCallId)
        const result = await executeTool(session, functionCall, false, onChunk, sessionId, iteration);
        
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
