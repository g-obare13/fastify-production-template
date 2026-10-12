/**
 * @file CLI generator extracting OpenAPI 3.1 JSON specification from Fastify schemas.
 * @module scripts/generate-openapi
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from '#src/app.js';
import type { DbClient } from '#src/db/client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.resolve(__dirname, '../openapi.json');

const dummyDbClient: DbClient = {
  drizzle: {} as never,
  pool: {} as never,
  healthCheck: async () => ({ healthy: true }),
  close: async () => {},
};

const app = buildApp({
  disableDb: false,
  dbClient: dummyDbClient,
  disableRedis: true,
  disableRateLimit: true,
  disableSwagger: false,
});

await app.ready();
const spec = app.swagger();

const header = {
  'x-generated': 'THIS FILE WAS AUTOMATICALLY GENERATED (DO NOT EDIT DIRECTLY)',
};
const outputSpec = { ...header, ...spec };

fs.writeFileSync(outputPath, `${JSON.stringify(outputSpec, null, 2)}\n`, 'utf8');
await app.close();
process.stdout.write('Generated openapi.json successfully\n');
