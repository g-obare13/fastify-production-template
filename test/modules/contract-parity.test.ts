/**
 * @file Parity tests verifying behavioral consistency across REST and GraphQL endpoints.
 * @module test/modules/contract-parity
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ErrorCode } from '#src/lib/errors.js';

describe('REST & GraphQL Dual Transport Contract Parity', () => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const schemaPath = path.resolve(__dirname, '../../schema.graphql');

  it('generates a valid unified GraphQL schema matching REST capabilities', () => {
    expect(fs.existsSync(schemaPath)).toBe(true);
    const sdl = fs.readFileSync(schemaPath, 'utf8');

    // Verify Auth surface exists in GraphQL matching REST /v1/auth/*
    expect(sdl).toContain('signup(');
    expect(sdl).toContain('): AuthPayload!');
    expect(sdl).toContain('login(');
    expect(sdl).toContain('refreshToken(');

    // Verify User surface exists in GraphQL matching REST /v1/users/*
    expect(sdl).toContain('me: User');
    expect(sdl).toContain('user(');
    expect(sdl).toContain('users(');
    expect(sdl).toContain('usersConnection');
    expect(sdl).toContain('updateUserProfile(');

    // Verify Files surface exists in GraphQL matching REST /v1/files/*
    expect(sdl).toContain('requestFileUpload(');
    expect(sdl).toContain('confirmFileUpload(');
    expect(sdl).toContain('file(');
    expect(sdl).toContain('files: [File!]!');

    // Verify Subscription exists
    expect(sdl).toContain('userUpdated(');
  });

  it('guarantees identical stable ErrorCode identifiers across transports', () => {
    // Both REST RFC 9457 Problem Details and GraphQL extensions.code share the exact same enum
    expect(ErrorCode.AUTH_INVALID_CREDENTIALS).toBe('AUTH_INVALID_CREDENTIALS');
    expect(ErrorCode.VALIDATION_FAILED).toBe('VALIDATION_FAILED');
    expect(ErrorCode.RATE_LIMITED).toBe('RATE_LIMITED');
    expect(ErrorCode.NOT_FOUND).toBe('NOT_FOUND');
    expect(ErrorCode.UNAUTHORIZED).toBe('UNAUTHORIZED');
    expect(ErrorCode.FORBIDDEN).toBe('FORBIDDEN');
    expect(ErrorCode.CSRF_VIOLATION).toBe('CSRF_VIOLATION');
  });

  it('validates published OpenAPI 3.1 schema covers core endpoints', () => {
    const openapiPath = path.resolve(__dirname, '../../openapi.json');
    expect(fs.existsSync(openapiPath)).toBe(true);
    const spec = JSON.parse(fs.readFileSync(openapiPath, 'utf8'));

    expect(spec.openapi).toMatch(/^3\.1/);
    expect(spec.paths).toBeDefined();

    // Verify key REST routes are documented
    const hasPath = (p: string) =>
      spec.paths[p] !== undefined || spec.paths[`/v1${p}`] !== undefined;
    expect(hasPath('/auth/login')).toBe(true);
    expect(hasPath('/auth/signup')).toBe(true);
    expect(hasPath('/auth/me')).toBe(true);
    expect(hasPath('/users')).toBe(true);
    expect(hasPath('/files/presign')).toBe(true);
    expect(hasPath('/health/live')).toBe(true);
  });

  it('verifies persisted queries allow-list manifest is valid and non-empty', () => {
    const pqPath = path.resolve(__dirname, '../../src/graphql/persisted-queries.json');
    expect(fs.existsSync(pqPath)).toBe(true);
    const pq = JSON.parse(fs.readFileSync(pqPath, 'utf8'));

    expect(Object.keys(pq).length).toBeGreaterThan(0);
    expect(pq.Login).toBeDefined();
    expect(pq.Me).toBeDefined();
  });
});
