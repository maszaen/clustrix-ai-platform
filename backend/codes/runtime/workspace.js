const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createTwoFilesPatch } = require('diff');
const { validateRelativePath } = require('./path-policy');

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const IGNORED = new Set(['.git', 'node_modules', '.venv', 'vendor', 'dist', 'build', '.next', 'coverage']);
const digest = text => crypto.createHash('sha256').update(text).digest('hex');

/** Bound tool feedback without hiding the fact that information was omitted. */
function clip(text, limit = 16000) {
  text = String(text ?? '');
  if (text.length <= limit) return text;
  if (limit < 120) return text.slice(0, Math.max(0, limit - 15)) + '[... omitted]';
  const side = Math.floor((limit - 100) / 2);
  return `${text.slice(0, side)}\n[... ${text.length - side * 2} characters omitted; request a smaller range ...]\n${text.slice(-side)}`;
}

/** Workspace-confined native I/O. Shell commands are NOT sandboxed by this class. */
class Workspace {
  constructor(root) {
    if (!root || !fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new Error('Select an existing project workspace before coding.');
    this.root = fs.realpathSync(root);
    this.reads = new Map();
    this.edits = new Map();
  }

  /** Resolve existing ancestors too, preventing symlink and ../ escapes for new files. */
  resolve(file = '.') {
    if (typeof file !== 'string' || file.includes('\0')) throw new Error('Invalid workspace path.');
    const absolute = path.resolve(this.root, file);
    const check = candidate => {
      const relative = path.relative(this.root, candidate);
      if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        throw new Error('Path is outside the selected workspace.');
      }
      validateRelativePath(relative);
    };
    check(absolute);
    let ancestor = absolute;
    while (!fs.existsSync(ancestor)) {
      // existsSync follows links; a dangling link must not be mistaken for a new file.
      try { if (fs.lstatSync(ancestor).isSymbolicLink()) throw new Error('Dangling symlink is not permitted.'); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      ancestor = path.dirname(ancestor);
    }
    check(fs.realpathSync(ancestor));
    return absolute;
  }

  /** Read bounded UTF-8 text; refuse binary/oversized files rather than exhausting context. */
  text(file) {
    const absolute = this.resolve(file);
    const stat = fs.statSync(absolute);
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) throw new Error('Expected a text file no larger than 2 MiB.');
    // Refuse undecodable files instead of replacing bytes with U+FFFD on the next edit.
    const content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(fs.readFileSync(absolute));
    if (content.includes('\0')) throw new Error('Binary file: use an appropriate external tool.');
    return content;
  }

  /** Return numbered lines and a revision hash used for optimistic edit concurrency. */
  read({ file, start_line = 1, end_line }) {
    if (!Number.isInteger(start_line) || start_line < 1) throw new Error('start_line must be a positive integer.');
    if (end_line !== undefined && (!Number.isInteger(end_line) || end_line < start_line)) throw new Error('Invalid end_line.');
    const content = this.text(file);
    const lines = content.split('\n');
    const end = Math.min(end_line ?? start_line + 199, start_line + 399, lines.length);
    this.reads.set(this.resolve(file), digest(content));
    return {
      file, revision: digest(content), total_lines: lines.length,
      content: clip(lines.slice(start_line - 1, end).map((line, i) => `${i + start_line}: ${line.replace(/\r$/, '')}`).join('\n')),
      next_line: end < lines.length ? end + 1 : null,
    };
  }

  /** Breadth-first, bounded traversal; never follow directory symlinks. */
  list({ directory = '.', limit = 500 } = {}) {
    const queue = [this.resolve(directory)];
    const files = [];
    let visited = 0;
    limit = Math.max(1, Math.min(Number(limit) || 500, 2000));
    while (queue.length && files.length < limit && visited < 10000) {
      const dir = queue.shift();
      for (const item of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        if (++visited > 10000 || files.length >= limit) break;
        if (IGNORED.has(item.name.toLowerCase()) || item.isSymbolicLink()) continue;
        const full = path.join(dir, item.name);
        if (item.isDirectory()) queue.push(full);
        else if (item.isFile()) files.push(path.relative(this.root, full).split(path.sep).join('/'));
      }
    }
    return { files, truncated: queue.length > 0 || files.length >= limit || visited > 10000 };
  }

  /** Literal search avoids regex denial-of-service and shell quoting overhead. */
  search({ query, directory = '.', case_sensitive = true, limit = 80 }) {
    if (typeof query !== 'string' || !query.length) throw new Error('query must be a nonempty literal string.');
    limit = Math.max(1, Math.min(Number(limit) || 80, 200));
    const listing = this.list({ directory, limit: 2000 });
    const matches = [];
    let skipped = 0;
    let scannedBytes = 0;
    for (const file of listing.files) {
      let text;
      try { text = this.text(file); } catch { skipped++; continue; }
      scannedBytes += Buffer.byteLength(text);
      if (scannedBytes > 16 * 1024 * 1024) return { matches, truncated: true, skipped_files: skipped, notice: 'Search byte budget reached; narrow directory.' };
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if ((case_sensitive ? lines[i] : lines[i].toLowerCase()).includes(case_sensitive ? query : query.toLowerCase())) {
          matches.push({ file, line: i + 1, text: clip(lines[i], 500) });
          if (matches.length >= limit) return { matches, truncated: true, skipped_files: skipped };
        }
      }
    }
    return { matches, truncated: listing.truncated, skipped_files: skipped };
  }

  /** Exact unique text replacement; all replacements validate before any write. */
  edit({ file, old_text, new_text, replacements, expected_revision }) {
    const absolute = this.resolve(file);
    if (fs.lstatSync(absolute).isSymbolicLink()) throw new Error('Edit the real file path, not a symlink.');
    const before = this.text(file);
    const revision = expected_revision || this.reads.get(absolute);
    if (!revision) throw new Error('Read this file before editing.');
    if (revision !== digest(before)) throw new Error('File changed since read. Read again and rebase your edit; nothing was written.');
    const operations = replacements || [{ old_text, new_text }];
    if (!Array.isArray(operations) || !operations.length || operations.length > 50) throw new Error('Provide 1–50 replacements.');
    let after = before;
    const eol = before.includes('\r\n') ? '\r\n' : '\n';
    for (const op of operations) {
      if (typeof op.old_text !== 'string' || !op.old_text || typeof op.new_text !== 'string') throw new Error('Each replacement needs nonempty old_text and string new_text.');
      const oldText = op.old_text.replace(/\r?\n/g, eol);
      const newText = op.new_text.replace(/\r?\n/g, eol);
      const start = after.indexOf(oldText);
      if (start < 0) throw new Error('old_text not found. Use exact current file content; nothing was written.');
      if (after.indexOf(oldText, start + 1) >= 0) throw new Error('Ambiguous old_text. Include more surrounding context; nothing was written.');
      after = after.slice(0, start) + newText + after.slice(start + oldText.length);
    }
    return this.writeRevision(file, before, after);
  }

  /** Exclusive creation cannot accidentally overwrite a user's file. */
  create({ file, content }) {
    if (typeof content !== 'string' || Buffer.byteLength(content) > MAX_FILE_BYTES) throw new Error('Invalid or oversized content.');
    const absolute = this.resolve(file);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, content, { encoding: 'utf8', flag: 'wx' });
    this.reads.set(absolute, digest(content));
    return { file, created: true, revision: digest(content) };
  }

  /** Atomic same-directory replacement preserves permissions and checks the base again. */
  writeRevision(file, before, after) {
    if (Buffer.byteLength(after) > MAX_FILE_BYTES) throw new Error('Edited file exceeds 2 MiB.');
    const absolute = this.resolve(file);
    if (fs.lstatSync(absolute).isSymbolicLink()) throw new Error('Edit the real file path, not a symlink.');
    if (this.text(file) !== before) throw new Error('Concurrent file change; nothing was written.');
    const temp = path.join(path.dirname(absolute), `.clustrix-${crypto.randomUUID()}.tmp`);
    try {
      fs.writeFileSync(temp, after, { encoding: 'utf8', flag: 'wx', mode: fs.statSync(absolute).mode });
      if (this.text(file) !== before) throw new Error('Concurrent file change; nothing was written.');
      fs.renameSync(temp, absolute);
    } finally {
      if (fs.existsSync(temp)) fs.unlinkSync(temp);
    }
    const id = crypto.randomUUID();
    this.edits.set(id, { file, before, after });
    // Undo snapshots have a bounded memory footprint.
    let snapshotBytes = [...this.edits.values()].reduce((sum, edit) => sum + Buffer.byteLength(edit.before) + Buffer.byteLength(edit.after), 0);
    while (this.edits.size > 20 || snapshotBytes > 8 * 1024 * 1024) {
      const oldest = this.edits.keys().next().value;
      const edit = this.edits.get(oldest);
      snapshotBytes -= Buffer.byteLength(edit.before) + Buffer.byteLength(edit.after);
      this.edits.delete(oldest);
    }
    this.reads.set(absolute, digest(after));
    // Bound diff CPU cost on large rewrites. A missing preview must never look like an empty diff.
    const patch = createTwoFilesPatch(file, file, before, after, '', '', { timeout: 100, maxEditLength: 2000 });
    return { file, edit_id: id, revision: digest(after), diff: patch === undefined
      ? '[Diff preview omitted: computation budget reached. The edit was applied; inspect bounded file ranges.]'
      : clip(patch) };
  }

  /** Undo only our exact revision, never clobber intervening user changes. */
  undo({ edit_id }) {
    const edit = this.edits.get(edit_id);
    if (!edit) throw new Error('Unknown/expired edit ID in this session.');
    if (this.text(edit.file) !== edit.after) throw new Error('File changed after this edit; undo refused.');
    const result = this.writeRevision(edit.file, edit.after, edit.before);
    this.edits.delete(edit_id);
    return result;
  }
}

module.exports = { Workspace, clip, digest };
