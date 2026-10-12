/**
 * @file OpenAPI 3.1 schema generation, documentation hub, and interactive explorer (Scalar/Swagger UI).
 * @module plugins/swagger
 */

import fs from 'node:fs';
import path from 'node:path';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import fastifyScalar from '@scalar/fastify-api-reference';
import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { jsonSchemaTransform } from 'fastify-type-provider-zod';
import YAML from 'yaml';
import { env } from '#src/config/env.js';
import { ErrorCode } from '#src/lib/errors.js';

/**
 * Generates OpenAPI 3.1 specification from Zod schemas and exposes interactive reference UIs.
 *
 * Decorators added: Fastify swagger generators (`app.swagger`).
 * Env vars read:
 * `API_SERVERS`, `API_TITLE`, `API_DESCRIPTION`, `API_CONTACT_NAME`, `API_CONTACT_EMAIL`, `API_CONTACT_URL`, `API_LICENSE_NAME`, `API_LICENSE_URL`, `DOCS_ENABLED`, `DOCS_BASIC_AUTH_USER`, `DOCS_BASIC_AUTH_PASSWORD`, `DOCS_EXPOSE_SCHEMA`, `DOCS_UI`.
 * Hooks registered: `onRequest` (protects `/docs` with basic auth when enabled).
 *
 * @param app Fastify application instance.
 */
const swaggerPlugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  // Read version from package.json
  let appVersion = '1.0.0';
  try {
    const pkgPath = path.resolve(process.cwd(), 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      appVersion = pkg.version || '1.0.0';
    }
  } catch {
    // fallback to default
  }

  const servers = env.API_SERVERS.split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((url) => ({
      url,
      description: url.includes('localhost') ? 'Local Development Server' : 'Production API Server',
    }));

  await app.register(fastifySwagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: env.API_TITLE,
        description: env.API_DESCRIPTION,
        version: appVersion,
        contact: {
          name: env.API_CONTACT_NAME,
          email: env.API_CONTACT_EMAIL,
          url: env.API_CONTACT_URL,
        },
        license: {
          name: env.API_LICENSE_NAME,
          url: env.API_LICENSE_URL,
        },
      },
      servers:
        servers.length > 0
          ? servers
          : [{ url: 'http://localhost:3000', description: 'API server' }],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'Standard RFC 6750 Bearer JWT access token (e.g. from /v1/auth/login)',
          },
          cookieAuth: {
            type: 'apiKey',
            in: 'cookie',
            name: 'access_token',
            description: 'Signed httpOnly cookie session with CSRF protection',
          },
          apiKeyAuth: {
            type: 'apiKey',
            in: 'header',
            name: 'x-api-key',
            description: 'Hashed API key for service-to-service communication (e.g. app_...)',
          },
        },
        parameters: {
          CursorParam: {
            name: 'cursor',
            in: 'query',
            description: 'Opaque base64 cursor for keyset pagination',
            schema: {
              type: 'string',
              example: 'eyJpZCI6InVzcl8xMjMiLCJzb3J0VmFsdWUiOiIyMDI2LTEwLTExVDEyOjAwOjAwWiJ9',
            },
          },
          LimitParam: {
            name: 'limit',
            in: 'query',
            description: 'Maximum number of records to return (1-100)',
            schema: { type: 'integer', default: 20, minimum: 1, maximum: 100, example: 20 },
          },
          FieldsParam: {
            name: 'fields',
            in: 'query',
            description: 'Comma-delimited projection of fields to return (sparse fieldsets)',
            schema: { type: 'string', example: 'id,email,role' },
          },
          IncludeParam: {
            name: 'include',
            in: 'query',
            description: 'Comma-delimited list of related entities to include in the response',
            schema: { type: 'string', example: 'files,profile' },
          },
          IdempotencyKeyHeader: {
            name: 'Idempotency-Key',
            in: 'header',
            description:
              'Unique client-generated idempotency key (UUID or random string) to prevent duplicate execution of mutating requests',
            schema: { type: 'string', example: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d' },
          },
        },
        headers: {
          RateLimitLimit: {
            description: 'The maximum request quota allocated in the current window',
            schema: { type: 'integer', example: 100 },
          },
          RateLimitRemaining: {
            description: 'The number of remaining requests in the current window',
            schema: { type: 'integer', example: 95 },
          },
          RateLimitReset: {
            description: 'The number of seconds remaining until the rate limit window resets',
            schema: { type: 'integer', example: 45 },
          },
          RetryAfter: {
            description:
              'The number of seconds the client must wait before retrying after a 429 response',
            schema: { type: 'integer', example: 60 },
          },
          Deprecation: {
            description: 'Indicates the resource or API version has been deprecated (RFC 8594)',
            schema: { type: 'string', example: '@1740000000' },
          },
          Sunset: {
            description:
              'Indicates the date and time when the deprecated resource will become unavailable (RFC 8594)',
            schema: { type: 'string', format: 'date-time', example: '2026-12-31T23:59:59Z' },
          },
        },
        schemas: {
          ErrorCode: {
            type: 'string',
            enum: Object.values(ErrorCode),
            description: 'Stable machine-readable error codes across REST and GraphQL',
          },
          InvalidParam: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'JSON pointer or dotted path to invalid field',
                example: 'body.email',
              },
              name: { type: 'string', description: 'Field name', example: 'email' },
              reason: {
                type: 'string',
                description: 'Validation failure explanation',
                example: 'Invalid email format',
              },
            },
            required: ['path', 'name', 'reason'],
          },
          ProblemDetails: {
            type: 'object',
            description: 'RFC 9457 Problem Details for HTTP APIs',
            properties: {
              type: {
                type: 'string',
                format: 'uri',
                example: 'https://api.example.com/errors/validation-failed',
              },
              title: { type: 'string', example: 'Validation Failed' },
              status: { type: 'integer', example: 400 },
              detail: {
                type: 'string',
                example: 'One or more request parameters failed validation.',
              },
              instance: { type: 'string', example: '/v1/users' },
              code: { $ref: '#/components/schemas/ErrorCode' },
              requestId: { type: 'string', example: 'req_01JABCDEF123456789' },
              invalidParams: {
                type: 'array',
                items: { $ref: '#/components/schemas/InvalidParam' },
              },
            },
            required: ['type', 'title', 'status', 'code', 'requestId'],
          },
        },
        responses: {
          BadRequest: {
            description: 'Bad Request - The request parameters or body are malformed',
            content: {
              'application/problem+json': {
                schema: { $ref: '#/components/schemas/ProblemDetails' },
                example: {
                  type: 'https://api.example.com/errors/bad-request',
                  title: 'Bad Request',
                  status: 400,
                  detail: 'Invalid JSON payload received',
                  code: 'BAD_REQUEST',
                  requestId: 'req_01JABCDEF123',
                },
              },
            },
          },
          Unauthorized: {
            description:
              'Unauthorized - Authentication credentials are missing, expired, or invalid',
            content: {
              'application/problem+json': {
                schema: { $ref: '#/components/schemas/ProblemDetails' },
                example: {
                  type: 'https://api.example.com/errors/unauthorized',
                  title: 'Unauthorized',
                  status: 401,
                  detail: 'Bearer token is expired or invalid',
                  code: 'AUTH_TOKEN_INVALID',
                  requestId: 'req_01JABCDEF123',
                },
              },
            },
          },
          Forbidden: {
            description:
              'Forbidden - Insufficient role permissions or scope to access this resource',
            content: {
              'application/problem+json': {
                schema: { $ref: '#/components/schemas/ProblemDetails' },
                example: {
                  type: 'https://api.example.com/errors/forbidden',
                  title: 'Forbidden',
                  status: 403,
                  detail: 'Requires admin privileges',
                  code: 'FORBIDDEN',
                  requestId: 'req_01JABCDEF123',
                },
              },
            },
          },
          NotFound: {
            description: 'Not Found - The requested resource does not exist',
            content: {
              'application/problem+json': {
                schema: { $ref: '#/components/schemas/ProblemDetails' },
                example: {
                  type: 'https://api.example.com/errors/not-found',
                  title: 'Not Found',
                  status: 404,
                  detail: 'Resource was not found',
                  code: 'NOT_FOUND',
                  requestId: 'req_01JABCDEF123',
                },
              },
            },
          },
          Conflict: {
            description:
              'Conflict - A resource with the specified identifier or unique constraint already exists',
            content: {
              'application/problem+json': {
                schema: { $ref: '#/components/schemas/ProblemDetails' },
                example: {
                  type: 'https://api.example.com/errors/conflict',
                  title: 'Conflict',
                  status: 409,
                  detail: 'User with email already exists',
                  code: 'CONFLICT',
                  requestId: 'req_01JABCDEF123',
                },
              },
            },
          },
          UnprocessableEntity: {
            description: 'Unprocessable Entity - Semantic or schema validation failure',
            content: {
              'application/problem+json': {
                schema: { $ref: '#/components/schemas/ProblemDetails' },
                example: {
                  type: 'https://api.example.com/errors/validation-failed',
                  title: 'Unprocessable Entity',
                  status: 422,
                  detail: 'Validation failed for one or more fields',
                  code: 'VALIDATION_FAILED',
                  requestId: 'req_01JABCDEF123',
                  invalidParams: [
                    { path: 'body.email', name: 'email', reason: 'Invalid email format' },
                  ],
                },
              },
            },
          },
          TooManyRequests: {
            description: 'Too Many Requests - Rate limit exceeded or progressive ban in effect',
            headers: {
              'Retry-After': { $ref: '#/components/headers/RetryAfter' },
              'RateLimit-Limit': { $ref: '#/components/headers/RateLimitLimit' },
              'RateLimit-Remaining': { $ref: '#/components/headers/RateLimitRemaining' },
              'RateLimit-Reset': { $ref: '#/components/headers/RateLimitReset' },
            },
            content: {
              'application/problem+json': {
                schema: { $ref: '#/components/schemas/ProblemDetails' },
                example: {
                  type: 'https://api.example.com/errors/rate-limited',
                  title: 'Too Many Requests',
                  status: 429,
                  detail: 'Rate limit quota exceeded. Try again in 60s.',
                  code: 'RATE_LIMITED',
                  requestId: 'req_01JABCDEF123',
                },
              },
            },
          },
          InternalServerError: {
            description: 'Internal Server Error - Unexpected server-side failure',
            content: {
              'application/problem+json': {
                schema: { $ref: '#/components/schemas/ProblemDetails' },
                example: {
                  type: 'https://api.example.com/errors/internal-server-error',
                  title: 'Internal Server Error',
                  status: 500,
                  detail: 'An unexpected internal error occurred',
                  code: 'INTERNAL_SERVER_ERROR',
                  requestId: 'req_01JABCDEF123',
                },
              },
            },
          },
        },
      },
    },
    transform: (params) => {
      // Exclude non-REST internal endpoints
      if (
        params.url === '/graphql' ||
        params.url.startsWith('/graphql') ||
        params.url === '/metrics' ||
        params.url.startsWith('/metrics') ||
        params.url.startsWith('/openapi.') ||
        params.url.startsWith('/docs') ||
        params.url.startsWith('/graphiql')
      ) {
        return { schema: { hide: true }, url: params.url };
      }
      return jsonSchemaTransform(params);
    },
  });

  // Docs Access Control Hook (DOCS_ENABLED & Basic Auth)
  const isDocsUrl = (url: string) =>
    url === '/docs' ||
    url.startsWith('/docs/') ||
    url === '/openapi.json' ||
    url === '/openapi.yaml' ||
    url === '/schema.graphql';

  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const rawUrl = request.raw.url?.split('?')[0] ?? '';
    if (!isDocsUrl(rawUrl)) return;

    if (!env.DOCS_ENABLED) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'Documentation is disabled in this environment',
      });
    }

    if (env.DOCS_BASIC_AUTH_USER && env.DOCS_BASIC_AUTH_PASSWORD) {
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Basic ')) {
        reply.header('WWW-Authenticate', 'Basic realm="API Documentation"');
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Authentication required for API documentation',
        });
      }
      const credentials = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
      const [user, ...pwdParts] = credentials.split(':');
      const pwd = pwdParts.join(':');
      if (user !== env.DOCS_BASIC_AUTH_USER || pwd !== env.DOCS_BASIC_AUTH_PASSWORD) {
        reply.header('WWW-Authenticate', 'Basic realm="API Documentation"');
        return reply
          .status(401)
          .send({ error: 'Unauthorized', message: 'Invalid documentation credentials' });
      }
    }
  });

  // Raw Spec Endpoints
  app.get('/openapi.json', { schema: { hide: true } }, async (_request, reply) => {
    return reply.type('application/json; charset=utf-8').send(app.swagger());
  });

  app.get('/openapi.yaml', { schema: { hide: true } }, async (_request, reply) => {
    const spec = app.swagger();
    const yamlString = YAML.stringify(spec);
    return reply.type('text/yaml; charset=utf-8').send(yamlString);
  });

  // GraphQL Schema Endpoint
  if (env.DOCS_EXPOSE_SCHEMA) {
    app.get('/schema.graphql', { schema: { hide: true } }, async (_request, reply) => {
      const { printSchema, lexicographicSortSchema } = await import('graphql');
      const { schema } = await import('#src/graphql/schema.js');
      const sorted = lexicographicSortSchema(schema);
      const printed = printSchema(sorted);
      return reply.type('text/plain; charset=utf-8').send(printed);
    });
  }

  // Docs Overview Hub Page
  app.get('/docs/overview', { schema: { hide: true } }, async (_request, reply) => {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${env.API_TITLE} - Documentation Hub</title>
  <style>
    :root {
      --bg: #0f172a;
      --card-bg: #1e293b;
      --border: #334155;
      --text: #f8fafc;
      --muted: #94a3b8;
      --primary: #8b5cf6;
      --primary-hover: #7c3aed;
    }
    body {
      margin: 0;
      padding: 40px 20px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      display: flex;
      flex-direction: column;
      align-items: center;
      min-height: 100vh;
    }
    .container {
      max-width: 800px;
      width: 100%;
    }
    h1 {
      font-size: 2.25rem;
      margin-bottom: 8px;
      background: linear-gradient(135deg, #c084fc, #818cf8);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    p.lead {
      color: var(--muted);
      font-size: 1.1rem;
      margin-bottom: 32px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 20px;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 24px;
      text-decoration: none;
      color: inherit;
      transition: all 0.2s ease-in-out;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .card:hover {
      border-color: var(--primary);
      transform: translateY(-2px);
      box-shadow: 0 10px 25px -5px rgba(139, 92, 246, 0.15);
    }
    .card h2 {
      font-size: 1.25rem;
      margin: 0 0 8px 0;
      color: #e2e8f0;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .card p {
      color: var(--muted);
      font-size: 0.95rem;
      line-height: 1.5;
      margin: 0 0 16px 0;
    }
    .badge {
      display: inline-block;
      align-self: flex-start;
      padding: 4px 10px;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
      background: rgba(139, 92, 246, 0.15);
      color: #c084fc;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>${env.API_TITLE}</h1>
    <p class="lead">${env.API_DESCRIPTION}</p>
    <div class="grid">
      <a class="card" href="/docs">
        <div>
          <h2>📖 Interactive REST API Docs</h2>
          <p>Explore all REST endpoints, parameters, and schemas with interactive try-it-out tools.</p>
        </div>
        <span class="badge">Interactive (${env.DOCS_UI})</span>
      </a>
      <a class="card" href="/graphql">
        <div>
          <h2>🚀 GraphQL Explorer</h2>
          <p>Execute GraphQL queries, mutations, and introspect the code-first schema with DataLoader batching.</p>
        </div>
        <span class="badge">Interactive Explorer</span>
      </a>
      <a class="card" href="/openapi.json" target="_blank">
        <div>
          <h2>📜 OpenAPI 3.1 Specification</h2>
          <p>Download or inspect the complete, strictly-typed OpenAPI 3.1 JSON specification.</p>
        </div>
        <span class="badge">JSON Format</span>
      </a>
      <a class="card" href="/openapi.yaml" target="_blank">
        <div>
          <h2>📄 OpenAPI YAML Specification</h2>
          <p>Download the OpenAPI 3.1 specification formatted as clean YAML.</p>
        </div>
        <span class="badge">YAML Format</span>
      </a>
      <a class="card" href="/schema.graphql" target="_blank">
        <div>
          <h2>📑 GraphQL Schema SDL</h2>
          <p>Raw exported schema.graphql file with lexicographically sorted types and documentation.</p>
        </div>
        <span class="badge">Schema SDL</span>
      </a>
      <div class="card">
        <div>
          <h2>📦 TypeScript Client SDK</h2>
          <p>Framework-agnostic client package with single-flight refresh mutex and typed error handling.</p>
        </div>
        <span class="badge">@app/sdk (packages/sdk)</span>
      </div>
    </div>
  </div>
</body>
</html>`;
    return reply.type('text/html; charset=utf-8').send(html);
  });

  // UI Selection
  if (env.DOCS_UI === 'swagger') {
    await app.register(fastifySwaggerUi, {
      routePrefix: '/docs',
      uiConfig: {
        docExpansion: 'list',
        deepLinking: true,
      },
      staticCSP: false,
    });
  } else {
    // Default to Scalar
    await app.register(fastifyScalar as never, {
      routePrefix: '/docs',
      configuration: {
        theme: 'purple',
        metaData: {
          title: env.API_TITLE,
          description: env.API_DESCRIPTION,
        },
        defaultHttpClient: {
          targetKey: 'javascript',
          clientKey: 'fetch',
        },
        hiddenClients: false,
      },
    });
  }
};

export default fp(swaggerPlugin, {
  name: 'swagger',
});
