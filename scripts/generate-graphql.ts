/**
 * @file CLI generator compiling GraphQL operations into SHA-256 persisted queries and SDK client manifests.
 * @module scripts/generate-graphql
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { type DocumentNode, Kind, type OperationDefinitionNode, parse, print } from 'graphql';

const operationsDir = path.resolve('src/graphql/operations');
const persistedQueriesPath = path.resolve('src/graphql/persisted-queries.json');
const sdkGraphqlPath = path.resolve('packages/sdk/src/graphql.ts');

if (!fs.existsSync(operationsDir)) {
  fs.mkdirSync(operationsDir, { recursive: true });
}

const files = fs.readdirSync(operationsDir).filter((f) => f.endsWith('.graphql'));

const persistedQueries: Record<string, string> = {};
const sdkOperations: Record<string, { query: string; hash: string; operationType: string }> = {};

for (const file of files) {
  const filePath = path.join(operationsDir, file);
  const content = fs.readFileSync(filePath, 'utf8');

  let doc: DocumentNode;
  try {
    doc = parse(content);
  } catch (err) {
    console.error(`Failed to parse ${file}:`, err);
    process.exit(1);
  }

  for (const definition of doc.definitions) {
    if (definition.kind === 'OperationDefinition') {
      const opDef = definition as OperationDefinitionNode;
      const opName = opDef.name?.value ?? path.basename(file, '.graphql');
      const opDoc: DocumentNode = {
        kind: Kind.DOCUMENT,
        definitions: [opDef],
      };

      const printed = print(opDoc).trim();
      const hash = crypto.createHash('sha256').update(printed).digest('hex');

      persistedQueries[hash] = printed;
      // Also register by operation name so clients can look up by name or hash
      persistedQueries[opName] = printed;

      sdkOperations[opName] = {
        query: printed,
        hash,
        operationType: opDef.operation,
      };
    }
  }
}

// 1. Write persisted-queries.json
fs.writeFileSync(persistedQueriesPath, `${JSON.stringify(persistedQueries, null, 2)}\n`, 'utf8');
process.stdout.write(
  `[gen:graphql] Persisted queries generated: ${Object.keys(sdkOperations).length} operations -> ${persistedQueriesPath}\n`
);

// 2. Write packages/sdk/src/graphql.ts
const sdkContent = `/**
 * AUTO-GENERATED GRAPHQL OPERATIONS & MANIFEST
 * DO NOT EDIT MANUALLY. Run 'pnpm gen:graphql' to regenerate.
 */

export interface GraphQLOperationManifest {
  query: string;
  hash: string;
  operationType: 'query' | 'mutation' | 'subscription';
}

export const GRAPHQL_OPERATIONS = ${JSON.stringify(sdkOperations, null, 2)} as const;

export type OperationName = keyof typeof GRAPHQL_OPERATIONS;

export interface GraphQLRequestOptions {
  variables?: Record<string, unknown>;
  headers?: Record<string, string>;
  persistedOnly?: boolean;
}

export interface GraphQLResponse<TData = unknown> {
  data?: TData;
  errors?: Array<{
    message: string;
    locations?: Array<{ line: number; column: number }>;
    path?: Array<string | number>;
    extensions?: {
      code?: string;
      requestId?: string;
      [key: string]: unknown;
    };
  }>;
}
`;

fs.writeFileSync(sdkGraphqlPath, sdkContent, 'utf8');
process.stdout.write(`[gen:graphql] SDK operations manifest generated -> ${sdkGraphqlPath}\n`);
