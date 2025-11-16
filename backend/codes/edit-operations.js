const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

function normalizeRelativePath(filePath) {
  return filePath.replace(/\\/g, '/');
}

function resolveFilePath(workspacePath, filePath) {
  const normalizedRoot = workspacePath ? path.resolve(workspacePath) : process.cwd();
  const absolutePath = path.resolve(normalizedRoot, filePath);
  const relativeFromRoot = path.relative(normalizedRoot, absolutePath);

  if (relativeFromRoot.startsWith('..')) {
    throw new Error(`File "${filePath}" is outside of the workspace scope.`);
  }

  return {
    absolutePath,
    relativePath: normalizeRelativePath(relativeFromRoot || path.basename(absolutePath)),
  };
}

function extractCDataContent(rawInner) {
  if (!rawInner) return '';
  const cdataMatch = rawInner.match(/<!\[CDATA\[([\s\S]*?)]]>/i);
  if (rawInner.includes('<![CDATA[') && !cdataMatch) {
    throw new Error('CDATA section is not properly closed.');
  }
  if (cdataMatch) {
    let content = cdataMatch[1];
    if (content.startsWith('\r\n')) {
      content = content.slice(2);
    } else if (content.startsWith('\n')) {
      content = content.slice(1);
    }
    return content;
  }
  return rawInner.trim();
}

function parseRange(rangeText) {
  // Check for add={line} first (insert operation)
  const addMatch = rangeText.match(/add\s*=\s*(?:\{([^}]*)\}|"\{([^}]*)\}"|\'\{([^}]*)\}\')/i);
  if (addMatch) {
    const captured = addMatch[1] || addMatch[2] || addMatch[3] || '';
    const line = Number.parseInt(captured.trim(), 10);
    if (!Number.isFinite(line)) {
      throw new Error(`Invalid line value "${captured}" in add attribute.`);
    }
    return { start: line, end: null, operation: 'insert' };
  }

  // Check for range={start, end} or range={start} (replace operation)
  const rangeMatch = rangeText.match(/range\s*=\s*(?:\{([^}]*)\}|"\{([^}]*)\}"|\'\{([^}]*)\}\')/i);
  if (!rangeMatch) {
    throw new Error('Missing range or add attribute on <set> tag. Expected format range={start, end} or add={line}.');
  }
  const captured = rangeMatch[1] || rangeMatch[2] || rangeMatch[3] || '';
  const parts = captured
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    throw new Error('range attribute must include at least a start value.');
  }

  const start = Number.parseInt(parts[0], 10);
  if (!Number.isFinite(start)) {
    throw new Error(`Invalid start value "${parts[0]}" in range attribute.`);
  }

  let end = null;
  if (parts.length > 1) {
    end = Number.parseInt(parts[1], 10);
    if (!Number.isFinite(end)) {
      throw new Error(`Invalid end value "${parts[1]}" in range attribute.`);
    }
  } else {
    // Single value in range means replace that line only
    end = start;
  }

  return { start, end, operation: 'replace' };
}

function parseFileAttribute(attrs) {
  const fileMatch = attrs.match(/file\s*=\s*("([^"]+)"|'([^']+)'|([^\s>]+))/i);
  if (!fileMatch) {
    throw new Error('Missing file attribute on <set> tag. Use file="relative/path".');
  }
  return fileMatch[2] || fileMatch[3] || fileMatch[4];
}

function parseSetOperations(command = '') {
  const matches = [];
  const setRegex = /<set\s+([^>]*?)>([\s\S]*?)<\/set>/gi;
  let match;

  while ((match = setRegex.exec(command)) !== null) {
    matches.push({ attrs: match[1], inner: match[2], index: match.index, length: match[0].length });
  }

  if (matches.length === 0) {
    return null;
  }

  // Ensure no stray text outside <set> tags (besides whitespace)
  const cleaned = command.replace(setRegex, '').trim();
  if (cleaned.length > 0) {
    throw new Error('Commands mixing <set> tags with other text are not supported.');
  }

  const operations = matches.map((entry) => {
    const fileAttr = parseFileAttribute(entry.attrs);
    const range = parseRange(entry.attrs);
    const rawContent = extractCDataContent(entry.inner || '');
    const normalizedText = rawContent.replace(/\r\n/g, '\n');
    let lines = [];
    if (normalizedText !== '') {
      lines = normalizedText.split('\n');
      if (lines.length > 0 && lines[lines.length - 1] === '') {
        lines.pop();
      }
    }

    return {
      file: normalizeRelativePath(fileAttr),
      range,
      text: normalizedText,
      lines,
    };
  });

  return operations;
}

function readFileWithMetadata(filePath) {
  const content = fs.existsSync(filePath)
    ? fs.readFileSync(filePath, 'utf8')
    : null;

  const newline = content && content.includes('\r\n') ? '\r\n' : '\n';
  const trailingNewline = content ? /\r?\n$/.test(content) : false;
  const lines = [];

  if (content && content.length > 0) {
    const rawLines = content.split(/\r?\n/);
    if (trailingNewline) {
      rawLines.pop();
    }
    lines.push(...rawLines);
  }

  return {
    content,
    lines,
    newline,
    trailingNewline,
  };
}

function composeFileContent(lines, newline, trailingNewline) {
  const working = [...lines];
  let shouldAppendNewline = trailingNewline;

  if (working.length > 0 && working[working.length - 1] === '') {
    working.pop();
    shouldAppendNewline = true;
  }

  if (working.length === 0) {
    return '';
  }

  const joined = working.join(newline);
  return shouldAppendNewline ? joined + newline : joined;
}

function generateUnifiedDiff(originalContent, updatedContent, displayPath) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codes-agent-'));
  const originalPath = path.join(tmpDir, 'original');
  const updatedPath = path.join(tmpDir, 'updated');

  try {
    fs.writeFileSync(originalPath, originalContent, 'utf8');
    fs.writeFileSync(updatedPath, updatedContent, 'utf8');

    const diffResult = spawnSync('git', [
      'diff',
      '--no-index',
      '--color=never',
      '-U5',
      originalPath,
      updatedPath,
    ], {
      encoding: 'utf8',
      maxBuffer: 5 * 1024 * 1024,
    });

    if (diffResult.error) {
      return 'Diff unavailable (git not accessible).';
    }

    const output = diffResult.stdout || '';
    if (!output.trim()) {
      return 'No changes detected.';
    }

    return output
      .replace(new RegExp(originalPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), displayPath)
      .replace(new RegExp(updatedPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), displayPath);
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

function computeContextRanges(totalLines, focusRanges) {
  if (totalLines === 0) {
    return [];
  }

  const ranges = focusRanges
    .map(({ start, end }) => {
      const normalizedStart = Math.max(1, start);
      const normalizedEnd = Math.max(normalizedStart, end);
      const contextStart = Math.max(1, normalizedStart - 5);
      const contextEnd = Math.min(totalLines, normalizedEnd + 5);
      return { start: contextStart, end: contextEnd };
    })
    .filter(range => range.start <= range.end);

  if (ranges.length === 0) {
    return [];
  }

  ranges.sort((a, b) => a.start - b.start);
  const merged = [ranges[0]];

  for (let i = 1; i < ranges.length; i += 1) {
    const current = ranges[i];
    const last = merged[merged.length - 1];
    if (current.start <= last.end + 1) {
      last.end = Math.max(last.end, current.end);
    } else {
      merged.push({ ...current });
    }
  }

  return merged;
}

function applySetOperations(command, options = {}) {
  const { workspacePath } = options;
  const operations = parseSetOperations(command);
  if (!operations) {
    return null;
  }

  const filesMap = new Map();

  operations.forEach((operation, index) => {
    if (operation.range.start === undefined || operation.range.start === null) {
      throw new Error('range or add attribute must include start line.');
    }

    const rangeEnd = operation.range.end;
    if (rangeEnd !== null && rangeEnd !== undefined && rangeEnd < operation.range.start) {
      throw new Error(`range end must be greater than or equal to start (found ${operation.range.start}-${rangeEnd}).`);
    }

    if (!filesMap.has(operation.file)) {
      const { absolutePath, relativePath } = resolveFilePath(workspacePath, operation.file);
      const fileData = readFileWithMetadata(absolutePath);
      if (fileData.content === null) {
        throw new Error(`File not found: ${operation.file}`);
      }
      filesMap.set(operation.file, {
        absolutePath,
        relativePath,
        original: fileData,
        lines: [...fileData.lines],
        focusRanges: [],
        history: [],
      });
    }

    const fileEntry = filesMap.get(operation.file);
    const { lines } = fileEntry;

    const start = operation.range.start;
    const end = operation.range.end;
    const operationType = operation.range.operation;
    const isAppend = start === -1;
    const hasEnd = end !== null && end !== undefined;
    const contentLines = operation.text === '' ? [] : [...operation.lines];

    if (isAppend && hasEnd) {
      throw new Error('Append operations (range={-1}) cannot include an end value.');
    }

    if (!isAppend && start < 1) {
      throw new Error(`Invalid start line ${start}. Line numbers must be positive integers or -1 for append.`);
    }

    const result = {
      type: null,
      focusStart: null,
      focusEnd: null,
      start,
      end,
      before: null,
      after: null,
      timestamp: new Date().toISOString(),
    };

    if (operationType === 'replace') {
      // Replace operation: delete start-end, insert new content
      // Allow end to exceed file length - clamp it to file length
      const clampedEnd = end > lines.length ? lines.length : end;
      if (start > lines.length + 1) {
        throw new Error(`Replace start line ${start} is outside of file bounds (${lines.length} lines).`);
      }
      const startIndex = start - 1;
      const deleteCount = clampedEnd - start + 1;
      const removed = lines.slice(startIndex, startIndex + deleteCount);
      lines.splice(startIndex, deleteCount, ...contentLines);

      result.type = 'replace';
      result.focusStart = start;
      result.focusEnd = start + contentLines.length - 1;
      result.before = removed.join('\n');
      result.after = contentLines.join('\n');
    } else if (operationType === 'insert') {
      // Insert operation: add content before start line without deleting
      if (contentLines.length === 0) {
        throw new Error('Insert operations must include content to add.');
      }
      // Allow insert at any line, including beyond file length (append)
      const insertIndex = start <= 1 ? 0 : Math.min(start - 1, lines.length);
      const isAtEnd = insertIndex === lines.length;
      lines.splice(insertIndex, 0, ...contentLines);
      const newStart = insertIndex + 1;
      const newEnd = newStart + contentLines.length - 1;
      result.type = isAtEnd ? 'append' : 'insert';
      result.focusStart = newStart;
      result.focusEnd = newEnd;
      result.before = '';
      result.after = contentLines.join('\n');
    } else if (hasEnd && contentLines.length === 0) {
      // Delete operation (legacy support)
      // Allow end to exceed file length - clamp it to file length
      const clampedEnd = end > lines.length ? lines.length : end;
      if (start > lines.length) {
        throw new Error(`Delete start line ${start} is outside of file bounds (${lines.length} lines).`);
      }
      const startIndex = start - 1;
      const deleteCount = clampedEnd - start + 1;
      const removed = lines.slice(startIndex, startIndex + deleteCount);
      lines.splice(startIndex, deleteCount);

      const focusLine = Math.min(start, lines.length > 0 ? lines.length : 1);
      result.type = 'delete';
      result.focusStart = focusLine;
      result.focusEnd = focusLine;
      result.before = removed.join('\n');
      result.after = '';
    } else if (!hasEnd && isAppend) {
      // Append to end (legacy support)
      if (contentLines.length === 0) {
        throw new Error('Append operations must include content to add.');
      }
      lines.push(...contentLines);
      const newStart = lines.length - contentLines.length + 1;
      const newEnd = lines.length;
      result.type = 'append';
      result.focusStart = newStart;
      result.focusEnd = newEnd;
      result.before = '';
      result.after = contentLines.join('\n');
    } else {
      throw new Error(`Unsupported <set> operation at index ${index}.`);
    }

    fileEntry.focusRanges.push({ start: result.focusStart, end: result.focusEnd });
    fileEntry.history.push({
      type: result.type,
      start,
      end: hasEnd ? end : start,
      before: result.before,
      after: result.after,
      timestamp: result.timestamp,
    });
  });

  const results = [];

  for (const [, entry] of filesMap) {
    const { absolutePath, relativePath, original, lines, focusRanges, history } = entry;
    const newContent = composeFileContent(lines, original.newline, original.trailingNewline);
    const originalContent = original.content ?? '';

    if (newContent === originalContent) {
      continue;
    }

    const effectiveLines = [...lines];
    if (effectiveLines.length > 0 && effectiveLines[effectiveLines.length - 1] === '') {
      effectiveLines.pop();
    }

    const diffText = generateUnifiedDiff(originalContent, newContent, relativePath);
    const contextRanges = computeContextRanges(effectiveLines.length, focusRanges);
    const snippets = contextRanges.map(range => ({
      start: range.start,
      end: range.end,
      lines: effectiveLines.slice(range.start - 1, range.end),
    }));

    fs.writeFileSync(absolutePath, newContent, 'utf8');

    results.push({
      filePath: relativePath,
      absolutePath,
      originalLineCount: original.lines.length,
      newLineCount: effectiveLines.length,
      diff: diffText,
      snippets,
      history,
    });
  }

  if (results.length === 0) {
    return {
      success: true,
      text: 'No file changes were applied (operations resulted in identical content).',
      files: [],
    };
  }

  const formatted = results.map(result => {
    const header = `File: ${result.filePath} (${result.originalLineCount} lines → ${result.newLineCount} lines)`;
    const diff = result.diff;
    const snippetText = result.snippets.length === 0
      ? 'No snippet available (file may be empty).'
      : result.snippets.map(snippet => {
          const body = snippet.lines
            .map((line, idx) => {
              const lineNo = snippet.start + idx;
              return `${lineNo}: ${line}`;
            })
            .join('\n');
          return `[${snippet.start}-${snippet.end}] ${result.filePath}\n${body}`;
        }).join('\n\n');

    return `${header}\n\n${diff}\n\nUpdated Memory Snippet:\n${snippetText}`;
  }).join('\n\n---\n\n');

  return {
    success: true,
    text: formatted,
    files: results,
  };
}

module.exports = {
  parseSetOperations,
  applySetOperations,
};

