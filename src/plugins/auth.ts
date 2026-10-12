/**
 * @file Multi-mode authentication plugin supporting Bearer JWT, HTTP-only cookie sessions, and API keys.
 * @module plugins/auth
 */

import fastifyCookie from '@fastify/cookie';
import fastifyJwt from '@fastify/jwt';
import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { env } from '#src/config/env.js';
import { hashToken } from '#src/lib/crypto.js';
import {
  CsrfViolationError,
  ErrorCode,
  ForbiddenError,
  UnauthorizedError,
} from '#src/lib/errors.js';
import { DrizzleAuthRepository } from '#src/modules/auth/repository.js';
import type { UserSession } from '#src/types/fastify.d.js';

/** JWT payload decoded from signed access tokens. */
export interface JwtPayload {
  sub: string;
  email: string;
  role: 'user' | 'admin';
}

/**
 * Registers JWT and cookie parsers, and decorates Fastify with multi-mode auth guards and cookie helpers.
 *
 * Decorators added:
 * - `reply.setAuthCookies`
 * - `reply.clearAuthCookies`
 * - `app.authenticate`
 * - `app.authenticateOptional`
 * - `app.authorize`
 * Env vars read:
 * - `COOKIE_SECRET`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `COOKIE_SECURE`, `COOKIE_SAME_SITE`, `COOKIE_DOMAIN`, `AUTH_COOKIE_NAME`, `REFRESH_COOKIE_NAME`, `CSRF_COOKIE_NAME`.
 * Hooks registered: none (guards are applied as preHandler decorators).
 *
 * @param app Fastify application instance.
 */
const authPlugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  await app.register(fastifyCookie, {
    secret: env.COOKIE_SECRET,
  });

  await app.register(fastifyJwt, {
    secret: env.JWT_SECRET,
    sign: {
      expiresIn: env.JWT_EXPIRES_IN,
    },
  });

  // Helper decorator to set HTTP-only authentication cookies
  app.decorateReply(
    'setAuthCookies',
    function (
      this: FastifyReply,
      tokens: {
        accessToken: string;
        refreshToken?: string | undefined;
        csrfToken?: string | undefined;
      }
    ) {
      const cookieOpts: {
        httpOnly: boolean;
        secure: boolean;
        sameSite: 'lax' | 'strict' | 'none';
        path: string;
        domain?: string;
      } = {
        httpOnly: true,
        secure: env.COOKIE_SECURE,
        sameSite: env.COOKIE_SAME_SITE,
        path: '/',
      };
      if (env.COOKIE_DOMAIN !== 'localhost') {
        cookieOpts.domain = env.COOKIE_DOMAIN;
      }

      this.setCookie(env.AUTH_COOKIE_NAME, tokens.accessToken, cookieOpts);

      if (tokens.refreshToken) {
        this.setCookie(env.REFRESH_COOKIE_NAME, tokens.refreshToken, cookieOpts);
      }

      if (tokens.csrfToken) {
        this.setCookie(env.CSRF_COOKIE_NAME, tokens.csrfToken, {
          ...cookieOpts,
          httpOnly: false, // Accessible by browser JavaScript for Double Submit
        });
      }

      return this;
    }
  );

  // Helper decorator to clear authentication cookies on logout
  app.decorateReply('clearAuthCookies', function (this: FastifyReply) {
    const clearOpts: { path: string; domain?: string } = {
      path: '/',
    };
    if (env.COOKIE_DOMAIN !== 'localhost') {
      clearOpts.domain = env.COOKIE_DOMAIN;
    }
    this.clearCookie(env.AUTH_COOKIE_NAME, clearOpts);
    this.clearCookie(env.REFRESH_COOKIE_NAME, clearOpts);
    this.clearCookie(env.CSRF_COOKIE_NAME, clearOpts);
    return this;
  });

  // Authenticate preHandler decorator supporting Bearer, Cookie, and API Key modes
  app.decorate('authenticate', async (request: FastifyRequest, _reply: FastifyReply) => {
    // 1. API Key Auth (x-api-key or Authorization: Api-Key <key>)
    const apiKeyHeader =
      request.headers['x-api-key'] ||
      (request.headers.authorization?.startsWith('Api-Key ')
        ? request.headers.authorization.slice(8).trim()
        : undefined);

    if (apiKeyHeader && typeof apiKeyHeader === 'string' && app.db?.client) {
      const repo = new DrizzleAuthRepository(app.db.client);
      const keyHash = hashToken(apiKeyHeader);
      const apiKeyRecord = await repo.findApiKeyByHash(keyHash);

      if (!apiKeyRecord) {
        throw new UnauthorizedError('Invalid or revoked API key', ErrorCode.API_KEY_INVALID);
      }

      if (apiKeyRecord.expiresAt && new Date() > apiKeyRecord.expiresAt) {
        throw new UnauthorizedError('API key has expired', ErrorCode.API_KEY_REVOKED);
      }

      const user = await repo.findUserById(apiKeyRecord.userId);
      if (!user || user.deletedAt) {
        throw new UnauthorizedError('User account not found', ErrorCode.UNAUTHORIZED);
      }

      // Track last used timestamp non-blockingly
      repo.updateApiKeyLastUsed(apiKeyRecord.id).catch(() => {});

      let scopes: string[] = ['*'];
      try {
        scopes = JSON.parse(apiKeyRecord.scopes);
      } catch {
        scopes = ['*'];
      }

      request.authMode = 'api-key';
      request.apiKey = {
        id: apiKeyRecord.id,
        name: apiKeyRecord.name,
        scopes,
      };
      request.user = {
        id: user.id,
        email: user.email,
        role: user.role as 'user' | 'admin',
        authMode: 'api-key',
        scopes,
        apiKeyId: apiKeyRecord.id,
      };
      return;
    }

    // 2. Bearer Token Auth (Authorization: Bearer <jwt>)
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const payload = await request.jwtVerify<JwtPayload>();
        const session: UserSession = {
          id: payload.sub,
          email: payload.email,
          role: payload.role,
          authMode: 'bearer',
        };
        request.authMode = 'bearer';
        request.user = session;
        return;
      } catch {
        throw new UnauthorizedError(
          'Invalid or expired authentication token',
          ErrorCode.AUTH_TOKEN_INVALID
        );
      }
    }

    // 3. HTTP-only Cookie Session Auth
    const cookieToken = request.cookies[env.AUTH_COOKIE_NAME];
    if (cookieToken) {
      try {
        const payload = app.jwt.verify<JwtPayload>(cookieToken);
        const session: UserSession = {
          id: payload.sub,
          email: payload.email,
          role: payload.role,
          authMode: 'cookie',
        };
        request.authMode = 'cookie';
        request.user = session;

        // CSRF Protection for state-modifying cookie-authenticated requests
        const unsafeMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
        if (unsafeMethods.includes(request.method)) {
          const csrfHeader = request.headers['x-csrf-token'];
          const csrfCookie = request.cookies[env.CSRF_COOKIE_NAME];

          if (!csrfHeader || !csrfCookie || csrfHeader !== csrfCookie) {
            throw new CsrfViolationError('CSRF token validation failed or missing');
          }
        }

        return;
      } catch (err) {
        if (err instanceof CsrfViolationError) throw err;
        throw new UnauthorizedError(
          'Invalid or expired session cookie',
          ErrorCode.AUTH_TOKEN_INVALID
        );
      }
    }

    throw new UnauthorizedError('Authentication required', ErrorCode.UNAUTHORIZED);
  });

  // Optional authentication decorator - sets request.user if credentials are valid, but does not throw
  app.decorate('authenticateOptional', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      if (app.authenticate) {
        await app.authenticate(request, reply);
      }
    } catch {
      // Unauthenticated: leave request.user as undefined
    }
  });

  // Reusable RBAC & Scope decorator
  app.decorate('authorize', (allowedRoles: Array<'user' | 'admin'>, requiredScope?: string) => {
    return async (request: FastifyRequest, _reply: FastifyReply) => {
      const user = request.user;
      if (!user) {
        throw new UnauthorizedError('Authentication required', ErrorCode.UNAUTHORIZED);
      }
      if (!allowedRoles.includes(user.role)) {
        throw new ForbiddenError(`Access denied. Requires one of: ${allowedRoles.join(', ')}`);
      }
      if (requiredScope && user.authMode === 'api-key') {
        const scopes = user.scopes ?? [];
        const hasScope = scopes.includes('*') || scopes.includes(requiredScope);
        if (!hasScope) {
          throw new ForbiddenError(`API key does not possess required scope: ${requiredScope}`);
        }
      }
    };
  });
};

export default fp(authPlugin, {
  name: 'auth',
});
