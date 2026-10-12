/**
 * @file Integration tests asserting liveness and readiness probe responses and error codes.
 * @module test/modules/health
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type AppInstance, buildApp } from '#src/app.js';
import type { DbClient } from '#src/db/client.js';

describe('Health Module & Core Plugins Integration', () => {
  let app: AppInstance;

  beforeAll(async () => {
    app = buildApp({
      disableSwagger: true,
      disableDb: true,
      disableRedis: true,
      disableGraphql: true,
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health/live returns 200 and liveness payload', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health/live',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeDefined();
    expect(body.uptime).toBeGreaterThanOrEqual(0);
    expect(response.headers['x-request-id']).toBeDefined();
  });

  it('GET /v1/health/live returns 200 under versioned prefix', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/health/live',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('ok');
  });

  it('GET /health/ready returns 200 with service checks', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health/ready',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe('ok');
    expect(body.checks).toBeDefined();
    expect(body.checks.database).toBeDefined();
    expect(body.checks.redis).toBeDefined();
    expect(body.checks.storage).toBeDefined();
  });

  it('evaluates custom database health check probe', async () => {
    const mockDbClient: DbClient = {
      drizzle: {} as never,
      pool: {} as never,
      healthCheck: async () => ({ healthy: true, latencyMs: 5 }),
      close: async () => {},
    };

    const dbApp = buildApp({
      disableSwagger: true,
      dbClient: mockDbClient,
      disableRedis: true,
      disableGraphql: true,
    });
    await dbApp.ready();

    const response = await dbApp.inject({
      method: 'GET',
      url: '/health/ready',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.checks.database.status).toBe('healthy');
    expect(body.checks.database.latencyMs).toBe(5);

    await dbApp.close();
  });

  it('preserves incoming X-Request-ID header in response', async () => {
    const customReqId = 'custom-request-id-456';
    const response = await app.inject({
      method: 'GET',
      url: '/health/live',
      headers: {
        'x-request-id': customReqId,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-request-id']).toBe(customReqId);
  });

  it('returns RFC 9457 Problem Details on 404', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/non-existent-route',
    });

    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toContain('application/problem+json');
    const body = response.json();
    expect(body.title).toBe('Not Found');
    expect(body.status).toBe(404);
    expect(body.code).toBe('NOT_FOUND');
    expect(body.requestId).toBeDefined();
  });
});
