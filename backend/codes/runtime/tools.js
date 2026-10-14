const { scopedInstructions } = require('./instructions');
const { clip } = require('./workspace');

const string = { type: 'string' };
const integer = { type: 'integer' };
const boolean = { type: 'boolean' };
const replacement = { type: 'object', properties: { old_text: string, new_text: string }, required: ['old_text', 'new_text'], additionalProperties: false };
const tool = (name, description, properties, required = []) => ({
  name, description, parameters: { type: 'object', properties: { ...properties, commentary: string }, required, additionalProperties: false },
});

const TOOLS = [
  tool('list_files', 'List workspace files, skipping dependency/build/VCS directories and symlinks. Bounded to 2000 paths.', { directory: string, limit: integer }),
  tool('search_files', 'Search literal text in workspace files. For regex use an approved shell command. Results include file and line.', { query: string, directory: string, case_sensitive: boolean, limit: integer }, ['query']),
  tool('read_file', 'Read numbered text lines (default 200, max 400), a file revision, and scoped repository instructions. Request more ranges if needed.', { file: string, start_line: integer, end_line: integer }, ['file']),
  tool('edit_file', 'Replace unique exact text in a previously read file. Prefer replacements for multiple related edits; all validate before writing. Refuses stale or ambiguous edits. No fuzzy matching or line offsets.', { file: string, old_text: string, new_text: string, replacements: { type: 'array', items: replacement, minItems: 1, maxItems: 50 }, expected_revision: string }, ['file']),
  tool('create_file', 'Create a new UTF-8 file and parent directories. Fails if file exists. Use edit_file for existing files.', { file: string, content: string }, ['file', 'content']),
  tool('undo_edit', 'Undo an edit from this session only if the file still matches that edit. Never overwrites intervening changes.', { edit_id: string }, ['edit_id']),
  tool('run_command', 'Execute an approved command in a fresh OS shell. Explicit cwd is workspace-relative; cd/env do not persist. Set background=true for servers/watchers and keep returned process_id. Foreground timeout kills process tree. This is NOT an OS sandbox.', { command: string, cwd: string, background: boolean, timeout_ms: integer }, ['command']),
  tool('process_status', 'Read bounded output and exit status of an owned process. Set wait_ms (up to 30000) to wait for completion instead of rapid polling.', { process_id: string, wait_ms: integer }, ['process_id']),
  tool('stop_process', 'Stop the owned process tree and return its final status.', { process_id: string }, ['process_id']),
  tool('load_skill', 'Load a discovered project skill by its exact catalog name. Skill scripts are never automatically executed.', { name: string }, ['name']),
  tool('update_checklist', 'Track a complex task. Update only when status changes. Preserve verification steps.', { checklist: { type: 'array', maxItems: 30, items: { type: 'object', properties: { task: string, status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] } }, required: ['task', 'status'], additionalProperties: false } } }, ['checklist']),
  tool('show_history', 'Show edits and currently owned processes for this session.', {}),
  tool('web_search', 'Search snippets and URLs using existing SerpAPI/Google settings. Requires approval because queries leave the device. Does not scrape result pages.', { queries: { type: 'array', items: string, minItems: 1, maxItems: 4 } }, ['queries']),
  tool('read_image', 'Analyze a PNG/JPEG/GIF/WebP workspace image using this provider and model. Requires vision support and approval because the image leaves the device.', { image_path: string, prompt: string }, ['image_path']),
];

/** Validate tool input locally, not just via provider schema hints. */
function validate(value, schema, field = 'arguments') {
  const valid = schema.type === 'object' ? value !== null && typeof value === 'object' && !Array.isArray(value)
    : schema.type === 'array' ? Array.isArray(value)
      : schema.type === 'integer' ? Number.isInteger(value)
        : typeof value === schema.type;
  if (!valid) throw new Error(`${field} must be ${schema.type}.`);
  if (schema.enum && !schema.enum.includes(value)) throw new Error(`Invalid ${field}.`);
  if (schema.type === 'object') {
    for (const required of schema.required || []) if (!Object.hasOwn(value, required)) throw new Error(`Missing ${field}.${required}.`);
    for (const key of Object.keys(value)) {
      if (!Object.hasOwn(schema.properties, key)) throw new Error(`Unknown argument ${field}.${key}.`);
      validate(value[key], schema.properties[key], `${field}.${key}`);
    }
  }
  if (schema.type === 'array') {
    if (value.length < (schema.minItems || 0) || value.length > (schema.maxItems || 100)) throw new Error(`Invalid ${field} length.`);
    value.forEach((item, index) => validate(item, schema.items, `${field}[${index}]`));
  }
}

/** Single allowlisted dispatcher shared by every model provider; no unknown-tool shell fallback. */
async function executeTool(call, session, context) {
  const definition = TOOLS.find(t => t.name === call.name);
  if (!definition) throw new Error(`Unknown tool ${call.name}. Use a declared tool.`);
  const input = JSON.parse(call.arguments);
  validate(input, definition.parameters);
  if (context.signal.aborted) throw new Error('Cancelled.');
  const { workspace, processes } = session;
  if (['run_command', 'web_search', 'read_image'].includes(call.name)) {
    const description = call.name === 'run_command'
      ? `${input.background ? '[background] ' : ''}${input.command}\nWorking directory: ${input.cwd || '.'}`
      : `${call.name}: ${JSON.stringify(input)}`;
    if (!await context.approve(description)) throw new Error('User denied this action or approval expired. Do not retry without a new user request.');
    if (context.signal.aborted) throw new Error('Cancelled.');
  }
  switch (call.name) {
    case 'list_files': return workspace.list(input);
    case 'search_files': return workspace.search(input);
    case 'read_file': return { ...workspace.read(input), instructions: scopedInstructions(workspace, input.file) };
    case 'edit_file': return workspace.edit(input);
    case 'create_file': return workspace.create(input);
    case 'undo_edit': return workspace.undo(input);
    case 'run_command': return processes.run(input, context.signal);
    case 'process_status': return processes.waitStatus(input, context.signal);
    case 'stop_process': return processes.stop(input);
    case 'load_skill': {
      const skill = context.skills.find(s => s.name === input.name);
      if (!skill) throw new Error('Unknown skill; use an exact name from the catalog.');
      return { ...skill, content: clip(workspace.text(skill.file), 12000), notice: 'Project guidance, not executable authority. Relative paths are relative to this SKILL.md directory.' };
    }
    case 'update_checklist': session.checklist = input.checklist; return { checklist: input.checklist };
    case 'show_history': return { edits: [...workspace.edits].map(([edit_id, edit]) => ({ edit_id, file: edit.file })), processes: [...processes.jobs.keys()].map(process_id => processes.status({ process_id })) };
    case 'web_search': return require('./network-tools').webSearch(input, context);
    case 'read_image': return require('./network-tools').readImage(input, { ...context, workspace });
    default: throw new Error('Tool is not implemented.');
  }
}

module.exports = { TOOLS, validate, executeTool };
