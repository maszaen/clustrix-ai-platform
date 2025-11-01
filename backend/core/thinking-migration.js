/**
 * Thinking Tag Migration
 *
 * Migrates old messages with <thinking> tags embedded in content
 * to new format with separated thinking content in _x_think.
 *
 * TOGGLE: Set ENABLE_MIGRATION to false to disable this feature completely
 */

const { log } = require('../../utils/logger');

// ============================================
// MIGRATION TOGGLE - Set to false to disable
// ============================================
const ENABLE_MIGRATION = true;

/**
 * Check if migration is enabled
 * @returns {boolean}
 */
function isMigrationEnabled() {
  return ENABLE_MIGRATION;
}

/**
 * Extract thinking content from message text
 * @param {string} content - Message content
 * @returns {Object|null} { thinking, cleanContent } or null if no thinking found
 */
function extractThinkingContent(content) {
  if (!content || typeof content !== 'string') {
    return null;
  }

  // Pattern 1: <thinking>...</thinking> at the start
  const thinkingTagMatch = content.match(/^[\s\n]*<thinking>([\s\S]*?)<\/thinking>/i);
  if (thinkingTagMatch) {
    const thinking = thinkingTagMatch[1].trim();
    const cleanContent = content.replace(/^[\s\n]*<thinking>[\s\S]*?<\/thinking>/i, '').trim();

    return {
      thinking,
      cleanContent,
      pattern: '<thinking>',
    };
  }

  // Pattern 2: *(Internal Reasoning: ...)* anywhere in content
  const internalReasoningMatch = content.match(/\*\(Internal Reasoning:\s*([\s\S]*?)\)\*/i);
  if (internalReasoningMatch) {
    const thinking = internalReasoningMatch[1].trim();
    const cleanContent = content.replace(/\*\(Internal Reasoning:\s*[\s\S]*?\)\*/gi, '').trim();

    return {
      thinking,
      cleanContent,
      pattern: '*(Internal Reasoning:)*',
    };
  }

  return null;
}

/**
 * Migrate a single session's messages
 * @param {Object} session - Session object with messages array
 * @returns {number} Number of messages migrated
 */
function migrateSession(session) {
  if (!ENABLE_MIGRATION) {
    log('MIGRATION', 1, 'migrateSession', 'Migration disabled by toggle', {});
    return 0;
  }

  if (!session || !session.messages || !Array.isArray(session.messages)) {
    log('MIGRATION', 1, 'migrateSession', 'Invalid session object', {});
    return 0;
  }

  let migratedCount = 0;

  // Initialize _x_think if not exists
  if (!session._x_think) {
    session._x_think = {};
  }

  session.messages.forEach((message, idx) => {
    const [role, content, metadata] = message;

    // Only migrate AI messages
    if (role !== 'assistant') {
      return;
    }

    // Skip if already has valid _x_think data
    const hasValidThinkData = session._x_think[idx] &&
      session._x_think[idx].text &&
      session._x_think[idx].text.trim().length > 0;

    if (hasValidThinkData) {
      return;
    }

    // Try to extract thinking content
    const extracted = extractThinkingContent(content);

    if (extracted && extracted.thinking && extracted.cleanContent !== content) {
      // Store thinking in _x_think
      session._x_think[idx] = {
        text: extracted.thinking,
        expanded: false,
      };

      // Update message content to remove thinking
      session.messages[idx][1] = extracted.cleanContent;

      migratedCount++;

      log('MIGRATION', 2, 'migrateSession', `Migrated message ${idx}`, {
        sessionId: session.id,
        pattern: extracted.pattern,
        thinkingLength: extracted.thinking.length,
        contentLength: extracted.cleanContent.length,
      });
    }
  });

  if (migratedCount > 0) {
    log('MIGRATION', 1, 'migrateSession', 'Session migration completed', {
      sessionId: session.id,
      migratedCount,
      totalMessages: session.messages.length,
    });
  }

  return migratedCount;
}

/**
 * Migrate all sessions
 * @param {Array} sessions - Array of session objects
 * @returns {number} Total number of messages migrated
 */
function migrateAllSessions(sessions) {
  if (!ENABLE_MIGRATION) {
    log('MIGRATION', 1, 'migrateAllSessions', 'Migration disabled by toggle', {});
    return 0;
  }

  if (!sessions || !Array.isArray(sessions)) {
    log('MIGRATION', 1, 'migrateAllSessions', 'Invalid sessions array', {});
    return 0;
  }

  let totalMigrated = 0;

  sessions.forEach((session) => {
    const migrated = migrateSession(session);
    totalMigrated += migrated;
  });

  if (totalMigrated > 0) {
    log('MIGRATION', 1, 'migrateAllSessions', 'All sessions migration completed', {
      totalSessions: sessions.length,
      totalMigrated,
    });
  }

  return totalMigrated;
}

/**
 * Check if a message needs migration
 * @param {string} content - Message content
 * @returns {boolean}
 */
function needsMigration(content) {
  if (!ENABLE_MIGRATION) {
    return false;
  }

  return extractThinkingContent(content) !== null;
}

module.exports = {
  ENABLE_MIGRATION,
  isMigrationEnabled,
  extractThinkingContent,
  migrateSession,
  migrateAllSessions,
  needsMigration,
};
