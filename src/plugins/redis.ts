/**
 * @file Redis client connection management, health checks, and lifecycle hooks.
 * @module plugins/redis
 */

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { Redis } from 'ioredis';
import { env } from '#src/config/env.js';

/** Options for customizing the Redis plugin instance. */
export interface RedisPluginOptions {
  client?: Redis;
}

/**
 * Connects to Redis and decorates Fastify with client and health check utility.
 *
 * Decorators added: `app.redis` ({ client, healthCheck }).
 * Env vars read: `REDIS_URL`.
 * Hooks registered: `onClose` (disconnects Redis client).
 *
 * @param app Fastify application instance.
 * @param opts Configuration options for Redis client injection.
 */
const redisPlugin: FastifyPluginAsync<RedisPluginOptions> = async (
  app: FastifyInstance,
  opts: RedisPluginOptions
) => {
  let client: Redis;

  if (opts.client) {
    client = opts.client;
  } else {
    client = new Redis(env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      enableOfflineQueue: false,
    });

    try {
      await client.connect();
      app.log.info('Connected to Redis');
    } catch (err) {
      app.log.warn(
        { err },
        'Could not establish initial Redis connection; operating in degraded mode'
      );
    }
  }

  const healthCheck = async () => {
    const start = performance.now();
    try {
      const pong = await client.ping();
      const latencyMs = Math.round(performance.now() - start);
      return { healthy: pong === 'PONG', latencyMs };
    } catch (err) {
      return { healthy: false, error: (err as Error).message };
    }
  };

  app.decorate('redis', {
    client,
    healthCheck,
  });

  app.addHook('onClose', async () => {
    app.log.info('Closing Redis connection...');
    await client.quit().catch(() => client.disconnect());
  });
};

export default fp(redisPlugin, {
  name: 'redis',
});
