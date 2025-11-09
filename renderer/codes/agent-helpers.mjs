/**
 * @typedef {Object} CodeCommandEntry
 * @property {string} [id]
 * @property {string} [command]
 * @property {string} [output]
 * @property {string} [error]
 * @property {string} [summary]
 * @property {string} [answer]
 * @property {number|null} [iteration]
 * @property {'success'|'failed'|'pending'|'cancelled'} [status]
 * @property {number} [timestamp]
 */

/**
 * @typedef {Object} CodeMetadata
 * @property {string} [workspacePath]
 * @property {string} [workspaceName]
 * @property {string} [originalRequest]
 * @property {number} [iteration]
 * @property {string} [lastRunAt]
 * @property {CodeCommandEntry[]} [commandHistory]
 */

/**
 * @typedef {Object} CodeEnabledSession
 * @property {string} id
 * @property {'code'} type
 * @property {string} [name]
 * @property {CodeMetadata} [code]
 */

/**
 * Patterns that indicate a PowerShell command could have destructive side effects.
 * @type {RegExp[]}
 */
export const CODE_HIGH_IMPACT_PATTERNS = [
  /\bremove-item\b/i,
  /\brm\b/i,
  /\bri\b/i,
  /\brmdir\b/i,
  /\bdel\b/i,
  /\bformat\b/i,
  /\bclear-content\b/i,
  /\bset-content\b/i,
  /\btruncate\b/i,
  /\bstop-service\b/i,
  /\bshutdown\b/i,
  /\brestart-computer\b/i,
];

/**
 * Truncates text to a specific length and appends an ellipsis when exceeded.
 * @param {string} text
 * @param {number} [limit=800]
 * @returns {string}
 */
export function truncateText(text, limit = 800) {
  if (!text) return '';
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

/**
 * Builds a concise summary of PowerShell command output or errors.
 * @param {string} [output='']
 * @param {string} [error='']
 * @returns {string}
 */
export function summarizeCommandOutput(output = '', error = '') {
  const source = error || output || '';
  if (!source) return 'No output produced.';
  const trimmed = source.trim().split(/\r?\n/).slice(0, 6).join(' ');
  return trimmed.length > 180 ? `${trimmed.slice(0, 177)}…` : trimmed;
}

/**
 * Builds the system prompt required for the coding agent flow.
 * @param {CodeEnabledSession} session
 * @param {string} originalPrompt
 * @param {CodeCommandEntry} [lastEntry]
 * @returns {string}
 */
export function buildCodeAgentSystemPrompt(session, originalPrompt, lastEntry) {
  const promptLines = [];
  promptLines.push('You are a PowerShell-based coding assistant helping user fix bugs in code files or any problem.');
  promptLines.push('');
  const basePrompt = originalPrompt || session?.code?.originalRequest || '';
  promptLines.push('=== ORIGINAL USER REQUEST ===');
  promptLines.push(basePrompt || '');
  promptLines.push('');

  promptLines.push('=== COMMAND HISTORY ===');
  const history = Array.isArray(session?.code?.commandHistory) ? session.code.commandHistory : [];
  if (history.length === 0) {
    promptLines.push('- No commands executed yet.');
  } else {
    history.forEach((entry, index) => {
      const summary = entry.summary || summarizeCommandOutput(entry.output, entry.error);
      const commandText = entry.command ? entry.command.replace(/\s+/g, ' ').trim() : '(no command)';
      promptLines.push(`- #${index + 1} ${commandText} → ${summary}`);
    });
  }
  promptLines.push('');

  const last = lastEntry || history[history.length - 1];
  promptLines.push('=== LAST COMMAND ===');
  if (last) {
    promptLines.push(`Command: ${last.command || '(none)'}`);
    const output = last.error ? `Error: ${last.error}` : last.output || '(no output)';
    promptLines.push('Output:');
    promptLines.push(truncateText(output, 1200));
  } else {
    promptLines.push('Command: (none)');
    promptLines.push('Output:');
    promptLines.push('(none)');
  }

  promptLines.push('');
  promptLines.push('=== RESPONSE FORMAT ===');
  promptLines.push('You MUST respond using these XML tags:');
  promptLines.push('');
  promptLines.push('<internal>');
  promptLines.push('(jika ada last command), summarize hasil search atau perubahan apapun itu.');
  promptLines.push('<internal>');
  promptLines.push('<answer>');
  promptLines.push('Your answer, like "baik zaen, saya akan coba cek dlu main.py"');
  promptLines.push('</answer>');
  promptLines.push('<cmd>');
  promptLines.push('Next PowerShell command (optional - only if needed)');
  promptLines.push('</cmd>');
  promptLines.push('');
  promptLines.push('=== DECISION TREE ===');
  promptLines.push('Follow the provided workflow.');

  return promptLines.join('\n');
}

/**
 * Builds the payload of messages sent to the model for the coding agent flow.
 * @param {CodeEnabledSession} session
 * @param {string} originalPrompt
 * @param {CodeCommandEntry} [lastEntry]
 * @returns {{role: 'system'|'user', content: string}[]}
 */
export function buildCodeAgentMessages(session, originalPrompt, lastEntry) {
  const systemPrompt = buildCodeAgentSystemPrompt(session, originalPrompt, lastEntry);
  const messages = [{ role: 'system', content: systemPrompt }];

  if (session?.code?.iteration === 0) {
    messages.push({ role: 'user', content: originalPrompt || session?.code?.originalRequest || '' });
  } else {
    messages.push({ role: 'user', content: 'Continue assisting with the coding task. Provide the next step or final summary if done.' });
  }

  return messages;
}

/**
 * Parses the model response into answer, command, end flag, and internal notes.
 * @param {string} raw
 * @returns {{answer: string, command: string, end: boolean, internal: string}}
 */
export function parseCodeAgentResponse(raw) {
  if (!raw) {
    return { answer: '', command: '', end: false, internal: '' };
  }
  const answerMatch = raw.match(/<answer>([\s\S]*?)<\/answer>/i);
  const cmdMatch = raw.match(/<cmd>([\s\S]*?)<\/cmd>/i);
  const internalMatch = raw.match(/<internal>([\s\S]*?)<\/internal>/i);
  const hasEnd = /<end\s*\/?\s*>/i.test(raw);

  const answer = answerMatch ? answerMatch[1].trim() : raw.trim();
  const command = cmdMatch ? cmdMatch[1].trim() : '';
  const internal = internalMatch ? internalMatch[1].trim() : '';

  return { answer, command, end: hasEnd, internal };
}

/**
 * Detects whether a command should require high-impact confirmation.
 * @param {string} command
 * @returns {boolean}
 */
export function isHighImpactCommand(command) {
  if (!command) return false;
  return CODE_HIGH_IMPACT_PATTERNS.some((pattern) => pattern.test(command));
}
