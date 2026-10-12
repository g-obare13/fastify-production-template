/**
 * @file PostgreSQL connection pool setup and Drizzle ORM client initialization.
 * @module src/db/client
 */

import { type NodePgDatabase, drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { env } from '#src/config/env.js';
import * as schema from './schema.js';

/**
 * Type alias for Drizzle ORM instance bound to the relational schema.
 */
export type Database = NodePgDatabase<typeof schema>;

/**
 * Encapsulated database client containing Drizzle ORM instance, connection pool, and health hooks.
 */
export interface DbClient {
  /** Drizzle ORM instance providing type-safe query builders */
  drizzle: Database;
  /** Underlying pg Pool managing active PostgreSQL connections */
  pool: pg.Pool;
  /** Executes a ping query and measures round-trip database latency */
  healthCheck: () => Promise<{ healthy: boolean; latencyMs?: number; error?: string }>;
  /** Gracefully terminates the connection pool and drains active connections */
  close: () => Promise<void>;
}

/**
 * Creates a pooled Postgres client sized from DATABASE_MAX_CONNECTIONS. Call once at boot and close on shutdown.
 *
 * @param customPool Optional existing pg.Pool instance (e.g. For integration testing)
 * @returns Fully initialized DbClient with health check and termination methods
 * @example
 * ```ts
 * const db = createDbClient();
 * const health = await db.healthCheck();
 * await db.close();
 * ```
 */
export function createDbClient(customPool?: pg.Pool): DbClient {
  const pool =
    customPool ??
    new pg.Pool({
      connectionString: env.DATABASE_URL,
      max: env.DATABASE_MAX_CONNECTIONS,
      idleTimeoutMillis: env.DATABASE_IDLE_TIMEOUT_MS,
      connectionTimeoutMillis: env.DATABASE_CONNECTION_TIMEOUT_MS,
    });

  const db = drizzle(pool, { schema });

  const healthCheck = async () => {
    const start = performance.now();
    try {
      await pool.query('SELECT 1');
      const latencyMs = Math.round(performance.now() - start);
      return { healthy: true, latencyMs };
    } catch (err) {
      return { healthy: false, error: (err as Error).message };
    }
  };

  const close = async () => {
    await pool.end();
  };

  return {
    drizzle: db,
    pool,
    healthCheck,
    close,
  };
}
