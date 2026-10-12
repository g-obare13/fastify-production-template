/**
 * @file BullMQ Redis connection configuration.
 * @module jobs/connection
 */

import type { ConnectionOptions } from 'bullmq';
import { env } from '#src/config/env.js';

/**
 * Parses REDIS_URL into BullMQ compatible connection options.
 *
 * @returns Connection options tailored for BullMQ workers and queues.
 */
export function getBullMqConnection(): ConnectionOptions {
  const url = new URL(env.REDIS_URL);
  return {
    host: url.hostname || 'localhost',
    port: Number(url.port) || 6379,
    username: url.username || undefined,
    password: url.password || undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };
}
