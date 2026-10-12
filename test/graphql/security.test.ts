/**
 * @file Security tests enforcing query depth, complexity, alias, and directive limits.
 * @module test/graphql/security
 */

import { parse, validate } from 'graphql';
import { describe, expect, it } from 'vitest';
import {
  createComplexityLimitRule,
  createDepthLimitRule,
  createMaxAliasesRule,
  createMaxDirectivesRule,
} from '#src/graphql/rules/security.js';
import { schema } from '#src/graphql/schema.js';

describe('GraphQL Security Protection Rules (Armor equivalents)', () => {
  it('rejects queries exceeding max depth', () => {
    const deepQuery = parse(`
      query DeepQuery {
        user(id: "1") {
          files {
            owner {
              files {
                owner {
                  id
                }
              }
            }
          }
        }
      }
    `);

    const depthRule = createDepthLimitRule(3);
    const errors = validate(schema, deepQuery, [depthRule]);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]?.message).toMatch(/exceeds maximum allowed depth of 3/);
  });

  it('permits queries within allowed depth', () => {
    const shallowQuery = parse(`
      query ShallowQuery {
        user(id: "1") {
          id
          email
        }
      }
    `);

    const depthRule = createDepthLimitRule(3);
    const errors = validate(schema, shallowQuery, [depthRule]);
    expect(errors).toHaveLength(0);
  });

  it('rejects queries exceeding max aliases', () => {
    const aliasesQuery = parse(`
      query TooManyAliases {
        a1: user(id: "1") { id }
        a2: user(id: "2") { id }
        a3: user(id: "3") { id }
        a4: user(id: "4") { id }
      }
    `);

    const aliasesRule = createMaxAliasesRule(2);
    const errors = validate(schema, aliasesQuery, [aliasesRule]);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]?.message).toMatch(/Too many field aliases/);
  });

  it('rejects queries exceeding complexity threshold', () => {
    const complexQuery = parse(`
      query ComplexQuery {
        u1: user(id: "1") { id email avatarUrl }
        u2: user(id: "2") { id email avatarUrl }
        u3: user(id: "3") { id email avatarUrl }
      }
    `);

    // Max complexity = 5 (query has 1 root + 3 aliases * 4 fields = 13 points)
    const complexityRule = createComplexityLimitRule(5);
    const errors = validate(schema, complexQuery, [complexityRule]);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]?.message).toMatch(/exceeds maximum allowed complexity of 5/);
  });

  it('rejects queries exceeding directive limits', () => {
    const directiveQuery = parse(`
      query TooManyDirectives {
        user(id: "1") @include(if: true) @skip(if: false) {
          id @include(if: true)
        }
      }
    `);

    const directiveRule = createMaxDirectivesRule(2);
    const errors = validate(schema, directiveQuery, [directiveRule]);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]?.message).toMatch(/Too many directives/);
  });
});
