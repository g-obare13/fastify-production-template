/**
 * @file Database migration execution runner applying pending Drizzle SQL migrations.
 * @module src/db/migrate
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pino from 'pino';
import { createDbClient } from './client.js';

const logger = pino({ name: 'db-migrate' });

/**
 * Connects to PostgreSQL, executes all pending schema migrations from src/db/migrations, and terminates connection.
 *
 * @returns Resolves when migrations have completed successfully
 */
export async function runMigrations(): Promise<void> {
  const client = createDbClient();
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const migrationsFolder = path.resolve(__dirname, 'migrations');

  logger.info({ migrationsFolder }, 'Running database migrations');
  const start = performance.now();

  try {
    await migrate(client.drizzle, { migrationsFolder });
    const duration = Math.round(performance.now() - start);
    logger.info({ durationMs: duration }, 'Migrations executed successfully');
  } catch (err) {
    logger.error({ err }, 'Migration failed');
    process.exit(1);
  } finally {
    await client.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations();
}
