/**
 * @file Fastify application factory assembling security plugins, routes, metrics, and documentation.
 * @module app
 */

import fastifyEtag from '@fastify/etag';
import fastifyMultipart from '@fastify/multipart';
import Fastify, { type FastifyServerOptions } from 'fastify';
import {
  type ZodTypeProvider,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import type { Redis } from 'ioredis';
import { env } from '#src/config/env.js';
import type { DbClient } from '#src/db/client.js';
import { generateId } from '#src/lib/id.js';
import { authRoutes } from '#src/modules/auth/routes.js';
import { filesRoutes } from '#src/modules/files/routes.js';
import { healthRoutes } from '#src/modules/health/routes.js';
import { usersRoutes } from '#src/modules/users/routes.js';
import { httpRequestDuration, httpRequestsTotal, register } from '#src/observability/metrics.js';
import authPlugin from '#src/plugins/auth.js';
import compressPlugin from '#src/plugins/compress.js';
import corsPlugin from '#src/plugins/cors.js';
import dbPlugin from '#src/plugins/db.js';
import graphqlPlugin from '#src/plugins/graphql.js';
import helmetPlugin from '#src/plugins/helmet.js';
import idempotencyPlugin from '#src/plugins/idempotency.js';
import rateLimitPlugin from '#src/plugins/rate-limit.js';
import redisPlugin from '#src/plugins/redis.js';
import sensiblePlugin from '#src/plugins/sensible.js';
import storagePlugin from '#src/plugins/storage.js';
import swaggerPlugin from '#src/plugins/swagger.js';
import underPressurePlugin from '#src/plugins/under-pressure.js';

/** Options configuring test-isolation toggles and injected clients for buildApp. */
export interface AppOptions extends FastifyServerOptions {
  disableSwagger?: boolean;
  disableDb?: boolean;
  dbClient?: DbClient;
  disableRedis?: boolean;
  redisClient?: Redis;
  disableGraphql?: boolean;
  disableRateLimit?: boolean;
}

/**
 * Builds and configures the production-ready Fastify instance.
 *
 * Configures Zod type provider, security headers, logging redacting, CORS,
 * database pool, redis client, and REST/GraphQL routing.
 *
 * @param options Server configuration overrides and client injection options.
 * @returns Fully configured Fastify application ready to listen or inject requests.
 */
export function buildApp(options: AppOptions = {}) {
  const isProd = env.NODE_ENV === 'production';
  const isTest = process.env.VITEST === 'true';

  const loggerConfig: Record<string, unknown> = {
    level: isTest ? 'silent' : env.LOG_LEVEL,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'headers.authorization',
        'headers.cookie',
        'body.password',
        'body.refreshToken',
        'body.token',
        'token',
        'secret',
        'presignedUrl',
        'uploadUrl',
        'downloadUrl',
      ],
      censor: '[REDACTED]',
    },
  };

  if (!isProd && !isTest) {
    loggerConfig.transport = {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    };
  }

  const {
    disableSwagger,
    disableDb,
    dbClient,
    disableRedis,
    redisClient,
    disableGraphql,
    disableRateLimit,
    ...serverOptions
  } = options;

  if (isProd) {
    if (!env.TRUST_PROXY || env.TRUST_PROXY === 'true' || env.TRUST_PROXY === '*') {
      throw new Error(
        'Production boot error: TRUST_PROXY must be configured with a specific hop count or trusted CIDR list'
      );
    }
  }

  const trustProxyConfig: boolean | string | string[] = env.TRUST_PROXY.includes(',')
    ? env.TRUST_PROXY.split(',').map((s) => s.trim())
    : env.TRUST_PROXY === 'true'
      ? true
      : env.TRUST_PROXY === 'false'
        ? false
        : env.TRUST_PROXY;

  const app = Fastify({
    logger: loggerConfig,
    trustProxy: serverOptions.trustProxy ?? trustProxyConfig,
    genReqId: (req) => {
      const headerId = req.headers['x-request-id'];
      if (typeof headerId === 'string' && headerId.length > 0) {
        return headerId;
      }
      return generateId('req');
    },
    requestIdHeader: 'x-request-id',
    ...serverOptions,
  }).withTypeProvider<ZodTypeProvider>();

  // Set Zod as the single source of truth for validation and serialization
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Hook to ensure x-request-id header is always in the response and record metrics
  app.addHook('onRequest', async (request) => {
    (request.raw as { __startTime?: number }).__startTime = performance.now();
  });

  // Reply decorator for RFC 8594 Deprecation and Sunset headers
  app.decorateReply('deprecate', function (options?: { sunset?: string | Date; link?: string }) {
    this.header('Deprecation', 'true');
    if (options?.sunset) {
      const sunsetDate =
        options.sunset instanceof Date
          ? options.sunset.toUTCString()
          : new Date(options.sunset).toUTCString();
      this.header('Sunset', sunsetDate);
    }
    if (options?.link) {
      this.header('Link', `<${options.link}>; rel="sunset"`);
    }
    return this;
  });

  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);

    const traceparent = request.headers.traceparent;
    if (typeof traceparent === 'string' && traceparent.length > 0) {
      reply.header('traceparent', traceparent);
    }

    reply.header('vary', 'Origin, Accept-Encoding');
    if (request.method === 'GET' && !reply.hasHeader('cache-control')) {
      reply.header('cache-control', 'private, no-cache');
    }

    const startTime = (request.raw as { __startTime?: number }).__startTime;
    if (startTime) {
      const durationSec = (performance.now() - startTime) / 1000;
      const route = request.routeOptions?.url || request.raw.url || 'unknown';
      const statusCode = String(reply.statusCode);
      httpRequestsTotal.inc({ method: request.method, route, status_code: statusCode });
      httpRequestDuration.observe(
        { method: request.method, route, status_code: statusCode },
        durationSec
      );
    }
  });

  // Security and core plugins
  app.register(fastifyEtag);
  app.register(sensiblePlugin);
  app.register(helmetPlugin);
  app.register(corsPlugin);
  app.register(compressPlugin);
  app.register(authPlugin);
  app.register(storagePlugin);
  app.register(fastifyMultipart, {
    limits: {
      fileSize: env.STORAGE_MAX_FILE_SIZE_MB * 1024 * 1024,
      files: 1,
    },
  });

  if (!isTest) {
    app.register(underPressurePlugin);
  }

  // Redis, Rate-limiting, and Idempotency
  if (!disableRedis) {
    if (redisClient) {
      app.register(redisPlugin, { client: redisClient });
    } else {
      app.register(redisPlugin);
    }
    app.register(idempotencyPlugin);

    if (!disableRateLimit) {
      app.register(rateLimitPlugin);
    }
  }

  if (!disableSwagger) {
    app.register(swaggerPlugin);
  }

  // Database plugin & modules requiring DB
  if (!disableDb) {
    if (dbClient) {
      app.register(dbPlugin, { client: dbClient });
    } else {
      app.register(dbPlugin);
    }

    // Register REST modules under /v1
    if (env.REST_ENABLED) {
      app.register(authRoutes, { prefix: env.API_PREFIX });
      app.register(usersRoutes, { prefix: env.API_PREFIX });
      app.register(filesRoutes, { prefix: env.API_PREFIX });
    }

    // Register GraphQL surface
    if (env.GRAPHQL_ENABLED && !disableGraphql) {
      app.register(graphqlPlugin);
    }
  }

  // Metrics endpoint
  if (env.METRICS_ENABLED) {
    app.get('/metrics', async (_req, reply) => {
      reply.header('content-type', register.contentType);
      return register.metrics();
    });
  }

  // Register health checks at root
  app.register(healthRoutes);

  // Register health checks also under /v1
  app.register(healthRoutes, { prefix: env.API_PREFIX });

  return app;
}

/**
 * Type alias representing the configured Fastify application instance.
 */
export type AppInstance = ReturnType<typeof buildApp>;
