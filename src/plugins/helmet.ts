/**
 * @file Security HTTP response headers and Content Security Policy (CSP) enforcement.
 * @module plugins/helmet
 */

import fastifyHelmet from '@fastify/helmet';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

/**
 * Registers helmet security headers and tailors CSP for documentation explorers.
 *
 * Decorators added: none.
 * Env vars read: `NODE_ENV`.
 * Hooks registered: `onSend` (overrides CSP header for documentation and GraphQL UI routes).
 *
 * @param app Fastify application instance.
 */
const helmetPlugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  await app.register(fastifyHelmet, {
    contentSecurityPolicy: process.env.NODE_ENV === 'production',
    crossOriginEmbedderPolicy: false,
  });

  // Relax CSP specifically for documentation and interactive explorer routes
  app.addHook('onSend', async (request, reply) => {
    const url = request.raw.url ?? '';
    if (url.startsWith('/docs') || url.startsWith('/graphql') || url.startsWith('/graphiql')) {
      reply.header(
        'content-security-policy',
        "default-src 'self' 'unsafe-inline' 'unsafe-eval' https: data: blob:;"
      );
    }
  });
};

export default fp(helmetPlugin, {
  name: 'helmet',
});
