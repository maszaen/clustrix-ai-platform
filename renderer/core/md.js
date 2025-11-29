// OPTIMIZATION: LRU Cache for parsed markdown
class LRUCache {
  constructor(maxSize = 100) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  get(key) {
    if (!this.cache.has(key)) return null;
    // Move to end (most recently used)
    const value = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key, value) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Remove oldest (first item)
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  clear() {
    this.cache.clear();
  }
}

const markdownCache = new LRUCache(100);

// HTML escape function
function esc(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Helper function to process inline markdown formatting within link/image text
function parseInlineContent(text) {
  if (!text) return "";
  // Process bold, italic, strikethrough, code
  return text
    .replace(/\*\*\*(.*?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/___(.*?)___/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.*?)__/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/_([^_]+)_/g, "<em>$1</em>")
    .replace(/~~(.*?)~~/g, "<del>$1</del>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

const SPARKLE = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-thumbs-up-icon lucide-thumbs-up"><path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/></svg>'
// Browser icon SVG untuk external links
const BROWSER_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-up-right-icon lucide-arrow-up-right"><path d="M7 7h10v10"/><path d="M7 17 17 7"/></svg>';

// Email icon SVG untuk mailto links
const EMAIL_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-mail-icon"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>';

// Transform command text into human-readable description
function transformCommandText(commandText) {
  if (!commandText) return commandText;

  let fullCmd = commandText.trim();
  
  // Handle <cmd>...</cmd> wrapper - extract inner content
  const cmdWrapperMatch = fullCmd.match(/^<cmd>\s*([\s\S]*?)\s*<\/cmd>$/i);
  if (cmdWrapperMatch) {
    fullCmd = cmdWrapperMatch[1].trim();
  }

  // Smart split by pipe - respects quoted strings
  // This prevents splitting on | inside quotes like grep -E "(A|B)"
  const splitByPipe = (str) => {
    const parts = [];
    let current = '';
    let inSingleQuote = false;
    let inDoubleQuote = false;
    
    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      const prevChar = i > 0 ? str[i - 1] : '';
      
      // Toggle quote state (ignore escaped quotes)
      if (char === "'" && prevChar !== '\\' && !inDoubleQuote) {
        inSingleQuote = !inSingleQuote;
      } else if (char === '"' && prevChar !== '\\' && !inSingleQuote) {
        inDoubleQuote = !inDoubleQuote;
      }
      
      // Split on pipe only when not inside quotes
      if (char === '|' && !inSingleQuote && !inDoubleQuote) {
        parts.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    if (current.trim()) {
      parts.push(current.trim());
    }
    
    return parts;
  };

  // Check if there are multiple piped commands
  const pipedCommands = splitByPipe(fullCmd).filter(c => c);
  if (pipedCommands.length > 1) {
    // Process each piped command and join with "and"
    const descriptions = pipedCommands.map(singleCmd => {
      const desc = transformSingleCommand(singleCmd);
      // Return description only if it's different from the original command (meaning it was recognized)
      return desc !== singleCmd ? desc : null;
    }).filter(desc => desc);

    if (descriptions.length > 0) {
      return descriptions.join(' and ');
    }
  }

  // Single command - process normally
  return transformSingleCommand(fullCmd);
}

// Transform single command (helper for transformCommandText)
function transformSingleCommand(commandText) {
  const cmd = commandText.trim();

  // Helper: Extract just filename from path (H:\path\to\file.js → file.js)
  const getFilename = (path) => {
    if (!path) return path;
    // Remove quotes first
    path = path.replace(/['"]/g, '');
    // Get last part after / or \
    const parts = path.split(/[/\\]/);
    return parts[parts.length - 1] || path;
  };

  // Helper function to extract parameter value
  const getParam = (paramName) => {
    const regex = new RegExp(`-${paramName}\\s+["']?([^"'\\s-]+)["']?`, 'i');
    const match = cmd.match(regex);
    return match ? match[1] : null;
  };

  // Helper function to extract quoted strings (including paths with spaces)
  const getQuotedParam = (paramName) => {
    const regex = new RegExp(`-${paramName}\\s+["']([^"']+)["']`, 'i');
    const match = cmd.match(regex);
    return match ? match[1] : null;
  };

  // Helper to get file path (can be quoted or unquoted)
  const getPath = () => {
    return getQuotedParam('Path') || getParam('Path');
  };

  // XML-style edit commands (sometimes AI outputs these)
  if (cmd.match(/^<set\s+file=/i)) {
    const fileMatch = cmd.match(/file=["']([^"']+)["']/i);
    const rangeMatch = cmd.match(/range=\{\s*(\d+)\s*,\s*(\d+)\s*\}/i);

    if (fileMatch) {
      const filename = getFilename(fileMatch[1]);
      if (rangeMatch) {
        const start = rangeMatch[1];
        const end = rangeMatch[2];
        return `Edit <strong>${filename}</strong>, lines ${start}-${end}`;
      }
      return `Edit <strong>${filename}</strong>`;
    }
  }

  // PowerShell heredoc with Out-File (@'...'@ | Out-File -FilePath "file.js")
  if (cmd.match(/^@['"][\s\S]*['"]@\s*\|\s*Out-File/i) || cmd.match(/Out-File\s+-FilePath/i)) {
    const fileMatch = cmd.match(/-FilePath\s+["']([^"']+)["']/i) || cmd.match(/-FilePath\s+(\S+)/i);
    if (fileMatch) {
      const filename = getFilename(fileMatch[1]);
      return `Write <strong>${filename}</strong>`;
    }
    return 'Write file';
  }

  // PowerShell Set-Content with heredoc (@'...'@ | Set-Content "file.js")
  if (cmd.match(/^@['"][\s\S]*['"]@\s*\|\s*Set-Content/i)) {
    const fileMatch = cmd.match(/Set-Content\s+["']([^"']+)["']/i) || cmd.match(/Set-Content\s+-Path\s+["']([^"']+)["']/i);
    if (fileMatch) {
      const filename = getFilename(fileMatch[1]);
      return `Write <strong>${filename}</strong>`;
    }
    return 'Write file';
  }

  // PowerShell helper functions
  if (cmd.match(/^Show-FileWithLineNumbers/i)) {
    const path = getPath();
    const startLine = getParam('StartLine');
    const endLine = getParam('EndLine');

    if (!path) return cmd;

    const filename = getFilename(path);

    if (startLine && endLine) {
      return `Read <strong>${filename}</strong>, lines ${startLine}-${endLine}`;
    } else if (startLine) {
      return `Read <strong>${filename}</strong>, from line ${startLine}`;
    } else {
      return `Read <strong>${filename}</strong>`;
    }
  }

  if (cmd.match(/^Set-FileLine/i)) {
    const path = getPath();
    const lineNum = getParam('LineNumber');

    if (!path || !lineNum) return cmd;

    const filename = getFilename(path);
    return `Edit <strong>${filename}</strong>, line ${lineNum}`;
  }

  if (cmd.match(/^Remove-FileLine/i)) {
    const path = getPath();
    const lineNum = getParam('LineNumber');

    if (!path || !lineNum) return cmd;

    const filename = getFilename(path);
    return `Remove line ${lineNum} from <strong>${filename}</strong>`;
  }

  if (cmd.match(/^Add-FileLine/i)) {
    const path = getPath();
    const lineNum = getParam('LineNumber');

    if (!path || !lineNum) return cmd;

    const filename = getFilename(path);
    return `Add line to <strong>${filename}</strong> at position ${lineNum}`;
  }

  if (cmd.match(/^Set-MultipleLines/i)) {
    const path = getPath();

    if (!path) return cmd;

    const filename = getFilename(path);

    // Try to count replacements from hashtable
    const hashMatch = cmd.match(/@\{([^}]+)\}/);
    if (hashMatch) {
      const entries = hashMatch[1].split(';').filter(e => e.trim());
      return `Edit <strong>${filename}</strong>, ${entries.length} lines`;
    }

    return `Edit <strong>${filename}</strong>`;
  }

  if (cmd.match(/^Search-Pattern/i)) {
    const pattern = getQuotedParam('Pattern') || getParam('Pattern');
    const path = getPath() || getParam('Directory');
    const filter = getQuotedParam('Filter') || getParam('Filter');

    if (!pattern) return cmd;

    let description = `Search <code>${esc(pattern)}</code>`;

    if (path) {
      const filename = getFilename(path);
      // Only add "from" if it's a file, not a directory like "."
      if (filename !== '.' && filename !== path) {
        description += ` from <strong>${filename}</strong>`;
      }
    }

    if (filter && filter !== '*.*') {
      description += ` <span style="opacity: 0.7">(${filter})</span>`;
    }

    return description;
  }

  if (cmd.match(/^Find-Pattern/i)) {
    const pattern = getQuotedParam('Pattern') || getParam('Pattern');
    const path = getPath();

    if (!pattern || !path) return cmd;

    const filename = getFilename(path);
    return `Search with pattern <code>${esc(pattern)}</code> from <strong>${filename}</strong>`;
  }

  if (cmd.match(/^Get-FileStats/i)) {
    const path = getPath();

    if (!path) return cmd;

    const filename = getFilename(path);
    return `Get stats for <strong>${filename}</strong>`;
  }

  if (cmd.match(/^Replace-InFile/i)) {
    const path = getPath();
    const search = getQuotedParam('SearchString');
    const replace = getQuotedParam('ReplaceString');

    if (!path) return cmd;

    const filename = getFilename(path);

    if (search && replace) {
      return `Replace <code>${esc(search)}</code> with <code>${esc(replace)}</code> in <strong>${filename}</strong>`;
    } else if (search) {
      return `Replace text in <strong>${filename}</strong>`;
    }

    return cmd;
  }

  if (cmd.match(/^Get-DirectoryStructure/i)) {
    const path = getPath();
    const depth = getParam('Depth');

    if (!path) return cmd;

    const dirname = getFilename(path);

    if (depth) {
      return `List directory <strong>${dirname}</strong> <span style="opacity: 0.7">(depth: ${depth})</span>`;
    } else {
      return `List directory <strong>${dirname}</strong>`;
    }
  }

  if (/^List-ProjectFiles/i.test(cmd)) {
    const path = getPath();
    const dirname = path ? getFilename(path) : null;
    const extMatch = cmd.match(/-Extensions\s+["']([^"']+)["']/i);
    const ext = extMatch?.[1] || null;

    // bangun deskripsi
    const parts = [];

    if (ext) {
      parts.push(`with <code>${ext}</code> extension`);
    }

    if (dirname && dirname !== '.' && dirname !== path) {
      parts.push(`in <strong>${dirname}</strong>`);
    }

    if (parts.length === 0) {
      return 'List files';
    }

    return `List files ${parts.join(' ')}`;
  }

  if (cmd.match(/^Search-InFiles/i)) {
    const pattern = getQuotedParam('Pattern') || getParam('Pattern');

    if (pattern) {
      return `Search with pattern <code>${esc(pattern)}</code>`;
    }

    return 'Search files';
  }

  // Node.js commands
  if (cmd.match(/^node\s+/i)) {
    const fileMatch = cmd.match(/^node\s+["']?([^\s"']+)["']?/i);
    if (fileMatch) {
      const file = getFilename(fileMatch[1]);
      const args = cmd.substring(fileMatch[0].length).trim();

      if (args) {
        // Truncate long args
        const shortArgs = args.length > 40 ? args.substring(0, 37) + '...' : args;
        return `Run <strong>${file}</strong> <span style="opacity: 0.7">${esc(shortArgs)}</span>`;
      } else {
        return `Run <strong>${file}</strong>`;
      }
    }
  }

  // NPM commands
  if (cmd.match(/^npm\s+/i)) {
    const npmMatch = cmd.match(/^npm\s+(\S+)(\s+.*)?/i);
    if (npmMatch) {
      const npmCmd = npmMatch[1];
      const args = npmMatch[2] ? npmMatch[2].trim() : '';

      const npmDescriptions = {
        'install': 'Install packages',
        'i': 'Install packages',
        'uninstall': 'Uninstall packages',
        'update': 'Update packages',
        'run': 'Run',
        'start': 'Start app',
        'test': 'Run tests',
        'build': 'Build project',
        'dev': 'Start dev server',
        'init': 'Initialize project',
        'publish': 'Publish package',
        'version': 'Manage version',
        'audit': 'Audit dependencies',
        'outdated': 'Check outdated',
        'list': 'List packages',
        'ls': 'List packages'
      };

      const description = npmDescriptions[npmCmd.toLowerCase()] || `npm ${npmCmd}`;

      if (args) {
        const shortArgs = args.length > 30 ? args.substring(0, 27) + '...' : args;
        return `${description} <code>${esc(shortArgs)}</code>`;
      } else {
        return description;
      }
    }
  }

  // Git commands
  if (cmd.match(/^git\s+/i)) {
    const gitMatch = cmd.match(/^git\s+(\S+)(\s+.*)?/i);
    if (gitMatch) {
      const gitCmd = gitMatch[1];
      const args = gitMatch[2] ? gitMatch[2].trim() : '';

      const gitDescriptions = {
        'clone': 'Clone repo',
        'pull': 'Pull changes',
        'push': 'Push changes',
        'commit': 'Commit',
        'add': 'Stage files',
        'status': 'Check status',
        'log': 'View history',
        'diff': 'View diff',
        'branch': 'Manage branches',
        'checkout': 'Switch to',
        'merge': 'Merge',
        'rebase': 'Rebase',
        'reset': 'Reset',
        'stash': 'Stash changes',
        'tag': 'Manage tags',
        'fetch': 'Fetch',
        'remote': 'Manage remotes',
        'init': 'Initialize repo'
      };

      const description = gitDescriptions[gitCmd.toLowerCase()] || `git ${gitCmd}`;

      if (args) {
        const shortArgs = args.length > 40 ? args.substring(0, 37) + '...' : args;
        return `${description} <code>${esc(shortArgs)}</code>`;
      } else {
        return description;
      }
    }
  }

  // Python commands
  if (cmd.match(/^python\s+/i) || cmd.match(/^python3\s+/i)) {
    const pyMatch = cmd.match(/^(?:python3?)\s+["']?([^\s"']+)["']?/i);
    if (pyMatch) {
      const file = getFilename(pyMatch[1]);
      const args = cmd.substring(pyMatch[0].length).trim();

      if (args) {
        const shortArgs = args.length > 30 ? args.substring(0, 27) + '...' : args;
        return `Run Python <strong>${file}</strong> <span style="opacity: 0.7">${esc(shortArgs)}</span>`;
      } else {
        return `Run Python <strong>${file}</strong>`;
      }
    }
  }

  // pip commands
  if (cmd.match(/^pip\s+/i) || cmd.match(/^pip3\s+/i)) {
    const pipMatch = cmd.match(/^pip3?\s+(\S+)(\s+.*)?/i);
    if (pipMatch) {
      const pipCmd = pipMatch[1];
      const args = pipMatch[2] ? pipMatch[2].trim() : '';

      const pipDescriptions = {
        'install': 'Install package',
        'uninstall': 'Uninstall package',
        'list': 'List packages',
        'show': 'Show package info',
        'freeze': 'Freeze packages',
        'search': 'Search packages',
        'upgrade': 'Upgrade package'
      };

      const description = pipDescriptions[pipCmd.toLowerCase()] || `pip ${pipCmd}`;

      if (args) {
        const shortArgs = args.length > 30 ? args.substring(0, 27) + '...' : args;
        return `${description} <code>${esc(shortArgs)}</code>`;
      } else {
        return description;
      }
    }
  }

  // Cargo (Rust) commands
  if (cmd.match(/^cargo\s+/i)) {
    const cargoMatch = cmd.match(/^cargo\s+(\S+)(\s+.*)?/i);
    if (cargoMatch) {
      const cargoCmd = cargoMatch[1];
      const args = cargoMatch[2] ? cargoMatch[2].trim() : '';

      const cargoDescriptions = {
        'build': 'Build project',
        'run': 'Run project',
        'test': 'Run tests',
        'check': 'Check code',
        'clean': 'Clean artifacts',
        'new': 'New project',
        'init': 'Init project',
        'add': 'Add dependency',
        'update': 'Update deps',
        'publish': 'Publish crate'
      };

      const description = cargoDescriptions[cargoCmd.toLowerCase()] || `cargo ${cargoCmd}`;

      if (args) {
        const shortArgs = args.length > 30 ? args.substring(0, 27) + '...' : args;
        return `${description} <code>${esc(shortArgs)}</code>`;
      } else {
        return description;
      }
    }
  }

  // Docker commands
  if (cmd.match(/^docker\s+/i)) {
    const dockerMatch = cmd.match(/^docker\s+(\S+)(\s+.*)?/i);
    if (dockerMatch) {
      const dockerCmd = dockerMatch[1];
      const args = dockerMatch[2] ? dockerMatch[2].trim() : '';

      const dockerDescriptions = {
        'build': 'Build image',
        'run': 'Run container',
        'ps': 'List containers',
        'images': 'List images',
        'pull': 'Pull image',
        'push': 'Push image',
        'stop': 'Stop container',
        'start': 'Start container',
        'restart': 'Restart container',
        'rm': 'Remove container',
        'rmi': 'Remove image',
        'exec': 'Execute in container',
        'logs': 'View logs',
        'compose': 'Docker Compose'
      };

      const description = dockerDescriptions[dockerCmd.toLowerCase()] || `docker ${dockerCmd}`;

      if (args && args.length < 40) {
        return `${description} <code>${esc(args)}</code>`;
      } else {
        return description;
      }
    }
  }

  // Maven commands
  if (cmd.match(/^mvn\s+/i)) {
    const mvnMatch = cmd.match(/^mvn\s+(.+)/i);
    if (mvnMatch) {
      const goals = mvnMatch[1].trim();
      const shortGoals = goals.length > 30 ? goals.substring(0, 27) + '...' : goals;
      return `Maven <code>${esc(shortGoals)}</code>`;
    }
  }

  // Gradle commands
  if (cmd.match(/^gradle\s+/i) || cmd.match(/^\.\/gradlew\s+/i)) {
    const gradleMatch = cmd.match(/^(?:gradle|\.\/gradlew)\s+(.+)/i);
    if (gradleMatch) {
      const tasks = gradleMatch[1].trim();
      const shortTasks = tasks.length > 30 ? tasks.substring(0, 27) + '...' : tasks;
      return `Gradle <code>${esc(shortTasks)}</code>`;
    }
  }

  // Make commands
  if (cmd.match(/^make\s+/i)) {
    const makeMatch = cmd.match(/^make\s+(\S+)?/i);
    if (makeMatch) {
      const target = makeMatch[1];
      if (target) {
        return `Make <code>${esc(target)}</code>`;
      } else {
        return 'Make';
      }
    }
  }

  // Common shell commands
  if (cmd.match(/^cd\s+/i)) {
    const dirMatch = cmd.match(/^cd\s+["']?([^\s"']+)["']?/i);
    if (dirMatch) {
      const dirname = getFilename(dirMatch[1]);
      return `Change to <strong>${dirname}</strong>`;
    }
  }

  // LS/DIR - list directory (improved)
  if (cmd.match(/^ls\s*/i) || cmd.match(/^dir\s*/i)) {
    const flags = [];
    // Parse flags - can be combined like -la, -lah, or separate -l -a
    if (cmd.match(/-[a-zA-Z]*l[a-zA-Z]*/i)) flags.push('detailed');
    if (cmd.match(/-[a-zA-Z]*a[a-zA-Z]*/i)) flags.push('all');
    if (cmd.match(/-[a-zA-Z]*R[a-zA-Z]*/i)) flags.push('recursive');
    if (cmd.match(/-[a-zA-Z]*h[a-zA-Z]*/i)) flags.push('human-readable');
    
    // Check for directory argument (after all flags) - must not start with -
    const dirMatch = cmd.match(/(?:ls|dir)\s+(?:-[a-zA-Z]+\s+)*([^\s-][^\s]*)$/i);
    if (dirMatch) {
      const dirname = getFilename(dirMatch[1].replace(/["']/g, ''));
      if (flags.length > 0) {
        return `List <strong>${dirname}</strong> <span style="opacity: 0.7">(${flags.join(', ')})</span>`;
      }
      return `List <strong>${dirname}</strong>`;
    }
    
    if (flags.length > 0) return `List directory <span style="opacity: 0.7">(${flags.join(', ')})</span>`;
    return 'List directory';
  }

  if (cmd.match(/^cat\s+/i) || cmd.match(/^type\s+/i)) {
    const fileMatch = cmd.match(/^(?:cat|type)\s+["']?([^\s"']+)["']?/i);
    if (fileMatch) {
      const filename = getFilename(fileMatch[1]);
      return `Read <strong>${filename}</strong>`;
    }
  }

  if (cmd.match(/^cp\s+/i) || cmd.match(/^copy\s+/i)) {
    return 'Copy files';
  }

  if (cmd.match(/^mv\s+/i) || cmd.match(/^move\s+/i)) {
    return 'Move files';
  }

  if (cmd.match(/^rm\s+/i) || cmd.match(/^del\s+/i)) {
    return 'Delete files';
  }

  if (cmd.match(/^mkdir\s+/i)) {
    const dirMatch = cmd.match(/^mkdir\s+["']?([^\s"']+)["']?/i);
    if (dirMatch) {
      const dirname = getFilename(dirMatch[1]);
      return `Create directory <strong>${dirname}</strong>`;
    }
    return 'Create directory';
  }

  // ========== UNIX PIPE COMMANDS ==========
  
  // GREP - comprehensive handler for all common flags
  if (cmd.match(/^grep\s+/i)) {
    let pattern = null;
    let flags = [];
    let contextInfo = null;
    
    // Check for context flags first: -A (after), -B (before), -C (context)
    const afterMatch = cmd.match(/-A\s*(\d+)/i);
    const beforeMatch = cmd.match(/-B\s*(\d+)/i);
    const contextMatch = cmd.match(/-C\s*(\d+)/i);
    
    if (contextMatch) {
      contextInfo = `±${contextMatch[1]} lines`;
    } else if (afterMatch && beforeMatch) {
      contextInfo = `-${beforeMatch[1]}/+${afterMatch[1]} lines`;
    } else if (afterMatch) {
      contextInfo = `+${afterMatch[1]} lines after`;
    } else if (beforeMatch) {
      contextInfo = `-${beforeMatch[1]} lines before`;
    }
    
    // Check for other flags - handle both separate (-i -n) and combined (-in) flags
    // Use pattern that matches flag anywhere in a flag group
    if (cmd.match(/-[a-zA-Z]*E[a-zA-Z]*/)) flags.push('regex');
    if (cmd.match(/-[a-zA-Z]*P[a-zA-Z]*/)) flags.push('perl-regex');
    if (cmd.match(/-[a-zA-Z]*F[a-zA-Z]*/)) flags.push('fixed');
    if (cmd.match(/-[a-zA-Z]*i[a-zA-Z]*/)) flags.push('ignore-case');
    if (cmd.match(/-[a-zA-Z]*v[a-zA-Z]*/)) flags.push('invert');
    if (cmd.match(/-[a-zA-Z]*w[a-zA-Z]*/)) flags.push('word');
    if (cmd.match(/-[a-zA-Z]*x[a-zA-Z]*/)) flags.push('line');
    if (cmd.match(/-[a-zA-Z]*n[a-zA-Z]*/)) flags.push('line-num');
    if (cmd.match(/-[a-zA-Z]*c[a-zA-Z]*/)) flags.push('count');
    if (cmd.match(/-[a-zA-Z]*l[a-zA-Z]*/)) flags.push('files-only');
    if (cmd.match(/-[a-zA-Z]*o[a-zA-Z]*/)) flags.push('only-match');
    if (cmd.match(/-[a-zA-Z]*[rR][a-zA-Z]*/)) flags.push('recursive');
    
    // Extract pattern - remove all flags first, then get the pattern
    // Pattern can be quoted or unquoted, and may contain special chars
    let remaining = cmd.replace(/^grep\s+/i, '');
    // Remove all flag patterns: -X, -X N, --flag, --flag=value
    remaining = remaining.replace(/-[A-Za-z]\s*\d+/g, ''); // -A 5, -B3, etc
    remaining = remaining.replace(/--[a-z-]+(=\S+)?/gi, ''); // --color=auto, --include
    remaining = remaining.replace(/-[A-Za-z]+/g, ''); // -Ei, -rn, etc
    remaining = remaining.trim();
    
    // Now extract pattern (quoted or unquoted)
    const quotedMatch = remaining.match(/^["'](.+?)["']/);
    const unquotedMatch = remaining.match(/^([^\s"']+)/);
    pattern = quotedMatch ? quotedMatch[1] : (unquotedMatch ? unquotedMatch[1] : null);
    
    if (pattern) {
      const shortPattern = pattern.length > 40 ? pattern.substring(0, 37) + '...' : pattern;
      let desc = `Search for <code>${esc(shortPattern)}</code>`;
      
      // Add context info if present
      if (contextInfo) {
        desc += ` <span style="opacity: 0.7">(${contextInfo})</span>`;
      } else if (flags.length > 0 && flags.length <= 3) {
        desc += ` <span style="opacity: 0.7">(${flags.join(', ')})</span>`;
      }
      return desc;
    }
    return 'Search in output';
  }

  // TAIL - see last N lines
  if (cmd.match(/^tail\s+/i)) {
    const lineMatch = cmd.match(/^tail\s+(?:-n\s*(\d+)|--lines[=\s](\d+)|-(\d+))/i);
    if (lineMatch) {
      const lines = lineMatch[1] || lineMatch[2] || lineMatch[3];
      return `See last <strong>${lines}</strong> lines`;
    }
    return 'See last lines';
  }

  // HEAD - see first N lines
  if (cmd.match(/^head\s+/i)) {
    const lineMatch = cmd.match(/^head\s+(?:-n\s*(\d+)|--lines[=\s](\d+)|-(\d+))/i);
    if (lineMatch) {
      const lines = lineMatch[1] || lineMatch[2] || lineMatch[3];
      return `See first <strong>${lines}</strong> lines`;
    }
    return 'See first lines';
  }

  // AWK - text processing
  if (cmd.match(/^awk\s+/i)) {
    const awkMatch = cmd.match(/^awk\s+(?:-F\s*["']?([^"'\s]+)["']?\s+)?["']([^"']+)["']/i);
    if (awkMatch) {
      const script = awkMatch[2];
      if (script.match(/^\{print\s+\$\d+\}$/i)) {
        const colMatch = script.match(/\$(\d+)/);
        return `Extract column <strong>${colMatch[1]}</strong>`;
      }
      const shortScript = script.length > 35 ? script.substring(0, 32) + '...' : script;
      return `Process with <code>${esc(shortScript)}</code>`;
    }
    return 'Process text';
  }

  // SED - text substitution
  if (cmd.match(/^sed\s+/i)) {
    const sedMatch = cmd.match(/^sed\s+(?:-[a-zA-Z]+\s+)*["']?s[\/|]([^\/|]+)[\/|]([^\/|]*)[\/|]?/i);
    if (sedMatch) {
      const search = sedMatch[1].length > 20 ? sedMatch[1].substring(0, 17) + '...' : sedMatch[1];
      const replace = sedMatch[2].length > 20 ? sedMatch[2].substring(0, 17) + '...' : sedMatch[2];
      return `Replace <code>${esc(search)}</code> → <code>${esc(replace)}</code>`;
    }
    return 'Transform text';
  }

  // CUT - extract columns
  if (cmd.match(/^cut\s+/i)) {
    const fieldMatch = cmd.match(/-f\s*["']?(\d+(?:[,-]\d+)*)["']?/i);
    const delimMatch = cmd.match(/-d\s*["']?([^"'\s])["']?/i);
    if (fieldMatch) {
      let desc = `Extract field(s) <strong>${fieldMatch[1]}</strong>`;
      if (delimMatch) desc += ` <span style="opacity: 0.7">(delim: ${esc(delimMatch[1])})</span>`;
      return desc;
    }
    return 'Extract columns';
  }

  // SORT (Unix) - different from Sort-Object
  if (cmd.match(/^sort(?:\s|$)/i) && !cmd.match(/^Sort-Object/i)) {
    const flags = [];
    // Handle both separate (-r -n) and combined (-rn) flags
    if (cmd.match(/-[a-zA-Z]*r[a-zA-Z]*/i)) flags.push('reverse');
    if (cmd.match(/-[a-zA-Z]*n[a-zA-Z]*/i)) flags.push('numeric');
    if (cmd.match(/-[a-zA-Z]*u[a-zA-Z]*/i)) flags.push('unique');
    if (cmd.match(/-[a-zA-Z]*h[a-zA-Z]*/i)) flags.push('human');
    if (cmd.match(/-[a-zA-Z]*f[a-zA-Z]*/i)) flags.push('ignore-case');
    const keyMatch = cmd.match(/-k\s*(\d+)/i);
    if (keyMatch) flags.push(`col ${keyMatch[1]}`);
    
    if (flags.length > 0) return `Sort <span style="opacity: 0.7">(${flags.join(', ')})</span>`;
    return 'Sort output';
  }

  // UNIQ - remove duplicates
  if (cmd.match(/^uniq(?:\s|$)/i)) {
    if (cmd.match(/-c\b/i)) return 'Count unique lines';
    if (cmd.match(/-d\b/i)) return 'Show duplicates only';
    return 'Remove duplicates';
  }

  // WC - count lines/words
  if (cmd.match(/^wc(?:\s|$)/i)) {
    if (cmd.match(/-l\b/i)) return 'Count lines';
    if (cmd.match(/-w\b/i)) return 'Count words';
    if (cmd.match(/-c\b/i)) return 'Count bytes';
    return 'Count lines/words';
  }

  // TEE (Unix) - write to file and pass through
  if (cmd.match(/^tee\s+/i) && !cmd.match(/^Tee-Object/i)) {
    const fileMatch = cmd.match(/^tee\s+(?:-a\s+)?["']?([^\s"']+)["']?/i);
    if (fileMatch) {
      const filename = getFilename(fileMatch[1]);
      const append = cmd.match(/-a\b/i) ? 'Append' : 'Write';
      return `${append} to <strong>${filename}</strong>`;
    }
    return 'Tee output';
  }

  // XARGS - execute for each
  if (cmd.match(/^xargs\s+/i)) {
    const cmdMatch = cmd.match(/^xargs\s+(?:-[a-zA-Z0-9]+\s+)*(\S+)/i);
    if (cmdMatch) return `Run <code>${esc(cmdMatch[1])}</code> for each`;
    return 'Execute for each';
  }

  // FIND - find files
  if (cmd.match(/^find\s+/i)) {
    const nameMatch = cmd.match(/-name\s+["']([^"']+)["']/i);
    const typeMatch = cmd.match(/-type\s+([fd])/i);
    
    const parts = [];
    if (nameMatch) parts.push(`<code>${esc(nameMatch[1])}</code>`);
    if (typeMatch) parts.push(typeMatch[1] === 'd' ? 'directories' : 'files');
    
    if (parts.length > 0) return `Find ${parts.join(' ')}`;
    return 'Find files';
  }

  // CHMOD - change permissions
  if (cmd.match(/^chmod\s+/i)) {
    const permMatch = cmd.match(/^chmod\s+(\d{3,4}|[ugoa]*[+-=][rwxXst]+)\s+["']?([^\s"']+)["']?/i);
    if (permMatch) {
      const filename = getFilename(permMatch[2]);
      return `Change permissions of <strong>${filename}</strong>`;
    }
    return 'Change permissions';
  }

  // CHOWN - change ownership
  if (cmd.match(/^chown\s+/i)) {
    const chownMatch = cmd.match(/^chown\s+(?:-R\s+)?(\S+)\s+["']?([^\s"']+)["']?/i);
    if (chownMatch) {
      const filename = getFilename(chownMatch[2]);
      return `Change owner of <strong>${filename}</strong>`;
    }
    return 'Change ownership';
  }

  // DIFF - compare files
  if (cmd.match(/^diff\s+/i)) {
    const diffMatch = cmd.match(/^diff\s+(?:-[a-zA-Z]+\s+)*["']?([^\s"']+)["']?\s+["']?([^\s"']+)["']?/i);
    if (diffMatch) {
      const file1 = getFilename(diffMatch[1]);
      const file2 = getFilename(diffMatch[2]);
      return `Compare <strong>${file1}</strong> with <strong>${file2}</strong>`;
    }
    return 'Compare files';
  }

  if (cmd.match(/^curl\s+/i)) {
    const urlMatch = cmd.match(/^curl\s+(?:-\S+\s+)*["']?([^\s"']+)["']?/i);
    if (urlMatch) {
      return `Fetch <code>${esc(urlMatch[1])}</code>`;
    }
    return 'HTTP request';
  }

  if (cmd.match(/^wget\s+/i)) {
    const urlMatch = cmd.match(/^wget\s+(?:-\S+\s+)*["']?([^\s"']+)["']?/i);
    if (urlMatch) {
      return `Download <code>${esc(urlMatch[1])}</code>`;
    }
    return 'Download file';
  }

  // ========== MORE UNIX COMMANDS ==========

  // TR - translate/delete characters
  if (cmd.match(/^tr\s+/i)) {
    if (cmd.match(/-d\b/i)) {
      const charMatch = cmd.match(/-d\s*["']([^"']+)["']/i);
      if (charMatch) return `Delete chars <code>${esc(charMatch[1])}</code>`;
      return 'Delete characters';
    }
    const trMatch = cmd.match(/^tr\s+(?:-[a-zA-Z]+\s+)*["']([^"']+)["']\s+["']([^"']+)["']/i);
    if (trMatch) {
      const from = trMatch[1].length > 15 ? trMatch[1].substring(0, 12) + '...' : trMatch[1];
      const to = trMatch[2].length > 15 ? trMatch[2].substring(0, 12) + '...' : trMatch[2];
      return `Translate <code>${esc(from)}</code> → <code>${esc(to)}</code>`;
    }
    return 'Translate characters';
  }

  // REV - reverse lines
  if (cmd.match(/^rev(?:\s|$)/i)) {
    return 'Reverse lines';
  }

  // TAC - reverse file (cat backwards)
  if (cmd.match(/^tac\s+/i)) {
    const fileMatch = cmd.match(/^tac\s+["']?([^\s"']+)["']?/i);
    if (fileMatch) {
      const filename = getFilename(fileMatch[1]);
      return `Read <strong>${filename}</strong> reversed`;
    }
    return 'Reverse file';
  }

  // NL - number lines
  if (cmd.match(/^nl(?:\s|$)/i)) {
    return 'Number lines';
  }

  // PASTE - merge lines
  if (cmd.match(/^paste\s+/i)) {
    const delimMatch = cmd.match(/-d\s*["']?([^"'\s])["']?/i);
    if (delimMatch) {
      return `Merge lines <span style="opacity: 0.7">(delim: ${esc(delimMatch[1])})</span>`;
    }
    return 'Merge lines';
  }

  // COLUMN - format into columns
  if (cmd.match(/^column\s+/i)) {
    if (cmd.match(/-t\b/i)) return 'Format as table';
    return 'Format columns';
  }

  // FMT - format text
  if (cmd.match(/^fmt(?:\s|$)/i)) {
    const widthMatch = cmd.match(/-w\s*(\d+)/i);
    if (widthMatch) return `Format text <span style="opacity: 0.7">(width: ${widthMatch[1]})</span>`;
    return 'Format text';
  }

  // FOLD - wrap lines
  if (cmd.match(/^fold\s+/i)) {
    const widthMatch = cmd.match(/-w\s*(\d+)/i);
    if (widthMatch) return `Wrap at <strong>${widthMatch[1]}</strong> chars`;
    return 'Wrap lines';
  }

  // EXPAND/UNEXPAND - tabs to spaces
  if (cmd.match(/^expand(?:\s|$)/i)) {
    return 'Tabs to spaces';
  }
  if (cmd.match(/^unexpand(?:\s|$)/i)) {
    return 'Spaces to tabs';
  }

  // SPLIT - split files
  if (cmd.match(/^split\s+/i)) {
    const linesMatch = cmd.match(/-l\s*(\d+)/i);
    const bytesMatch = cmd.match(/-b\s*(\d+[KMG]?)/i);
    if (linesMatch) return `Split every <strong>${linesMatch[1]}</strong> lines`;
    if (bytesMatch) return `Split every <strong>${bytesMatch[1]}</strong>`;
    return 'Split file';
  }

  // SEQ - sequence generator
  if (cmd.match(/^seq\s+/i)) {
    const nums = cmd.match(/^seq\s+(\d+)(?:\s+(\d+))?(?:\s+(\d+))?/i);
    if (nums) {
      if (nums[3]) return `Sequence ${nums[1]} to ${nums[3]} by ${nums[2]}`;
      if (nums[2]) return `Sequence ${nums[1]} to ${nums[2]}`;
      return `Sequence 1 to ${nums[1]}`;
    }
    return 'Generate sequence';
  }

  // SHUF - shuffle lines
  if (cmd.match(/^shuf(?:\s|$)/i)) {
    const numMatch = cmd.match(/-n\s*(\d+)/i);
    if (numMatch) return `Random <strong>${numMatch[1]}</strong> lines`;
    return 'Shuffle lines';
  }

  // TOUCH - create/update file timestamp
  if (cmd.match(/^touch\s+/i)) {
    const fileMatch = cmd.match(/^touch\s+["']?([^\s"']+)["']?/i);
    if (fileMatch) {
      const filename = getFilename(fileMatch[1]);
      return `Touch <strong>${filename}</strong>`;
    }
    return 'Touch file';
  }

  // STAT - file status
  if (cmd.match(/^stat\s+/i)) {
    const fileMatch = cmd.match(/^stat\s+["']?([^\s"']+)["']?/i);
    if (fileMatch) {
      const filename = getFilename(fileMatch[1]);
      return `Stats for <strong>${filename}</strong>`;
    }
    return 'File stats';
  }

  // FILE - determine file type
  if (cmd.match(/^file\s+/i)) {
    const fileMatch = cmd.match(/^file\s+["']?([^\s"']+)["']?/i);
    if (fileMatch) {
      const filename = getFilename(fileMatch[1]);
      return `Type of <strong>${filename}</strong>`;
    }
    return 'File type';
  }

  // LN - create links
  if (cmd.match(/^ln\s+/i)) {
    if (cmd.match(/-s\b/i)) return 'Create symlink';
    return 'Create link';
  }

  // DU - disk usage
  if (cmd.match(/^du\s+/i)) {
    const flags = [];
    // Handle both separate (-h -s) and combined (-sh) flags
    if (cmd.match(/-[a-zA-Z]*h[a-zA-Z]*/i)) flags.push('human');
    if (cmd.match(/-[a-zA-Z]*s[a-zA-Z]*/i)) flags.push('summary');
    if (cmd.match(/-[a-zA-Z]*a[a-zA-Z]*/i)) flags.push('all');
    if (cmd.match(/-d\s*\d+/i) || cmd.match(/--max-depth/i)) flags.push('depth');
    
    // Extract path - remove all flags first
    let remaining = cmd.replace(/^du\s+/i, '');
    remaining = remaining.replace(/-[a-zA-Z]+\s*/g, '').replace(/-d\s*\d+\s*/g, '').trim();
    const pathArg = remaining.split(/\s+/)[0];
    
    if (pathArg) {
      // Don't run getFilename on wildcards
      const displayPath = pathArg.includes('*') ? pathArg : getFilename(pathArg);
      if (flags.length > 0) {
        return `Disk usage <strong>${displayPath}</strong> <span style="opacity: 0.7">(${flags.join(', ')})</span>`;
      }
      return `Disk usage <strong>${displayPath}</strong>`;
    }
    if (flags.length > 0) return `Disk usage <span style="opacity: 0.7">(${flags.join(', ')})</span>`;
    return 'Disk usage';
  }

  // DF - disk free
  if (cmd.match(/^df(?:\s|$)/i)) {
    if (cmd.match(/-h\b/i)) return 'Disk space (human)';
    return 'Disk space';
  }

  // FREE - memory usage
  if (cmd.match(/^free(?:\s|$)/i)) {
    if (cmd.match(/-h\b/i)) return 'Memory usage (human)';
    return 'Memory usage';
  }

  // UPTIME
  if (cmd.match(/^uptime(?:\s|$)/i)) {
    return 'System uptime';
  }

  // WHOAMI / WHO
  if (cmd.match(/^whoami(?:\s|$)/i)) {
    return 'Current user';
  }
  if (cmd.match(/^who(?:\s|$)/i)) {
    return 'Logged in users';
  }

  // HOSTNAME
  if (cmd.match(/^hostname(?:\s|$)/i)) {
    return 'Hostname';
  }

  // UNAME
  if (cmd.match(/^uname\s+/i)) {
    if (cmd.match(/-a\b/i)) return 'System info (all)';
    return 'System info';
  }

  // ENV / PRINTENV
  if (cmd.match(/^(?:env|printenv)(?:\s|$)/i)) {
    return 'Environment variables';
  }

  // EXPORT
  if (cmd.match(/^export\s+/i)) {
    const varMatch = cmd.match(/^export\s+([A-Za-z_][A-Za-z0-9_]*)=/i);
    if (varMatch) return `Set env <code>${varMatch[1]}</code>`;
    return 'Export variable';
  }

  // SOURCE / DOT
  if (cmd.match(/^(?:source|\.)\s+/i)) {
    const fileMatch = cmd.match(/^(?:source|\.)\s+["']?([^\s"']+)["']?/i);
    if (fileMatch) {
      const filename = getFilename(fileMatch[1]);
      return `Source <strong>${filename}</strong>`;
    }
    return 'Source file';
  }

  // KILL / KILLALL
  if (cmd.match(/^kill\s+/i)) {
    const signalMatch = cmd.match(/-(\d+|[A-Z]+)/i);
    const pidMatch = cmd.match(/\s(\d+)$/);
    if (pidMatch) {
      if (signalMatch) return `Kill PID ${pidMatch[1]} <span style="opacity: 0.7">(${signalMatch[1]})</span>`;
      return `Kill PID ${pidMatch[1]}`;
    }
    return 'Kill process';
  }
  if (cmd.match(/^killall\s+/i)) {
    const procMatch = cmd.match(/^killall\s+["']?([^\s"']+)["']?/i);
    if (procMatch) return `Kill all <code>${esc(procMatch[1])}</code>`;
    return 'Kill processes';
  }

  // PKILL / PGREP
  if (cmd.match(/^pkill\s+/i)) {
    const procMatch = cmd.match(/^pkill\s+["']?([^\s"']+)["']?/i);
    if (procMatch) return `Kill <code>${esc(procMatch[1])}</code>`;
    return 'Kill by pattern';
  }
  if (cmd.match(/^pgrep\s+/i)) {
    const procMatch = cmd.match(/^pgrep\s+["']?([^\s"']+)["']?/i);
    if (procMatch) return `Find PIDs for <code>${esc(procMatch[1])}</code>`;
    return 'Find PIDs';
  }

  // TOP / HTOP
  if (cmd.match(/^(?:top|htop)(?:\s|$)/i)) {
    return 'Process monitor';
  }

  // JOBS / BG / FG
  if (cmd.match(/^jobs(?:\s|$)/i)) {
    return 'List jobs';
  }
  if (cmd.match(/^bg(?:\s|$)/i)) {
    return 'Background job';
  }
  if (cmd.match(/^fg(?:\s|$)/i)) {
    return 'Foreground job';
  }

  // NOHUP
  if (cmd.match(/^nohup\s+/i)) {
    return 'Run detached';
  }

  // TIMEOUT
  if (cmd.match(/^timeout\s+/i)) {
    const timeMatch = cmd.match(/^timeout\s+(\d+[smhd]?)/i);
    if (timeMatch) return `Timeout after <strong>${timeMatch[1]}</strong>`;
    return 'Run with timeout';
  }

  // WATCH
  if (cmd.match(/^watch\s+/i)) {
    const intervalMatch = cmd.match(/-n\s*(\d+)/i);
    if (intervalMatch) return `Watch every <strong>${intervalMatch[1]}s</strong>`;
    return 'Watch command';
  }

  // TIME
  if (cmd.match(/^time\s+/i)) {
    return 'Measure time';
  }

  // SLEEP
  if (cmd.match(/^sleep\s+/i)) {
    const timeMatch = cmd.match(/^sleep\s+(\d+[smhd]?)/i);
    if (timeMatch) return `Sleep <strong>${timeMatch[1]}</strong>`;
    return 'Sleep';
  }

  // DATE
  if (cmd.match(/^date(?:\s|$)/i)) {
    return 'Current date/time';
  }

  // CAL
  if (cmd.match(/^cal(?:\s|$)/i)) {
    return 'Calendar';
  }

  // BC - calculator
  if (cmd.match(/^bc(?:\s|$)/i)) {
    return 'Calculator';
  }

  // EXPR - expression evaluator  
  if (cmd.match(/^expr\s+/i)) {
    return 'Evaluate expression';
  }

  // BASE64
  if (cmd.match(/^base64\s+/i)) {
    if (cmd.match(/-d\b/i)) return 'Base64 decode';
    return 'Base64 encode';
  }

  // MD5SUM / SHA256SUM etc
  if (cmd.match(/^md5sum?\s+/i)) {
    return 'MD5 checksum';
  }
  if (cmd.match(/^sha\d*sum\s+/i)) {
    const shaMatch = cmd.match(/^sha(\d*)sum/i);
    return `SHA${shaMatch[1] || ''} checksum`;
  }

  // GZIP / GUNZIP / ZCAT
  if (cmd.match(/^gzip\s+/i)) {
    if (cmd.match(/-d\b/i)) return 'Decompress (gzip)';
    return 'Compress (gzip)';
  }
  if (cmd.match(/^gunzip\s+/i)) {
    return 'Decompress (gzip)';
  }
  if (cmd.match(/^zcat\s+/i)) {
    return 'Read compressed';
  }

  // BZIP2 / BUNZIP2
  if (cmd.match(/^bzip2\s+/i)) {
    if (cmd.match(/-d\b/i)) return 'Decompress (bzip2)';
    return 'Compress (bzip2)';
  }
  if (cmd.match(/^bunzip2\s+/i)) {
    return 'Decompress (bzip2)';
  }

  // XZ / UNXZ
  if (cmd.match(/^xz\s+/i)) {
    if (cmd.match(/-d\b/i)) return 'Decompress (xz)';
    return 'Compress (xz)';
  }
  if (cmd.match(/^unxz\s+/i)) {
    return 'Decompress (xz)';
  }

  // TAR
  if (cmd.match(/^tar\s+/i)) {
    const flags = cmd.match(/^tar\s+[-]?([a-zA-Z]+)/i);
    if (flags) {
      const f = flags[1];
      if (f.includes('x')) return 'Extract archive';
      if (f.includes('c')) return 'Create archive';
      if (f.includes('t')) return 'List archive';
    }
    return 'Archive operation';
  }

  // ZIP / UNZIP
  if (cmd.match(/^zip\s+/i)) {
    return 'Create zip';
  }
  if (cmd.match(/^unzip\s+/i)) {
    const fileMatch = cmd.match(/^unzip\s+["']?([^\s"']+)["']?/i);
    if (fileMatch) {
      const filename = getFilename(fileMatch[1]);
      return `Extract <strong>${filename}</strong>`;
    }
    return 'Extract zip';
  }

  // PING
  if (cmd.match(/^ping\s+/i)) {
    const countMatch = cmd.match(/-c\s*(\d+)/i);
    // Extract host - it's the last non-flag argument
    // Remove all flags first, then get the remaining argument
    let remaining = cmd.replace(/^ping\s+/i, '');
    remaining = remaining.replace(/-[a-zA-Z]\s*\d*/g, '').trim(); // Remove -c 4, -W 5, etc
    remaining = remaining.replace(/-[a-zA-Z]+/g, '').trim(); // Remove standalone flags
    const host = remaining.split(/\s+/)[0];
    
    if (host) {
      let desc = `Ping <code>${esc(host)}</code>`;
      if (countMatch) desc += ` <span style="opacity: 0.7">(${countMatch[1]}x)</span>`;
      return desc;
    }
    return 'Ping host';
  }

  // TRACEROUTE
  if (cmd.match(/^traceroute\s+/i)) {
    const hostMatch = cmd.match(/^traceroute\s+["']?([^\s"']+)["']?/i);
    if (hostMatch) return `Traceroute <code>${esc(hostMatch[1])}</code>`;
    return 'Traceroute';
  }

  // DIG / NSLOOKUP / HOST
  if (cmd.match(/^dig\s+/i)) {
    const hostMatch = cmd.match(/^dig\s+(?:@\S+\s+)?["']?([^\s"']+)["']?/i);
    if (hostMatch) return `DNS lookup <code>${esc(hostMatch[1])}</code>`;
    return 'DNS lookup';
  }
  if (cmd.match(/^nslookup\s+/i)) {
    const hostMatch = cmd.match(/^nslookup\s+["']?([^\s"']+)["']?/i);
    if (hostMatch) return `DNS lookup <code>${esc(hostMatch[1])}</code>`;
    return 'DNS lookup';
  }
  if (cmd.match(/^host\s+/i)) {
    const hostMatch = cmd.match(/^host\s+["']?([^\s"']+)["']?/i);
    if (hostMatch) return `DNS lookup <code>${esc(hostMatch[1])}</code>`;
    return 'DNS lookup';
  }

  // NETSTAT / SS
  if (cmd.match(/^netstat(?:\s|$)/i)) {
    const flags = [];
    if (cmd.match(/-t\b/i)) flags.push('TCP');
    if (cmd.match(/-u\b/i)) flags.push('UDP');
    if (cmd.match(/-l\b/i)) flags.push('listening');
    if (cmd.match(/-p\b/i)) flags.push('programs');
    if (flags.length > 0) return `Network stats <span style="opacity: 0.7">(${flags.join(', ')})</span>`;
    return 'Network stats';
  }
  if (cmd.match(/^ss(?:\s|$)/i)) {
    const flags = [];
    if (cmd.match(/-t\b/i)) flags.push('TCP');
    if (cmd.match(/-u\b/i)) flags.push('UDP');
    if (cmd.match(/-l\b/i)) flags.push('listening');
    if (flags.length > 0) return `Socket stats <span style="opacity: 0.7">(${flags.join(', ')})</span>`;
    return 'Socket stats';
  }

  // IFCONFIG / IP
  if (cmd.match(/^ifconfig(?:\s|$)/i)) {
    return 'Network interfaces';
  }
  if (cmd.match(/^ip\s+/i)) {
    const subCmd = cmd.match(/^ip\s+(addr|link|route|neigh)/i);
    if (subCmd) {
      const subCmds = { addr: 'IP addresses', link: 'Interfaces', route: 'Routes', neigh: 'Neighbors' };
      return subCmds[subCmd[1].toLowerCase()] || 'IP command';
    }
    return 'IP command';
  }

  // SSH / SCP / SFTP
  if (cmd.match(/^ssh\s+/i)) {
    const hostMatch = cmd.match(/^ssh\s+(?:-[a-zA-Z]+\s+)*(?:\S+@)?([^\s]+)/i);
    if (hostMatch) return `SSH to <code>${esc(hostMatch[1])}</code>`;
    return 'SSH connect';
  }
  if (cmd.match(/^scp\s+/i)) {
    return 'Secure copy';
  }
  if (cmd.match(/^sftp\s+/i)) {
    return 'SFTP transfer';
  }

  // RSYNC
  if (cmd.match(/^rsync\s+/i)) {
    const flags = [];
    // Handle both separate (-a -v) and combined (-avz) flags
    if (cmd.match(/-[a-zA-Z]*a[a-zA-Z]*/i)) flags.push('archive');
    if (cmd.match(/-[a-zA-Z]*v[a-zA-Z]*/i)) flags.push('verbose');
    if (cmd.match(/-[a-zA-Z]*z[a-zA-Z]*/i)) flags.push('compress');
    if (cmd.match(/-[a-zA-Z]*r[a-zA-Z]*/i) && !cmd.match(/-a/i)) flags.push('recursive'); // -r if not already -a
    if (cmd.match(/-[a-zA-Z]*n[a-zA-Z]*/i)) flags.push('dry-run');
    if (cmd.match(/--delete\b/i)) flags.push('delete');
    if (cmd.match(/--progress\b/i)) flags.push('progress');
    if (flags.length > 0) return `Rsync <span style="opacity: 0.7">(${flags.join(', ')})</span>`;
    return 'Rsync';
  }

  // SYSTEMCTL
  if (cmd.match(/^systemctl\s+/i)) {
    const actionMatch = cmd.match(/^systemctl\s+(start|stop|restart|status|enable|disable|reload)\s+(\S+)/i);
    if (actionMatch) {
      const action = actionMatch[1].charAt(0).toUpperCase() + actionMatch[1].slice(1);
      return `${action} <code>${esc(actionMatch[2])}</code>`;
    }
    return 'Systemctl';
  }

  // SERVICE
  if (cmd.match(/^service\s+/i)) {
    const actionMatch = cmd.match(/^service\s+(\S+)\s+(start|stop|restart|status)/i);
    if (actionMatch) {
      const action = actionMatch[2].charAt(0).toUpperCase() + actionMatch[2].slice(1);
      return `${action} <code>${esc(actionMatch[1])}</code>`;
    }
    return 'Service command';
  }

  // JOURNALCTL
  if (cmd.match(/^journalctl\s+/i)) {
    if (cmd.match(/-f\b/i)) return 'Follow logs';
    const unitMatch = cmd.match(/-u\s+(\S+)/i);
    if (unitMatch) return `Logs for <code>${esc(unitMatch[1])}</code>`;
    return 'View logs';
  }

  // DMESG
  if (cmd.match(/^dmesg(?:\s|$)/i)) {
    return 'Kernel messages';
  }

  // LSOF
  if (cmd.match(/^lsof(?:\s|$)/i)) {
    const portMatch = cmd.match(/-i\s*:?(\d+)/i);
    if (portMatch) return `Open files on port <strong>${portMatch[1]}</strong>`;
    return 'List open files';
  }

  // FUSER
  if (cmd.match(/^fuser\s+/i)) {
    return 'Find process using file';
  }

  // STRACE / LTRACE
  if (cmd.match(/^strace\s+/i)) {
    return 'Trace system calls';
  }
  if (cmd.match(/^ltrace\s+/i)) {
    return 'Trace library calls';
  }

  // LSCPU / LSBLK / LSUSB / LSPCI
  if (cmd.match(/^lscpu(?:\s|$)/i)) {
    return 'CPU info';
  }
  if (cmd.match(/^lsblk(?:\s|$)/i)) {
    return 'Block devices';
  }
  if (cmd.match(/^lsusb(?:\s|$)/i)) {
    return 'USB devices';
  }
  if (cmd.match(/^lspci(?:\s|$)/i)) {
    return 'PCI devices';
  }

  // MOUNT / UMOUNT
  if (cmd.match(/^mount(?:\s|$)/i)) {
    return 'Mount filesystem';
  }
  if (cmd.match(/^umount\s+/i)) {
    return 'Unmount filesystem';
  }

  // FDISK / PARTED
  if (cmd.match(/^fdisk\s+/i)) {
    return 'Partition editor';
  }
  if (cmd.match(/^parted\s+/i)) {
    return 'Partition tool';
  }

  // MKFS
  if (cmd.match(/^mkfs\./i)) {
    return 'Create filesystem';
  }

  // USERADD / USERDEL / USERMOD
  if (cmd.match(/^useradd\s+/i)) {
    const userMatch = cmd.match(/^useradd\s+(?:-\S+\s+)*(\S+)$/i);
    if (userMatch) return `Add user <code>${esc(userMatch[1])}</code>`;
    return 'Add user';
  }
  if (cmd.match(/^userdel\s+/i)) {
    return 'Delete user';
  }
  if (cmd.match(/^usermod\s+/i)) {
    return 'Modify user';
  }

  // GROUPADD / GROUPDEL
  if (cmd.match(/^groupadd\s+/i)) {
    return 'Add group';
  }
  if (cmd.match(/^groupdel\s+/i)) {
    return 'Delete group';
  }

  // PASSWD
  if (cmd.match(/^passwd(?:\s|$)/i)) {
    return 'Change password';
  }

  // SU / SUDO
  if (cmd.match(/^su(?:\s|$)/i)) {
    return 'Switch user';
  }
  if (cmd.match(/^sudo\s+/i)) {
    // Get the actual command after sudo
    const afterSudo = cmd.replace(/^sudo\s+(-\S+\s+)*/i, '').trim();
    if (afterSudo) {
      const innerResult = transformSingleCommand(afterSudo);
      if (innerResult !== afterSudo) {
        return `Sudo: ${innerResult}`;
      }
    }
    return 'Run as root';
  }

  // ALIAS / UNALIAS
  if (cmd.match(/^alias(?:\s|$)/i)) {
    return 'Define alias';
  }
  if (cmd.match(/^unalias\s+/i)) {
    return 'Remove alias';
  }

  // HISTORY
  if (cmd.match(/^history(?:\s|$)/i)) {
    return 'Command history';
  }

  // CLEAR
  if (cmd.match(/^clear(?:\s|$)/i)) {
    return 'Clear screen';
  }

  // RESET
  if (cmd.match(/^reset(?:\s|$)/i)) {
    return 'Reset terminal';
  }

  // EXIT
  if (cmd.match(/^exit(?:\s|$)/i)) {
    return 'Exit shell';
  }

  // TRUE / FALSE
  if (cmd.match(/^true(?:\s|$)/i)) {
    return 'Return success';
  }
  if (cmd.match(/^false(?:\s|$)/i)) {
    return 'Return failure';
  }

  // TEST / [ ]
  if (cmd.match(/^test\s+/i) || cmd.match(/^\[\s+/i)) {
    return 'Test condition';
  }

  // READ
  if (cmd.match(/^read\s+/i)) {
    const varMatch = cmd.match(/^read\s+(?:-\S+\s+)*(\S+)/i);
    if (varMatch) return `Read into <code>${varMatch[1]}</code>`;
    return 'Read input';
  }

  // PRINTF
  if (cmd.match(/^printf\s+/i)) {
    return 'Print formatted';
  }

  // JQ - JSON processor
  if (cmd.match(/^jq\s+/i)) {
    const filterMatch = cmd.match(/^jq\s+["']([^"']+)["']/i);
    if (filterMatch) {
      const shortFilter = filterMatch[1].length > 30 ? filterMatch[1].substring(0, 27) + '...' : filterMatch[1];
      return `JSON query <code>${esc(shortFilter)}</code>`;
    }
    return 'Process JSON';
  }

  // YQ - YAML processor
  if (cmd.match(/^yq\s+/i)) {
    return 'Process YAML';
  }

  // XMLLINT
  if (cmd.match(/^xmllint\s+/i)) {
    return 'Process XML';
  }

  // CONVERT (ImageMagick)
  if (cmd.match(/^convert\s+/i)) {
    return 'Convert image';
  }

  // FFMPEG / FFPROBE
  if (cmd.match(/^ffmpeg\s+/i)) {
    return 'Process video/audio';
  }
  if (cmd.match(/^ffprobe\s+/i)) {
    return 'Probe media';
  }

  // OPEN / XDG-OPEN
  if (cmd.match(/^(?:open|xdg-open)\s+/i)) {
    const fileMatch = cmd.match(/^(?:open|xdg-open)\s+["']?([^\s"']+)["']?/i);
    if (fileMatch) {
      const filename = getFilename(fileMatch[1]);
      return `Open <strong>${filename}</strong>`;
    }
    return 'Open file';
  }

  // PBCOPY / PBPASTE (macOS) / XCLIP / XSEL (Linux)
  if (cmd.match(/^(?:pbcopy|xclip|xsel)(?:\s|$)/i)) {
    return 'Copy to clipboard';
  }
  if (cmd.match(/^pbpaste(?:\s|$)/i)) {
    return 'Paste from clipboard';
  }

  // BREW (Homebrew)
  if (cmd.match(/^brew\s+/i)) {
    const brewMatch = cmd.match(/^brew\s+(install|uninstall|update|upgrade|search|list|info)\s*(\S*)/i);
    if (brewMatch) {
      const action = brewMatch[1].charAt(0).toUpperCase() + brewMatch[1].slice(1);
      if (brewMatch[2]) return `${action} <code>${esc(brewMatch[2])}</code>`;
      return action;
    }
    return 'Homebrew';
  }

  // APT / APT-GET / DPKG
  if (cmd.match(/^apt(?:-get)?\s+/i)) {
    const aptMatch = cmd.match(/^apt(?:-get)?\s+(install|remove|update|upgrade|search|show)\s*(\S*)/i);
    if (aptMatch) {
      const action = aptMatch[1].charAt(0).toUpperCase() + aptMatch[1].slice(1);
      if (aptMatch[2]) return `${action} <code>${esc(aptMatch[2])}</code>`;
      return action;
    }
    return 'APT package manager';
  }
  if (cmd.match(/^dpkg\s+/i)) {
    return 'DPKG package';
  }

  // YUM / DNF
  if (cmd.match(/^(?:yum|dnf)\s+/i)) {
    const yumMatch = cmd.match(/^(?:yum|dnf)\s+(install|remove|update|search|info)\s*(\S*)/i);
    if (yumMatch) {
      const action = yumMatch[1].charAt(0).toUpperCase() + yumMatch[1].slice(1);
      if (yumMatch[2]) return `${action} <code>${esc(yumMatch[2])}</code>`;
      return action;
    }
    return 'Package manager';
  }

  // PACMAN
  if (cmd.match(/^pacman\s+/i)) {
    if (cmd.match(/-S\b/i)) return 'Install package';
    if (cmd.match(/-R\b/i)) return 'Remove package';
    if (cmd.match(/-Q\b/i)) return 'Query packages';
    if (cmd.match(/-Syu\b/i)) return 'Update system';
    return 'Pacman';
  }

  // SNAP
  if (cmd.match(/^snap\s+/i)) {
    const snapMatch = cmd.match(/^snap\s+(install|remove|list|find)\s*(\S*)/i);
    if (snapMatch) {
      const action = snapMatch[1].charAt(0).toUpperCase() + snapMatch[1].slice(1);
      if (snapMatch[2]) return `${action} <code>${esc(snapMatch[2])}</code>`;
      return action;
    }
    return 'Snap package';
  }

  // FLATPAK
  if (cmd.match(/^flatpak\s+/i)) {
    const flatpakMatch = cmd.match(/^flatpak\s+(install|uninstall|run|list)\s*(\S*)/i);
    if (flatpakMatch) {
      const action = flatpakMatch[1].charAt(0).toUpperCase() + flatpakMatch[1].slice(1);
      if (flatpakMatch[2]) return `${action} <code>${esc(flatpakMatch[2])}</code>`;
      return action;
    }
    return 'Flatpak';
  }

  // CRON related
  if (cmd.match(/^crontab\s+/i)) {
    if (cmd.match(/-e\b/i)) return 'Edit crontab';
    if (cmd.match(/-l\b/i)) return 'List crontab';
    return 'Crontab';
  }

  // AT
  if (cmd.match(/^at\s+/i)) {
    return 'Schedule task';
  }
  if (cmd.match(/^Get-ChildItem/i) || cmd.match(/^gci\s*/i)) {
    const path = getPath();
    const filter = getParam('Filter');
    const recurse = cmd.match(/-Recurse/i) ? true : false;

    const parts = [];
    if (path) {
      const dirname = getFilename(path);
      parts.push(`<strong>${dirname}</strong>`);
    }
    if (filter) {
      parts.push(`filter <code>${esc(filter)}</code>`);
    }
    if (recurse) {
      parts.push(`<span style="opacity: 0.7">(recursive)</span>`);
    }

    if (parts.length === 0) return 'List directory';
    return `List directory ${parts.join(' ')}`;
  }

  if (cmd.match(/^Get-Content/i) || cmd.match(/^gc\s+/i)) {
    const path = getPath();
    const tail = getParam('Tail');
    const head = getParam('Head');
    const readCount = getParam('ReadCount');

    // Check for Select-Object -Last in pipe
    const selectLastMatch = cmd.match(/\|\s*Select-Object\s+-Last\s+(\d+)/i);
    const selectLastCount = selectLastMatch ? selectLastMatch[1] : null;

    if (!path) return 'Read file';

    const filename = getFilename(path);
    const parts = [`<strong>${filename}</strong>`];

    if (selectLastCount) {
      parts.push(`last ${selectLastCount} lines`);
    } else if (tail) {
      parts.push(`last ${tail} lines`);
    } else if (head) {
      parts.push(`first ${head} lines`);
    } else if (readCount) {
      parts.push(`${readCount} lines`);
    }

    return `Read ${parts.join(', ')}`;
  }

  if (cmd.match(/^Set-Content/i) || cmd.match(/^sc\s+/i)) {
    const path = getPath();
    const encoding = getParam('Encoding');

    if (!path) return 'Write file';

    const filename = getFilename(path);
    const parts = [`<strong>${filename}</strong>`];

    if (encoding) {
      parts.push(`<span style="opacity: 0.7">(${encoding})</span>`);
    }

    return `Write ${parts.join(' ')}`;
  }

  if (cmd.match(/^Copy-Item/i) || cmd.match(/^cpi\s+/i)) {
    const path = getPath();
    const dest = getQuotedParam('Destination') || getParam('Destination');
    const recurse = cmd.match(/-Recurse/i) ? true : false;

    if (!path) return 'Copy files';

    const filename = getFilename(path);
    const parts = [`<strong>${filename}</strong>`];

    if (dest) {
      const destName = getFilename(dest);
      parts.push(`to <strong>${destName}</strong>`);
    }

    if (recurse) {
      parts.push(`<span style="opacity: 0.7">(recursive)</span>`);
    }

    return `Copy ${parts.join(' ')}`;
  }

  if (cmd.match(/^Move-Item/i) || cmd.match(/^mi\s+/i)) {
    const path = getPath();
    const dest = getQuotedParam('Destination') || getParam('Destination');

    if (!path) return 'Move files';

    const filename = getFilename(path);
    const parts = [`<strong>${filename}</strong>`];

    if (dest) {
      const destName = getFilename(dest);
      parts.push(`to <strong>${destName}</strong>`);
    }

    return `Move ${parts.join(' ')}`;
  }

  if (cmd.match(/^Remove-Item/i) || cmd.match(/^ri\s+/i)) {
    const path = getPath();
    const force = cmd.match(/-Force/i) ? true : false;
    const recurse = cmd.match(/-Recurse/i) ? true : false;

    if (!path) return 'Remove files';

    const filename = getFilename(path);
    const parts = [];

    if (force) parts.push(`<span style="opacity: 0.7">(force)</span>`);
    if (recurse) parts.push(`<span style="opacity: 0.7">(recursive)</span>`);

    const flags = parts.length > 0 ? ` ${parts.join(' ')}` : '';
    return `Remove <strong>${filename}</strong>${flags}`;
  }

  if (cmd.match(/^New-Item/i) || cmd.match(/^ni\s+/i)) {
    const path = getPath();
    const itemType = getParam('ItemType');

    if (!path) return 'Create item';

    const filename = getFilename(path);
    const parts = [];

    if (itemType) {
      parts.push(`<span style="opacity: 0.7">(${itemType})</span>`);
    }

    return `Create <strong>${filename}</strong> ${parts.join(' ')}`.trim();
  }

  if (cmd.match(/^Test-Path/i)) {
    const path = getPath();
    const pathType = getParam('PathType');

    if (!path) return 'Test path';

    const filename = getFilename(path);
    const parts = [];

    if (pathType) {
      parts.push(`<span style="opacity: 0.7">(${pathType})</span>`);
    }

    return `Test path <strong>${filename}</strong> ${parts.join(' ')}`.trim();
  }

  if (cmd.match(/^Write-Output/i) || cmd.match(/^echo\s+/i)) {
    // Extract the content being written
    const contentMatch = cmd.match(/^(?:Write-Output|echo)\s+["']?([^"']+)["']?/i);
    if (contentMatch) {
      const content = contentMatch[1];
      const shortContent = content.length > 40 ? content.substring(0, 37) + '...' : content;
      return `Write <code>${esc(shortContent)}</code>`;
    }
    return 'Write output';
  }

  // Handlers untuk command yang biasanya di-pipe (Select-Object, Where-Object, Sort-Object, etc)
  if (cmd.match(/^Get-Process/i) || cmd.match(/^ps\s*/i)) {
    const name = getQuotedParam('Name') || getParam('Name');
    const id = getParam('Id');

    const parts = [];
    if (name) parts.push(`<code>${esc(name)}</code>`);
    if (id) parts.push(`ID ${id}`);

    if (parts.length === 0) return 'List processes';
    return `List processes ${parts.join(', ')}`;
  }

  if (cmd.match(/^Get-Service/i)) {
    const name = getQuotedParam('Name') || getParam('Name');
    const status = getParam('Status');

    const parts = [];
    if (name) parts.push(`<code>${esc(name)}</code>`);
    if (status) parts.push(`<span style="opacity: 0.7">(${status})</span>`);

    if (parts.length === 0) return 'List services';
    return `List services ${parts.join(' ')}`;
  }

  if (cmd.match(/^Select-Object/i)) {
    const lastMatch = getParam('Last');
    const firstMatch = getParam('First');
    const skipMatch = getParam('Skip');
    const props = getQuotedParam('Property') || getParam('Property');

    const parts = [];
    if (lastMatch) parts.push(`last ${lastMatch}`);
    if (firstMatch) parts.push(`first ${firstMatch}`);
    if (skipMatch) parts.push(`skip ${skipMatch}`);
    if (props) parts.push(`<code>${esc(props)}</code>`);

    if (parts.length === 0) return 'Select items';
    return `Select ${parts.join(', ')}`;
  }

  if (cmd.match(/^Where-Object/i)) {
    // Try to extract FilterScript parameter with ScriptBlock handling
    let filterScript = null;

    // Try quoted version first
    const quotedMatch = cmd.match(/-FilterScript\s+{([^}]+)}/i);
    if (quotedMatch) {
      filterScript = quotedMatch[1].trim();
    } else {
      // Fall back to parameter extraction
      filterScript = getQuotedParam('FilterScript') || getParam('FilterScript');
    }

    if (filterScript) {
      // Clean up the filter expression
      let shortFilter = filterScript
        .replace(/^\s*{\s*/, '').replace(/\s*}\s*$/, '')
        .replace(/\$_\s*-/g, '')  // Remove $_ - prefix
        .trim();

      if (shortFilter.length > 50) {
        shortFilter = shortFilter.substring(0, 47) + '...';
      }

      return shortFilter ? `Filter where ${shortFilter}` : 'Filter items';
    }
    return 'Filter items';
  }

  if (cmd.match(/^Sort-Object/i)) {
    const property = getQuotedParam('Property') || getParam('Property');
    const descending = cmd.match(/-Descending/i) ? true : false;

    const parts = [];
    if (property) parts.push(`by <code>${esc(property)}</code>`);
    if (descending) parts.push(`<span style="opacity: 0.7">(descending)</span>`);

    if (parts.length === 0) return 'Sort items';
    return `Sort ${parts.join(' ')}`;
  }

  if (cmd.match(/^Measure-Object/i)) {
    const property = getQuotedParam('Property') || getParam('Property');
    const sum = cmd.match(/-Sum/i) ? true : false;
    const average = cmd.match(/-Average/i) ? true : false;

    const parts = [];
    if (property) parts.push(`<code>${esc(property)}</code>`);
    const stats = [];
    if (sum) stats.push('sum');
    if (average) stats.push('average');
    if (stats.length > 0) parts.push(`<span style="opacity: 0.7">(${stats.join(', ')})</span>`);

    if (parts.length === 0) return 'Measure stats';
    return `Measure ${parts.join(' ')}`;
  }

  if (cmd.match(/^Group-Object/i)) {
    const property = getQuotedParam('Property') || getParam('Property');
    if (property) {
      return `Group by <code>${esc(property)}</code>`;
    }
    return 'Group items';
  }

  if (cmd.match(/^Tee-Object/i)) {
    const path = getPath();
    if (path) {
      const filename = getFilename(path);
      return `Tee output to <strong>${filename}</strong>`;
    }
    return 'Tee output';
  }

  // If no match but contains XML/HTML-like tags, escape to prevent rendering issues
  if (cmd.match(/<[a-zA-Z]|<!\[CDATA\[/)) {
    return esc(cmd);
  }

  // If no match, return original command as-is (for compatibility)
  return cmd;
}

function enhancedMarkdownParse(src, options = {}, sharedCodeBlocks = null) {
  // COMMAND PARSING TEST - FORCE RELOAD
  // OPTIMIZATION: Check cache first (only for complete parses, not streaming)
  if (!sharedCodeBlocks && !options.isThinkingText) {
    const cacheKey = `${src.substring(0, 200)}-${src.length}`;
    const cached = markdownCache.get(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const isThinkingText = options.isThinkingText || false;
  let sanitizedSrc = src.trimStart();
  const boldListFixRegex = /^(\s*)\*\*(\d+\.|[*-])\s+(.*?)\*\*/gm;
  sanitizedSrc = sanitizedSrc.replace(boldListFixRegex, "$1$2 **$3**");
  const normalizedSrc = sanitizedSrc.replace(/\u00A0/g, " ").replace(/\r\n/g, "\n");

  // Realtime render: tidak perlu trim, langsung render jika pattern valid
  const truncatedSrc = normalizedSrc;

  // Extract command input/output tags BEFORE any markdown processing
  // Group consecutive input-output pairs into single command units
  const commandGroups = [];
  let commandIndex = 0;

  // First pass: collect all command blocks
  const allCommandBlocks = [];
  truncatedSrc.replace(/<!--command-(input|output)-->([\s\S]*?)<!--\/command-\1-->/gi, (match, type, content) => {
    allCommandBlocks.push({ type, content: content.trim() });
    return match; // Don't replace yet
  });

  // Second pass: group consecutive input-output pairs
  for (let i = 0; i < allCommandBlocks.length; i++) {
    const block = allCommandBlocks[i];
    if (block.type === 'input') {
      const group = { input: block.content };
      // Check if next block is output
      if (i + 1 < allCommandBlocks.length && allCommandBlocks[i + 1].type === 'output') {
        group.output = allCommandBlocks[i + 1].content;
        i++; // Skip the output block since it's grouped
      }
      commandGroups.push(group);
    } else if (block.type === 'output') {
      // Standalone output (shouldn't happen in our system, but handle it)
      commandGroups.push({ output: block.content });
    }
  }

  // Third pass: replace with grouped placeholders
  let srcAfterCommandExtraction = truncatedSrc;

  // helper: escape regex meta-chars for literal matching
  const escapeForRegex = (s = '') => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  commandGroups.forEach((group, index) => {
    const placeholder = `__COMMAND_GROUP_${index}__`;

    // If both input and output exist: match input block then output block,
    // allow any amount of whitespace/newlines between/around
    if (group.input && group.output) {
      const inEsc = escapeForRegex(group.input.trim());
      const outEsc = escapeForRegex(group.output.trim());
      const bothPattern = new RegExp(
        `<!--command-input-->[\\s\\S]*?${inEsc}[\\s\\S]*?<!--\\/command-input-->[\\s\\S]*?<!--command-output-->[\\s\\S]*?${outEsc}[\\s\\S]*?<!--\\/command-output-->`,
        'g'
      );
      srcAfterCommandExtraction = srcAfterCommandExtraction.replace(bothPattern, placeholder);
      return;
    }

    // Only input block
    if (group.input) {
      const inEsc = escapeForRegex(group.input.trim());
      const inPattern = new RegExp(
        `<!--command-input-->[\\s\\S]*?${inEsc}[\\s\\S]*?<!--\\/command-input-->`,
        'g'
      );
      srcAfterCommandExtraction = srcAfterCommandExtraction.replace(inPattern, placeholder);
      return;
    }

    // Only output block
    if (group.output) {
      const outEsc = escapeForRegex(group.output.trim());
      const outPattern = new RegExp(
        `<!--command-output-->[\\s\\S]*?${outEsc}[\\s\\S]*?<!--\\/command-output-->`,
        'g'
      );
      srcAfterCommandExtraction = srcAfterCommandExtraction.replace(outPattern, placeholder);
      return;
    }
  });


  // Extract hidden content tags
  const hiddenBlocks = [];
  srcAfterCommandExtraction = srcAfterCommandExtraction.replace(/<!--hidden-->([\s\S]*?)<!--\/hidden-->/gi, (match, content) => {
    const placeholder = `__HIDDEN_BLOCK_${hiddenBlocks.length}__`;
    hiddenBlocks.push(content.trim());
    return placeholder;
  });

  // Fix mismatched and malformed container tags before processing
  // AI sometimes generates wrong closing tags or missing closing brackets
  const fixMismatchedTags = (text) => {
    let fixed = text;

    // STEP 1: Fix malformed closing tags (missing >)
    // Fix: </try-title -> </try-title>
    fixed = fixed.replace(/<\/try-title(?!>)/gi, '</try-title>');
    fixed = fixed.replace(/<\/clarify-title(?!>)/gi, '</clarify-title>');

    // STEP 2: Fix mismatched opening/closing tags
    // Fix: <try-title>content</try> -> <try-title>content</try-title>
    // Match try-title opening tag followed by content and wrong </try> closing
    fixed = fixed.replace(/<try-title>((?:(?!<\/try-title>|<\/try>|<try-title>).)*?)<\/try>/gi, '<try-title>$1</try-title>');

    // Fix: <try>content</try-title> -> <try-title>content</try-title>
    // Match wrong <try> used as title tag
    fixed = fixed.replace(/<try>([^<]*?)<\/try-title>/gi, '<try-title>$1</try-title>');

    // Fix: <clarify-title>content</clarify> -> <clarify-title>content</clarify-title>
    fixed = fixed.replace(/<clarify-title>((?:(?!<\/clarify-title>|<\/clarify>|<clarify-title>).)*?)<\/clarify>/gi, '<clarify-title>$1</clarify-title>');

    // Fix: <clarify>content</clarify-title> -> <clarify-title>content</clarify-title>
    fixed = fixed.replace(/<clarify>([^<]*?)<\/clarify-title>/gi, '<clarify-title>$1</clarify-title>');

    return fixed;
  };

  const fixedSrc = fixMismatchedTags(srcAfterCommandExtraction);

  // Extract ALL reference-style definitions FIRST (before line-by-line parsing)
  // This allows references to work across paragraphs
  const globalReferences = {};
  const srcWithoutRefs = fixedSrc.replace(/^\[([^\]]+)\]:\s*(\S+)(?:\s+"([^"]*)")?\s*$/gm, (match, refId, url, title) => {
    globalReferences[refId.toLowerCase()] = { url, title: title || '' };
    return ''; // Remove reference definition from text
  });

  const codeBlocks = sharedCodeBlocks || [];
  const isTopLevel = !sharedCodeBlocks;
  const latexBlocks = [];
  const containerBlocks = []; // Store brain/prompt blocks
  const latexRegex = /(\$\$[\s\S]*?\$\$|\\\(.*?\\\))/g;
  let protectedSrc = srcWithoutRefs.replace(latexRegex, match => {
    const placeholder = `__LATEX_${latexBlocks.length}__`;
    latexBlocks.push(match);
    return placeholder;
  });

  // Extract container tags ONLY outside codeblocks
  let processedSrcAfterContainers = protectedSrc;

  // First, temporarily protect codeblocks to avoid extracting containers from inside them
  const tempCodeBlocks = [];
  const tempProtectedSrc = protectedSrc.replace(/```(\w*)\n?([\s\S]*?)(?:```|$)/g, (match) => {
    const placeholder = `__TEMP_CODEBLOCK_${tempCodeBlocks.length}__`;
    tempCodeBlocks.push(match);
    return placeholder;
  });

  // Realtime render: extract dan render container jika ada title tag setelah opening tag
  // Pattern: <try><try-title> atau <try>\n<try-title> (dengan optional whitespace)
  processedSrcAfterContainers = tempProtectedSrc.replace(
    /<(clarify|try)>(\s*)<\1-title>([\s\S]*?)(?:<\/\1>|$)/gi,
    (match, tagName, whitespace, content) => {
      // Trigger: ada title tag setelah opening tag (dengan optional newline/whitespace)
      const placeholder = `XCONTAINERX${containerBlocks.length}XCONTAINERX`;

      // Build container dengan atau tanpa closing tag
      const hasClosingTag = match.includes(`</${tagName}>`);
      const containerContent = `<${tagName}>${whitespace}<${tagName}-title>${content}${hasClosingTag ? `</${tagName}>` : ''}`;

      containerBlocks.push(containerContent);
      return placeholder;
    }
  );

  // Restore the codeblocks
  processedSrcAfterContainers = tempCodeBlocks.reduce((acc, block, i) =>
    acc.replace(`__TEMP_CODEBLOCK_${i}__`, block), processedSrcAfterContainers);

  // Only process codeblocks at top level, not in recursive calls
  let processedSrc = srcAfterCommandExtraction;
  if (isTopLevel) {
    processedSrc = processedSrcAfterContainers.replace(/```(\w*)\n?([\s\S]*?)(?:```|$)/g, (match, lang, code) => {
      const placeholder = `__CODEBLOCK_${codeBlocks.length}__`;
      let codeContent = code; // Don't trim yet - we need original whitespace for dedent
      const language = lang || "text";

      // Clean blockquote markers from code content if present
      // This handles codeblocks inside blockquotes where the content includes blockquote prefixes
      const lines = codeContent.split('\n');
      const cleanedLines = lines.map(line => {
        // Remove all leading > markers and whitespace that are from blockquote nesting
        let cleaned = line;
        // Keep removing > markers at the start (after optional whitespace)
        while (true) {
          const beforeClean = cleaned;
          // Remove leading whitespace + > + optional space
          cleaned = cleaned.replace(/^\s*>\s?/, '');
          // If nothing changed, we're done
          if (cleaned === beforeClean) break;
        }
        return cleaned;
      });

      // Normalize indentation: remove common leading whitespace from all non-empty lines
      // This handles codeblocks in nested lists where markdown indentation should not appear in code
      const nonEmptyLines = cleanedLines.filter(line => line.trim().length > 0);
      if (nonEmptyLines.length > 0) {
        const indents = nonEmptyLines.map(line => {
          const match = line.match(/^(\s*)/);
          return match ? match[1].length : 0;
        });
        const minIndent = Math.min(...indents);
        if (minIndent > 0) {
          for (let i = 0; i < cleanedLines.length; i++) {
            if (cleanedLines[i].trim().length > 0) {
              cleanedLines[i] = cleanedLines[i].substring(minIndent);
            }
          }
        }
      }

      codeContent = cleanedLines.join('\n').trim();

      // Different structure for thinking-text (no action buttons)
      const isMermaid = language.toLowerCase() === 'mermaid';
      // Check if HTML and starts with <html> or <!DOCTYPE html> tag (case-insensitive, allowing whitespace)
      const isPreviewableHTML = language.toLowerCase() === 'html' && /^\s*(<!DOCTYPE\s+html|<html)/i.test(codeContent);
      const newStructure = isThinkingText ?
        `<div class="code-block-container thinking-code"><div class="code-block-header"><span class="language-name">${language}</span></div><pre><code class="language-${language}">${esc(codeContent)}</code></pre></div>` :
        `
      <div class="code-block-container${isMermaid ? ' mermaid-block' : ''}${isPreviewableHTML ? ' html-block' : ''}" data-language="${language}">
        <div class="code-block-header">
          <span class="language-name">${language}</span>
          <div class="code-block-actions">
            <button class="save-code-btn" title="Save to artifacts" data-code="${esc(codeContent).replace(/"/g, "&quot;")}" data-language="${language}">
              <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17,21 17,13 7,13 7,21"/><polyline points="7,3 7,8 15,8"/></svg>
            </button>
            ${isMermaid ? `<button class="preview-mermaid-btn" title="Preview diagram">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>` : ''}
            ${isPreviewableHTML ? `<button class="preview-html-btn" title="Preview HTML">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>` : ''}
            <button class="copy-code-btn" title="Copy code">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
            </button>
          </div>
        </div>
        <pre><code class="language-${language}">${esc(codeContent)}</code></pre>
      </div>`;
      codeBlocks.push(newStructure);
      return placeholder;
    });
  }
  const lines = processedSrc.split("\n");
  let html = "";
  const listStack = [];
  let paragraphBuffer = [];
  let imageBuffer = []; // Buffer for consecutive image-only lines
  let currentListItemEndPos = -1; // Track end position of current list item

  const flushImageGroup = () => {
    if (imageBuffer.length > 0) {
      const totalImages = imageBuffer.length;
      const isCollapsible = totalImages > 1; // Only collapse if more than 1 image

      // Calculate columns for the visible row (1-3 images)
      const visibleCount = Math.min(totalImages, 3);

      if (isCollapsible) {
        html += `<div class="md-image-group" data-total="${totalImages}" data-collapsed="true">`;
        html += `<div class="md-image-group-header" onclick="toggleImageGroup(this)">`;
        html += `<span class="image-count">${totalImages} image${totalImages > 1 ? 's' : ''}</span>`;
        html += `<svg class="expand-icon" xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>`;
        html += `</div>`;
        html += `<div class="md-image-group-content">${imageBuffer.join("")}</div>`;
        html += `</div>`;
      } else {
        // Single image, no collapse
        html += `<div class="md-image-group" data-total="1">${imageBuffer.join("")}</div>`;
      }

      imageBuffer = [];
    }
  };

  const flushParagraph = () => {
    if (paragraphBuffer.length > 0) {
      html += `<p>${paragraphBuffer.join("<br>")}</p>`;
      paragraphBuffer = [];
    }
  };
  const appendToCurrentListItem = content => {
    if (listStack.length > 0 && currentListItemEndPos !== -1) {
      // Insert content before the closing </li> tag of current list item
      html = `${html.substring(0, currentListItemEndPos)}${content}${html.substring(currentListItemEndPos)}`;
      // Update the end position since we inserted content
      currentListItemEndPos += content.length;
      return true;
    }
    return false;
  };
  const closeOpenBlocks = () => {
    flushImageGroup();
    flushParagraph();
    while (listStack.length > 0) html += `</${listStack.pop().type}>`;
  };
  let lastLineWasCodeblock = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();
    if (!trimmedLine) {
      const nextLine = lines[i + 1] ? lines[i + 1] : "";
      const nextLineTrimmed = nextLine.trim();
      const nextLineIndent = nextLine.length - nextLine.trimStart().length;
      const nextNextLine = lines[i + 2] ? lines[i + 2].trim() : "";
      const upcomingTableSeparator = nextNextLine && nextNextLine.includes("|") && nextNextLine.includes("-") && !/[^|:-\s]/.test(nextNextLine);
      const isUpcomingTableHeader = nextLineTrimmed && nextLineTrimmed.includes("|") && upcomingTableSeparator;

      // Check if we should continue the list
      let shouldContinueList = false;
      if (listStack.length > 0) {
        const currentListIndent = listStack[listStack.length - 1].indent;

        // Continue list if next line is a list item at same or greater indent
        if (nextLineTrimmed.match(/^(\s*)[*-]\s+/) || nextLineTrimmed.match(/^(\s*)\d+\.\s+/)) {
          const nextListMatch = nextLineTrimmed.match(/^(\s*)[*-]\s+/) || nextLineTrimmed.match(/^(\s*)\d+\.\s+/);
          const nextListIndent = nextListMatch[1].length;
          if (nextListIndent >= currentListIndent) {
            shouldContinueList = true;
          }
        }
        // Continue list if next line is codeblock, blockquote, or table at proper indent
        else if (nextLineTrimmed.startsWith("__CODEBLOCK_") || nextLineTrimmed.startsWith(">") || isUpcomingTableHeader) {
          // For nested content, allow same indent as list item (more flexible than markdown-it strict rules)
          if (nextLineIndent >= currentListIndent) {
            shouldContinueList = true;
          }
        }
        // If next line is empty or end of content, check a few lines ahead for nested content
        else if (!nextLineTrimmed) {
          // Look ahead up to 3 lines for nested content
          for (let lookAhead = 1; lookAhead <= 3 && i + lookAhead < lines.length; lookAhead++) {
            const lookAheadLine = lines[i + lookAhead];
            const lookAheadTrimmed = lookAheadLine.trim();
            const lookAheadIndent = lookAheadLine.length - lookAheadLine.trimStart().length;

            if (lookAheadTrimmed.startsWith("__CODEBLOCK_") || lookAheadTrimmed.startsWith(">") ||
              (lookAheadTrimmed.includes("|") && lines[i + lookAhead + 1] && lines[i + lookAhead + 1].trim().includes("|") && lines[i + lookAhead + 1].trim().includes("-"))) {
              if (lookAheadIndent >= currentListIndent) {
                shouldContinueList = true;
                break;
              }
            }
          }
        }
      }

      if (shouldContinueList) {
        lastLineWasCodeblock = false;
        continue;
      }

      // If we have pending images, don't close blocks yet (allow blank lines between images)
      if (imageBuffer.length > 0) {
        lastLineWasCodeblock = false;
        continue;
      }

      closeOpenBlocks();
      lastLineWasCodeblock = false;
      continue;
    }
    const hMatch = line.match(/^(#+)\s+(.*)/);
    const hrMatch = /^---+$/.test(trimmedLine);
    const olMatch = line.match(/^(\s*)(\d+)\.\s+(.*)/);
    const ulMatch = line.match(/^(\s*)[*-]\s+(.*)/);
    const listMatch = olMatch || ulMatch;
    const codeMatch = trimmedLine.startsWith("__CODEBLOCK_");
    const nextLine = lines[i + 1] ? lines[i + 1].trim() : "";
    const isTableHeader = trimmedLine.includes("|") && !listMatch && !hMatch;
    const bqMatch = line.match(/^\s*>\s?(.*)/);
    const isNextLineSeparator = isTableHeader && nextLine.includes("|") && nextLine.includes("-") && !/[^|:-\s]/.test(nextLine);
    if (isTableHeader && isNextLineSeparator) {
      let tableHtml = '<div class="table-container"><table>';
      const headers = trimmedLine.split("|").map(h => h.trim()).filter(Boolean);
      tableHtml += "<thead><tr>";
      for (const header of headers) tableHtml += `<th>${parseInlineMarkdown(header, globalReferences)}</th>`;
      tableHtml += "</tr></thead><tbody>";
      let tableRowIndex = i + 2;
      while (tableRowIndex < lines.length && lines[tableRowIndex].trim().includes("|")) {
        const cells = lines[tableRowIndex].trim().split("|").map(c => c.trim()).filter(Boolean);
        tableHtml += "<tr>";
        for (let j = 0; j < headers.length; j++) {
          const cellContent = cells[j] || "";
          tableHtml += `<td>${parseInlineMarkdown(cellContent, globalReferences)}</td>`;
        }
        tableHtml += "</tr>";
        tableRowIndex++;
      }
      tableHtml += "</tbody></table></div>";
      // For tables in lists, always append to current list item to maintain proper nesting
      if (listStack.length > 0) {
        appendToCurrentListItem(tableHtml);
      } else {
        closeOpenBlocks();
        html += tableHtml;
      }
      lastLineWasCodeblock = false;
      i = tableRowIndex - 1;
      continue;
    }
    if (listMatch) {
      flushParagraph();
      let indent = listMatch[1].length;
      const type = olMatch ? "ol" : "ul";
      const number = olMatch ? parseInt(olMatch[2], 10) : null;
      let content = olMatch ? listMatch[3] : ulMatch[2];

      // Handle task lists (- [ ] or - [x])
      let isTaskList = false;
      let isChecked = false;
      const taskMatch = content.match(/^\[([ x])\]\s+(.*)/);
      if (type === "ul" && taskMatch) {
        isTaskList = true;
        isChecked = taskMatch[1] === 'x';
        content = taskMatch[2]; // Get the text after the checkbox
      }
      const lastList = listStack.length > 0 ? listStack[listStack.length - 1] : null;
      if (type === "ul" && lastList?.type === "ul" && lastList.implicit && indent < lastList.indent) indent = lastList.indent;
      else if (type === "ul" && lastList?.type === "ol" && indent <= lastList.indent) indent = lastList.indent + 2;
      while (listStack.length > 0 && (listStack[listStack.length - 1].indent > indent || (listStack[listStack.length - 1].indent === indent && listStack[listStack.length - 1].type !== type))) {
        html += `</${listStack.pop().type}>`;
      }
      const currentLastList = listStack.length > 0 ? listStack[listStack.length - 1] : null;
      if (!currentLastList || indent > currentLastList.indent || type !== currentLastList.type) {
        if (currentLastList && indent > currentLastList.indent) {
          const lastLiPos = html.lastIndexOf("</li>");
          if (lastLiPos !== -1) html = html.substring(0, lastLiPos);
        }
        const isImplicit = type === "ul" && currentLastList?.type === "ol";
        const startAttr = type === "ol" && number > 1 ? ` start="${number}"` : "";
        html += `<${type}${startAttr}>`;
        listStack.push({ type, indent, implicit: isImplicit });
      }
      // Wrap text content with <p> for consistent styling
      const parsedContent = parseInlineMarkdown(content, globalReferences);
      if (isTaskList) {
        const checkboxHtml = `<input class="tasklist" type="checkbox"${isChecked ? ' checked' : ''} disabled> `;
        html += `<li><p>${checkboxHtml}${parsedContent}</p></li>`;
      } else {
        html += `<li><p>${parsedContent}</p></li>`;
      }
      // Track the end position of this list item for appending nested content
      // Position before "</p></li>" to insert nested content after the paragraph
      currentListItemEndPos = html.length - 9; // Position before "</p></li>"
      lastLineWasCodeblock = false;
    } else if (bqMatch) {
      const bqBlockLines = [line];
      // Collect all consecutive blockquote lines (including empty lines within blockquotes)
      while (i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        const nextTrimmed = nextLine.trim();

        // Stop if we hit a truly empty line (no > marker)
        if (nextTrimmed === "" && !nextLine.match(/^\s*>/)) break;

        // Stop if we hit a non-blockquote block-level element at root level
        const isNewBlock = /^(#|---|```|[*-] |\d+\.\s)/.test(nextTrimmed) && (nextLine.length - nextTrimmed.length === 0);
        if (isNewBlock) break;

        // Special case: Allow table rows without > prefix if previous line was a table row
        const prevLine = bqBlockLines[bqBlockLines.length - 1];
        const prevTrimmed = prevLine.replace(/^\s*>\s?/, '').trim();
        const isTableRow = nextTrimmed.startsWith('|') && nextTrimmed.includes('|');
        const prevWasTableRow = prevTrimmed.includes('|');

        if (isTableRow && prevWasTableRow) {
          // Continue collecting table row even without > prefix
          i++;
          bqBlockLines.push(nextLine);
          continue;
        }

        // Stop if line doesn't start with > and isn't empty
        if (!nextLine.match(/^\s*>/) && nextTrimmed !== "") break;

        i++;
        bqBlockLines.push(nextLine);
      }

      // Count the minimum number of > markers to determine the depth
      let minDepth = Infinity;
      const depthMap = bqBlockLines.map(l => {
        const match = l.match(/^(\s*>)+/);
        if (match) {
          const depth = (match[0].match(/>/g) || []).length;
          minDepth = Math.min(minDepth, depth);
          return { line: l, depth };
        }
        return { line: l, depth: 0 };
      });

      // Remove only the minimum depth level (one blockquote level)
      const nestedContent = depthMap.map(({ line, depth }) => {
        if (depth > 0) {
          // Remove exactly one > marker (the first one)
          return line.replace(/^\s*>\s?/, "");
        }
        return line;
      }).join("\n");

      // Replace any codeblock placeholders in nested content with special tokens
      const processedNestedContent = nestedContent.replace(/__CODEBLOCK_(\d+)__/g, (match, index) => {
        return `CODEBLOCKEMBED${index}PLACEHOLDER`;
      });

      // Process the content with full markdown parsing, passing shared codeBlocks array
      const parsedContent = enhancedMarkdownParse(processedNestedContent, options, codeBlocks);

      // Replace embedded codeblock tokens with actual HTML
      const blockquoteContent = parsedContent.replace(/CODEBLOCKEMBED(\d+)PLACEHOLDER/g, (match, index) => {
        return codeBlocks[parseInt(index)];
      });

      const blockquoteHtml = `<blockquote>${blockquoteContent}</blockquote>`;
      // For blockquotes in lists, always append to current list item to maintain proper nesting
      if (listStack.length > 0) {
        appendToCurrentListItem(blockquoteHtml);
      } else {
        closeOpenBlocks();
        html += blockquoteHtml;
      }
      lastLineWasCodeblock = false;
    } else if (codeMatch) {
      // For codeblocks in lists, always append to current list item to maintain proper nesting
      if (listStack.length > 0) {
        appendToCurrentListItem(trimmedLine);
      } else {
        closeOpenBlocks();
        html += trimmedLine;
      }
      lastLineWasCodeblock = true;
    } else if (hMatch || hrMatch) {
      closeOpenBlocks();
      if (hMatch) html += `<h${hMatch[1].length}>${parseInlineMarkdown(hMatch[2], globalReferences)}</h${hMatch[1].length}>`;
      else if (hrMatch) html += "<hr>";
      lastLineWasCodeblock = false;
    } else {
      if (listStack.length > 0) {
        // For regular text in lists, append to current list item using the tracked position
        if (currentListItemEndPos !== -1) {
          // Don't add <br> if previous line was a codeblock
          const prefix = lastLineWasCodeblock ? '' : '<br>';
          const textHtml = `${prefix}${parseInlineMarkdown(line.trim(), globalReferences)}`;
          html = `${html.substring(0, currentListItemEndPos)}${textHtml}${html.substring(currentListItemEndPos)}`;
          currentListItemEndPos += textHtml.length;
        }
      } else {
        // Check if this line is a container tag (brain or prompt) - don't wrap in <p>
        if (trimmedLine.includes("XCONTAINERX")) {
          flushImageGroup();
          flushParagraph();
          html += parseInlineMarkdown(line, globalReferences) + '\n';
        } else {
          // Check if this line is ONLY an image (no text before/after)
          // Include nested image+link: [![alt](img)](url) should also go to imageBuffer
          const isNestedImageLink = /^\[!\[.*?\]\([^)]+\)\]\([^)]+\)$/.test(trimmedLine);
          const isImageOnly = /^!\[.*?\]\([^\s]+\)(\s*=\s*\d+x\d+)?$/.test(trimmedLine);

          if (isImageOnly || isNestedImageLink) {
            // This is an image-only line or nested image+link
            flushParagraph(); // Flush any pending text first
            imageBuffer.push(parseInlineMarkdown(line.trim(), globalReferences));
          } else {
            // This is text or mixed content
            flushImageGroup(); // Flush any pending images first
            paragraphBuffer.push(parseInlineMarkdown(line, globalReferences));
          }
        }
      }
      lastLineWasCodeblock = false;
    }
  }
  closeOpenBlocks();

  // Restore LaTeX blocks FIRST (before processing other placeholders that might be wrapped in HTML)
  let finalHtml = html;
  finalHtml = latexBlocks.reduce((acc, block, i) => {
    // Use split/join to avoid $ being treated as special character in replace()
    return acc.split(`__LATEX_${i}__`).join(block);
  }, finalHtml);

  finalHtml = codeBlocks.reduce((acc, block, i) => acc.replace(`__CODEBLOCK_${i}__`, block), finalHtml);
  finalHtml = containerBlocks.reduce((acc, block, i) => {
    // Realtime render: process container dengan atau tanpa closing tag
    const processed = block
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&') // Unescape first
      // Handle <clarify> dengan atau tanpa closing tag
      .replace(/<clarify>([\s\S]*?)(?:<\/clarify>|$)/gis, (match, content) => {
        const processedContent = content
          .replace(/<clarify-title>(.*?)(?:<\/clarify-title>|$)/gi, '<div class="brain-title">$1</div>')
          .replace(/<li>(.*?)(?:<\/li>|$)/gi, '<span class="bli"><svg width="11" height="14" viewBox="0 0 11 14" fill="currentColor" xmlns="http://www.w3.org/2000/svg" class="text-emerald-600 dark:text-emerald-400/80 w-3.5 h-auto" aria-label="Tip"><path d="M3.12794 12.4232C3.12794 12.5954 3.1776 12.7634 3.27244 12.907L3.74114 13.6095C3.88471 13.8248 4.21067 14 4.46964 14H6.15606C6.41415 14 6.74017 13.825 6.88373 13.6095L7.3508 12.9073C7.43114 12.7859 7.49705 12.569 7.49705 12.4232L7.50055 11.3513H3.12521L3.12794 12.4232ZM5.31288 0C2.52414 0.00875889 0.5 2.26889 0.5 4.78826C0.5 6.00188 0.949566 7.10829 1.69119 7.95492C2.14321 8.47011 2.84901 9.54727 3.11919 10.4557C3.12005 10.4625 3.12175 10.4698 3.12261 10.4771H7.50342C7.50427 10.4698 7.50598 10.463 7.50684 10.4557C7.77688 9.54727 8.48281 8.47011 8.93484 7.95492C9.67728 7.13181 10.1258 6.02703 10.1258 4.78826C10.1258 2.15486 7.9709 0.000106649 5.31288 0ZM7.94902 7.11267C7.52078 7.60079 6.99082 8.37878 6.6077 9.18794H4.02051C3.63739 8.37878 3.10743 7.60079 2.67947 7.11294C2.11997 6.47551 1.8126 5.63599 1.8126 4.78826C1.8126 3.09829 3.12794 1.31944 5.28827 1.3126C7.2435 1.3126 8.81315 2.88226 8.81315 4.78826C8.81315 5.63599 8.50688 6.47551 7.94902 7.11267ZM4.87534 2.18767C3.66939 2.18767 2.68767 3.16939 2.68767 4.37534C2.68767 4.61719 2.88336 4.81288 3.12521 4.81288C3.36705 4.81288 3.56274 4.61599 3.56274 4.37534C3.56274 3.6515 4.1515 3.06274 4.87534 3.06274C5.11719 3.06274 5.31288 2.86727 5.31288 2.62548C5.31288 2.38369 5.11599 2.18767 4.87534 2.18767Z"></path></svg> $1</span>');
        return `<div class="brain">${processedContent}</div>`;
      })
      // Handle <try> dengan atau tanpa closing tag
      .replace(/<try>([\s\S]*?)(?:<\/try>|$)/gis, (match, content) => {
        const processedContent = content
          .replace(/<try-title>(.*?)(?:<\/try-title>|$)/gi, `<div class="prompt-title">${SPARKLE} $1</div>`)
          .replace(/<li>(.*?)(?:<\/li>|$)/gi, '<span class="pli" data-text="$1"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-corner-down-right-icon lucide-corner-down-right"><path d="m15 10 5 5-5 5"/><path d="M4 4v7a4 4 0 0 0 4 4h12"/></svg> $1</span>');
        return `<div class="prompt">${processedContent}</div>`;
      });
    return acc.replace(`XCONTAINERX${i}XCONTAINERX`, processed);
  }, finalHtml);

  // Function to parse command input into user-friendly descriptions
  function parseCommandInput(input) {
    if (!input) return input;

    const trimmed = input.trim();

    // Helper function to extract filename from path
    function getFilename(path) {
      if (!path) return '';
      // Remove quotes if present
      const cleanPath = path.replace(/^["']|["']$/g, '');
      // Get filename from path
      return cleanPath.split(/[/\\]/).pop() || cleanPath;
    }

    // Helper function to format range
    function formatRange(rangeStr) {
      if (!rangeStr) return '';
      const rangeMatch = rangeStr.match(/^(\d+)(?:-(\d+))?$/);
      if (rangeMatch) {
        const from = rangeMatch[1];
        const to = rangeMatch[2];
        return to && to !== from ? `${from}-${to}` : from;
      }
      return rangeStr;
    }

    // Parse <set file="..." range={...}> commands
    const setMatch = trimmed.match(/^<set\s+file="([^"]+)"(?:\s+range=\{([^}]+)\})?\s*\/?>/i);
    if (setMatch) {
      const filename = getFilename(setMatch[1]);
      const range = setMatch[2];
      if (range) {
        const formattedRange = formatRange(range);
        return `Editing ${filename} in range ${formattedRange}`;
      }
      return `Editing ${filename}`;
    }

    // Parse Search-infiles commands (fallback for simple pattern)
    const searchMatch = trimmed.match(/^Search-infiles\s+(.+)$/i);
    if (searchMatch) {
      const pattern = searchMatch[1].trim();
      return `Searching for pattern '${pattern}'`;
    }

    // Parse Show-FileWithLineNumbers commands
    const showFileMatch = trimmed.match(/^Show-FileWithLineNumbers\s+-Path\s+["']([^"']+)["'](?:\s+-StartLine\s+(\d+))?(?:\s+-EndLine\s+(\d+))?/i);
    if (showFileMatch) {
      const filename = getFilename(showFileMatch[1]);
      const startLine = showFileMatch[2];
      const endLine = showFileMatch[3];
      if (startLine && endLine) {
        return `Read ${filename}, lines ${startLine}-${endLine}`;
      } else if (startLine) {
        return `Read ${filename} from line ${startLine}`;
      }
      return `Read ${filename}`;
    }

    // Parse Search-InFiles commands
    const searchInFilesMatch = trimmed.match(/^Search-InFiles\s+-Pattern\s+["']([^"']+)["'](?:\s+-Path\s+["']([^"']+)["'])?(?:\s+-Filter\s+["']([^"']+)["'])?(?:\s+-Depth\s+(\d+))?(?:\s+-Context\s+(\d+))?/i);
    if (searchInFilesMatch) {
      const pattern = searchInFilesMatch[1];
      const path = searchInFilesMatch[2];
      const filter = searchInFilesMatch[3];
      const depth = searchInFilesMatch[4];
      const context = searchInFilesMatch[5];

      let description = `Find "${pattern}"`;
      if (filter) {
        description += ` in ${filter} files`;
      } else {
        description += ` in files`;
      }
      if (path && path !== '.') {
        const dirname = getFilename(path);
        description += ` under ${dirname}`;
      }
      return description;
    }

    // Parse Get-FileLineRange commands
    const getFileRangeMatch = trimmed.match(/^Get-FileLineRange\s+-Path\s+["']([^"']+)["']\s+-Ranges\s+@\(([^)]+)\)/i);
    if (getFileRangeMatch) {
      const filename = getFilename(getFileRangeMatch[1]);
      const rangesStr = getFileRangeMatch[2];
      // Extract ranges like '1-50', '100-150'
      const ranges = rangesStr.match(/'(\d+-\d+)'/g);
      if (ranges && ranges.length > 0) {
        const rangeList = ranges.map(r => r.replace(/'/g, '')).join(', ');
        return `Read ${filename} ranges ${rangeList}`;
      }
      return `Read ${filename} ranges`;
    }

    // Parse Set-FileLine commands
    const setFileLineMatch = trimmed.match(/^Set-FileLine\s+-Path\s+["']?([^"'\s]+)["']?\s+-LineNumber\s+(\d+)/i);
    if (setFileLineMatch) {
      const filename = getFilename(setFileLineMatch[1]);
      const lineNum = setFileLineMatch[2];
      return `Edit ${filename} line ${lineNum}`;
    }

    // Parse Add-FileLine commands
    const addFileLineMatch = trimmed.match(/^Add-FileLine\s+-Path\s+["']?([^"'\s]+)["']?\s+-LineNumber\s+(\d+)/i);
    if (addFileLineMatch) {
      const filename = getFilename(addFileLineMatch[1]);
      const lineNum = addFileLineMatch[2];
      return `Add line to ${filename} at ${lineNum}`;
    }

    // Parse Remove-FileLine commands
    const removeFileLineMatch = trimmed.match(/^Remove-FileLine\s+-Path\s+["']?([^"'\s]+)["']?\s+-LineNumber\s+(\d+)/i);
    if (removeFileLineMatch) {
      const filename = getFilename(removeFileLineMatch[1]);
      const lineNum = removeFileLineMatch[2];
      return `Remove ${filename} line ${lineNum}`;
    }

    // Parse Set-MultipleLines commands
    const setMultipleMatch = trimmed.match(/^Set-MultipleLines\s+-Path\s+["']?([^"'\s]+)["']?\s+-StartLine\s+(\d+)\s+-EndLine\s+(\d+)/i);
    if (setMultipleMatch) {
      const filename = getFilename(setMultipleMatch[1]);
      const startLine = setMultipleMatch[2];
      const endLine = setMultipleMatch[3];
      return `Edit ${filename} lines ${startLine}-${endLine}`;
    }

    // Parse Search-FileWithContext commands
    const searchContextMatch = trimmed.match(/^Search-FileWithContext\s+-Path\s+["']?([^"'\s]+)["']?\s+-Pattern\s+["']?([^"'\s]+)["']?/i);
    if (searchContextMatch) {
      const filename = getFilename(searchContextMatch[1]);
      const pattern = searchContextMatch[2];
      return `Find "${pattern}" in ${filename}`;
    }

    // Parse Find-DuplicateLines commands
    const findDupMatch = trimmed.match(/^Find-DuplicateLines\s+-Path\s+["']?([^"'\s]+)["']?/i);
    if (findDupMatch) {
      const filename = getFilename(findDupMatch[1]);
      return `Find duplicate lines in ${filename}`;
    }

    // Parse List-ProjectFiles commands
    const listProjectMatch = trimmed.match(/^List-ProjectFiles\s+(?:-Path\s+["']?([^"'\s]+)["']?)?(?:\s+-Filter\s+["']?([^"'\s]+)["']?)?(?:\s+-Depth\s+(\d+))?/i);
    if (listProjectMatch) {
      const path = listProjectMatch[1];
      const filter = listProjectMatch[2];
      const depth = listProjectMatch[3];

      let description = 'List project files';
      if (filter) {
        description += ` (${filter})`;
      }
      if (path && path !== '.') {
        const dirname = getFilename(path);
        description += ` in ${dirname}`;
      }
      if (depth) {
        description += ` (depth: ${depth})`;
      }
      return description;
    }

    // Parse Find-Pattern commands
    const findPatternMatch = trimmed.match(/^Find-Pattern\s+-Pattern\s+["']?([^"'\s]+)["']?(?:\s+-Path\s+["']?([^"'\s]+)["']?)?/i);
    if (findPatternMatch) {
      const pattern = findPatternMatch[1];
      const path = findPatternMatch[2];
      let description = `Find pattern "${pattern}"`;
      if (path) {
        const dirname = getFilename(path);
        description += ` in ${dirname}`;
      }
      return description;
    }

    // Parse Get-FileStats commands
    const getStatsMatch = trimmed.match(/^Get-FileStats\s+-Path\s+["']?([^"'\s]+)["']?/i);
    if (getStatsMatch) {
      const filename = getFilename(getStatsMatch[1]);
      return `Get stats for ${filename}`;
    }

    // Parse List-Directory commands
    const listDirMatch = trimmed.match(/^List-Directory\s+(.+)$/i);
    if (listDirMatch) {
      const path = listDirMatch[1].trim();
      const dirname = path.split(/[/\\]/).pop() || path;
      return `Listing directory ${dirname}`;
    }

    // Parse Run-Command commands
    const runCmdMatch = trimmed.match(/^Run-Command\s+(.+)$/i);
    if (runCmdMatch) {
      const cmd = runCmdMatch[1].trim();
      return `Running command: ${cmd}`;
    }

    // Parse Get-Content / cat commands
    const getContentMatch = trimmed.match(/^(?:Get-Content|cat)\s+(.+)$/i);
    if (getContentMatch) {
      const filename = getFilename(getContentMatch[1].trim());
      return `Reading ${filename}`;
    }

    // Parse Set-Content / echo commands
    const setContentMatch = trimmed.match(/^(?:Set-Content|echo)\s+(.+)$/i);
    if (setContentMatch) {
      const target = setContentMatch[1].trim();
      const filename = getFilename(target);
      return `Writing to ${filename}`;
    }

    // Parse New-Item / mkdir commands
    const newItemMatch = trimmed.match(/^(?:New-Item|mkdir)\s+(.+)$/i);
    if (newItemMatch) {
      const target = newItemMatch[1].trim();
      const isDir = target.includes('/') || target.includes('\\') || !target.includes('.');
      return isDir ? `Creating directory ${getFilename(target)}` : `Creating file ${getFilename(target)}`;
    }

    // Parse Remove-Item / rm commands
    const removeItemMatch = trimmed.match(/^(?:Remove-Item|rm)\s+(.+)$/i);
    if (removeItemMatch) {
      const target = removeItemMatch[1].trim();
      const isDir = target.includes('/') || target.includes('\\') || !target.includes('.');
      return isDir ? `Removing directory ${getFilename(target)}` : `Removing file ${getFilename(target)}`;
    }

    // Parse Copy-Item / cp commands
    const copyItemMatch = trimmed.match(/^(?:Copy-Item|cp)\s+(.+?)\s+(.+)$/i);
    if (copyItemMatch) {
      const source = getFilename(copyItemMatch[1].trim());
      const dest = getFilename(copyItemMatch[2].trim());
      return `Copying ${source} to ${dest}`;
    }

    // Parse Move-Item / mv commands
    const moveItemMatch = trimmed.match(/^(?:Move-Item|mv)\s+(.+?)\s+(.+)$/i);
    if (moveItemMatch) {
      const source = getFilename(moveItemMatch[1].trim());
      const dest = getFilename(moveItemMatch[2].trim());
      return `Moving ${source} to ${dest}`;
    }

    // Parse Get-ChildItem / ls / dir commands
    const listItemsMatch = trimmed.match(/^(?:Get-ChildItem|ls|dir)(?:\s+(.+))?$/i);
    if (listItemsMatch) {
      const path = listItemsMatch[1]?.trim();
      if (path) {
        const dirname = getFilename(path);
        return `Listing contents of ${dirname}`;
      }
      return 'Listing directory contents';
    }

    // Parse Test-Path commands
    const testPathMatch = trimmed.match(/^Test-Path\s+(.+)$/i);
    if (testPathMatch) {
      const target = getFilename(testPathMatch[1].trim());
      return `Checking if ${target} exists`;
    }

    // Parse npm commands
    const npmMatch = trimmed.match(/^npm\s+(run\s+)?(\w+)(?:\s+(.+))?$/i);
    if (npmMatch) {
      const script = npmMatch[2];
      const args = npmMatch[3];
      if (script === 'install' && args?.includes('--save-dev')) {
        return 'Installing dev dependencies';
      } else if (script === 'install') {
        return 'Installing dependencies';
      } else if (script === 'run' && args) {
        return `Running npm script: ${args}`;
      } else if (script === 'test') {
        return 'Running tests';
      } else if (script === 'start') {
        return 'Starting application';
      } else if (script === 'build') {
        return 'Building application';
      }
      return `Running npm ${script}`;
    }

    // Return original if no pattern matches
    return input;
  }

  commandGroups.forEach((group, index) => {
    const placeholder = `__COMMAND_GROUP_${index}__`;
    let replacement = '';

    if (group.input) {
      // Create expandable command input with output
      const outputHtml = group.output ?
        '<div class="command-output" aria-hidden="true">' + group.output.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>' : '';

      const toggleButton = group.output ? '<button class="command-toggle"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6,9 12,15 18,9"></polyline></svg></button>' : '';

      // Transform command text to human-readable format
      const readableCommand = transformCommandText(group.input);

      replacement = '<div class="command-input"><div class="command-header"><svg class="command-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4,17 10,11 4,5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg><span class="command-text">' +
        readableCommand +
        '</span>' + toggleButton + '</div>' + outputHtml + '</div>';
    } else if (group.output) {
      // Standalone output (fallback)
      replacement = '<div class="command-output">' + group.output.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>';
    }

    finalHtml = finalHtml.replace(placeholder, replacement);
  });

  // Process hidden blocks
  hiddenBlocks.forEach((content, index) => {
    const placeholder = `__HIDDEN_BLOCK_${index}__`;
    const replacement = `<div class="hidden-content" style="max-height: 329px; border: 1px solid var(--border) !important; overflow-y: auto; background: var(--bg); border-radius: var(--radius-lg); padding-top: 9px; padding-bottom: 9px; max-width: 100%;"><pre style="margin: 0; background: transparent; border: none; padding: 0;"><code class="language-javascript">${content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre></div>`;
    finalHtml = finalHtml.replace(placeholder, replacement);
  });

  return finalHtml;
}

function processMarkdownFormatting(text, globalReferences = {}) {
  if (!text) return "";

  // Use global references (passed from parseInlineMarkdown)
  // Also parse local references in case they exist in this text block
  const references = { ...globalReferences };
  let processedText = text.replace(/^\[([^\]]+)\]:\s*(\S+)(?:\s+"([^"]*)")?\s*$/gm, (_, refId, url, title) => {
    references[refId.toLowerCase()] = { url, title: title || '' };
    return ''; // Remove reference definition from text
  });

  // Parse images BEFORE HTML escaping to preserve alt text
  const imageBlocks = [];

  // FIRST: Parse nested image+link pattern: [![alt](img)](url)
  // This must be done BEFORE parsing standalone images
  processedText = processedText.replace(/\[!\[([^\]]*)\]\(([^)]+)\)\]\(([^)]+)\)/g, (match, alt, imgSrc, linkUrl) => {
    const placeholder = `__IMAGE_${imageBlocks.length}__`;
    const cleanAlt = alt.replace(/\*\*|__|[\*_~`]/g, '') || 'Image';

    // Handle image size parameter
    let finalImgSrc = imgSrc;
    let sizeAttr = '';
    const sizeMatch = imgSrc.match(/^(.+?)\s+=\s*(\d+)x(\d+)$/);
    if (sizeMatch) {
      finalImgSrc = sizeMatch[1];
      sizeAttr = ` width="${sizeMatch[2]}" height="${sizeMatch[3]}"`;
    }

    // Create clickable image with label (flex layout: image + text)
    const labelHtml = cleanAlt ? `<span class="image-link-label">${cleanAlt}</span>` : '';
    imageBlocks.push(`<a href="${linkUrl}" target="_blank" rel="noopener noreferrer" class="link image-link image-link-with-label"><div class="inside-image-link"><img class="md-image wrapped" src="${finalImgSrc}" alt=""${sizeAttr} loading="lazy">${labelHtml}</div></a>`);
    return placeholder;
  });

  // Parse reference-style images: ![alt][ref-id]
  processedText = processedText.replace(/!\[([^\]]*)\]\[([^\]]+)\]/g, (match, alt, refId) => {
    const ref = references[refId.toLowerCase()];
    if (!ref) return match; // Keep original if reference not found

    const placeholder = `__IMAGE_${imageBlocks.length}__`;
    const cleanAlt = alt.replace(/\*\*|__|[\*_~`]/g, '') || 'Image';
    const titleAttr = ref.title ? ` title="${esc(ref.title)}"` : '';
    imageBlocks.push(`<img class="md-image" src="${ref.url}" alt=""${titleAttr} loading="lazy">`);
    return placeholder;
  });

  // Parse inline images: ![alt](src) or ![alt](src =WxH)
  processedText = processedText.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, src) => {
    const placeholder = `__IMAGE_${imageBlocks.length}__`;
    // Strip markdown formatting from alt text for accessibility
    const cleanAlt = alt.replace(/\*\*|__|[\*_~`]/g, '') || 'Image';
    // Handle image size parameter (=WIDTHxHEIGHT)
    let imgSrc = src.trim();
    let sizeAttr = '';
    const sizeMatch = imgSrc.match(/^(.+?)\s+=\s*(\d+)x(\d+)$/);
    if (sizeMatch) {
      imgSrc = sizeMatch[1].trim();
      sizeAttr = ` width="${sizeMatch[2]}" height="${sizeMatch[3]}"`;
    }
    imageBlocks.push(`<img class="md-image" src="${imgSrc}" alt=""${sizeAttr} loading="lazy">`);
    return placeholder;
  });

  // Parse footnotes BEFORE links
  const footnoteRefs = [];
  processedText = processedText.replace(/\[\^([^\]]+)\]/g, (match, ref) => {
    const placeholder = `__FOOTNOTE_REF_${footnoteRefs.length}__`;
    footnoteRefs.push(`<sup class="footnote-ref"><a href="#fn-${ref}">[${ref}]</a></sup>`);
    return placeholder;
  });

  // Parse links (including mailto) BEFORE HTML escaping to handle parentheses and special chars
  const linkBlocks = [];

  // Parse reference-style links: [text][ref-id] or [text][] (implicit reference)
  processedText = processedText.replace(/\[([^\]]+)\]\[([^\]]*)\]/g, (match, text, refId) => {
    // If refId is empty, use text as refId (implicit reference)
    const lookupId = (refId || text).toLowerCase();
    const ref = references[lookupId];
    if (!ref) return match; // Keep original if reference not found

    const placeholder = `__LINK_${linkBlocks.length}__`;

    // Check if link contains image placeholder
    const hasImage = /__IMAGE_(\d+)__/.test(text);
    const processedText = hasImage ? text : parseInlineContent(text);
    const icon = hasImage ? '' : BROWSER_ICON;
    const titleAttr = ref.title ? ` title="${esc(ref.title)}"` : '';

    if (ref.url.startsWith('mailto:')) {
      linkBlocks.push(`<a href="${ref.url}" class="link email-link ${hasImage ? 'image-link' : ''}"${titleAttr}>${processedText}${hasImage ? '' : EMAIL_ICON}</a>`);
    } else {
      linkBlocks.push(`<a href="${ref.url}" target="_blank" rel="noopener noreferrer" class="link ${hasImage ? 'image-link' : ''}"${titleAttr}>${processedText}${icon}</a>`);
    }
    return placeholder;
  });

  // Parse inline links: [text](url)
  processedText = processedText.replace(/\[([^\]]*)\]\(([^\s]+)\)/g, (match, text, url) => {
    // Check if text is ONLY an image placeholder (nested image+link already handled)
    // Pattern: __IMAGE_0__ (nothing else)
    if (/^__IMAGE_\d+__$/.test(text.trim())) {
      return text.trim(); // Return just the placeholder, remove the [...](...) wrapper
    }

    const placeholder = `__LINK_${linkBlocks.length}__`;

    // Check if link contains image placeholder (clickable image: [![alt](img)](url))
    const hasImage = /__IMAGE_(\d+)__/.test(text);

    if (url.startsWith('mailto:')) {
      // Email link - process inline content
      const processedText = hasImage ? text : parseInlineContent(text);
      const icon = hasImage ? '' : EMAIL_ICON; // No icon for image links
      linkBlocks.push(`<a href="${url}" class="link email-link ${hasImage ? 'image-link' : ''}">${processedText}${icon}</a>`);
    } else {
      // Regular link - process inline content
      const processedText = hasImage ? text : parseInlineContent(text);
      const icon = hasImage ? '' : BROWSER_ICON; // No icon for image links
      linkBlocks.push(`<a href="${url}" target="_blank" rel="noopener noreferrer" class="link ${hasImage ? 'image-link' : ''}">${processedText}${icon}</a>`);
    }
    return placeholder;
  });

  let html = processedText.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

  // Restore images FIRST (before links, for clickable images)
  // Group consecutive images together
  html = groupConsecutiveImages(html, imageBlocks);

  const footnoteGroupRegex = /((?:\[Source\s+\d+\]\((?:.*?)\)(?:\s*,\s*)?)+)/g;
  html = html.replace(footnoteGroupRegex, match => {
    const individualFootnoteRegex = /\[Source\s+(\d+)\]\((.*?)\)/g;
    const links = [];
    let result;
    while ((result = individualFootnoteRegex.exec(match)) !== null) {
      const number = result[1];
      const url = result[2];
      links.push(`<a href="${url}" target="_blank" rel="noopener noreferrer">[${number}]${BROWSER_ICON}</a>`);
    }
    return `<sup class="footnote-ref">${links.join(", ")}</sup>`;
  });

  // Restore links
  html = linkBlocks.reduce((acc, block, i) => acc.replace(`__LINK_${i}__`, block), html);

  html = html.replace(/&lt;u&gt;(.*?)&lt;\/u&gt;/g, "<u>$1</u>");
  const inlineCodeBlocks = [];
  html = html.replace(/`([^`]+?)`/g, (match, content) => {
    const placeholder = `__INLINE_CODE_${inlineCodeBlocks.length}__`;
    inlineCodeBlocks.push(`<code>${content}</code>`);
    return placeholder;
  });
  const tldList = ["com", "net", "org", "io", "gov", "edu", "co", "info", "biz", "online", "app", "id", "me", "site", "tech", "dev", "ai", "cloud", "shop", "store", "live", "blog", "club", "news", "xyz", "link", "cloud", "space", "page", "pro", "design", "agency", "group", "company", "inc", "us", "uk", "au", "ca", "de", "fr", "es", "it", "nl", "se", "no", "fi", "ru", "cn", "jp", "br", "in", "cz", "pl", "be", "ch", "at", "sg", "hk", "nz", "mx", "ar", "cl", "kr", "za", "ae", "sa"];
  const tldPattern = tldList.join("|");
  const autoLinkRegex = new RegExp('(\\b(?:https?:\\/\\/|www\\.)[^\\s<>"]+)' + "|" + "(?<!\\w)([a-zA-Z0-9.-]+\\.(?:" + tldPattern + ')(?:\\/[^\\s<>"]*)?)', "gi");
  html = html.replace(autoLinkRegex, (match, protocolUrl, domainUrl, offset) => {
    // Skip if inside href, src attributes, or near placeholders
    if (html.includes(`href="${match}"`) || html.includes(`src="${match}"`) ||
      html.includes(`href=&quot;${match}`) || html.includes(`src=&quot;${match}`) ||
      /__(?:IMAGE|LINK|INLINE_CODE)_\d+__/.test(match)) return match;

    // Skip if preceded by @ (email addresses in mailto links)
    if (offset > 0 && html[offset - 1] === '@') return match;

    // Skip if inside any HTML tag (link, button, img, code, pre, etc.)
    const beforeMatch = html.substring(0, offset);
    const lastOpenTag = Math.max(
      beforeMatch.lastIndexOf('<a '),
      beforeMatch.lastIndexOf('<button '),
      beforeMatch.lastIndexOf('<img '),
      beforeMatch.lastIndexOf('<code>'),
      beforeMatch.lastIndexOf('<code '),
      beforeMatch.lastIndexOf('<pre>')
    );
    const lastCloseTag = Math.max(
      beforeMatch.lastIndexOf('</a>'),
      beforeMatch.lastIndexOf('</button>'),
      beforeMatch.lastIndexOf('/>'),
      beforeMatch.lastIndexOf('</code>'),
      beforeMatch.lastIndexOf('</pre>')
    );
    if (lastOpenTag > lastCloseTag) return match; // Inside HTML tag

    let href = protocolUrl || domainUrl;
    if (!/^https?:\/\//i.test(href)) href = "https://" + href;
    return `<a class="link" href="${href}" target="_blank" rel="noopener noreferrer">${match}${BROWSER_ICON}</a>`;
  });
  html = inlineCodeBlocks.reduce((acc, block, i) => acc.replace(`__INLINE_CODE_${i}__`, block), html);

  // Inline formatting - but protect placeholders and HTML attributes from being formatted
  // First, protect all __PLACEHOLDER__ patterns (use # to avoid underscore issues)
  const allPlaceholders = [];
  html = html.replace(/__[A-Z_]+_\d+__/g, (match) => {
    const placeholder = `@@PROTECTED#${allPlaceholders.length}@@`;
    allPlaceholders.push(match);
    return placeholder;
  });

  // Then protect content inside HTML tags (including attributes)
  const htmlTagPattern = /<[^>]+>/g;
  const protectedTags = [];
  html = html.replace(htmlTagPattern, (match) => {
    const placeholder = `@@TAG#${protectedTags.length}@@`;
    protectedTags.push(match);
    return placeholder;
  });

  // Now apply formatting to the remaining text (safe from placeholders)
  html = html.replace(/\*\*\*(.*?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/___(.*?)___/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/__((?!PROTECTED|TAG)\w+?)__/g, "<strong>$1</strong>") // Protect new placeholders
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/(^|[\s"'([{])_([^_\s][^_]*?[^_\s])_(\s|["')\]},;.!?]|$)/g, "$1<em>$2</em>$3")
    .replace(/~~(.*?)~~/g, "<del>$1</del>");

  // Restore protected HTML tags
  protectedTags.forEach((tag, i) => {
    html = html.replace(`@@TAG#${i}@@`, tag);
  });

  // Restore all placeholders
  allPlaceholders.forEach((ph, i) => {
    html = html.replace(`@@PROTECTED#${i}@@`, ph);
  });

  // OPTIMIZATION: Cache the result (only for complete parses)
  if (!sharedCodeBlocks && !options.isThinkingText) {
    const cacheKey = `${src.substring(0, 200)}-${src.length}`;
    markdownCache.set(cacheKey, html);
  }

  return html;
}

function groupConsecutiveImages(html, imageBlocks) {
  // Simply replace all image placeholders with their actual HTML
  let processedHtml = html;
  imageBlocks.forEach((block, index) => {
    processedHtml = processedHtml.replace(new RegExp(`__IMAGE_${index}__`, 'g'), block);
  });
  return processedHtml;
}

function parseInlineMarkdown(text, globalReferences = {}) {
  if (!text) return "";
  // Unescape HTML entities first to handle custom tags that might be escaped
  text = text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  // Handle semantic container tags
  text = text.replace(/<clarify>(.*?)<\/clarify>/gis, '<div class="brain">$1</div>');
  text = text.replace(/<try>(.*?)<\/try>/gis, '<div class="prompt">$1</div>');

  text = text.replace(/<clarify-title>(.*?)<\/clarify-title>/gi, '<div class="brain-title">$1</div>');
  text = text.replace(/<try-title>(.*?)<\/try-title>/gi, `<div class="prompt-title">${SPARKLE} $1</div>`);
  if (text.includes('<br>') && (text.includes('<br>•') || text.includes('<br>-'))) {
    const parts = text.split(/(<br\s*\/?>)/i);
    let listItems = [];
    let currentItem = "";
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part.match(/<br\s*\/?>/i)) {
        if (currentItem.trim()) {
          listItems.push(currentItem.trim());
          currentItem = "";
        }
      } else {
        currentItem += part;
      }
    }
    if (currentItem.trim()) listItems.push(currentItem.trim());
    listItems = listItems.filter(item => item.trim());
    if (listItems.length > 1) {
      let listHtml = '<ul class="br-list">';
      listItems.forEach(item => {
        const cleanItem = item.replace(/^[-•]\s*/, "");
        const processedItem = processMarkdownFormatting(cleanItem, globalReferences);
        listHtml += `<li>${processedItem}</li>`;
      });
      listHtml += "</ul>";
      return listHtml;
    }
  }
  let processedText = text.replace(/<br\s*\/?>/gi, "__BR_TAG__");

  // Use global references (passed from enhancedMarkdownParse)
  // Also parse local references in case they exist in this text block
  const references = { ...globalReferences };
  processedText = processedText.replace(/^\[([^\]]+)\]:\s*(\S+)(?:\s+"([^"]*)")?\s*$/gm, (_, refId, url, title) => {
    references[refId.toLowerCase()] = { url, title: title || '' };
    return ''; // Remove reference definition from text
  });

  // Parse images BEFORE HTML escaping to preserve alt text
  const imageBlocks = [];

  // FIRST: Parse nested image+link pattern: [![alt](img)](url)
  // This must be done BEFORE parsing standalone images
  processedText = processedText.replace(/\[!\[([^\]]*)\]\(([^)]+)\)\]\(([^)]+)\)/g, (match, alt, imgSrc, linkUrl) => {
    const placeholder = `__IMAGE_${imageBlocks.length}__`;
    const cleanAlt = alt.replace(/\*\*|__|[\*_~`]/g, '') || 'Image';

    // Handle image size parameter
    let finalImgSrc = imgSrc;
    let sizeAttr = '';
    const sizeMatch = imgSrc.match(/^(.+?)\s+=\s*(\d+)x(\d+)$/);
    if (sizeMatch) {
      finalImgSrc = sizeMatch[1];
      sizeAttr = ` width="${sizeMatch[2]}" height="${sizeMatch[3]}"`;
    }

    // Create clickable image with label (flex layout: image + text)
    const labelHtml = cleanAlt ? `<span class="image-link-label">${cleanAlt}</span>` : '';
    imageBlocks.push(`<a href="${linkUrl}" target="_blank" rel="noopener noreferrer" class="link image-link image-link-with-label"><div class="inside-image-link"><img class="md-image wrapped" src="${finalImgSrc}" alt=""${sizeAttr} loading="lazy">${labelHtml}</div></a>`);
    return placeholder;
  });

  // Parse reference-style images: ![alt][ref-id]
  processedText = processedText.replace(/!\[([^\]]*)\]\[([^\]]+)\]/g, (match, alt, refId) => {
    const ref = references[refId.toLowerCase()];
    if (!ref) return match; // Keep original if reference not found

    const placeholder = `__IMAGE_${imageBlocks.length}__`;
    const cleanAlt = alt.replace(/\*\*|__|[\*_~`]/g, '') || 'Image';
    const titleAttr = ref.title ? ` title="${esc(ref.title)}"` : '';
    imageBlocks.push(`<img class="md-image" src="${ref.url}" alt=""${titleAttr} loading="lazy">`);
    return placeholder;
  });

  // Parse inline images: ![alt](src) or ![alt](src =WxH)
  processedText = processedText.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, src) => {
    const placeholder = `__IMAGE_${imageBlocks.length}__`;
    // Strip markdown formatting from alt text for accessibility
    const cleanAlt = alt.replace(/\*\*|__|[\*_~`]/g, '') || 'Image';
    // Handle image size parameter (=WIDTHxHEIGHT)
    let imgSrc = src.trim();
    let sizeAttr = '';
    const sizeMatch = imgSrc.match(/^(.+?)\s+=\s*(\d+)x(\d+)$/);
    if (sizeMatch) {
      imgSrc = sizeMatch[1].trim();
      sizeAttr = ` width="${sizeMatch[2]}" height="${sizeMatch[3]}"`;
    }
    imageBlocks.push(`<img class="md-image" src="${imgSrc}" alt=""${sizeAttr} loading="lazy">`);
    return placeholder;
  });

  // Parse footnotes BEFORE links
  const footnoteRefs = [];
  processedText = processedText.replace(/\[\^([^\]]+)\]/g, (match, ref) => {
    const placeholder = `__FOOTNOTE_REF_${footnoteRefs.length}__`;
    footnoteRefs.push(`<sup class="footnote-ref"><a href="#fn-${ref}">[${ref}]</a></sup>`);
    return placeholder;
  });

  // Parse links (including mailto) BEFORE HTML escaping to handle parentheses and special chars
  const linkBlocks = [];

  // Parse reference-style links: [text][ref-id] or [text][] (implicit reference)
  processedText = processedText.replace(/\[([^\]]+)\]\[([^\]]*)\]/g, (match, text, refId) => {
    // If refId is empty, use text as refId (implicit reference)
    const lookupId = (refId || text).toLowerCase();
    const ref = references[lookupId];
    if (!ref) return match; // Keep original if reference not found

    const placeholder = `__LINK_${linkBlocks.length}__`;

    // Check if link contains image placeholder
    const hasImage = /__IMAGE_(\d+)__/.test(text);
    const processedText = hasImage ? text : parseInlineContent(text);
    const icon = hasImage ? '' : BROWSER_ICON;
    const titleAttr = ref.title ? ` title="${esc(ref.title)}"` : '';

    if (ref.url.startsWith('mailto:')) {
      linkBlocks.push(`<a href="${ref.url}" class="link email-link ${hasImage ? 'image-link' : ''}"${titleAttr}>${processedText}${hasImage ? '' : EMAIL_ICON}</a>`);
    } else {
      linkBlocks.push(`<a href="${ref.url}" target="_blank" rel="noopener noreferrer" class="link ${hasImage ? 'image-link' : ''}"${titleAttr}>${processedText}${icon}</a>`);
    }
    return placeholder;
  });

  // Parse inline links: [text](url)
  processedText = processedText.replace(/\[([^\]]*)\]\(([^\s]+)\)/g, (match, text, url) => {
    // Check if text is ONLY an image placeholder (nested image+link already handled)
    // Pattern: __IMAGE_0__ (nothing else)
    if (/^__IMAGE_\d+__$/.test(text.trim())) {
      return text.trim(); // Return just the placeholder, remove the [...](...) wrapper
    }

    const placeholder = `__LINK_${linkBlocks.length}__`;

    // Check if link contains image placeholder (clickable image: [![alt](img)](url))
    const hasImage = /__IMAGE_(\d+)__/.test(text);

    if (url.startsWith('mailto:')) {
      // Email link - process inline content
      const processedText = hasImage ? text : parseInlineContent(text);
      const icon = hasImage ? '' : EMAIL_ICON; // No icon for image links
      linkBlocks.push(`<a href="${url}" class="link email-link ${hasImage ? 'image-link' : ''}">${processedText}${icon}</a>`);
    } else {
      // Regular link - process inline content
      const processedText = hasImage ? text : parseInlineContent(text);
      const icon = hasImage ? '' : BROWSER_ICON; // No icon for image links
      linkBlocks.push(`<a href="${url}" target="_blank" rel="noopener noreferrer" class="link ${hasImage ? 'image-link' : ''}">${processedText}${icon}</a>`);
    }
    return placeholder;
  });

  let html = processedText.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

  // Restore common HTML entities (prevent double escaping)
  const entities = {
    '&amp;copy;': '&copy;',
    '&amp;reg;': '&reg;',
    '&amp;trade;': '&trade;',
    '&amp;hellip;': '&hellip;',
    '&amp;mdash;': '&mdash;',
    '&amp;ndash;': '&ndash;',
    '&amp;lsquo;': '&lsquo;',
    '&amp;rsquo;': '&rsquo;',
    '&amp;ldquo;': '&ldquo;',
    '&amp;rdquo;': '&rdquo;',
    '&amp;nbsp;': '&nbsp;',
    '&amp;lt;': '&lt;',
    '&amp;gt;': '&gt;',
    '&amp;quot;': '&quot;',
    '&amp;apos;': '&apos;'
  };

  for (const [escaped, entity] of Object.entries(entities)) {
    html = html.replaceAll(escaped, entity);
  }

  html = html.replace(/__BR_TAG__/g, "<br>");

  const footnoteGroupRegex = /((?:\[Source\s+\d+\]\((?:.*?)\)(?:\s*,\s*)?)+)/g;
  html = html.replace(footnoteGroupRegex, match => {
    const individualFootnoteRegex = /\[Source\s+(\d+)\]\((.*?)\)/g;
    const links = [];
    let result;
    while ((result = individualFootnoteRegex.exec(match)) !== null) {
      const number = result[1];
      const url = result[2];
      links.push(`<a href="${url}" target="_blank" rel="noopener noreferrer">[${number}]${BROWSER_ICON}</a>`);
    }
    return `<sup class="footnote-ref">${links.join(", ")}</sup>`;
  });

  // Restore footnotes FIRST
  html = footnoteRefs.reduce((acc, block, i) => acc.replace(`__FOOTNOTE_REF_${i}__`, block), html);

  // Restore links (they may contain image placeholders)
  html = linkBlocks.reduce((acc, block, i) => acc.replace(`__LINK_${i}__`, block), html);

  // Restore images AFTER links (so images inside links work correctly)
  // Group consecutive images together
  html = groupConsecutiveImages(html, imageBlocks);

  html = html.replace(/&lt;u&gt;(.*?)&lt;\/u&gt;/g, "<u>$1</u>");
  const inlineCodeBlocks = [];
  html = html.replace(/`([^`]+?)`/g, (match, content) => {
    const placeholder = `__INLINE_CODE_${inlineCodeBlocks.length}__`;
    inlineCodeBlocks.push(`<code>${content}</code>`);
    return placeholder;
  });
  const tldList = ["com", "net", "org", "io", "gov", "edu", "co", "info", "biz", "online", "app", "id", "me", "site", "tech", "dev", "ai", "cloud", "shop", "store", "live", "blog", "club", "news", "xyz", "link", "cloud", "space", "page", "pro", "design", "agency", "group", "company", "inc", "us", "uk", "au", "ca", "de", "fr", "es", "it", "nl", "se", "no", "fi", "ru", "cn", "jp", "br", "in", "cz", "pl", "be", "ch", "at", "sg", "hk", "nz", "mx", "ar", "cl", "kr", "za", "ae", "sa"];
  const tldPattern = tldList.join("|");
  const autoLinkRegex = new RegExp('(\\b(?:https?:\\/\\/|www\\.)[^\\s<>"]+)' + "|" + "(?<!\\w)([a-zA-Z0-9.-]+\\.(?:" + tldPattern + ')(?:\\/[^\\s<>"]*)?)', "gi");
  html = html.replace(autoLinkRegex, (match, protocolUrl, domainUrl, offset) => {
    // Skip if inside href, src attributes, or near placeholders
    if (html.includes(`href="${match}"`) || html.includes(`src="${match}"`) ||
      html.includes(`href=&quot;${match}`) || html.includes(`src=&quot;${match}`) ||
      /__(?:IMAGE|LINK|INLINE_CODE)_\d+__/.test(match)) return match;

    // Skip if preceded by @ (email addresses in mailto links)
    if (offset > 0 && html[offset - 1] === '@') return match;

    // Skip if inside any HTML tag (link, button, img, code, pre, etc.)
    const beforeMatch = html.substring(0, offset);
    const lastOpenTag = Math.max(
      beforeMatch.lastIndexOf('<a '),
      beforeMatch.lastIndexOf('<button '),
      beforeMatch.lastIndexOf('<img '),
      beforeMatch.lastIndexOf('<code>'),
      beforeMatch.lastIndexOf('<code '),
      beforeMatch.lastIndexOf('<pre>')
    );
    const lastCloseTag = Math.max(
      beforeMatch.lastIndexOf('</a>'),
      beforeMatch.lastIndexOf('</button>'),
      beforeMatch.lastIndexOf('/>'),
      beforeMatch.lastIndexOf('</code>'),
      beforeMatch.lastIndexOf('</pre>')
    );
    if (lastOpenTag > lastCloseTag) return match; // Inside HTML tag

    let href = protocolUrl || domainUrl;
    if (!/^https?:\/\//i.test(href)) href = "https://" + href;
    return `<a class="link" href="${href}" target="_blank" rel="noopener noreferrer">${match}${BROWSER_ICON}</a>`;
  });
  html = inlineCodeBlocks.reduce((acc, block, i) => acc.replace(`__INLINE_CODE_${i}__`, block), html);

  // Inline formatting - but protect placeholders and HTML attributes from being formatted
  // First, protect all __PLACEHOLDER__ patterns (use # to avoid underscore issues)
  const allPlaceholders = [];
  html = html.replace(/__[A-Z_]+_\d+__/g, (match) => {
    const placeholder = `@@PROTECTED#${allPlaceholders.length}@@`;
    allPlaceholders.push(match);
    return placeholder;
  });

  // Then protect content inside HTML tags (including attributes)
  const htmlTagPattern = /<[^>]+>/g;
  const protectedTags = [];
  html = html.replace(htmlTagPattern, (match) => {
    const placeholder = `@@TAG#${protectedTags.length}@@`;
    protectedTags.push(match);
    return placeholder;
  });

  // Now apply formatting to the remaining text (safe from placeholders)
  html = html.replace(/\*\*\*(.*?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/___(.*?)___/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/__((?!PROTECTED|TAG)\w+?)__/g, "<strong>$1</strong>") // Protect new placeholders
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/(^|[\s"'([{])_([^_\s][^_]*?[^_\s])_(\s|["')\]},;.!?]|$)/g, "$1<em>$2</em>$3")
    .replace(/~~(.*?)~~/g, "<del>$1</del>");

  // Restore protected HTML tags
  protectedTags.forEach((tag, i) => {
    html = html.replace(`@@TAG#${i}@@`, tag);
  });

  // Restore all placeholders
  allPlaceholders.forEach((ph, i) => {
    html = html.replace(`@@PROTECTED#${i}@@`, ph);
  });

  return html;
}

function addPHasListClass(container) {
  // Find all p tags and check if their next sibling is ul or ol
  const pTags = container.querySelectorAll('p');
  pTags.forEach(p => {
    const nextElement = p.nextElementSibling;
    if (nextElement && (nextElement.tagName === 'UL' || nextElement.tagName === 'OL')) {
      p.classList.add('p-has-li');
    }
  });
}

function md(src, options = {}) {
  if (!src) return "";
  const cleanSrc = src.trim();

  // Extract command input/output tags BEFORE any markdown processing
  // Group consecutive input-output pairs into single command units
  const commandGroups = [];

  // First pass: collect all command blocks
  const allCommandBlocks = [];
  cleanSrc.replace(/<!--command-(input|output)-->([\s\S]*?)<!--\/command-\1-->/gi, (match, type, content) => {
    allCommandBlocks.push({ type, content: content.trim() });
    return match; // Don't replace yet
  });

  // Second pass: group consecutive input-output pairs
  for (let i = 0; i < allCommandBlocks.length; i++) {
    const block = allCommandBlocks[i];
    if (block.type === 'input') {
      const group = { input: block.content };
      // Check if next block is output
      if (i + 1 < allCommandBlocks.length && allCommandBlocks[i + 1].type === 'output') {
        group.output = allCommandBlocks[i + 1].content;
        i++; // Skip the output block since it's grouped
      }
      commandGroups.push(group);
    } else if (block.type === 'output') {
      // Standalone output (shouldn't happen in our system, but handle it)
      commandGroups.push({ output: block.content });
    }
  }

  // Third pass: replace with grouped placeholders
  let srcWithPlaceholders = cleanSrc;
  commandGroups.forEach((group, index) => {
    const inputMatch = group.input ? `<!--command-input-->\n${group.input}\n<!--/command-input-->\n` : '';
    const outputMatch = group.output ? `<!--command-output-->\n${group.output}\n<!--/command-output-->\n` : '';
    const combinedMatch = inputMatch + outputMatch;
    if (combinedMatch) {
      const placeholder = `__COMMAND_GROUP_${index}__`;
      srcWithPlaceholders = srcWithPlaceholders.replace(combinedMatch, placeholder);
    }
  });

  const html = enhancedMarkdownParse(srcWithPlaceholders, options);
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = html;

  // Restore command groups
  let finalHtml = tempDiv.innerHTML;
  commandGroups.forEach((group, index) => {
    const placeholder = `__COMMAND_GROUP_${index}__`;
    let replacement = '';

    if (group.input) {
      // Create expandable command input with output
      const outputHtml = group.output ?
        '<div class="command-output" aria-hidden="true">' + group.output.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>' : '';

      const toggleButton = group.output ? '<button class="command-toggle"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6,9 12,15 18,9"></polyline></svg></button>' : '';

      // Transform command text to human-readable format
      const readableCommand = transformCommandText(group.input);

      replacement = '<div class="command-input"><div class="command-header"><svg class="command-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4,17 10,11 4,5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg><span class="command-text">' +
        readableCommand +
        '</span>' + toggleButton + '</div>' + outputHtml + '</div>';
    } else if (group.output) {
      // Standalone output (fallback)
      replacement = '<div class="command-output">' + group.output.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>';
    }

    finalHtml = finalHtml.replace(placeholder, replacement);
  });

  tempDiv.innerHTML = finalHtml;
  addPHasListClass(tempDiv);

  if (tempDiv.querySelector("pre code, .command-code, .hidden-content pre code")) {
    highlightAllUnder(tempDiv);
  }

  attachCodeBlockListeners(tempDiv);

  if (tempDiv.querySelector(".command-toggle")) initCommandToggles(tempDiv);

  const processedHtml = tempDiv.innerHTML;
  setTimeout(() => updateCodeBlocksWithArtifactInfo(tempDiv), 0);
  return processedHtml;
}

function mdThinking(src) {
  if (!src) return "";
  const cleanSrc = src.trim();
  const html = enhancedMarkdownParse(cleanSrc, { isThinkingText: true });
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = html;
  addPHasListClass(tempDiv);
  if (tempDiv.querySelector("pre code")) highlightAllUnder(tempDiv);
  attachCodeBlockListeners(tempDiv);
  return tempDiv.innerHTML;
}

// Export for Node.js testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { md, mdThinking, enhancedMarkdownParse, parseInlineMarkdown };
}