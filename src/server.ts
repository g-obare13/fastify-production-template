/**
 * @file Main HTTP server entrypoint starting Fastify and handling graceful process shutdown.
 * @module server
 */

import { env } from '#src/config/env.js';
import { buildApp } from './app.js';

const app = buildApp();

/**
 * Boots the Fastify server and begins listening on configured host and port.
 *
 * @returns Resolves when HTTP server is listening.
 */
async function start() {
  try {
    const address = await app.listen({
      port: env.PORT,
      host: env.HOST,
    });
    app.log.info({ address, env: env.NODE_ENV }, '🚀 Server successfully started');
  } catch (err) {
    app.log.fatal({ err }, 'Failed to start server');
    process.exit(1);
  }
}

// Graceful shutdown handling
let isShuttingDown = false;

/**
 * Coordinates graceful server shutdown, stopping incoming traffic and draining active requests.
 *
 * @param signal Termination signal received by process (SIGTERM or SIGINT).
 * @returns Resolves when server has shut down.
 */
async function gracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  app.log.info({ signal }, 'Received shutdown signal. Commencing graceful shutdown...');

  // Set a hard timeout to force exit if cleanup hangs
  const forceExitTimeout = setTimeout(() => {
    app.log.error('Graceful shutdown timed out (10s). Forcing termination.');
    process.exit(1);
  }, 10000);
  forceExitTimeout.unref();

  try {
    // Stop accepting new connections and drain active requests
    await app.close();
    app.log.info('Fastify server closed.');

    app.log.info('Graceful shutdown completed successfully.');
    process.exit(0);
  } catch (err) {
    app.log.error({ err }, 'Error occurred during graceful shutdown');
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  app.log.fatal({ err: reason }, 'Unhandled Promise Rejection');
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  app.log.fatal({ err }, 'Uncaught Exception thrown');
  process.exit(1);
});

start();
