const fs = require('fs');
const os = require('os');
const path = require('path');

const { applySetOperations } = require('../edit-operations');

function createWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codes-edit-'));
}

function writeFileLines(dir, fileName, lines) {
  const filePath = path.join(dir, fileName);
  const content = lines.join('\n') + '\n';
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

function readLines(filePath) {
  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter((_, idx, arr) => !(idx === arr.length - 1 && arr[idx] === ''));
}

describe('applySetOperations', () => {
  let workspace;
  const sourceFile = 'sample/test-file.js';

  beforeEach(() => {
    workspace = createWorkspace();
    const lines = Array.from({ length: 50 }, (_, idx) => `line-${idx + 1}`);
    writeFileLines(workspace, sourceFile, lines);
  });

  afterEach(() => {
    if (workspace && fs.existsSync(workspace)) {
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });

  test('replaces a line range and produces diff/snippet', () => {
    const command = `
<set file="${sourceFile}" range={10, 12}>
<![CDATA[
alpha
beta
gamma
]]>
</set>`;

    const result = applySetOperations(command, { workspacePath: workspace });
    expect(result).not.toBeNull();
    expect(result.success).toBe(true);
    expect(result.files).toHaveLength(1);

    const fileEntry = result.files[0];
    expect(fileEntry.filePath).toBe(sourceFile.replace(/\\/g, '/'));
    expect(fileEntry.diff).toContain('@@');
    expect(fileEntry.snippets[0].lines.join('\n')).toContain('alpha');

    const finalLines = readLines(path.join(workspace, sourceFile));
    expect(finalLines[9]).toBe('alpha');
    expect(finalLines[10]).toBe('beta');
    expect(finalLines[11]).toBe('gamma');
  });

  test('deletes a range when CDATA is empty', () => {
    const command = `
<set file="${sourceFile}" range={30, 32}>
<![CDATA[]]>
</set>`;

    const result = applySetOperations(command, { workspacePath: workspace });
    expect(result.success).toBe(true);

    const finalLines = readLines(path.join(workspace, sourceFile));
    expect(finalLines).toHaveLength(47);
    expect(finalLines[29]).toBe('line-33');
  });

  test('inserts new content before a line', () => {
    const command = `
<set file="${sourceFile}" range={5}>
<![CDATA[
insert-a
insert-b
]]>
</set>`;

    const result = applySetOperations(command, { workspacePath: workspace });
    expect(result.success).toBe(true);

    const finalLines = readLines(path.join(workspace, sourceFile));
    expect(finalLines[4]).toBe('insert-a');
    expect(finalLines[5]).toBe('insert-b');
    expect(finalLines[6]).toBe('line-5');
  });

  test('appends content to the end of the file', () => {
    const command = `
<set file="${sourceFile}" range={-1}>
<![CDATA[
tail-one
tail-two
]]>
</set>`;

    const result = applySetOperations(command, { workspacePath: workspace });
    expect(result.success).toBe(true);

    const finalLines = readLines(path.join(workspace, sourceFile));
    expect(finalLines.slice(-2)).toEqual(['tail-one', 'tail-two']);
  });

  test('rejects ranges that exceed file length', () => {
    const command = `
<set file="${sourceFile}" range={100, 110}>
<![CDATA[new content]]>
</set>`;

    expect(() => applySetOperations(command, { workspacePath: workspace })).toThrow('exceeds file length');
  });

  test('rejects ranges where start is greater than end', () => {
    const command = `
<set file="${sourceFile}" range={20, 10}>
<![CDATA[new content]]>
</set>`;

    expect(() => applySetOperations(command, { workspacePath: workspace })).toThrow('greater than or equal to start');
  });

  test('rejects malformed CDATA blocks', () => {
    const command = `
<set file="${sourceFile}" range={5, 6}>
<![CDATA[unterminated
</set>`;

    expect(() => applySetOperations(command, { workspacePath: workspace })).toThrow('CDATA section is not properly closed');
  });
});

