/**
 * @file Application environment variable validation schema and runtime loader.
 * @module src/config/env
 */

import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

/**
 * Strict Zod schema for validating and transforming environment variables at process boot.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  // CORS & Network
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  CORS_ORIGINS: z.string().optional(),
  CORS_CREDENTIALS: z
    .string()
    .transform((v) => v === 'true')
    .default('true'),
  CORS_METHODS: z.string().default('GET,POST,PUT,PATCH,DELETE,OPTIONS'),
  CORS_ALLOWED_HEADERS: z
    .string()
    .default(
      'Content-Type,Authorization,X-Request-ID,Idempotency-Key,X-Client-Type,X-API-Key,X-CSRF-Token,Traceparent'
    ),
  CORS_EXPOSED_HEADERS: z
    .string()
    .default(
      'x-request-id,RateLimit-Limit,RateLimit-Remaining,RateLimit-Reset,Retry-After,ETag,Location,Content-Disposition,Deprecation,Sunset,Link'
    ),
  CORS_MAX_AGE: z.coerce.number().default(86400),
  CORS_DEV_PRESET: z
    .string()
    .transform((v) => v === 'true')
    .default('true'),
  CORS_ALLOW_ANY: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),
  TRUST_PROXY: z.string().default('127.0.0.1,::1'),

  API_PREFIX: z.string().default('/v1'),
  REST_ENABLED: z
    .string()
    .transform((v) => v === 'true')
    .default('true'),
  GRAPHQL_ENABLED: z
    .string()
    .transform((v) => v === 'true')
    .default('true'),

  // API Documentation & Controls
  DOCS_ENABLED: z
    .string()
    .transform((v) => v === 'true')
    .default(process.env.NODE_ENV !== 'production' ? 'true' : 'false'),
  DOCS_UI: z.enum(['scalar', 'swagger']).default('scalar'),
  DOCS_BASIC_AUTH_USER: z.string().optional(),
  DOCS_BASIC_AUTH_PASSWORD: z.string().optional(),
  DOCS_EXPOSE_SCHEMA: z
    .string()
    .transform((v) => v === 'true')
    .default('true'),
  API_TITLE: z.string().default('Fastify Production API'),
  API_DESCRIPTION: z
    .string()
    .default('Production-grade Fastify template with REST, GraphQL, Auth, and Storage'),
  API_CONTACT_NAME: z.string().default('API Support'),
  API_CONTACT_EMAIL: z.string().default('support@example.com'),
  API_CONTACT_URL: z.string().default('https://example.com/support'),
  API_LICENSE_NAME: z.string().default('MIT'),
  API_LICENSE_URL: z.string().default('https://opensource.org/licenses/MIT'),
  API_SERVERS: z.string().default('http://localhost:3000'),

  // Auth & Security
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters long'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_EXPIRES_DAYS: z.coerce.number().default(7),
  COOKIE_SECRET: z.string().min(32, 'COOKIE_SECRET must be at least 32 characters long'),
  COOKIE_DOMAIN: z.string().default('localhost'),
  COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  COOKIE_SECURE: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),
  AUTH_COOKIE_NAME: z.string().default('access_token'),
  REFRESH_COOKIE_NAME: z.string().default('refresh_token'),
  CSRF_COOKIE_NAME: z.string().default('csrf_token'),

  // Rate Limiting
  RATE_LIMIT_ENABLED: z
    .string()
    .transform((v) => v === 'true')
    .default('true'),
  RATE_LIMIT_MAX: z.coerce.number().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_FAIL_MODE: z.enum(['open', 'closed']).default('closed'),
  RATE_LIMIT_BAN_THRESHOLD: z.coerce.number().default(5),
  RATE_LIMIT_BAN_DURATION_MS: z.coerce.number().default(900000),
  RATE_LIMIT_TRUSTED_CIDRS: z.string().default('127.0.0.1,::1'),
  RATE_LIMIT_STRICT_MAX: z.coerce.number().default(10),
  RATE_LIMIT_STRICT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_UPLOAD_MAX: z.coerce.number().default(20),
  RATE_LIMIT_UPLOAD_WINDOW_MS: z.coerce.number().default(60000),
  WS_MAX_CONNECTIONS_PER_IP: z.coerce.number().default(50),
  WS_MAX_CONNECTIONS_PER_USER: z.coerce.number().default(10),
  WS_MESSAGES_PER_SECOND: z.coerce.number().default(20),

  // Database
  DATABASE_URL: z.string().url(),
  DATABASE_MAX_CONNECTIONS: z.coerce.number().default(20),
  DATABASE_IDLE_TIMEOUT_MS: z.coerce.number().default(30000),
  DATABASE_CONNECTION_TIMEOUT_MS: z.coerce.number().default(5000),

  // Redis
  REDIS_URL: z.string().url(),
  REDIS_KEY_PREFIX: z.string().default('app:'),

  // Storage
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('./uploads'),
  STORAGE_ALLOW_LOCAL_IN_PROD: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),
  S3_BUCKET: z.string().default('app-uploads'),
  S3_REGION: z.string().default('us-east-1'),
  S3_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),
  S3_PUBLIC_BASE_URL: z.string().optional(),
  S3_PRESIGN_TTL_SECONDS: z.coerce.number().default(900),
  STORAGE_MAX_FILE_SIZE_MB: z.coerce.number().default(25),
  STORAGE_ALLOWED_MIME_TYPES: z.string().default('image/jpeg,image/png,image/webp,application/pdf'),
  STORAGE_KEY_PREFIX: z.string().default('uploads'),

  // GraphQL
  GRAPHQL_PLAYGROUND_ENABLED: z
    .string()
    .transform((v) => v === 'true')
    .default('true'),
  GRAPHQL_INTROSPECTION_ENABLED: z
    .string()
    .transform((v) => v === 'true')
    .default('true'),
  GRAPHQL_MAX_DEPTH: z.coerce.number().default(10),
  GRAPHQL_MAX_COMPLEXITY: z.coerce.number().default(1000),
  GRAPHQL_MAX_ALIASES: z.coerce.number().default(15),
  GRAPHQL_MAX_DIRECTIVES: z.coerce.number().default(15),
  GRAPHQL_MAX_TOKENS: z.coerce.number().default(1000),
  GRAPHQL_PERSISTED_QUERIES_ONLY: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),

  // Observability
  METRICS_ENABLED: z
    .string()
    .transform((v) => v === 'true')
    .default('true'),
  METRICS_PORT: z.coerce.number().default(9090),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().default('http://localhost:4318'),
  OTEL_SERVICE_NAME: z.string().default('fastify-production-template'),
  OTEL_TRACING_ENABLED: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),
  SENTRY_DSN: z.string().optional(),
  SENTRY_ENABLED: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),
});

/**
 * Fully typed application environment configuration inferred from the Zod schema.
 */
export type Env = z.infer<typeof envSchema>;

/**
 * Validates process.env against the strict schema and terminates with detailed errors on failure.
 *
 * @returns Fully validated and transformed environment configuration object
 * @throws Error If any required environment variable is missing or invalid
 */
function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const formatted = result.error.format();
    process.stderr.write(
      `Invalid environment variables configuration: ${JSON.stringify(formatted, null, 2)}\n`
    );
    throw new Error('Failed to parse environment variables. Check .env configuration.');
  }
  return result.data;
}

/**
 * Validated, immutable singleton application environment configuration.
 */
export const env = loadEnv();
