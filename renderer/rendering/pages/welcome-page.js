'use strict';

const { createLogger } = require('../../utils/logger');

/**
 * Factory for the welcome page renderer. The implementation remains intentionally
 * lightweight until Phase 12 wiring replaces the monolith entry points.
 *
 * @param {object} deps
 * @param {(selector: string) => Element|null} [deps.select]
 * @param {import('../../utils/logger').createLogger} [deps.logger]
 * @returns {{ render(state: object): Element|null, teardown(): void }}
 */
function createWelcomePageRenderer({
  select = (selector) =>
    typeof document !== 'undefined' ? document.querySelector(selector) : null,
  logger = createLogger('WELCOME_PAGE'),
} = {}) {
  function render(state = {}) {
    const container = select('#welcome-screen');
    if (container) {
      container.dataset.stagedFiles = String(
        (state.welcomeScreenStagedFiles || []).length,
      );
    }
    logger.debug('render', 'Welcome page render invoked', {
      stagedFileCount: state?.welcomeScreenStagedFiles?.length || 0,
    });
    return container;
  }

  function teardown() {
    logger.debug('teardown', 'No-op welcome page teardown');
  }

  return {
    render,
    teardown,
  };
}

module.exports = {
  createWelcomePageRenderer,
};
