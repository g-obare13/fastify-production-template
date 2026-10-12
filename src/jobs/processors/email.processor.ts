/**
 * @file BullMQ background worker for processing email delivery jobs.
 * @module jobs/processors/email
 */

import { type Job, Worker } from 'bullmq';
import { getBullMqConnection } from '#src/jobs/connection.js';
import { type EmailJobData, deadLetterQueue } from '#src/jobs/queues.js';
import { type Mailer, defaultMailer } from '#src/lib/mailer.js';

/**
 * Creates and configures a BullMQ worker processing email delivery jobs.
 *
 * @param customMailer Optional mailer implementation for testing or custom dispatch.
 * @returns Configured BullMQ worker instance listening on 'email-delivery'.
 */
export function createEmailWorker(customMailer?: Mailer): Worker<EmailJobData> {
  const mailer = customMailer ?? defaultMailer;

  const worker = new Worker<EmailJobData>(
    'email-delivery',
    async (job: Job<EmailJobData>) => {
      const data = job.data;
      switch (data.type) {
        case 'verification':
          if (!data.token) throw new Error('Missing verification token in job payload');
          await mailer.sendVerificationEmail(data.to, data.token);
          break;
        case 'password-reset':
          if (!data.token) throw new Error('Missing password reset token in job payload');
          await mailer.sendPasswordResetEmail(data.to, data.token);
          break;
        case 'notification':
          await mailer.sendEmail({
            to: data.to,
            subject: data.subject ?? 'Notification',
            text: data.body ?? '',
          });
          break;
        default:
          throw new Error(`Unknown email job type: ${(data as { type: string }).type}`);
      }
      return { success: true, processedAt: new Date().toISOString() };
    },
    {
      connection: getBullMqConnection(),
      concurrency: 5,
    }
  );

  // Dead-letter handler when all retry attempts fail
  worker.on('failed', async (job, err) => {
    if (!job) return;

    if (job.attemptsMade >= (job.opts.attempts ?? 5)) {
      await deadLetterQueue.add('dead-letter-email', {
        originalQueue: 'email-delivery',
        originalJobId: job.id ?? 'unknown',
        data: job.data,
        failedReason: err.message,
        failedAt: new Date().toISOString(),
        attemptsMade: job.attemptsMade,
      });
    }
  });

  return worker;
}
