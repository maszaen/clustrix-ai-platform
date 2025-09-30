const fs = require('fs');
const path = require('path');

let logFilePath = path.join(process.cwd(), 'app.log');
let debugEnabled = false;

function setLogFile(filePath) {
  if (typeof filePath === 'string' && filePath.trim().length > 0) {
    logFilePath = filePath;
  }
}

function setDebug(enabled) {
  debugEnabled = Boolean(enabled);
}

function ensureDirectoryExists() {
  const directory = path.dirname(logFilePath);
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
}

function normalizePart(part) {
  if (part === null || typeof part === 'undefined') {
    return '';
  }
  if (typeof part === 'string') {
    return part;
  }
  if (part instanceof Error) {
    return `${part.name}: ${part.message}\n${part.stack || ''}`.trim();
  }
  if (Array.isArray(part)) {
    return part.map(normalizePart).filter(Boolean).join(' ');
  }
  try {
    return JSON.stringify(part, null, 2);
  } catch (error) {
    return String(part);
  }
}

function log(...parts) {
  if (!debugEnabled || parts.length === 0) {
    return;
  }
  ensureDirectoryExists();
  const timestamp = new Date().toISOString();
  const body = parts.map(normalizePart).filter(Boolean).join(' ');
  if (!body) {
    return;
  }
  fs.appendFileSync(logFilePath, `[${timestamp}] ${body}\n`, 'utf8');
}

function logWithContext(context, func, message, details) {
  const ctx = context ? context.toUpperCase() : 'APP';
  const fn = func || 'log';
  log(`${ctx} ${fn} -> ${message}`, details);
}

module.exports = {
  log,
  logWithContext,
  setLogFile,
  setDebug,
};
