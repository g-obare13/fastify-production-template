/**
 * @file Framework-agnostic fetch client SDK with token refresh mutex and error handling.
 * @module @app/sdk/client
 */

import createClient, { type ClientOptions } from 'openapi-fetch';
import { ApiError, type ProblemDetails } from './errors.js';
import type { paths } from './schema.js';

/**
 * Configuration options for initializing the SDK API client.
 */
export interface ApiClientConfig extends Omit<ClientOptions, 'baseUrl'> {
  /** Target API origin base URL (e.g. 'https://api.example.com') */
  baseUrl: string;
  /** Asynchronous or synchronous provider returning current access token */
  getAccessToken?: () => string | null | Promise<string | null>;
  /** Callback triggered on 401 response to obtain fresh access token */
  onRefreshToken?: () => Promise<string | null>;
  /** Maximum retry attempts on network failures or 5xx server responses */
  retries?: number;
  /** Base delay in milliseconds between retry attempts */
  retryDelayMs?: number;
}

/**
 * Creates a typed API client configured with single-flight refresh mutex and exponential backoff.
 *
 * @param config Client configuration including base URL and token hooks
 * @returns Fully typed REST and GraphQL API client instance
 * @throws ApiError When an HTTP request returns an error response
 * @example
 * ```ts
 * const client = createApiClient({
 *   baseUrl: 'http://localhost:3000',
 *   getAccessToken: () => localStorage.getItem('token'),
 * });
 * const { data, error } = await client.GET('/v1/users');
 * ```
 */
export function createApiClient(config: ApiClientConfig) {
  const {
    baseUrl,
    getAccessToken,
    onRefreshToken,
    retries = 3,
    retryDelayMs = 500,
    ...clientOptions
  } = config;

  // Mutex for single-flight token refresh
  let refreshPromise: Promise<string | null> | null = null;

  /**
   * Retrieves the current access token from the configured token supplier.
   *
   * @returns Active bearer access token or null if unconfigured
   */
  async function getValidToken(): Promise<string | null> {
    if (!getAccessToken) return null;
    return getAccessToken();
  }

  /**
   * Executes a single-flight token refresh, deduplicating concurrent refresh requests.
   *
   * @returns Refreshed bearer token or null if handler is unconfigured
   */
  async function performSingleFlightRefresh(): Promise<string | null> {
    if (!onRefreshToken) return null;
    if (!refreshPromise) {
      refreshPromise = onRefreshToken().finally(() => {
        refreshPromise = null;
      });
    }
    return refreshPromise;
  }

  // Custom fetch with retry backoff and error formatting
  const customFetch: typeof fetch = async (input, init) => {
    let lastError: unknown;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const reqHeaders = new Headers(init?.headers);

        // 1. Injected Request ID
        if (!reqHeaders.has('x-request-id')) {
          const randomId =
            typeof crypto !== 'undefined' && crypto.randomUUID
              ? crypto.randomUUID()
              : `req_${Math.random().toString(36).slice(2, 11)}`;
          reqHeaders.set('x-request-id', randomId);
        }

        // 2. Injected Auth Token
        const token = await getValidToken();
        if (token && !reqHeaders.has('authorization')) {
          reqHeaders.set('authorization', `Bearer ${token}`);
        }

        const response = await fetch(input, {
          ...init,
          headers: reqHeaders,
        });

        // 3. Single-Flight Token Refresh on 401
        if (response.status === 401 && onRefreshToken && attempt < retries) {
          const newToken = await performSingleFlightRefresh();
          if (newToken) {
            reqHeaders.set('authorization', `Bearer ${newToken}`);
            return fetch(input, { ...init, headers: reqHeaders });
          }
        }

        // 4. Retry on 5xx Server Errors or 429 Rate Limiting
        if ((response.status >= 500 || response.status === 429) && attempt < retries) {
          const retryAfterHeader = response.headers.get('retry-after');
          let delay = retryDelayMs * 2 ** attempt;
          if (retryAfterHeader) {
            const parsedSeconds = Number.parseInt(retryAfterHeader, 10);
            if (!Number.isNaN(parsedSeconds) && parsedSeconds > 0) {
              delay = parsedSeconds * 1000;
            }
          }
          await new Promise((res) => setTimeout(res, delay));
          continue;
        }

        // 5. Handle Problem Details Errors
        if (!response.ok) {
          let problem: ProblemDetails;
          try {
            const body = (await response.clone().json()) as Record<string, unknown>;
            problem = {
              status: response.status,
              code: typeof body.code === 'string' ? body.code : 'HTTP_ERROR',
              title: typeof body.title === 'string' ? body.title : undefined,
              detail:
                typeof body.detail === 'string'
                  ? body.detail
                  : typeof body.message === 'string'
                    ? body.message
                    : undefined,
              requestId:
                typeof body.requestId === 'string'
                  ? body.requestId
                  : (response.headers.get('x-request-id') ?? undefined),
              invalidParams: Array.isArray(body.invalidParams)
                ? (body.invalidParams as ProblemDetails['invalidParams'])
                : undefined,
              ...body,
            };
          } catch {
            problem = {
              status: response.status,
              code: 'HTTP_ERROR',
              title: response.statusText,
              requestId: response.headers.get('x-request-id') ?? undefined,
            };
          }
          throw new ApiError(problem);
        }

        return response;
      } catch (err) {
        lastError = err;
        if (err instanceof ApiError) {
          throw err;
        }
        // Network retry
        if (attempt < retries) {
          const backoff = retryDelayMs * 2 ** attempt;
          await new Promise((res) => setTimeout(res, backoff));
          continue;
        }
      }
    }

    throw lastError;
  };

  const client = createClient<paths>({
    baseUrl,
    fetch: customFetch,
    ...clientOptions,
  });

  return Object.assign(client, {
    fetch: customFetch,
    async graphql<TData = unknown>(
      query: string,
      variables?: Record<string, unknown>,
      options?: { headers?: Record<string, string> }
    ) {
      const url = new URL('/graphql', baseUrl).toString();
      const res = await customFetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(options?.headers ?? {}),
        },
        body: JSON.stringify({ query, variables }),
      });
      return (await res.json()) as {
        data?: TData;
        errors?: Array<{ message: string; extensions?: Record<string, unknown> }>;
      };
    },
  });
}
