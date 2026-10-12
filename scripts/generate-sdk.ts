/**
 * @file CLI generator executing openapi-typescript to update SDK schema definitions.
 * @module scripts/generate-sdk
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const openapiJsonPath = path.resolve(rootDir, 'openapi.json');
const sdkDir = path.resolve(rootDir, 'packages/sdk');
const schemaOutPath = path.resolve(sdkDir, 'src/schema.d.ts');

if (!fs.existsSync(openapiJsonPath)) {
  process.stderr.write('openapi.json does not exist. Run pnpm gen:openapi first.\n');
  process.exit(1);
}

fs.mkdirSync(path.resolve(sdkDir, 'src'), { recursive: true });

process.stdout.write('Generating TypeScript types from openapi.json...\n');
execSync(`npx openapi-typescript "${openapiJsonPath}" -o "${schemaOutPath}"`, {
  cwd: rootDir,
  stdio: 'inherit',
});

// Prepend auto-generated header
const content = fs.readFileSync(schemaOutPath, 'utf8');
const banner = '/**\n * THIS FILE WAS AUTOMATICALLY GENERATED (DO NOT EDIT DIRECTLY)\n */\n\n';
if (!content.startsWith('/**')) {
  fs.writeFileSync(schemaOutPath, banner + content, 'utf8');
}

process.stdout.write('Generated packages/sdk successfully\n');
