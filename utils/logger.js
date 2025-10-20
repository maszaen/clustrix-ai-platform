const fs = require('fs');
const path = require('path');

let logFilePath = path.join(process.cwd(), 'app.log');
let debugEnabled = false;

const SESSION_MARKER = '========================================';
const SESSION_START_PREFIX = 'SESSION START:';

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

function writeSessionCheckpoint() {
  const timestamp = new Date().toISOString();
  const checkpoint = [
    SESSION_MARKER,
    `${SESSION_START_PREFIX} ${timestamp}`,
    SESSION_MARKER,
    ''
  ].join('\n');
  
  fs.appendFileSync(logFilePath, checkpoint, 'utf8');
  return timestamp;
}

function countSessionsInLog(logContent) {
  const regex = new RegExp(`${SESSION_MARKER}\\n${SESSION_START_PREFIX}`, 'g');
  const matches = logContent.match(regex);
  return matches ? matches.length : 0;
}

function trimOldestSession(logPath) {
  if (!fs.existsSync(logPath)) return false;
  
  const logContent = fs.readFileSync(logPath, 'utf8');
  
  // Cari semua posisi marker
  const markerRegex = new RegExp(`${SESSION_MARKER}\\n${SESSION_START_PREFIX}`, 'g');
  const matches = [];
  let match;
  
  while ((match = markerRegex.exec(logContent)) !== null) {
    matches.push(match.index);
  }
  
  // Kalau ada minimal 2 marker, hapus session pertama
  if (matches.length >= 2) {
    const secondMarkerIndex = matches[1];
    const newContent = logContent.slice(secondMarkerIndex);
    fs.writeFileSync(logPath, newContent, 'utf8');
    return true; // Rotasi terjadi
  }
  
  return false; // Gak ada rotasi
}

function rotateLogWithCheckpoint(userDataPath) {
  ensureDirectoryExists();
  
  const logPath = path.join(userDataPath, 'app.log');
  
  // Cek berapa session yang ada di log file
  let currentSessionCount = 0;
  if (fs.existsSync(logPath)) {
    const logContent = fs.readFileSync(logPath, 'utf8');
    currentSessionCount = countSessionsInLog(logContent);
  }
  
  // Kalau sudah ada 3 session, hapus yang paling lama
  const wasRotated = currentSessionCount >= 3 ? trimOldestSession(logPath) : false;
  
  // Tulis checkpoint marker dengan timestamp
  const sessionTimestamp = writeSessionCheckpoint();
  
  return {
    timestamp: sessionTimestamp,
    rotated: wasRotated,
    previousSessionCount: currentSessionCount
  };
}

module.exports = {
  log,
  logWithContext,
  setLogFile,
  setDebug,
  rotateLogWithCheckpoint,
};
