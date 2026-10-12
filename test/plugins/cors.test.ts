/**
 * @file Integration tests verifying CORS origin matching, headers, and preflight requests.
 * @module test/plugins/cors
 */

import { describe, expect, it } from 'vitest';
import { buildApp } from '#src/app.js';
import {
  buildOriginValidator,
  parseOriginPatterns,
  validateCorsConfig,
} from '#src/plugins/cors.js';

describe('Phase 2: CORS Plugin', () => {
  describe('Origin pattern parsing & matching', () => {
    it('matches exact origins', () => {
      const validator = buildOriginValidator('https://example.com,https://app.io');
      expect(validator('https://example.com')).toBe(true);
      expect(validator('https://app.io')).toBe(true);
      expect(validator('https://other.com')).toBe(false);
      expect(validator(undefined)).toBe(false);
    });

    it('matches wildcard subdomains (*.example.com)', () => {
      const validator = buildOriginValidator('https://*.example.com');
      expect(validator('https://sub.example.com')).toBe(true);
      expect(validator('https://api.example.com')).toBe(true);
      expect(validator('https://example.com')).toBe(false);
      expect(validator('https://sub.other.com')).toBe(false);
    });

    it('matches regex entries (/^https:\\/\\/.*\\.regex\\.com$/)', () => {
      const validator = buildOriginValidator('/^https:\\/\\/.*\\.regex\\.com$/');
      expect(validator('https://alpha.regex.com')).toBe(true);
      expect(validator('https://beta.regex.com')).toBe(true);
      expect(validator('https://alpha.other.com')).toBe(false);
    });

    it('honors dev preset for local ports outside production', () => {
      const devValidator = buildOriginValidator('https://example.com', true, false);
      expect(devValidator('http://localhost:3000')).toBe(true);
      expect(devValidator('http://localhost:5173')).toBe(true);
      expect(devValidator('http://127.0.0.1:3000')).toBe(true);

      const prodValidator = buildOriginValidator('https://example.com', true, true);
      expect(prodValidator('http://localhost:3000')).toBe(false);
    });
  });

  describe('Boot-time safety validation', () => {
    it('rejects wildcard "*" when credentials are true unless allowAny is true', () => {
      expect(() =>
        validateCorsConfig({
          nodeEnv: 'development',
          origins: ['*'],
          credentials: true,
          allowAny: false,
        })
      ).toThrowError(/Security violation/);

      // Should succeed if allowAny is explicitly true
      expect(() =>
        validateCorsConfig({
          nodeEnv: 'development',
          origins: ['*'],
          credentials: true,
          allowAny: true,
        })
      ).not.toThrow();
    });

    it('refuses to start in production if CORS_ORIGINS is empty with credentials', () => {
      expect(() =>
        validateCorsConfig({
          nodeEnv: 'production',
          origins: [],
          credentials: true,
          allowAny: false,
        })
      ).toThrowError(/Production boot error: CORS_ORIGINS cannot be empty/);
    });

    it('refuses to start in production if origins contain wildcard "*" without allowAny', () => {
      expect(() =>
        validateCorsConfig({
          nodeEnv: 'production',
          origins: ['*'],
          credentials: false,
          allowAny: false,
        })
      ).toThrowError(/Production boot error/);
    });
  });

  describe('Fastify HTTP Pipeline CORS Behavior', () => {
    it('reflects allowed origin with Access-Control-Allow-Origin and credentials', async () => {
      const app = buildApp({
        disableDb: true,
        disableRedis: true,
        disableSwagger: true,
      });
      await app.ready();

      const res = await app.inject({
        method: 'GET',
        url: '/health/live',
        headers: { Origin: 'http://localhost:3000' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(res.headers['access-control-allow-credentials']).toBe('true');
      expect(res.headers.vary).toContain('Origin');
      await app.close();
    });

    it('does not emit CORS headers for disallowed origins without throwing', async () => {
      const app = buildApp({
        disableDb: true,
        disableRedis: true,
        disableSwagger: true,
      });
      await app.ready();

      const res = await app.inject({
        method: 'GET',
        url: '/health/live',
        headers: { Origin: 'https://evil-unauthorized-hacker.com' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
      expect(res.headers.vary).toContain('Origin');
      await app.close();
    });

    it('handles OPTIONS preflight before auth and returns max-age & allowed headers', async () => {
      const app = buildApp({
        disableDb: true,
        disableRedis: true,
        disableSwagger: true,
      });
      await app.ready();

      const res = await app.inject({
        method: 'OPTIONS',
        url: '/v1/users',
        headers: {
          Origin: 'http://localhost:3000',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type, Authorization, X-Request-ID',
        },
      });

      expect(res.statusCode).toBe(204);
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(res.headers['access-control-allow-methods']).toBeDefined();
      expect(res.headers['access-control-max-age']).toBe('86400');
      await app.close();
    });

    it('exposes critical headers including x-request-id, ETag, and RateLimit headers', async () => {
      const app = buildApp({
        disableDb: true,
        disableRedis: true,
        disableSwagger: true,
      });
      await app.ready();

      const res = await app.inject({
        method: 'GET',
        url: '/health/live',
        headers: { Origin: 'http://localhost:3000' },
      });

      const exposed = res.headers['access-control-expose-headers'];
      expect(exposed).toBeDefined();
      expect(exposed).toContain('x-request-id');
      expect(exposed).toContain('ETag');
      await app.close();
    });

    it('exposes isOriginAllowed decorator for WebSocket upgrade origin validation', async () => {
      const app = buildApp({
        disableDb: true,
        disableRedis: true,
        disableSwagger: true,
      });
      await app.ready();

      expect(typeof app.isOriginAllowed).toBe('function');
      expect(app.isOriginAllowed?.('http://localhost:3000')).toBe(true);
      expect(app.isOriginAllowed?.('https://malicious.org')).toBe(false);
      await app.close();
    });
  });
});
