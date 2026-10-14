const fs = require('fs');
const os = require('os');
const path = require('path');
const { Workspace, clip } = require('../workspace');
const { discoverSkills, scopedInstructions, buildInstructions } = require('../instructions');

let root;
let workspace;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'clustrix-workspace-')); workspace = new Workspace(root); });
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
const put = (file, text) => { fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), text); };

test('requires an existing directory and rejects traversal, .git and null bytes', () => {
  expect(() => new Workspace(path.join(root, 'missing'))).toThrow();
  for (const file of ['../escape', '/etc/passwd', '.git/config', 'a\0b']) expect(() => workspace.resolve(file)).toThrow();
});

test('rejects symlink escapes, including nonexistent descendants and dangling links', () => {
  fs.symlinkSync(os.tmpdir(), path.join(root, 'outside'));
  fs.symlinkSync(path.join(os.tmpdir(), 'nonexistent-clustrix-target'), path.join(root, 'dangling'));
  expect(() => workspace.create({ file: 'outside/new-file', content: 'x' })).toThrow('outside');
  expect(() => workspace.resolve('dangling')).toThrow('Dangling');
});

test('read ranges are numbered and bounded; binary and invalid ranges fail', () => {
  put('large.txt', Array.from({ length: 500 }, (_, i) => `line ${i}`).join('\n'));
  const read = workspace.read({ file: 'large.txt' });
  expect(read.content.startsWith('1: line 0')).toBe(true);
  expect(read.next_line).toBe(201);
  expect(workspace.read({ file: 'large.txt', start_line: 499 }).content).toContain('500: line 499');
  expect(() => workspace.read({ file: 'large.txt', start_line: 0 })).toThrow();
  expect(() => workspace.read({ file: 'large.txt', start_line: 5, end_line: 2 })).toThrow();
  put('binary', '\0abc');
  expect(() => workspace.text('binary')).toThrow('Binary');
});

test('unique exact replacement preserves CRLF and returns diff, revision and undo ID', () => {
  put('a.js', '\uFEFFone\r\ntwo\r\nthree\r\n');
  workspace.read({ file: 'a.js' });
  const result = workspace.edit({ file: 'a.js', old_text: 'one\ntwo', new_text: 'one\nchanged' });
  expect(workspace.text('a.js')).toBe('\uFEFFone\r\nchanged\r\nthree\r\n');
  expect(result.diff).toContain('+changed');
  expect(result.revision).toHaveLength(64);
  workspace.undo({ edit_id: result.edit_id });
  expect(workspace.text('a.js')).toBe('\uFEFFone\r\ntwo\r\nthree\r\n');
});

test('multiple replacements validate atomically, with ambiguity and stale-read protection', () => {
  put('a', 'one two two');
  expect(() => workspace.edit({ file: 'a', old_text: 'one', new_text: 'ONE' })).toThrow('Read');
  workspace.read({ file: 'a' });
  expect(() => workspace.edit({ file: 'a', replacements: [{ old_text: 'one', new_text: 'ONE' }, { old_text: 'two', new_text: 'TWO' }] })).toThrow('Ambiguous');
  expect(workspace.text('a')).toBe('one two two');
  expect(() => workspace.edit({ file: 'a', old_text: 'missing', new_text: 'x' })).toThrow('not found');
  put('a', 'user change');
  expect(() => workspace.edit({ file: 'a', old_text: 'one', new_text: 'x' })).toThrow('changed');
});

test('creation never clobbers and undo refuses intervening user changes', () => {
  workspace.create({ file: 'nested/a', content: 'hello' });
  expect(() => workspace.create({ file: 'nested/a', content: 'oops' })).toThrow();
  const edit = workspace.edit({ file: 'nested/a', old_text: 'hello', new_text: 'hi' });
  put('nested/a', 'user work');
  expect(() => workspace.undo({ edit_id: edit.edit_id })).toThrow('changed');
  expect(workspace.text('nested/a')).toBe('user work');
  expect(() => workspace.undo({ edit_id: 'unknown' })).toThrow('Unknown');
});

test('list and literal search skip dependencies and never follow symlinks', () => {
  put('src/a.js', 'Hello\nworld'); put('src/b.js', 'hello'); put('node_modules/ignore', 'hello');
  fs.symlinkSync(root, path.join(root, 'loop'));
  expect(workspace.list().files).toEqual(['src/a.js', 'src/b.js']);
  expect(workspace.search({ query: 'hello', case_sensitive: false }).matches).toHaveLength(2);
  expect(workspace.search({ query: 'hello', case_sensitive: false, limit: 1 }).truncated).toBe(true);
  expect(() => workspace.search({ query: '' })).toThrow();
  expect(clip('x'.repeat(20000))).toContain('omitted');
});

test('skills are metadata-only until explicitly loaded; scoped instructions respect hierarchy', () => {
  put('AGENTS.md', 'Root rules'); put('src/AGENTS.md', 'Scoped rules'); put('src/a.js', 'a');
  put('.agents/skills/testing/SKILL.md', '---\nname: testing\ndescription: "Use for tests"\n---\nPRIVATE BODY');
  const skills = discoverSkills(workspace);
  expect(skills[0].description).toBe('Use for tests');
  expect(JSON.stringify(skills)).not.toContain('PRIVATE BODY');
  expect(scopedInstructions(workspace, 'src/a.js').map(i => i.content)).toEqual(['Root rules', 'Scoped rules']);
  const built = buildInstructions(workspace, 'User instruction');
  expect(built.system).toContain('User instruction');
  expect(built.system).not.toContain('PRIVATE BODY');
});

test('invalid UTF-8 and writable symlink aliases are rejected without corruption', () => {
  fs.writeFileSync(path.join(root, 'invalid'), Buffer.from([0xff, 0xfe, 0x01]));
  expect(() => workspace.text('invalid')).toThrow();
  put('real', 'data');
  fs.symlinkSync(path.join(root, 'real'), path.join(root, 'alias'));
  workspace.read({ file: 'alias' });
  expect(() => workspace.edit({ file: 'alias', old_text: 'data', new_text: 'oops' })).toThrow('symlink');
  expect(workspace.text('real')).toBe('data');
});

test('skill descriptions support folded metadata, not arbitrary YAML execution', () => {
  const { skillDescription } = require('../instructions');
  expect(skillDescription('---\nname: test\ndescription: >\n  Use when fixing\n  tests and validation.\n---\nbody')).toBe('Use when fixing tests and validation.');
  expect(skillDescription('No metadata')).toContain('Project skill');
});
