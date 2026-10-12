/**
 * @file Cryptographic utilities including Argon2id password hashing, tokens, PKCE, and constant-time equality.
 * @module src/lib/crypto
 */

import crypto from 'node:crypto';
import argon2 from 'argon2';

/**
 * Hashes a plaintext password using Argon2id with memory-hard parameters.
 *
 * @param password Raw plaintext password to hash
 * @returns Encrypted Argon2id hash string
 * @example
 * ```ts
 * const hash = await hashPassword('correct-horse-battery-staple');
 * ```
 */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 2 ** 16,
    timeCost: 3,
    parallelism: 1,
  });
}

/**
 * Verifies a plaintext password against an Argon2id hash in constant time.
 *
 * @param hash Previously generated password hash
 * @param plain Plaintext password attempt to verify
 * @returns True if password matches hash, otherwise false
 * @example
 * ```ts
 * const valid = await verifyPassword(savedHash, userAttempt);
 * ```
 */
export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

/**
 * Computes a SHA-256 hex digest of a raw token for secure database indexing.
 *
 * @param token Plaintext token string
 * @returns Hex-encoded SHA-256 digest string
 * @example
 * ```ts
 * const indexHash = hashToken(refreshToken);
 * ```
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Generates a cryptographically random, URL-safe base64 string.
 *
 * @param bytes Number of entropy bytes to generate (defaults to 32)
 * @returns URL-safe base64 token string
 * @example
 * ```ts
 * const resetToken = generateSecureToken(32);
 * ```
 */
export function generateSecureToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

/**
 * Compares two UTF-8 strings in constant time to prevent timing attacks.
 *
 * @param a First string operand
 * @param b Second string operand
 * @returns True if both strings are identical in length and byte content
 * @example
 * ```ts
 * const isMatch = timingSafeEqual(expectedSignature, receivedSignature);
 * ```
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * PKCE (Proof Key for Code Exchange) verifier and challenge pair.
 */
export interface PkcePair {
  /** High-entropy cryptographic random string */
  codeVerifier: string;
  /** SHA-256 base64url challenge computed from verifier */
  codeChallenge: string;
  /** Fixed hashing algorithm method */
  method: 'S256';
}

/**
 * Generates a standard RFC 7636 PKCE code verifier and S256 code challenge pair.
 *
 * @returns Generated PKCE pair with verifier, challenge, and method
 * @example
 * ```ts
 * const { codeVerifier, codeChallenge } = generatePkcePair();
 * ```
 */
export function generatePkcePair(): PkcePair {
  const codeVerifier = generateSecureToken(32);
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  return {
    codeVerifier,
    codeChallenge,
    method: 'S256',
  };
}

/**
 * Verifies a PKCE code verifier against a stored code challenge.
 *
 * @param codeVerifier Client plaintext code verifier
 * @param codeChallenge Stored S256 code challenge
 * @returns True if hashed verifier matches challenge in constant time
 * @example
 * ```ts
 * const isValid = verifyPkce(clientVerifier, storedChallenge);
 * ```
 */
export function verifyPkce(codeVerifier: string, codeChallenge: string): boolean {
  const expected = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  return timingSafeEqual(expected, codeChallenge);
}

/**
 * Represents a newly generated API key with plaintext secret, prefix, and hash.
 */
export interface GeneratedApiKey {
  /** Full secret key returned once to user */
  key: string;
  /** Key prefix identifier */
  prefix: string;
  /** SHA-256 digest stored for lookup */
  hash: string;
}

/**
 * Generates an API key prefixed for identification and hashed for database storage.
 *
 * @param prefix Human-readable key namespace prefix (defaults to 'fst')
 * @returns Generated API key record containing secret, prefix, and hash
 * @example
 * ```ts
 * const { key, hash } = generateApiKey('app');
 * ```
 */
export function generateApiKey(prefix = 'fst'): GeneratedApiKey {
  const secret = generateSecureToken(32);
  const key = `${prefix}_${secret}`;
  const hash = hashToken(key);
  return { key, prefix, hash };
}
