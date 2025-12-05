/**
 * Context Manager - Handles conversation history with auto-summarization
 * 
 * Flow:
 * - iteration 1-N: normal history loading
 * - iteration N (hits 60% limit): trigger summarize, show UI indicator
 * - iteration N+1: send summary + new messages after summary
 * - iteration NZ (hits limit again): re-summarize (old summary + new messages)
 */

const https = require('https');
const { log: appLog } = require('../../utils/logger');

function log(level, fn, msg, details = {}) {
  appLog('CONTEXT', level, fn, msg, details);
}

// Token estimation (rough: 1 token ≈ 3.5 chars)
function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 3.5);
}

function estimateMessageTokens(message) {
  let tokens = 0;
  if (typeof message.content === 'string') {
    tokens += estimateTokens(message.content);
  } else if (Array.isArray(message.content)) {
    for (const block of message.content) {
      if (block.type === 'text') tokens += estimateTokens(block.text);
      else tokens += estimateTokens(JSON.stringify(block));
    }
  }
  return tokens + 10; // overhead
}

function estimateHistoryTokens(messages) {
  return messages.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0);
}

// Context limits per model
const CONTEXT_LIMITS = {
  'claude': 180000,
  'gpt-4': 120000,
  'gpt-4o': 120000,
  'gemini': 900000,
  'default': 100000
};

const TARGET_CONTEXT_RATIO = 0.6; // Use 60% for history

function getContextLimit(model) {
  const m = (model || '').toLowerCase();
  if (m.includes('claude')) return CONTEXT_LIMITS.claude;
  if (m.includes('gpt-4o')) return CONTEXT_LIMITS['gpt-4o'];
  if (m.includes('gpt-4')) return CONTEXT_LIMITS['gpt-4'];
  if (m.includes('gemini')) return CONTEXT_LIMITS.gemini;
  return CONTEXT_LIMITS.default;
}

function getTargetHistoryTokens(model) {
  return Math.floor(getContextLimit(model) * TARGET_CONTEXT_RATIO);
}

// Summarization prompt
const SUMMARIZE_SYSTEM_PROMPT = `You are Clustrix Context Summarizer. Create a comprehensive but concise summary of this coding conversation.

RULES:
1. Preserve ALL technical details: file names, function names, line numbers, errors
2. Track what was accomplished and what's pending
3. Note user preferences and constraints
4. Include key decisions and rationale
5. Maximum 10 paragraphs, be thorough but concise
6. Use bullet points for lists
7. Past tense for completed, present for ongoing

FORMAT:
## Conversation Summary

### Goal
[What user is trying to accomplish]

### Completed
[List of completed tasks]

### Current State
[Where things stand]

### Key Files
[Important files mentioned/modified]

### Pending
[What still needs to be done]

### Notes
[Constraints, preferences, decisions]`;

/**
 * Check if current history exceeds token limit
 * Only triggers if we have more than 2 messages (to avoid infinite loop after summarize)
 */
function checkNeedsSummarization(messages, model) {
  const targetTokens = getTargetHistoryTokens(model);
  const currentTokens = estimateHistoryTokens(messages);
  
  // Don't trigger summarization if we only have 1-2 messages
  // (this happens right after a summarization reset)
  const minMessagesForSummarize = 3;
  
  return {
    needsSummarization: currentTokens > targetTokens && messages.length >= minMessagesForSummarize,
    currentTokens,
    targetTokens,
    overBy: currentTokens - targetTokens,
    messageCount: messages.length
  };
}

/**
 * Generate summary - called during iteration when limit hit
 */
async function generateSummary(contentToSummarize, apiConfig, onChunk = null) {
  const { baseUrl, apiKey, model, provider } = apiConfig;
  
  // Send UI indicator - start
  if (onChunk) {
    onChunk('<!--command-input-->\nSummarizing conversation history...\n<!--/command-input-->\n', { type: 'command' });
  }
  
  log(1, 'generateSummary', 'Starting summarization', { 
    contentLength: contentToSummarize.length 
  });
  
  try {
    let summary;
    
    if (provider === 'anthropic' || model?.includes('claude')) {
      summary = await summarizeWithClaude(baseUrl, apiKey, model, contentToSummarize);
    } else if (provider === 'openai' || model?.includes('gpt')) {
      summary = await summarizeWithOpenAI(baseUrl, apiKey, model, contentToSummarize);
    } else if (provider === 'google' || model?.includes('gemini')) {
      summary = await summarizeWithGemini(apiKey, model, contentToSummarize);
    } else {
      summary = await summarizeWithOpenAI(baseUrl, apiKey, model, contentToSummarize);
    }
    
    // Truncate summary if too long (max ~15000 tokens = ~50000 chars)
    const MAX_SUMMARY_CHARS = 50000;
    if (summary.length > MAX_SUMMARY_CHARS) {
      summary = summary.slice(0, MAX_SUMMARY_CHARS) + '\n\n[Summary truncated due to length]';
      log(2, 'generateSummary', 'Summary truncated', { originalLength: summary.length });
    }
    
    // Send UI indicator - success
    if (onChunk) {
      onChunk('<!--command-output-->\n[Success] Conversation history has been summarized.\n<!--/command-output-->\n', { type: 'command' });
    }
    
    log(1, 'generateSummary', 'Summary generated', { 
      summaryLength: summary.length,
      summaryTokens: estimateTokens(summary)
    });
    
    return summary;
  } catch (error) {
    log(3, 'generateSummary', 'Failed', { error: error.message });
    
    if (onChunk) {
      onChunk(`<!--command-output-->\n[Warning] Summarization failed: ${error.message}\n<!--/command-output-->\n`, { type: 'command' });
    }
    
    return null;
  }
}

async function summarizeWithClaude(baseUrl, apiKey, model, content) {
  const url = new URL(baseUrl || 'https://api.anthropic.com');
  
  const body = JSON.stringify({
    model: model || 'claude-3-5-sonnet-20241022',
    max_tokens: 2000,
    system: SUMMARIZE_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `Summarize this conversation:\n\n${content}` }]
  });
  
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: url.hostname,
      port: url.port || 443,
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.content?.[0]?.text) resolve(json.content[0].text);
          else reject(new Error(json.error?.message || 'Invalid response'));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function summarizeWithOpenAI(baseUrl, apiKey, model, content) {
  const url = new URL(baseUrl || 'https://api.openai.com');
  
  const body = JSON.stringify({
    model: model || 'gpt-4o-mini',
    max_tokens: 2000,
    messages: [
      { role: 'system', content: SUMMARIZE_SYSTEM_PROMPT },
      { role: 'user', content: `Summarize this conversation:\n\n${content}` }
    ]
  });
  
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: url.hostname,
      port: url.port || 443,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.choices?.[0]?.message?.content) resolve(json.choices[0].message.content);
          else reject(new Error(json.error?.message || 'Invalid response'));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function summarizeWithGemini(apiKey, model, content) {
  const modelName = model || 'gemini-1.5-flash';
  
  const body = JSON.stringify({
    contents: [{ parts: [{ text: SUMMARIZE_SYSTEM_PROMPT + '\n\n' + `Summarize this conversation:\n\n${content}` }] }],
    generationConfig: { maxOutputTokens: 2000 }
  });
  
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'generativelanguage.googleapis.com',
      port: 443,
      path: `/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.candidates?.[0]?.content?.parts?.[0]?.text) {
            resolve(json.candidates[0].content.parts[0].text);
          } else reject(new Error('Invalid response'));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * Build conversation text for summarization
 */
function buildConversationText(messages, existingSummary = null) {
  let text = '';
  
  if (existingSummary) {
    text += `[PREVIOUS SUMMARY]\n${existingSummary}\n\n[NEW MESSAGES SINCE SUMMARY]\n`;
  }
  
  for (const msg of messages) {
    const role = msg.role === 'user' ? 'USER' : 'ASSISTANT';
    let content = '';
    
    if (typeof msg.content === 'string') {
      content = msg.content;
    } else if (Array.isArray(msg.content)) {
      content = msg.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
    }
    
    // Truncate very long messages
    if (content.length > 3000) {
      content = content.slice(0, 3000) + '\n[... truncated ...]';
    }
    
    text += `--- ${role} ---\n${content}\n\n`;
  }
  
  return text;
}

/**
 * Load history with summary support
 * Returns messages to send + info about summarization state
 */
function loadHistoryWithSummary(sessionId, db, model) {
  if (!db || !sessionId) {
    return { messages: [], summary: null, summarizedUntilIndex: -1 };
  }
  
  const dbMessages = db.getMessages?.(sessionId) || [];
  const latestSummary = db.getLatestSummary?.(sessionId);
  
  let summary = null;
  let summarizedUntilIndex = -1;
  let messagesToLoad = [];
  
  if (latestSummary) {
    summary = latestSummary.summary_text;
    summarizedUntilIndex = latestSummary.summarized_until_index;
    
    // Load only messages AFTER the summarized index
    messagesToLoad = dbMessages.filter(m => m.message_index > summarizedUntilIndex);
    
    log(1, 'loadHistoryWithSummary', 'Using existing summary', {
      summarizedUntil: summarizedUntilIndex,
      newMessagesCount: messagesToLoad.length
    });
  } else {
    // No summary - load all (but we'll check limit later)
    messagesToLoad = [...dbMessages];
  }
  
  // Build conversation pairs
  const messages = [];
  const userMsgs = messagesToLoad.filter(m => m.role === 'user');
  
  for (const userMsg of userMsgs) {
    messages.push({ role: 'user', content: userMsg.content, messageIndex: userMsg.message_index });
    
    const assistantMsg = messagesToLoad.find(m => m.role === 'assistant' && m.message_index === userMsg.message_index + 1);
    if (assistantMsg) {
      messages.push({ role: 'assistant', content: assistantMsg.content, messageIndex: assistantMsg.message_index });
    }
  }
  
  return { messages, summary, summarizedUntilIndex };
}

/**
 * Perform summarization and save to DB
 */
async function performSummarization(sessionId, db, messages, existingSummary, summarizedUntilIndex, apiConfig, onChunk) {
  // Build content to summarize
  const contentToSummarize = buildConversationText(messages, existingSummary);
  
  // Generate summary
  const newSummary = await generateSummary(contentToSummarize, apiConfig, onChunk);
  
  if (!newSummary) {
    return { success: false, summary: existingSummary };
  }
  
  // Find the last message index we're summarizing
  const lastMsgIndex = messages.length > 0 
    ? Math.max(...messages.map(m => m.messageIndex || 0))
    : summarizedUntilIndex;
  
  // Save to database
  if (db && sessionId) {
    db.saveConversationSummary(
      sessionId,
      newSummary,
      lastMsgIndex,
      estimateTokens(newSummary)
    );
    
    log(1, 'performSummarization', 'Summary saved', {
      summarizedUntilIndex: lastMsgIndex,
      summaryTokens: estimateTokens(newSummary)
    });
  }
  
  return { success: true, summary: newSummary, summarizedUntilIndex: lastMsgIndex };
}

/**
 * Format summary for injection into system prompt or first message
 */
function formatSummaryForContext(summary) {
  if (!summary) return '';
  return `[CONVERSATION CONTEXT - Summary of previous discussion]\n\n${summary}\n\n[END OF SUMMARY - Recent messages follow]\n\n---\n`;
}

module.exports = {
  estimateTokens,
  estimateMessageTokens,
  estimateHistoryTokens,
  getContextLimit,
  getTargetHistoryTokens,
  checkNeedsSummarization,
  generateSummary,
  buildConversationText,
  loadHistoryWithSummary,
  performSummarization,
  formatSummaryForContext,
  CONTEXT_LIMITS
};
