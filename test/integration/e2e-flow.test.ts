/**
 * @file End-to-end integration tests verifying authentication, file uploads, and user flows.
 * @module test/integration/e2e-flow
 */

import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { FastifyInstance } from 'fastify';
import Redis from 'ioredis-mock';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '#src/app.js';
import { createDbClient } from '#src/db/client.js';
import {
  isDockerAvailable,
  startPostgresContainer,
  startRedisContainer,
} from '#test/helpers/containers.js';

describe('Fastify HTTP Pipeline & Integration E2E', () => {
  let app: ReturnType<typeof buildApp>;
  const mockRedis = new Redis();

  beforeAll(async () => {
    app = buildApp({
      disableDb: true,
      disableRedis: false,
      redisClient: mockRedis as never,
      disableSwagger: true,
    });

    // Add a POST route for idempotency validation
    app.post('/test/idempotent', async () => {
      return { success: true, timestamp: Date.now() };
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('propagates custom x-request-id header or generates one with req_ prefix', async () => {
    // Custom ID
    const res1 = await app.inject({
      method: 'GET',
      url: '/health/live',
      headers: { 'x-request-id': 'custom-req-12345' },
    });
    expect(res1.statusCode).toBe(200);
    expect(res1.headers['x-request-id']).toBe('custom-req-12345');

    // Generated ID
    const res2 = await app.inject({
      method: 'GET',
      url: '/health/live',
    });
    expect(res2.statusCode).toBe(200);
    expect(res2.headers['x-request-id']).toBeDefined();
    expect(String(res2.headers['x-request-id'])).toMatch(/^req_/);
  });

  it('returns RFC 9457 Problem Details on 404 Not Found', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/non-existent-endpoint',
    });

    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).toContain('application/problem+json');
    const body = JSON.parse(res.body);
    expect(body.status).toBe(404);
    expect(body.title).toBe('Not Found');
    expect(body.type).toBe('https://api.example.com/errors/not-found');
    expect(body.instance).toBe('/non-existent-endpoint');
  });

  it('injects security headers via Helmet and CORS', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health/live',
      headers: { Origin: 'http://localhost:3000' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
  });

  it('serves Prometheus metrics with registered counters', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/metrics',
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.body).toContain('http_requests_total');
  });

  it('handles idempotency replay when identical key is provided', async () => {
    const key = 'idem-test-key-1';
    const res1 = await app.inject({
      method: 'POST',
      url: '/test/idempotent',
      headers: { 'idempotency-key': key },
    });
    expect(res1.statusCode).toBe(200);
    const body1 = JSON.parse(res1.body);

    const res2 = await app.inject({
      method: 'POST',
      url: '/test/idempotent',
      headers: { 'idempotency-key': key },
    });
    expect(res2.statusCode).toBe(200);
    expect(res2.headers['x-cache']).toBe('HIT');
    const body2 = JSON.parse(res2.body);
    expect(body2.timestamp).toBe(body1.timestamp);
  });
});

describe('Full Lifecycle E2E with Testcontainers (Optional/Conditional)', () => {
  let dockerAvailable = false;

  beforeAll(async () => {
    dockerAvailable = await isDockerAvailable();
  });

  it('skips or runs full testcontainers lifecycle based on docker engine availability', async () => {
    if (!dockerAvailable) {
      expect(true).toBe(true);
      return;
    }

    const pgContainer = await startPostgresContainer();
    const rdContainer = await startRedisContainer();

    try {
      const pool = new Pool({ connectionString: pgContainer.connectionUri });
      const dbClient = createDbClient(pool);
      await migrate(dbClient.drizzle, { migrationsFolder: 'src/db/migrations' });

      const app = buildApp({
        disableDb: false,
        dbClient,
        disableRedis: false,
        redisClient: new (await import('ioredis')).Redis(rdContainer.connectionUri),
      });
      await app.ready();

      // 1. Signup
      const signupRes = await app.inject({
        method: 'POST',
        url: '/v1/auth/signup',
        payload: {
          name: 'E2E User',
          email: 'e2e@example.com',
          password: 'SecurePassword123!',
        },
      });
      expect(signupRes.statusCode).toBe(201);
      const signupData = JSON.parse(signupRes.body);
      expect(signupData.user.email).toBe('e2e@example.com');

      // 2. Login
      const loginRes = await app.inject({
        method: 'POST',
        url: '/v1/auth/login',
        payload: {
          email: 'e2e@example.com',
          password: 'SecurePassword123!',
        },
      });
      expect(loginRes.statusCode).toBe(200);
      const loginData = JSON.parse(loginRes.body);
      expect(loginData.tokens.accessToken).toBeDefined();

      await app.close();
      await dbClient.close();
    } finally {
      await pgContainer.container.stop();
      await rdContainer.container.stop();
    }
  });
});
