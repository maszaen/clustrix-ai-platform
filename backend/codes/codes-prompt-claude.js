// ===================================================================
// CLUSTRIX CLAUDE AGENT: NATIVE TOOL-BASED SYSTEM
// ===================================================================
//
// KEY DIFFERENCES FROM GENERIC AGENT:
// 1. NO MANUAL MEMORY - Native conversation history is sufficient
// 2. MULTIPLE FUNCTIONAL TOOLS - Not a single meta-tool
// 3. PROPER TOOL_RESULT - Command outputs go in tool_result blocks
// 4. PROMPT CACHING - 90% cost reduction
//
// Based on Anthropic's official recommendations:
// - anthropic.com/engineering/effective-context-engineering-for-ai-agents
// - anthropic.com/engineering/building-effective-agents
// ===================================================================

const { WEB_SEARCH_TOOL_CLAUDE } = require('./web-search-tool');

// ===================================
// CLAUDE TOOLS - Functional, Not Meta
// ===================================
const CLAUDE_AGENT_TOOLS = [
  {
    name: "run_command",
    description: `Execute a PowerShell command in the workspace.

SEARCH FILES (recursive, fast - uses ripgrep):
  Search-InFiles -Pattern "regex" -Filter "*.js" -Depth 2
  
READ FILE WITH LINE NUMBERS:
  Show-FileWithLineNumbers -Path "file.js"
  Show-FileWithLineNumbers -Path "file.js" -StartLine 50 -EndLine 100

LIST PROJECT FILES:
  List-ProjectFiles -Depth 2 -Extensions "*.js,*.ts"

FILE STATS (fast check before reading large files):
  Get-FileStats -Path "file.js"

CREATE NEW FILE:
  New-Item -ItemType File -Path "path/to/file.js" -Force

RUN TESTS/SCRIPTS:
  npm test | node script.js | python script.py

⚠️ DO NOT USE:
  - Get-ChildItem -Recurse (without -Depth) - will hang!
  - Get-Content directly - use Show-FileWithLineNumbers instead`,
    input_schema: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "The PowerShell command to execute"
        },
        commentary: {
          type: "string",
          description: "Brief human-readable explanation of what this command does (e.g., 'Searching for config files', 'Reading package.json', 'Running tests'). Keep it concise and user-friendly."
        }
      },
      required: ["command"]
    },
  },
  {
    name: "edit_file",
    description: `Edit a file by replacing, inserting, or deleting lines.

REPLACE LINES (delete old content, insert new):
  Use range with start and end line numbers
  Example: range={start:10, end:15} replaces lines 10-15

INSERT BEFORE A LINE (no deletion):
  Use insert_before with line number
  Example: insert_before=25 inserts new content before line 25

APPEND TO END OF FILE:
  Use append=true
  
DELETE LINES (empty content):
  Use range with empty content string

⚠️ IMPORTANT:
  - Line numbers are 1-indexed
  - Always read the file first to get accurate line numbers
  - You can provide multiple edit operations in multiple files
  - For NEW files, create them first with run_command`,
    input_schema: {
      type: "object",
      properties: {
        file: {
          type: "string",
          description: "Relative path to the file"
        },
        range: {
          type: "object",
          properties: {
            start: { type: "integer", description: "Start line number (1-indexed)" },
            end: { type: "integer", description: "End line number (1-indexed, inclusive)" }
          },
          description: "Line range to replace/delete"
        },
        insert_before: {
          type: "integer", 
          description: "Insert content before this line number"
        },
        append: {
          type: "boolean",
          description: "Append content to end of file"
        },
        content: {
          type: "string",
          description: "New content goes here (empty string to delete lines)"
        },
        commentary: {
          type: "string",
          description: "Brief explanation of what you're editing (e.g., 'Adding error handling to fetchUser function', 'Fixing import path', 'Removing deprecated code'). Be specific and user-friendly."
        }
      },
      required: ["file", "content"]
    },
  },
  {
    name: "update_checklist",
    description: `Update task checklist for complex multi-step tasks. Only use when user prompt requires multiple steps that need tracking.

CHECKLIST FORMAT:
- [x] Completed task
- [/] Currently working on this
- [ ] Pending task

USAGE GUIDELINES:
- Only send when checklist changes (task completed, started, or status updated)
- Don't send in every iteration - only when status changes
- Use for complex tasks that span multiple steps
- Keep task descriptions clear and actionable`,
    input_schema: {
      type: "object",
      properties: {
        checklist: {
          type: "array",
          description: "Array of checklist items",
          items: {
            type: "object",
            properties: {
              status: {
                type: "string",
                enum: ["completed", "in_progress", "pending"],
                description: "Task status"
              },
              task: {
                type: "string",
                description: "Task description"
              }
            },
            required: ["status", "task"]
          }
        },
        commentary: {
          type: "string",
          description: "Optional brief description of checklist update (e.g., 'Starting database schema design', 'Completed all API endpoints')"
        }
      },
      required: ["checklist"]
    }
  },
  {
    name: "show_history",
    description: `Show memory (explored file ranges) and/or edit history for this session. Use this to recall what files you've read and what edits you've made.`,
    input_schema: {
      type: "object",
      properties: {
        show_memory: {
          type: "boolean",
          description: "Show explored file ranges from memory"
        },
        show_edit_history: {
          type: "boolean",
          description: "Show recent edit history with edit IDs and diffs"
        }
      }
    }
  },
  {
    name: "undo_edit",
    description: `Undo a previous edit by its ID. Use show_history first to see available edit IDs.`,
    input_schema: {
      type: "object",
      properties: {
        edit_id: {
          type: "string",
          description: "The edit ID to undo (from show_history)"
        },
        reason: {
          type: "string",
          description: "Brief reason for undoing this edit"
        }
      },
      required: ["edit_id"]
    }
  },
  WEB_SEARCH_TOOL_CLAUDE
];

// ===================================
// SYSTEM PROMPT FOR CLAUDE
// Import from shared prompt for consistency across all agents
// ===================================
const { SYSTEM_PROMPT } = require('./codes-prompt-shared');
const CLAUDE_SYSTEM_PROMPT = SYSTEM_PROMPT;
// ===================================
// BUILD MESSAGES - NO MEMORY INJECTION
// ===================================
function buildClaudeAgentMessages(conversationHistory, workspaceInstruction = '', workspacePath = '') {
  let systemContent = CLAUDE_SYSTEM_PROMPT;
  
  // Add dynamic environment context
  const envContext = `
## Environment Context
Here is useful information about the environment you are running in:
You are powered by the platform named Clustrix.
Working directory: ${workspacePath || process.cwd()}
Today's date: ${new Date().toISOString().split('T')[0]}
`;
  
  systemContent += envContext;
  
  if (workspaceInstruction) {
    systemContent += `\n\n## Workspace Context\n${workspaceInstruction}`;
  }
  
  // System with caching
  const system = [
    {
      type: 'text',
      text: systemContent,
      cache_control: { type: 'ephemeral' }
    }
  ];
  
  return { system, messages: conversationHistory };
}

// ===================================
// GET TOOLS WITH CACHING
// ===================================
function getClaudeAgentTools() {
  // Tools already have cache_control on last one
  return CLAUDE_AGENT_TOOLS;
}

// ===================================
// PARSE CLAUDE RESPONSE
// ===================================
function parseClaudeAgentResponse(response) {
  // Log raw response for debugging
  console.log('[CLAUDE-RAW-RESPONSE]', JSON.stringify(response, null, 2));
  
  const result = {
    text: '',
    toolCalls: [],
    isComplete: false,
    completeSummary: null,
    filesChanged: [],
    // Map to standard agent response format
    hidden: null,
    answer: '',
    command: null,
    state: null,
    savedState: null,
    done: false,
    todo: null,
    checklist: null,
    summary: null,
  };
  
  if (!response.content || !Array.isArray(response.content)) {
    return result;
  }
  
  // Extract text and tool calls
  for (const block of response.content) {
    if (block.type === 'text') {
      result.text += block.text;
    } else if (block.type === 'tool_use') {
      result.toolCalls.push({
        id: block.id,
        name: block.name,
        input: block.input
      });
      
      if (block.name === 'run_command') {
        result.command = block.input.command;
      } else if (block.name === 'edit_file') {
        // For edit operations, we don't set command since it's handled differently
        // But we can set a descriptive command for UI
        result.command = `Edit file: ${block.input.file}`;
      }
    }
  }
  
  // Clean and set answer from text
  if (result.text) {
    // Clean text content similar to parseAgentResponse
    result.answer = result.text
      .trim();
    
    // Don't normalize whitespace - preserve newlines from Claude's response
    
    // Extract checklist if present in text
    const checklistMatch = result.text.match(/<checklist>([\s\S]*?)<\/checklist>/i);
    if (checklistMatch) {
      result.checklist = checklistMatch[1].trim();
      // Remove checklist from answer
      result.answer = result.answer.replace(/<checklist>[\s\S]*?<\/checklist>/gi, '').trim();
    }
    
    // Extract hidden if present
    const hiddenMatch = result.text.match(/<hidden>([\s\S]*?)<\/hidden>/i);
    if (hiddenMatch) {
      result.hidden = hiddenMatch[1].trim();
      // Remove hidden from answer
      result.answer = result.answer.replace(/<hidden>[\s\S]*?<\/hidden>/gi, '').trim();
    }
    
    // If answer becomes empty after cleaning, don't show it
    if (!result.answer.trim()) {
      result.answer = '';
    }
  }
  
  // Set state based on tools used or completion (internal only, don't display)
  if (result.isComplete) {
    result.state = 'DONE';
  } else if (result.toolCalls.some(tc => tc.name === 'run_command')) {
    result.state = 'EXECUTE';
  } else if (result.toolCalls.some(tc => tc.name === 'edit_file')) {
    result.state = 'EDIT';
  } else if (result.toolCalls.length === 0 && result.text) {
    result.state = 'EXPLORE';
  }
  
  return result;
}

// ===================================
// FORMAT TOOL RESULT
// ===================================
function formatClaudeToolResult(toolUseId, content, isError = false) {
  return {
    type: 'tool_result',
    tool_use_id: toolUseId,
    content: typeof content === 'string' ? content : JSON.stringify(content),
    ...(isError && { is_error: true })
  };
}

// ===================================
// EXPORTS
// ===================================
module.exports = {
  CLAUDE_AGENT_TOOLS,
  CLAUDE_SYSTEM_PROMPT,
  buildClaudeAgentMessages,
  getClaudeAgentTools,
  parseClaudeAgentResponse,
  formatClaudeToolResult,
};
