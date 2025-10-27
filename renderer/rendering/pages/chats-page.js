'use strict';

const { createLogger } = require('../../utils/logger');

/**
 * Renderer for the chats overview page. Provides a placeholder implementation
 * that collects high-level metrics for future UI updates.
 *
 * @param {object} deps
 * @param {(selector: string) => Element|null} [deps.select]
 * @param {(selector: string) => NodeListOf<Element>} [deps.selectAll]
 * @param {import('../../utils/logger').createLogger} [deps.logger]
 * @returns {{ render(state: object): Element|null, teardown(): void }}
 */
function createChatsPageRenderer({
  select = (selector) =>
    typeof document !== 'undefined' ? document.querySelector(selector) : null,
  selectAll = (selector) =>
    typeof document !== 'undefined' ? document.querySelectorAll(selector) : [],
  logger = createLogger('CHATS_PAGE'),
} = {}) {
  function render(state = {}) {
    const container = select('#chats-page');
    if (container) {
      const existingItems = selectAll('#chats-list .chat-item');
      container.dataset.renderedChats = String(existingItems.length);
      container.dataset.totalChats = String(
        (state.sessions || []).filter((s) => !s.isProject).length,
      );
    }
    logger.debug('render', 'Chats page render invoked', {
      totalSessions: state?.sessions?.length || 0,
      selectedCount: state?.selectedChatIds
        ? state.selectedChatIds.size
        : 0,
    });
    return container;
  }

  function teardown() {
    logger.debug('teardown', 'No-op chats page teardown');
  }

  return {
    render,
    teardown,
  };
}

module.exports = {
  createChatsPageRenderer,
};
