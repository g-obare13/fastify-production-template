/**
 * @file Global error handling plugin transforming exceptions into RFC 9457 Problem Details.
 * @module plugins/sensible
 */

import fastifySensible from '@fastify/sensible';
import type { FastifyError, FastifyInstance, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { AppError, type ProblemDetails } from '#src/lib/errors.js';

/**
 * Registers sensible utilities and customizes 404 and global error handlers with RFC 9457 schemas.
 *
 * Decorators added: Fastify sensible decorators (`httpErrors`, etc.).
 * Env vars read: `NODE_ENV`.
 * Hooks registered: `setErrorHandler`, `setNotFoundHandler`.
 *
 * @param app Fastify application instance.
 */
const errorHandlerPlugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  await app.register(fastifySensible);

  // Custom 404 handler returning RFC 9457 Problem Details
  app.setNotFoundHandler((request, reply) => {
    const requestId =
      (request.id as string) || (request.headers['x-request-id'] as string) || 'unknown';
    const instance = request.raw.url ?? '/';
    const problem: ProblemDetails = {
      type: 'https://api.example.com/errors/not-found',
      title: 'Not Found',
      status: 404,
      detail: `Route ${request.method} ${instance} not found`,
      code: 'NOT_FOUND',
      instance,
      requestId,
    };

    return reply
      .status(404)
      .header('content-type', 'application/problem+json; charset=utf-8')
      .send(problem);
  });

  app.setErrorHandler((error: FastifyError | AppError | Error, request, reply) => {
    const requestId =
      (request.id as string) || (request.headers['x-request-id'] as string) || 'unknown';
    const instance = request.raw.url ?? '/';

    // Handle AppError hierarchy
    if (error instanceof AppError) {
      request.log.warn({ err: error, requestId }, `AppError: ${error.message}`);
      const problem = error.toProblemDetails(requestId, instance);
      return reply
        .status(error.statusCode)
        .header('content-type', 'application/problem+json; charset=utf-8')
        .send(problem);
    }

    // Handle Fastify schema validation errors
    if ('validation' in error && error.validation) {
      request.log.warn({ err: error, requestId }, 'Validation error');
      const invalidParams = error.validation.map((v) => {
        const rawPath =
          v.instancePath ||
          ((v.params as { missingProperty?: string })?.missingProperty
            ? `/${(v.params as { missingProperty?: string }).missingProperty}`
            : '');
        const pointer = rawPath.startsWith('/') ? rawPath : `/${rawPath || 'body'}`;
        const name = pointer.replace(/^\//, '') || 'unknown';
        return {
          path: pointer,
          name,
          reason: v.message ?? 'Invalid value',
        };
      });

      const problem: ProblemDetails = {
        type: 'https://api.example.com/errors/validation-failed',
        title: 'Validation Failed',
        status: 422,
        detail: error.message || 'Request validation failed',
        code: 'VALIDATION_FAILED',
        instance,
        requestId,
        invalidParams,
      };

      return reply
        .status(422)
        .header('content-type', 'application/problem+json; charset=utf-8')
        .send(problem);
    }

    // Handle explicit 404 errors thrown inside route handlers
    if ('statusCode' in error && error.statusCode === 404) {
      const problem: ProblemDetails = {
        type: 'https://api.example.com/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: error.message || 'Resource not found',
        code: 'NOT_FOUND',
        instance,
        requestId,
      };
      return reply
        .status(404)
        .header('content-type', 'application/problem+json; charset=utf-8')
        .send(problem);
    }

    // Internal / Uncaught errors
    request.log.error({ err: error, requestId }, 'Unhandled internal server error');
    const isProd = process.env.NODE_ENV === 'production';
    const problem: ProblemDetails = {
      type: 'https://api.example.com/errors/internal-server-error',
      title: 'Internal Server Error',
      status: 500,
      detail: isProd ? 'An unexpected error occurred. Please contact support.' : error.message,
      code: 'INTERNAL_SERVER_ERROR',
      instance,
      requestId,
    };

    if (!isProd && error.stack) {
      problem.stack = error.stack;
    }

    return reply
      .status(500)
      .header('content-type', 'application/problem+json; charset=utf-8')
      .send(problem);
  });
};

export default fp(errorHandlerPlugin, {
  name: 'sensible-error-handler',
});
