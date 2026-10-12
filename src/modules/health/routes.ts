/**
 * @file Health check REST routes for container orchestration probes.
 * @module modules/health/routes
 */

import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { healthLivenessResponseSchema, healthReadinessResponseSchema } from './schemas.js';
import { HealthService } from './service.js';

/**
 * Registers `/health/live` and `/health/ready` probe handlers.
 *
 * Decorators added: none.
 * Env vars read: none.
 * Hooks registered: none.
 *
 * @param app Fastify application instance with Zod type provider.
 */
export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  const healthService = new HealthService({
    checkDb: async () => {
      if (!app.db) {
        return { healthy: true, latencyMs: 0 };
      }
      return app.db.healthCheck();
    },
    checkRedis: async () => {
      if (!app.redis) {
        return { healthy: true, latencyMs: 0 };
      }
      return app.redis.healthCheck();
    },
    checkStorage: async () => {
      if (!app.storage) {
        return { healthy: true, driver: 'none' };
      }
      return app.storage.healthCheck();
    },
  });

  /**
   * HTTP Method: GET
   * Path: /health/live
   * Auth: None (public)
   * Rate Limit: Allowlisted (exempt)
   * Status Codes: 200 (OK)
   */
  app.get(
    '/health/live',
    {
      schema: {
        tags: ['Health'],
        summary: 'Liveness probe',
        description: 'Checks if the application process is running and accepting requests.',
        response: {
          200: healthLivenessResponseSchema,
        },
      },
    },
    async (_request, reply) => {
      const data = healthService.getLiveness();
      return reply.status(200).send(data);
    }
  );

  /**
   * HTTP Method: GET
   * Path: /health/ready
   * Auth: None (public)
   * Rate Limit: Allowlisted (exempt)
   * Status Codes: 200 (OK), 503 (Service Unavailable if any required dependency fails)
   */
  app.get(
    '/health/ready',
    {
      schema: {
        tags: ['Health'],
        summary: 'Readiness probe',
        description: 'Checks connectivity to downstream dependencies (PostgreSQL, Redis, Storage).',
        response: {
          200: healthReadinessResponseSchema,
          503: healthReadinessResponseSchema,
        },
      },
    },
    async (_request, reply) => {
      const data = await healthService.getReadiness();
      const statusCode = data.status === 'ok' ? 200 : 503;
      return reply.status(statusCode).send(data);
    }
  );
};
