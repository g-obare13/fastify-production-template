/**
 * @file Zod validation schemas and response DTOs for health check endpoints.
 * @module modules/health/schemas
 */

import { z } from 'zod';

/** Schema for process liveness status and uptime. */
export const healthLivenessResponseSchema = z.object({
  status: z.literal('ok'),
  timestamp: z.string().datetime(),
  uptime: z.number(),
});

/** Schema for readiness probe covering database, redis, and storage dependencies. */
export const healthReadinessResponseSchema = z.object({
  status: z.enum(['ok', 'degraded', 'error']),
  timestamp: z.string().datetime(),
  uptime: z.number(),
  checks: z.object({
    database: z.object({
      status: z.enum(['healthy', 'unhealthy', 'disabled']),
      latencyMs: z.number().optional(),
      error: z.string().optional(),
    }),
    redis: z.object({
      status: z.enum(['healthy', 'unhealthy', 'disabled']),
      latencyMs: z.number().optional(),
      error: z.string().optional(),
    }),
    storage: z.object({
      status: z.enum(['healthy', 'unhealthy', 'disabled', 'local']),
      driver: z.string(),
      error: z.string().optional(),
    }),
  }),
});

/**
 * Type representing the liveness check probe response payload.
 */
export type HealthLivenessResponse = z.infer<typeof healthLivenessResponseSchema>;

/**
 * Type representing the readiness check probe response payload with dependency statuses.
 */
export type HealthReadinessResponse = z.infer<typeof healthReadinessResponseSchema>;
