const dotenv = require("dotenv");
const path = require("path");

const nodeEnv = process.env.NODE_ENV || "development";
let envFile = ".env.dev";
if (nodeEnv === "test") envFile = ".env.test";
else if (nodeEnv === "production" || nodeEnv === "prod") envFile = ".env.prod";

console.log(`🔌 [Config] Loading environment variables from ${envFile}`);
dotenv.config({ path: path.join(__dirname, "../", envFile) });

const isTest = nodeEnv === "test";

// In the test environment we allow safe fallbacks so the suite runs without a
// committed secrets file (integration tests use an in-memory Mongo that
// overrides the URL anyway). Dev and production stay strict.
const requireEnv = (key, testFallback) => {
  const value = process.env[key];
  if (!value) {
    if (isTest && testFallback !== undefined) return testFallback;
    throw new Error(
      `[FATAL] Required environment variable missing: ${key}\n` +
      `        Expected it in ${envFile} (this file is gitignored, so a fresh clone won't have it).\n` +
      `        Fix: cp .env.example ${envFile}  — then fill in ${key}.`
    );
  }
  return value;
};

const isProduction = nodeEnv === "production" || nodeEnv === "prod";

// --- CORS -------------------------------------------------------------------
// Outside production the frontends get served from a mix of this server, `next
// dev`, and whatever ad-hoc static server happens to be free, so a fixed port
// list only ever works on the machine it was written on. Accept any port on
// loopback or a private LAN address instead — the LAN case is what lets a phone
// on the same wifi reach the API. Production stays an explicit allowlist.
const parseOriginList = (value) =>
  (value || "")
    .split(",")
    .map((entry) => entry.trim().replace(/\/+$/, ""))
    .filter(Boolean);

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"]);

const isPrivateHost = (hostname) => {
  if (LOOPBACK_HOSTS.has(hostname) || hostname.endsWith(".localhost")) return true;
  const octets = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (!octets) return false;
  const a = Number(octets[1]);
  const b = Number(octets[2]);
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local
  return false;
};

const allowedOrigins = isProduction
  ? [
    requireEnv("CLIENT_URL"),
    requireEnv("ADMIN_URL"),
    ...parseOriginList(process.env.CORS_EXTRA_ORIGINS),
  ].map((origin) => origin.replace(/\/+$/, ""))
  : parseOriginList(process.env.CORS_EXTRA_ORIGINS);

const isOriginAllowed = (origin) => {
  // No Origin header at all: same-origin navigation, curl, Postman, native app.
  if (!origin) return true;

  const normalized = origin.replace(/\/+$/, "");
  if (allowedOrigins.includes(normalized)) return true;
  if (isProduction) return false;

  // `file://` pages send the literal string "null".
  if (normalized === "null") return true;

  try {
    const { protocol, hostname } = new URL(normalized);
    if (protocol !== "http:" && protocol !== "https:") return false;
    return isPrivateHost(hostname);
  } catch {
    return false;
  }
};

const config = {
  env: nodeEnv,
  port: parseInt(process.env.PORT, 10) || 4000,

  mongoose: {
    url: requireEnv("MONGODB_URI", "mongodb://127.0.0.1:27017/torqq-test"),
    options: {
      autoIndex: nodeEnv !== "production",
      connectTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      maxPoolSize: nodeEnv === "production" ? 50 : 10,
    },
  },

  jwt: {
    secret: requireEnv("JWT_SECRET", "test-jwt-secret"),
    accessExpirationMinutes:
      parseInt(process.env.JWT_ACCESS_EXPIRES_MINUTES, 10) || 120,
    refreshSecret: requireEnv("REFRESH_SECRET", "test-refresh-secret"),
    refreshExpirationDays:
      parseInt(process.env.JWT_REFRESH_EXPIRES_DAYS, 10) || 7,
  },

  cors: {
    origins: allowedOrigins,
    isAllowed: isOriginAllowed,
  },

  google: { mapsApiKey: process.env.GOOGLE_MAPS_API_KEY || "" },
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID || "",
    keySecret: process.env.RAZORPAY_SECRET || "",
  },
  email: {
    smtp: {
      host: process.env.SMTP_HOST || "smtp.mailtrap.io",
      port: parseInt(process.env.SMTP_PORT, 10) || 2525,
      auth: {
        user: process.env.SMTP_USER || "",
        pass: process.env.SMTP_PASSWORD || "",
      },
    },
  },
  uploads: {
    path: process.env.UPLOAD_PATH || "src/uploads",
    maxSize: parseInt(process.env.MAX_FILE_SIZE, 10) || 5242880,
  },
  tracking: {
    locationUpdateInterval:
      parseInt(process.env.LOCATION_UPDATE_INTERVAL, 10) || 30000,
    locationDbSyncInterval:
      parseInt(process.env.LOCATION_DB_SYNC_INTERVAL, 10) || 300000,
    averageCitySpeed: parseInt(process.env.AVERAGE_CITY_SPEED, 10) || 30,
    bookingAcceptanceTimeout:
      parseInt(process.env.BOOKING_ACCEPTANCE_TIMEOUT, 10) || 300000,
  },

  redis: {
    url: process.env.REDIS_URL || '',
    enabled: !!process.env.REDIS_URL,
  },
};

module.exports = config;
