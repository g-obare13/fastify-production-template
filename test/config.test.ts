/**
 * @file Unit tests verifying environment configuration variables and defaults.
 * @module test/config
 */

import { describe, expect, it } from 'vitest';
import { env } from '#src/config/env.js';

describe('Config / Env', () => {
  it('loads valid default configurations', () => {
    expect(env).toBeDefined();
    expect(env.NODE_ENV).toBeDefined();
    expect(env.PORT).toBeGreaterThan(0);
    expect(env.JWT_SECRET.length).toBeGreaterThanOrEqual(32);
    expect(env.COOKIE_SECRET.length).toBeGreaterThanOrEqual(32);
    expect(env.API_PREFIX).toBe('/v1');
  });
});
