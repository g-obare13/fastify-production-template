/**
 * @file Mercurius GraphQL adapter with security rules, subscriptions, and telemetry.
 * @module plugins/graphql
 */

import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import {
  type DocumentNode,
  type ExecutionResult,
  NoSchemaIntrospectionCustomRule,
  type OperationDefinitionNode,
  type ValidationRule,
} from 'graphql';
import mercurius from 'mercurius';
import { env } from '#src/config/env.js';
import type { GraphQLContext } from '#src/graphql/context.js';
import { createLoaders } from '#src/graphql/loaders.js';
import {
  createComplexityLimitRule,
  createDepthLimitRule,
  createMaxAliasesRule,
  createMaxDirectivesRule,
} from '#src/graphql/rules/security.js';
import { schema } from '#src/graphql/schema.js';
import { AppError } from '#src/lib/errors.js';
import { createStorageProvider } from '#src/lib/storage/factory.js';
import type { StorageProvider } from '#src/lib/storage/provider.js';
import { DrizzleAuthRepository } from '#src/modules/auth/repository.js';
import { AuthService } from '#src/modules/auth/service.js';
import { DrizzleFilesRepository } from '#src/modules/files/repository.js';
import { FilesService } from '#src/modules/files/service.js';
import { DrizzleUsersRepository } from '#src/modules/users/repository.js';
import { UsersService } from '#src/modules/users/service.js';
import { graphqlOperationDuration, graphqlOperationsTotal } from '#src/observability/metrics.js';
import type { UserSession } from '#src/types/fastify.d.js';

/**
 * Registers Mercurius GraphQL server, security validation rules, and lifecycle metrics.
 *
 * Decorators added: `app.graphql`.
 * Env vars read:
 * `GRAPHQL_ENABLED`, `GRAPHQL_MAX_DEPTH`, `GRAPHQL_MAX_COMPLEXITY`, `GRAPHQL_MAX_ALIASES`, `GRAPHQL_MAX_DIRECTIVES`, `NODE_ENV`, `GRAPHQL_INTROSPECTION_ENABLED`, `GRAPHQL_PLAYGROUND_ENABLED`, `GRAPHQL_PERSISTED_QUERIES_ONLY`.
 * Hooks registered:
 * - `onRequest`: routes browser navigation to GraphiQL explorer.
 * - `preExecution`: records operation telemetry start time and labels.
 * - `onResolution`: observes query execution durations and increments Prometheus counters.
 *
 * @param app Fastify application instance.
 */
const graphqlPlugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  if (!env.GRAPHQL_ENABLED) return;
  if (!app.db?.client) return;

  const authRepo = new DrizzleAuthRepository(app.db.client);
  const usersRepo = new DrizzleUsersRepository(app.db.client);
  const filesRepo = new DrizzleFilesRepository(app.db.client);
  const storage = (app.storage?.provider ?? createStorageProvider()) as StorageProvider;

  const authService = new AuthService(authRepo, {
    sign: (payload) => app.jwt.sign(payload),
  });
  const usersService = new UsersService(usersRepo);
  const filesService = new FilesService(filesRepo, storage);

  // Security validation rules (Armor equivalents)
  const validationRules: ValidationRule[] = [
    createDepthLimitRule(env.GRAPHQL_MAX_DEPTH),
    createComplexityLimitRule(env.GRAPHQL_MAX_COMPLEXITY),
    createMaxAliasesRule(env.GRAPHQL_MAX_ALIASES),
    createMaxDirectivesRule(env.GRAPHQL_MAX_DIRECTIVES),
  ];

  // Disable introspection in production unless explicitly enabled
  if (env.NODE_ENV === 'production' && !env.GRAPHQL_INTROSPECTION_ENABLED) {
    validationRules.push(NoSchemaIntrospectionCustomRule);
  }

  let persistedQueries: Record<string, string> | undefined;
  try {
    const pPath = path.resolve(process.cwd(), 'src/graphql/persisted-queries.json');
    if (fs.existsSync(pPath)) {
      persistedQueries = JSON.parse(fs.readFileSync(pPath, 'utf8'));
    }
  } catch {
    // ignore
  }

  if (env.NODE_ENV !== 'production' && env.GRAPHQL_PLAYGROUND_ENABLED) {
    app.addHook('onRequest', async (request, reply) => {
      const url = request.raw.url?.split('?')[0] ?? '';
      if (url === '/graphql' && request.method === 'GET') {
        const accept = request.headers.accept || '';
        if (accept.includes('text/html')) {
          return reply.redirect('/graphiql');
        }
      }
    });
  }

  await app.register(mercurius, {
    schema,
    path: '/graphql',
    graphiql: env.NODE_ENV !== 'production' && env.GRAPHQL_PLAYGROUND_ENABLED,
    validationRules,
    ...(persistedQueries ? { persistedQueries } : {}),
    onlyPersisted: env.GRAPHQL_PERSISTED_QUERIES_ONLY && !!persistedQueries,
    context: async (request: FastifyRequest, reply: FastifyReply): Promise<GraphQLContext> => {
      // Authenticate using the exact same multi-mode auth core as REST
      if (!request.user && app.authenticateOptional) {
        await app.authenticateOptional(request, reply);
      }

      return {
        user: request.user ?? null,
        requestId: (request.id as string) || 'unknown',
        log: request.log,
        loaders: createLoaders(usersRepo, filesRepo),
        services: {
          auth: authService,
          users: usersService,
          files: filesService,
        },
      };
    },
    errorFormatter: (execution, ctx) => {
      const formatted = mercurius.defaultErrorFormatter(execution, ctx);
      const isProd = env.NODE_ENV === 'production';
      const graphCtx = ctx as unknown as GraphQLContext;

      if (formatted.response.errors) {
        formatted.response.errors = formatted.response.errors.map((err, idx) => {
          const original = execution.errors?.[idx]?.originalError;
          const code = original instanceof AppError ? original.code : 'INTERNAL_SERVER_ERROR';
          return {
            ...err,
            message:
              isProd && code === 'INTERNAL_SERVER_ERROR' ? 'Internal server error' : err.message,
            extensions: {
              ...(err.extensions ?? {}),
              code,
              requestId: graphCtx?.requestId ?? 'unknown',
            },
          };
        });
      }
      return formatted;
    },
    subscription: {
      fullWsTransport: true,
      verifyClient: (info, next) => {
        const origin = info.req.headers.origin || info.origin;
        if (origin && app.isOriginAllowed && !app.isOriginAllowed(origin)) {
          return next(false, 403, 'Forbidden origin');
        }
        next(true);
      },
      onConnect: async (data: { type?: string; payload?: Record<string, unknown> }) => {
        const payload = data.payload ?? {};
        const authHeader =
          (payload.authorization as string | undefined) ??
          (payload.Authorization as string | undefined) ??
          (payload.authToken as string | undefined);

        if (authHeader?.startsWith('Bearer ')) {
          try {
            const token = authHeader.slice(7);
            const decoded = app.jwt.verify<{
              sub: string;
              email: string;
              role: 'user' | 'admin';
            }>(token);
            const session: UserSession = {
              id: decoded.sub,
              email: decoded.email,
              role: decoded.role,
              authMode: 'bearer',
            };
            return { user: session };
          } catch {
            return false;
          }
        }
        return true;
      },
    },
  });

  // Instrumentation hooks for metrics, tracing, and structured logging
  app.graphql.addHook('preExecution', async (_schema, document: DocumentNode, context) => {
    const operationDef = document.definitions.find((d) => d.kind === 'OperationDefinition') as
      | OperationDefinitionNode
      | undefined;

    const operationName = operationDef?.name?.value || 'anonymous';
    const operationType = operationDef?.operation || 'query';

    (
      context as unknown as { __gqlStartTime?: number; __opName?: string; __opType?: string }
    ).__gqlStartTime = performance.now();
    (context as unknown as { __opName?: string }).__opName = operationName;
    (context as unknown as { __opType?: string }).__opType = operationType;

    graphqlOperationsTotal.inc({
      operation_name: operationName,
      operation_type: operationType,
      status: 'started',
    });

    const graphCtx = context as unknown as GraphQLContext;
    graphCtx.log.info(
      {
        operationName,
        operationType,
        requestId: graphCtx.requestId,
      },
      'GraphQL operation started'
    );
  });

  app.graphql.addHook('onResolution', async (execution: ExecutionResult, context) => {
    const meta = context as unknown as {
      __gqlStartTime?: number;
      __opName?: string;
      __opType?: string;
    };
    const operationName = meta.__opName || 'anonymous';
    const operationType = meta.__opType || 'query';

    if (meta.__gqlStartTime) {
      const durationSec = (performance.now() - meta.__gqlStartTime) / 1000;
      graphqlOperationDuration.observe(
        { operation_name: operationName, operation_type: operationType },
        durationSec
      );
    }

    const hasErrors = (execution.errors?.length ?? 0) > 0;
    graphqlOperationsTotal.inc({
      operation_name: operationName,
      operation_type: operationType,
      status: hasErrors ? 'error' : 'success',
    });
  });
};

export default fp(graphqlPlugin, {
  name: 'graphql',
});
