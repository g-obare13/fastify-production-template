/**
 * @file Multi-tier rate limiting, progressive ban tracking, and WebSocket throttling.
 * @module plugins/rate-limit
 */

import fastifyRateLimit from '@fastify/rate-limit';
import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { env } from '#src/config/env.js';
import type { ProblemDetails } from '#src/lib/errors.js';
import {
  rateLimitRedisFailuresTotal,
  rateLimitViolationsTotal,
} from '#src/observability/metrics.js';

/** Rate limit quota and failure mode specification for an evaluated endpoint. */
export interface RateLimitTierConfig {
  max: number;
  timeWindow: number;
  tier: 'strict' | 'upload' | 'default';
  failClosed: boolean;
}

const STRICT_ROUTES = [
  '/v1/auth/login',
  '/v1/auth/signup',
  '/v1/auth/refresh',
  '/v1/auth/reset-password',
  '/v1/auth/forgot-password',
  '/v1/auth/verify-email',
];

const UPLOAD_ROUTES = ['/v1/files/presign', '/v1/files/upload'];

const ALLOWLIST_ROUTES = [
  '/health/live',
  '/health/ready',
  '/metrics',
  '/docs',
  '/openapi.json',
  '/openapi.yaml',
  '/schema.graphql',
];

/**
 * Resolves appropriate rate limit tier and quota for a request URL.
 *
 * @param url Request target path.
 * @returns Configured tier settings.
 */
export function determineTier(url: string): RateLimitTierConfig {
  const normalized = url.split('?')[0] ?? url;

  if (STRICT_ROUTES.some((r) => normalized === r || normalized.endsWith(r))) {
    return {
      max: env.RATE_LIMIT_STRICT_MAX,
      timeWindow: env.RATE_LIMIT_STRICT_WINDOW_MS,
      tier: 'strict',
      failClosed: true,
    };
  }

  if (UPLOAD_ROUTES.some((r) => normalized === r || normalized.endsWith(r))) {
    return {
      max: env.RATE_LIMIT_UPLOAD_MAX,
      timeWindow: env.RATE_LIMIT_UPLOAD_WINDOW_MS,
      tier: 'upload',
      failClosed: env.RATE_LIMIT_FAIL_MODE === 'closed',
    };
  }

  return {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW_MS,
    tier: 'default',
    failClosed: env.RATE_LIMIT_FAIL_MODE === 'closed',
  };
}

/** In-memory state manager tracking progressive bans and WebSocket concurrent connection limits. */
export class RateLimitManager {
  private bans = new Map<string, number>(); // key -> expiry timestamp
  private violations = new Map<string, number>(); // key -> count
  private wsIpConnections = new Map<string, number>();
  private wsUserConnections = new Map<string, number>();
  private wsMessages = new Map<string, { count: number; resetAt: number }>();

  /**
   * Checks whether a client identifier is currently under an active temporary ban.
   *
   * @param key Client identifier key (e.g. `ip:...` or `user:...`).
   * @returns Ban status and remaining seconds if banned.
   */
  isBanned(key: string): { banned: boolean; remainingSec?: number } {
    const expiresAt = this.bans.get(key);
    if (!expiresAt) return { banned: false };

    const now = Date.now();
    if (now >= expiresAt) {
      this.bans.delete(key);
      this.violations.delete(key);
      return { banned: false };
    }

    return { banned: true, remainingSec: Math.ceil((expiresAt - now) / 1000) };
  }

  /**
   * Records a rate limit violation and escalates to a temporary ban when threshold is reached.
   *
   * @param key Client identifier key.
   * @returns Escalation outcome including ban duration if newly banned.
   */
  recordViolation(key: string): { banned: boolean; banDurationSec?: number } {
    const count = (this.violations.get(key) ?? 0) + 1;
    this.violations.set(key, count);

    if (count >= env.RATE_LIMIT_BAN_THRESHOLD) {
      const banDurationMs = env.RATE_LIMIT_BAN_DURATION_MS;
      this.bans.set(key, Date.now() + banDurationMs);
      return { banned: true, banDurationSec: Math.ceil(banDurationMs / 1000) };
    }

    return { banned: false };
  }

  /**
   * Evaluates whether an incoming WebSocket connection exceeds per-IP or per-user concurrency limits.
   *
   * @param ip Remote client IP address.
   * @param userId Optional authenticated user ID.
   * @returns Admission decision with rejection reason when blocked.
   */
  canAcceptWsConnection(ip: string, userId?: string): { allowed: boolean; reason?: string } {
    const ipCount = this.wsIpConnections.get(ip) ?? 0;
    if (ipCount >= env.WS_MAX_CONNECTIONS_PER_IP) {
      return { allowed: false, reason: 'Max WebSocket connections per IP reached' };
    }

    if (userId) {
      const userCount = this.wsUserConnections.get(userId) ?? 0;
      if (userCount >= env.WS_MAX_CONNECTIONS_PER_USER) {
        return { allowed: false, reason: 'Max WebSocket connections per user reached' };
      }
      this.wsUserConnections.set(userId, userCount + 1);
    }

    this.wsIpConnections.set(ip, ipCount + 1);
    return { allowed: true };
  }

  /**
   * Decrements active WebSocket connection counters upon client disconnect.
   *
   * @param ip Remote client IP address.
   * @param userId Optional authenticated user ID.
   */
  recordWsDisconnect(ip: string, userId?: string): void {
    const ipCount = this.wsIpConnections.get(ip) ?? 0;
    if (ipCount > 1) {
      this.wsIpConnections.set(ip, ipCount - 1);
    } else {
      this.wsIpConnections.delete(ip);
    }

    if (userId) {
      const userCount = this.wsUserConnections.get(userId) ?? 0;
      if (userCount > 1) {
        this.wsUserConnections.set(userId, userCount - 1);
      } else {
        this.wsUserConnections.delete(userId);
      }
    }
  }

  /**
   * Checks per-connection WebSocket message frequency quotas.
   *
   * @param connId Connection identifier.
   * @returns True if message is within limit, false otherwise.
   */
  canAcceptWsMessage(connId: string): boolean {
    const now = Date.now();
    const current = this.wsMessages.get(connId);

    if (!current || now >= current.resetAt) {
      this.wsMessages.set(connId, { count: 1, resetAt: now + 1000 });
      return true;
    }

    if (current.count >= env.WS_MESSAGES_PER_SECOND) {
      return false;
    }

    current.count += 1;
    return true;
  }
}

/** Global singleton rate limit manager instance. */
export const rateLimitManager = new RateLimitManager();

/**
 * Registers multi-tier rate limiting with Redis backing and progressive ban escalation.
 *
 * Decorators added: `app.rateLimitManager`.
 * Env vars read: `RATE_LIMIT_ENABLED`, `RATE_LIMIT_STRICT_MAX`, `RATE_LIMIT_STRICT_WINDOW_MS`, `RATE_LIMIT_FAIL_MODE`, `RATE_LIMIT_UPLOAD_MAX`, `RATE_LIMIT_UPLOAD_WINDOW_MS`, `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_BAN_THRESHOLD`, `RATE_LIMIT_BAN_DURATION_MS`, `RATE_LIMIT_TRUSTED_CIDRS`.
 * Hooks registered: `onRequest` (checks progressive ban and route allowlists).
 *
 * @param app Fastify application instance.
 */
const rateLimitPlugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  if (!env.RATE_LIMIT_ENABLED) return;

  const isTest = process.env.VITEST === 'true';
  const trustedCidrs = env.RATE_LIMIT_TRUSTED_CIDRS.split(',').map((s) => s.trim());

  // Expose rate limit manager on app
  app.decorate('rateLimitManager', rateLimitManager);

  // Hook to enforce progressive ban, allowlists, and key calculation
  app.addHook('onRequest', async (request, reply) => {
    const path = request.raw.url?.split('?')[0] ?? '';

    // Allowlist check
    if (ALLOWLIST_ROUTES.some((r) => path === r || path.endsWith(r)) || path.startsWith('/docs')) {
      return;
    }

    // Trusted CIDR check
    if (trustedCidrs.includes(request.ip)) {
      return;
    }

    // Check progressive ban
    const banKey = request.user?.id ? `user:${request.user.id}` : `ip:${request.ip}`;
    const banStatus = rateLimitManager.isBanned(banKey);

    if (banStatus.banned) {
      const tierConfig = determineTier(path);
      rateLimitViolationsTotal.inc({ route: path, tier: tierConfig.tier });

      reply.header('Retry-After', String(banStatus.remainingSec ?? 60));
      reply.header('RateLimit-Remaining', '0');

      const problem: ProblemDetails = {
        type: 'https://api.example.com/errors/rate-limited',
        title: 'Too Many Requests',
        status: 429,
        detail: `Temporary ban in effect due to repeated violations. Try again in ${banStatus.remainingSec}s`,
        code: 'RATE_LIMITED',
        instance: path,
        requestId: (request.id as string) || 'unknown',
        retryAfter: banStatus.remainingSec,
      };

      return reply
        .status(429)
        .header('content-type', 'application/problem+json; charset=utf-8')
        .send(problem);
    }
  });

  const redisClient = isTest ? undefined : app.redis?.client;

  await app.register(fastifyRateLimit, {
    global: true,
    max: (request: FastifyRequest) => {
      const url = request.raw.url ?? '';
      const tier = determineTier(url);
      const roleMultiplier = request.user?.role === 'admin' ? 2 : 1;
      return tier.max * roleMultiplier;
    },
    timeWindow: (request: FastifyRequest) => {
      const url = request.raw.url ?? '';
      return determineTier(url).timeWindow;
    },
    redis: redisClient,
    allowList: (request: FastifyRequest) => {
      const path = request.raw.url?.split('?')[0] ?? '';
      if (ALLOWLIST_ROUTES.some((r) => path === r || path.endsWith(r)) || path.startsWith('/docs'))
        return true;
      if (trustedCidrs.includes(request.ip)) return true;
      return false;
    },
    keyGenerator: (request: FastifyRequest) => {
      const url = request.raw.url ?? '';
      const tier = determineTier(url);

      // Strict auth endpoints: keyed by IP + target email or user id
      if (tier.tier === 'strict') {
        const body = request.body as { email?: string; userId?: string } | undefined;
        const target = body?.email ?? body?.userId ?? '';
        return `strict:${request.ip}:${target}`;
      }

      // Authenticated keying
      if (request.user?.id) {
        return `user:${request.user.id}`;
      }
      if (request.apiKey?.id) {
        return `apikey:${request.apiKey.id}`;
      }

      // Default IP keying
      return `ip:${request.ip}`;
    },
    errorResponseBuilder: (request, context) => {
      const path = request.raw.url?.split('?')[0] ?? '';
      const tier = determineTier(path);
      const key = request.user?.id ? `user:${request.user.id}` : `ip:${request.ip}`;

      // Record violation for ban escalation
      rateLimitManager.recordViolation(key);
      rateLimitViolationsTotal.inc({ route: path, tier: tier.tier });

      const retryAfter = Math.ceil(context.ttl / 1000);

      const problem: ProblemDetails = {
        type: 'https://api.example.com/errors/rate-limited',
        title: 'Too Many Requests',
        status: 429,
        detail: `Rate limit exceeded. Try again in ${context.after}`,
        code: 'RATE_LIMITED',
        instance: path,
        requestId: (request.id as string) || 'unknown',
        retryAfter,
      };

      return problem;
    },
  });
};

export default fp(rateLimitPlugin, {
  name: 'rate-limit',
});
