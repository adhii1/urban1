const dotenv = require("dotenv");
const path = require("path");

const nodeEnv = process.env.NODE_ENV || "development";
let envFile = ".env.dev";
if (nodeEnv === "test") envFile = ".env.test";
else if (nodeEnv === "production" || nodeEnv === "prod") envFile = ".env.prod";

console.log(`🔌 [Config] Loading environment variables from ${envFile}`);
dotenv.config({ path: path.join(__dirname, "../", envFile) });

const requireEnv = (key) => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`[FATAL] Required environment variable missing: ${key}`);
  }
  return value;
};

const config = {
  env: nodeEnv,
  port: parseInt(process.env.PORT, 10) || 4000,

  mongoose: {
    url: requireEnv("MONGODB_URI"),
    options: {
      autoIndex: nodeEnv !== "production",
      connectTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      maxPoolSize: nodeEnv === "production" ? 50 : 10,
    },
  },

  jwt: {
    secret: requireEnv("JWT_SECRET"),
    accessExpirationMinutes:
      parseInt(process.env.JWT_ACCESS_EXPIRES_MINUTES, 10) || 120,
    refreshSecret: requireEnv("REFRESH_SECRET"),
    refreshExpirationDays:
      parseInt(process.env.JWT_REFRESH_EXPIRES_DAYS, 10) || 7,
  },

  cors: {
    origins:
      nodeEnv === "production"
        ? [requireEnv("CLIENT_URL"), requireEnv("ADMIN_URL")]
        : [
          "http://localhost:3000",
          "http://localhost:3001",
          "http://localhost:8000",
          "http://localhost:5500",
          "http://localhost:5501",
          "http://127.0.0.1:5500",
          "http://127.0.0.1:5501",
          "null",
        ],
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
