'use strict';

function withLogger(logger, namespace) {
  if (logger) return logger;
  const prefix = namespace ? `[${namespace}]` : '[sidebar]';
  return {
    debug: (...args) => console.debug(prefix, ...args),
    info: (...args) => console.info(prefix, ...args),
    warn: (...args) => console.warn(prefix, ...args),
    error: (...args) => console.error(prefix, ...args),
  };
}

function createSidebarController({
  select = (selector) =>
    typeof document !== 'undefined' ? document.querySelector(selector) : null,
  logger,
} = {}) {
  logger = withLogger(logger, 'SIDEBAR');
  let collapsed = false;

  function getAppContainer() {
    return select('#app');
  }

  function toggle() {
    collapsed = !collapsed;
    const app = getAppContainer();
    if (app) {
      app.classList.toggle('sidebar-collapsed', collapsed);
    }
    logger.debug('toggle', 'Sidebar toggle invoked', { collapsed });
    return collapsed;
  }

  function setCollapsed(next) {
    collapsed = Boolean(next);
    const app = getAppContainer();
    if (app) {
      app.classList.toggle('sidebar-collapsed', collapsed);
    }
    logger.debug('setCollapsed', 'Sidebar collapse state updated', {
      collapsed,
    });
    return collapsed;
  }

  function isCollapsed() {
    return collapsed;
  }

  return {
    toggle,
    setCollapsed,
    isCollapsed,
  };
}

(function attachToGlobal(global) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      createSidebarController,
    };
  }
  if (global) {
    global.__uiModules = global.__uiModules || {};
    global.__uiModules.createSidebarController = createSidebarController;
  }
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : undefined);
