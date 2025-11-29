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
        }
      },
      required: ["checklist"]
    }
  }
];

// ===================================
// SYSTEM PROMPT FOR CLAUDE
// Minimal, focused, no memory injection
// ===================================
const CLAUDE_SYSTEM_PROMPT = `You are Clustrix, a highly skilled software engineer with extensive knowledge in many programming languages, frameworks, design patterns, and best practices.

## Tools
- run_command: Execute PowerShell commands
- edit_file: Modify files with line-based edits
- update_checklist: Update task progress for complex multi-step tasks

## Guidelines
- Use Show-FileWithLineNumbers to read files (get line numbers)
- Use Search-InFiles for fast recursive search
- Edit with exact line numbers from recent reads
- Verify changes by reading files after editing
- Be concise and efficient

## Response Style
Be brief. Think briefly, then use tools. Don't repeat information or state current status.

## Important Rules
- Be concise, direct, and to the point. Minimize output tokens while maintaining helpfulness.
- Answer directly without unnecessary preamble or postamble.
- Follow code conventions: mimic style, check existing libraries, follow patterns.
- NEVER add comments unless asked.
- Use TodoWrite tools frequently for task planning and tracking.
- Use search tools extensively to understand codebase.
- Verify solutions with tests, run lint/typecheck commands.
- Batch tool calls for efficiency.
- Assist with defensive security tasks only - refuse malicious code.
- Be proactive only when asked, balance between action and not surprising user.
- Reference code with file_path:line_number pattern.

## Task Management
You have access to the Checklist tools to help you manage and plan tasks. Use these tools VERY frequently to ensure that you are tracking your tasks and giving the user visibility into your progress.
These tools are also EXTREMELY helpful for planning tasks, and for breaking down larger complex tasks into smaller steps. If you do not use this tool when planning, you may forget to do important tasks - and that is unacceptable.

It is critical that you mark todos as completed as soon as you are done with a task. Do not batch up multiple tasks before marking them as completed.
Examples:

<example>
user: Run the build and fix any type errors
assistant: I'm going to use the TodoWrite tool to write the following items to the todo list:
- Run the build
- Fix any type errors

I'm now going to run the build using Bash.

Looks like I found 10 type errors. I'm going to use the TodoWrite tool to write 10 items to the todo list.

marking the first todo as in_progress

Let me start working on the first item...

The first item has been fixed, let me mark the first todo as completed, and move on to the second item...
..
..
</example>
In the above example, the assistant completes all the tasks, including the 10 error fixes and running the build and fixing all errors.

<example>
user: Help me write a new feature that allows users to track their usage metrics and export them to various formats

assistant: I'll help you implement a usage metrics tracking and export feature. Let me first use the TodoWrite tool to plan this task.
Adding the following todos to the todo list:
1. Research existing metrics tracking in the codebase
2. Design the metrics collection system
3. Implement core metrics tracking functionality
4. Create export functionality for different formats

Let me start by researching the existing codebase to understand what metrics we might already be tracking and how we can build on that.

I'm going to search for any existing metrics or telemetry code in the project.

I've found some existing telemetry code. Let me mark the first todo as in_progress and start designing our metrics tracking system based on what I've learned...

[Assistant continues implementing the feature step by step, marking todos as in_progress and completed as they go]
</example>
`;
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
