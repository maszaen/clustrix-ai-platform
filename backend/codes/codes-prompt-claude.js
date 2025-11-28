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
  Use insertBefore with line number
  Example: insertBefore=25 inserts new content before line 25

APPEND TO END OF FILE:
  Use append=true
  
DELETE LINES (empty content):
  Use range with empty content string

⚠️ IMPORTANT:
  - Line numbers are 1-indexed
  - Always read the file first to get accurate line numbers
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
        insertBefore: {
          type: "integer", 
          description: "Insert content before this line number"
        },
        append: {
          type: "boolean",
          description: "Append content to end of file"
        },
        content: {
          type: "string",
          description: "New content (empty string to delete lines)"
        }
      },
      required: ["file", "content"]
    },
  },
  {
    name: "task_complete",
    description: `Signal that the task is complete. Use when:
- All requested changes have been made and verified
- The question has been fully answered
- No more actions are needed

Always provide a clear summary of what was accomplished.`,
    input_schema: {
      type: "object", 
      properties: {
        summary: {
          type: "string",
          description: "Summary of what was accomplished"
        },
        files_changed: {
          type: "array",
          items: { type: "string" },
          description: "List of files that were modified"
        }
      },
      required: ["summary"]
    },
    // Cache the last tool to cache ALL tools
    cache_control: { type: "ephemeral" }
  }
];

// ===================================
// SYSTEM PROMPT FOR CLAUDE
// Minimal, focused, no memory injection
// ===================================
const CLAUDE_SYSTEM_PROMPT = `You are Clustrix, an expert software engineer with deep knowledge of programming languages, frameworks, and best practices.

## Your Tools
- **run_command**: Execute PowerShell commands (search, read files, run tests, etc.)
- **edit_file**: Modify files with precise line-based edits
- **task_complete**: Signal when the task is fully done

## Working Process
1. **Understand**: Read the request carefully
2. **Explore**: Search and read relevant files to understand the codebase
3. **Plan**: Think through your approach before making changes
4. **Execute**: Make precise edits using exact line numbers
5. **Verify**: Read edited files to confirm changes are correct
6. **Complete**: Use task_complete with a summary when done

## Important Guidelines
- Always use Show-FileWithLineNumbers to read files (gives you line numbers for editing)
- Use Search-InFiles for fast recursive search (uses ripgrep)
- When editing, use the exact line numbers from your most recent file read
- Verify your changes by reading the file after editing
- Work incrementally on complex tasks

## Response Style
Think through your approach, then use the appropriate tool. Be efficient:
- Don't re-read files you just read (the output is in our conversation)
- Don't search for things you already found
- Move forward once you have enough information`;

// ===================================
// BUILD MESSAGES - NO MEMORY INJECTION
// ===================================
function buildClaudeAgentMessages(conversationHistory, workspaceInstruction = '') {
  let systemContent = CLAUDE_SYSTEM_PROMPT;
  
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
  
  // Messages are just the conversation history - NO MEMORY INJECTION
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
  const result = {
    text: '',
    toolCalls: [],
    isComplete: false,
    completeSummary: null,
    filesChanged: []
  };
  
  if (!response.content || !Array.isArray(response.content)) {
    return result;
  }
  
  for (const block of response.content) {
    if (block.type === 'text') {
      result.text += block.text;
    } else if (block.type === 'tool_use') {
      result.toolCalls.push({
        id: block.id,
        name: block.name,
        input: block.input
      });
      
      if (block.name === 'task_complete') {
        result.isComplete = true;
        result.completeSummary = block.input.summary;
        result.filesChanged = block.input.files_changed || [];
      }
    }
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
