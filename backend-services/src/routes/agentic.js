/**
 * Agentic Chat API Route
 * 
 * Handles chat with web search capabilities (Agentic Mode)
 * Loops: AI -> Tool Calls -> Execute -> Respond
 */

const express = require('express');
const router = express.Router();
const { getModelConfig } = require('../config/models');
const { calculateCost } = require('../config/pricing');
const { checkProviderTokenLimit, trackProviderTokens } = require('../middleware/rateLimit');
const { getDb } = require('../services/database');

// ===================================================================
// TOOL DEFINITIONS
// ===================================================================

// Get current date for context
function formatISODateInTimeZone(now, timeZone) {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return dtf.format(now);
}

const dateISO = formatISODateInTimeZone(new Date(), 'UTC');

const WEB_SEARCH_TOOL = {
  type: 'function',
  function: {
    name: 'web_search',
    description: `Search the web for current information. Use for: up-to-date news, prices, weather, stocks, recent events, or when user asks to search. DATE: ${dateISO}. Provide 1-4 varied, specific queries with time anchors (month/year). Put tool args ONLY in function_call field, not in response content. After results: answer in plain language citing findings.`,
    parameters: {
      type: 'object',
      properties: {
        queries: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          maxItems: 4,
          description: 'Search queries (1-4). Use specific, varied queries with time anchors.',
        },
        commentary: {
          type: 'string',
          description: 'Brief explanation shown to user (e.g., "Looking up current weather")',
        },
      },
      required: ['queries'],
    },
  },
};

// List attachments tool - AI queries available files
const LIST_ATTACHMENTS_TOOL = {
  type: 'function',
  function: {
    name: 'list_attachments',
    description: `Call this FIRST when user references a file they sent earlier (e.g., "that image", "the file", "explain that photo"). Returns list of available filenames to use with reattach_file.`,
    parameters: {
      type: 'object',
      properties: {
        commentary: {
          type: 'string',
          description: 'Brief explanation (e.g., "Checking available files")',
        },
      },
      required: [],
    },
  },
};

// Reattach file tool - AI retrieves file content
const REATTACH_FILE_TOOL = {
  type: 'function',
  function: {
    name: 'reattach_file',
    description: `Retrieve a previously attached file by filename. Use after calling list_attachments to get available files. Returns file content for analysis.`,
    parameters: {
      type: 'object',
      properties: {
        filename: {
          type: 'string',
          description: 'Exact filename from list_attachments result',
        },
        commentary: {
          type: 'string',
          description: 'Brief explanation shown to user (e.g., "Recalling your image")',
        },
      },
      required: ['filename'],
    },
  },
};

// ===================================================================
// REMINDER TOOL DEFINITIONS
// ===================================================================

const VIEW_REMINDER_TOOL = {
  type: 'function',
  function: {
    name: 'view_reminder',
    description: `View all scheduled reminders for the current user. Returns a list of reminders with their titles, messages, and scheduled dates.`,
    parameters: {
      type: 'object',
      properties: {
        commentary: {
          type: 'string',
          description: 'Brief explanation (e.g., "Checking your reminders")',
        },
      },
      required: [],
    },
  },
};

const SET_REMINDER_TOOL = {
  type: 'function',
  function: {
    name: 'set_reminder',
    description: `Schedule a new reminder notification. The notification will appear at the specified time even if the app is closed. Use for: scheduling follow-ups, subscription reminders, task deadlines, or any time-based alerts the user requests. You MUST provide both a title AND a notification body - create engaging notification text that will grab the user's attention.`,
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Short title for the reminder (e.g., "Subscription Reminder", "Meeting with John")',
        },
        message: {
          type: 'string',
          description: 'Detailed description/notes for the reminder (stored for reference)',
        },
        notificationTitle: {
          type: 'string',
          description: 'Title shown in the push notification (e.g., "⏰ Time for your meeting!")',
        },
        notificationBody: {
          type: 'string',
          description: 'Body text shown in the push notification - make it engaging and actionable (e.g., "Your meeting with John starts now. Don\'t forget the quarterly report!")',
        },
        scheduledDate: {
          type: 'string',
          description: 'ISO 8601 date string for when the reminder should trigger (e.g., "2026-01-15T09:00:00+07:00"). Must be in the future.',
        },
        commentary: {
          type: 'string',
          description: 'Brief explanation shown to user (e.g., "Setting reminder for January 15th")',
        },
      },
      required: ['title', 'notificationTitle', 'notificationBody', 'scheduledDate'],
    },
  },
};

const REMOVE_REMINDER_TOOL = {
  type: 'function',
  function: {
    name: 'remove_reminder',
    description: `Permanently delete a scheduled reminder. This completely removes the reminder from the system. Use view_reminder first to get the reminder ID. Use this when user wants to DELETE a reminder.`,
    parameters: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The unique ID of the reminder to delete (from view_reminder results)',
        },
        commentary: {
          type: 'string',
          description: 'Brief explanation shown to user (e.g., "Deleting your reminder")',
        },
      },
      required: ['id'],
    },
  },
};

const COMPLETE_REMINDER_TOOL = {
  type: 'function',
  function: {
    name: 'complete_reminder',
    description: `Mark a reminder as completed. The reminder will be marked as done but NOT deleted - it stays in user's history. Use view_reminder first to get the reminder ID. Use this when user says they've done something or finished a task.`,
    parameters: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The unique ID of the reminder to mark as complete (from view_reminder results)',
        },
        commentary: {
          type: 'string',
          description: 'Brief explanation shown to user (e.g., "Marking reminder as complete")',
        },
      },
      required: ['id'],
    },
  },
};

// ===================================================================
// DAYTONA SANDBOX TOOL DEFINITIONS
// ===================================================================

const RUN_CODE_TOOL = {
  type: 'function',
  function: {
    name: 'run_code',
    description: `Execute code in a secure cloud sandbox. Supports Python, JavaScript, TypeScript, Bash, and other languages. Use this when user asks to run, execute, or test code. The code runs in an isolated environment with full package support. Returns stdout, stderr, and exit code.`,
    parameters: {
      type: 'object',
      properties: {
        language: {
          type: 'string',
          enum: ['python', 'javascript', 'typescript', 'bash', 'ruby', 'go', 'rust', 'java', 'php'],
          description: 'Programming language of the code',
        },
        code: {
          type: 'string',
          description: 'The code to execute. For Python, you can use pip packages. For JS/TS, you can use npm packages.',
        },
        commentary: {
          type: 'string',
          description: 'Brief explanation shown to user (e.g., "Running your Python script...")',
        },
      },
      required: ['language', 'code'],
    },
  },
};

const RUN_COMMAND_TOOL = {
  type: 'function',
  function: {
    name: 'run_command',
    description: `Execute a shell command in the sandbox environment. Use for: installing packages (pip install, npm install), file operations, system commands, etc. Returns command output and exit code.`,
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'Shell command to execute (e.g., "pip install pandas", "ls -la", "npm install axios")',
        },
        commentary: {
          type: 'string',
          description: 'Brief explanation shown to user (e.g., "Installing required packages...")',
        },
      },
      required: ['command'],
    },
  },
};

// Claude format
const WEB_SEARCH_TOOL_CLAUDE = {
  name: 'web_search',
  description: WEB_SEARCH_TOOL.function.description,
  input_schema: WEB_SEARCH_TOOL.function.parameters,
};

const LIST_ATTACHMENTS_TOOL_CLAUDE = {
  name: 'list_attachments',
  description: LIST_ATTACHMENTS_TOOL.function.description,
  input_schema: LIST_ATTACHMENTS_TOOL.function.parameters,
};

const REATTACH_FILE_TOOL_CLAUDE = {
  name: 'reattach_file',
  description: REATTACH_FILE_TOOL.function.description,
  input_schema: REATTACH_FILE_TOOL.function.parameters,
};

const VIEW_REMINDER_TOOL_CLAUDE = {
  name: 'view_reminder',
  description: VIEW_REMINDER_TOOL.function.description,
  input_schema: VIEW_REMINDER_TOOL.function.parameters,
};

const SET_REMINDER_TOOL_CLAUDE = {
  name: 'set_reminder',
  description: SET_REMINDER_TOOL.function.description,
  input_schema: SET_REMINDER_TOOL.function.parameters,
};

const REMOVE_REMINDER_TOOL_CLAUDE = {
  name: 'remove_reminder',
  description: REMOVE_REMINDER_TOOL.function.description,
  input_schema: REMOVE_REMINDER_TOOL.function.parameters,
};

const COMPLETE_REMINDER_TOOL_CLAUDE = {
  name: 'complete_reminder',
  description: COMPLETE_REMINDER_TOOL.function.description,
  input_schema: COMPLETE_REMINDER_TOOL.function.parameters,
};

const RUN_CODE_TOOL_CLAUDE = {
  name: 'run_code',
  description: RUN_CODE_TOOL.function.description,
  input_schema: RUN_CODE_TOOL.function.parameters,
};

const RUN_COMMAND_TOOL_CLAUDE = {
  name: 'run_command',
  description: RUN_COMMAND_TOOL.function.description,
  input_schema: RUN_COMMAND_TOOL.function.parameters,
};

// Gemini format
const WEB_SEARCH_TOOL_GEMINI = {
  functionDeclarations: [
    {
      name: 'web_search',
      description: WEB_SEARCH_TOOL.function.description,
      parameters: WEB_SEARCH_TOOL.function.parameters,
    },
    {
      name: 'list_attachments',
      description: LIST_ATTACHMENTS_TOOL.function.description,
      parameters: LIST_ATTACHMENTS_TOOL.function.parameters,
    },
    {
      name: 'reattach_file',
      description: REATTACH_FILE_TOOL.function.description,
      parameters: REATTACH_FILE_TOOL.function.parameters,
    },
    {
      name: 'view_reminder',
      description: VIEW_REMINDER_TOOL.function.description,
      parameters: VIEW_REMINDER_TOOL.function.parameters,
    },
    {
      name: 'set_reminder',
      description: SET_REMINDER_TOOL.function.description,
      parameters: SET_REMINDER_TOOL.function.parameters,
    },
    {
      name: 'remove_reminder',
      description: REMOVE_REMINDER_TOOL.function.description,
      parameters: REMOVE_REMINDER_TOOL.function.parameters,
    },
    {
      name: 'complete_reminder',
      description: COMPLETE_REMINDER_TOOL.function.description,
      parameters: COMPLETE_REMINDER_TOOL.function.parameters,
    },
    {
      name: 'run_code',
      description: RUN_CODE_TOOL.function.description,
      parameters: RUN_CODE_TOOL.function.parameters,
    },
    {
      name: 'run_command',
      description: RUN_COMMAND_TOOL.function.description,
      parameters: RUN_COMMAND_TOOL.function.parameters,
    },
  ],
};

// All OpenAI-format tools
const OPENAI_TOOLS = [WEB_SEARCH_TOOL, LIST_ATTACHMENTS_TOOL, REATTACH_FILE_TOOL, VIEW_REMINDER_TOOL, SET_REMINDER_TOOL, COMPLETE_REMINDER_TOOL, REMOVE_REMINDER_TOOL, RUN_CODE_TOOL, RUN_COMMAND_TOOL];
const CLAUDE_TOOLS = [WEB_SEARCH_TOOL_CLAUDE, LIST_ATTACHMENTS_TOOL_CLAUDE, REATTACH_FILE_TOOL_CLAUDE, VIEW_REMINDER_TOOL_CLAUDE, SET_REMINDER_TOOL_CLAUDE, COMPLETE_REMINDER_TOOL_CLAUDE, REMOVE_REMINDER_TOOL_CLAUDE, RUN_CODE_TOOL_CLAUDE, RUN_COMMAND_TOOL_CLAUDE];


// ===================================================================
// WEB SEARCH EXECUTION
// ===================================================================

async function executeWebSearch(input, config) {
  const { queries } = input;
  if (!queries || !Array.isArray(queries) || queries.length === 0) {
    return { success: false, output: 'No queries provided' };
  }

  const results = [];
  
  for (const query of queries.slice(0, 4)) {
    try {
      let searchResults;
      
      if (config.tavilyApiKey) {
        searchResults = await searchTavily(query, config.tavilyApiKey);
      } else if (config.serpApiKey) {
        searchResults = await searchSerpAPI(query, config.serpApiKey);
      } else if (config.googleApiKey && config.googleCseId) {
        searchResults = await searchGoogle(query, config.googleApiKey, config.googleCseId);
      } else {
        return { success: false, output: 'No search API configured. Set TAVILY_API_KEY, SERP_API_KEY, or GOOGLE_API_KEY + GOOGLE_CSE_ID in .env' };
      }
      
      results.push(...searchResults);
    } catch (err) {
      console.error(`[SEARCH] Error for query "${query}":`, err.message);
    }
  }

  if (results.length === 0) {
    return { success: false, output: 'No search results found' };
  }

  return {
    success: true,
    output: formatSearchOutput(results),
    data: { results },
  };
}

async function searchTavily(query, apiKey) {
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: 'basic',
      max_results: 5,
    }),
  });

  if (!response.ok) {
    throw new Error(`Tavily error: ${response.status}`);
  }

  const data = await response.json();
  return (data.results || []).map(r => ({
    title: r.title,
    url: r.url,
    snippet: r.content?.slice(0, 300),
  }));
}

async function searchSerpAPI(query, apiKey) {
  const url = `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${apiKey}&num=5`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`SerpAPI error: ${response.status}`);
  }

  const data = await response.json();
  return (data.organic_results || []).slice(0, 5).map(r => ({
    title: r.title,
    url: r.link,
    snippet: r.snippet?.slice(0, 300),
  }));
}

async function searchGoogle(query, apiKey, cseId) {
  const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cseId}&q=${encodeURIComponent(query)}&num=5`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Google CSE error: ${response.status}`);
  }

  const data = await response.json();
  return (data.items || []).slice(0, 5).map(r => ({
    title: r.title,
    url: r.link,
    snippet: r.snippet?.slice(0, 300),
  }));
}

function formatSearchOutput(results) {
  if (results.length === 0) return 'No results found.';
  
  return results.slice(0, 10).map((r, i) => 
    `[${i + 1}] ${r.title}\n${r.url}\n${r.snippet || ''}`
  ).join('\n\n');
}

// ===================================================================
// ATTACHMENT TOOL EXECUTION
// ===================================================================

/**
 * Execute list_attachments - return list of available files from request
 * Attachments are passed from client in request body
 */
function executeListAttachments(input, attachments) {
  if (!attachments || attachments.length === 0) {
    return {
      success: true,
      output: 'No files were attached in this session.',
      files: [],
    };
  }
  
  const fileList = attachments.map(a => {
    const type = a.type === 'image' ? 'Image' : 'File';
    return `- ${type}: "${a.name}"${a.mimeType ? ` (${a.mimeType})` : ''}`;
  }).join('\n');
  
  return {
    success: true,
    output: `Available files in this session:\n${fileList}`,
    files: attachments.map(a => ({ name: a.name, type: a.type, mimeType: a.mimeType })),
  };
}



/**
 * Helper: Find file content in DB (requestLogs)
 */
async function findFileContentInDb(userId, filename) {
  const db = getDb();
  if (!db || !userId) return null;
  
  try {
    // Search in recent request logs (last 20 requests to save reads)
    // This assumes the file was attached in a recent conversation
    const snapshot = await db.collection('requestLogs')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(20)
      .get();
      
    const filenameLower = filename.toLowerCase();
    
    for (const doc of snapshot.docs) {
      const data = doc.data();
      const messages = data.messages || [];
      
      // Check messages for attachments with content
      for (const msg of messages) {
        if (msg.attachments && Array.isArray(msg.attachments)) {
          const found = msg.attachments.find(a => 
            a.name?.toLowerCase() === filenameLower && (a.base64 || a.textContent)
          );
          if (found) return found;
        }
      }
    }
  } catch (err) {
    console.warn(`[AGENTIC] Error searching DB for file "${filename}":`, err.message);
  }
  return null;
}

/**
 * Execute reattach_file - retrieve file content by filename
 * Returns the attachment content if found
 */
async function executeReattachFile(input, attachments, userId) {
  const { filename } = input;
  
  if (!filename) {
    return { success: false, output: 'Filename is required.' };
  }
  
  // 1. Try session attachments first (fastest)
  let attachment = attachments?.find(a => 
    a.name?.toLowerCase() === filename.toLowerCase()
  );

  // 2. If not found or missing content, try DB
  if (!attachment || (!attachment.base64 && !attachment.textContent)) {
    console.log(`[AGENTIC] File "${filename}" content missing in session, checking DB...`);
    const dbAttachment = await findFileContentInDb(userId, filename);
    if (dbAttachment) {
      // Merge found content into attachment object
      attachment = { ...attachment, ...dbAttachment };
    }
  }
  
  if (!attachment) {
    const available = (attachments || []).map(a => a.name).join(', ') || 'none';
    return { 
      success: false, 
      output: `File "${filename}" not found. Available files: ${available}` 
    };
  }
  
  // For text files, return textContent
  if (attachment.textContent) {
    return {
      success: true,
      output: `[File: ${attachment.name}]\n${attachment.textContent}\n[End File]`,
      textContent: attachment.textContent,
    };
  }
  
  // For images with base64
  if (attachment.base64) {
    return {
      success: true,
      output: `Image "${attachment.name}" recalled successfully. [Base64 content available]`,
      base64: attachment.base64,
      mimeType: attachment.mimeType,
    };
  }
  
  // For images with data URI
  if (attachment.uri && attachment.uri.startsWith('data:')) {
    const base64Match = attachment.uri.match(/base64,(.+)$/);
    if (base64Match) {
      return {
        success: true,
        output: `Image "${attachment.name}" recalled successfully. [Base64 content available]`,
        base64: base64Match[1],
        mimeType: attachment.mimeType,
      };
    }
  }
  
  return {
    success: false,
    output: `File "${attachment.name}" found but content is not available.`,
  };
}

// ===================================================================
// REMINDER TOOL EXECUTION
// ===================================================================

const { getReminders, getReminder, saveReminder, completeReminder, deleteReminder, cleanupPastReminders } = require('../services/database');

/**
 * Execute view_reminder - get all reminders for current user
 */
async function executeViewReminder(input, userId) {
  if (!userId) {
    return {
      success: false,
      output: 'User authentication required to view reminders.',
      reminders: [],
    };
  }
  
  try {
    // Clean up past reminders first
    await cleanupPastReminders(userId);
    
    // Get active reminders
    const reminders = await getReminders(userId);
    
    if (reminders.length === 0) {
      return {
        success: true,
        output: 'You have no scheduled reminders.',
        reminders: [],
      };
    }
    
    // Format for display
    const lines = reminders.map((r, i) => {
      const date = new Date(r.scheduledDate);
      const formattedDate = date.toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
      return `${i + 1}. **${r.title}**\n   📅 ${formattedDate}\n   💬 ${r.message}\n   🔑 ID: \`${r.id}\``;
    });
    
    return {
      success: true,
      output: `You have ${reminders.length} scheduled reminder(s):\n\n${lines.join('\n\n')}`,
      reminders,
    };
  } catch (error) {
    console.error('[AGENTIC] Error viewing reminders:', error);
    return {
      success: false,
      output: `Error retrieving reminders: ${error.message}`,
      reminders: [],
    };
  }
}

/**
 * Execute set_reminder - schedule a new notification
 * Note: Backend stores reminder in Firestore, mobile schedules actual notification
 */
async function executeSetReminder(input, userId) {
  const { title, message, notificationTitle, notificationBody, scheduledDate } = input;
  
  if (!userId) {
    return {
      success: false,
      output: 'User authentication required to set reminders.',
    };
  }
  
  if (!title || !scheduledDate) {
    return {
      success: false,
      output: 'Missing required fields: title and scheduledDate are required.',
    };
  }
  
  // Validate date
  const triggerDate = new Date(scheduledDate);
  if (isNaN(triggerDate.getTime())) {
    return {
      success: false,
      output: `Invalid date format: "${scheduledDate}". Please use ISO 8601 format (e.g., 2026-01-15T09:00:00+07:00).`,
    };
  }
  
  if (triggerDate.getTime() <= Date.now()) {
    return {
      success: false,
      output: 'Scheduled date must be in the future.',
    };
  }
  
  try {
    // Use AI-provided notification title/body, fallback to reminder title/message
    const finalNotifTitle = notificationTitle || title;
    const finalNotifBody = notificationBody || message || title;
    
    // Generate reminder ID
    const reminderId = `reminder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Save to Firestore (mobile will sync and schedule actual notification)
    const reminder = {
      id: reminderId,
      userId,
      title,
      message: message || title,
      scheduledDate: triggerDate.toISOString(),
      notificationId: '', // Will be set by mobile when scheduling
      metadata: {
        notificationTitle: finalNotifTitle,
        notificationBody: finalNotifBody,
      },
    };
    
    await saveReminder(reminder);
    
    // Format date for display
    const formattedDate = triggerDate.toLocaleString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
    
    return {
      success: true,
      output: `✅ Reminder set successfully!\n\n**${title}**\n📅 ${formattedDate}${message ? `\n💬 ${message}` : ''}\n\n🔔 Notification: "${finalNotifTitle}"\n\nYou'll receive a notification at that time.`,
      reminder,
      // Flag for mobile to schedule notification
      needsLocalSchedule: true,
    };
  } catch (error) {
    console.error('[AGENTIC] Error setting reminder:', error);
    return {
      success: false,
      output: `Error setting reminder: ${error.message}`,
    };
  }
}


/**
 * Execute remove_reminder - cancel a scheduled reminder
 */
async function executeRemoveReminder(input, userId) {
  const { id } = input;
  
  if (!userId) {
    return {
      success: false,
      output: 'User authentication required to remove reminders.',
    };
  }
  
  if (!id) {
    return {
      success: false,
      output: 'Reminder ID is required. Use view_reminder to see available reminders.',
    };
  }
  
  try {
    // Get reminder to validate ownership
    const reminder = await getReminder(id, userId);
    
    if (!reminder) {
      return {
        success: false,
        output: `Reminder with ID "${id}" not found or doesn't belong to you.`,
      };
    }
    
    // Delete from Firestore
    await deleteReminder(id, userId);
    
    return {
      success: true,
      output: `🗑️ Reminder "${reminder.title}" has been permanently deleted.`,
      // Flag for mobile to cancel local notification
      needsLocalCancel: true,
      notificationId: reminder.notificationId,
    };
  } catch (error) {
    console.error('[AGENTIC] Error removing reminder:', error);
    return {
      success: false,
      output: `Error removing reminder: ${error.message}`,
    };
  }
}

/**
 * Execute complete_reminder - mark a reminder as done (does NOT delete)
 */
async function executeCompleteReminder(input, userId) {
  const { id } = input;
  
  if (!userId) {
    return {
      success: false,
      output: 'User authentication required to complete reminders.',
    };
  }
  
  if (!id) {
    return {
      success: false,
      output: 'Reminder ID is required. Use view_reminder to see available reminders.',
    };
  }
  
  try {
    // Get reminder to validate ownership
    const reminder = await getReminder(id, userId);
    
    if (!reminder) {
      return {
        success: false,
        output: `Reminder with ID "${id}" not found or doesn't belong to you.`,
      };
    }
    
    if (reminder.isCompleted) {
      return {
        success: true,
        output: `Reminder "${reminder.title}" is already marked as complete.`,
      };
    }
    
    // Mark as completed in Firestore
    await completeReminder(id, userId);
    
    return {
      success: true,
      output: `✅ Reminder "${reminder.title}" has been marked as complete!\n\nThe reminder is now in your completed history.`,
      // Flag for mobile to cancel local notification
      needsLocalCancel: true,
      notificationId: reminder.notificationId,
    };
  } catch (error) {
    console.error('[AGENTIC] Error completing reminder:', error);
    return {
      success: false,
      output: `Error completing reminder: ${error.message}`,
    };
  }
}

// ===================================================================
// DAYTONA SANDBOX EXECUTION
// ===================================================================

// Daytona SDK - loaded dynamically since it's ESM-only
let Daytona = null;
let daytonaSdkAvailable = null; // null = not checked, true/false = checked
let daytonaSdk = null;

/**
 * Check if Daytona SDK is available
 */
async function isDaytonaAvailable() {
  if (daytonaSdkAvailable !== null) return daytonaSdkAvailable;
  
  try {
    const sdk = await import('@daytonaio/sdk');
    Daytona = sdk.Daytona;
    daytonaSdkAvailable = true;
    console.log('[SANDBOX] Daytona SDK loaded successfully');
    return true;
  } catch (e) {
    console.warn('[SANDBOX] Daytona SDK not available:', e.message);
    daytonaSdkAvailable = false;
    return false;
  }
}

/**
 * Initialize Daytona SDK client
 */
async function getDaytonaClient() {
  if (daytonaSdk) return daytonaSdk;
  
  const available = await isDaytonaAvailable();
  if (!available) {
    throw new Error('Daytona SDK not installed. Run: npm install @daytonaio/sdk');
  }
  
  const apiKey = process.env.DAYTONA_API_KEY;
  const target = process.env.DAYTONA_TARGET || 'us';
  
  if (!apiKey) {
    throw new Error('DAYTONA_API_KEY not configured');
  }
  
  daytonaSdk = new Daytona({ apiKey, target });
  return daytonaSdk;
}

// ===================================================================
// SESSION SANDBOX MANAGEMENT
// ===================================================================

/**
 * Store active sandboxes per session
 * Key: sessionId
 * Value: { sandboxId, createdAt, lastUsedAt }
 */
const sessionSandboxes = new Map();

// Cleanup interval - check every 5 minutes
const SANDBOX_CLEANUP_INTERVAL = 5 * 60 * 1000;
// Delete sandbox after 1 hour of inactivity
const SANDBOX_TTL = 60 * 60 * 1000;
// Auto-stop sandbox after 15 min idle (Daytona-level)
const SANDBOX_AUTO_STOP = 15;

/**
 * Background cleanup - delete expired sandboxes
 */
setInterval(async () => {
  const now = Date.now();
  const expiredSessions = [];
  
  for (const [sessionId, data] of sessionSandboxes.entries()) {
    if (now - data.lastUsedAt > SANDBOX_TTL) {
      expiredSessions.push({ sessionId, sandboxId: data.sandboxId });
    }
  }
  
  if (expiredSessions.length > 0) {
    console.log(`[SANDBOX] Cleaning up ${expiredSessions.length} expired sandboxes`);
    
    for (const { sessionId, sandboxId } of expiredSessions) {
      try {
        const daytona = await getDaytonaClient();
        await daytona.delete(sandboxId);
        sessionSandboxes.delete(sessionId);
        console.log(`[SANDBOX] Deleted sandbox ${sandboxId} for session ${sessionId}`);
      } catch (e) {
        // Sandbox might already be deleted
        sessionSandboxes.delete(sessionId);
      }
    }
  }
}, SANDBOX_CLEANUP_INTERVAL);

/**
 * Get or create sandbox for session
 * @param {string} sessionId - Chat session ID
 * @returns {Promise<Sandbox>} Daytona sandbox instance
 */
async function getOrCreateSandbox(sessionId) {
  const now = Date.now();
  
  // Check if session has active sandbox
  if (sessionSandboxes.has(sessionId)) {
    const data = sessionSandboxes.get(sessionId);
    try {
      const daytona = await getDaytonaClient();
      const sandbox = await daytona.get(data.sandboxId);
      if (sandbox) {
        // Update last used time
        data.lastUsedAt = now;
        sessionSandboxes.set(sessionId, data);
        console.log(`[SANDBOX] Reusing sandbox ${data.sandboxId} for session ${sessionId}`);
        return sandbox;
      }
    } catch (e) {
      // Sandbox expired or deleted, create new one
      console.log(`[SANDBOX] Sandbox ${data.sandboxId} expired, creating new one`);
      sessionSandboxes.delete(sessionId);
    }
  }
  
  // Create new sandbox
  console.log(`[SANDBOX] Creating new sandbox for session ${sessionId}`);
  const daytona = await getDaytonaClient();
  const sandbox = await daytona.create({
    language: 'python', // Default, supports multi-lang
    autoStopInterval: SANDBOX_AUTO_STOP,
  });
  
  // Store sandbox mapping
  sessionSandboxes.set(sessionId, {
    sandboxId: sandbox.id,
    createdAt: now,
    lastUsedAt: now,
  });
  
  console.log(`[SANDBOX] Created sandbox ${sandbox.id} for session ${sessionId}`);
  return sandbox;
}

/**
 * Manually delete sandbox for session (e.g., when session is deleted)
 * @param {string} sessionId - Chat session ID
 */
async function deleteSandboxForSession(sessionId) {
  if (!sessionSandboxes.has(sessionId)) return;
  
  const data = sessionSandboxes.get(sessionId);
  try {
    const daytona = await getDaytonaClient();
    await daytona.delete(data.sandboxId);
    console.log(`[SANDBOX] Manually deleted sandbox ${data.sandboxId} for session ${sessionId}`);
  } catch (e) {
    console.log(`[SANDBOX] Failed to delete sandbox ${data.sandboxId}:`, e.message);
  }
  sessionSandboxes.delete(sessionId);
}

/**
 * Get sandbox stats (for monitoring)
 */
function getSandboxStats() {
  return {
    activeSandboxes: sessionSandboxes.size,
    sandboxes: Array.from(sessionSandboxes.entries()).map(([sessionId, data]) => ({
      sessionId,
      sandboxId: data.sandboxId,
      createdAt: new Date(data.createdAt).toISOString(),
      lastUsedAt: new Date(data.lastUsedAt).toISOString(),
      ageMinutes: Math.round((Date.now() - data.createdAt) / 60000),
      idleMinutes: Math.round((Date.now() - data.lastUsedAt) / 60000),
    })),
  };
}

/**
 * Execute run_code tool - run code in sandbox
 * Uses Daytona SDK's codeRun for direct code execution
 * @param {Object} input - Tool input (language, code)
 * @param {string} sessionId - Chat session ID for sandbox isolation
 */
async function executeRunCode(input, sessionId) {
  const { language, code } = input;
  
  if (!code) {
    return { success: false, output: 'No code provided to execute.' };
  }
  
  if (!process.env.DAYTONA_API_KEY) {
    return { 
      success: false, 
      output: 'Code execution is not available. DAYTONA_API_KEY not configured.' 
    };
  }
  
  try {
    const sandbox = await getOrCreateSandbox(sessionId || 'anonymous');
    
    // Use codeRun API for direct code execution
    console.log(`[SANDBOX] Running ${language} code (${code.length} chars)...`);
    const result = await sandbox.process.codeRun(code, {
      timeout: 60, // 60 second timeout
    });
    
    // Debug: log raw result from Daytona
    console.log('[SANDBOX] codeRun raw result:', JSON.stringify(result, null, 2));
    
    // Format output - check all possible fields from Daytona SDK
    let output = '';
    // Daytona SDK may return: result, output, stdout, logs, text, etc.
    if (result.result !== undefined && result.result !== null && result.result !== '') {
      output = String(result.result);
    } else if (result.output !== undefined && result.output !== null && result.output !== '') {
      output = String(result.output);
    } else if (result.stdout !== undefined && result.stdout !== null && result.stdout !== '') {
      output = String(result.stdout);
    } else if (result.logs !== undefined && result.logs !== null && result.logs !== '') {
      output = String(result.logs);
    } else if (result.text !== undefined && result.text !== null && result.text !== '') {
      output = String(result.text);
    }
    
    // Add stderr if present
    const stderr = result.stderr || result.error || result.errors;
    if (stderr) {
      output += (output ? '\n\nStderr:\n' : 'Stderr:\n') + String(stderr);
    }
    
    // If still no output, stringify the whole result
    if (!output) {
      // Maybe the entire result object IS the output
      if (typeof result === 'string') {
        output = result;
      } else if (result && Object.keys(result).length > 0) {
        output = JSON.stringify(result, null, 2);
      } else {
        output = '(No output)';
      }
    }
    
    // Add exit code info if non-zero
    const exitCode = result.exitCode ?? result.code ?? result.exit_code ?? 0;
    if (exitCode !== 0) {
      output += `\n\n[Exit code: ${exitCode}]`;
    }
    
    console.log(`[SANDBOX] Final output (${output.length} chars): ${output.substring(0, 200)}...`);
    
    return {
      success: exitCode === 0,
      output: output.trim(),
      data: {
        exitCode,
        language,
        sandboxId: sandbox.id,
      },
    };
  } catch (error) {
    console.error('[AGENTIC] Daytona run_code error:', error);
    return {
      success: false,
      output: `Code execution failed: ${error.message}`,
    };
  }
}

/**
 * Execute run_command tool - run shell command in sandbox
 * @param {Object} input - Tool input (command)
 * @param {string} sessionId - Chat session ID for sandbox isolation
 */
async function executeRunCommand(input, sessionId) {
  const { command } = input;
  
  if (!command) {
    return { success: false, output: 'No command provided to execute.' };
  }
  
  if (!process.env.DAYTONA_API_KEY) {
    return { 
      success: false, 
      output: 'Command execution is not available. DAYTONA_API_KEY not configured.' 
    };
  }
  
  try {
    const sandbox = await getOrCreateSandbox(sessionId || 'anonymous');
    
    // Execute command using executeCommand API
    console.log(`[SANDBOX] Running command: ${command}`);
    const result = await sandbox.process.executeCommand(command, {
      timeout: 120, // 2 minute timeout for installs (in seconds)
    });
    
    // Debug: log raw result from Daytona
    console.log('[SANDBOX] executeCommand raw result:', JSON.stringify(result, null, 2));
    
    // Format output - check all possible fields from Daytona SDK
    let output = '';
    // Daytona SDK may return: result, output, stdout, logs, text, etc.
    if (result.result !== undefined && result.result !== null && result.result !== '') {
      output = String(result.result);
    } else if (result.output !== undefined && result.output !== null && result.output !== '') {
      output = String(result.output);
    } else if (result.stdout !== undefined && result.stdout !== null && result.stdout !== '') {
      output = String(result.stdout);
    } else if (result.logs !== undefined && result.logs !== null && result.logs !== '') {
      output = String(result.logs);
    } else if (result.text !== undefined && result.text !== null && result.text !== '') {
      output = String(result.text);
    }
    
    // Add stderr if present
    const stderr = result.stderr || result.error || result.errors;
    if (stderr) {
      output += (output ? '\n\nStderr:\n' : 'Stderr:\n') + String(stderr);
    }
    
    // If still no output, stringify the whole result
    if (!output) {
      // Maybe the entire result object IS the output
      if (typeof result === 'string') {
        output = result;
      } else if (result && Object.keys(result).length > 0) {
        output = JSON.stringify(result, null, 2);
      } else {
        output = '(No output)';
      }
    }
    
    // Add exit code info if non-zero
    const exitCode = result.exitCode ?? result.code ?? result.exit_code ?? 0;
    if (exitCode !== 0) {
      output += `\n\n[Exit code: ${exitCode}]`;
    }
    
    console.log(`[SANDBOX] Final command output (${output.length} chars): ${output.substring(0, 200)}...`);
    
    return {
      success: exitCode === 0,
      output: output.trim(),
      data: {
        exitCode,
        command,
        sandboxId: sandbox.id,
      },
    };
  } catch (error) {
    console.error('[AGENTIC] Daytona run_command error:', error);
    return {
      success: false,
      output: `Command execution failed: ${error.message}`,
    };
  }
}

// Helper to generate default commentary for tool calls
function getDefaultCommentary(toolName, input) {
  if (toolName === 'web_search' && input.queries) {
    return `Searching: ${input.queries[0] || '...'}`;
  }
  if (toolName === 'generate_image' && input.prompt) {
    return `Generating: ${input.prompt.slice(0, 50)}...`;
  }
  if (toolName === 'list_attachments') {
    return 'Checking available files...';
  }
  if (toolName === 'reattach_file' && input.filename) {
    return `Recalling: ${input.filename}`;
  }
  if (toolName === 'view_reminder') {
    return 'Checking your reminders...';
  }
  if (toolName === 'set_reminder' && input.title) {
    return `Setting reminder: ${input.title}`;
  }
  if (toolName === 'complete_reminder') {
    return 'Marking reminder as complete...';
  }
  if (toolName === 'remove_reminder') {
    return 'Removing reminder...';
  }
  if (toolName === 'run_code' && input.language) {
    return `Running ${input.language} code...`;
  }
  if (toolName === 'run_command' && input.command) {
    return `Executing: ${input.command.slice(0, 40)}...`;
  }
  return `Executing ${toolName || 'tool'}...`;
}

// ===================================================================
// AGENTIC CHAT HANDLERS
// ===================================================================

const { trackRequest } = require('../services/analytics');

const MAX_ITERATIONS = 10;

/**
 * POST /api/agentic
 * 
 * Body: { model, messages, stream?, temperature?, max_tokens?, sessionAttachments?, sessionId? }
 */
router.post('/', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { model, messages, stream = true, temperature, max_tokens, sessionAttachments = [], sessionId } = req.body;
    
    if (!model) {
      return res.status(400).json({ error: 'Model is required', code: 'MISSING_MODEL' });
    }
    
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required', code: 'MISSING_MESSAGES' });
    }
    
    const config = getModelConfig(model);
    if (!config) {
      return res.status(400).json({ 
        error: `Model "${model}" is not available on Clustrix Cloud`, 
        code: 'MODEL_NOT_AVAILABLE' 
      });
    }
    
    console.log(`[AGENTIC] User ${req.user.email} requesting ${model} (${config.provider})`);
    
    // Check provider token limit BEFORE making request
    const providerLimitError = checkProviderTokenLimit(req.user.uid, config.provider);
    if (providerLimitError) {
      return res.status(429).json(providerLimitError);
    }
    
    // Search config from env
    const searchConfig = {
      tavilyApiKey: process.env.TAVILY_API_KEY,
      serpApiKey: process.env.SERP_API_KEY,
      googleApiKey: process.env.GOOGLE_SEARCH_API_KEY,
      googleCseId: process.env.GOOGLE_CSE_ID,
    };
    
    // Check if search is configured
    if (!searchConfig.tavilyApiKey && !searchConfig.serpApiKey && !(searchConfig.googleApiKey && searchConfig.googleCseId)) {
      return res.status(400).json({
        error: 'Web search not configured. Set TAVILY_API_KEY, SERP_API_KEY, or GOOGLE_SEARCH_API_KEY + GOOGLE_CSE_ID',
        code: 'SEARCH_NOT_CONFIGURED',
      });
    }
    
    // Setup streaming
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx/proxy buffering
      res.flushHeaders(); // Send headers immediately
    }
    
    // Build tools system prompt for code execution
    const toolsSystemPrompt = `
## CODE EXECUTION TOOLS:
You have access to run_code and run_command tools to execute code in a secure cloud sandbox.

### run_code tool:
- Execute code snippets in isolated sandbox
- Supported: python, javascript, typescript, bash, ruby, go, rust, java, php
- Use when user asks to run, execute, test, or see output from code
- Returns stdout, stderr, exit code

### run_command tool:
- Execute shell commands (pip install, npm install, ls, etc.)
- Use to install packages before running code that needs them

### Usage:
- User says "run this python code" → call run_code with language="python"
- User needs pandas → call run_command "pip install pandas" first
- Always show execution output to user
`;

    // Inject tools prompt into system message
    let conversationMessages = messages.map((m, i) => {
      if (i === 0 && m.role === 'system') {
        return { ...m, content: m.content + '\n\n' + toolsSystemPrompt };
      }
      return m;
    });
    
    // If no system message, prepend one
    if (!messages[0] || messages[0].role !== 'system') {
      conversationMessages = [{ role: 'system', content: toolsSystemPrompt.trim() }, ...messages];
    }
    
    let totalInputTokens = Math.ceil(JSON.stringify(conversationMessages).length / 4);
    let totalOutputTokens = 0;
    let fullContent = '';
    
    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      let response;
      
      switch (config.provider) {
        case 'gemini':
        case 'google':
          response = await callGeminiWithTools(config, conversationMessages, { temperature, max_tokens }, stream ? res : null);
          break;
        case 'anthropic':
          response = await callClaudeWithTools(config, conversationMessages, { temperature, max_tokens }, stream ? res : null);
          break;
        default:
          response = await callOpenAIWithTools(config, conversationMessages, { temperature, max_tokens }, stream ? res : null);
          break;
      }
      
      const assistantMessage = response.message;
      conversationMessages.push(assistantMessage);
      
      // Accumulate tokens
      if (response.usage) {
        totalInputTokens += response.usage.prompt_tokens || response.usage.input_tokens || 0;
        totalOutputTokens += response.usage.completion_tokens || response.usage.output_tokens || 0;
      } else {
        // Estimate if no usage data
        totalOutputTokens += Math.ceil((assistantMessage.content || '').length / 4);
      }
      fullContent += assistantMessage.content || '';
      
      // NOTE: Content is already streamed in real-time inside callXXXWithTools functions
      
      // Check if done (no tool calls)
      if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
        // Track success
        trackRequest({
          userId: req.user?.uid,
          userEmail: req.user?.email,
          deviceName: req.headers['x-device-name'],
          model: config.modelId,
          provider: config.provider,
          messages,
          responsePreview: fullContent,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          duration: Date.now() - startTime,
          success: true,
          mode: 'agentic',
        });
        
        // Track provider token usage for rate limiting
        trackProviderTokens(req.user?.uid, config.provider, totalInputTokens + totalOutputTokens);
        
        if (stream) {
          // Send usage event before [DONE] so frontend can display token count + cost
          const cost = calculateCost(config.modelId, totalInputTokens, totalOutputTokens);
          res.write(`data: ${JSON.stringify({ 
            usage: { 
              prompt_tokens: totalInputTokens, 
              completion_tokens: totalOutputTokens,
              total_tokens: totalInputTokens + totalOutputTokens,
              cost: cost,
            } 
          })}\n\n`);
          res.write('data: [DONE]\n\n');
          res.end();
        } else {
          res.json({ choices: [{ message: assistantMessage }], usage: response.usage });
        }
        return;
      }
      
      // Execute tool calls
      for (const toolCall of assistantMessage.tool_calls) {
        let input = {};
        try { input = JSON.parse(toolCall.function?.arguments || '{}'); } catch {}
        
        const toolName = toolCall.function?.name;
        const commentary = input.commentary || getDefaultCommentary(toolName, input);
        
        // Internal tools that don't show full output in UI
        const isInternalTool = ['list_attachments', 'reattach_file'].includes(toolName);
        
        // 1. Stream COMMAND INPUT tag for ALL tools (creates CommandBlock in UI)
        if (stream) {
          const inputPayload = JSON.stringify({
            command: toolName,
            args: input,
            commentary: commentary,
          });
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: `<!--command-input-->${inputPayload}<!--/command-input-->` } }] })}\n\n`);
        }
        
        // Execute the appropriate tool
        let result;
        if (toolName === 'web_search') {
          result = await executeWebSearch(input, searchConfig);
        } else if (toolName === 'list_attachments') {
          result = executeListAttachments(input, sessionAttachments);
        } else if (toolName === 'reattach_file') {
          result = await executeReattachFile(input, sessionAttachments, req.user?.uid);
        } else if (toolName === 'view_reminder') {
          result = await executeViewReminder(input, req.user?.uid);
        } else if (toolName === 'set_reminder') {
          result = await executeSetReminder(input, req.user?.uid);
        } else if (toolName === 'complete_reminder') {
          result = await executeCompleteReminder(input, req.user?.uid);
        } else if (toolName === 'remove_reminder') {
          result = await executeRemoveReminder(input, req.user?.uid);
        } else if (toolName === 'run_code') {
          result = await executeRunCode(input, sessionId);
        } else if (toolName === 'run_command') {
          result = await executeRunCommand(input, sessionId);
        } else {
          result = { success: false, output: `Unknown tool: ${toolName}` };
        }
        
        // Ensure result has output string
        if (!result) {
          result = { success: false, output: 'Tool returned no result' };
        }
        if (typeof result.output !== 'string') {
          result.output = result.output ? JSON.stringify(result.output) : '(No output)';
        }
        
        // Track tool result tokens
        totalInputTokens += Math.ceil((result.output || '').length / 4);
        
        // 2. Stream COMMAND OUTPUT tag for ALL tools (marks CommandBlock as complete)
        if (stream) {
          const outputPayload = JSON.stringify({
            success: result.success,
            output: result.output,
          });
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: `<!--command-output-->${outputPayload}<!--/command-output-->` } }] })}\n\n`);
        }
        
        // 3. Send tool_result event for ALL tools to trigger "thinking" loader on client
        // Mobile hides internal tools in UI but needs the event to set isWaitingForIteration(true)
        if (stream) {
          res.write(`data: ${JSON.stringify({ 
            tool_result: { 
              id: toolCall.id,
              name: toolName,
              input: input,
              success: result.success,
              output: result.output,
              // Flatten data for mobile UI - result.data contains { results } for web_search
              // Mobile expects result.data.results, so pass result.data directly (not nested)
              data: result.data || { output: result.output },
            } 
          })}\n\n`);
        }
        
        // Add result to conversation
        conversationMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          name: toolName,
          content: result.output,
        });
      }
    }
    
    // Max iterations reached - still track as success (just limited)
    trackRequest({
      userId: req.user?.uid,
      userEmail: req.user?.email,
      deviceName: req.headers['x-device-name'],
      model: config.modelId,
      provider: config.provider,
      messages,
      responsePreview: fullContent + ' [MAX_ITERATIONS]',
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      duration: Date.now() - startTime,
      success: true,
      mode: 'agentic',
    });
    
    // Track provider token usage for rate limiting (even on max iterations)
    trackProviderTokens(req.user?.uid, config.provider, totalInputTokens + totalOutputTokens);
    
    if (stream) {
      // Send usage event before [DONE]
      res.write(`data: ${JSON.stringify({ 
        usage: { 
          prompt_tokens: totalInputTokens, 
          completion_tokens: totalOutputTokens,
          total_tokens: totalInputTokens + totalOutputTokens,
        } 
      })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    } else {
      res.json({ error: 'Max iterations reached', code: 'MAX_ITERATIONS' });
    }
    
  } catch (err) {
    console.error('[AGENTIC ERROR]', err);
    
    // Track error
    trackRequest({
      userId: req.user?.uid,
      userEmail: req.user?.email,
      deviceName: req.headers['x-device-name'],
      model: req.body?.model || 'unknown',
      provider: 'unknown',
      messages: req.body?.messages || [],
      responsePreview: err.message,
      duration: Date.now() - startTime,
      success: false,
      errorMessage: err.message,
      mode: 'agentic',
    });
    
    if (!res.headersSent) {
      res.status(500).json({ error: err.message, code: 'AGENTIC_ERROR' });
    } else {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
  }
});

// ===================================================================
// PROVIDER-SPECIFIC TOOL CALLING
// ===================================================================

async function callOpenAIWithTools(config, messages, options, res) {
  const url = `${config.baseUrl}/chat/completions`;
  
  const body = {
    model: config.modelId,
    messages,
    tools: OPENAI_TOOLS,
    tool_choice: 'auto',
    stream: true,
    stream_options: { include_usage: true },
  };
  
  if (options.temperature !== undefined) body.temperature = options.temperature;
  if (options.max_tokens !== undefined) body.max_tokens = options.max_tokens;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`${config.provider} API error: ${error}`);
  }
  
  // Stream and accumulate like mobile
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullContent = '';
  let toolCallsMap = {};  // Track by index for proper accumulation
  let usageData = null;
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    
    // Split by newline, keep incomplete line in buffer
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data:')) continue;
      
      const jsonStr = trimmed.slice(5).trim();  // Remove 'data:' prefix
      if (!jsonStr || jsonStr === '[DONE]') continue;
      
      try {
        const data = JSON.parse(jsonStr);
        const delta = data.choices?.[0]?.delta;
        
        // Stream content real-time
        if (delta?.content) {
          fullContent += delta.content;
          res?.write(`data: ${JSON.stringify({ choices: [{ delta: { content: delta.content } }] })}\n\n`);
        }
        
        // Stream thinking/reasoning
        const reasoning = delta?.reasoning_content || delta?.reasoning || delta?.thoughts;
        if (reasoning) {
          res?.write(`data: ${JSON.stringify({ choices: [{ delta: { thoughts: reasoning, thinking: reasoning } }] })}\n\n`);
        }
        
        // Accumulate tool calls - like mobile state machine
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            
            // Initialize if not exists
            if (!toolCallsMap[idx]) {
              toolCallsMap[idx] = { 
                id: '', 
                type: 'function', 
                function: { name: '', arguments: '' } 
              };
            }
            
            // ID only comes once, don't append
            if (tc.id) toolCallsMap[idx].id = tc.id;
            // Name and arguments come in chunks, append!
            if (tc.function?.name) toolCallsMap[idx].function.name += tc.function.name;
            if (tc.function?.arguments) toolCallsMap[idx].function.arguments += tc.function.arguments;
          }
        }
        
        // Capture usage
        if (data.usage) {
          usageData = data.usage;
        }
      } catch (e) {
        // Ignore parse errors - incomplete JSON in buffer
      }
    }
  }
  
  // Convert map to array, filter empty
  const toolCalls = Object.values(toolCallsMap).filter(tc => tc.id && tc.function.name);
  
  return {
    message: {
      role: 'assistant',
      content: fullContent,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    },
    usage: usageData,
  };
}

async function callClaudeWithTools(config, messages, options, res) {
  const url = `${config.baseUrl}/messages`;
  
  // Convert messages to Claude format
  let systemPrompt = '';
  const claudeMessages = [];
  
  for (const m of messages) {
    if (m.role === 'system') {
      systemPrompt = m.content;
    } else if (m.role === 'tool') {
      claudeMessages.push({
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: m.tool_call_id,
          content: m.content,
        }],
      });
    } else if (m.role === 'assistant' && m.tool_calls) {
      const content = [];
      if (m.content) content.push({ type: 'text', text: m.content });
      for (const tc of m.tool_calls) {
        let input = {};
        try { input = JSON.parse(tc.function?.arguments || '{}'); } catch {}
        content.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.function?.name,
          input,
        });
      }
      claudeMessages.push({ role: 'assistant', content });
    } else {
      claudeMessages.push({ role: m.role, content: m.content });
    }
  }
  
  const body = {
    model: config.modelId,
    max_tokens: options.max_tokens || 4096,
    system: systemPrompt,
    messages: claudeMessages,
    tools: CLAUDE_TOOLS,
    stream: true,
  };
  
  if (options.temperature !== undefined) body.temperature = options.temperature;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${error}`);
  }
  
  // Stream and accumulate like mobile - Claude uses event types
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  
  // State machine like mobile
  const fullResponse = { content: [], usage: {} };
  let currentBlock = null;
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      
      const jsonStr = trimmed.slice(5).trim();
      if (!jsonStr) continue;
      
      try {
        const event = JSON.parse(jsonStr);
        
        switch (event.type) {
          case 'content_block_start':
            currentBlock = { ...event.content_block };
            if (currentBlock.type === 'text') currentBlock.text = '';
            if (currentBlock.type === 'tool_use') currentBlock.input = '';
            break;
            
          case 'content_block_delta':
            if (event.delta?.type === 'text_delta' && currentBlock?.type === 'text') {
              const text = event.delta.text || '';
              currentBlock.text += text;
              // Stream real-time!
              if (text && res) {
                res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`);
              }
            } else if (event.delta?.type === 'input_json_delta' && currentBlock?.type === 'tool_use') {
              currentBlock.input += event.delta.partial_json || '';
            } else if (event.delta?.type === 'thinking_delta' && res) {
              const thinking = event.delta.thinking || '';
              res.write(`data: ${JSON.stringify({ choices: [{ delta: { thoughts: thinking, thinking: thinking } }] })}\n\n`);
            }
            break;
            
          case 'content_block_stop':
            if (currentBlock) {
              if (currentBlock.type === 'tool_use' && typeof currentBlock.input === 'string') {
                try { currentBlock.input = JSON.parse(currentBlock.input || '{}'); } catch { currentBlock.input = {}; }
              }
              fullResponse.content.push(currentBlock);
            }
            currentBlock = null;
            break;
            
          case 'message_delta':
            if (event.usage) fullResponse.usage = event.usage;
            break;
        }
      } catch (e) {
        // Ignore parse errors
      }
    }
  }
  
  // Convert to OpenAI format
  const toolCalls = fullResponse.content
    .filter(c => c.type === 'tool_use')
    .map(c => ({
      id: c.id,
      type: 'function',
      function: { name: c.name, arguments: JSON.stringify(c.input || {}) },
    }));
  
  const textContent = fullResponse.content
    .filter(c => c.type === 'text')
    .map(c => c.text)
    .join('');
  
  return {
    message: {
      role: 'assistant',
      content: textContent,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    },
    usage: fullResponse.usage,
  };
}

async function callGeminiWithTools(config, messages, options, res) {
  // Build contents in Gemini format
  let systemInstruction = '';
  const contents = [];
  
  for (const m of messages) {
    if (m.role === 'system') {
      systemInstruction = m.content;
    } else if (m.role === 'tool') {
      contents.push({
        role: 'function',
        parts: [{
          functionResponse: {
            name: m.name || 'web_search',
            response: { result: m.content },
          },
        }],
      });
    } else if (m.role === 'assistant' && m.tool_calls) {
      const parts = [];
      if (m.content) parts.push({ text: m.content });
      for (const tc of m.tool_calls) {
        let args = {};
        try { args = JSON.parse(tc.function?.arguments || '{}'); } catch {}
        
        // Include thoughtSignature if present (required for Gemini 3)
        const part = { functionCall: { name: tc.function?.name, args } };
        if (tc._geminiThoughtSignature) {
          part.thoughtSignature = tc._geminiThoughtSignature;
        }
        parts.push(part);
      }
      contents.push({ role: 'model', parts });
    } else {
      contents.push({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      });
    }
  }
  
  // Use streaming endpoint like mobile
  const url = `${config.baseUrl}/models/${config.modelId}:streamGenerateContent?key=${config.apiKey}&alt=sse`;
  const body = {
    contents,
    tools: [WEB_SEARCH_TOOL_GEMINI],
    systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
    generationConfig: {
      temperature: options.temperature,
      maxOutputTokens: options.max_tokens,
    },
  };
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${error}`);
  }
  
  // Stream and accumulate like mobile
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullContent = '';
  const functionCalls = [];
  let usageData = null;
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      
      const jsonStr = trimmed.slice(5).trim();
      if (!jsonStr) continue;
      
      try {
        const data = JSON.parse(jsonStr);
        const parts = data.candidates?.[0]?.content?.parts || [];
        
        for (const part of parts) {
          // Stream text content real-time
          if (part.text) {
            // Check for native thinking (Gemini 2.5)
            if (part.thought === true) {
              res?.write(`data: ${JSON.stringify({ choices: [{ delta: { thoughts: part.text, thinking: part.text } }] })}\n\n`);
            } else {
              fullContent += part.text;
              res?.write(`data: ${JSON.stringify({ choices: [{ delta: { content: part.text } }] })}\n\n`);
            }
          }
          
          // Accumulate function calls
          if (part.functionCall) {
            functionCalls.push({
              functionCall: part.functionCall,
              thoughtSignature: part.thoughtSignature || null, // Capture thoughtSignature for Gemini 3
            });
          }
        }
        
        // Capture usage
        if (data.usageMetadata) {
          usageData = data.usageMetadata;
        }
      } catch (e) {
        // Ignore parse errors
      }
    }
  }
  
  const toolCalls = functionCalls.map((fc, i) => ({
    id: `gemini_${Date.now()}_${i}`,
    type: 'function',
    function: {
      name: fc.functionCall.name,
      arguments: JSON.stringify(fc.functionCall.args || {}),
    },
    _geminiThoughtSignature: fc.thoughtSignature, // Persist for next turn
  }));
  
  return {
    message: {
      role: 'assistant',
      content: fullContent,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    },
    usage: usageData,
  };
}

// Export router and sandbox utilities
module.exports = router;
module.exports.deleteSandboxForSession = deleteSandboxForSession;
module.exports.getSandboxStats = getSandboxStats;
