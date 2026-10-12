/**
 * @file Database plugin injecting Drizzle ORM client and managing pool lifecycle.
 * @module plugins/db
 */

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { type DbClient, createDbClient } from '#src/db/client.js';

/** Options for customizing the database plugin instance. */
export interface DbPluginOptions {
  client?: DbClient;
}

/**
 * Registers Drizzle database client and pool shutdown hook.
 *
 * Decorators added: `app.db` ({ client, healthCheck, close }).
 * Env vars read: `DATABASE_URL`, `DB_POOL_MIN`, `DB_POOL_MAX` (indirectly via `createDbClient`).
 * Hooks registered: `onClose` (gracefully drains and closes database connection pool).
 *
 * @param app Fastify application instance.
 * @param opts Configuration options for database client injection.
 */
const dbPlugin: FastifyPluginAsync<DbPluginOptions> = async (
  app: FastifyInstance,
  opts: DbPluginOptions
) => {
  const client = opts.client ?? createDbClient();

  app.decorate('db', {
    client: client.drizzle,
    healthCheck: client.healthCheck,
    close: client.close,
  });

  app.addHook('onClose', async () => {
    app.log.info('Closing database connection pool...');
    await client.close();
  });
};

export default fp(dbPlugin, {
  name: 'db',
});
