/**
 * @file CLI generator exporting sorted GraphQL SDL schema file.
 * @module scripts/generate-schema
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lexicographicSortSchema, printSchema } from 'graphql';
import { schema } from '#src/graphql/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.resolve(__dirname, '../schema.graphql');

const sortedSchema = lexicographicSortSchema(schema);
const header =
  '# ------------------------------------------------------\n# THIS FILE WAS AUTOMATICALLY GENERATED (DO NOT MODIFY)\n# ------------------------------------------------------\n\n';
const sdl = header + printSchema(sortedSchema);
fs.writeFileSync(outputPath, sdl, 'utf8');
process.stdout.write('Generated sorted schema.graphql successfully\n');
