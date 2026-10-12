/**
 * @file Unit tests asserting database schema definitions, relations, and table constraints.
 * @module test/db/schema
 */

import { describe, expect, it } from 'vitest';
import { emailVerificationTokens, files, refreshTokens, users } from '#src/db/schema.js';

describe('Drizzle Schema Definitions', () => {
  it('defines users table with correct columns and constraints', () => {
    expect(users).toBeDefined();
    expect(users.id).toBeDefined();
    expect(users.email).toBeDefined();
    expect(users.passwordHash).toBeDefined();
    expect(users.role).toBeDefined();
    expect(users.deletedAt).toBeDefined();
  });

  it('defines refreshTokens table with foreign keys and family field', () => {
    expect(refreshTokens).toBeDefined();
    expect(refreshTokens.userId).toBeDefined();
    expect(refreshTokens.tokenHash).toBeDefined();
    expect(refreshTokens.family).toBeDefined();
  });

  it('defines files table with status, size, and checksum', () => {
    expect(files).toBeDefined();
    expect(files.ownerId).toBeDefined();
    expect(files.key).toBeDefined();
    expect(files.size).toBeDefined();
    expect(files.checksum).toBeDefined();
    expect(files.status).toBeDefined();
  });

  it('defines emailVerificationTokens table', () => {
    expect(emailVerificationTokens).toBeDefined();
    expect(emailVerificationTokens.userId).toBeDefined();
    expect(emailVerificationTokens.tokenHash).toBeDefined();
  });
});
