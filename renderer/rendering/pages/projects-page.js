'use strict';

const { createLogger } = require('../../utils/logger');

/**
 * Renderer stub for the projects dashboard. Tracks project counts and
 * instrumentation without mutating the legacy DOM yet.
 *
 * @param {object} deps
 * @param {(selector: string) => Element|null} [deps.select]
 * @param {import('../../utils/logger').createLogger} [deps.logger]
 * @returns {{ render(state: object): Element|null, teardown(): void }}
 */
function createProjectsPageRenderer({
  select = (selector) =>
    typeof document !== 'undefined' ? document.querySelector(selector) : null,
  logger = createLogger('PROJECTS_PAGE'),
} = {}) {
  function render(state = {}) {
    const container = select('#projects-page');
    if (container) {
      container.dataset.projectCount = String(
        (state.projectsData || []).length,
      );
      container.dataset.selectMode = String(
        state.isProjectsSelectMode ? 'on' : 'off',
      );
    }
    logger.debug('render', 'Projects page render invoked', {
      projectCount: state?.projectsData?.length || 0,
      selectedProjectCount: state?.selectedProjectIds
        ? state.selectedProjectIds.size
        : 0,
    });
    return container;
  }

  function teardown() {
    logger.debug('teardown', 'No-op projects page teardown');
  }

  return {
    render,
    teardown,
  };
}

module.exports = {
  createProjectsPageRenderer,
};
