/**
 * @file Resilient outbound HTTP client with timeouts and exponential retry backoff.
 * @module lib/http
 */

import { type Dispatcher, request } from 'undici';
import { InternalServerError } from './errors.js';

/** Options configuring timeouts and retries for outbound HTTP requests. */
export interface HttpClientOptions
  extends Omit<NonNullable<Parameters<typeof request>[1]>, 'headersTimeout' | 'bodyTimeout'> {
  timeoutMs?: number;
  retries?: number;
}

/** Resilient outbound HTTP client wrapper around undici request. */
export class HttpClient {
  /**
   * Initializes client with default request timeout.
   *
   * @param defaultTimeoutMs Milliseconds before request aborts.
   */
  constructor(private readonly defaultTimeoutMs = 5000) {}

  /**
   * Dispatches outbound HTTP request with exponential retry backoff.
   *
   * @param url Target destination URL.
   * @param options Request options including timeouts and retry counts.
   * @returns Undici response object.
   * @throws InternalServerError when all retries are exhausted.
   * @example
   * ```ts
   * const res = await httpClient.request('https://api.example.com/data');
   * ```
   */
  async request(url: string, options: HttpClientOptions = {}) {
    const timeout = options.timeoutMs ?? this.defaultTimeoutMs;
    const maxRetries = options.retries ?? 2;
    let attempt = 0;

    while (attempt <= maxRetries) {
      try {
        const response = await request(url, {
          ...options,
          headersTimeout: timeout,
          bodyTimeout: timeout,
        });
        return response;
      } catch (err) {
        attempt++;
        if (attempt > maxRetries) {
          throw new InternalServerError(
            `Outbound call to ${url} failed after ${maxRetries} retries: ${(err as Error).message}`
          );
        }
        // Exponential backoff
        await new Promise((r) => setTimeout(r, 2 ** attempt * 100));
      }
    }
    throw new InternalServerError(`Outbound call to ${url} failed`);
  }
}

/** Global default outbound HTTP client instance. */
export const httpClient = new HttpClient();
