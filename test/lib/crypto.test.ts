/**
 * @file Unit tests asserting password hashing, token generation, and verification helpers.
 * @module test/lib/crypto
 */

import { describe, expect, it } from 'vitest';
import {
  generateSecureToken,
  hashPassword,
  hashToken,
  timingSafeEqual,
  verifyPassword,
} from '#src/lib/crypto.js';

describe('Crypto Utilities', () => {
  it('hashes and verifies password using Argon2', async () => {
    const password = 'SuperSecretPassword123!';
    const hash = await hashPassword(password);
    expect(hash).toContain('$argon2');

    const valid = await verifyPassword(hash, password);
    expect(valid).toBe(true);

    const invalid = await verifyPassword(hash, 'wrong-password');
    expect(invalid).toBe(false);
  });

  it('generates secure random tokens', () => {
    const token1 = generateSecureToken();
    const token2 = generateSecureToken();
    expect(token1).not.toBe(token2);
    expect(token1.length).toBeGreaterThan(20);
  });

  it('hashes tokens deterministically with sha256', () => {
    const token = 'sample-random-token';
    const hash1 = hashToken(token);
    const hash2 = hashToken(token);
    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(64);
  });

  it('performs constant-time string comparisons', () => {
    expect(timingSafeEqual('token-abc', 'token-abc')).toBe(true);
    expect(timingSafeEqual('token-abc', 'token-xyz')).toBe(false);
    expect(timingSafeEqual('short', 'longer-string')).toBe(false);
  });

  it('generates and verifies PKCE challenge pairs', async () => {
    const { generatePkcePair, verifyPkce } = await import('#src/lib/crypto.js');
    const pkce = generatePkcePair();
    expect(pkce.method).toBe('S256');
    expect(pkce.codeVerifier).toBeDefined();
    expect(pkce.codeChallenge).toBeDefined();
    expect(verifyPkce(pkce.codeVerifier, pkce.codeChallenge)).toBe(true);
    expect(verifyPkce('wrong-verifier', pkce.codeChallenge)).toBe(false);
  });

  it('generates API key with prefix and valid hash', async () => {
    const { generateApiKey, hashToken } = await import('#src/lib/crypto.js');
    const { key, prefix, hash } = generateApiKey('test');
    expect(prefix).toBe('test');
    expect(key.startsWith('test_')).toBe(true);
    expect(hashToken(key)).toBe(hash);
  });
});
