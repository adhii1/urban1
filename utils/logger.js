const fs = require('fs');
const path = require('path');

// Project-local log directory (overridable via LOG_DIR). File logging is
// best-effort: if the directory or a stream can't be opened, we degrade to
// console-only rather than crashing the process.
const logDir = process.env.LOG_DIR || path.join(__dirname, '../logs');
let fileLoggingEnabled = true;
try {
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
} catch (err) {
  fileLoggingEnabled = false;
  console.error(`Log directory unavailable (${logDir}); file logging disabled: ${err.message}`);
}

const isProduction = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'prod';

// Cache write streams per log level to avoid reopening files on every log call.
const streams = {};

function getStream(level) {
  if (!fileLoggingEnabled) return null;
  if (streams[level]) return streams[level];
  const dateStr = new Date().toISOString().split('T')[0];
  const logFile = path.join(logDir, `${level}-${dateStr}.log`);
  const stream = fs.createWriteStream(logFile, { flags: 'a' });
  // A stream 'error' (e.g. EPERM) is emitted asynchronously and would crash the
  // process if unhandled. Swallow it and stop using this stream.
  stream.on('error', (err) => {
    console.error(`Log stream error for ${level}; disabling file logging: ${err.message}`);
    delete streams[level];
    fileLoggingEnabled = false;
  });
  streams[level] = stream;
  return stream;
}

// Rotate streams daily — close old streams when the date changes.
let currentDate = new Date().toISOString().split('T')[0];
setInterval(() => {
  const today = new Date().toISOString().split('T')[0];
  if (today !== currentDate) {
    for (const level of Object.keys(streams)) {
      streams[level].end();
      delete streams[level];
    }
    currentDate = today;
  }
}, 60 * 1000).unref();

const writeToFile = (level, message, meta = {}) => {
  const logLine = isProduction
    ? JSON.stringify({ timestamp: new Date().toISOString(), level: level.toUpperCase(), message, ...meta }) + '\n'
    : `[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}${Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : ''}\n`;
  try {
    const stream = getStream(level);
    if (stream) stream.write(logLine);
  } catch (err) {
    console.error(`Failed to write to log file for ${level}:`, err.message);
  }
};

const logger = {
  info: (msg, meta = {}) => {
    if (!isProduction) {
      const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
      console.log(`\x1b[32m[INFO]\x1b[0m [${new Date().toLocaleTimeString()}] ${msg}${metaStr}`);
    }
    writeToFile('info', msg, meta);
  },
  warn: (msg, meta = {}) => {
    if (!isProduction) {
      const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
      console.warn(`\x1b[33m[WARN]\x1b[0m [${new Date().toLocaleTimeString()}] ${msg}${metaStr}`);
    }
    writeToFile('warn', msg, meta);
  },
  error: (msg, meta = {}) => {
    if (!isProduction) {
      const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
      console.error(`\x1b[31m[ERROR]\x1b[0m [${new Date().toLocaleTimeString()}] ${msg}${metaStr}`);
    }
    writeToFile('error', msg, meta);
  },
  debug: (msg, meta = {}) => {
    if (!isProduction) {
      const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
      console.log(`\x1b[36m[DEBUG]\x1b[0m [${new Date().toLocaleTimeString()}] ${msg}${metaStr}`);
      writeToFile('debug', msg, meta);
    }
  },
};

module.exports = logger;
