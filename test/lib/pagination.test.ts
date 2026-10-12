/**
 * @file Unit tests asserting base64 keyset cursor encoding, decoding, and ordering.
 * @module test/lib/pagination
 */

import { describe, expect, it } from 'vitest';
import { BadRequestError } from '#src/lib/errors.js';
import { decodeCursor, encodeCursor, validateSortField } from '#src/lib/pagination.js';

describe('Pagination Utilities', () => {
  it('encodes and decodes cursor payloads safely', () => {
    const payload = { id: 'usr_01h8', createdAt: '2026-10-11T10:00:00.000Z' };
    const encoded = encodeCursor(payload);
    expect(typeof encoded).toBe('string');

    const decoded = decodeCursor(encoded);
    expect(decoded.id).toBe(payload.id);
    expect(decoded.createdAt).toBe(payload.createdAt);
  });

  it('throws BadRequestError on invalid cursor strings', () => {
    expect(() => decodeCursor('invalid-cursor!!!')).toThrow(BadRequestError);
  });

  it('validates sort fields against allowlist', () => {
    const allowed = ['createdAt', 'email'] as const;
    expect(validateSortField('email', allowed, 'createdAt')).toBe('email');
    expect(validateSortField('malicious_field', allowed, 'createdAt')).toBe('createdAt');
  });
});
