const http = require('http');
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const app = require('./app');
const config = require('./config/config');
const { connectDB, closeDatabaseConnection } = require('./config/database');
const { initSockets, getIO } = require('./config/socket');
const rideExpiry = require('./services/rideExpiryService');
const ridePairing = require('./services/ridePairingService');
const bundleEngine = require('./services/BundleMatchingEngine');
const logger = require('./utils/logger');

const server = http.createServer(app);
const io = initSockets(server);

const startServer = async () => {
  await connectDB();
  server.listen(config.port, () => {
    logger.info(`=================================================`);
    logger.info(`TORQQ Platform Server started in [${config.env}] mode.`);
    logger.info(`Host URL: http://localhost:${config.port}`);
    logger.info(`Swagger APIs: http://localhost:${config.port}/api-docs`);
    logger.info(`=================================================`);

    // Start background services
    ridePairing.startPeriodicRefresh(logger);
    rideExpiry.start();
    bundleEngine.startRecoveryJob();
  });
};

startServer();

const shutdownGracefully = async (signal) => {
  logger.warn(`Received signal: ${signal}. Shutting down TORQQ Backend gracefully...`);

  // Stop the periodic cleanup job so it doesn't fire during shutdown.
  rideExpiry.stop();
  ridePairing.stopPeriodicRefresh();
  bundleEngine.stopRecoveryJob();

  // Close Socket.IO so connected clients see a clean disconnect.
  try {
    getIO().close();
  } catch (err) {
    logger.warn('Error closing socket.io', { error: err.message });
  }

  server.close(async () => {
    logger.info('HTTP server closed successfully.');
    await closeDatabaseConnection();
    logger.info('Graceful shutdown completed. Exiting process.');
    process.exit(0);
  });
  setTimeout(() => {
    logger.error('Forceful shutdown triggered. Exiting processes.');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => shutdownGracefully('SIGTERM'));
process.on('SIGINT', () => shutdownGracefully('SIGINT'));
process.on('unhandledRejection', (reason, promise) => {
  logger.error(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
  // Only exit on truly fatal conditions (e.g., MongoDB connection lost).
  // Non-critical background task failures should be logged but not crash the process.
  const isFatal = reason instanceof Error && (
    reason.message.includes('ECONNREFUSED') ||
    reason.message.includes('server was shut down') ||
    reason.message.includes('Topology was destroyed')
  );
  if (isFatal) {
    shutdownGracefully('UNHANDLED_REJECTION');
  }
});
process.on('uncaughtException', (error) => {
  logger.error(`Uncaught Exception thrown: ${error.message}`);
  shutdownGracefully('UNCAUGHT_EXCEPTION');
});
