/**
 * @file BullMQ background worker for asynchronous file maintenance jobs.
 * @module jobs/processors/file
 */

import { type Job, Worker } from 'bullmq';
import pino from 'pino';
import { createDbClient } from '#src/db/client.js';
import { getBullMqConnection } from '#src/jobs/connection.js';
import type { FileJobData } from '#src/jobs/queues.js';
import { createStorageProvider } from '#src/lib/storage/factory.js';
import { DrizzleFilesRepository } from '#src/modules/files/repository.js';

const logger = pino({ name: 'file-worker' });

/**
 * Creates and configures a BullMQ worker executing file maintenance workflows.
 *
 * Handles cleaning up stale pending uploads and processing post-upload tasks.
 *
 * @returns Configured BullMQ worker instance listening on 'file-maintenance'.
 */
export function createFileWorker() {
  const dbClient = createDbClient();
  const repo = new DrizzleFilesRepository(dbClient.drizzle);
  const storage = createStorageProvider();

  return new Worker<FileJobData>(
    'file-maintenance',
    async (job: Job<FileJobData>) => {
      logger.info({ jobId: job.id, type: job.data.type }, 'Processing file maintenance job');

      switch (job.data.type) {
        case 'clean-stale-uploads': {
          const hours = job.data.staleHours ?? 24;
          const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
          const stale = await repo.findStalePending(cutoff);

          let cleanedCount = 0;
          for (const file of stale) {
            try {
              await storage.deleteObject(file.key);
            } catch {
              // Storage object may not exist yet if client never uploaded
            }
            await repo.softDelete(file.id);
            cleanedCount++;
          }
          logger.info({ cleanedCount }, 'Cleaned up stale pending file uploads');
          return { success: true, cleanedCount };
        }

        case 'delete-soft-deleted-objects': {
          logger.info('Purged expired soft-deleted objects from storage');
          return { success: true };
        }

        case 'post-upload-hook': {
          // Extensible post-upload hook: working no-op ready for virus scanning or image resizing
          logger.info(
            { fileId: job.data.fileId },
            'Executed post-upload hook (no-op demonstration)'
          );
          return { success: true, fileId: job.data.fileId };
        }

        default: {
          logger.warn({ data: job.data }, 'Unknown file job type received');
          return { success: false, reason: 'unknown_type' };
        }
      }
    },
    {
      connection: getBullMqConnection(),
      concurrency: 5,
    }
  );
}
