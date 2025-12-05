// ===================================================================
// RESEARCH TOOLS - Tool Definitions + Bridge to Internal Engine
// ===================================================================
//
// Provides:
// 1. Tool definitions for OpenAI/Gemini/Claude formats
// 2. Bridge function to translate tool calls to internal search engine
// 3. Result formatting for native tool_result
//
// IMPORTANT: Uses same search engine as reasoning-action-agent.js
// Web search uses SerpAPI/Google via performWebSearch, NOT DuckDuckGo
//
// ===================================================================

const { log: appLog } = require('../../utils/logger');

function log(level, fn, msg, details = {}) {
  appLog('RESEARCH-TOOLS', level, fn, msg, details);
  console.log(`[RESEARCH-TOOLS] ${fn}: ${msg}`, details);
}

// ===================================
// TOOL DEFINITIONS - OpenAI Format
// ===================================
// IMPORTANT: Each tool has a "commentary" field for thinking updates
// AI should provide short commentary like "Searching for X to find Y"
const RESEARCH_TOOLS_OPENAI = [
  {
    type: "function",
    function: {
      name: "web_search",
      description: `Search the web for information.`,
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query"
          },
          max_results: {
            type: "integer",
            description: "Max results (default: 5)"
          },
          commentary: {
            type: "string",
            description: "Short keyword for UI display"
          }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "fetch_webpage",
      description: `Fetch content from a URL.`,
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "URL to fetch"
          },
          commentary: {
            type: "string",
            description: "Short keyword for UI"
          }
        },
        required: ["url"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "search_files",
      description: `Search pattern in uploaded files.`,
      parameters: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description: "Text or regex pattern"
          },
          file: {
            type: "string",
            description: "Specific file name (optional)"
          },
          context_lines: {
            type: "integer",
            description: "Context lines (default: 3)"
          },
          commentary: {
            type: "string",
            description: "Short keyword for UI"
          }
        },
        required: ["pattern"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "analyze_file",
      description: `Analyze file structure.`,
      parameters: {
        type: "object",
        properties: {
          file_name: {
            type: "string",
            description: "File name to analyze"
          },
          commentary: {
            type: "string",
            description: "Short keyword for UI"
          }
        },
        required: ["file_name"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_files",
      description: `List all uploaded files with metadata.
Returns: file names, types, sizes, line counts.`,
      parameters: {
        type: "object",
        properties: {
          commentary: {
            type: "string",
            description: "Short keyword for UI"
          }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "synthesize",
      description: `Call this when you have gathered enough information and are ready to provide your final answer.
This signals the end of research phase.`,
      parameters: {
        type: "object",
        properties: {
          is_synthesis: {
            type: "boolean",
            description: "Must be true to indicate synthesis"
          },
          commentary: {
            type: "string",
            description: "Short note like 'Synthesizing findings'"
          }
        },
        required: ["is_synthesis"]
      }
    }
  }
];

// ===================================
// TOOL DEFINITIONS - Gemini Format
// ===================================
const RESEARCH_TOOLS_GEMINI = [
  {
    functionDeclarations: [
      {
        name: "web_search",
        description: `Search the web for information.`,
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query" },
            max_results: { type: "integer", description: "Max results (default: 5)" },
            commentary: { type: "string", description: "Short keyword for UI" }
          },
          required: ["query"]
        }
      },
      {
        name: "fetch_webpage",
        description: `Fetch content from a URL.`,
        parameters: {
          type: "object",
          properties: {
            url: { type: "string", description: "URL to fetch" },
            commentary: { type: "string", description: "Short keyword for UI" }
          },
          required: ["url"]
        }
      },
      {
        name: "search_files",
        description: `Search pattern in uploaded files.`,
        parameters: {
          type: "object",
          properties: {
            pattern: { type: "string", description: "Text or regex pattern" },
            file: { type: "string", description: "Specific file name (optional)" },
            context_lines: { type: "integer", description: "Context lines (default: 3)" },
            commentary: { type: "string", description: "Short keyword for UI" }
          },
          required: ["pattern"]
        }
      },
      {
        name: "analyze_file",
        description: `Analyze file structure.`,
        parameters: {
          type: "object",
          properties: {
            file_name: { type: "string", description: "File name to analyze" },
            commentary: { type: "string", description: "Short keyword for UI" }
          },
          required: ["file_name"]
        }
      },
      {
        name: "list_files",
        description: `List all uploaded files.`,
        parameters: {
          type: "object",
          properties: {
            commentary: { type: "string", description: "Short keyword for UI" }
          },
          required: []
        }
      },
      {
        name: "synthesize",
        description: `Call when ready to provide final answer.`,
        parameters: {
          type: "object",
          properties: {
            is_synthesis: { type: "boolean", description: "Must be true" },
            commentary: { type: "string", description: "Short note" }
          },
          required: ["is_synthesis"]
        }
      }
    ]
  }
];

// ===================================
// TOOL DEFINITIONS - Claude Format
// ===================================
const RESEARCH_TOOLS_CLAUDE = [
  {
    name: "web_search",
    description: `Search the web for information.`,
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        max_results: { type: "integer", description: "Max results (default: 5)" },
        commentary: { type: "string", description: "Short keyword for UI" }
      },
      required: ["query"]
    }
  },
  {
    name: "fetch_webpage",
    description: `Fetch content from a URL.`,
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to fetch" },
        commentary: { type: "string", description: "Short keyword for UI" }
      },
      required: ["url"]
    }
  },
  {
    name: "search_files",
    description: `Search pattern in uploaded files.`,
    input_schema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Text or regex pattern" },
        file: { type: "string", description: "Specific file name (optional)" },
        context_lines: { type: "integer", description: "Context lines (default: 3)" },
        commentary: { type: "string", description: "Short keyword for UI" }
      },
      required: ["pattern"]
    }
  },
  {
    name: "analyze_file",
    description: `Analyze file structure.`,
    input_schema: {
      type: "object",
      properties: {
        file_name: { type: "string", description: "File name to analyze" },
        commentary: { type: "string", description: "Short keyword for UI" }
      },
      required: ["file_name"]
    }
  },
  {
    name: "list_files",
    description: `List all uploaded files.`,
    input_schema: {
      type: "object",
      properties: {
        commentary: { type: "string", description: "Short keyword for UI" }
      },
      required: []
    }
  },
  {
    name: "synthesize",
    description: `Call when ready to provide final answer.`,
    input_schema: {
      type: "object",
      properties: {
        is_synthesis: { type: "boolean", description: "Must be true" },
        commentary: { type: "string", description: "Short note" }
      },
      required: ["is_synthesis"]
    }
  }
];

// ===================================
// BRIDGE: Execute Tool via Internal Engine
// ===================================
// Uses DesktopSearchEngine - same as reasoning-action-agent.js
// Make sure searchApiConfig is set on searchEngine before calling
async function executeResearchTool(toolName, params, searchEngine) {
  log(1, 'executeResearchTool', `Executing: ${toolName}`, { params });
  
  try {
    let result;
    
    switch (toolName) {
      case 'web_search': {
        result = await searchEngine.webSearch({
          query: params.query,
          maxResults: params.max_results || 5
        });
        break;
      }
      
      case 'fetch_webpage': {
        result = await searchEngine.fetchWebPage({ url: params.url });
        break;
      }
      
      case 'search_files': {
        result = searchEngine.searchPattern({
          pattern: params.pattern,
          options: {
            file: params.file,
            contextLines: params.context_lines || 3
          }
        });
        break;
      }
      
      case 'analyze_file': {
        result = searchEngine.analyzeFileStructure({
          fileName: params.file_name
        });
        break;
      }
      
      case 'list_files': {
        result = searchEngine.listAvailableFiles();
        break;
      }
      
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
    
    log(1, 'executeResearchTool', `Completed: ${toolName}`, { 
      resultCount: Array.isArray(result) ? result.length : 1 
    });
    
    return {
      success: true,
      data: result
    };
    
  } catch (error) {
    log(3, 'executeResearchTool', `Failed: ${toolName}`, { error: error.message });
    return {
      success: false,
      error: error.message
    };
  }
}

// ===================================
// FORMAT RESULT FOR TOOL_RESULT
// ===================================
function formatToolResult(toolName, result, maxChars = 8000) {
  if (!result.success) {
    return `Error: ${result.error}`;
  }
  
  const data = result.data;
  let formatted;
  
  switch (toolName) {
    case 'web_search': {
      if (!Array.isArray(data) || data.length === 0) {
        return 'No results found.';
      }
      formatted = data.slice(0, 5).map((item, i) => {
        const content = item.content ? `\nContent: ${item.content.slice(0, 1500)}` : '';
        return `[${i + 1}] ${item.title}\nURL: ${item.url}\nSnippet: ${item.snippet || '(no snippet)'}${content}`;
      }).join('\n\n---\n\n');
      break;
    }
    
    case 'fetch_webpage': {
      if (!Array.isArray(data) || data.length === 0) {
        return 'Failed to fetch webpage.';
      }
      const page = data[0];
      formatted = `URL: ${page.url}\nContent:\n${(page.content || '').slice(0, 6000)}`;
      break;
    }
    
    case 'search_files': {
      if (!Array.isArray(data) || data.length === 0) {
        return 'No matches found.';
      }
      formatted = data.slice(0, 10).map(item => 
        `File: ${item.fileName}:${item.lineNumber}\n${item.context || item.match}`
      ).join('\n\n---\n\n');
      break;
    }
    
    case 'analyze_file': {
      if (!data) {
        return 'File not found.';
      }
      const struct = data.structure || {};
      const parts = [`File: ${data.fileName}`, `Type: ${data.type}`, `Lines: ${data.lineCount}`];
      if (struct.functions?.length) parts.push(`Functions: ${struct.functions.length}`);
      if (struct.classes?.length) parts.push(`Classes: ${struct.classes.length}`);
      if (struct.imports?.length) parts.push(`Imports: ${struct.imports.length}`);
      formatted = parts.join('\n');
      break;
    }
    
    case 'list_files': {
      if (!Array.isArray(data) || data.length === 0) {
        return 'No files uploaded.';
      }
      formatted = data.map(f => 
        `- ${f.fileName} (${f.type}, ${f.lineCount} lines, ${f.sizeFormatted})`
      ).join('\n');
      break;
    }
    
    default:
      formatted = JSON.stringify(data, null, 2);
  }
  
  // Truncate if too long
  if (formatted.length > maxChars) {
    formatted = formatted.slice(0, maxChars) + '\n... [truncated]';
  }
  
  return formatted;
}

module.exports = {
  RESEARCH_TOOLS_OPENAI,
  RESEARCH_TOOLS_GEMINI,
  RESEARCH_TOOLS_CLAUDE,
  executeResearchTool,
  formatToolResult
};
