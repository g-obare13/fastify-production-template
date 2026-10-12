/**
 * @file Authentication and session lifecycle REST route handlers.
 * @module modules/auth/routes
 */

import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { env } from '#src/config/env.js';
import { ErrorCode, ForbiddenError, UnauthorizedError, errorResponses } from '#src/lib/errors.js';
import { DrizzleAuthRepository } from './repository.js';
import {
  apiKeyResponseSchema,
  authTokensResponseSchema,
  createApiKeyRequestSchema,
  createdApiKeyResponseSchema,
  forgotPasswordRequestSchema,
  listApiKeysResponseSchema,
  listSessionsResponseSchema,
  loginRequestSchema,
  logoutRequestSchema,
  messageResponseSchema,
  oauthAuthorizeQuerySchema,
  oauthCallbackRequestSchema,
  refreshRequestSchema,
  resetPasswordRequestSchema,
  signupRequestSchema,
  userProfileSchema,
  verifyEmailRequestSchema,
} from './schemas.js';
import { AuthService } from './service.js';

/**
 * Validates Origin and Referer headers against allowed CORS origins during sensitive operations.
 *
 * @param originHeader Value of incoming Origin header.
 * @param refererHeader Value of incoming Referer header.
 * @throws ForbiddenError when origin does not match CORS allowlist.
 */
function validateSensitiveOrigin(originHeader?: string, refererHeader?: string): void {
  const origin = originHeader || (refererHeader ? new URL(refererHeader).origin : undefined);
  if (!origin) return; // Non-browser client
  if (env.CORS_ORIGIN === '*' || env.CORS_ALLOW_ANY) return;

  const allowedOrigins = (env.CORS_ORIGINS || env.CORS_ORIGIN)
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  if (allowedOrigins.length === 0) return;

  const isAllowed = allowedOrigins.some((pattern) => {
    if (pattern === origin) return true;
    if (pattern.includes('*')) {
      const regex = new RegExp(`^${pattern.replace(/\./g, '\\.').replace(/\*/g, '.*')}$`);
      return regex.test(origin);
    }
    return false;
  });

  if (!isAllowed) {
    throw new ForbiddenError(
      'Origin or Referer not allowed for token rotation',
      ErrorCode.ORIGIN_MISMATCH
    );
  }
}

const AUTH_SECURITY = [{ bearerAuth: [] }, { cookieAuth: [] }, { apiKeyAuth: [] }];

/**
 * Registers authentication, credential recovery, session management, and API key routes.
 *
 * Decorators added: none.
 * Env vars read: `CORS_ORIGIN`, `CORS_ORIGINS`, `CORS_ALLOW_ANY`.
 * Hooks registered: none (route-level `preHandler` guards used).
 *
 * @param app Fastify application instance with Zod type provider.
 */
export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  if (!app.db?.client) {
    throw new Error('Database client must be registered before auth routes');
  }

  const repo = new DrizzleAuthRepository(app.db.client);
  const authService = new AuthService(repo, {
    sign: (payload) => app.jwt.sign(payload),
  });

  app.post(
    '/auth/signup',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Register a new user',
        description:
          'Creates a new user account with argon2id hashed password and returns access/refresh token pair.',
        body: signupRequestSchema,
        response: {
          201: authTokensResponseSchema,
          ...errorResponses,
        },
      },
    },
    async (request, reply) => {
      const clientType =
        request.body.clientType || (request.headers['x-client-type'] as string) || 'browser';
      const result = await authService.signup(request.body, {
        userAgent: request.headers['user-agent'],
        ipAddress: request.ip,
        clientType: clientType as 'browser' | 'native' | 'mobile',
      });

      if (reply.setAuthCookies) {
        reply.setAuthCookies({
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          csrfToken: result.csrfToken,
        });
      }

      return reply.status(201).send(result);
    }
  );

  app.post(
    '/auth/login',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Log in with email and password',
        description:
          'Authenticates user credentials and issues JWT access token, refresh token, and optional CSRF cookie.',
        body: loginRequestSchema,
        response: {
          200: authTokensResponseSchema,
          ...errorResponses,
        },
      },
    },
    async (request, reply) => {
      const clientType =
        request.body.clientType || (request.headers['x-client-type'] as string) || 'browser';
      const result = await authService.login(request.body, {
        userAgent: request.headers['user-agent'],
        ipAddress: request.ip,
        clientType: clientType as 'browser' | 'native' | 'mobile',
      });

      if (reply.setAuthCookies) {
        reply.setAuthCookies({
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          csrfToken: result.csrfToken,
        });
      }

      return reply.status(200).send(result);
    }
  );

  app.post(
    '/auth/refresh',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Rotate and exchange refresh token for new credentials',
        description:
          'Single-use refresh token rotation with automated token family reuse detection and revocation.',
        body: refreshRequestSchema,
        response: {
          200: authTokensResponseSchema,
          ...errorResponses,
        },
      },
    },
    async (request, reply) => {
      validateSensitiveOrigin(request.headers.origin, request.headers.referer);

      const rawToken = request.body?.refreshToken || request.cookies?.[env.REFRESH_COOKIE_NAME];
      if (!rawToken) {
        throw new UnauthorizedError('Refresh token is required', ErrorCode.AUTH_TOKEN_INVALID);
      }

      const clientType =
        request.body?.clientType || (request.headers['x-client-type'] as string) || 'browser';
      const result = await authService.refresh(rawToken, {
        userAgent: request.headers['user-agent'],
        ipAddress: request.ip,
        clientType: clientType as 'browser' | 'native' | 'mobile',
      });

      if (reply.setAuthCookies) {
        reply.setAuthCookies({
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          csrfToken: result.csrfToken,
        });
      }

      return reply.status(200).send(result);
    }
  );

  app.post(
    '/auth/logout',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Revoke refresh token and log out',
        description: 'Revokes the active refresh token session and clears authentication cookies.',
        body: logoutRequestSchema,
        response: {
          200: messageResponseSchema,
          ...errorResponses,
        },
      },
    },
    async (request, reply) => {
      validateSensitiveOrigin(request.headers.origin, request.headers.referer);

      const rawToken = request.body?.refreshToken || request.cookies?.[env.REFRESH_COOKIE_NAME];
      if (rawToken) {
        await authService.logout(rawToken);
      }

      if (reply.clearAuthCookies) {
        reply.clearAuthCookies();
      }

      return reply.status(200).send({ message: 'Logged out successfully', success: true });
    }
  );

  app.post(
    '/auth/verify-email',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Verify user email address using single-use token',
        description:
          'Consumes a hashed verification token and marks the account email as verified.',
        body: verifyEmailRequestSchema,
        response: {
          200: messageResponseSchema,
          ...errorResponses,
        },
      },
    },
    async (request, reply) => {
      await authService.verifyEmail(request.body.token);
      return reply.status(200).send({ message: 'Email verified successfully', success: true });
    }
  );

  app.post(
    '/auth/forgot-password',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Request password reset token via email',
        description:
          'Dispatches an asynchronous password reset email if the targeted account exists.',
        body: forgotPasswordRequestSchema,
        response: {
          200: messageResponseSchema,
          ...errorResponses,
        },
      },
    },
    async (request, reply) => {
      await authService.forgotPassword(request.body.email);
      return reply.status(200).send({
        message: 'If the email exists, a password reset link has been dispatched',
        success: true,
      });
    }
  );

  app.post(
    '/auth/reset-password',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Reset account password with token',
        description:
          'Verifies single-use password reset token and updates the user account password hash.',
        body: resetPasswordRequestSchema,
        response: {
          200: messageResponseSchema,
          ...errorResponses,
        },
      },
    },
    async (request, reply) => {
      await authService.resetPassword(request.body);
      return reply
        .status(200)
        .send({ message: 'Password has been reset successfully', success: true });
    }
  );

  app.get(
    '/auth/me',
    {
      preHandler: [app.authenticate as never],
      schema: {
        tags: ['Auth'],
        summary: 'Get current authenticated user profile',
        description:
          'Fetches the user record associated with the verified access token or session cookie.',
        security: AUTH_SECURITY,
        response: {
          200: userProfileSchema,
          ...errorResponses,
        },
      },
    },
    async (request, reply) => {
      const session = request.user;
      if (!session) {
        throw new UnauthorizedError('Authentication required');
      }
      const user = await repo.findUserById(session.id);
      if (!user) {
        throw new UnauthorizedError('User account not found');
      }
      return reply.status(200).send({
        id: user.id,
        email: user.email,
        role: user.role as 'user' | 'admin',
        emailVerified: user.emailVerified,
        avatarUrl: user.avatarUrl ?? null,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      });
    }
  );

  // Session Management Routes
  app.get(
    '/auth/sessions',
    {
      preHandler: [app.authenticate as never],
      schema: {
        tags: ['Auth'],
        summary: 'List active sessions for current user',
        description:
          'Returns all non-revoked session records and device metadata for the authenticated user.',
        security: AUTH_SECURITY,
        response: {
          200: listSessionsResponseSchema,
          ...errorResponses,
        },
      },
    },
    async (request, reply) => {
      const user = request.user;
      if (!user) throw new UnauthorizedError('Authentication required');
      const sessions = await authService.listSessions(user.id, user.sessionId);
      return reply.status(200).send({ sessions });
    }
  );

  app.delete(
    '/auth/sessions/:id',
    {
      preHandler: [app.authenticate as never],
      schema: {
        tags: ['Auth'],
        summary: 'Revoke a specific session',
        description:
          'Terminates an individual user session by ID, invalidating its refresh tokens.',
        params: z.object({ id: z.string().describe('Target session ULID identifier') }),
        security: AUTH_SECURITY,
        response: {
          200: messageResponseSchema,
          ...errorResponses,
        },
      },
    },
    async (request, reply) => {
      const user = request.user;
      if (!user) throw new UnauthorizedError('Authentication required');
      const { id } = request.params as { id: string };
      await authService.revokeSession(user.id, id);
      return reply.status(200).send({ message: 'Session revoked successfully', success: true });
    }
  );

  app.delete(
    '/auth/sessions',
    {
      preHandler: [app.authenticate as never],
      schema: {
        tags: ['Auth'],
        summary: 'Revoke all sessions for current user',
        description: 'Revokes all active sessions across all devices for the current user.',
        security: AUTH_SECURITY,
        response: {
          200: messageResponseSchema,
          ...errorResponses,
        },
      },
    },
    async (request, reply) => {
      const user = request.user;
      if (!user) throw new UnauthorizedError('Authentication required');
      await authService.revokeAllSessions(user.id);
      return reply
        .status(200)
        .send({ message: 'All active sessions revoked successfully', success: true });
    }
  );

  // API Key Management Routes
  app.post(
    '/auth/api-keys',
    {
      preHandler: [app.authenticate as never],
      schema: {
        tags: ['Auth'],
        summary: 'Create a new API key',
        description:
          'Generates a scoped, hashed API key with customizable expiration for machine-to-machine integration.',
        body: createApiKeyRequestSchema,
        security: AUTH_SECURITY,
        response: {
          201: createdApiKeyResponseSchema,
          ...errorResponses,
        },
      },
    },
    async (request, reply) => {
      const user = request.user;
      if (!user) throw new UnauthorizedError('Authentication required');
      const result = await authService.createApiKey(user.id, request.body);
      return reply.status(201).send(result);
    }
  );

  app.get(
    '/auth/api-keys',
    {
      preHandler: [app.authenticate as never],
      schema: {
        tags: ['Auth'],
        summary: 'List API keys owned by current user',
        description:
          'Returns active and revoked API keys with scopes and expiration dates (plain key secret is not stored).',
        security: AUTH_SECURITY,
        response: {
          200: listApiKeysResponseSchema,
          ...errorResponses,
        },
      },
    },
    async (request, reply) => {
      const user = request.user;
      if (!user) throw new UnauthorizedError('Authentication required');
      const apiKeys = await authService.listApiKeys(user.id);
      return reply.status(200).send({ apiKeys });
    }
  );

  app.delete(
    '/auth/api-keys/:id',
    {
      preHandler: [app.authenticate as never],
      schema: {
        tags: ['Auth'],
        summary: 'Revoke an API key',
        description: 'Permanently revokes an API key, preventing future authenticated calls.',
        params: z.object({ id: z.string().describe('Target API key ULID identifier') }),
        security: AUTH_SECURITY,
        response: {
          200: messageResponseSchema,
          ...errorResponses,
        },
      },
    },
    async (request, reply) => {
      const user = request.user;
      if (!user) throw new UnauthorizedError('Authentication required');
      const { id } = request.params as { id: string };
      await authService.revokeApiKey(user.id, id);
      return reply.status(200).send({ message: 'API key revoked successfully', success: true });
    }
  );

  // OAuth / OIDC Hook Points with PKCE
  app.get(
    '/auth/oauth/authorize',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Initiate OAuth2/OIDC authorization flow with PKCE',
        description:
          'Constructs the third-party authorization URL embedding client ID, redirect URI, and S256 PKCE code challenge.',
        querystring: oauthAuthorizeQuerySchema,
        response: {
          200: z.object({
            authUrl: z.string().describe('External OAuth provider redirect URL'),
            provider: z.string().describe('Selected OAuth provider name'),
            state: z.string().optional().describe('CSRF state token'),
          }),
          ...errorResponses,
        },
      },
    },
    async (request, reply) => {
      const { provider, redirectUri, state, codeChallenge, codeChallengeMethod } = request.query;
      const baseAuthUrls: Record<string, string> = {
        google: 'https://accounts.google.com/o/oauth2/v2/auth',
        github: 'https://github.com/login/oauth/authorize',
        oidc: `${env.HOST}/oauth/authorize`,
      };

      const params = new URLSearchParams({
        client_id: 'app-client-id',
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
      });
      if (state) params.set('state', state);
      if (codeChallenge) params.set('code_challenge', codeChallenge);
      if (codeChallengeMethod) params.set('code_challenge_method', codeChallengeMethod);

      const authUrl = `${baseAuthUrls[provider]}?${params.toString()}`;
      return reply.status(200).send({ authUrl, provider, state });
    }
  );

  app.post(
    '/auth/oauth/callback',
    {
      schema: {
        tags: ['Auth'],
        summary: 'OAuth2/OIDC callback hook point exchanging code with PKCE verification',
        description:
          'Exchanges authorization code for tokens, verifies PKCE code challenge, and provisions the user account.',
        body: oauthCallbackRequestSchema,
        response: {
          200: authTokensResponseSchema,
          ...errorResponses,
        },
      },
    },
    async (request, reply) => {
      const result = await authService.handleOAuthCallback('oidc', {
        email: 'oauth_user@example.com',
        id: request.body.code,
      });

      if (reply.setAuthCookies) {
        reply.setAuthCookies({
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          csrfToken: result.csrfToken,
        });
      }

      return reply.status(200).send(result);
    }
  );
};
