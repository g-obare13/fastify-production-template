/**
 * @file File storage plugin providing abstraction across local disk and AWS S3.
 * @module plugins/storage
 */

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { createStorageProvider } from '#src/lib/storage/factory.js';
import type { StorageProvider } from '#src/lib/storage/provider.js';

/** Options for customizing the storage plugin instance. */
export interface StoragePluginOptions {
  provider?: StorageProvider;
}

/**
 * Instantiates storage provider and decorates Fastify with storage operations.
 *
 * Decorators added: `app.storage` ({ provider, healthCheck }).
 * Env vars read: `STORAGE_DRIVER`, `STORAGE_LOCAL_DIR`, `STORAGE_S3_BUCKET`, etc. (via factory).
 * Hooks registered: none.
 *
 * @param app Fastify application instance.
 * @param opts Configuration options for storage provider injection.
 */
const storagePlugin: FastifyPluginAsync<StoragePluginOptions> = async (
  app: FastifyInstance,
  opts: StoragePluginOptions
) => {
  const provider = opts.provider ?? createStorageProvider();

  app.decorate('storage', {
    provider,
    healthCheck: () => provider.healthCheck(),
  });
};

export default fp(storagePlugin, {
  name: 'storage',
});
