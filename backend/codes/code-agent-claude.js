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
const fs = require('fs');
const { PowerShellSession } = require('./powershell-session');
const { applySetOperations, undoEdit, getFormattedEditHistory, getFormattedMemory } = require('./edit-operations');
const { detectDangerousCommand } = require('./codes-prompt');
const {
  CLAUDE_AGENT_TOOLS,
  buildClaudeAgentMessages,
  getClaudeAgentTools,
  parseClaudeAgentResponse,
  formatClaudeToolResult,
} = require('./codes-prompt-claude');
const { log: appLog } = require('../../utils/logger');
const { 
  loadHistoryWithSummary,
  checkNeedsSummarization,
  performSummarization,
  formatSummaryForContext,
  estimateHistoryTokens
} = require('./context-manager');
const { executeWebSearch, WEB_SEARCH_TOOL_CLAUDE } = require('./web-search-tool');
const { executeReadImage, READ_IMAGE_TOOL_CLAUDE } = require('./image-tool');

// ===================================
// HIGH IMPACT COMMAND DETECTION (Same as code-agent.js)
// ===================================
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
    'git init',

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

// ===================================
// CONFIRMATION SYSTEM (Like code-agent.js)
// ===================================
const claudeConfirmationPromises = new Map();

function waitForClaudeConfirmation(sessionId, toolCallId) {
  const key = `${sessionId}-${toolCallId}`;

  claudeLog(1, 'waitForClaudeConfirmation', 'Waiting for confirmation', {
    sessionId,
    toolCallId,
    key,
  });

  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      const entry = claudeConfirmationPromises.get(key);
      if (entry && entry.resolve === resolve) {
        claudeConfirmationPromises.delete(key);
        claudeLog(2, 'waitForClaudeConfirmation', 'Confirmation timed out', {
          sessionId,
          toolCallId,
          key,
        });
        resolve({ allowed: false, timedOut: true });
      }
    }, 5 * 60 * 1000); // 5 minutes timeout

    claudeConfirmationPromises.set(key, { resolve, timeoutId });
    claudeLog(1, 'waitForClaudeConfirmation', 'Confirmation promise stored', {
      sessionId,
      toolCallId,
      key,
      mapSize: claudeConfirmationPromises.size,
    });
  });
}

function resolveClaudeConfirmation(sessionId, toolCallId, allowed) {
  const key = `${sessionId}-${toolCallId}`;
  const entry = claudeConfirmationPromises.get(key);

  claudeLog(1, 'resolveClaudeConfirmation', 'Attempting to resolve confirmation', {
    sessionId,
    toolCallId,
    key,
    hasEntry: !!entry,
    mapSize: claudeConfirmationPromises.size,
  });

  if (entry && typeof entry.resolve === 'function') {
    claudeConfirmationPromises.delete(key);
    if (entry.timeoutId) {
      clearTimeout(entry.timeoutId);
    }
    entry.resolve({ allowed, timedOut: false });
    claudeLog(1, 'resolveClaudeConfirmation', 'Confirmation resolved successfully', {
      sessionId,
      toolCallId,
      allowed,
    });
    return true;
  }

  claudeLog(2, 'resolveClaudeConfirmation', 'No pending confirmation found', {
    sessionId,
    toolCallId,
    key,
    mapSize: claudeConfirmationPromises.size,
  });
  return false;
}

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

function claudeLog(level, fn, message, details = {}) {
  try {
    appLog('CLAUDE', level, fn, message, details);
  } catch (error) {
    try {
      // Fallback logging to surface issues during debugging
      console.error('[CLAUDE-AGENT]', message, details, error?.message || error);
    } catch {}
  }
}

function validateWorkspacePath(workspacePath) {
  const fallback = require('os').homedir();

  if (!workspacePath || typeof workspacePath !== 'string') {
    claudeLog(2, 'validateWorkspacePath', 'Missing workspacePath, using os.homedir()', {
      fallback,
    });
    return fallback;
  }

  const normalized = path.resolve(workspacePath);

  try {
    const exists = fs.existsSync(normalized);
    const isDir = exists && fs.statSync(normalized).isDirectory();
    
    claudeLog(1, 'validateWorkspacePath', 'Checking workspace path', {
      workspacePath,
      normalized,
      exists,
      isDir,
      fallback,
    });
    
    if (isDir) {
      return normalized;
    }

    claudeLog(2, 'validateWorkspacePath', 'Workspace does not exist or not directory, using os.homedir()', {
      workspacePath,
      normalized,
      exists,
      isDir,
      fallback,
    });
    return fallback;
  } catch (error) {
    claudeLog(3, 'validateWorkspacePath', 'Workspace validation failed, using os.homedir()', {
      workspacePath,
      normalized,
      fallback,
      error: error?.message,
    });
    return fallback;
  }
}

function getClaudeSession(sessionId, workspacePath) {
  if (!claudeSessions.has(sessionId)) {
    claudeSessions.set(sessionId, {
      conversationHistory: [],  // Native message history only
      terminal: null,
      workspacePath: validateWorkspacePath(workspacePath || require('os').homedir()),
      lastUsed: Date.now(),
    });
  }

  const session = claudeSessions.get(sessionId);
  session.lastUsed = Date.now();

  const normalizedWorkspace = validateWorkspacePath(workspacePath || session.workspacePath || require('os').homedir());
  if (session.workspacePath !== normalizedWorkspace) {
    try { session.terminal?.dispose(); } catch {}
    session.terminal = null;
    session.workspacePath = normalizedWorkspace;
    claudeLog(1, 'getClaudeSession', 'Workspace updated for session', {
      sessionId,
      workspacePath: normalizedWorkspace,
    });
  }

  return session;
}

function ensureClaudeTerminal(session, { forceNew = false, workspacePathOverride } = {}) {
  const normalizedWorkspace = validateWorkspacePath(workspacePathOverride || session.workspacePath || require('os').homedir());
  const workspaceChanged = session.workspacePath !== normalizedWorkspace;
  const shouldRecreate = forceNew || workspaceChanged || !session.terminal || session.terminal.isDisposed;

  if (!shouldRecreate) {
    return session.terminal;
  }

  try { session.terminal?.dispose(); } catch {}

  try {
    session.terminal = new PowerShellSession({ workspacePath: normalizedWorkspace, log: claudeLog });
    session.workspacePath = normalizedWorkspace;
    claudeLog(1, 'ensureClaudeTerminal', 'Created new PowerShell session', {
      workspacePath: normalizedWorkspace,
      executable: session.terminal?.executable,
      cwd: process.cwd(),
    });
  } catch (error) {
    claudeLog(4, 'ensureClaudeTerminal', 'Failed to create PowerShell session', {
      workspacePath: normalizedWorkspace,
      error: error?.message,
    });
    throw error;
  }

  return session.terminal;
}

// ===================================
// CLAUDE API CALL (STREAMING)
// ===================================
async function callClaudeAPI({ baseUrl, apiKey, model, system, messages, tools, onTextChunk }) {
  return new Promise((resolve, reject) => {
    let endpoint;
    try {
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
      stream: true, // Enable streaming
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
      if (res.statusCode < 200 || res.statusCode >= 300) {
        let errorData = '';
        res.on('data', chunk => errorData += chunk);
        res.on('end', () => {
          reject(new Error(`Claude API HTTP ${res.statusCode}: ${errorData.slice(0, 500)}`));
        });
        return;
      }
      
      // Accumulate full response while streaming text
      const fullResponse = {
        content: [],
        stop_reason: null,
        usage: { input_tokens: 0, output_tokens: 0 },
      };
      
      let currentContentBlock = null;
      let currentBlockIndex = -1;
      let buffer = '';
      
      res.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer
        
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr || jsonStr === '[DONE]') continue;
          
          try {
            const event = JSON.parse(jsonStr);
            
            switch (event.type) {
              case 'message_start':
                if (event.message?.usage) {
                  fullResponse.usage.input_tokens = event.message.usage.input_tokens || 0;
                }
                break;
                
              case 'content_block_start':
                currentBlockIndex = event.index;
                currentContentBlock = event.content_block;
                if (currentContentBlock.type === 'text') {
                  currentContentBlock.text = '';
                } else if (currentContentBlock.type === 'tool_use') {
                  currentContentBlock.input = '';
                }
                break;
                
              case 'content_block_delta':
                if (event.delta?.type === 'text_delta' && currentContentBlock?.type === 'text') {
                  const textDelta = event.delta.text || '';
                  currentContentBlock.text += textDelta;
                  // Stream text immediately to UI
                  if (onTextChunk && textDelta) {
                    onTextChunk(textDelta);
                  }
                } else if (event.delta?.type === 'input_json_delta' && currentContentBlock?.type === 'tool_use') {
                  // Accumulate tool input JSON (don't stream this)
                  currentContentBlock.input += event.delta.partial_json || '';
                }
                break;
                
              case 'content_block_stop':
                if (currentContentBlock) {
                  // Parse tool input JSON if it's a tool_use block
                  if (currentContentBlock.type === 'tool_use' && typeof currentContentBlock.input === 'string') {
                    try {
                      currentContentBlock.input = JSON.parse(currentContentBlock.input || '{}');
                    } catch {
                      currentContentBlock.input = {};
                    }
                  }
                  fullResponse.content.push(currentContentBlock);
                }
                currentContentBlock = null;
                break;
                
              case 'message_delta':
                if (event.delta?.stop_reason) {
                  fullResponse.stop_reason = event.delta.stop_reason;
                }
                if (event.usage?.output_tokens) {
                  fullResponse.usage.output_tokens = event.usage.output_tokens;
                }
                break;
                
              case 'message_stop':
                // Message complete
                break;
            }
          } catch (e) {
            claudeLog(2, 'callClaudeAPI', 'Failed to parse SSE event', { line, error: e.message });
          }
        }
      });
      
      res.on('end', () => {
        resolve(fullResponse);
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
async function executeRunCommand(session, command, confirmed = false) {
  // Check for dangerous commands - use same logic as code-agent.js
  if (!confirmed && isHighImpactCommand(command)) {
    // Return confirmation required indicator
    return {
      success: false,
      output: '',
      requiresConfirmation: true,
      command: command,
    };
  }

  let terminal;
  try {
    terminal = ensureClaudeTerminal(session, { forceNew: false });
  } catch (error) {
    return {
      success: false,
      output: `Error: ${error.message}`,
      exitCode: 1,
    };
  }
  let attemptedRecovery = false;

  claudeLog(1, 'executeRunCommand', 'run_command:start', {
    workspacePath: session.workspacePath,
    executable: terminal?.executable,
    command: command.slice(0, 500),
    terminalDisposed: terminal?.isDisposed,
  });

  const runWithTerminal = async () => {
    // Debug: check current location first
    claudeLog(1, 'executeRunCommand', 'Checking current location before command');
    const locationResult = await terminal.run('Get-Location | Select-Object Path');
    claudeLog(1, 'executeRunCommand', 'Current location result', {
      stdout: locationResult.stdout,
      stderr: locationResult.stderr,
      exitCode: locationResult.exitCode,
    });
    
    // Use same logic as code-agent.js - direct command execution without base64 encoding
    const result = await terminal.run(command);
    
    let output = [result.stdout, result.stderr].filter(Boolean).join('\n');

    // Log raw result for debugging
    claudeLog(1, 'executeRunCommand', 'raw_result', {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      stdoutLength: result.stdout.length,
      stderrLength: result.stderr.length,
    });

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
  };

  try {
    const result = await runWithTerminal();
    claudeLog(1, 'executeRunCommand', 'run_command:complete', {
      exitCode: result.exitCode,
      outputPreview: (result.output || '').slice(0, 500),
    });
    return result;
  } catch (error) {
    const busySession = error.message?.includes('PowerShell session is busy running another command');
    const sessionExited = error.message?.includes('PowerShell session exited');

    if ((busySession || sessionExited || terminal.isDisposed) && !attemptedRecovery) {
      attemptedRecovery = true;

      try { session.terminal?.dispose(); } catch {}
      session.terminal = null;
      terminal = ensureClaudeTerminal(session, { forceNew: true });

      try {
        return await runWithTerminal();
      } catch (retryError) {
        error = retryError; // fall through to generic handler
      }
    }

    // Dispose terminal on timeout
    if (error.message.includes('timeout')) {
      try { session.terminal?.dispose(); } catch {}
      session.terminal = null;
    }

    claudeLog(3, 'executeRunCommand', 'run_command:error', {
      workspacePath: session.workspacePath,
      executable: terminal?.executable,
      error: error?.message,
    });

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
async function executeEditFile(session, input, sessionId, db) {
  // Support both camelCase (insertBefore) and snake_case (insert_before)
  const { file, range, insertBefore, insert_before, append, content } = input;
  const insertLine = insertBefore || insert_before;
  
  try {
    // Build <set> command for edit-operations.js
    let setCommand;
    
    if (append) {
      setCommand = `<set file="${file}" range={-1}>
<![CDATA[
${content}
]]>
</set>`;
    } else if (insertLine) {
      setCommand = `<set file="${file}" add={${insertLine}}>
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
        output: 'Error: Must specify range (with start/end), insert_before, or append',
      };
    }
    
    const result = applySetOperations(setCommand, { 
      workspacePath: session.workspacePath,
      sessionId,
      db
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
      editId: result.files?.[0]?.editId || null
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
async function executeTool(session, toolCall, confirmed = false, onChunk = null, sessionId = null, db = null, apiConfig = null) {
  const { name, input, id } = toolCall;
  
  console.log(`[CLAUDE-AGENT] Executing: ${name}`, JSON.stringify(input).slice(0, 150));
  
  switch (name) {
    case 'run_command': {
      const result = await executeRunCommand(session, input.command, confirmed);
      
      // Handle confirmation flow
      if (result.requiresConfirmation) {
        if (onChunk) {
          const confirmationChunk = JSON.stringify({
            type: 'confirmation-required',
            command: input.command,
            toolCallId: id,
            sessionId: sessionId,
          }) + '\n';
          onChunk(confirmationChunk, { type: 'confirmation' });
        }
        
        const confirmation = await waitForClaudeConfirmation(sessionId, id);
        
        if (confirmation.allowed) {
          console.log(`[CLAUDE-AGENT] User confirmed dangerous command: ${input.command}`);
          const confirmedResult = await executeRunCommand(session, input.command, true);
          return formatClaudeToolResult(id, confirmedResult.output, !confirmedResult.success);
        } else {
          const skipMessage = confirmation.timedOut 
            ? 'Command execution timed out - user did not respond within 5 minutes.'
            : 'User skipped this command, do not try again with this command.';
          return formatClaudeToolResult(id, skipMessage, false);
        }
      }
      
      return formatClaudeToolResult(id, result.output, !result.success);
    }
    
    case 'edit_file': {
      const result = await executeEditFile(session, input, sessionId, db);
      let output = result.output;
      if (result.editId) {
        output += `\n\nEdit ID: ${result.editId}`;
      }
      return formatClaudeToolResult(id, output, !result.success);
    }
    
    case 'update_checklist': {
      const checklistText = formatChecklist(input.checklist);
      return formatClaudeToolResult(id, checklistText);
    }
    
    case 'show_history': {
      // Build display text based on what's being shown
      const parts = [];
      if (input.show_memory) parts.push('Memory');
      if (input.show_edit_history) parts.push('Edit History');
      const displayText = parts.length > 0 ? `Show ${parts.join(' & ')}` : 'Show History';
      
      if (onChunk) {
        const commandChunk = `<!--command-input-->\n${displayText}\n<!--/command-input-->\n`;
        onChunk(commandChunk, { type: 'command', toolName: 'show_history' });
      }
      
      let output = '';
      if (input.show_memory) {
        output += '## Explored Files (Memory)\n\n' + getFormattedMemory(sessionId, db);
      }
      if (input.show_edit_history) {
        if (output) output += '\n\n---\n\n';
        output += '## Edit History\n\n' + getFormattedEditHistory(sessionId, db);
      }
      if (!output) {
        output = 'Specify show_memory=true and/or show_edit_history=true';
      }
      return formatClaudeToolResult(id, output);
    }
    
    case 'undo_edit': {
      // Send command-input tag first
      const displayText = `Undo Edit "${input.edit_id}"`;
      if (onChunk) {
        const commandChunk = `<!--command-input-->\n${displayText}\n<!--/command-input-->\n`;
        onChunk(commandChunk, { type: 'command', toolName: 'undo_edit' });
      }
      
      // First, do a dry run to get preview
      const preview = undoEdit(input.edit_id, { 
        workspacePath: session.workspacePath, 
        db, 
        sessionId,
        dryRun: true 
      });
      
      if (!preview.success) {
        return formatClaudeToolResult(id, preview.output, true);
      }
      
      // Undo always requires confirmation
      if (onChunk) {
        const confirmationChunk = JSON.stringify({
          type: 'confirmation-required',
          command: displayText,
          toolCallId: id,
          sessionId: sessionId,
          provider: 'claude',
          preview: preview.output,
        }) + '\n';
        onChunk(confirmationChunk, { type: 'confirmation' });
      }
      
      const confirmation = await waitForClaudeConfirmation(sessionId, id);
      
      if (confirmation.allowed) {
        // Execute actual undo
        const result = undoEdit(input.edit_id, { 
          workspacePath: session.workspacePath, 
          db, 
          sessionId,
          dryRun: false 
        });
        return formatClaudeToolResult(id, result.output, !result.success);
      } else {
        const skipMessage = confirmation.timedOut 
          ? 'Undo operation timed out - user did not respond.'
          : 'User cancelled the undo operation.';
        return formatClaudeToolResult(id, skipMessage, false);
      }
    }
    
    case 'web_search': {
      // Note: command-input tag is emitted in main loop (when commentary exists), not here
      const result = await executeWebSearch(input, db);
      return formatClaudeToolResult(id, result.output, !result.success);
    }
    
    case 'read_image': {
      const result = await executeReadImage(input, {
        workspacePath: session.workspacePath,
        apiConfig: apiConfig || {}
      });
      return formatClaudeToolResult(id, result.output, !result.success);
    }
    
    default:
      return formatClaudeToolResult(id, `Unknown tool: ${name}. Available: run_command, edit_file, update_checklist, show_history, undo_edit, web_search, read_image.`, true);
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
  claudeLog(1, 'processClaudeCodeRequest', 'Starting Claude code request', {
    sessionId,
    workspacePath,
    model,
  });
  const session = getClaudeSession(sessionId, workspacePath);
  const tools = getClaudeAgentTools();
  
  let totalUsage = { prompt_tokens: 0, completion_tokens: 0 };
  const chunks = [];
  
  // Reset conversation history for new request
  session.conversationHistory = [];
  
  // Load previous conversation history with summary support
  let conversationSummary = null;
  let summarizedUntilIndex = -1;
  
  if (db && sessionId) {
    try {
      const historyResult = loadHistoryWithSummary(sessionId, db, model);
      conversationSummary = historyResult.summary;
      summarizedUntilIndex = historyResult.summarizedUntilIndex;
      
      // Add loaded messages to conversation history
      for (const msg of historyResult.messages) {
        if (msg.role === 'user') {
          session.conversationHistory.push({ role: 'user', content: msg.content });
        } else if (msg.role === 'assistant') {
          let assistantContent = msg.content;
          if (typeof assistantContent === 'string') {
            assistantContent = [{ type: 'text', text: assistantContent }];
          }
          session.conversationHistory.push({ role: 'assistant', content: assistantContent });
        }
      }
      
      claudeLog(1, 'processClaudeCodeRequest', 'History loaded', {
        messagesLoaded: historyResult.messages.length,
        hasSummary: !!conversationSummary
      });
    } catch (error) {
      console.error('[CLAUDE-AGENT] Failed to load history:', error.message);
    }
  }
  
  // Build current user prompt - prepend summary if exists
  let currentPrompt = userPrompt;
  if (conversationSummary) {
    currentPrompt = formatSummaryForContext(conversationSummary) + userPrompt;
  }
  
  // Add current user prompt to conversation history
  session.conversationHistory.push({ role: 'user', content: currentPrompt });
  
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
    
    // Check if we need to summarize (context limit reached)
    const limitCheck = checkNeedsSummarization(session.conversationHistory, model);
    if (limitCheck.needsSummarization && db && sessionId) {
      claudeLog(1, 'processClaudeCodeRequest', 'Context limit reached, summarizing...', {
        currentTokens: limitCheck.currentTokens,
        targetTokens: limitCheck.targetTokens
      });
      
      const apiConfig = { baseUrl, apiKey, model, provider: 'anthropic' };
      const summarizeResult = await performSummarization(
        sessionId, db, 
        session.conversationHistory.map((m, i) => ({ ...m, messageIndex: summarizedUntilIndex + i + 1 })),
        conversationSummary,
        summarizedUntilIndex,
        apiConfig,
        onChunk
      );
      
      if (summarizeResult.success) {
        // Update summary state
        conversationSummary = summarizeResult.summary;
        summarizedUntilIndex = summarizeResult.summarizedUntilIndex;
        
        // Reset history with new summary
        session.conversationHistory = [{
          role: 'user',
          content: formatSummaryForContext(conversationSummary) + userPrompt
        }];
        
        claudeLog(1, 'processClaudeCodeRequest', 'History summarized and reset');
      }
    }
    
    // Build messages (NO memory injection - just history)
    const { system, messages } = buildClaudeAgentMessages(
      session.conversationHistory,
      instruction,
      session.workspacePath
    );
    
    // Call Claude API with streaming
    let response;
    let hasStreamedText = false;
    try {
      response = await callClaudeAPI({
        baseUrl,
        apiKey,
        model,
        system,
        messages,
        tools,
        // Stream text chunks directly to UI (no accumulation needed)
        onTextChunk: (textDelta) => {
          hasStreamedText = true;
          if (onChunk) {
            onChunk(textDelta, { type: 'text', iteration, streaming: true });
          }
        },
      });
    } catch (error) {
      console.error('[CLAUDE-AGENT] API Error:', error.message);
      if (onChunk) onChunk(`API Error: ${error.message}`, { type: 'error', done: true });
      break;
    }
    
    // Signal text stream complete (if there was text)
    if (hasStreamedText && onChunk) {
      onChunk('', { type: 'text-end', iteration });
    }
    
    // Track usage
    if (response.usage) {
      totalUsage.prompt_tokens += response.usage.input_tokens || 0;
      totalUsage.completion_tokens += response.usage.output_tokens || 0;
    }
    
    // Parse response for tool calls and metadata
    const parsed = parseClaudeAgentResponse(response);
    
    // Send hidden content if present (following standard format)
    if (parsed.hidden) {
      const hiddenChunk = `<!--hidden-->\n${parsed.hidden}\n<!--/hidden-->\n`;
      chunks.push(hiddenChunk);
      if (onChunk) onChunk(hiddenChunk, { type: 'hidden', iteration, done: false });
    }
    
    // NOTE: Text already streamed via onTextChunk, don't send again
    // Only send checklist if present (following standard format)
    if (parsed.checklist) {
      const header = iteration === 0 ? '\n## Planning:\n' : '\n## Checkpoint Progress:\n';
      const checklistChunk = `${header}${parsed.checklist}\n\n`;
      chunks.push(checklistChunk);
      if (onChunk) onChunk(checklistChunk, { type: 'checklist', iteration, done: false });
    }
    
    // Check if task complete
    if (parsed.isComplete) {
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
      // Text already streamed, just add to history and end
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
        let displayText = '';
        let actualCommand = '';
        
        // Prioritize AI commentary, fallback to humanized command
        if (toolCall.input.commentary) {
          displayText = toolCall.input.commentary;
          // Preserve actual command for icon detection
          if (toolCall.name === 'run_command') {
            actualCommand = toolCall.input.command;
          } else if (toolCall.name === 'edit_file') {
            actualCommand = `<set file="${toolCall.input.file}" range={${toolCall.input.start_line || 1},${toolCall.input.end_line || 1}}>`;
          }
        } else if (toolCall.name === 'run_command') {
          displayText = toolCall.input.command;
          actualCommand = toolCall.input.command;
        } else if (toolCall.name === 'edit_file') {
          displayText = `Edit file: ${toolCall.input.file}`;
          actualCommand = `<set file="${toolCall.input.file}" range={${toolCall.input.start_line || 1},${toolCall.input.end_line || 1}}>`;
        } else if (toolCall.name === 'update_checklist') {
          displayText = `Update checklist (${toolCall.input.checklist.length} items)`;
        } else if (toolCall.name === 'web_search') {
          displayText = `Web search: ${toolCall.input.queries?.slice(0, 2).join(', ')}${toolCall.input.queries?.length > 2 ? '...' : ''}`;
        } else if (toolCall.name === 'read_image') {
          displayText = `Analyze image: ${toolCall.input.image_path}`;
        }
        
        if (displayText) {
          // Include real-cmd tag only if commentary differs from actual command
          const realCmdTag = actualCommand && actualCommand !== displayText ? `<real-cmd>${actualCommand}</real-cmd>` : '';
          const commandChunk = `<!--command-input-->\n${displayText}${realCmdTag}\n<!--/command-input-->\n`;
          chunks.push(commandChunk);
          if (onChunk) onChunk(commandChunk, { 
            type: 'command', 
            iteration, 
            toolName: toolCall.name 
          });
        }
        
        // Execute tool
        const result = await executeTool(session, toolCall, false, onChunk, sessionId, db, { baseUrl, apiKey, model, provider: 'anthropic' });
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
  resolveClaudeConfirmation,
};
