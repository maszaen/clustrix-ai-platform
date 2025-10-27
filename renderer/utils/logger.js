'use strict';

const globalWindow = typeof window !== 'undefined' ? window : globalThis;

const LOG_LEVELS = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
};

const LOGGING = true;

function log(context, level, contextFunc, message, details = {}) {
  if (!LOGGING) return;

  const USE_CONSOLE_INFO = false;
  const config = {
    0: { label: 'TRACE', color: '#d95bffff', out: 'log', detailOut: 'log' },
    1: { label: 'DEBUG', color: '#e1e1e1ff', out: 'log', detailOut: 'log' },
    2: {
      label: 'INFO',
      color: '#56aee9ff',
      out: USE_CONSOLE_INFO ? 'info' : 'log',
      detailOut: USE_CONSOLE_INFO ? 'info' : 'log',
    },
    3: { label: 'WARN', color: '#ecff73ff', out: 'warn', detailOut: 'warn' },
    4: { label: 'ERROR', color: '#fa2626ff', out: 'error', detailOut: 'error' },
  };

  const { label, color, out, detailOut } = config[level] || {
    label: 'LOG',
    color: '#95a5a6',
    out: 'log',
    detailOut: 'log',
  };

  const date = new Date();
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  const milliseconds = date.getMilliseconds().toString().padStart(3, '0');
  const time = `${hours}:${minutes}:${seconds}.${milliseconds}`;
  const shortTime = `${minutes}:${seconds}.${milliseconds}`;

  const hasDetails = details && Object.keys(details).length > 0;

  const baseSignature = `${context}:${level}:${contextFunc}:${message}`;
  const dataSignature = hasDetails
    ? JSON.stringify(details, Object.keys(details).sort())
    : '';
  const fullSignature = `${baseSignature}:${dataSignature}`;

  if (!globalWindow._logState) {
    globalWindow._logState = {
      lastSignature: null,
      lastDataSignature: null,
      lastDetails: null,
      sequenceCount: 0,
    };
  }

  const state = globalWindow._logState;

  if (state.lastSignature === fullSignature) {
    state.sequenceCount += 1;
  } else {
    state.lastSignature = fullSignature;
    state.sequenceCount = 0;
  }

  const sequenceSuffix =
    state.sequenceCount > 0 ? ` (x${state.sequenceCount + 1})` : '';

  const logLabel = `%c[${time}]%c ${context}%c ${label}%c ${contextFunc}${sequenceSuffix}`;
  const detailLabel = `%c[${time}]%c ${context}%c ${label}%c ${contextFunc}${sequenceSuffix}`;

  const logStyles = [
    'color:#8c8c8c;font-weight:bold;',
    'color:#4db6ac;font-weight:bold;',
    `color:${color};font-weight:bold;`,
    'color:#ffffff;',
  ];

  console[out](logLabel, ...logStyles, message);

  if (hasDetails) {
    const detailStyles = [
      'color:#8c8c8c;font-weight:bold;',
      'color:#66bb6a;font-weight:bold;',
      `color:${color};font-weight:bold;`,
      'color:#ffffff;',
    ];

    console[detailOut](
      detailLabel,
      ...detailStyles,
      shortTime,
      message,
      JSON.stringify(details, null, 2),
    );
  }
}

function createLogger(context) {
  return {
    trace(contextFunc, message, details) {
      log(context, LOG_LEVELS.trace, contextFunc, message, details);
    },
    debug(contextFunc, message, details) {
      log(context, LOG_LEVELS.debug, contextFunc, message, details);
    },
    info(contextFunc, message, details) {
      log(context, LOG_LEVELS.info, contextFunc, message, details);
    },
    warn(contextFunc, message, details) {
      log(context, LOG_LEVELS.warn, contextFunc, message, details);
    },
    error(contextFunc, message, details) {
      log(context, LOG_LEVELS.error, contextFunc, message, details);
    },
  };
}

module.exports = {
  LOGGING,
  LOG_LEVELS,
  log,
  createLogger,
};

if (typeof window !== 'undefined') {
  window.__utilModules = window.__utilModules || {};
  window.__utilModules.createLogger = createLogger;
  window.__utilModules.log = log;
}
