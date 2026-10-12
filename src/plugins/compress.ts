/**
 * @file Response payload compression plugin configuring gzip and deflate.
 * @module plugins/compress
 */

import fastifyCompress from '@fastify/compress';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

/**
 * Registers compression middleware for responses exceeding threshold.
 *
 * Decorators added: none.
 * Env vars read: none.
 * Hooks registered: `onSend` (registered internally by `@fastify/compress`).
 *
 * @param app Fastify application instance.
 */
const compressPlugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  await app.register(fastifyCompress, {
    encodings: ['gzip', 'deflate'],
    threshold: 1024,
  });
};

export default fp(compressPlugin, {
  name: 'compress',
});
