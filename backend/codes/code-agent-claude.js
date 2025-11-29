// ===================================================================
// CLUSTRIX CLAUDE AGENT - NATIVE IMPLEMENTATION
// ===================================================================
//
// This is a clean implementation for Claude models that:
// 1. Uses native tool_use/tool_result (NO manual memory)
// 2. Maintains conversation history naturally via API
// 3. Implements prompt caching for 90% cost reduction
// 4. Uses multiple functional tools instead of meta-tool
//
// Usage: Import processClaudeCodeRequest and use when model is Claude
// ===================================================================

const https = require('https');
const { URL } = require('url');
const path = require('path');
const { PowerShellSession } = require('./powershell-session');
const { applySetOperations } = require('./edit-operations');
const { detectDangerousCommand } = require('./codes-prompt');
const {
  CLAUDE_AGENT_TOOLS,
  buildClaudeAgentMessages,
  getClaudeAgentTools,
  parseClaudeAgentResponse,
  formatClaudeToolResult,
} = require('./codes-prompt-claude');

// ===================================
// CONSTANTS
// ===================================
const MAX_ITERATIONS = 50;
const COMMAND_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_TOOL_OUTPUT_CHARS = 100000; // ~25k tokens

// ===================================
// SESSION STATE (Minimal for Claude)
// ===================================
const claudeSessions = new Map();

function getClaudeSession(sessionId, workspacePath) {
  if (!claudeSessions.has(sessionId)) {
    claudeSessions.set(sessionId, {
      conversationHistory: [],  // Native message history only
      terminal: null,
      workspacePath: workspacePath || process.cwd(),
      lastUsed: Date.now(),
    });
  }
  
  const session = claudeSessions.get(sessionId);
  session.lastUsed = Date.now();
  
  // Ensure terminal
  if (!session.terminal || session.terminal.isDisposed) {
    session.terminal = new PowerShellSession({ 
      workspacePath: session.workspacePath 
    });
  }
  
  return session;
}

// ===================================
// CLAUDE API CALL
// ===================================
async function callClaudeAPI({ baseUrl, apiKey, model, system, messages, tools }) {
  return new Promise((resolve, reject) => {
    let endpoint;
    try {
      // Normalize base URL
      let normalizedBase = baseUrl;
      if (!normalizedBase.includes('/v1')) {
        normalizedBase = normalizedBase.replace(/\/?$/, '/v1');
      }
      endpoint = new URL(normalizedBase.replace(/\/?$/, '') + '/messages');
    } catch (error) {
      reject(new Error(`Invalid base URL: ${baseUrl}`));
      return;
    }
    
    const body = JSON.stringify({
      model,
      max_tokens: 4096,
      system,
      messages,
      tools,
    });
    
    const options = {
      method: 'POST',
      hostname: endpoint.hostname,
      port: endpoint.port || 443,
      path: endpoint.pathname,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`Claude API HTTP ${res.statusCode}: ${data.slice(0, 500)}`));
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse Claude response: ${e.message}`));
        }
      });
    });
    
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ===================================
// EXECUTE POWERSHELL COMMAND
// ===================================
async function executeRunCommand(session, command) {
  // Check for dangerous commands first
  const warnings = detectDangerousCommand(command);
  const blocked = warnings.find(w => w.block);
  
  if (blocked) {
    return {
      success: false,
      output: `⚠️ COMMAND BLOCKED: ${blocked.warning}\n\nSuggestion: ${blocked.suggestion}`,
    };
  }
  
  try {
    const result = await Promise.race([
      session.terminal.run(command),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Command timeout (5 minutes)')), COMMAND_TIMEOUT_MS)
      )
    ]);
    
    let output = [result.stdout, result.stderr].filter(Boolean).join('\n');
    
    // Truncate if too long
    if (output.length > MAX_TOOL_OUTPUT_CHARS) {
      const half = Math.floor(MAX_TOOL_OUTPUT_CHARS / 2);
      output = output.slice(0, half) + 
               `\n\n... [TRUNCATED ${output.length - MAX_TOOL_OUTPUT_CHARS} chars] ...\n\n` +
               output.slice(-half);
    }
    
    return {
      success: result.exitCode === 0,
      output: output || 'Command completed with no output.',
      exitCode: result.exitCode,
    };
  } catch (error) {
    // Dispose terminal on timeout
    if (error.message.includes('timeout')) {
      try { session.terminal?.dispose(); } catch {}
      session.terminal = null;
    }
    
    return {
      success: false,
      output: `Error: ${error.message}`,
      exitCode: 1,
    };
  }
}

// ===================================
// EXECUTE FILE EDIT
// ===================================
async function executeEditFile(session, input) {
  const { file, range, insertBefore, append, content } = input;
  
  try {
    // Build <set> command for edit-operations.js
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
    } else if (range && range.start) {
      const end = range.end || range.start;
      setCommand = `<set file="${file}" range={${range.start}, ${end}}>
<![CDATA[
${content}
]]>
</set>`;
    } else {
      return {
        success: false,
        output: 'Error: Must specify range (with start/end), insertBefore, or append',
      };
    }
    
    const result = applySetOperations(setCommand, { 
      workspacePath: session.workspacePath 
    });
    
    if (!result) {
      return {
        success: false,
        output: 'Error: Could not parse edit operation',
      };
    }
    
    return {
      success: result.success,
      output: result.text || 'Edit completed.',
    };
  } catch (error) {
    return {
      success: false,
      output: `Edit error: ${error.message}`,
    };
  }
}

// ===================================
// CHECKLIST FORMATTING
// ===================================
function formatChecklist(checklist) {
  if (!Array.isArray(checklist) || checklist.length === 0) {
    return 'No checklist items';
  }
  
  const lines = checklist.map(item => {
    let status;
    switch (item.status) {
      case 'completed':
        status = '[x]';
        break;
      case 'in_progress':
        status = '[ ]'; // Convert [/] to [ ] for frontend compatibility
        break;
      case 'pending':
      default:
        status = '[ ]';
        break;
    }
    return `${status} ${item.task}`;
  });
  
  return lines.join('\n');
}

// ===================================
// EXECUTE SINGLE TOOL
// ===================================
async function executeTool(session, toolCall) {
  const { name, input, id } = toolCall;
  
  console.log(`[CLAUDE-AGENT] Executing: ${name}`, JSON.stringify(input).slice(0, 150));
  
  switch (name) {
    case 'run_command': {
      const result = await executeRunCommand(session, input.command);
      return formatClaudeToolResult(id, result.output, !result.success);
    }
    
    case 'edit_file': {
      const result = await executeEditFile(session, input);
      return formatClaudeToolResult(id, result.output, !result.success);
    }
    
    case 'update_checklist': {
      const checklistText = formatChecklist(input.checklist);
      return formatClaudeToolResult(id, checklistText);
    }
    
    default:
      return formatClaudeToolResult(id, `Unknown tool: ${name}`, true);
  }
}

// ===================================
// MAIN AGENT LOOP
// ===================================
async function processClaudeCodeRequest({
  sessionId,
  userPrompt,
  baseUrl,
  apiKey,
  model,
  workspacePath,
  instruction = '',
  onChunk,
  shouldCancel,
  db, // Database for loading chat history
}) {
  const session = getClaudeSession(sessionId, workspacePath);
  const tools = getClaudeAgentTools();
  
  let totalUsage = { prompt_tokens: 0, completion_tokens: 0 };
  const chunks = [];
  
  // Reset conversation history for new request, but load previous conversations
  session.conversationHistory = [];
  
  // Load previous conversation history from database (like other models)
  if (db && sessionId) {
    try {
      const dbMessages = db.getMessages?.(sessionId) || [];
      
      // Get last 2 user messages BEFORE current one (to avoid context limit)
      const userMessages = dbMessages.filter(m => m.role === 'user').slice(-3, -1);
      
      for (const userMsg of userMessages) {
        const msgIndex = userMsg.message_index;
        
        // Add user message
        session.conversationHistory.push({
          role: 'user',
          content: userMsg.content,
        });
        
        // Load and add assistant response for this message
        const assistantMessage = dbMessages.find(m => m.role === 'assistant' && m.message_index === msgIndex);
        if (assistantMessage) {
          // For Claude, assistant content should be in the format expected by API
          // If it's stored as string, convert to text block format
          let assistantContent = assistantMessage.content;
          if (typeof assistantContent === 'string') {
            assistantContent = [{ type: 'text', text: assistantContent }];
          }
          
          session.conversationHistory.push({
            role: 'assistant',
            content: assistantContent,
          });
        }
      }
      
      console.log(`[CLAUDE-AGENT] Loaded ${userMessages.length} previous conversations from database`);
    } catch (error) {
      console.error('[CLAUDE-AGENT] Failed to load conversation history:', error.message);
    }
  }
  
  // Add current user prompt to conversation history
  session.conversationHistory.push({
    role: 'user',
    content: userPrompt,
  });
  
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    // Check cancellation
    if (shouldCancel && shouldCancel()) {
      console.log('[CLAUDE-AGENT] Cancelled by user');
      break;
    }
    
    // Rate limit protection (except first iteration)
    if (iteration > 0) {
      await new Promise(r => setTimeout(r, 1500));
    }
    
    console.log(`\n[CLAUDE-AGENT] === Iteration ${iteration + 1} ===`);
    
    // Build messages (NO memory injection - just history)
    const { system, messages } = buildClaudeAgentMessages(
      session.conversationHistory,
      instruction
    );
    
    // Call Claude API
    let response;
    try {
      response = await callClaudeAPI({
        baseUrl,
        apiKey,
        model,
        system,
        messages,
        tools,
      });
    } catch (error) {
      console.error('[CLAUDE-AGENT] API Error:', error.message);
      const errorChunk = `<!--command-output-->\nAPI Error: ${error.message}\n<!--/command-output-->\n\n`;
      chunks.push(errorChunk);
      if (onChunk) onChunk(errorChunk, { type: 'error', done: true });
      break;
    }
    
    // Track usage
    if (response.usage) {
      totalUsage.prompt_tokens += response.usage.input_tokens || 0;
      totalUsage.completion_tokens += response.usage.output_tokens || 0;
      
      // Log cache stats if available
      if (response.usage.cache_read_input_tokens) {
        console.log(`[CLAUDE-AGENT] Cache hit: ${response.usage.cache_read_input_tokens} tokens`);
      }
    }
    
    // Parse response
    const parsed = parseClaudeAgentResponse(response);
    
    // Send hidden content if present (following standard format)
    if (parsed.hidden) {
      const hiddenChunk = `<!--hidden-->\n${parsed.hidden}\n<!--/hidden-->\n`;
      chunks.push(hiddenChunk);
      if (onChunk) onChunk(hiddenChunk, { type: 'hidden', iteration, done: false });
    }
    
    // Send answer content to UI (using standard format like other models)
    if (parsed.answer) {
      // Clean answer like other models do
      const cleanedAnswer = parsed.answer
        .replace(/^```[\w]*\n?/, '')  // Remove opening code block
        .replace(/\n?```$/, '')      // Remove closing code block
        .trim();
      
      if (cleanedAnswer) {
        const answerChunk = `${cleanedAnswer}\n\n`;  // Add double newline like other models
        chunks.push(answerChunk);
        if (onChunk) onChunk(answerChunk, { type: 'text', iteration, done: false });
      }
    }
    
    // Send checklist if present (following standard format)
    if (parsed.checklist) {
      const header = iteration === 0 ? '\n## Planning:\n' : '\n## Checkpoint Progress:\n';
      const checklistChunk = `${header}${parsed.checklist}\n\n`;
      chunks.push(checklistChunk);
      if (onChunk) onChunk(checklistChunk, { type: 'checklist', iteration, done: false });
    }
    
    // Check if task complete
    if (parsed.isComplete) {
      // Send final answer if present
      if (parsed.answer) {
        const finalAnswerChunk = `${parsed.answer}\n\n`;
        chunks.push(finalAnswerChunk);
        if (onChunk) onChunk(finalAnswerChunk, { type: 'text', iteration, done: false });
      }
      
      // Add assistant message to history
      session.conversationHistory.push({
        role: 'assistant',
        content: response.content,
      });
      
      // Send completion message
      const completeChunk = `Task Complete\n${parsed.completeSummary}\n\n`;
      chunks.push(completeChunk);
      if (onChunk) onChunk(completeChunk, { 
        type: 'complete', 
        done: true,
        filesChanged: parsed.filesChanged 
      });
      break;
    }
    
    // No tool calls and stop_reason is end_turn = conversation complete
    if (parsed.toolCalls.length === 0 && response.stop_reason === 'end_turn') {
      // Send final answer if present
      if (parsed.answer) {
        const finalAnswerChunk = `${parsed.answer}\n\n`;
        chunks.push(finalAnswerChunk);
        if (onChunk) onChunk(finalAnswerChunk, { type: 'text', iteration, done: false });
      }
      
      // Add final assistant message
      session.conversationHistory.push({
        role: 'assistant',
        content: response.content,
      });
      
      if (onChunk) onChunk('', { type: 'end', done: true });
      break;
    }
    
    // Execute tools
    if (parsed.toolCalls.length > 0) {
      // Add assistant message with tool calls to history
      session.conversationHistory.push({
        role: 'assistant',
        content: response.content,
      });
      
      // Execute all tool calls and collect results
      const toolResults = [];
      
      for (const toolCall of parsed.toolCalls) {
        // Send command input to UI (following standard format)
        let commandText = '';
        if (toolCall.name === 'run_command') {
          commandText = toolCall.input.command;
        } else if (toolCall.name === 'edit_file') {
          commandText = `Edit file: ${toolCall.input.file}`;
        } else if (toolCall.name === 'update_checklist') {
          commandText = `Update checklist (${toolCall.input.checklist.length} items)`;
        }
        
        if (commandText) {
          const commandChunk = `<!--command-input-->\n${commandText}\n<!--/command-input-->\n`;
          chunks.push(commandChunk);
          if (onChunk) onChunk(commandChunk, { 
            type: 'command', 
            iteration, 
            toolName: toolCall.name 
          });
        }
        
        // Execute tool
        const result = await executeTool(session, toolCall);
        toolResults.push(result);
        
        // Send command output to UI (following standard format)
        const exitLine = Number.isFinite(result.exitCode) ? `\n# Exit Code: ${result.exitCode}` : '';
        const outputChunk = `<!--command-output-->\n${result.content}${exitLine}\n<!--/command-output-->\n\n`;
        chunks.push(outputChunk);
        if (onChunk) onChunk(outputChunk, { 
          type: 'output', 
          iteration, 
          toolName: toolCall.name,
          exitCode: result.exitCode || 0
        });
      }
      
      // Add tool results to history as user message
      session.conversationHistory.push({
        role: 'user',
        content: toolResults,
      });
    }
  }
  
  // Cleanup old sessions
  cleanupClaudeSessions();
  
  return {
    chunks,
    usage: totalUsage,
    cancelled: shouldCancel ? shouldCancel() : false,
  };
}

// ===================================
// SESSION MANAGEMENT
// ===================================
function cleanupClaudeSessions() {
  const maxAge = 2 * 60 * 60 * 1000; // 2 hours
  const now = Date.now();
  
  for (const [id, session] of claudeSessions) {
    if (now - session.lastUsed > maxAge) {
      try { session.terminal?.dispose(); } catch {}
      claudeSessions.delete(id);
    }
  }
}

function clearClaudeSession(sessionId) {
  const session = claudeSessions.get(sessionId);
  if (session) {
    session.conversationHistory = [];
    console.log(`[CLAUDE-AGENT] Cleared session ${sessionId}`);
  }
}

function disposeClaudeSession(sessionId) {
  const session = claudeSessions.get(sessionId);
  if (session) {
    try { session.terminal?.dispose(); } catch {}
    claudeSessions.delete(sessionId);
  }
}

// ===================================
// EXPORTS
// ===================================
module.exports = {
  processClaudeCodeRequest,
  clearClaudeSession,
  disposeClaudeSession,
  getClaudeSession,
};
