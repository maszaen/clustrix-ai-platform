const { clip } = require('./workspace');
const { estimateTokens } = require('./context');
const { log } = require('../../../utils/logger');

const PREFIX = 'CLUSTRIX_AGENT_CHECKPOINT_V1\n';

/** Build a factual, bounded checkpoint, not a fabricated summary of omitted conversation. */
function buildCheckpoint(session, userPrompt, recentActions, status) {
  return {
    workspace: session.workspace.root, task: clip(userPrompt, 1500), status,
    checklist: session.checklist.slice(0, 30).map(item => ({ ...item, task: clip(item.task, 200) })),
    recentActions: recentActions.slice(-6),
    editedFiles: [...session.workspace.edits.values()].map(edit => edit.file).filter((file, i, all) => all.indexOf(file) === i),
  };
}

/** Use the existing summary table; no schema migration or persisted provider reasoning is needed. */
function saveCheckpoint(db, sessionId, messageIndex, checkpoint) {
  if (!db?.saveConversationSummary) return;
  try {
    const text = PREFIX + JSON.stringify(checkpoint);
    db.saveConversationSummary(sessionId, text, messageIndex, estimateTokens(text));
  } catch (error) {
    log('CODES_RUNTIME', 3, 'saveCheckpoint', 'Checkpoint persistence failed', { sessionId, error: error.message });
  }
}

/** Restore only our versioned checkpoint for the same canonical workspace, never foreign instructions. */
function loadCheckpoint(db, sessionId, workspace) {
  try {
    const text = db?.getLatestSummary?.(sessionId)?.summary_text;
    if (typeof text !== 'string' || !text.startsWith(PREFIX) || text.length > 30000) return null;
    const value = JSON.parse(text.slice(PREFIX.length));
    return value.workspace === workspace ? value : null;
  } catch { return null; }
}

module.exports = { buildCheckpoint, saveCheckpoint, loadCheckpoint };
