const { clip } = require('./workspace');

/** Preserve existing command cards without showing JSON-escaped file contents or hiding approved commands. */
function describeCall(call) {
  let input;
  try { input = JSON.parse(call.arguments); } catch { return `${call.name}: invalid JSON arguments`; }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return `${call.name}: arguments must be an object`;
  // The existing approval widget does NOT show confirmData.command. The preceding card must show it in full.
  if (call.name === 'run_command') return `${input.command}\nWorking directory: ${input.cwd || '.'}${input.background ? '\nBackground process' : ''}`;
  if (['web_search', 'read_image'].includes(call.name)) return `${call.name}: ${JSON.stringify(input, null, 2)}`;
  const label = input.commentary || `${call.name}${input.file ? `: ${input.file}` : ''}`;
  return clip(label, 1000);
}

/** User-facing feedback stays readable; the model receives separately bounded structured JSON. */
function describeResult(result) {
  if (result.error) return `Error: ${result.error}`;
  if (result.diff !== undefined) return `${result.file}\n${result.diff}\nEdit ID: ${result.edit_id}\nRevision: ${result.revision}`;
  if (result.total_lines !== undefined) return `${result.file} (${result.total_lines} lines)\n${result.content}\n${result.next_line ? `Continue at line ${result.next_line}.\n` : ''}Revision: ${result.revision}`;
  if (result.checklist) return result.checklist.map(item => `- [${item.status === 'completed' ? 'x' : ' '}] ${item.task}${item.status === 'in_progress' ? ' (in progress)' : ''}`).join('\n');
  if (result.process_id) return `${result.output || '(no output)'}\nProcess ID: ${result.process_id}\n${result.running ? 'Running in background.' : `# Exit Code: ${result.exit_code ?? 'terminated'}${result.signal ? ` (${result.signal})` : ''}`}${result.timed_out ? '\nTimed out; termination requested. Do not retry blindly.' : ''}${result.termination_warning ? '\nWarning: ' + result.termination_warning : ''}${result.termination_error ? '\nError: ' + result.termination_error : ''}`;
  if (result.output) return result.output;
  if (result.created) return `Created ${result.file}\nRevision: ${result.revision}`;
  return JSON.stringify(result, null, 2);
}

module.exports = { describeCall, describeResult };
