/**
 * @file TypeScript module augmentations for Fastify request, reply, and instance extensions.
 * @module src/types/fastify
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Redis } from 'ioredis';
import type { Database } from '#src/db/client.js';

/**
 * Authentication transport modes recognized by the authentication plugin.
 */
export type AuthMode = 'bearer' | 'cookie' | 'api-key';

/**
 * Normalized user session attached to authenticated requests and GraphQL execution context.
 */
export interface UserSession {
  /** User unique identifier */
  id: string;
  /** User primary email address */
  email: string;
  /** Role authorization level */
  role: 'user' | 'admin';
  /** Transport mode through which credentials were validated */
  authMode?: AuthMode | undefined;
  /** Scopes granted to the current credential */
  scopes?: string[] | undefined;
  /** API key ID if authenticated via API key */
  apiKeyId?: string | undefined;
  /** Session record ID if authenticated via cookie session */
  sessionId?: string | undefined;
}

/**
 * Metadata context for requests authenticated via scoped API key.
 */
export interface ApiKeyContext {
  /** API key unique identifier */
  id: string;
  /** Human-readable key label */
  name: string;
  /** Scopes permitted for this key */
  scopes: string[];
}

declare module '@fastify/jwt' {
  /** JWT token payload and user session bindings. */
  interface FastifyJWT {
    payload: {
      sub: string;
      email: string;
      role: 'user' | 'admin';
    };
    user: UserSession;
  }
}

declare module 'fastify' {
  /** FastifyInstance decoration extensions for application services. */
  interface FastifyInstance {
    db?: {
      client: Database;
      healthCheck: () => Promise<{ healthy: boolean; latencyMs?: number; error?: string }>;
      close: () => Promise<void>;
      [key: string]: unknown;
    };
    redis?: {
      client: Redis;
      healthCheck: () => Promise<{ healthy: boolean; latencyMs?: number; error?: string }>;
      close?: () => Promise<void>;
      [key: string]: unknown;
    };
    storage?: {
      healthCheck: () => Promise<{ healthy: boolean; driver: string; error?: string }>;
      [key: string]: unknown;
    };
    authenticate?: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authenticateOptional?: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authorize?: (
      allowedRoles: Array<'user' | 'admin'>,
      requiredScope?: string
    ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    isOriginAllowed?: (origin: string | undefined) => boolean;
    rateLimitManager?: import('#src/plugins/rate-limit.js').RateLimitManager;
  }

  /** FastifyRequest extensions for user identity, API key, and auth transport. */
  interface FastifyRequest {
    user?: UserSession | undefined;
    apiKey?: ApiKeyContext | undefined;
    authMode?: AuthMode | undefined;
  }

  /** FastifyReply extensions for deprecation headers and authentication cookies. */
  interface FastifyReply {
    deprecate?: (options?: { sunset?: string | Date; link?: string }) => FastifyReply;
    setAuthCookies?: (tokens: {
      accessToken: string;
      refreshToken?: string | undefined;
      csrfToken?: string | undefined;
    }) => FastifyReply;
    clearAuthCookies?: () => FastifyReply;
  }
}
