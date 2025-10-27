'use strict';

const { createLogger } = require('../../utils/logger');

/**
 * Artifacts page renderer stub. Keeps track of filtered artifacts so later
 * phases can hydrate the gallery outside of the monolith.
 *
 * @param {object} deps
 * @param {(selector: string) => Element|null} [deps.select]
 * @param {import('../../utils/logger').createLogger} [deps.logger]
 * @returns {{ render(state: object): Element|null, teardown(): void }}
 */
function createArtifactsPageRenderer({
  select = (selector) =>
    typeof document !== 'undefined' ? document.querySelector(selector) : null,
  logger = createLogger('ARTIFACTS_PAGE'),
} = {}) {
  function render(state = {}) {
    const container = select('#artifacts-page');
    if (container) {
      container.dataset.artifactCount = String(
        (state.codeArtifacts || []).length,
      );
    }
    logger.debug('render', 'Artifacts page render invoked', {
      artifactCount: state?.codeArtifacts?.length || 0,
    });
    return container;
  }

  function teardown() {
    logger.debug('teardown', 'No-op artifacts page teardown');
  }

  return {
    render,
    teardown,
  };
}

module.exports = {
  createArtifactsPageRenderer,
};
