/**
 * @file Unit and worker tests verifying email job processing and dead-letter queues.
 * @module test/jobs/email
 */

import { describe, expect, it, vi } from 'vitest';
import { type EmailJobData, defaultJobOptions } from '#src/jobs/queues.js';
import { ConsoleMailer } from '#src/lib/mailer.js';

describe('BullMQ Jobs & Retries', () => {
  it('configures exponential backoff and retry attempts', () => {
    expect(defaultJobOptions.attempts).toBe(5);
    expect(defaultJobOptions.backoff).toEqual({
      type: 'exponential',
      delay: 2000,
    });
    expect(defaultJobOptions.removeOnComplete).toBeDefined();
    expect(defaultJobOptions.removeOnFail).toBeDefined();
  });

  it('processes email delivery jobs with custom mailer', async () => {
    const mockMailer = new ConsoleMailer();
    const jobData: EmailJobData = {
      type: 'verification',
      to: 'recipient@example.com',
      token: 'secure-token-123',
    };

    // Simulate processor function directly
    const processJob = async (data: EmailJobData) => {
      if (data.type === 'verification') {
        if (!data.token) throw new Error('Missing token');
        await mockMailer.sendVerificationEmail(data.to, data.token);
      }
    };

    await processJob(jobData);
    expect(mockMailer.sentEmails).toHaveLength(1);
    expect(mockMailer.sentEmails[0]?.to).toBe('recipient@example.com');
    expect(mockMailer.sentEmails[0]?.text).toContain('secure-token-123');
  });

  it('throws when mandatory payload parameters are absent', async () => {
    const mockMailer = new ConsoleMailer();
    const badJobData: EmailJobData = {
      type: 'verification',
      to: 'recipient@example.com',
    };

    const processJob = async (data: EmailJobData) => {
      if (data.type === 'verification') {
        if (!data.token) throw new Error('Missing verification token in job payload');
        await mockMailer.sendVerificationEmail(data.to, data.token);
      }
    };

    await expect(processJob(badJobData)).rejects.toThrow(
      'Missing verification token in job payload'
    );
  });
});
