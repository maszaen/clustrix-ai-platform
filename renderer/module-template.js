'use strict';

/**
 * @fileoverview Template for renderer modules.
 *
 * Copy this file into the target directory, rename it, and replace the
 * placeholder logic with the concrete implementation for the module you are
 * extracting from `renderer/renderer.js`.
 */

/**
 * Sets up the module and returns its public API.
 *
 * @param {object} params
 * @param {{ debug?: Function, info?: Function, warn?: Function, error?: Function }} params.logger
 * @param {object} [params.config] Optional static configuration.
 * @returns {object} Module public surface.
 */
function createModule({ logger, config = {} } = {}) {
  if (!logger) {
    throw new Error('createModule requires a logger dependency');
  }

  /**
   * Initializes the module. Move any DOM lookups, event bindings, or initial
   * IPC subscriptions from `renderer/renderer.js` into this function.
   *
   * @returns {void}
   */
  function init() {
    logger.debug?.('[module-template] init', { config });
  }

  /**
   * Tears down allocated resources. Use this to unbind listeners when the
   * module is hot-reloaded during development or the renderer navigates away.
   *
   * @returns {void}
   */
  function destroy() {
    logger.debug?.('[module-template] destroy');
  }

  return {
    init,
    destroy,
  };
}

module.exports = {
  createModule,
};
