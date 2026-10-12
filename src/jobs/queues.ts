/**
 * @file BullMQ background job queues and payload type definitions.
 * @module jobs/queues
 */

import { type JobsOptions, Queue } from 'bullmq';
import { getBullMqConnection } from './connection.js';

/** Payload schema for email delivery jobs. */
export interface EmailJobData {
  type: 'verification' | 'password-reset' | 'notification';
  to: string;
  token?: string;
  subject?: string;
  body?: string;
}

/** Payload schema for asynchronous file maintenance jobs. */
export interface FileJobData {
  type: 'clean-stale-uploads' | 'delete-soft-deleted-objects' | 'post-upload-hook';
  fileId?: string;
  staleHours?: number;
  retentionDays?: number;
}

/** Payload schema for dead-letter failed job captures. */
export interface DeadLetterJobData {
  originalQueue: string;
  originalJobId: string;
  data: unknown;
  failedReason: string;
  failedAt: string;
  attemptsMade: number;
}

/** Default retry strategy and lifecycle retention options for jobs. */
export const defaultJobOptions: JobsOptions = {
  attempts: 5,
  backoff: {
    type: 'exponential',
    delay: 2000,
  },
  removeOnComplete: {
    count: 1000,
  },
  removeOnFail: {
    count: 5000,
  },
};

/** Queue for transactional email dispatching. */
export const emailQueue = new Queue<EmailJobData>('email-delivery', {
  connection: getBullMqConnection(),
  defaultJobOptions,
});

/** Queue for background file cleanup and processing pipelines. */
export const fileQueue = new Queue<FileJobData>('file-maintenance', {
  connection: getBullMqConnection(),
  defaultJobOptions,
});

/** Dead-letter queue capturing unrecoverable failed jobs for inspection. */
export const deadLetterQueue = new Queue<DeadLetterJobData>('dead-letter-jobs', {
  connection: getBullMqConnection(),
  defaultJobOptions: {
    removeOnComplete: false,
    removeOnFail: false,
  },
});
