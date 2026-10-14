const { clip } = require('./workspace');

/** Conservative estimate (not a tokenizer). Include schemas, native reasoning and tool arguments. */
function estimateTokens(value) {
  return Math.ceil(Buffer.byteLength(JSON.stringify(value), 'utf8') / 3);
}

/** Load bounded chronological history without duplicating the current renderer-saved user prompt. */
function loadHistory(db, sessionId, userPrompt) {
  // Renderer persists assistant messages as 'ai', including an empty in-flight placeholder.
  const rows = (db?.getMessages?.(sessionId) || [])
    .map(m => ({ ...m, role: m.role === 'ai' ? 'assistant' : m.role }))
    .filter(m => ['user', 'assistant'].includes(m.role) && typeof m.content === 'string' && m.content.trim());
  const last = rows[rows.length - 1];
  if (last?.role === 'user' && last.content === userPrompt) rows.pop();
  const recent = rows.slice(-12);
  // Native providers may reject a transcript that starts mid-conversation with an assistant.
  while (recent.length && recent[0].role !== 'user') recent.shift();
  return [...recent.map(m => ({ role: m.role, content: clip(m.content, 6000) })), { role: 'user', content: userPrompt }];
}

/** Keep complete assistant/tool-result groups. Drop old groups only, with an explicit checkpoint. */
function fitContext({ system, tools, messages, contextWindow = 32768, maxOutputTokens = 8192, checkpoint = '', compacted = false }) {
  const budget = contextWindow - maxOutputTokens - 2048;
  if (budget <= 0) throw new Error('Context window must exceed output reservation and safety margin.');
  const result = messages.slice();
  // The newest user request and everything after it form the active task.
  let taskIndex = -1;
  for (let i = 0; i < result.length; i++) if (result[i].role === 'user') taskIndex = i;
  if (taskIndex < 0) throw new Error('Context must contain a current user request.');
  let removed = 0;
  const prefix = () => removed || compacted ? `${system}\n\nEarlier transcript groups were removed to fit the context budget. Do not assume omitted details. Re-read files when needed.\nTask checkpoint:\n${clip(checkpoint, 6000)}` : system;
  while (estimateTokens({ system: prefix(), tools, messages: result }) > budget) {
    if (taskIndex > 0) {
      result.shift(); taskIndex--; removed++;
      // Evict the whole older user-led turn, including assistant text and all tool rounds.
      // Never leave an assistant at the start of an Anthropic/Gemini transcript.
      while (taskIndex > 0 && result[0]?.role !== 'user') { result.shift(); taskIndex--; removed++; }
    } else {
      // Prefer recent rounds, but even a single huge round must be evictable as a complete pair.
      if (result.length <= 1) throw new Error('Active context exceeds budget. Narrow file/output ranges or configure a larger contextWindow.');
      let count = 1;
      if (result[2]?.role === 'tool') count++;
      result.splice(1, count); removed += count;
    }
  }
  return { system: prefix(), messages: result, removed, estimatedTokens: estimateTokens({ system: prefix(), tools, messages: result }) };
}

module.exports = { estimateTokens, loadHistory, fitContext };
