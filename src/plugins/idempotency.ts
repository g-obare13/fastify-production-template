/**
 * @file Distributed idempotency middleware ensuring at-most-once execution of mutating requests.
 * @module plugins/idempotency
 */

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { ConflictError } from '#src/lib/errors.js';

/** Options configuring caching duration for idempotent requests. */
export interface IdempotencyPluginOptions {
  ttlSeconds?: number;
}

interface RequestWithIdempotency {
  __idempotencyKey?: string;
}

/**
 * Intercepts mutating requests with `Idempotency-Key` headers to cache and replay identical responses.
 *
 * Decorators added: none.
 * Env vars read: none.
 * Hooks registered: `preHandler` (checks cache lock), `onSend` (caches successful response).
 *
 * @param app Fastify application instance.
 * @param opts Options configuring idempotency record TTL.
 */
const idempotencyPlugin: FastifyPluginAsync<IdempotencyPluginOptions> = async (
  app: FastifyInstance,
  opts: IdempotencyPluginOptions
) => {
  const ttl = opts.ttlSeconds ?? 86400; // 24 hours

  app.addHook('preHandler', async (request, reply) => {
    // Only apply to state-modifying requests
    if (request.method !== 'POST' && request.method !== 'PATCH' && request.method !== 'PUT') {
      return;
    }

    const idempotencyKey = request.headers['idempotency-key'];
    if (!idempotencyKey || typeof idempotencyKey !== 'string') {
      return;
    }

    const redis = app.redis?.client;
    if (!redis) return;

    const cacheKey = `idempotency:${idempotencyKey}`;
    const cached = await redis.get(cacheKey).catch(() => null);

    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed.status === 'in_progress') {
          throw new ConflictError(
            'A request with this Idempotency-Key is currently being processed'
          );
        }

        return reply
          .status(parsed.statusCode)
          .headers(parsed.headers)
          .header('x-cache', 'HIT')
          .header('idempotency-key', idempotencyKey)
          .send(parsed.body);
      } catch (err) {
        if (err instanceof ConflictError) throw err;
      }
    }

    // Set lock
    await redis
      .set(cacheKey, JSON.stringify({ status: 'in_progress' }), 'EX', 60)
      .catch(() => null);
    (request.raw as RequestWithIdempotency).__idempotencyKey = idempotencyKey;
  });

  app.addHook('onSend', async (request, reply, payload) => {
    const idempotencyKey = (request.raw as RequestWithIdempotency).__idempotencyKey;
    if (!idempotencyKey) return payload;

    const redis = app.redis?.client;
    if (!redis) return payload;

    const cacheKey = `idempotency:${idempotencyKey}`;
    if (reply.statusCode < 500) {
      let body: unknown = payload;
      if (typeof payload === 'string') {
        try {
          body = JSON.parse(payload);
        } catch {
          body = payload;
        }
      }
      const record = {
        statusCode: reply.statusCode,
        headers: { 'content-type': reply.getHeader('content-type') },
        body,
      };
      await redis.set(cacheKey, JSON.stringify(record), 'EX', ttl).catch(() => null);
    } else {
      await redis.del(cacheKey).catch(() => null);
    }

    return payload;
  });
};

export default fp(idempotencyPlugin, {
  name: 'idempotency',
});
