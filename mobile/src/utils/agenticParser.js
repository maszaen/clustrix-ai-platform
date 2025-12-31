
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
              type: 'command_unit',
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

export const transformCommandText = (cmdName, args) => {
    if (!cmdName) return 'Unknown Command';

    if (cmdName === 'generate_image') {
        const prompt = args?.prompt || '';
        return `Generate Image: ${prompt.length > 40 ? prompt.substring(0, 40) + '...' : prompt}`;
    }
    
    if (cmdName === 'web_search') {
        // args is object { queries: [...], commentary?: string }
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
        const cmd = args || '';
        return `Run: ${cmd.length > 50 ? cmd.substring(0, 50) + '...' : cmd}`;
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
