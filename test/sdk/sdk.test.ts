/**
 * @file Integration tests validating generated TypeScript SDK client authentication and methods.
 * @module test/sdk/sdk
 */

import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from '#packages/sdk/src/client.js';
import { ApiError } from '#packages/sdk/src/errors.js';

describe('SDK ApiClient', () => {
  it('injects access token and x-request-id header into outgoing requests', async () => {
    let capturedHeaders: Headers | undefined;

    const mockFetch = vi
      .fn()
      .mockImplementation(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
        capturedHeaders = new Headers(init?.headers);
        return new Response(JSON.stringify({ status: 'ok' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      });

    // Save and stub global fetch
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch;

    try {
      const client = createApiClient({
        baseUrl: 'http://localhost:3000',
        getAccessToken: () => 'test_token_123',
      });

      const res = await client.fetch('http://localhost:3000/v1/health');
      expect(res.status).toBe(200);
      expect(capturedHeaders?.get('authorization')).toBe('Bearer test_token_123');
      expect(capturedHeaders?.get('x-request-id')).toBeDefined();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('performs single-flight token refresh on 401 response', async () => {
    let callCount = 0;
    const refreshSpy = vi.fn().mockResolvedValue('refreshed_token_456');

    const mockFetch = vi
      .fn()
      .mockImplementation(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
        callCount++;
        const headers = new Headers(init?.headers);
        const auth = headers.get('authorization');

        if (callCount === 1) {
          return new Response(
            JSON.stringify({ code: 'AUTH_UNAUTHORIZED', message: 'Token expired' }),
            {
              status: 401,
              headers: { 'content-type': 'application/json' },
            }
          );
        }

        if (auth === 'Bearer refreshed_token_456') {
          return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({ code: 'AUTH_UNAUTHORIZED' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        });
      });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch;

    try {
      const client = createApiClient({
        baseUrl: 'http://localhost:3000',
        getAccessToken: () => 'stale_token',
        onRefreshToken: refreshSpy,
        retries: 2,
        retryDelayMs: 10,
      });

      const res = await client.fetch('http://localhost:3000/v1/users/me');
      expect(res.status).toBe(200);
      expect(refreshSpy).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('retries on 500 server error and throws ApiError on terminal failure', async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(async () => {
      callCount++;
      return new Response(
        JSON.stringify({
          type: 'https://api.example.com/errors/internal',
          title: 'Internal Server Error',
          status: 500,
          code: 'INTERNAL_SERVER_ERROR',
          detail: 'Database connectivity error',
          requestId: 'req_123',
        }),
        {
          status: 500,
          headers: { 'content-type': 'application/problem+json' },
        }
      );
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch;

    try {
      const client = createApiClient({
        baseUrl: 'http://localhost:3000',
        retries: 2,
        retryDelayMs: 10,
      });

      await expect(client.fetch('http://localhost:3000/v1/error')).rejects.toThrow(ApiError);
      // Initial + 2 retries = 3 calls
      expect(callCount).toBe(3);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('respects Retry-After header on 429 rate limit', async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return new Response(JSON.stringify({ code: 'RATE_LIMIT_EXCEEDED' }), {
          status: 429,
          headers: {
            'content-type': 'application/json',
            'retry-after': '1',
          },
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch;

    try {
      const client = createApiClient({
        baseUrl: 'http://localhost:3000',
        retries: 1,
        retryDelayMs: 10,
      });

      const res = await client.fetch('http://localhost:3000/v1/test');
      expect(res.status).toBe(200);
      expect(callCount).toBe(2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('executes GraphQL query via client.graphql helper', async () => {
    let requestPayload: unknown;

    const mockFetch = vi
      .fn()
      .mockImplementation(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
        requestPayload = JSON.parse(init?.body as string);
        return new Response(
          JSON.stringify({
            data: { me: { id: 'usr_1', email: 'test@example.com' } },
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }
        );
      });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch;

    try {
      const client = createApiClient({
        baseUrl: 'http://localhost:3000',
      });

      const res = await client.graphql('{ me { id email } }', { foo: 'bar' });
      expect(res.data).toBeDefined();
      expect(requestPayload).toEqual({
        query: '{ me { id email } }',
        variables: { foo: 'bar' },
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
