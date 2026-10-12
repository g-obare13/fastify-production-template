/**
 * @file Cross-Origin Resource Sharing (CORS) security policy and origin validator.
 * @module plugins/cors
 */

import fastifyCors from '@fastify/cors';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { env } from '#src/config/env.js';

/** Compiled CORS matcher pattern and test predicate. */
export interface CorsMatcher {
  type: 'exact' | 'wildcard' | 'regex';
  test: (origin: string) => boolean;
  raw: string;
}

const DEV_PRESET_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:4200',
  'http://localhost:5173',
  'http://localhost:8081',
  'http://localhost:19006',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
];

/**
 * Parses comma-separated origin strings into executable matcher predicates.
 *
 * Supports literal strings, regex literals (`/pattern/`), and wildcard subdomain patterns (`*.domain.com`).
 *
 * @param rawOrigins Comma-delimited list of origin patterns.
 * @returns Array of compiled matchers.
 */
export function parseOriginPatterns(rawOrigins: string): CorsMatcher[] {
  const parts = rawOrigins
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return parts.map((pattern): CorsMatcher => {
    // Regex pattern: /regex/
    if (pattern.startsWith('/') && pattern.endsWith('/')) {
      const regex = new RegExp(pattern.slice(1, -1));
      return {
        type: 'regex',
        test: (o) => regex.test(o),
        raw: pattern,
      };
    }

    // Subdomain wildcard: e.g. https://*.example.com
    if (pattern.includes('*')) {
      const escaped = pattern
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // escape regex chars except *
        .replace(/\*/g, '[-a-zA-Z0-9]+'); // replace * with subdomain regex
      const regex = new RegExp(`^${escaped}$`);
      return {
        type: 'wildcard',
        test: (o) => regex.test(o),
        raw: pattern,
      };
    }

    // Exact origin match
    return {
      type: 'exact',
      test: (o) => o === pattern,
      raw: pattern,
    };
  });
}

/**
 * Enforces production security guarantees on CORS configuration.
 *
 * Rejects wildcard origins with credentials enabled unless explicitly overridden.
 *
 * @param config Evaluated configuration properties.
 * @throws Error when insecure wildcard credentials combinations are detected.
 */
export function validateCorsConfig(config: {
  nodeEnv: string;
  origins: string[];
  credentials: boolean;
  allowAny: boolean;
}): void {
  const hasWildcard = config.origins.includes('*');

  // Boot-time safety: never allow "*" with credentials unless CORS_ALLOW_ANY=true
  if (config.credentials && hasWildcard && !config.allowAny) {
    throw new Error(
      'Security violation: CORS wildcard "*" is not allowed with credentials enabled unless CORS_ALLOW_ANY=true'
    );
  }

  // In production, refuse to start if CORS_ORIGINS is empty while credentials are on,
  // or contains "*" without CORS_ALLOW_ANY=true
  if (config.nodeEnv === 'production') {
    if (config.credentials && config.origins.length === 0) {
      throw new Error(
        'Production boot error: CORS_ORIGINS cannot be empty when CORS credentials are enabled'
      );
    }
    if (hasWildcard && !config.allowAny) {
      throw new Error(
        'Production boot error: CORS origins cannot contain wildcard "*" without CORS_ALLOW_ANY=true'
      );
    }
  }
}

/**
 * Constructs an origin validation predicate based on origins configuration and dev presets.
 *
 * @param rawOrigins Comma-delimited origins string.
 * @param devPreset Whether to enable local development host presets.
 * @param isProd True when operating in production mode.
 * @returns Origin test function returning boolean.
 */
export function buildOriginValidator(
  rawOrigins: string,
  devPreset = false,
  isProd = false
): (origin: string | undefined) => boolean {
  const matchers = parseOriginPatterns(rawOrigins);

  return (origin: string | undefined): boolean => {
    if (!origin) return false;

    // Check dev preset if enabled outside production
    if (devPreset && !isProd) {
      if (DEV_PRESET_ORIGINS.includes(origin)) return true;
    }

    // Check parsed matchers
    for (const matcher of matchers) {
      if (matcher.raw === '*') return true;
      if (matcher.test(origin)) return true;
    }

    return false;
  };
}

/**
 * Registers CORS middleware and decorates Fastify with `isOriginAllowed`.
 *
 * Decorators added: `app.isOriginAllowed`
 * Env vars read: `NODE_ENV`, `CORS_ORIGINS`, `CORS_ORIGIN`, `CORS_CREDENTIALS`, `CORS_ALLOW_ANY`, `CORS_DEV_PRESET`, `CORS_ALLOWED_HEADERS`, `CORS_EXPOSED_HEADERS`, `CORS_METHODS`, `CORS_MAX_AGE`.
 * Hooks registered: `onRequest` (registered internally by `@fastify/cors`).
 *
 * @param app Fastify application instance.
 */
const corsPlugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  const isProd = env.NODE_ENV === 'production';
  const rawOrigins = env.CORS_ORIGINS || env.CORS_ORIGIN;
  const originsList = rawOrigins
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  // Validate CORS configuration at boot
  validateCorsConfig({
    nodeEnv: env.NODE_ENV,
    origins: originsList,
    credentials: env.CORS_CREDENTIALS,
    allowAny: env.CORS_ALLOW_ANY,
  });

  const isOriginAllowed = buildOriginValidator(rawOrigins, env.CORS_DEV_PRESET, isProd);

  // Expose isOriginAllowed helper on app for WebSocket & route validation
  app.decorate('isOriginAllowed', isOriginAllowed);

  const allowedHeaders = env.CORS_ALLOWED_HEADERS.split(',').map((h) => h.trim());
  const exposedHeaders = env.CORS_EXPOSED_HEADERS.split(',').map((h) => h.trim());
  const methods = env.CORS_METHODS.split(',').map((m) => m.trim());

  await app.register(fastifyCors, {
    origin: (origin, cb) => {
      // Dynamic origin callback: reflect origin only when allowed,
      // return false without throwing for disallowed origins
      if (!origin) {
        cb(null, false);
        return;
      }

      if (isOriginAllowed(origin)) {
        cb(null, true);
      } else {
        cb(null, false);
      }
    },
    credentials: env.CORS_CREDENTIALS,
    methods,
    allowedHeaders,
    exposedHeaders,
    maxAge: env.CORS_MAX_AGE,
    preflightContinue: false,
    strictPreflight: false,
  });
};

export default fp(corsPlugin, {
  name: 'cors',
});
