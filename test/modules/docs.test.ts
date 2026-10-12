/**
 * @file Integration tests verifying OpenAPI specification generation and documentation hub access.
 * @module test/modules/docs
 */

import { describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { buildApp } from '#src/app.js';
import { env } from '#src/config/env.js';

describe('API Documentation & OpenAPI 3.1 Specification', () => {
  async function createDocApp() {
    const app = buildApp({
      disableDb: true,
      disableRedis: true,
      disableSwagger: false,
    });
    await app.ready();
    return app;
  }

  it('generates a valid OpenAPI 3.1 specification with required root properties', async () => {
    const app = await createDocApp();
    try {
      const res = await app.inject({ method: 'GET', url: '/openapi.json' });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('application/json');

      const spec = JSON.parse(res.body);
      expect(spec.openapi).toMatch(/^3\.1/);
      expect(spec.info).toBeDefined();
      expect(spec.info.title).toBeDefined();
      expect(spec.info.version).toBeDefined();
      expect(spec.paths).toBeDefined();
      expect(spec.components).toBeDefined();
    } finally {
      await app.close();
    }
  });

  it('declares all authentication schemes in components.securitySchemes', async () => {
    const app = await createDocApp();
    try {
      const res = await app.inject({ method: 'GET', url: '/openapi.json' });
      const spec = JSON.parse(res.body);
      const schemes = spec.components?.securitySchemes;

      expect(schemes).toBeDefined();
      expect(schemes.bearerAuth).toBeDefined();
      expect(schemes.bearerAuth.type).toBe('http');
      expect(schemes.bearerAuth.scheme).toBe('bearer');

      expect(schemes.cookieAuth).toBeDefined();
      expect(schemes.cookieAuth.type).toBe('apiKey');
      expect(schemes.cookieAuth.in).toBe('cookie');

      expect(schemes.apiKeyAuth).toBeDefined();
      expect(schemes.apiKeyAuth.type).toBe('apiKey');
      expect(schemes.apiKeyAuth.in).toBe('header');
    } finally {
      await app.close();
    }
  });

  it('declares reusable components for parameters, headers, and problem details', async () => {
    const app = await createDocApp();
    try {
      const res = await app.inject({ method: 'GET', url: '/openapi.json' });
      const spec = JSON.parse(res.body);

      // Parameters
      const params = spec.components?.parameters;
      expect(params?.CursorParam).toBeDefined();
      expect(params?.LimitParam).toBeDefined();
      expect(params?.FieldsParam).toBeDefined();
      expect(params?.IdempotencyKeyHeader).toBeDefined();

      // Headers
      const headers = spec.components?.headers;
      expect(headers?.RateLimitLimit).toBeDefined();
      expect(headers?.RateLimitRemaining).toBeDefined();
      expect(headers?.RetryAfter).toBeDefined();
      expect(headers?.Deprecation).toBeDefined();

      // Schemas & Responses
      const schemas = spec.components?.schemas;
      expect(schemas?.ProblemDetails).toBeDefined();
      expect(schemas?.ErrorCode).toBeDefined();

      const responses = spec.components?.responses;
      expect(responses?.BadRequest).toBeDefined();
      expect(responses?.Unauthorized).toBeDefined();
      expect(responses?.Forbidden).toBeDefined();
      expect(responses?.NotFound).toBeDefined();
      expect(responses?.TooManyRequests).toBeDefined();
      expect(responses?.InternalServerError).toBeDefined();
    } finally {
      await app.close();
    }
  });

  it('guarantees every API route declares tags, summary, and description', async () => {
    const app = await createDocApp();
    try {
      const res = await app.inject({ method: 'GET', url: '/openapi.json' });
      const spec = JSON.parse(res.body);
      const httpMethods = ['get', 'post', 'put', 'patch', 'delete'];

      for (const [pathUrl, pathItem] of Object.entries<
        Record<string, { tags?: string[]; summary?: string; description?: string }>
      >(spec.paths)) {
        for (const [method, operation] of Object.entries(pathItem)) {
          if (!httpMethods.includes(method.toLowerCase())) continue;

          expect(
            operation.tags,
            `Route ${method.toUpperCase()} ${pathUrl} missing tags`
          ).toBeDefined();
          expect(
            operation.tags?.length,
            `Route ${method.toUpperCase()} ${pathUrl} has empty tags`
          ).toBeGreaterThan(0);

          expect(
            operation.summary,
            `Route ${method.toUpperCase()} ${pathUrl} missing summary`
          ).toBeDefined();
          expect(
            operation.summary?.trim().length,
            `Route ${method.toUpperCase()} ${pathUrl} has empty summary`
          ).toBeGreaterThan(0);

          expect(
            operation.description,
            `Route ${method.toUpperCase()} ${pathUrl} missing description`
          ).toBeDefined();
          expect(
            operation.description?.trim().length,
            `Route ${method.toUpperCase()} ${pathUrl} has empty description`
          ).toBeGreaterThan(0);
        }
      }
    } finally {
      await app.close();
    }
  });

  it('serves the OpenAPI specification formatted as YAML at /openapi.yaml', async () => {
    const app = await createDocApp();
    try {
      const res = await app.inject({ method: 'GET', url: '/openapi.yaml' });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/yaml');

      const parsedYaml = YAML.parse(res.body);
      expect(parsedYaml.openapi).toMatch(/^3\.1/);
      expect(parsedYaml.info.title).toBeDefined();
    } finally {
      await app.close();
    }
  });

  it('serves the GraphQL SDL schema at /schema.graphql when enabled', async () => {
    const app = await createDocApp();
    try {
      const res = await app.inject({ method: 'GET', url: '/schema.graphql' });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/plain');
      expect(res.body).toContain('type Query');
      expect(res.body).toContain('type User');
    } finally {
      await app.close();
    }
  });

  it('serves the Documentation Hub overview page at /docs/overview', async () => {
    const app = await createDocApp();
    try {
      const res = await app.inject({ method: 'GET', url: '/docs/overview' });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.body).toContain('Documentation Hub');
      expect(res.body).toContain('/docs');
      expect(res.body).toContain('/graphql');
    } finally {
      await app.close();
    }
  });

  it('enforces HTTP Basic Auth on documentation routes when credentials are configured', async () => {
    const originalUser = env.DOCS_BASIC_AUTH_USER;
    const originalPass = env.DOCS_BASIC_AUTH_PASSWORD;

    // Temporarily set credentials
    (env as Record<string, unknown>).DOCS_BASIC_AUTH_USER = 'admin';
    (env as Record<string, unknown>).DOCS_BASIC_AUTH_PASSWORD = 'secret_password_123';

    const app = await createDocApp();
    try {
      // 1. Unauthenticated request should be rejected with 401
      const unauth = await app.inject({ method: 'GET', url: '/openapi.json' });
      expect(unauth.statusCode).toBe(401);
      expect(unauth.headers['www-authenticate']).toContain('Basic');

      // 2. Invalid credentials should be rejected with 401
      const invalidAuth = await app.inject({
        method: 'GET',
        url: '/openapi.json',
        headers: {
          authorization: `Basic ${Buffer.from('admin:wrong_password').toString('base64')}`,
        },
      });
      expect(invalidAuth.statusCode).toBe(401);

      // 3. Valid credentials should be accepted with 200
      const validAuth = await app.inject({
        method: 'GET',
        url: '/openapi.json',
        headers: {
          authorization: `Basic ${Buffer.from('admin:secret_password_123').toString('base64')}`,
        },
      });
      expect(validAuth.statusCode).toBe(200);
    } finally {
      (env as Record<string, unknown>).DOCS_BASIC_AUTH_USER = originalUser;
      (env as Record<string, unknown>).DOCS_BASIC_AUTH_PASSWORD = originalPass;
      await app.close();
    }
  });

  it('returns 404 for documentation endpoints when DOCS_ENABLED is false', async () => {
    const originalDocsEnabled = env.DOCS_ENABLED;
    (env as Record<string, unknown>).DOCS_ENABLED = false;

    const app = await createDocApp();
    try {
      const resJson = await app.inject({ method: 'GET', url: '/openapi.json' });
      expect(resJson.statusCode).toBe(404);

      const resYaml = await app.inject({ method: 'GET', url: '/openapi.yaml' });
      expect(resYaml.statusCode).toBe(404);

      const resDocs = await app.inject({ method: 'GET', url: '/docs' });
      expect(resDocs.statusCode).toBe(404);
    } finally {
      (env as Record<string, unknown>).DOCS_ENABLED = originalDocsEnabled;
      await app.close();
    }
  });
});
