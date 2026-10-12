/**
 * @file Health check service evaluating process state and downstream connectivity.
 * @module modules/health/service
 */

import type { HealthLivenessResponse, HealthReadinessResponse } from './schemas.js';

/** Dependency health check callback functions for database, cache, and storage. */
export interface HealthCheckProviders {
  checkDb?: () => Promise<{ healthy: boolean; latencyMs?: number; error?: string }>;
  checkRedis?: () => Promise<{ healthy: boolean; latencyMs?: number; error?: string }>;
  checkStorage?: () => Promise<{ healthy: boolean; driver: string; error?: string }>;
}

/** Service evaluating application operational health. */
export class HealthService {
  /**
   * Initializes health check service with optional subsystem probes.
   *
   * @param providers Probing callbacks for database, redis, and storage.
   */
  constructor(private readonly providers: HealthCheckProviders = {}) {}

  /**
   * Reports current process uptime and timestamp.
   *
   * @returns Liveness status descriptor.
   */
  getLiveness(): HealthLivenessResponse {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }

  /**
   * Probes all downstream connections and reports aggregated readiness status.
   *
   * @returns Aggregated readiness status across database, redis, and object storage.
   */
  async getReadiness(): Promise<HealthReadinessResponse> {
    const checks: HealthReadinessResponse['checks'] = {
      database: { status: 'disabled' },
      redis: { status: 'disabled' },
      storage: { status: 'disabled', driver: 'none' },
    };

    let hasFailure = false;

    // Database check
    if (this.providers.checkDb) {
      try {
        const res = await this.providers.checkDb();
        checks.database = {
          status: res.healthy ? 'healthy' : 'unhealthy',
          ...(res.latencyMs !== undefined ? { latencyMs: res.latencyMs } : {}),
          ...(res.error !== undefined ? { error: res.error } : {}),
        };
        if (!res.healthy) hasFailure = true;
      } catch (err) {
        checks.database = {
          status: 'unhealthy',
          error: (err as Error).message,
        };
        hasFailure = true;
      }
    }

    // Redis check
    if (this.providers.checkRedis) {
      try {
        const res = await this.providers.checkRedis();
        checks.redis = {
          status: res.healthy ? 'healthy' : 'unhealthy',
          ...(res.latencyMs !== undefined ? { latencyMs: res.latencyMs } : {}),
          ...(res.error !== undefined ? { error: res.error } : {}),
        };
        if (!res.healthy) hasFailure = true;
      } catch (err) {
        checks.redis = {
          status: 'unhealthy',
          error: (err as Error).message,
        };
        hasFailure = true;
      }
    }

    // Storage check
    if (this.providers.checkStorage) {
      try {
        const res = await this.providers.checkStorage();
        checks.storage = {
          status: res.driver === 'local' ? 'local' : res.healthy ? 'healthy' : 'unhealthy',
          driver: res.driver,
          ...(res.error !== undefined ? { error: res.error } : {}),
        };
        if (!res.healthy && res.driver !== 'local') hasFailure = true;
      } catch (err) {
        checks.storage = {
          status: 'unhealthy',
          driver: 'unknown',
          error: (err as Error).message,
        };
        hasFailure = true;
      }
    }

    return {
      status: hasFailure ? 'error' : 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks,
    };
  }
}
