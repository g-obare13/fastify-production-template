/**
 * @file Unit tests verifying HTTP response helpers and header utilities.
 * @module test/lib/http
 */

import { describe, expect, it, vi } from 'vitest';
import { InternalServerError } from '#src/lib/errors.js';
import { HttpClient } from '#src/lib/http.js';

describe('HttpClient with Retries', () => {
  it('throws InternalServerError after max retries fail', async () => {
    const client = new HttpClient(100);
    await expect(
      client.request('http://127.0.0.1:59999/non-existent', { retries: 1, timeoutMs: 100 })
    ).rejects.toThrow(InternalServerError);
  });
});
