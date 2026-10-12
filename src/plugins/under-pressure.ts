/**
 * @file Process health monitoring and load-shedding under event loop and heap pressure.
 * @module plugins/under-pressure
 */

import underPressure from '@fastify/under-pressure';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

/**
 * Monitors memory and event loop saturation and sheds load when thresholds are breached.
 *
 * Decorators added: none.
 * Env vars read: none.
 * Hooks registered: `onRequest` (evaluates process health metrics before processing requests).
 *
 * @param app Fastify application instance.
 */
const underPressurePlugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  await app.register(underPressure, {
    maxEventLoopDelay: 1000,
    maxHeapUsedBytes: 1024 * 1024 * 1024, // 1GB
    maxRssBytes: 1.5 * 1024 * 1024 * 1024, // 1.5GB
    maxEventLoopUtilization: 0.98,
    pressureHandler: (request, _reply, type, value) => {
      request.log.warn({ type, value }, 'Server under pressure');
    },
  });
};

export default fp(underPressurePlugin, {
  name: 'under-pressure',
});
