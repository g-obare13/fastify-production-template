/**
 * @file CLI generator synchronizing environment metadata into .env.example and docs/env-reference.md.
 * @module scripts/generate-env
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envExamplePath = path.resolve(__dirname, '../.env.example');
const docsPath = path.resolve(__dirname, '../docs/env-reference.md');

// Environment variable documentation metadata
interface EnvDoc {
  name: string;
  type: string;
  default: string;
  required: boolean;
  description: string;
}

const envDocs: EnvDoc[] = [
  // App & Server
  {
    name: 'NODE_ENV',
    type: 'string',
    default: 'development',
    required: false,
    description: 'Node environment (development, test, production)',
  },
  {
    name: 'PORT',
    type: 'number',
    default: '3000',
    required: false,
    description: 'Server listening port',
  },
  {
    name: 'HOST',
    type: 'string',
    default: '0.0.0.0',
    required: false,
    description: 'Server binding network host',
  },
  {
    name: 'LOG_LEVEL',
    type: 'string',
    default: 'info',
    required: false,
    description: 'Logging level (fatal, error, warn, info, debug, trace, silent)',
  },
  {
    name: 'TRUST_PROXY',
    type: 'string',
    default: '127.0.0.1,::1',
    required: false,
    description: 'Trusted reverse proxy IP list or hop count (fail-safe in production)',
  },
  {
    name: 'API_PREFIX',
    type: 'string',
    default: '/v1',
    required: false,
    description: 'Base path prefix for all REST routes',
  },
  {
    name: 'REST_ENABLED',
    type: 'boolean',
    default: 'true',
    required: false,
    description: 'Toggle REST API surface on/off',
  },
  {
    name: 'GRAPHQL_ENABLED',
    type: 'boolean',
    default: 'true',
    required: false,
    description: 'Toggle GraphQL API surface on/off',
  },

  // API Documentation & Controls
  {
    name: 'DOCS_ENABLED',
    type: 'boolean',
    default: 'true',
    required: false,
    description:
      'Toggle API documentation UI and spec endpoints on/off (defaults to false in production)',
  },
  {
    name: 'DOCS_UI',
    type: 'string',
    default: 'scalar',
    required: false,
    description: 'Interactive documentation UI renderer: scalar or swagger',
  },
  {
    name: 'DOCS_BASIC_AUTH_USER',
    type: 'string',
    default: '',
    required: false,
    description: 'HTTP Basic Auth username to protect docs in staging/production',
  },
  {
    name: 'DOCS_BASIC_AUTH_PASSWORD',
    type: 'string',
    default: '',
    required: false,
    description: 'HTTP Basic Auth password to protect docs in staging/production',
  },
  {
    name: 'DOCS_EXPOSE_SCHEMA',
    type: 'boolean',
    default: 'true',
    required: false,
    description: 'Serve printed GraphQL schema at /schema.graphql',
  },
  {
    name: 'API_TITLE',
    type: 'string',
    default: 'Fastify Production API',
    required: false,
    description: 'OpenAPI title for documentation',
  },
  {
    name: 'API_DESCRIPTION',
    type: 'string',
    default: 'Production-grade Fastify template with REST, GraphQL, Auth, and Storage',
    required: false,
    description: 'OpenAPI description',
  },
  {
    name: 'API_CONTACT_NAME',
    type: 'string',
    default: 'API Support',
    required: false,
    description: 'OpenAPI contact name',
  },
  {
    name: 'API_CONTACT_EMAIL',
    type: 'string',
    default: 'support@example.com',
    required: false,
    description: 'OpenAPI contact email',
  },
  {
    name: 'API_CONTACT_URL',
    type: 'string',
    default: 'https://example.com/support',
    required: false,
    description: 'OpenAPI contact URL',
  },
  {
    name: 'API_LICENSE_NAME',
    type: 'string',
    default: 'MIT',
    required: false,
    description: 'OpenAPI license name',
  },
  {
    name: 'API_LICENSE_URL',
    type: 'string',
    default: 'https://opensource.org/licenses/MIT',
    required: false,
    description: 'OpenAPI license URL',
  },
  {
    name: 'API_SERVERS',
    type: 'string',
    default: 'http://localhost:3000',
    required: false,
    description: 'Comma-separated OpenAPI server URLs',
  },

  // CORS
  {
    name: 'CORS_ORIGIN',
    type: 'string',
    default: 'http://localhost:3000',
    required: false,
    description: 'Primary allowed CORS origin',
  },
  {
    name: 'CORS_ORIGINS',
    type: 'string',
    default: '',
    required: false,
    description: 'Comma-separated exact origins, wildcard subdomains, and regex patterns',
  },
  {
    name: 'CORS_CREDENTIALS',
    type: 'boolean',
    default: 'true',
    required: false,
    description: 'Enable credentials (cookies/auth) in CORS headers',
  },
  {
    name: 'CORS_DEV_PRESET',
    type: 'boolean',
    default: 'true',
    required: false,
    description: 'Allow common frontend dev ports (3000, 5173, 4200, 8081)',
  },

  // Security & Auth
  {
    name: 'JWT_SECRET',
    type: 'string',
    default: '',
    required: true,
    description: 'Secret key for signing access JWTs (min 32 chars)',
  },
  {
    name: 'JWT_EXPIRES_IN',
    type: 'string',
    default: '15m',
    required: false,
    description: 'Lifespan of access JWT',
  },
  {
    name: 'REFRESH_TOKEN_EXPIRES_DAYS',
    type: 'number',
    default: '7',
    required: false,
    description: 'Lifespan of refresh tokens in days',
  },
  {
    name: 'COOKIE_SECRET',
    type: 'string',
    default: '',
    required: true,
    description: 'Secret key for signing HTTP cookies (min 32 chars)',
  },
  {
    name: 'COOKIE_DOMAIN',
    type: 'string',
    default: 'localhost',
    required: false,
    description: 'Domain attribute for session cookies',
  },
  {
    name: 'COOKIE_SECURE',
    type: 'boolean',
    default: 'false',
    required: false,
    description: 'Require HTTPS for cookies (true in production)',
  },

  // Database & Redis
  {
    name: 'DATABASE_URL',
    type: 'string',
    default: '',
    required: true,
    description: 'PostgreSQL connection URL',
  },
  {
    name: 'REDIS_URL',
    type: 'string',
    default: 'redis://localhost:6379',
    required: true,
    description: 'Redis connection URL for caching, rate limiting, and BullMQ',
  },

  // Rate Limiting
  {
    name: 'RATE_LIMIT_ENABLED',
    type: 'boolean',
    default: 'true',
    required: false,
    description: 'Enable distributed rate limiting',
  },
  {
    name: 'RATE_LIMIT_MAX',
    type: 'number',
    default: '100',
    required: false,
    description: 'Max requests per sliding window',
  },
  {
    name: 'RATE_LIMIT_WINDOW_MS',
    type: 'number',
    default: '60000',
    required: false,
    description: 'Sliding window duration in milliseconds',
  },
  {
    name: 'RATE_LIMIT_FAIL_MODE',
    type: 'string',
    default: 'closed',
    required: false,
    description: 'Behavior when Redis is down: open or closed',
  },

  // Storage
  {
    name: 'STORAGE_DRIVER',
    type: 'string',
    default: 'local',
    required: false,
    description: 'Storage driver: local or s3',
  },
  {
    name: 'STORAGE_ALLOW_LOCAL_IN_PROD',
    type: 'boolean',
    default: 'false',
    required: false,
    description: 'Allow local storage in production (unsafe fallback)',
  },
  {
    name: 'S3_BUCKET',
    type: 'string',
    default: 'app-uploads',
    required: false,
    description: 'S3 / MinIO bucket name',
  },
  {
    name: 'S3_REGION',
    type: 'string',
    default: 'us-east-1',
    required: false,
    description: 'AWS / S3 region',
  },
  {
    name: 'S3_ENDPOINT',
    type: 'string',
    default: '',
    required: false,
    description: 'Custom S3 endpoint for MinIO, Cloudflare R2, Wasabi',
  },
  {
    name: 'S3_ACCESS_KEY_ID',
    type: 'string',
    default: '',
    required: false,
    description: 'S3 access key ID',
  },
  {
    name: 'S3_SECRET_ACCESS_KEY',
    type: 'string',
    default: '',
    required: false,
    description: 'S3 secret access key',
  },
  {
    name: 'STORAGE_MAX_FILE_SIZE_MB',
    type: 'number',
    default: '25',
    required: false,
    description: 'Max allowed file upload size in MB',
  },

  // GraphQL
  {
    name: 'GRAPHQL_PLAYGROUND_ENABLED',
    type: 'boolean',
    default: 'true',
    required: false,
    description: 'Enable GraphiQL playground in non-production',
  },
  {
    name: 'GRAPHQL_MAX_DEPTH',
    type: 'number',
    default: '10',
    required: false,
    description: 'Maximum allowable GraphQL query AST depth',
  },
  {
    name: 'GRAPHQL_MAX_COMPLEXITY',
    type: 'number',
    default: '1000',
    required: false,
    description: 'Maximum query complexity score threshold',
  },
  {
    name: 'GRAPHQL_PERSISTED_QUERIES_ONLY',
    type: 'boolean',
    default: 'false',
    required: false,
    description: 'Enforce persisted query allow-list mode',
  },
];

// Generate .env.example
let envExampleContent = `# ------------------------------------------------------
# THIS FILE WAS AUTOMATICALLY GENERATED (DO NOT EDIT DIRECTLY)
# See docs/env-reference.md for full parameter documentation
# ------------------------------------------------------\n\n`;

for (const doc of envDocs) {
  envExampleContent += `# ${doc.description} (${doc.required ? 'REQUIRED' : 'Optional'})\n`;
  envExampleContent += `${doc.name}=${doc.default}\n\n`;
}

fs.writeFileSync(envExamplePath, envExampleContent, 'utf8');

// Generate docs/env-reference.md
let markdownTable = `# Environment Configuration Reference

> Generated automatically from the Zod environment schema. Do not edit directly.

| Variable | Type | Default | Required | Description |
| :--- | :--- | :--- | :--- | :--- |
`;

for (const doc of envDocs) {
  markdownTable += `| \`${doc.name}\` | \`${doc.type}\` | \`${doc.default || '(empty)'}\` | ${doc.required ? '**Yes**' : 'No'} | ${doc.description} |\n`;
}

fs.mkdirSync(path.dirname(docsPath), { recursive: true });
fs.writeFileSync(docsPath, markdownTable, 'utf8');

process.stdout.write('Generated .env.example and docs/env-reference.md successfully\n');
