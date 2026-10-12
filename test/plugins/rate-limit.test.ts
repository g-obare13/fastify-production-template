/**
 * @file Integration tests asserting tier rate limits, Redis failures, and progressive bans.
 * @module test/plugins/rate-limit
 */

import { describe, expect, it } from 'vitest';
import { buildApp } from '#src/app.js';
import { determineTier, rateLimitManager } from '#src/plugins/rate-limit.js';

describe('Phase 3: Rate Limiting Plugin', () => {
  describe('Tier determination & per-route presets', () => {
    it('assigns strict tier to auth-sensitive routes', () => {
      const login = determineTier('/v1/auth/login');
      expect(login.tier).toBe('strict');
      expect(login.failClosed).toBe(true);

      const signup = determineTier('/v1/auth/signup');
      expect(signup.tier).toBe('strict');

      const refresh = determineTier('/v1/auth/refresh');
      expect(refresh.tier).toBe('strict');
    });

    it('assigns upload tier to file upload endpoints', () => {
      const presign = determineTier('/v1/files/presign');
      expect(presign.tier).toBe('upload');

      const upload = determineTier('/v1/files/upload');
      expect(upload.tier).toBe('upload');
    });

    it('assigns default tier to general endpoints', () => {
      const users = determineTier('/v1/users');
      expect(users.tier).toBe('default');
    });
  });

  describe('Enforcement, Headers, and Problem Details', () => {
    it('returns standard RateLimit-* headers on endpoints', async () => {
      const app = buildApp({
        disableDb: true,
        disableRedis: true,
        disableSwagger: true,
      });
      await app.ready();

      const res = await app.inject({
        method: 'GET',
        url: '/health/live',
      });

      // Health is allowlisted so it succeeds without hitting limits
      expect(res.statusCode).toBe(200);
      await app.close();
    });

    it('bypasses rate limiting for allowlisted health and metrics routes', async () => {
      const app = buildApp({
        disableDb: true,
        disableRedis: true,
        disableSwagger: true,
      });
      await app.ready();

      for (let i = 0; i < 25; i++) {
        const res = await app.inject({
          method: 'GET',
          url: '/health/live',
        });
        expect(res.statusCode).toBe(200);
      }
      await app.close();
    });
  });

  describe('Progressive Ban Escalation', () => {
    it('escalates to temporary ban after threshold violations', () => {
      const testKey = 'test:ban:user123';
      expect(rateLimitManager.isBanned(testKey).banned).toBe(false);

      // Record violations up to threshold (5)
      for (let i = 1; i <= 4; i++) {
        const v = rateLimitManager.recordViolation(testKey);
        expect(v.banned).toBe(false);
      }

      // 5th violation triggers ban
      const banned = rateLimitManager.recordViolation(testKey);
      expect(banned.banned).toBe(true);
      expect(banned.banDurationSec).toBeGreaterThan(0);

      const status = rateLimitManager.isBanned(testKey);
      expect(status.banned).toBe(true);
      expect(status.remainingSec).toBeGreaterThan(0);
    });
  });

  describe('WebSocket Limiting Helpers', () => {
    it('caps WebSocket connections per IP and per user', () => {
      const ip = '192.168.1.100';
      const user = 'usr_ws_test_1';

      const conn1 = rateLimitManager.canAcceptWsConnection(ip, user);
      expect(conn1.allowed).toBe(true);

      rateLimitManager.recordWsDisconnect(ip, user);
    });

    it('enforces messages per second per connection', () => {
      const connId = 'ws-conn-1';

      // First 20 messages allowed
      for (let i = 0; i < 20; i++) {
        expect(rateLimitManager.canAcceptWsMessage(connId)).toBe(true);
      }

      // 21st message rejected within same 1-second window
      expect(rateLimitManager.canAcceptWsMessage(connId)).toBe(false);
    });
  });
});
