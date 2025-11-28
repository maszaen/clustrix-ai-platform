const https = require('https');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { PowerShellSession } = require('./powershell-session');
const { applySetOperations } = require('./edit-operations');
const { joinEndpoint } = require('../integration/langchain-helpers');
const { getRipgrepPath } = require('../../utils/ripgrep-path');
const {
  AGENT_STATES,
  PROMPT_FIRST,
  PROMPT_SUBSEQUENT,
  STATIC_SYSTEM_PROMPT,
  detectDangerousCommand,
  buildStatePrompt,
  formatCommandHistory,
  getErrorGuidance,
} = require('./codes-prompt');
const { processClaudeCodeRequest } = require('./code-agent-claude');
const MAX_ITERATIONS = 200;
const MAX_HISTORY = 50;
const MAX_OUTPUT_LINES = 10000; // Increased from 100 to 10000 for full output
const MAX_OUTPUT_LENGTH = 500000; // Increased from 8000 to 500000 for full output
const IDLE_TIMEOUT_MS = 120 * 60 * 1000;
const HISTORY_SUMMARY_LENGTH = 160;
const COMMAND_EXECUTION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes max for command execution
const BACKGROUND_PROCESS_TIMEOUT_MS = 15 * 1000; // 15 seconds for background processes
const COMMAND_APPROVAL_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes for user approval window

// Patterns for detecting background/long-running processes
const BACKGROUND_PROCESS_PATTERNS = [
  // Node.js ecosystem
  /^(npm|yarn|pnpm|bun)\s+(run\s+)?(dev|start|serve|watch|preview)/,
  /^node\s+.*server/,
  /^nodemon/,
  /^ts-node.*server/,
  /^deno\s+run/,
  /^serve(\s+|$)/,

  // Build tools & bundlers
  /vite(\s+|$)/,
  /webpack(-dev-server|\s+serve)/,
  /parcel(\s+|$)/,
  /rollup.*--watch/,
  /esbuild.*--watch/,
  /tsc.*--watch/,

  // Frontend frameworks
  /ng\s+serve/,
  /^react-scripts\s+start/,
  /^next\s+dev/,
  /^nuxt\s+dev/,
  /^gatsby\s+develop/,
  /^svelte-kit\s+dev/,
  /^astro\s+dev/,
  /^remix\s+dev/,
  /^vue-cli-service\s+serve/,
  /^quasar\s+dev/,
  /^expo\s+start/,

  // Python
  /^python\s+-m\s+http\.server/,
  /^python.*manage\.py\s+runserver/,
  /^flask\s+run/,
  /^uvicorn/,
  /^gunicorn/,
  /^streamlit\s+run/,
  /^jupyter\s+(notebook|lab)/,

  // PHP
  /^php\s+(artisan\s+serve|-S\s+)/,
  /^symfony\s+serve/,

  // Ruby
  /^rails\s+(server|s)/,
  /^bundle\s+exec.*server/,
  /^rackup/,
  /^jekyll\s+serve/,
  /^middleman\s+server/,

  // Static site generators
  /^hugo\s+server/,
  /^eleventy.*--serve/,
  /^hexo\s+server/,
  /^docusaurus\s+start/,
  /^mkdocs\s+serve/,

  // Java/JVM
  /^mvn\s+spring-boot:run/,
  /^gradle(w)?\s+(bootRun|run)/,
  /^java.*-jar/,

  // Go
  /^go\s+run/,
  /^(air|fresh)(\s+|$)/,

  // Rust
  /^cargo\s+(run|watch)/,

  // Databases
  /^(mongod|redis-server|mysql|postgres)(\s+|$)/,
  /^neo4j\s+console/,

  // Containers & servers
  /^docker(-compose)?\s+(run|up)/,
  /^(nginx|apache2ctl|caddy)(\s+|$)/,

  // Others
  /^dotnet\s+run/,
  /^mix\s+phx\.server/,
  /^iex.*phx\.server/,
  /live-server/,
  /browser-sync/,
  /http-server/,
];

function isBackgroundProcess(command) {
  const trimmedCommand = command.trim();
  return BACKGROUND_PROCESS_PATTERNS.some(pattern => pattern.test(trimmedCommand));
}

let deps = {
  log: () => { },
  getCodeById: () => null,
  getMemory: () => [],
  saveMemory: () => { },
  deleteMemory: () => { },
  clearAllMemory: () => { },
};

const sessionStates = new Map();
const confirmationPromises = new Map(); // Store pending confirmation promises
let idleTimer = null;

function log(context, level, func, message, details = {}) {
  try {
    deps.log?.(context, level, func, message, details);
  } catch (error) {
    console.debug(`[codes:${func}]`, message, details, error);
  }
}

function ensureIdleTimer() {
  if (idleTimer) return;
  idleTimer = setInterval(() => {
    const now = Date.now();
    for (const [sessionId, state] of sessionStates.entries()) {
      if (now - state.lastUsed > IDLE_TIMEOUT_MS) {
        try {
          state.terminal?.dispose();
        } catch (disposeError) {
          log('CODES', 2, 'ensureIdleTimer', 'Failed to dispose terminal', { sessionId, error: disposeError?.message });
        }
        
        // Clean up any pending confirmation promises for this session
        for (const [key, promiseData] of confirmationPromises.entries()) {
          if (key.startsWith(sessionId)) {
            if (promiseData.timeoutId) {
              clearTimeout(promiseData.timeoutId);
            }
            confirmationPromises.delete(key);
            log('CODES', 1, 'ensureIdleTimer', 'Cleaned up orphaned confirmation promise', { key });
          }
        }
        
        sessionStates.delete(sessionId);
        log('CODES', 1, 'ensureIdleTimer', 'Cleaned up idle session', { sessionId });
      }
    }
  }, 60 * 1000);
  idleTimer.unref?.();
}

function buildMemoryStructures(persistedMemory = []) {
  const memories = { default: { visible: true, files: {} } };
  const activeMemoryNames = ['default'];

  for (const mem of persistedMemory) {
    if (!memories[mem.memory_name]) {
      memories[mem.memory_name] = { visible: true, files: {} };
      activeMemoryNames.push(mem.memory_name);
    }

    if (!memories[mem.memory_name].files[mem.file_path]) {
      memories[mem.memory_name].files[mem.file_path] = { ranges: [], totalLines: mem.total_lines || null };
    }

    memories[mem.memory_name].files[mem.file_path].ranges.push({
      start: mem.start_line,
      end: mem.end_line,
      lines: mem.content,
    });
  }

  return { memories, activeMemoryNames };
}

function getSessionState(sessionId, codeId = null) {
  let state = sessionStates.get(sessionId);
  const desiredMemoryOwnerId = sessionId; // Always use sessionId as memory owner
  const desiredMemoryOwnerType = 'session'; // Always use 'session' as memory owner type

  if (!state) {
    const persistedMemory = desiredMemoryOwnerId ? deps.getMemory?.(desiredMemoryOwnerId, null, desiredMemoryOwnerType) || [] : [];
    const { memories, activeMemoryNames } = buildMemoryStructures(persistedMemory);

    // Clean any corrupted memory ranges loaded from database
    Object.values(memories).forEach(memory => {
      if (memory && memory.files) {
        Object.values(memory.files).forEach(fileMemory => {
          validateAndCleanMemoryRanges(fileMemory);
        });
      }
    });

    state = {
      commandHistory: [],
      conversationHistory: [], // Iteration history within current request
      terminal: null,
      lastUsed: Date.now(),
      iterationCount: 0,
      workspacePath: null,
      instruction: '',
      editHistory: [],
      lastHidden: null, // Store last hidden content for prompt
      lastChecklist: null, // Store last checklist for prompt
      // Memory system: cumulative file view
      memories,
      activeMemoryNames, // Visible memories
      currentMemory: 'default', // Current working memory for auto-saving
      currentState: AGENT_STATES.EXPLORE, // AI-declared current state
      memoryOwnerId: desiredMemoryOwnerId,
      memoryOwnerType: desiredMemoryOwnerType,
      pendingMemoryUpdates: [], // Store memory updates from current iteration to apply in next iteration
    };
    sessionStates.set(sessionId, state);
  } else {
    // Ensure pendingMemoryUpdates exists in existing state
    if (!state.pendingMemoryUpdates) {
      state.pendingMemoryUpdates = [];
    }

    if (!state.memoryOwnerId) {
      state.memoryOwnerId = desiredMemoryOwnerId;
      state.memoryOwnerType = desiredMemoryOwnerType;
    } else if (desiredMemoryOwnerId && state.memoryOwnerId !== desiredMemoryOwnerId) {
      const persistedMemory = deps.getMemory?.(desiredMemoryOwnerId, null, desiredMemoryOwnerType) || [];
      const { memories, activeMemoryNames } = buildMemoryStructures(persistedMemory);

      // Clean any corrupted memory ranges loaded from database
      Object.values(memories).forEach(memory => {
        if (memory && memory.files) {
          Object.values(memory.files).forEach(fileMemory => {
            validateAndCleanMemoryRanges(fileMemory);
          });
        }
      });

      state.memoryOwnerId = desiredMemoryOwnerId;
      state.memoryOwnerType = desiredMemoryOwnerType;
      state.memories = memories;
      state.activeMemoryNames = activeMemoryNames;
      if (!state.memories[state.currentMemory]) {
        state.currentMemory = 'default';
      }
    } else if (desiredMemoryOwnerType && state.memoryOwnerType !== desiredMemoryOwnerType) {
      state.memoryOwnerType = desiredMemoryOwnerType;
    }
  }

  state.lastUsed = Date.now();
  ensureIdleTimer();
  return state;
}

function waitForUserConfirmation(sessionId, iteration) {
  const key = `${sessionId}-${iteration}`;

  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      const entry = confirmationPromises.get(key);
      if (entry && entry.resolve === resolve) {
        confirmationPromises.delete(key);
        resolve({ allowed: false, timedOut: true });
      }
    }, COMMAND_APPROVAL_TIMEOUT_MS);

    confirmationPromises.set(key, { resolve, timeoutId });
  });
}

function resolveUserConfirmation(sessionId, iteration, allowed) {
  const key = `${sessionId}-${iteration}`;
  const entry = confirmationPromises.get(key);

  if (entry && typeof entry.resolve === 'function') {
    confirmationPromises.delete(key);
    if (entry.timeoutId) {
      clearTimeout(entry.timeoutId);
    }
    entry.resolve({ allowed, timedOut: false });
    return true;
  }

  return false;
}

// ============================================================================
// MEMORY SYSTEM: Cumulative file view management
// ============================================================================

function isRangeFullyCovered(ranges = [], startLine, endLine) {
  if (!Array.isArray(ranges) || ranges.length === 0) {
    return false;
  }

  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  let coverageStart = startLine;

  for (const range of sorted) {
    if (range.end < coverageStart) {
      continue;
    }
    if (range.start > coverageStart) {
      return false;
    }
    if (range.end >= endLine) {
      return true;
    }
    coverageStart = range.end + 1;
  }

  return false;
}

function addToMemory(
  state,
  filePath,
  startLine,
  endLine,
  lines,
  memoryName = 'default',
  memoryOwnerId = null,
  totalLines = null
) {
  if (!state.memories[memoryName]) {
    state.memories[memoryName] = { visible: true, files: {} };
  }

  const memory = state.memories[memoryName];
  if (!memory.files[filePath]) {
    memory.files[filePath] = { ranges: [], totalLines: null };
  }

  const fileMemory = memory.files[filePath];
  if (totalLines !== null) {
    fileMemory.totalLines = totalLines;
  }
  const rangeAlreadyCovered = isRangeFullyCovered(fileMemory.ranges, startLine, endLine);
  const newRange = { start: startLine, end: endLine, lines };

  log('CODES', 4, 'addToMemory', 'Adding range to memory', {
    filePath,
    memoryName,
    startLine,
    endLine,
    linesCount: lines.length,
    rangeAlreadyCovered,
    existingRangesCount: fileMemory.ranges.length
  });

  // Merge overlapping or adjacent ranges with proper conflict resolution
  const merged = [];
  let currentRange = newRange;

  for (const existing of fileMemory.ranges) {
    if (currentRange.end < existing.start - 1) {
      // No overlap, current comes before
      merged.push(currentRange);
      currentRange = existing;
    } else if (currentRange.start > existing.end + 1) {
      // No overlap, existing comes before
      merged.push(existing);
    } else {
      // Overlap or adjacent - merge with proper conflict resolution
      const mergedStart = Math.min(currentRange.start, existing.start);
      const mergedEnd = Math.max(currentRange.end, existing.end);
      const mergedLines = [];

      // For overlapping regions, prefer the newer range (currentRange) content
      // For non-overlapping regions, use whichever range covers that area
      for (let i = mergedStart; i <= mergedEnd; i++) {
        const inCurrentRange = i >= currentRange.start && i <= currentRange.end;
        const inExistingRange = i >= existing.start && i <= existing.end;

        if (inCurrentRange && inExistingRange) {
          // Overlapping - prefer current (newer) content
          const currentLine = currentRange.lines[i - currentRange.start];
          mergedLines.push(currentLine !== undefined ? currentLine : '');
        } else if (inCurrentRange) {
          // Only in current range
          const currentLine = currentRange.lines[i - currentRange.start];
          mergedLines.push(currentLine !== undefined ? currentLine : '');
        } else if (inExistingRange) {
          // Only in existing range
          const existingLine = existing.lines[i - existing.start];
          mergedLines.push(existingLine !== undefined ? existingLine : '');
        } else {
          // Gap - should not happen in merged range
          mergedLines.push('');
        }
      }

      currentRange = { start: mergedStart, end: mergedEnd, lines: mergedLines };
    }
  }

  merged.push(currentRange);
  merged.sort((a, b) => a.start - b.start);
  fileMemory.ranges = merged;

  log('CODES', 4, 'addToMemory', 'Memory ranges after merging', {
    filePath,
    memoryName,
    rangesCount: fileMemory.ranges.length,
    totalLines: fileMemory.totalLines
  });

  // Persist to database if memory owner is provided
  if (memoryOwnerId) {
    const ownerType = state?.memoryOwnerType || 'code';
    try {
      deps.saveMemory?.(memoryOwnerId, memoryName, filePath, startLine, endLine, lines, ownerType, fileMemory.totalLines);
    } catch (error) {
      log('CODES', 3, 'addToMemory', 'Failed to persist memory to database', {
        sessionId: memoryOwnerId,
        memoryName,
        filePath,
        error: error?.message || error
      });
    }
  }

  return !rangeAlreadyCovered;
}

function formatMemoryOutput(state) {
  const output = [];
  const visibleMemories = state.activeMemoryNames || ['default'];
  const hiddenMemories = [];

  for (const [memName, memory] of Object.entries(state.memories || {})) {
    if (visibleMemories.includes(memName)) {
      output.push(`===> ACTIVE MEMORY: ${memName} - (All search results are collected here cumulatively)
# IMPORTANT: 
  1. TRUST THE DATA: The content below is the EXACT representation of files in the workspace. If you see syntax errors (e.g., missing braces, incomplete lines) that are NOT followed by an "[unexplored]" marker, they are REAL BUGS in the file that you must fix.
  2. TRUNCATION LOGIC: Files are ONLY truncated where explicitly marked with "[Line X-Y unexplored]".
  3. NO REDUNDANT SEARCH: Using Show-FileWithLineNumber for any line range already stored in memory is strictly forbidden!. If necessary **Target ONLY** the \`[Lines ... unexplored]\` gaps if you need to expand your view.
  4. DYNAMIC UPDATES: This memory is cumulative and strictly up-to-date.
        `);

      for (const [filePath, fileData] of Object.entries(memory.files || {})) {
        // Calculate total explored lines
        let totalExplored = 0;
        for (const range of fileData.ranges) {
          totalExplored += range.lines.length;
        }

        const totalLinesInfo = fileData.totalLines
        ? (totalExplored >= fileData.totalLines
          ? ` (This file is fully explored. Content here is exact, live, always up to date, and reflects every change in the workspace. Searching this file is strictly forbidden. ${fileData.totalLines} lines total)`
          : ` (${fileData.totalLines} lines total, ${totalExplored} explored. Content shown is exact, live, always up to date, and reflects every change in the workspace)`)
        : '';
        // If totalLines is null, try to get it from file system
        if (fileData.totalLines === null) {
          try {
            const fullPath = path.resolve(process.cwd(), filePath);
            if (fs.existsSync(fullPath)) {
              const content = fs.readFileSync(fullPath, 'utf8');
              fileData.totalLines = content.split(/\r?\n/).length;
            }
          } catch (e) {
            // Ignore errors
          }
        }

        output.push(`/${filePath}${totalLinesInfo}`);

        // Debug logging
        console.log('CODES', 4, 'formatMemoryOutput', 'File memory debug', {
          filePath,
          rangesCount: fileData.ranges.length,
          totalLines: fileData.totalLines,
          ranges: fileData.ranges.map(r => ({ start: r.start, end: r.end }))
        });

        for (const range of fileData.ranges) {
          for (let i = 0; i < range.lines.length; i++) {
            const lineNum = range.start + i;
            output.push(`${lineNum}:${range.lines[i]}`);
          }

          // Show gap indicator if there's a next range
          const currentIndex = fileData.ranges.indexOf(range);
          const nextRange = fileData.ranges[currentIndex + 1];
          if (nextRange && nextRange.start > range.end + 1) {
            output.push(`[Lines ${range.end + 1}-${nextRange.start - 1} not explored]`);
          }
        }

        // Add end-of-file unexplored marker
        if (fileData.ranges.length > 0 && fileData.totalLines) {
          const lastRange = fileData.ranges[fileData.ranges.length - 1];
          const lastExploredLine = lastRange.end;
          if (lastExploredLine < fileData.totalLines) {
            output.push(`[Lines ${lastExploredLine + 1}-${fileData.totalLines} unexplored]`);
          }
        }

        output.push(''); // Empty line between files
      }
    } else {
      hiddenMemories.push(memName);
    }
  }

  if (hiddenMemories.length > 0) {
    output.push(`[Hidden memories: ${hiddenMemories.join(', ')}]`);
  }

  return output.join('\n');
}

function hideMemory(state, memoryNames) {
  state.activeMemoryNames = state.activeMemoryNames.filter(
    name => !memoryNames.includes(name)
  );
}

function useMemory(state, memoryNames) {
  // Use-Memory now works like SQL USE - sets current working memory
  // and makes only that memory visible (single memory context)
  if (memoryNames.length === 1) {
    const memoryName = memoryNames[0];
    if (state.memories[memoryName]) {
      state.currentMemory = memoryName;
      state.activeMemoryNames = [memoryName];
    }
  } else {
    // Multiple memories: make them all visible but don't change currentMemory
    for (const name of memoryNames) {
      if (state.memories[name] && !state.activeMemoryNames.includes(name)) {
        state.activeMemoryNames.push(name);
      }
    }
  }
}

function clearMemory(state, memoryNames, memoryOwnerId = null, memoryOwnerType = 'code') {
  for (const name of memoryNames) {
    if (name === '--all') {
      state.memories = { default: { visible: true, files: {} } };
      state.activeMemoryNames = ['default'];
      // Clear all memory from database
      if (memoryOwnerId) {
        try {
          deps.clearAllMemory?.(memoryOwnerId, memoryOwnerType);
        } catch (error) {
          log('CODES', 3, 'clearMemory', 'Failed to clear memory from database', {
            sessionId: memoryOwnerId,
            error: error?.message || error
          });
        }
      }
      return;
    }
    delete state.memories[name];
    state.activeMemoryNames = state.activeMemoryNames.filter(n => n !== name);

    // Delete specific memory from database
    if (memoryOwnerId) {
      try {
        deps.deleteMemory?.(memoryOwnerId, name, memoryOwnerType);
      } catch (error) {
        log('CODES', 3, 'clearMemory', 'Failed to delete memory from database', {
          sessionId: memoryOwnerId,
          memoryName: name,
          error: error?.message || error
        });
      }
    }
  }
}

function clearFileFromMemories(state, filePath) {
  const normalizedPath = filePath.replace(/\\/g, '/');
  Object.values(state.memories || {}).forEach(memory => {
    if (memory && memory.files && memory.files[normalizedPath]) {
      delete memory.files[normalizedPath];
    }
  });
}

function validateAndCleanMemoryRanges(fileMemory) {
  if (!fileMemory.ranges || !Array.isArray(fileMemory.ranges)) {
    fileMemory.ranges = [];
    return;
  }

  // Sort ranges by start line
  fileMemory.ranges.sort((a, b) => a.start - b.start);

  const cleaned = [];
  let current = null;

  for (const range of fileMemory.ranges) {
    // Validate range structure
    if (!range.start || !range.end || !Array.isArray(range.lines)) {
      log('CODES', 3, 'validateAndCleanMemoryRanges', 'Skipping invalid range', { range });
      continue; // Skip invalid ranges
    }

    // Ensure start <= end
    if (range.start > range.end) {
      log('CODES', 3, 'validateAndCleanMemoryRanges', 'Skipping invalid range (start > end)', { range });
      continue; // Skip invalid ranges
    }

    // Ensure lines array length matches range size
    const expectedLength = range.end - range.start + 1;
    if (range.lines.length !== expectedLength) {
      log('CODES', 3, 'validateAndCleanMemoryRanges', 'Fixing range lines length', {
        expected: expectedLength,
        actual: range.lines.length,
        range: { start: range.start, end: range.end }
      });
      // Try to fix by truncating or padding
      if (range.lines.length > expectedLength) {
        range.lines = range.lines.slice(0, expectedLength);
      } else {
        while (range.lines.length < expectedLength) {
          range.lines.push('');
        }
      }
    }

    if (!current) {
      current = { ...range };
    } else if (range.start <= current.end + 1) {
      // Merge overlapping or adjacent ranges
      const mergedStart = Math.min(current.start, range.start);
      const mergedEnd = Math.max(current.end, range.end);
      const mergedLines = [];

      for (let i = mergedStart; i <= mergedEnd; i++) {
        const inCurrent = i >= current.start && i <= current.end;
        const inRange = i >= range.start && i <= range.end;

        if (inCurrent && inRange) {
          // Overlapping - prefer the later range (more recent)
          const rangeLine = range.lines[i - range.start];
          mergedLines.push(rangeLine !== undefined ? rangeLine : '');
        } else if (inCurrent) {
          const currentLine = current.lines[i - current.start];
          mergedLines.push(currentLine !== undefined ? currentLine : '');
        } else if (inRange) {
          const rangeLine = range.lines[i - range.start];
          mergedLines.push(rangeLine !== undefined ? rangeLine : '');
        } else {
          mergedLines.push('');
        }
      }

      current = { start: mergedStart, end: mergedEnd, lines: mergedLines };
    } else {
      // No overlap, add current and start new
      cleaned.push(current);
      current = { ...range };
    }
  }

  if (current) {
    cleaned.push(current);
  }

  // Validate final ranges don't have gaps or overlaps
  for (let i = 1; i < cleaned.length; i++) {
    const prev = cleaned[i - 1];
    const curr = cleaned[i];
    if (prev.end >= curr.start) {
      log('CODES', 2, 'validateAndCleanMemoryRanges', 'Warning: overlapping ranges after cleaning', {
        prev: { start: prev.start, end: prev.end },
        curr: { start: curr.start, end: curr.end }
      });
    }
  }

  fileMemory.ranges = cleaned;
}

function cleanMemoryCorruption(state) {
  // Clean all memory ranges to prevent corruption
  Object.values(state.memories || {}).forEach(memory => {
    if (memory && memory.files) {
      Object.values(memory.files).forEach(fileMemory => {
        validateAndCleanMemoryRanges(fileMemory);
      });
    }
  });
}

function captureFileOutput(state, command, output, memoryName, memoryOwnerId = null) {
  // NEW DELAYED UPDATE LOGIC:
  // Instead of immediately calling addToMemory, we return pending updates
  // to be applied in the NEXT iteration (delayed update pattern)

  // Parse Show-FileWithLineNumbers output
  // Format: "001: line content"
  const showFileMatch = command.match(/Show-FileWithLineNumbers\s+-Path\s+"?([^"\s]+)"?/i);
  if (showFileMatch) {
    const filePath = showFileMatch[1].replace(/\\/g, '/');
    const lines = output.split(/\r?\n/);
    const parsedLines = [];
    let minLine = Infinity;
    let maxLine = -Infinity;
    let totalLines = null;

    for (const line of lines) {
      const totalMatch = line.match(/^\[Total lines in file: (\d+)\]$/);
      if (totalMatch) {
        totalLines = parseInt(totalMatch[1], 10);
        continue;
      }

      const match = line.match(/^(\d+):(.*)$/);
      if (match) {
        const lineNum = parseInt(match[1], 10);
        parsedLines[lineNum] = match[2];
        minLine = Math.min(minLine, lineNum);
        maxLine = Math.max(maxLine, lineNum);
      }
    }

    if (parsedLines.length > 0) {
      const actualLines = [];
      for (let i = minLine; i <= maxLine; i++) {
        actualLines.push(parsedLines[i] !== undefined ? parsedLines[i] : '');
      }
      // Return pending update instead of applying immediately
      return {
        captured: true,
        pendingUpdate: {
          filePath,
          minLine,
          maxLine,
          lines: actualLines,
          memoryName,
          memoryOwnerId,
          totalLines
        }
      };
    }

    // Fallback: if structured parsing fails, still stash raw lines into memory
    const rawContent = lines
      .filter(line => !/^\[Total lines in file:/i.test(line) && line.trim() !== '')
      .map((line, idx) => {
        const m = line.match(/^\s*\d+\s*:\s?(.*)$/);
        return m ? m[1] : line;
      });

    if (rawContent.length > 0) {
      return {
        captured: true,
        pendingUpdate: {
          filePath,
          minLine: 1,
          maxLine: rawContent.length,
          lines: rawContent,
          memoryName,
          memoryOwnerId,
          totalLines: totalLines || rawContent.length
        }
      };
    }
    return false;
  }

  // Parse Search-InFiles / ripgrep output
  // Format: "path/to/file.js:123: content"
  const searchMatch = command.match(/Search-InFiles|rg\s/i);
  if (searchMatch) {
    const lines = output.split(/\r?\n/);
    const fileMatches = {};

    for (const rawLine of lines) {
      const trimmed = rawLine.trimEnd();
      if (!trimmed || trimmed.startsWith('Search result saved to memory') || trimmed.startsWith('Searching for pattern') || trimmed.startsWith('Using ripgrep') || trimmed.startsWith('Exit Code')) {
        continue;
      }

      const lineMatch = trimmed.match(/^([^:]+):(\d+):(.*)$/);
      if (lineMatch) {
        const filePath = lineMatch[1].replace(/\\/g, '/').replace(/^\.\/+/, '');
        const lineNum = parseInt(lineMatch[2], 10);
        const content = lineMatch[3] || '';

        if (!fileMatches[filePath]) {
          fileMatches[filePath] = [];
        }
        fileMatches[filePath].push({ lineNum, content });
      }
    }

    // Collect all pending updates for search results
    const pendingUpdates = [];
    for (const [filePath, matches] of Object.entries(fileMatches)) {
      if (matches.length === 0) continue;

      // Sort matches by line number
      matches.sort((a, b) => a.lineNum - b.lineNum);

      // Group into ranges
      const ranges = [];
      let currentRange = { start: matches[0].lineNum, end: matches[0].lineNum, lines: [] };

      for (const match of matches) {
        if (match.lineNum <= currentRange.end + 1) {
          // Extend current range
          currentRange.end = Math.max(currentRange.end, match.lineNum);
        } else {
          // Start new range
          ranges.push(currentRange);
          currentRange = { start: match.lineNum, end: match.lineNum, lines: [] };
        }
      }
      ranges.push(currentRange);

      // For each range, create pending update
      for (const range of ranges) {
        const lines = [];
        for (let i = range.start; i <= range.end; i++) {
          const match = matches.find(m => m.lineNum === i);
          lines.push(match ? match.content : '');
        }
        pendingUpdates.push({
          filePath,
          minLine: range.start,
          maxLine: range.end,
          lines,
          memoryName,
          memoryOwnerId
        });
      }
    }

    if (pendingUpdates.length > 0) {
      return { captured: true, pendingUpdates };
    }
  }

  return false;
}

function truncateOutput(output, mode = 'full') {
  if (!output) return '';
  const allLines = output.split(/\r?\n/);

  // Mode: 'older' = 10 lines, 'last' = 5 lines, 'full' = 10000 lines, 'unlimited' = no limit
  let maxLines;
  if (mode === 'older') maxLines = 10;
  else if (mode === 'last') maxLines = 5;
  else if (mode === 'unlimited') maxLines = Infinity;
  else maxLines = MAX_OUTPUT_LINES;

  const lines = maxLines === Infinity ? allLines : allLines.slice(0, maxLines);
  let joined = lines.join('\n');

  // Add "X more lines" indicator if truncated
  if ((mode === 'older' || mode === 'last') && allLines.length > maxLines) {
    joined += `\n... (${allLines.length - maxLines} more lines)`;
  }

  if (mode !== 'unlimited' && joined.length > MAX_OUTPUT_LENGTH) {
    joined = joined.slice(0, MAX_OUTPUT_LENGTH) + '\n…';
  }
  return joined;
}

function summarizeOutput(output = '', exitCode = 0) {
  const normalized = output.trim();
  if (!normalized) {
    return exitCode === 0 ? 'No output' : `Exit code ${exitCode}`;
  }
  const singleLine = normalized.replace(/\s+/g, ' ');
  if (singleLine.length <= HISTORY_SUMMARY_LENGTH) {
    return singleLine;
  }
  return `${singleLine.slice(0, HISTORY_SUMMARY_LENGTH)}…`;
}


function getLastCommand(history = []) {
  if (!history.length) {
    return {
      command: 'None',
      output: 'No command executed yet.',
    };
  }
  const last = history[history.length - 1];
  return {
    command: last.command,
    output: truncateOutput(last.output || '', 'last'), // Max 5 lines for last command
  };
}

function buildUserPrompt({ userPrompt, instruction, workspacePath, savedState, currentState }) {
  const parts = [];
  parts.push(`# USER PROMPT:\n${userPrompt}`);

  if (workspacePath) {
    parts.push(`# WORKSPACE PATH:\n${workspacePath}`);
  }
  if (instruction || currentState) {
    parts.push(`# WORKSPACE/STATE INSTRUCTION:\n${instruction}`);
    if (currentState) {
      const { STATE_RULES, AGENT_STATES } = require('./codes-prompt');
      const stateRules = STATE_RULES[currentState] || '';
      if (stateRules) {
        parts.push(`${stateRules}`);
      }
    }
  }
  if (savedState) {
    parts.push(`# CONTINUATION FROM PREVIOUS SESSION:\nPrevious session ended in ${savedState} state. Continue from where we left off.`);
  }

  return parts.join('\n\n');
}

function selectPromptTemplate(iteration, isContinuationSession = false) {
  // For continuation sessions, always use PROMPT_SUBSEQUENT even for iteration 0
  if (isContinuationSession) {
    return PROMPT_SUBSEQUENT;
  }
  return iteration === 0 ? PROMPT_FIRST : PROMPT_SUBSEQUENT;
}

function detectErrorContext(commandHistory = []) {
  // Detect error patterns from recent command history to inject targeted guidance
  const recentCommands = commandHistory.slice(-3); // Last 3 commands

  let errorType = null;
  let includeCommandReference = false;

  for (const entry of recentCommands) {
    const { command = '', output = '', exitCode = 0 } = entry;

    // V2: Detect BLOCKED commands
    if (output.includes('[COMMAND BLOCKED FOR SAFETY]')) {
      errorType = 'command_blocked';
      includeCommandReference = true;
      break;
    }

    // Detect -replace command failures
    if (exitCode !== 0 && command.includes('-replace')) {
      errorType = 'replace_failed';
      includeCommandReference = true;
      break;
    }

    // Detect timeout errors
    if (output.includes('timeout') || output.includes('Terminal execution failed')) {
      errorType = 'command_timeout';
      includeCommandReference = true;
      break;
    }

    // Detect file too large issues
    if (output.includes('out of range') || output.toLowerCase().includes('too large')) {
      errorType = 'file_too_large';
      includeCommandReference = true;
      break;
    }

    // Detect hashtable syntax errors (inline comments in Set-MultipleLines)
    if (
      exitCode !== 0 &&
      command.includes('Set-MultipleLines') &&
      (output.includes('hash literal was incomplete') ||
        output.includes('Unexpected token') ||
        output.includes('Missing closing'))
    ) {
      errorType = 'hashtable_syntax';
      includeCommandReference = true;
      break;
    }
  }

  // Include detailed command reference after 5+ iterations or on error
  if (!includeCommandReference && commandHistory.length > 5) {
    includeCommandReference = true;
  }

  return { errorType, includeCommandReference };
}

function renderSystemPrompt(template, { userPrompt, commandHistory, commandHistoryArray, lastCommand, iteration = 0, previousMessagesHistory = '', currentState, memoryState, currentMemory, lastHidden, lastChecklist }) {
  const lastOutputLines = (lastCommand.output || '').split(/\r?\n/).length;

  // 1. Summary REMINDER for PROMPT_SUBSEQUENT (task section)
  const summaryReminder = lastOutputLines > 10
    ? `\nRemember to add <summary> tag for your command output.\n`
    : '';

  // 2. V2: Build state-specific system prompt
  const { errorType, includeCommandReference } = detectErrorContext(commandHistoryArray);
  const errorGuidance = errorType ? getErrorGuidance(errorType) : '';

  // Context separation: 
  // 1. previousMessagesHistory -> goes to {previous_history} inside common_command (Legacy? No, we put it in history_summary now?)
  // Actually, previousMessagesHistory is from DB (previous turns). We should append it to history_summary or userPrompt.
  // For now, let's append it to history_summary.

  const contextPrevious = previousMessagesHistory || '';

  // Build state-aware prompt (returns { systemPrompt, userContext })
  const { systemPrompt, userContext } = buildStatePrompt(
    currentState,
    iteration,
    commandHistory, // This is the formatted recent turns
    includeCommandReference || iteration === 0,
    memoryState,
    currentMemory,
    userPrompt, // userPromptText
    contextPrevious, // historySummary
    lastHidden,
    lastChecklist
  );

  // Inject error guidance into system prompt if needed
  const finalSystemPrompt = errorGuidance
    ? `${systemPrompt}\n\n${errorGuidance}`
    : systemPrompt;

  // We don't use 'template' anymore for the main structure, as buildStatePrompt handles it via DYNAMIC_CONTEXT_TEMPLATE.
  // But PROMPT_SUBSEQUENT might still be used for something? 
  // Actually, buildStatePrompt uses DYNAMIC_CONTEXT_TEMPLATE which replaces PROMPT_SUBSEQUENT's role for the user message.
  // So we can ignore 'template' argument or use it if we want to wrap the userContext?
  // PROMPT_SUBSEQUENT in codes-prompt.js is now just a legacy string or we can remove it.
  // Let's assume buildStatePrompt returns the full User Context string.

  return { systemPrompt: finalSystemPrompt, userContext: userContext + summaryReminder };
}

function parseAgentResponse(text = '') {
  const hiddenMatch = text.match(/<hidden>([\s\S]*?)<\/hidden>/i);
  const answerMatch = text.match(/<answer>([\s\S]*?)<\/answer>/i);
  const cmdMatch = text.match(/<cmd>([\s\S]*?)<\/cmd>/i);
  const stateMatch = text.match(/<state>([\s\S]*?)<\/state>/i);
  const savedStateMatch = text.match(/<saved_state>([\s\S]*?)<\/saved_state>/i);
  let done = /<!END>/i.test(text) && stateMatch && stateMatch[1].trim().toUpperCase() === 'DONE';
  const todoMatch = text.match(/<todo>([\s\S]*?)<\/todo>/i);
  const checklistMatch = text.match(/<checklist>([\s\S]*?)<\/checklist>/i);
  const summaryMatch = text.match(/<summary>([\s\S]*?)<\/summary>/i);

  // Detect malformed responses: AI outputting "Command executed: X" without tags
  // This happens when AI forgets to use <cmd> tags
  let extractedCommand = '';
  if (!cmdMatch && text.trim().startsWith('Command executed:')) {
    // Try to extract command from plain text
    const commandMatch = text.match(/^Command executed:\s*(.+?)(?:\n|$)/i);
    if (commandMatch) {
      extractedCommand = commandMatch[1].trim();
      log('CODES', 2, 'parseAgentResponse', 'Malformed response: AI output plain "Command executed:" without <cmd> tags', {
        extractedCommand: extractedCommand.substring(0, 100),
      });
      // This is malformed, but we'll treat it as done since there's no actual <cmd> tag
      done = true;
    }
  }

  // Clean answer by removing tags that should not appear in user-facing text
  let cleanAnswer = answerMatch ? answerMatch[1].trim() : '';
  if (cleanAnswer) {
    // Remove <!END> tag
    cleanAnswer = cleanAnswer.replace(/<!END>/gi, '').trim();
    // Remove <cmd> tags if they leaked into answer (AI should put cmd in separate tag)
    cleanAnswer = cleanAnswer.replace(/<cmd>[\s\S]*?<\/cmd>/gi, '').trim();
    // Remove <hidden> tags if they leaked into answer
    cleanAnswer = cleanAnswer.replace(/<hidden>[\s\S]*?<\/hidden>/gi, '').trim();
    // Remove other V2 tags that shouldn't be in answer
    cleanAnswer = cleanAnswer.replace(/<(?:todo|checklist|summary)>[\s\S]*?<\/(?:todo|checklist|summary)>/gi, '').trim();
  }

  // V2: If no <answer> tag found, check if other structured tags exist
  // Only use fallback if NO structured tags at all (unformatted response)
  if (!answerMatch && text.trim()) {
    if (!hiddenMatch && !cmdMatch) {
      // No structured tags at all - check if it's malformed "Command executed:" text
      if (extractedCommand) {
        // Don't put the malformed command text in answer
        cleanAnswer = '';
      } else {
        // Truly unformatted response - fallback to entire text
        cleanAnswer = text.replace(/<[^>]*>/g, '').trim();
      }
    }
    // else: has hidden/cmd tag but no answer tag = intentional (EXPLORE/READ/EXECUTE state)
    // answer should remain empty - hidden/cmd content is for specific purposes
  }

  const command = cmdMatch ? cmdMatch[1].trim() : '';

  // Auto-detect done: if no command and no hidden, and answer doesn't indicate continuation, we're done
  // BUT: If AI declared a valid state (not DONE), continue iteration even if no command
  if (!command && !hiddenMatch && !done) {
    const hasValidState = stateMatch && ['EXPLORE', 'EDIT', 'EXECUTE', 'VERIFY'].includes(stateMatch[1].trim().toUpperCase());
    if (hasValidState) {
      // AI declared next state, continue iteration
      log('CODES', 2, 'parseAgentResponse', 'Continuing iteration: AI declared valid state', { state: stateMatch[1].trim().toUpperCase() });
    } else {
      const hasContinuationIndicators = cleanAnswer && (
        cleanAnswer.toLowerCase().includes('lanjut') ||
        cleanAnswer.toLowerCase().includes('perlu') ||
        cleanAnswer.toLowerCase().includes('cek') ||
        cleanAnswer.toLowerCase().includes('akan') ||
        cleanAnswer.toLowerCase().includes('menjalankan') ||
        cleanAnswer.toLowerCase().includes('memperbaiki') ||
        cleanAnswer.toLowerCase().includes('jika') ||
        cleanAnswer.toLowerCase().includes('untuk') ||
        cleanAnswer.toLowerCase().includes('?') ||
        cleanAnswer.toLowerCase().includes('fokus') ||
        cleanAnswer.toLowerCase().includes('selanjutnya') ||
        cleanAnswer.toLowerCase().includes('eksplor') ||
        cleanAnswer.toLowerCase().includes('benerin')
      );
      if (!cleanAnswer || !hasContinuationIndicators) {
        log('CODES', 2, 'parseAgentResponse', 'Auto-detected done: no command, no meaningful answer with continuation indicators, no hidden content');
        done = true;
      }
    }
  }

  return {
    hidden: hiddenMatch ? hiddenMatch[1].trim() : null, // V2: Internal AI thinking
    answer: cleanAnswer,
    command,
    state: stateMatch ? stateMatch[1].trim().toUpperCase() : null, // AI-declared state
    savedState: savedStateMatch ? savedStateMatch[1].trim().toUpperCase() : null, // Saved state for next session
    done,
    todo: todoMatch ? todoMatch[1].trim() : null,
    checklist: checklistMatch ? checklistMatch[1].trim() : null,
    summary: summaryMatch ? summaryMatch[1].trim() : null,
  };
}

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

// function formatIterationOutput({ answer, command, output, exitCode, blocked }) {
//   // Return structured object instead of combined string
//   // This allows separate delivery of response+command vs output
//   return {
//     answer: answer || null,
//     command: command || null,
//     output: output || null,
//     exitCode,
//     blocked: !!blocked,
//   };
// }

function formatResponseAndCommand({ answer, command, hidden }) {
  const sections = [];

  // 1. Format hidden as codeblock with '>' prefix
  if (hidden) {
    sections.push(`<!--hidden-->\n${hidden.trim()}\n<!--/hidden-->\n`);
  }

  // 2. Add answer (already handled)
  if (answer) {
    const cleanedAnswer = answer
      .replace(/^```[\w]*\n?/, '')
      .replace(/\n?```$/, '');
    sections.push(`${cleanedAnswer}\n`);
  }

  // 3. Add command (already handled)
  if (command) {
    sections.push(`<!--command-input-->\n${command.trim()}\n<!--/command-input-->\n`);
  }

  return sections.length > 0 ? sections.join('\n') : null;
}

function formatOutput({ output, exitCode, blocked }) {
  // Format output only (sent AFTER execution)
  if (output) {
    const exitLine = Number.isFinite(exitCode)
      ? `\n# Exit Code: ${exitCode}`
      : '';
    return `<!--command-output-->\n${output.trim()}${exitLine}\n<!--/command-output-->\n\n`;
  } else if (blocked) {
    return '<!--command-output-->\nCommand blocked by safety policy.\n<!--/command-output-->\n\n';
  }
  return null;
}

function mergeUsage(target, usage) {
  if (!usage) return target;
  const result = target ? { ...target } : { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  if (typeof usage.prompt_tokens === 'number') {
    result.prompt_tokens += usage.prompt_tokens;
  }
  if (typeof usage.completion_tokens === 'number') {
    result.completion_tokens += usage.completion_tokens;
  }
  if (typeof usage.total_tokens === 'number') {
    result.total_tokens += usage.total_tokens;
  } else {
    result.total_tokens = result.prompt_tokens + result.completion_tokens;
  }
  return result;
}

function formatTodo(todoText) {
  // Parse todo checklist into structured format
  if (!todoText) return null;

  const lines = todoText.split('\n');
  const items = lines.map(line => {
    // V2: Support [ ] [x] [/]
    const trimmed = line.trim();
    // V2: Support - [ ] and [ ] formats
    // Match: optional dash, optional space, [status], space, text
    const match = trimmed.match(/^(?:-\s*)?\[([ xX\/])\]\s*(.+)$/);
    if (match) {
      return {
        checked: match[1].toLowerCase() === 'x',
        status: match[1], // ' ', 'x', '/'
        text: match[2].trim(),
        original: line,
      };
    }
    return null;
  }).filter(Boolean);

  return items.length > 0 ? items : null;
}

function formatTodoChunk(todo, checklist, iteration) {
  // Return formatted todo/checklist for sending to renderer
  const content = [];

  // V2: Prioritize checklist if available (mandatory in new prompt)
  const listContent = checklist || todo;
  
  if (listContent) {
    // Always show checklist/plan
    const header = iteration === 0 ? '\n## Planning:\n' : '\n## Checkpoint Progress:\n';
    content.push(header);
    
    const items = formatTodo(listContent);
    if (items) {
      items.forEach(item => {
        const icon = item.checked ? '- [x]' : (item.text.startsWith('[') ? '' : '- [ ]'); // Handle [/] as in-progress if needed, or just simple check
        // Custom handling for [/] (In Progress)
        let displayIcon = icon;
        if (item.original && item.original.includes('[/]')) {
          displayIcon = '- [ ]';
        }
        
        content.push(`${displayIcon} ${item.text}`);
      });
    } else {
      content.push(listContent);
    }
  }

  return content.length > 0 ? content.join('\n') + '\n\n' : null;
}

function ensurePowerShellSession(state, workspacePath) {
  if (state.terminal && !state.terminal.isDisposed && state.workspacePath === workspacePath) {
    return state.terminal;
  }
  try {
    state.terminal?.dispose();
  } catch { }
  state.terminal = new PowerShellSession({ workspacePath, log });
  state.workspacePath = workspacePath;
  return state.terminal;
}

function ensureDirectoryExists(workspacePath) {
  if (!workspacePath) return workspacePath;
  try {
    if (fs.existsSync(workspacePath) && fs.statSync(workspacePath).isDirectory()) {
      return workspacePath;
    }
  } catch (error) {
    log('CODES', 3, 'ensureDirectoryExists', 'Workspace validation failed', { error: error?.message });
  }
  return null;
}

const CLAUDE_TOOLS = [
  {
    name: "agent_response",
    description: "Submit your response, including state, internal thought, checklist, answer to user, and command to execute.",
    input_schema: {
      type: "object",
      properties: {
        state: {
          type: "string",
          enum: ["EXPLORE", "EDIT", "EXECUTE", "VERIFY", "DONE"],
          description: "Current state of the agent."
        },
        hidden: {
          type: "string",
          description: "Internal thought process and analysis. REQUIRED for all states except DONE."
        },
        checklist: {
          type: "string",
          description: "Markdown checklist of tasks: [ ] pending, [/] in-progress, [x] done."
        },
        answer: {
          type: "string",
          description: "Response to show to the user. Optional in EXPLORE/EXECUTE, required in EDIT/VERIFY/DONE."
        },
        command: {
          type: "string",
          description: "PowerShell command to execute. Optional."
        },
        saved_state: {
          type: "string",
          description: "Next state to save for future sessions (only for DONE state)."
        },
        end: {
          type: "boolean",
          description: "Explicitly marks this response as terminal/finished; if true, this indicates no further iterations are required.",
        },
        summary: {
           type: "string",
           description: "Summary of the command execution (optional)."
        }
      },
      required: ["state", "checklist"]
    },
    cache_control: { type: "ephemeral" } // Cache the tool definition
  }
];

async function callClaudeChat({ baseUrl, apiKey, model, messages, tools }) {
  if (!baseUrl) {
    return Promise.reject(new Error('Base URL is required for code agent requests.'));
  }
  if (!model) {
    return Promise.reject(new Error('Model ID is required for code agent requests.'));
  }

  return new Promise((resolve, reject) => {
    let parsedUrl;
    try {
      // Anthropic API usually uses /v1/messages
      // If the user provides a custom baseUrl (e.g. OpenRouter), it might differ.
      // But for "model id claude", we assume standard Anthropic or compatible.
      // If baseUrl ends with /v1, we use /v1/messages.
      // If it's just the host, we append /v1/messages.
      
      // Handle OpenRouter or other proxies that might use OpenAI format for Claude?
      // The user said "create our own system for model id claude", implying native Anthropic format.
      // But if the baseUrl is e.g. https://openrouter.ai/api/v1, we should append /messages?
      // Or maybe the user expects us to use the OpenAI-compatible endpoint even for Claude?
      // No, "ceks dokumentasi dari claude... cara dia mengirimkan setiap iteration".
      // This implies using the Messages API format.
      
      let endpoint = 'messages';
      if (baseUrl.endsWith('/')) {
        endpoint = 'messages';
      } else if (!baseUrl.endsWith('/v1')) {
         // If base url doesn't end in v1, assume we need to add it? 
         // Safest is to use joinEndpoint logic but specific for Anthropic
         // But let's assume the baseUrl provided is the root API url.
      }
      
      // For now, let's assume baseUrl points to the API root (e.g. https://api.anthropic.com/v1)
      parsedUrl = new URL(joinEndpoint(baseUrl, endpoint));
    } catch (error) {
      reject(error);
      return;
    }

    // Extract system message from messages array if present
    let systemPrompt = '';
    const apiMessages = [];
    
    for (const msg of messages) {
      if (msg.role === 'system') {
        systemPrompt = msg.content;
      } else {
        apiMessages.push(msg);
      }
    }

    const bodyObj = {
      model,
      messages: apiMessages,
      system: [
        {
          type: 'text',
          text: systemPrompt,
          cache_control: { type: 'ephemeral' } // Cache the system prompt
        }
      ],
      max_tokens: 4096, // Claude supports large output
      tools: tools,
      tool_choice: { type: "tool", name: "agent_response" }, // Force the tool use
    };
    
    const body = JSON.stringify(bodyObj);

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Length': Buffer.byteLength(body)
    };

    const options = {
      method: 'POST',
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      protocol: parsedUrl.protocol,
      headers,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`HTTP ${res.statusCode} ${res.statusMessage || ''} — ${data.slice(0, 200)}`));
        }
        try {
          const json = JSON.parse(data);
          resolve({
            content: json.content, // Array of content blocks
            usage: json.usage || null,
            stop_reason: json.stop_reason,
          });
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function callOpenAICompatibleChat({ baseUrl, provider, apiKey, model, messages }) {
  if (!baseUrl) {
    return Promise.reject(new Error('Base URL is required for code agent requests.'));
  }
  if (!model) {
    return Promise.reject(new Error('Model ID is required for code agent requests.'));
  }
  if (String(provider || '').toLowerCase() === 'gemini') {
    return Promise.reject(new Error('Gemini provider is not supported for PowerShell coding agent.'));
  }
  return new Promise((resolve, reject) => {
    let parsedUrl;
    try {
      parsedUrl = new URL(joinEndpoint(baseUrl, 'chat/completions'));
    } catch (error) {
      reject(error);
      return;
    }

    const bodyObj = {
      model,
      messages,
      stream: false,
    };
    const body = JSON.stringify(bodyObj);

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Content-Length': Buffer.byteLength(body)
    };
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }
    if (provider === 'openrouter') {
      headers['HTTP-Referer'] = 'https://clustrix.local';
      headers['X-Title'] = 'Clustrix Desktop';
    } else if (provider === 'bigmodel') {
      headers['User-Agent'] = 'Clustrix/1.0';
    }

    const options = {
      method: 'POST',
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      protocol: parsedUrl.protocol,
      headers,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`HTTP ${res.statusCode} ${res.statusMessage || ''} — ${data.slice(0, 200)}`));
        }
        try {
          const json = JSON.parse(data);
          const content = json?.choices?.[0]?.message?.content || '';
          resolve({
            content,
            usage: json?.usage || null,
          });
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function runAgentIteration({
  iteration,
  state,
  userPrompt,
  provider,
  model,
  baseUrl,
  apiKey,
  db,
  sessionId,
  isContinuationSession = false,
}) {
  // Use formatCommandHistory from codes-prompt.js which returns { summary, recent }
  const commandHistoryText = formatCommandHistory(state.commandHistory, state.lastHidden);
  const lastCommand = getLastCommand(state.commandHistory);

  // Load previous message iterations from database and format into system prompt
  let previousMessagesHistory = '';
  if (db && sessionId) {
    try {
      const dbMessages = db.getMessages?.(sessionId) || [];

      // Get last 3 user messages BEFORE current one (max)
      const userMessages = dbMessages.filter(m => m.role === 'user').slice(-4, -1);

      if (userMessages.length > 0) {
        const historyParts = [];

        for (let i = 0; i < userMessages.length; i++) {
          const msgIndex = userMessages[i].message_index;
          const msgContent = userMessages[i].content;
          const isLastMessage = i === userMessages.length - 1; // Check if this is the last message in history

          // Load iterations for this message
          const iterationIndex = db.getCodeIterations?.(sessionId, msgIndex) || [];

          // Load assistant response for this message
          const assistantMessage = dbMessages.find(m => m.role === 'assistant' && m.message_index === msgIndex);

          if (iterationIndex.length > 0 || assistantMessage) {
            historyParts.push(`# INDEX ${i + 1} PREVIOUS PROMPT:`);
            historyParts.push(`${msgContent[0].toUpperCase()}${msgContent.slice(1)}`);
            historyParts.push(''); // blank line

            if (iterationIndex.length > 0) {
              historyParts.push(`# INDEX ${i + 1} PREVIOUS TERMINAL COMMAND:`);
              iterationIndex.forEach((iter, idx) => {
                const cmd = iter.command || '[no command]';
                historyParts.push(`#${idx + 1}: ${cmd}`);
              });
              historyParts.push(''); // blank line after history
            }
          }
        }

        if (historyParts.length > 0) {
          previousMessagesHistory = historyParts.join('\n') + '\n';
        }
      }
    } catch (error) {
      log('CODES', 3, 'runAgentIteration', 'Failed to load previous iterations', {
        sessionId,
        error: error?.message || error,
      });
    }
  }

  // DELAYED MEMORY UPDATE: Apply pending memory updates from PREVIOUS iteration
  // This ensures that memory is updated AFTER AI sees the command output,
  // preventing duplicate search commands and improving context retention
  if (state.pendingMemoryUpdates && state.pendingMemoryUpdates.length > 0) {
    log('CODES', 1, 'runAgentIteration', 'Applying delayed memory updates', {
      count: state.pendingMemoryUpdates.length,
      iteration
    });

    for (const update of state.pendingMemoryUpdates) {
      addToMemory(
        state,
        update.filePath,
        update.minLine,
        update.maxLine,
        update.lines,
        update.memoryName,
        update.memoryOwnerId,
        update.totalLines
      );
    }

    // Clear pending updates after applying
    state.pendingMemoryUpdates = [];
  }

  // Pass iteration for dynamic command reference injection
  const memoryState = formatMemoryOutput(state);
  const truncatedMemory = memoryState.length > 150000 ? memoryState.substring(0, 150000) + '\n[Memory truncated, use Show-Memory to read all]' : memoryState;

  // REDUNDANT READ DETECTION
  let redundancyWarning = '';
  if (lastCommand && lastCommand.command) {
    const readMatch = lastCommand.command.match(/^(?:Show-FileWithLineNumbers|Get-Content|cat|type)\s+(?:-Path\s+)?["']?([^"'\s]+)["']?/i);
    if (readMatch) {
      const filePath = readMatch[1];
      // Check if this file was ALREADY in memory before this command (heuristic: it's in memoryState now, and we just read it)
      // A better check would be if it was in memory *before* the command, but checking current memory is a good proxy 
      // if we assume the agent shouldn't re-read what it already has.
      // However, we need to be careful not to warn on the *first* read.
      // We can check if the file is in `state.memories` and if the `ranges` cover the whole file or significant part.
      
      // For now, let's use a simpler heuristic: If the agent read a file, and that file is in memory, 
      // remind them to check memory next time.
      // But the user specifically asked for a warning if they read content *already* in memory.
      // Since we don't track "memory state before command" easily here without passing it, 
      // we will add a generic reminder if the last command was a read.
      
      // IMPROVED LOGIC: Check if the file is fully explored in memory.
      const normalizedPath = filePath.replace(/\\/g, '/');
      const fileMemory = Object.values(state.memories).flatMap(m => m.files ? Object.values(m.files) : []).find(f => f?.filePath?.endsWith(normalizedPath) || (f?.filePath && normalizedPath.endsWith(f.filePath)));
      
      if (fileMemory && fileMemory.ranges.length > 0) {
         redundancyWarning = `\n\n!!! SYSTEM ALERT: You just executed a READ command on '${filePath}'.\nCHECK MEMORY FIRST! If this file was already in your memory, you just wasted a turn.\nRead the user prompt, then read the memory below, summarize based on the user input, then switch to EDIT state if necessary.`;
      }
    }
  }

  const { systemPrompt, userContext } = renderSystemPrompt(selectPromptTemplate(iteration, isContinuationSession), {
    userPrompt: userPrompt + redundancyWarning, // Inject warning into user prompt
    commandHistory: commandHistoryText.recent, // Pass formatted recent turns
    commandHistoryArray: state.commandHistory,
    lastCommand,
    iteration,
    previousMessagesHistory: previousMessagesHistory + (commandHistoryText.summary ? `\n\nPrevious Turns Summary:\n${commandHistoryText.summary}` : ''),
    currentState: state.currentState,
    memoryState: truncatedMemory,
    currentMemory: state.currentMemory,
    lastHidden: state.lastHidden,
    lastChecklist: state.lastChecklist,
  });

  // Debug: Log processed prompt for each iteration
  console.log('\n\n<==>===== CODE AGENT ITERATION #' + iteration + ' - SYSTEM PROMPT =====<==>');
  console.log(systemPrompt.trim());
  console.log('<==>===== END SYSTEM PROMPT =====<==>\n\n');

  console.log('\n\n<==>===== CODE AGENT ITERATION #' + iteration + ' - USER PROMPT =====<==>');
  console.log(userContext.trim());
  console.log('<==>===== END USER PROMPT =====<==>\n\n');

  let finalSystemPrompt = systemPrompt;
  const isClaude = model.toLowerCase().includes('claude');

  if (isClaude) {
    // Adjust system prompt for Claude to prefer tool use over XML tags
    finalSystemPrompt = finalSystemPrompt
      .replace(/=== RESPONSE FORMAT ===[\s\S]*?=== STATE MACHINE ===/, '=== RESPONSE FORMAT ===\nUse the `agent_response` tool to submit your output. Do not use XML tags.\nIf you are fully finished and want to end iteration, set the `end` boolean to `true` in the tool input.\n\n=== STATE MACHINE ===')
      .replace(/<state>.*?<\/state>/g, '`state` parameter')
      .replace(/<hidden>.*?<\/hidden>/g, '`hidden` parameter')
      .replace(/<checklist>.*?<\/checklist>/g, '`checklist` parameter')
      .replace(/<answer>.*?<\/answer>/g, '`answer` parameter')
      .replace(/<cmd>.*?<\/cmd>/g, '`command` parameter')
      .replace(/<!END>/g, 'set the `end` boolean to `true` in the tool input.');
  }

  // Build messages array - OPTIMIZED for token efficiency
  let messages;

  if (iteration === 0) {
    // First iteration OF THIS REQUEST
    messages = [
      { role: 'system', content: finalSystemPrompt.trim() },
      { role: 'user', content: userContext }, // User Context + Request
    ];

    // Reset iteration history for this new request
    state.conversationHistory = [
      { role: 'user', content: userContext },
    ];
  } else {
    // Subsequent iterations: rebuild messages with CURRENT system prompt
    // Include: system + conversationHistory (current request iterations)
    
    // Update the content of the first user message in history with the fresh context
    if (state.conversationHistory.length > 0 && state.conversationHistory[0].role === 'user') {
      state.conversationHistory[0].content = userContext;
    }

    messages = [
      { role: 'system', content: finalSystemPrompt.trim() },
      ...state.conversationHistory, // Current request's iteration history
    ];
  }

  let parsed;
  let usage;

  if (isClaude) {
    const response = await callClaudeChat({
      baseUrl,
      apiKey,
      model,
      messages,
      tools: CLAUDE_TOOLS,
    });

    usage = response.usage;
    
    // Find tool use
    const toolUseBlock = response.content.find(c => c.type === 'tool_use' && c.name === 'agent_response');
    
    if (toolUseBlock) {
      const args = toolUseBlock.input;
      parsed = {
        hidden: args.hidden,
        answer: args.answer,
        command: args.command,
        state: args.state,
        savedState: args.saved_state,
        // Prefer explicit end boolean; fallback to state === 'DONE' for compatibility
        done: (typeof args.end === 'boolean' ? args.end : (args.state === 'DONE')),
        todo: null, // Checklist is preferred
        checklist: args.checklist,
        summary: args.summary,
        toolUseId: toolUseBlock.id, // Capture ID for tool_result
      };
      if (typeof args.end === 'boolean' && args.end) {
        log('CODES', 1, 'runAgentIteration', 'Claude tool signaled end via end flag', { sessionId, iteration });
      }
      
      // Store assistant's tool use in conversation history
      // NOTE: response.content can be structured (array/object). Store as JSON string to keep memory serializable
      // This prevents un-serializable or circular values from later causing failures when persisting sessions
      let assistantContent = response.content;
      try {
        if (Array.isArray(response.content) || typeof response.content === 'object') {
          assistantContent = JSON.stringify(response.content);
        }
      } catch (e) {
        // Fallback - store a minimal string representation
        assistantContent = String(response.content);
      }
      state.conversationHistory.push({
        role: 'assistant',
        content: assistantContent,
      });
      
    } else {
      // Fallback if Claude didn't use tool (rare with tool_choice forced)
      // Try to parse text content if any
      const textBlock = response.content.find(c => c.type === 'text');
      const text = textBlock ? textBlock.text : '';
      parsed = parseAgentResponse(text);
      
      // Store as text message
      state.conversationHistory.push({
        role: 'assistant',
        content: text,
      });
    }

  } else {
    const response = await callOpenAICompatibleChat({
      baseUrl,
      provider,
      apiKey,
      model,
      messages,
    });

    usage = response.usage;
    parsed = parseAgentResponse(response.content || '');

      // Store assistant's response in conversation history
      // V2: Store CLEANED response (no control tags) to prevent tag leaking
      // Only store the answer that user actually sees, not internal tags
      // DON'T add "Command executed: X" - it makes AI mimic that format
      const pushAssistantContent = (c) => state.conversationHistory.push({ role: 'assistant', content: c });

      if (parsed.answer && parsed.answer.trim()) {
        pushAssistantContent(parsed.answer);
      } else if (!parsed.answer && !parsed.command && response.content) {
        // Fallback: if no parsed answer/command, store raw (for unstructured responses)
        // But still strip all V2 tags to prevent leaking
        let strippedContent = response.content;
        try {
          if (typeof response.content === 'object') {
            // If it's an object/array, convert to stable string form
            strippedContent = JSON.stringify(response.content);
          }
        } catch (e) {
          strippedContent = String(response.content);
        }
        strippedContent = String(strippedContent)
          .replace(/<hidden>[\s\S]*?<\/hidden>/gi, '')
          .replace(/<cmd>[\s\S]*?<\/cmd>/gi, '')
          .replace(/<answer>[\s\S]*?<\/answer>/gi, '')
          .replace(/<(?:todo|checklist|summary)>[\s\S]*?<\/(?:todo|checklist|summary)>/gi, '')
          .replace(/<!END>/gi, '')
          .trim();

        if (strippedContent) {
          pushAssistantContent(strippedContent);
        }
      }
  }

  // V2: Log parsed response structure for debugging
  console.log('===== PARSED RESPONSE =====');
  console.log('Hidden:', parsed.hidden ? `"${parsed.hidden.substring(0, 100)}${parsed.hidden.length > 100 ? '...' : ''}"` : 'null');
  console.log('Answer:', parsed.answer ? `"${parsed.answer.substring(0, 100)}${parsed.answer.length > 100 ? '...' : ''}"` : 'null');
  console.log('Command:', parsed.command ? `"${parsed.command.substring(0, 100)}${parsed.command.length > 100 ? '...' : ''}"` : 'null');
  console.log('State:', parsed.state || 'null');
  console.log('Saved State:', parsed.savedState || 'null');
  console.log('Done:', parsed.done);
  console.log('Todo:', parsed.todo ? 'present' : 'null');
  console.log('Checklist:', parsed.checklist ? 'present' : 'null');
  console.log('Summary:', parsed.summary ? 'present' : 'null');
  console.log('ToolUseId:', parsed.toolUseId || 'null');
  console.log('===== END PARSED RESPONSE =====\n\n');

  // Update current state based on AI declaration
  if (parsed.state && AGENT_STATES[parsed.state]) {
    state.currentState = AGENT_STATES[parsed.state];
  }

  // Store last hidden content for next prompt
  if (parsed.hidden) {
    state.lastHidden = parsed.hidden;
  }
  if (parsed.checklist) {
    state.lastChecklist = parsed.checklist;
  }

  return {
    parsed,
    usage,
  };
}

function parseMemoryCommand(command) {
  const trimmed = command.trim();

  // Show-Memory (no parameter = show default)
  if (trimmed.match(/^Show-Memory$/i)) {
    return { type: 'show', name: 'default' };
  }

  // Show memory <name> (or Show-Memory <name> or show-memory <name>)
  const showMatch = trimmed.match(/^show\s+memory\s+(\S+)$/i) ||
    trimmed.match(/^show-memory\s+(\S+)$/i) ||
    trimmed.match(/^Show-Memory\s+(\S+)$/i);
  if (showMatch) {
    return { type: 'show', name: showMatch[1] };
  }

  // Hide memory <name1> <name2> (or Hide-Memory <name1> <name2>)
  const hideMatch = trimmed.match(/^hide\s+memory\s+(.+)$/i) ||
    trimmed.match(/^hide-memory\s+(.+)$/i) ||
    trimmed.match(/^Hide-Memory\s+(.+)$/i);
  if (hideMatch) {
    return { type: 'hide', names: hideMatch[1].split(/\s+/) };
  }

  // Use memory <name1> <name2> (or Use-Memory <name1> <name2>)
  const useMatch = trimmed.match(/^use\s+memory\s+(.+)$/i) ||
    trimmed.match(/^use-memory\s+(.+)$/i) ||
    trimmed.match(/^Use-Memory\s+(.+)$/i);
  if (useMatch) {
    return { type: 'use', names: useMatch[1].split(/\s+/) };
  }

  // Clear memory <name1> <name2> (or Clear-Memory <name1> <name2>)
  const clearMatch = trimmed.match(/^clear\s+memory\s+(.+)$/i) ||
    trimmed.match(/^clear-memory\s+(.+)$/i) ||
    trimmed.match(/^Clear-Memory\s+(.+)$/i);
  if (clearMatch) {
    return { type: 'clear', names: clearMatch[1].split(/\s+/) };
  }

  // Command | Create memory <name> (or Create-Memory <name>)
  const createMatch = trimmed.match(/^(.+?)\s*\|\s*create\s+memory\s+(\S+)$/i) ||
    trimmed.match(/^(.+?)\s*\|\s*create-memory\s+(\S+)$/i) ||
    trimmed.match(/^(.+?)\s*\|\s*Create-Memory\s+(\S+)$/i);
  if (createMatch) {
    return { type: 'create', name: createMatch[2], actualCommand: createMatch[1].trim() };
  }

  return null;
}

async function executeCommand(state, command, options = {}) {
  const {
    disableTimeout = false,
    timeoutMs = COMMAND_EXECUTION_TIMEOUT_MS,
    sessionId = null,
    memoryOwnerId = null,
  } = options;

  if (!command || !command.trim()) {
    return {
      output: '',
      exitCode: 0,
      blocked: false,
      executed: false,
    };
  }

  // Check if this is a background process
  const isBackground = isBackgroundProcess(command);
  const actualTimeoutMs = isBackground ? BACKGROUND_PROCESS_TIMEOUT_MS : timeoutMs;

  // INTERCEPTION: Redirect standard read commands to our custom helper
  // This ensures we always get line numbers and consistent formatting
  if (command.match(/^(?:Get-Content|gc|cat|type)\s+(?:-Path\s+)?["']?([^"'\s]+)["']?$/i)) {
    const match = command.match(/^(?:Get-Content|gc|cat|type)\s+(?:-Path\s+)?["']?([^"'\s]+)["']?$/i);
    if (match) {
      const filePath = match[1];
      const newCommand = `Show-FileWithLineNumbers -Path "${filePath}"`;
      log('CODES', 1, 'executeCommand', 'Intercepted read command, redirecting to helper', {
        original: command,
        redirected: newCommand
      });
      command = newCommand;
    }
  }

  try {
    const editResult = applySetOperations(command, { workspacePath: state.workspacePath || process.cwd() });
    if (editResult) {
      if (!editResult.success) {
        return {
          output: editResult.text || 'Edit operation failed.',
          exitCode: 1,
          blocked: false,
          executed: false,
        };
      }

      editResult.files.forEach(file => {
        // Clear old memory for this file
        clearFileFromMemories(state, file.filePath);

        // Update memory with entire edited file content
        const fs = require('fs');
        const path = require('path');
        try {
          const fullPath = path.resolve(state.workspacePath || process.cwd(), file.filePath);
          if (fs.existsSync(fullPath)) {
            const content = fs.readFileSync(fullPath, 'utf8');
            const lines = content.split(/\r?\n/);
            // Add entire file to memory (start from line 1)
            addToMemory(state, file.filePath, 1, lines.length, lines, state.currentMemory, memoryOwnerId, lines.length);

            log('CODES', 3, 'executeCommand', 'Updated memory with full file after edit', {
              filePath: file.filePath,
              totalLines: lines.length,
              memoryName: state.currentMemory
            });
          }
        } catch (error) {
          log('CODES', 2, 'executeCommand', 'Failed to update memory after edit', {
            filePath: file.filePath,
            error: error.message
          });
        }

        if (!Array.isArray(state.editHistory)) {
          state.editHistory = [];
        }
        file.history.forEach(entry => {
          state.editHistory.push({
            ...entry,
            filePath: file.filePath,
          });
        });

        if (state.editHistory.length > 100) {
          state.editHistory = state.editHistory.slice(-100);
        }
      });

      // Clean memory corruption after edit operations
      cleanMemoryCorruption(state);

      return {
        output: editResult.text,
        exitCode: 0,
        blocked: false,
        executed: true,
      };
    }
  } catch (error) {
    return {
      output: `Edit operation failed: ${error?.message || error}`,
      exitCode: 1,
      blocked: false,
      executed: false,
    };
  }

  // Handle memory management commands
  const memoryCmd = parseMemoryCommand(command);
  if (memoryCmd) {
    if (memoryCmd.type === 'show') {
      // Temporarily show the specified memory
      const originalActive = [...state.activeMemoryNames];
      if (!state.activeMemoryNames.includes(memoryCmd.name)) {
        state.activeMemoryNames.push(memoryCmd.name);
      }
      const output = formatMemoryOutput(state);
      state.activeMemoryNames = originalActive; // Restore
      return {
        output,
        exitCode: 0,
        blocked: false,
        executed: true,
        isMemoryCommand: true,
      };
    }
    if (memoryCmd.type === 'hide') {
      hideMemory(state, memoryCmd.names);
      return {
        output: formatMemoryOutput(state),
        exitCode: 0,
        blocked: false,
        executed: true,
        isMemoryCommand: true,
      };
    }
    if (memoryCmd.type === 'use') {
      useMemory(state, memoryCmd.names);
      return {
        output: formatMemoryOutput(state),
        exitCode: 0,
        blocked: false,
        executed: true,
        isMemoryCommand: true,
      };
    }
    if (memoryCmd.type === 'clear') {
      clearMemory(state, memoryCmd.names, state.memoryOwnerId, state.memoryOwnerType);
      return {
        output: formatMemoryOutput(state),
        exitCode: 0,
        blocked: false,
        executed: true,
        isMemoryCommand: true,
      };
    }
    if (memoryCmd.type === 'create') {
      // Execute actual command but save to named memory
      command = memoryCmd.actualCommand;
      options.saveToMemory = memoryCmd.name;
    }
  }

  // V2: DANGEROUS COMMAND DETECTION & BLOCKING
  const warnings = detectDangerousCommand(command);
  const blockedWarnings = warnings.filter(w => w.block);

  if (blockedWarnings.length > 0) {
    // Command is BLOCKED for safety
    const blockMessages = blockedWarnings.map(w =>
      `${w.warning}\n\nSUGGESTION: ${w.suggestion}`
    ).join('\n\n');

    return {
      output: `[COMMAND BLOCKED FOR SAFETY]\n\n${blockMessages}\n\nThis command would hang PowerShell. Please try the suggested alternative.`,
      exitCode: 1,
      blocked: true,
      executed: false,
    };
  }

  // Show warnings for non-blocking patterns
  const nonBlockingWarnings = warnings.filter(w => !w.block);
  if (nonBlockingWarnings.length > 0) {
    const warnMessages = nonBlockingWarnings.map(w =>
      `[WARNING] ${w.warning}\nSUGGESTION: ${w.suggestion}`
    ).join('\n');
    console.log('\n' + warnMessages + '\n');
  }

  // Note: High impact commands are now handled in processCodeRequest
  // This function executes validated commands

  // Inject bundled ripgrep path for Search-InFiles commands
  let finalCommand = command;
  if (command.trim().startsWith('Search-InFiles')) {
    const rgPath = getRipgrepPath();
    if (rgPath && rgPath !== 'rg') {
      // Convert Windows path to PowerShell path format
      const psPath = rgPath.replace(/\\/g, '/');
      finalCommand = `${command} -RgPath "${psPath}"`;
    }
  }

  try {
    const terminal = ensurePowerShellSession(state, state.workspacePath);
    const runPromise = terminal.run(finalCommand);

    const result = await (disableTimeout || !Number.isFinite(actualTimeoutMs) || actualTimeoutMs <= 0
      ? runPromise
      : new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error('Command execution timeout'));
        }, actualTimeoutMs);

        runPromise
          .then((value) => {
            clearTimeout(timeoutId);
            resolve(value);
          })
          .catch((error) => {
            clearTimeout(timeoutId);
            reject(error);
          });
      }));

    const combinedOutput = [result.stdout, result.stderr].filter(Boolean).join('\n');
    const exitCode = typeof result.exitCode === 'number' ? result.exitCode : 0;

    // Special handling for background processes
    if (isBackground) {
      // For background processes, return success message with captured output
      const outputLines = combinedOutput.split('\n').slice(0, 10); // First 10 lines
      const truncatedOutput = outputLines.join('\n');

      // Dispose terminal after background process to ensure clean state for next command
      try {
        state.terminal?.dispose();
        state.terminal = null;
      } catch (disposeError) {
        log('CODES', 2, 'executeCommand', 'Failed to dispose terminal after background process', {
          error: disposeError?.message,
        });
      }

      return {
        output: `Command executed, captured output:\n\n${truncatedOutput}`,
        exitCode,
        blocked: false,
        executed: true,
        isBackgroundProcess: true,
      };
    }

    // Capture file read output and store as pending memory update (delayed update)
    let capturedToMemory = false;
    const memoryName = options.saveToMemory || state.currentMemory;
    if (exitCode === 0 && combinedOutput) {
      const captureResult = captureFileOutput(state, command, combinedOutput, memoryName, state.memoryOwnerId);
      if (captureResult && typeof captureResult === 'object' && captureResult.captured) {
        capturedToMemory = true;

        // Store pending updates to be applied in NEXT iteration (delayed update pattern)
        if (!state.pendingMemoryUpdates) {
          state.pendingMemoryUpdates = [];
        }

        if (captureResult.pendingUpdate) {
          // Single update (Show-FileWithLineNumbers)
          state.pendingMemoryUpdates.push(captureResult.pendingUpdate);
        } else if (captureResult.pendingUpdates && Array.isArray(captureResult.pendingUpdates)) {
          // Multiple updates (Search-InFiles)
          state.pendingMemoryUpdates.push(...captureResult.pendingUpdates);
        }
      }
    }

    const isSearchCommand = /^\s*(Search-InFiles|rg\b)/i.test(command);
    const isShowFileCommand = /^\s*Show-FileWithLineNumbers\b/i.test(command);

    // Return actual command output (memory is already updated by captureFileOutput)
    // This ensures AI and user can see the actual search results
    let output;
    if (capturedToMemory) {
      if (isSearchCommand || isShowFileCommand) {
        // Show actual output from search/file viewing commands
        // Memory was already updated in the background (delayed update pattern)
        output = combinedOutput || 'Command completed with no output.';
      } else {
        output = `${combinedOutput}\n\n[Content saved to memory '${memoryName}'.\nTip: Use 'Show-Memory ${memoryName}' to view more (only if memory is truncated).]`;
      }
    } else {
      output = combinedOutput || 'Command completed with no output.';
    }

    return {
      output,
      exitCode,
      blocked: false,
      executed: true,
    };
  } catch (error) {
    const isTimeout = error?.message === 'Command execution timeout';

    if (isTimeout) {
      // Terminal execution failed or timeout - dispose and reset terminal
      try {
        state.terminal?.dispose();
        state.terminal = null;
      } catch (disposeError) {
        log('CODES', 2, 'executeCommand', 'Failed to dispose terminal after timeout', {
          error: disposeError?.message,
        });
      }

      const timeoutMessage = isBackground
        ? '[Executed] Background process has been redirected to another terminal'
        : '[Failed] Terminal execution failed or timeout, please try again with different command';

      // For background processes, timeout is considered success
      if (isBackground) {
        return {
          output: timeoutMessage,
          exitCode: 0, // Success for background processes
          blocked: false,
          executed: true, // Allow AI to continue
          isTimeout: true,
          wasBackgroundProcess: true,
        };
      }

      return {
        output: timeoutMessage,
        exitCode: 124, // Standard timeout exit code
        blocked: false,
        executed: false,
        isTimeout: true,
        wasBackgroundProcess: false,
      };
    }

    return {
      output: `Failed to execute: ${error?.message || error}`,
      exitCode: 1,
      blocked: false,
      executed: false,
    };
  }
}

async function processCodeRequest({
  sessionId,
  userPrompt,
  provider,
  model,
  baseUrl,
  apiKey,
  codeId,
  onChunk,
  shouldCancel,
  db, // Database manager for loading chat history
}) {
  const state = getSessionState(sessionId, codeId);
  const codeRecord = deps.getCodeById?.(codeId);
  if (codeRecord) {
    state.instruction = codeRecord.instruction || '';
    state.workspacePath = ensureDirectoryExists(codeRecord.workspace_path || codeRecord.workspacePath || '') || state.workspacePath;
  }

  // Load saved state from previous session if exists
  let isContinuationSession = false;
  if (sessionId) {
    try {
      const userDataPath = process.env.APPDATA || (os.platform() === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support') : path.join(os.homedir(), '.config'));
      const appDataPath = path.join(userDataPath, 'clustrix');
      const stateFile = path.join(appDataPath, `state-${sessionId}.json`);
      if (fs.existsSync(stateFile)) {
        const savedData = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
        if (savedData.lastState) {
          state.currentState = savedData.lastState;
          isContinuationSession = true; // Mark as continuation session
          log('CODES', 1, 'processCodeRequest', 'Loaded saved state from previous session', { sessionId, lastState: savedData.lastState });
        }
      }
    } catch (error) {
      log('CODES', 2, 'processCodeRequest', 'Failed to load saved state', { error: error.message });
    }
  }

  ensurePowerShellSession(state, state.workspacePath || process.cwd());

  const userPromptWithContext = buildUserPrompt({
    userPrompt,
    instruction: state.instruction,
    workspacePath: state.workspacePath,
    savedState: !isContinuationSession && state.currentState !== AGENT_STATES.EXPLORE ? state.currentState : null,
    currentState: state.currentState,
  });

  // Get current message index for this request
  const chunks = [];
  let usage = null;
  let lastCommandErrorPattern = null;
  let sameErrorCount = 0;
  let finalAnswer = null; // Track final answer to save to messages table

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
    // RATE LIMIT PROTECTION: Wait 2 seconds between iterations
    if (iteration > 0) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Check if cancellation was requested
    if (typeof shouldCancel === 'function' && shouldCancel()) {
      log('CODES', 1, 'processCodeRequest', 'Cancellation requested, stopping iteration loop', { sessionId, iteration });
      break;
    }

    // Store previous checklist before this iteration
    const previousChecklist = state.lastChecklist;

    const { parsed, usage: iterationUsage } = await runAgentIteration({
      iteration,
      state,
      userPrompt: userPromptWithContext,
      provider,
      model,
      baseUrl,
      apiKey,
      db,
      sessionId,
      isContinuationSession,
    });

    usage = mergeUsage(usage, iterationUsage);

    // Track final answer if this is meaningful content (not just command)
    if (parsed.answer && parsed.answer.trim() && parsed.done) {
      finalAnswer = parsed.answer.trim();
    }

    // Save saved_state to local storage if provided
    if (parsed.savedState && sessionId) {
      try {
        const userDataPath = process.env.APPDATA || (os.platform() === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support') : path.join(os.homedir(), '.config'));
        const appDataPath = path.join(userDataPath, 'clustrix');
        if (!fs.existsSync(appDataPath)) fs.mkdirSync(appDataPath, { recursive: true });
        const stateFile = path.join(appDataPath, `state-${sessionId}.json`);
        fs.writeFileSync(stateFile, JSON.stringify({ lastState: parsed.savedState, timestamp: Date.now() }));
        log('CODES', 1, 'processCodeRequest', 'Saved state for next session', { sessionId, savedState: parsed.savedState });
      } catch (error) {
        log('CODES', 2, 'processCodeRequest', 'Failed to save state', { error: error.message });
      }
    }

    // STEP 0: Send todo/checklist if present (for planning & progress tracking)
    // Skip sending if checklist is identical to previous iteration
    const todoChunk = formatTodoChunk(parsed.todo, parsed.checklist, iteration);
    if (todoChunk && typeof onChunk === 'function' && !(parsed.checklist && previousChecklist && parsed.checklist.trim() === previousChecklist.trim())) {
      try {
        chunks.push(todoChunk);
        onChunk(todoChunk, {
          iteration,
          type: 'todo',
          done: false,
        });
      } catch (error) {
        log('CODES', 2, 'processCodeRequest', 'Failed to deliver todo chunk', {
          error: error?.message || error,
          iteration,
          sessionId,
        });
      }
    }

    // STEP 1: Send response + command BEFORE executing
    // V2: Only show "No response provided" if there's NO answer, NO hidden content, AND NO command
    // If hidden/command exists, answer can be intentionally empty (EXPLORE/EXECUTE states)
    let answerToSend = parsed.answer;
    if (!answerToSend && !parsed.hidden && !parsed.command) {
      answerToSend = 'No response provided.';
    }

    // Add assistant's decision to conversation history to prevent looping
    // This gives the model context about what commands were already tried
    const assistantMessage = [];
    if (parsed.hidden) {
      assistantMessage.push(`[Internal reasoning: ${parsed.hidden.substring(0, 200)}...]`);
    }
    if (parsed.answer) {
      assistantMessage.push(parsed.answer);
    }
    if (parsed.command) {
      assistantMessage.push(`<cmd>${parsed.command}</cmd>`);
    }

    if (assistantMessage.length > 0 && !parsed.toolUseId) {
      state.conversationHistory.push({
        role: 'assistant',
        content: assistantMessage.join('\n'),
      });
    }


    const responseCommandChunk = formatResponseAndCommand({
      hidden: parsed.hidden,  // ← Pass hidden langsung
      answer: answerToSend,   // ← Pass answer langsung
      command: parsed.command,
    });

    if (responseCommandChunk && typeof onChunk === 'function') {
      try {
        chunks.push(responseCommandChunk);
        onChunk(responseCommandChunk, {
          iteration,
          type: 'response-command',
          done: false,
        });
      } catch (error) {
        log('CODES', 2, 'processCodeRequest', 'Failed to deliver response-command chunk', {
          error: error?.message || error,
          iteration,
          sessionId,
        });
      }
    }

    const requiresConfirmation = isHighImpactCommand(parsed.command);
    let confirmationApproved = false;
    // STEP 2: Check if command requires confirmation
    if (requiresConfirmation) {
      // Send confirmation request chunk (no history entry yet)
      const confirmationChunk = JSON.stringify({
        type: 'confirmation-required',
        command: parsed.command,
        iteration,
      }) + '\n';

      if (typeof onChunk === 'function') {
        try {
          chunks.push(confirmationChunk);
          onChunk(confirmationChunk, {
            iteration,
            type: 'confirmation-required',
            done: false,
            awaitingConfirmation: true,
          });
        } catch (error) {
          log('CODES', 2, 'processCodeRequest', 'Failed to deliver confirmation chunk', {
            error: error?.message || error,
            iteration,
            sessionId,
          });
        }
      }

      // Wait for user confirmation
      const userDecision = await waitForUserConfirmation(sessionId, iteration);

      if (!userDecision.allowed) {
        // User skipped - add system message to guide AI
        const skipMessage = userDecision.timedOut
          ? 'Command approval timed out (no response within 15 minutes). Use another approach, or just <!END> and explain the situation to the user.'
          : 'The user skipped this command. Use another approach, or just <!END> and mention to the user what\'s wrong.';
        state.commandHistory.push({
          command: '[SYSTEM - USER SKIPPED]',
          output: skipMessage,
          exitCode: 1,
          summary: userDecision.timedOut ? 'Command approval timed out' : 'User skipped destructive command',
          timestamp: Date.now(),
        });

        // Add skip message to conversation history
        state.conversationHistory.push({
          role: 'user',
          content: `[SYSTEM] ${skipMessage}`,
        });

        // Send skip notification to UI
        const skipChunk = formatOutput({
          output: skipMessage,
          exitCode: 1,
          blocked: false
        });
        if (skipChunk && typeof onChunk === 'function') {
          try {
            chunks.push(skipChunk);
            onChunk(skipChunk, {
              iteration,
              type: 'output',
              done: false,
            });
          } catch (error) {
            log('CODES', 2, 'processCodeRequest', 'Failed to deliver skip chunk', {
              error: error?.message || error,
              iteration,
              sessionId,
            });
          }
        }
        continue; // Go to next iteration with system message
      }

      confirmationApproved = true;
    }

    let loopDetectedOutput = null;

    // CLEAN COMMAND INPUT:
    // 1. If command contains <set> tags, strip everything else (prioritize file edits).
    //    This fixes "Commands mixing <set> tags..." and removes conversational filler.
    // 2. If command contains <cmd> tags (but no <set>), extract and merge them.
    //    This fixes cases where Claude wraps commands in <cmd> tags inside the tool argument.
    if (parsed.command) {
      if (parsed.command.includes('<set')) {
        const setMatches = parsed.command.match(/<set\s+[^>]*?>[\s\S]*?<\/set>/gi);
        if (setMatches) {
          parsed.command = setMatches.join('\n');
        }
      } else if (parsed.command.includes('<cmd>')) {
        const cmdMatches = parsed.command.match(/<cmd>([\s\S]*?)<\/cmd>/gi);
        if (cmdMatches) {
          // Extract content from <cmd> tags
          parsed.command = cmdMatches.map(m => m.replace(/<\/?cmd>/g, '')).join('\n');
        }
      }
    }

    // SMART FILE READ DETECTION: Check if trying to read file that's already fully in memory
    if (parsed.command) {
      const showFileMatch = parsed.command.match(/Show-FileWithLineNumbers\s+-Path\s+"?([^"\s]+)"?(?:\s+-StartLine\s+(\d+))?(?:\s+-EndLine\s+(\d+))?/i);
      if (showFileMatch) {
        const requestedPath = showFileMatch[1].replace(/\\/g, '/');
        const startLine = showFileMatch[2] ? parseInt(showFileMatch[2], 10) : null;
        const endLine = showFileMatch[3] ? parseInt(showFileMatch[3], 10) : null;

        // Check if file exists in memory
        const defaultMemory = state.memories?.default;
        if (defaultMemory && defaultMemory.files) {
          for (const [memPath, fileData] of Object.entries(defaultMemory.files)) {
            if (memPath.includes(requestedPath) || requestedPath.includes(memPath)) {
              // File is in memory - check if requested range is already fully covered
              let rangeFullyCovered = false;

              if (startLine && endLine) {
                // Check if the requested range is already covered by existing ranges
                rangeFullyCovered = fileData.ranges.some(range => {
                  return range.start <= startLine && range.end >= endLine;
                });
              } else if (!startLine && !endLine && fileData.ranges.length > 0) {
                // Full file read requested, and we have at least some data
                rangeFullyCovered = true;
              }

              if (rangeFullyCovered) {
                loopDetectedOutput = '[SYSTEM] You have explored this line in this file, try another search. read the memory below, you dont need to search this again!!!!!!!!!!!!!!';
                log('CODES', 2, 'processCodeRequest', 'Smart file read detection: requested range already in memory', {
                  iteration,
                  requestedPath,
                  memoryPath: memPath,
                  startLine,
                  endLine,
                });
              }
              break;
            }
          }
        }
      }
    }

    // STEP 3: Execute command (or skip if loop detected)
    let output, exitCode, blocked, isTimeout;

    if (loopDetectedOutput) {
      // Skip execution, return loop detection feedback
      output = loopDetectedOutput;
      exitCode = 0;
      blocked = false;
      isTimeout = false;

      log('CODES', 1, 'processCodeRequest', 'Skipped command execution due to loop detection', {
        iteration,
        command: parsed.command.substring(0, 100),
      });
    } else {
      const result = await executeCommand(state, parsed.command, {
        disableTimeout: requiresConfirmation && confirmationApproved,
        sessionId,
        memoryOwnerId: state.memoryOwnerId,
      });
      output = result.output;
      exitCode = result.exitCode;
      blocked = result.blocked;
      isTimeout = result.isTimeout;

      // Ensure output is always delivered to the user when a command was requested
      if ((output === undefined || output === null || output === '') && parsed.command) {
        output = 'Command completed with no output.';
      }
    }

    // Detect ripgrep auto-install - restart terminal and retry ONCE
    if (output && output.includes('[RG_INSTALLED]')) {
      log('CODES', 1, 'processCodeRequest', 'Ripgrep installed', {
        iteration,
        sessionId,
        alreadyAttempted: state.rgInstallAttempted || false,
      });

      // Track installation attempt to prevent infinite loop
      if (!state.rgInstallAttempted) {
        state.rgInstallAttempted = true;

        // Dispose current terminal to restart with new PATH
        try {
          state.terminal?.dispose();
          state.terminal = null;
          log('CODES', 1, 'processCodeRequest', 'Terminal disposed for ripgrep PATH update', { sessionId });
        } catch (error) {
          log('CODES', 2, 'processCodeRequest', 'Failed to dispose terminal', {
            error: error?.message || error,
          });
        }

        // Add system message to conversation history
        const systemMsg = '[SYSTEM] Ripgrep installed successfully. Terminal restarted. Please retry the Search-InFiles command once.';
        state.conversationHistory.push({
          role: 'user',
          content: systemMsg,
        });

        state.commandHistory.push({
          command: '[SYSTEM - RG INSTALLED]',
          output: systemMsg,
          exitCode: 0,
          summary: 'Ripgrep auto-installed, terminal restarted',
          timestamp: Date.now(),
        });

        // Continue to next iteration - allow ONE retry
        continue;
      } else {
        // Already attempted install - PATH update requires app restart
        const restartMsg = '[SYSTEM] Ripgrep was installed but requires application restart to update PATH. Please ask the user to restart Clustrix, or use alternative commands (ls, gc, etc.) instead of Search-InFiles.';

        state.conversationHistory.push({
          role: 'user',
          content: restartMsg,
        });

        state.commandHistory.push({
          command: '[SYSTEM - RG INSTALL FAILED]',
          output: restartMsg,
          exitCode: 1,
          summary: 'Ripgrep install requires app restart',
          timestamp: Date.now(),
        });

        log('CODES', 2, 'processCodeRequest', 'Ripgrep install requires app restart - preventing infinite loop', {
          iteration,
          sessionId,
        });

        // Continue to let AI know about the issue and use fallback
        continue;
      }
    }

    // Use AI's summary if provided, otherwise auto-generate
    const entrySummary = parsed.summary || summarizeOutput(output, exitCode);
    const historyEntry = {
      command: parsed.command || '[no command]',
      output,
      exitCode,
      summary: entrySummary,
      timestamp: Date.now(),
    };
    if (parsed.command) {
      state.commandHistory.push(historyEntry);
      if (state.commandHistory.length > MAX_HISTORY * 2) {
        state.commandHistory.splice(0, state.commandHistory.length - MAX_HISTORY * 2);
      }

      // Add command execution result to conversation history as user message
      // This gives the AI feedback about what happened
      // V2: Use SIMPLE format to avoid confusing AI (no markdown code blocks!)
      // Use 'older' mode for truncation (max 10 lines) to keep context concise
      const feedbackMessage = exitCode === 0
        ? `[SYSTEM] Command executed successfully.\nOutput:\n${output}`
        : `[SYSTEM] Command failed with exit code ${exitCode}.\nError Output:\n${output}`;

      if (parsed.toolUseId) {
        // Claude Tool Result
        state.conversationHistory.push({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: parsed.toolUseId,
              content: feedbackMessage
            }
          ]
        });
      } else {
        state.conversationHistory.push({
          role: 'user',
          content: feedbackMessage,
        });
      }

      // INTERNAL STATE TRANSITION: Update state based on command type and result
      if (exitCode === 0) {
        const cmd = parsed.command.toLowerCase();
        if (cmd.includes('search-infiles') || cmd.includes('list-projectfiles') || cmd.includes('get-childitem')) {
          state.currentState = AGENT_STATES.READ; // Search done, now read files
        } else if (cmd.includes('read-file') || cmd.includes('get-content')) {
          state.currentState = AGENT_STATES.UNDERSTAND; // Read done, now analyze
        } else if (cmd.includes('-replace') || cmd.includes('set-content') || cmd.includes('out-file')) {
          state.currentState = AGENT_STATES.EXECUTE; // Edit done, now test/run
        } else if (cmd.includes('npm test') || cmd.includes('jest') || cmd.includes('run test')) {
          state.currentState = AGENT_STATES.VERIFY; // Test done, verify results
        }
        // Other commands keep current state
      }

      // Save iteration to code_iterations table
      if (db && sessionId) {
        try {
          db.addCodeIteration?.(sessionId, iteration, iteration, {
            command: parsed.command,
            output: truncateOutput(output, 'older'),
            exitCode,
            answer: parsed.answer || null,
            hidden: parsed.hidden || null,
            summary: entrySummary,
          });
        } catch (error) {
          log('CODES', 3, 'processCodeRequest', 'Failed to save iteration', {
            sessionId,
            iteration,
            error: error?.message || error,
          });
        }
      }
    }

    // Loop breaker logic removed as per user request (never stop stream)
    // if (exitCode !== 0 && parsed.command && parsed.command.includes('-replace')) { ... }

    // STEP 3: Send output AFTER executing (but NOT if timeout - keep error in history for AI only)
    if (!isTimeout) {
      // Special handling for Show-FileWithLineNumbers with specific range - don't truncate
      // Also don't truncate for main execution output to show full results
      let finalOutput = output;
      const isSpecificRangeRead = parsed.command &&
        parsed.command.match(/Show-FileWithLineNumbers\s+-Path\s+"?([^"\s]+)"?\s+-StartLine\s+(\d+)\s+-EndLine\s+(\d+)/i);

      if (!isSpecificRangeRead) {
        finalOutput = truncateOutput(output, 'unlimited');
      }

      const outputChunk = formatOutput({
        output: finalOutput,
        exitCode,
        blocked,
      });

      if (outputChunk && typeof onChunk === 'function') {
        try {
          chunks.push(outputChunk);
          onChunk(outputChunk, {
            iteration,
            type: 'output',
            done: !parsed.command || parsed.done,
          });
        } catch (error) {
          log('CODES', 2, 'processCodeRequest', 'Failed to deliver output chunk', {
            error: error?.message || error,
            iteration,
            sessionId,
          });
        }
      }
    } else {
      // Timeout occurred - error is already in commandHistory, don't send to renderer
      log('CODES', 1, 'processCodeRequest', 'Command execution timeout - error stored in history for AI to read', {
        iteration,
        sessionId,
        command: parsed.command,
      });
      break;
    }

    if (parsed.done) {
      break;
    }
  }

  // SKIP saving user/assistant messages to database here
  // Frontend (renderer) already saved them before calling processCodeRequest
  // to prevent duplicate messages after reload
  // Only code_iterations table is updated during agent execution
  log('CODES', 1, 'processCodeRequest', 'Skipping message save (frontend already saved)', {
    sessionId,
    hasFinalAnswer: !!finalAnswer,
  });

  return {
    chunks,
    usage,
    cancelled: typeof shouldCancel === 'function' ? !!shouldCancel() : false,
  };
}

function initializeCodeAgent(options = {}) {
  deps = {
    ...deps,
    ...options,
  };
}

function disposeAllCodeSessions() {
  log('CODES', 1, 'disposeAllCodeSessions', 'Disposing all PowerShell sessions', {
    sessionCount: sessionStates.size,
  });

  for (const [sessionId, state] of sessionStates.entries()) {
    try {
      if (state.terminal && !state.terminal.isDisposed) {
        state.terminal.dispose();
        log('CODES', 2, 'disposeAllCodeSessions', 'Disposed PowerShell session', { sessionId });
      }
    } catch (error) {
      log('CODES', 4, 'disposeAllCodeSessions', 'Error disposing session', {
        sessionId,
        error: error?.message || error,
      });
    }
  }

  sessionStates.clear();
  log('CODES', 1, 'disposeAllCodeSessions', 'All PowerShell sessions disposed');
}

function cancelCodeSession(sessionId) {
  log('CODES', 1, 'cancelCodeSession', 'Cancelling code session', { sessionId });

  const state = sessionStates.get(sessionId);
  if (!state) {
    log('CODES', 2, 'cancelCodeSession', 'Session not found', { sessionId });
    return false;
  }

  // Session cleanup handled by force interrupt - no interrupt flag needed
  return true;
}

module.exports = {
  initializeCodeAgent,
  processCodeRequest,
  resolveUserConfirmation,
  disposeAllCodeSessions,
  cancelCodeSession,
};
