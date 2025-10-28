// Simple log function - loaded BEFORE all modules
(function() {
  'use strict';
  
  const LOGGING = true;
  const DEBUG_MODE = false;
  
  function log(c, l, f, m, d = {}) {
    if (!LOGGING) return;
    const cfg = {
      0: { label: "TRACE", color: "#d95bffff", out: "log" },
      1: { label: "DEBUG", color: "#e1e1e1ff", out: "log" },
      2: { label: "INFO", color: "#56aee9ff", out: "log" },
      3: { label: "WARN", color: "#ecff73ff", out: "warn" },
      4: { label: "ERROR", color: "#fa2626ff", out: "error" }
    };
    const { label, color, out } = cfg[l] || { label: "LOG", color: "#95a5a6", out: "log" };
    console[out](`%c[${label}] ${c}:${f} - ${m}`, `color: ${color}`, d);
  }
  
  // Export globally for modules
  window.log = log;
  window.LOGGING = LOGGING;
  window.DEBUG_MODE = DEBUG_MODE;
})();
