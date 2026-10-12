/**
 * @file BullMQ background job worker process consuming queues for emails and maintenance.
 * @module worker
 */

import pino from 'pino';
import { createEmailWorker } from '#src/jobs/processors/email.processor.js';
import { createFileWorker } from '#src/jobs/processors/file.processor.js';
import { deadLetterQueue, emailQueue, fileQueue } from '#src/jobs/queues.js';

const logger = pino({ name: 'bullmq-worker' });

logger.info('Starting BullMQ Background Job Worker...');

const emailWorker = createEmailWorker();
const fileWorker = createFileWorker();

emailWorker.on('ready', () => {
  logger.info('Email delivery worker is ready and listening for jobs.');
});

fileWorker.on('ready', () => {
  logger.info('File maintenance worker is ready and listening for jobs.');
});

emailWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'Email job completed successfully.');
});

fileWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'File job completed successfully.');
});

emailWorker.on('error', (err) => {
  logger.error({ err }, 'Email worker error occurred');
});

fileWorker.on('error', (err) => {
  logger.error({ err }, 'File worker error occurred');
});

// Graceful worker shutdown
let isStopping = false;

/**
 * Handles graceful shutdown of all BullMQ background workers and queues.
 *
 * @param signal System termination signal triggering shutdown.
 * @returns Resolves when workers and queues have closed cleanly.
 */
async function shutdownWorker(signal: string) {
  if (isStopping) return;
  isStopping = true;
  logger.info({ signal }, 'Shutting down worker gracefully...');

  try {
    await emailWorker.close();
    await fileWorker.close();
    await emailQueue.close();
    await fileQueue.close();
    await deadLetterQueue.close();
    logger.info('Worker shut down cleanly.');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Error during worker shutdown');
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdownWorker('SIGTERM'));
process.on('SIGINT', () => shutdownWorker('SIGINT'));
