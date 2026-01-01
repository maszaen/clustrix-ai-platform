
export const parseAgentContent = (content) => {
  if (!content) return [{ type: 'text', content: '' }];

  // Regex matches generic command tags
  const tagRegex = /<!--command-(input|output)-->([\s\S]*?)<!--\/command-\1-->/gi;
  
  const blocks = [];
  let lastIndex = 0;
  let match;

  while ((match = tagRegex.exec(content)) !== null) {
      // Capture text before the tag
      if (match.index > lastIndex) {
          const text = content.substring(lastIndex, match.index);
          // Only push if not just whitespace? No, Markdown spacing matters.
          blocks.push({ type: 'text', content: text });
      }

      const type = match[1]; // 'input' or 'output'
      const rawPayload = match[2];
      let payload = null;
      try {
          // Sanitize: remove control characters (U+0000 to U+001F) except valid whitespace
          const sanitized = rawPayload.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
          payload = JSON.parse(sanitized);
      } catch (e) {
          // If still fails, don't log warning - just use raw
          payload = { raw: rawPayload.trim() };
      }

      blocks.push({
          type: type === 'input' ? 'command_input' : 'command_output',
          data: payload
      });

      lastIndex = tagRegex.lastIndex;
  }

  // Push remaining text
  if (lastIndex < content.length) {
      blocks.push({ type: 'text', content: content.substring(lastIndex) });
  }

  // Grouping Logic
  // We groups consecutive Input/Output pairs into a Command Unit.
  // And consecutive Command Units into a Command Group.
  
  const structured = [];
  let currentGroup = null; // { type: 'command_group', commands: [] }
  let activeCommand = null; // { input: ..., output: ..., status: ... }

  blocks.forEach(block => {
      if (block.type === 'text') {
          // If we encounter text, we must flush any active command/group
          
          if (activeCommand) {
             if (!currentGroup) currentGroup = { type: 'command_group', commands: [] };
             currentGroup.commands.push(activeCommand);
             activeCommand = null; 
          }
          
          if (currentGroup) {
              structured.push(currentGroup);
              currentGroup = null;
          }
          
          // Add the text block
          // Only if it's not empty, but " " is valid markdown.
          structured.push(block);

      } else if (block.type === 'command_input') {
          // Start a new command.
          // If previous command unfinished, push it.
          if (activeCommand) {
              if (!currentGroup) currentGroup = { type: 'command_group', commands: [] };
              currentGroup.commands.push(activeCommand);
          }
          
          // If we weren't in a group, we are now (implicitly, until interrupted by text)
          if (!currentGroup) currentGroup = { type: 'command_group', commands: [] };

          activeCommand = {
              type: 'command_unit', // Still use command_unit internal type
              input: block.data,
              output: null,
              status: 'running'
          };

      } else if (block.type === 'command_output') {
          // Output belongs to the ACTIVE command
          if (activeCommand) {
              activeCommand.output = block.data;
              activeCommand.status = 'complete';
              
              currentGroup.commands.push(activeCommand);
              activeCommand = null;
          } else {
              // Orphaned output? 
              // In Electron this is discarded or shown as text.
              // We'll ignore it to avoid crashes.
          }
      }
  });

  // Final flush
  if (activeCommand) {
      if (!currentGroup) currentGroup = { type: 'command_group', commands: [] };
      currentGroup.commands.push(activeCommand);
  }
  if (currentGroup) {
      structured.push(currentGroup);
  }

  return structured;
};

/* --- CLI Command Parser (Ported from Electron renderer/core/md.js) --- */

const getFilename = (path) => {
    if (!path) return path;
    const cleanPath = path.replace(/['"]/g, '').trim();
    if (!cleanPath) return '';
    
    const parts = cleanPath.split(/[/\\]/);
    if (parts.length === 1) return parts[0];
    
    const filename = parts[parts.length - 1];
    const parent = parts[parts.length - 2];
    
    // Parent should be valid dir name, not just drive letter
    if (parent && parent.length > 0 && !parent.match(/^[A-Z]:$/i)) {
      return `${parent}/${filename}`;
    }
    return filename || cleanPath;
};

const transformSingleCommand = (commandText) => {
    if (!commandText) return '';
    const cmd = commandText.trim();
    
    // Helper to extract param value
    const getParam = (paramName) => {
        const regex = new RegExp(`-${paramName}\\s+["']?([^"'\\s-]+)["']?`, 'i');
        const match = cmd.match(regex);
        return match ? match[1] : null;
    };
    
    // Git Commands
    if (cmd.match(/^git\s+/i)) {
        if (cmd.match(/^git\s+init/i)) return 'Git init repo';
        
        if (cmd.match(/^git\s+clone/i)) {
            const urlMatch = cmd.match(/^git\s+clone\s+(?:--\S+\s+)*["']?([^\s"']+)["']?/i);
            const repoName = urlMatch ? (urlMatch[1].split('/').pop()?.replace('.git','') || urlMatch[1]) : 'repo';
            return `Git clone ${repoName}`;
        }
        
        if (cmd.match(/^git\s+add/i)) {
             const file = cmd.match(/^git\s+add\s+(.+)/i)?.[1]?.trim();
             if (file === '.' || file === '-A' || file === '--all') return 'Git stage all changes';
             return `Git stage ${getFilename(file) || 'files'}`;
        }
        
        if (cmd.match(/^git\s+commit/i)) {
            const msgMatch = cmd.match(/-m\s+["']([^"']+)["']/i);
            const msg = msgMatch ? msgMatch[1] : '';
            return msg ? `Git commit: "${msg.length > 40 ? msg.substring(0,37)+'...' : msg}"` : 'Git commit';
        }

        if (cmd.match(/^git\s+push/i)) {
            const remote = cmd.match(/push\s+(\S+)\s+(\S+)/i);
            if (remote) return `Git push ${remote[1]} ${remote[2]}`;
            return 'Git push';
        }

        if (cmd.match(/^git\s+pull/i)) return 'Git pull';
        
        if (cmd.match(/^git\s+status/i)) return 'Git status';
        
        if (cmd.match(/^git\s+checkout/i)) {
            const branch = cmd.match(/checkout\s+(?:-b\s+)?["']?([^\s"']+)["']?/i)?.[1];
            return branch ? `Git checkout ${branch}` : 'Git checkout';
        }
        
        if (cmd.match(/^git\s+merge/i)) {
             const branch = cmd.match(/merge\s+["']?([^\s"']+)["']?/i)?.[1];
             return branch ? `Git merge ${branch}` : 'Git merge';
        }
        
        if (cmd.match(/^git\s+diff/i)) return 'Git diff';
        if (cmd.match(/^git\s+log/i)) return 'Git log';
    }

    // NPM Commands
    if (cmd.match(/^npm\s+/i)) {
        const action = cmd.match(/^npm\s+(run|install|i|test|start|build)/i)?.[1];
        if (action === 'install' || action === 'i') {
           const pkg = cmd.split(/\s+/).slice(2).find(p => !p.startsWith('-'));
           return pkg ? `Npm install ${pkg}` : 'Npm install';
        }
        if (action === 'run') {
           const script = cmd.split(/\s+/)[2];
           return script ? `Npm run ${script}` : 'Npm run';
        }
        return `Npm ${action || 'command'}`;
    }

    // File System
    if (cmd.match(/^(?:Get-ChildItem|ls|dir)/i)) return 'List contents';
    
    if (cmd.match(/^(?:Set-Content|echo)\s+/i)) {
         const file = cmd.match(/>\s*["']?([^\s"']+)["']?/i)?.[1] || getParam('Path');
         return file ? `Write to ${getFilename(file)}` : 'Write file';
    }
    
    if (cmd.match(/^(?:Remove-Item|rm|del)\s+/i)) {
         const file = cmd.split(/\s+/).pop();
         return `Delete ${getFilename(file)}`;
    }
    
    if (cmd.match(/^(?:Move-Item|mv)\s+/i)) {
         return 'Move files'; // simplifying regex
    }
    
    if (cmd.match(/^(?:Copy-Item|cp)\s+/i)) {
         return 'Copy files';
    }

    if (cmd.match(/^mkdir\s+/i)) {
         const dir = cmd.split(/\s+/).pop();
         return `Create directory ${dir}`;
    }

    // Langs
    if (cmd.match(/^node\s+/i)) {
        const file = cmd.match(/^node\s+["']?([^\s"']+)["']?/i)?.[1];
        return file ? `Run Node ${getFilename(file)}` : 'Run Node';
    }

    if (cmd.match(/^python\s+/i)) {
         const file = cmd.match(/^python\s+["']?([^\s"']+)["']?/i)?.[1];
        return file ? `Run Python ${getFilename(file)}` : 'Run Python';
    }

    return cmd;
};

export const transformCommandText = (cmdName, args) => {
    if (!cmdName) return 'Unknown Command';

    if (cmdName === 'generate_image') {
        const prompt = args?.prompt || '';
        return `Generate Image: ${prompt.length > 40 ? prompt.substring(0, 40) + '...' : prompt}`;
    }
    
    if (cmdName === 'web_search') {
        const queries = args?.queries || [];
        if (Array.isArray(queries) && queries.length > 0) {
            const preview = queries.slice(0, 2).join('", "');
            return `Search Web: "${preview}"${queries.length > 2 ? '...' : ''}`;
        }
        return 'Search Web';
    }
    
    if (cmdName === 'reattach_file') {
        const filename = args?.filename || '';
        return `Recall File: "${filename}"`;
    }
    
    if (cmdName === 'list_attachments') {
        return 'List Session Files';
    }
    
    if (cmdName === 'run_command') {
        const cmd = String(args || '');
        // Naive split for now to catch simple grouped commands
        if (cmd.includes(';') || cmd.includes('&&')) {
           const parts = cmd.split(/[;&]+/).map(s => s.trim()).filter(Boolean);
           if (parts.length > 1) {
              const first = transformSingleCommand(parts[0]);
              return `${first} (+${parts.length - 1} more)`;
           }
        }
        return transformSingleCommand(cmd);
    }

    if (cmdName === 'read_file') {
        const path = args?.path || args || '';
        return `Read File: ...${path.slice(-30)}`;
    }

    // Default JSON stringify for others
    try {
        const str = typeof args === 'object' ? JSON.stringify(args) : String(args);
        return `${cmdName}: ${str.length > 30 ? str.substring(0, 30) + '...' : str}`;
    } catch {
        return cmdName;
    }
};
