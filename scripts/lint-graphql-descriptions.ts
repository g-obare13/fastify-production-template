/**
 * @file CLI linter asserting 100% GraphQL schema documentation coverage for types, fields, and args.
 * @module scripts/lint-graphql-descriptions
 */

import {
  isEnumType,
  isInputObjectType,
  isInterfaceType,
  isObjectType,
  isScalarType,
} from 'graphql';
import { schema } from '#src/graphql/schema.js';

interface Issue {
  location: string;
  kind: 'type' | 'field' | 'arg' | 'enumValue';
  name: string;
}

const issues: Issue[] = [];
const typeMap = schema.getTypeMap();

for (const [typeName, type] of Object.entries(typeMap)) {
  // Skip internal GraphQL introspection types
  if (typeName.startsWith('__')) continue;
  // Skip built-in default scalars
  if (
    isScalarType(type) &&
    ['String', 'Int', 'Float', 'Boolean', 'ID', 'Date'].includes(typeName)
  ) {
    continue;
  }
  // Skip synthetic Relay connection boilerplate types
  if (typeName.endsWith('Connection') || typeName.endsWith('Edge') || typeName === 'PageInfo') {
    continue;
  }

  // 1. Verify type description
  if (!type.description || type.description.trim().length === 0) {
    issues.push({ location: typeName, kind: 'type', name: typeName });
  }

  // 2. Verify Object and Interface fields
  if (isObjectType(type) || isInterfaceType(type)) {
    const fields = type.getFields();
    for (const [fieldName, field] of Object.entries(fields)) {
      if (!field.description || field.description.trim().length === 0) {
        issues.push({ location: `${typeName}.${fieldName}`, kind: 'field', name: fieldName });
      }

      // 3. Verify Field arguments (skip Relay standard connection args)
      for (const arg of field.args) {
        if (
          ['before', 'after', 'first', 'last'].includes(arg.name) &&
          fieldName.endsWith('Connection')
        ) {
          continue;
        }
        if (!arg.description || arg.description.trim().length === 0) {
          issues.push({
            location: `${typeName}.${fieldName}(${arg.name})`,
            kind: 'arg',
            name: arg.name,
          });
        }
      }
    }
  }

  // 4. Verify Input Object fields
  if (isInputObjectType(type)) {
    const fields = type.getFields();
    for (const [fieldName, field] of Object.entries(fields)) {
      if (!field.description || field.description.trim().length === 0) {
        issues.push({ location: `${typeName}.${fieldName}`, kind: 'field', name: fieldName });
      }
    }
  }

  // 5. Verify Enum values
  if (isEnumType(type)) {
    for (const enumVal of type.getValues()) {
      if (!enumVal.description || enumVal.description.trim().length === 0) {
        issues.push({
          location: `${typeName}.${enumVal.name}`,
          kind: 'enumValue',
          name: enumVal.name,
        });
      }
    }
  }
}

if (issues.length > 0) {
  process.stderr.write(
    `[lint:graphql] Found ${issues.length} missing GraphQL schema descriptions:\n`
  );
  for (const issue of issues) {
    process.stderr.write(`  - [${issue.kind}] ${issue.location}\n`);
  }
  process.exit(1);
} else {
  process.stdout.write(
    '[lint:graphql] All GraphQL types, fields, arguments, and enums have descriptions!\n'
  );
  process.exit(0);
}
