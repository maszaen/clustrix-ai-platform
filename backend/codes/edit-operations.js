const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

function normalizeRelativePath(filePath) {
  return filePath.replace(/\\/g, '/');
}

// Fuzzy file suggestion - find similar files when typo occurs
function findSimilarFiles(workspacePath, targetFile, maxSuggestions = 3) {
  const targetName = path.basename(targetFile).toLowerCase();
  const targetDir = path.dirname(targetFile);
  const searchDir = path.resolve(workspacePath || process.cwd(), targetDir === '.' ? '' : targetDir);
  
  if (!fs.existsSync(searchDir)) {
    // Try parent directory
    const parentDir = path.resolve(workspacePath || process.cwd());
    if (!fs.existsSync(parentDir)) return [];
    return findFilesInDir(parentDir, targetName, maxSuggestions);
  }
  
  return findFilesInDir(searchDir, targetName, maxSuggestions);
}

function findFilesInDir(dir, targetName, maxSuggestions) {
  try {
    const files = fs.readdirSync(dir, { withFileTypes: true });
    const suggestions = [];
    
    for (const file of files) {
      if (!file.isFile()) continue;
      const fileName = file.name.toLowerCase();
      const similarity = calculateSimilarity(targetName, fileName);
      if (similarity > 0.5) { // 50% similarity threshold
        suggestions.push({ name: file.name, similarity });
      }
    }
    
    return suggestions
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, maxSuggestions)
      .map(s => s.name);
  } catch {
    return [];
  }
}

// Simple Levenshtein-based similarity (0-1)
function calculateSimilarity(str1, str2) {
  const len1 = str1.length;
  const len2 = str2.length;
  const maxLen = Math.max(len1, len2);
  if (maxLen === 0) return 1;
  
  // Quick check for exact match or substring
  if (str1 === str2) return 1;
  if (str1.includes(str2) || str2.includes(str1)) return 0.8;
  
  // Levenshtein distance
  const matrix = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));
  for (let i = 0; i <= len1; i++) matrix[i][0] = i;
  for (let j = 0; j <= len2; j++) matrix[0][j] = j;
  
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  
  const distance = matrix[len1][len2];
  return 1 - (distance / maxLen);
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
    if (line === 0) {
      throw new Error('Line numbers are 1-indexed. Use add={1} to insert at the beginning of the file, not add={0}.');
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
  if (start === 0) {
    throw new Error('Line numbers are 1-indexed. Use range={1} or range={1, N} to start from the first line, not range={0}.');
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

    // Clean up git diff output to standard unified diff format
    // Process line by line for precise control
    const lines = output.split('\n');
    const cleanedLines = [];

    for (const line of lines) {
      // Fix diff --git header line
      if (line.startsWith('diff --git')) {
        cleanedLines.push(`diff --git a/${displayPath} b/${displayPath}`);
      }
      // Fix --- line
      else if (line.startsWith('---')) {
        cleanedLines.push(`--- a/${displayPath}`);
      }
      // Fix +++ line
      else if (line.startsWith('+++')) {
        cleanedLines.push(`+++ b/${displayPath}`);
      }
      // Skip index line (optional, but keep for compatibility)
      else if (line.startsWith('index ')) {
        cleanedLines.push(line);
      }
      // Keep all other lines as-is (@@, context, +, -, etc)
      else {
        cleanedLines.push(line);
      }
    }

    const transformed = cleanedLines.join('\n');

    return transformed;
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

// Generate short edit ID
function generateEditId() {
  return `edit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function applySetOperations(command, options = {}) {
  const { workspacePath, sessionId, db } = options;
  const operations = parseSetOperations(command);
  if (!operations) {
    return null;
  }

  // Group operations by file, then sort each group by line number DESCENDING
  // This ensures edits at higher line numbers are applied first,
  // preventing line number shifts from affecting subsequent edits
  const groupedByFile = new Map();
  for (const op of operations) {
    const file = op.file;
    if (!groupedByFile.has(file)) {
      groupedByFile.set(file, []);
    }
    groupedByFile.get(file).push(op);
  }

  // Sort each file's operations by start line DESCENDING (bottom to top)
  const sortedOperations = [];
  for (const [, ops] of groupedByFile) {
    ops.sort((a, b) => {
      const aStart = a.range.start === -1 ? Infinity : a.range.start;
      const bStart = b.range.start === -1 ? Infinity : b.range.start;
      return bStart - aStart; // Descending order
    });
    sortedOperations.push(...ops);
  }

  const filesMap = new Map();

  for (let index = 0; index < sortedOperations.length; index++) {
    const operation = sortedOperations[index];
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
        // Try to find similar files for suggestion
        const suggestions = findSimilarFiles(workspacePath, operation.file);
        let errorMsg = `File not found: ${operation.file}`;
        if (suggestions.length > 0) {
          errorMsg += `\nDid you mean: ${suggestions.join(', ')}?`;
        }
        throw new Error(errorMsg);
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

    // Special handling for empty files and files with only blank lines: ignore range and always append
    const allBlank = lines.length === 0 || lines.every(l => l.trim() === '');
    if (allBlank) {
      if (operation.lines.length === 0) {
        throw new Error('Cannot perform empty operation on empty file.');
      }
      lines.push(...operation.lines);
      const newStart = 1;
      const newEnd = operation.lines.length;
      fileEntry.focusRanges.push({ start: newStart, end: newEnd });
      fileEntry.history.push({
        type: 'create',
        start: 1,
        end: newEnd,
        before: '',
        after: operation.lines.join('\n'),
        timestamp: new Date().toISOString(),
      });
      continue; // Skip normal processing for empty files
    }

    const start = operation.range.start;
    const end = operation.range.end;
    const operationType = operation.range.operation;
    const hasEnd = end !== null && end !== undefined;
    const contentLines = operation.text === '' ? [] : [...operation.lines];

    // Defensive: treat start=-1 or any negative as append (AI sometimes uses range={-1})
    const isAppend = start < 1;

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
    } else if (isAppend) {
      // Append to end - defensive: ignore end value if provided with negative start
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
  }

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

    // Generate edit ID and save to database if available
    const editId = generateEditId();
    const lastHistory = history[history.length - 1] || {};
    
    if (db && sessionId) {
      try {
        db.saveEditHistory(
          sessionId,
          editId,
          relativePath,
          lastHistory.type || 'edit',
          lastHistory.start || null,
          lastHistory.end || null,
          lastHistory.before || '',
          lastHistory.after || '',
          diffText
        );
      } catch (e) {
        // Don't fail edit if DB save fails
        console.error('[EDIT] Failed to save edit history:', e.message);
      }
    }

    results.push({
      editId,
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
    const header = `File: ${result.filePath}\n`;
    const totalLinesChange = `${result.originalLineCount === result.newLineCount ? '' : `Total lines changed from ${result.originalLineCount} to ${result.newLineCount} lines`}`
    const diff = result.diff;
    const snippetText = result.snippets.length === 0
      ? 'No snippet available (file may be empty).'
      : result.snippets.map(snippet => {
          const body = snippet.lines
            .map((line, idx) => {
              const lineNo = snippet.start + idx;
              return `${lineNo}:${line}`;
            })
            .join('\n');
          return `[${snippet.start}-${snippet.end}] ${result.filePath}\n${body}`;
        }).join('\n\n');

    return `${header}${totalLinesChange}\n\n${diff}\n\nChanged file snippet:\n${snippetText}`;
  }).join('\n\n---\n\n');

  return {
    success: true,
    text: formatted,
    files: results,
  };
}

// Apply a single reverse patch to content
function applyReversePatch(content, edit) {
  const lines = content.split(/\r?\n/);
  const beforeLines = edit.before_content ? edit.before_content.split('\n') : [];
  const afterLines = edit.after_content ? edit.after_content.split('\n') : [];
  
  // Handle empty after_content (was an insert operation)
  if (afterLines.length === 0 || (afterLines.length === 1 && afterLines[0] === '')) {
    if (beforeLines.length === 0 || (beforeLines.length === 1 && beforeLines[0] === '')) {
      return { success: true, content }; // Nothing to undo
    }
    // For insert undo: find and remove the before_content (which was inserted)
    const beforeStr = beforeLines.join('\n');
    const contentStr = lines.join('\n');
    const matchIndex = contentStr.indexOf(beforeStr);
    if (matchIndex !== -1) {
      const newContent = contentStr.substring(0, matchIndex) + 
                         contentStr.substring(matchIndex + beforeStr.length);
      // Clean up potential double newlines
      return { success: true, content: newContent.replace(/\n\n\n+/g, '\n\n') };
    }
    return { success: false, error: 'Cannot find inserted content to remove' };
  }
  
  // Handle empty before_content (was a delete operation - need to restore)
  if (beforeLines.length === 0 || (beforeLines.length === 1 && beforeLines[0] === '')) {
    // This was a delete - we need to find where to insert back
    // Use range_start as hint, but verify context
    if (edit.range_start && edit.range_start > 0) {
      const insertIdx = Math.min(edit.range_start - 1, lines.length);
      lines.splice(insertIdx, 0, ...afterLines);
      return { success: true, content: lines.join('\n') };
    }
    return { success: false, error: 'Cannot determine where to restore deleted content' };
  }
  
  // Standard replace undo: find after_content and replace with before_content
  // Strategy 1: Try exact match at original range first
  if (edit.range_start && edit.range_start > 0) {
    const startIdx = edit.range_start - 1;
    const currentSlice = lines.slice(startIdx, startIdx + afterLines.length);
    
    if (currentSlice.join('\n') === afterLines.join('\n')) {
      lines.splice(startIdx, afterLines.length, ...beforeLines);
      return { success: true, content: lines.join('\n') };
    }
  }
  
  // Strategy 2: Fuzzy search - find after_content anywhere in file
  const afterStr = afterLines.join('\n');
  const contentStr = lines.join('\n');
  
  const matchIndex = contentStr.indexOf(afterStr);
  if (matchIndex !== -1) {
    const newContent = contentStr.substring(0, matchIndex) + 
                       beforeLines.join('\n') + 
                       contentStr.substring(matchIndex + afterStr.length);
    return { success: true, content: newContent };
  }
  
  // Strategy 3: Line-by-line fuzzy match (for when whitespace differs slightly)
  for (let i = 0; i <= lines.length - afterLines.length; i++) {
    const slice = lines.slice(i, i + afterLines.length);
    const sliceTrimmed = slice.map(l => l.trim()).join('\n');
    const afterTrimmed = afterLines.map(l => l.trim()).join('\n');
    
    if (sliceTrimmed === afterTrimmed) {
      lines.splice(i, afterLines.length, ...beforeLines);
      return { success: true, content: lines.join('\n') };
    }
  }
  
  // Content has changed - cannot safely undo
  return { 
    success: false, 
    error: `Content mismatch - the edited region has been modified since edit ${edit.id}` 
  };
}

// Cascading undo - undo from newest to target edit
function undoEdit(editId, options = {}) {
  const { workspacePath, db, sessionId, dryRun = false } = options;
  
  if (!db) {
    return { success: false, output: 'Database not available for undo operation.', isWarning: true };
  }
  
  const targetEdit = db.getEditById(editId);
  if (!targetEdit) {
    return { success: false, output: `Edit not found: ${editId}`, isWarning: false };
  }
  
  // Get all edits that need to be undone (from newest to target, inclusive)
  const editsToUndo = db.getEditsAfter(sessionId || targetEdit.session_id, editId);
  if (!editsToUndo || editsToUndo.length === 0) {
    return { success: false, output: `No edits found to undo.`, isWarning: false };
  }
  
  // Group edits by file
  const editsByFile = new Map();
  for (const edit of editsToUndo) {
    if (!editsByFile.has(edit.file_path)) {
      editsByFile.set(edit.file_path, []);
    }
    editsByFile.get(edit.file_path).push(edit);
  }
  
  // Process each file
  const results = [];
  const allEditIds = [];
  let hasConflict = false;
  const conflicts = [];
  
  for (const [filePath, fileEdits] of editsByFile) {
    try {
      const { absolutePath, relativePath } = resolveFilePath(workspacePath, filePath);
      
      // Read current file content
      const currentContent = fs.existsSync(absolutePath) 
        ? fs.readFileSync(absolutePath, 'utf8') 
        : '';
      
      // Apply reverse patches in order (newest first - they're already sorted DESC)
      let workingContent = currentContent;
      const appliedEdits = [];
      
      for (const edit of fileEdits) {
        const result = applyReversePatch(workingContent, edit);
        if (!result.success) {
          hasConflict = true;
          conflicts.push({
            file: relativePath,
            editId: edit.id,
            error: result.error
          });
          break; // Stop processing this file on conflict
        }
        workingContent = result.content;
        appliedEdits.push(edit.id);
      }
      
      if (appliedEdits.length > 0) {
        // Generate diff from current to final state
        const diff = generateUnifiedDiff(currentContent, workingContent, relativePath);
        
        results.push({
          filePath: relativePath,
          absolutePath,
          originalContent: currentContent,
          newContent: workingContent,
          diff,
          editCount: appliedEdits.length,
          editIds: appliedEdits
        });
        
        allEditIds.push(...appliedEdits);
      }
    } catch (error) {
      hasConflict = true;
      conflicts.push({
        file: filePath,
        editId: null,
        error: error.message
      });
    }
  }
  
  // Build output message
  let output = '';
  
  if (editsToUndo.length > 1) {
    output += `[CASCADING UNDO]: This will revert ${editsToUndo.length} edits (from newest to edit ${editId})\n\n`;
    output += `Edits to undo:\n`;
    for (const edit of editsToUndo) {
      const time = new Date(edit.created_at).toLocaleTimeString();
      output += `  • [${edit.id}] ${edit.file_path} - ${edit.operation_type} (${time})\n`;
    }
    output += '\n';
  }
  
  if (hasConflict) {
    output += `❌ CONFLICT DETECTED:\n`;
    for (const conflict of conflicts) {
      output += `  • ${conflict.file}: ${conflict.error}\n`;
    }
    output += `\nSome files have been modified since the edit. Cannot safely undo.\n`;
    return { success: false, output, isWarning: true };
  }
  
  if (results.length === 0) {
    return { success: false, output: 'No changes to apply.', isWarning: false };
  }
  
  // Show diff preview
  output += `📝 Changes to apply:\n\n`;
  for (const result of results) {
    output += `File: ${result.filePath} (${result.editCount} edit${result.editCount > 1 ? 's' : ''})\n`;
    output += result.diff + '\n\n';
  }
  
  // If dry run, return preview without applying
  if (dryRun) {
    return { 
      success: true, 
      output, 
      isWarning: true,
      preview: true,
      results,
      editIds: allEditIds
    };
  }
  
  // Apply changes
  for (const result of results) {
    fs.writeFileSync(result.absolutePath, result.newContent, 'utf8');
  }
  
  // Remove undone edits from history
  if (allEditIds.length > 0) {
    db.deleteEditHistoryBatch(allEditIds);
  }
  
  output += `[DONE] Successfully undone ${allEditIds.length} edit${allEditIds.length > 1 ? 's' : ''}.`;
  
  return { 
    success: true, 
    output,
    isWarning: false,
    editIds: allEditIds,
    results
  };
}

// Get formatted edit history for display
function getFormattedEditHistory(sessionId, db, limit = 10) {
  if (!db) return 'Database not available.';
  
  const edits = db.getEditHistory(sessionId, limit);
  if (!edits || edits.length === 0) {
    return 'No edit history found for this session.';
  }
  
  return edits.map(edit => {
    const time = new Date(edit.created_at).toLocaleTimeString();
    return `[${edit.id}] ${edit.file_path} - ${edit.operation_type} (${time})\n${edit.diff || 'No diff available'}`;
  }).join('\n\n---\n\n');
}

// Get formatted memory for display
function getFormattedMemory(sessionId, db) {
  if (!db) return 'Database not available.';
  
  const memories = db.getMemory(sessionId, null, 'code');
  if (!memories || memories.length === 0) {
    return 'No explored files in memory for this session.';
  }
  
  return memories.map(mem => {
    const lines = Array.isArray(mem.content) ? mem.content : [];
    const preview = lines.slice(0, 5).join('\n');
    const more = lines.length > 5 ? `\n... (${lines.length - 5} more lines)` : '';
    return `[${mem.memory_name}] ${mem.file_path}:${mem.start_line}-${mem.end_line} (${mem.total_lines || '?'} total)\n${preview}${more}`;
  }).join('\n\n');
}

module.exports = {
  parseSetOperations,
  applySetOperations,
  undoEdit,
  getFormattedEditHistory,
  getFormattedMemory,
};