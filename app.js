const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const config = require('./config/config');
const logger = require('./utils/logger');
const loggerMiddleware = require('./middleware/loggerMiddleware');
const { generalLimiter } = require('./middleware/rateLimiterMiddleware');
const notFound = require('./middleware/notFoundMiddleware');
const errorHandler = require('./middleware/errorMiddleware');

const v1Router = require('./routes/v1');

const app = express();
const isProduction = config.env === 'production' || config.env === 'prod';

// Security headers are split in two: the API only ever returns JSON, so it keeps
// the strict policy. The static frontends we serve below are real HTML pages
// that pull Google Fonts, Unsplash photos and the Socket.IO client, so they get
// a policy that actually permits what their markup asks for — the old
// API-shaped CSP was applied app-wide and would blank-page every served page.
const sharedHelmet = {
  crossOriginOpenerPolicy: true,
  dnsPrefetchControl: true,
  frameguard: { action: 'deny' },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  ieNoOpen: true,
  noSniff: true,
  permittedCrossDomainPolicies: { permittedPolicies: 'none' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xssFilter: true,
};

const apiHelmet = helmet({
  ...sharedHelmet,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'none'"],
      frameSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: true,
  // Browsers on a different port/host still need to read API responses.
  crossOriginResourcePolicy: { policy: 'cross-origin' },
});

const pageHelmet = helmet({
  ...sharedHelmet,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // unpkg: the driver pages load Lucide icons from it.
      // cdn.socket.io: only a fallback now — the Socket.IO client is served
      // from this origin at /socket.io/socket.io.js, so versions always match.
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://unpkg.com', 'https://cdn.socket.io'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      // 'self' covers the same-origin case (page and API both on this server).
      // ws:/wss: cover Socket.IO; the bare http:/https: in dev cover the LAN-IP
      // and separate-static-server setups, where the API origin isn't knowable
      // up front. Production is same-origin or an explicit allowlist.
      connectSrc: isProduction
        ? ["'self'", 'wss:']
        : ["'self'", 'ws:', 'wss:', 'http:', 'https:'],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  // COEP would require every cross-origin image (Unsplash, the QR service) to
  // opt in with CORP headers, which they don't — it blanks the images out.
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'same-site' },
});

app.use((req, res, next) => {
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);
  next();
});

app.use(loggerMiddleware);

app.use(cors({
  origin: (origin, callback) => {
    if (config.cors.isAllowed(origin)) return callback(null, true);
    logger.warn(`CORS blocked origin: ${origin}`);
    // Reject by refusing the CORS headers rather than by throwing: an error here
    // becomes an opaque 500 that reads like a server crash in the browser
    // console, which is exactly what makes this class of bug hard to diagnose.
    return callback(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  credentials: true,
  maxAge: 86400,
}));

app.use(compression());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(cookieParser());

app.use('/api', apiHelmet);
app.use('/api', generalLimiter);
app.use('/api/v1', v1Router);
// Unmatched API paths must 404 as JSON here, before the static handlers below.
// Otherwise they fall through to the HTML app, which answers with the page's
// looser CSP and — for a client expecting JSON — a far more confusing error.
app.use('/api', notFound);

// --- Static frontends ------------------------------------------------------
// Serving these from the same process as the API is what makes startup
// identical on every machine: one command, one port, one origin, so there is no
// second static server to forget and no cross-origin request to block.
const staticApps = [
  { mount: '/', dir: 'customer frontend', label: 'customer' },
  { mount: '/driver', dir: 'driver frontend', label: 'driver' },
];

const staticOptions = {
  // Dev must not cache: a stale bundle on someone else's machine looks exactly
  // like a code bug. Production gets normal caching for hashed-free assets.
  etag: true,
  lastModified: true,
  maxAge: isProduction ? '1h' : 0,
  setHeaders: (res, filePath) => {
    if (!isProduction || /\.html$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
};

// The driver app has no index.html at its root, so land visitors on its login.
app.get('/driver', (req, res, next) => {
  if (req.originalUrl.endsWith('/driver')) return res.redirect('/driver/pages/login.html');
  return next();
});

staticApps.forEach(({ mount, dir, label }) => {
  const absoluteDir = path.join(__dirname, dir);
  if (!fs.existsSync(absoluteDir)) {
    logger.warn(`Static frontend not found, skipping mount: ${dir}`);
    return;
  }
  app.use(mount, pageHelmet, express.static(absoluteDir, staticOptions));
  logger.info(`Serving ${label} frontend at ${mount} from "${dir}"`);
});

app.use(notFound);
app.use(errorHandler);

module.exports = app;
