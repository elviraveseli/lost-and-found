import { createApp } from './app.js';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import { config } from './config/env.js';
import { logger } from './config/logger.js';

async function start() {
  await connectDatabase();
  const app = createApp();
  const server = app.listen(config.PORT, () => {
    logger.info(`API listening on http://localhost:${config.PORT} (${config.NODE_ENV})`);
  });

  // Graceful shutdown: stop accepting new connections, let in-flight requests
  // finish, then close the database connection. Force-exit if it takes too long.
  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down');

    const forceExit = setTimeout(() => {
      logger.error('Shutdown timed out, forcing exit');
      process.exit(1);
    }, 10_000);
    forceExit.unref();

    server.close(async (err) => {
      if (err) logger.error({ err }, 'Error while closing HTTP server');
      await disconnectDatabase().catch((dbErr) => logger.error({ err: dbErr }, 'Error closing MongoDB'));
      process.exit(err ? 1 : 0);
    });
    server.closeIdleConnections?.();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled promise rejection');
});

start().catch((err) => {
  logger.fatal({ err }, 'Failed to start server');
  process.exit(1);
});
