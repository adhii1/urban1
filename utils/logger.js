const fs = require('fs');
const path = require('path');

const logDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

const isProduction = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'prod';

// Cache write streams per log level to avoid reopening files on every log call.
const streams = {};

function getStream(level) {
  if (streams[level]) return streams[level];
  const dateStr = new Date().toISOString().split('T')[0];
  const logFile = path.join(logDir, `${level}-${dateStr}.log`);
  streams[level] = fs.createWriteStream(logFile, { flags: 'a' });
  return streams[level];
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
    getStream(level).write(logLine);
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
