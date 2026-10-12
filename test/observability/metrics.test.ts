/**
 * @file Unit tests asserting Prometheus metric definitions, counters, and histograms.
 * @module test/observability/metrics
 */

import { describe, expect, it } from 'vitest';
import { httpRequestDuration, httpRequestsTotal, register } from '#src/observability/metrics.js';

describe('Prometheus Metrics Registry', () => {
  it('registers default and custom metrics', async () => {
    httpRequestsTotal.inc({ method: 'GET', route: '/health/live', status_code: '200' });
    httpRequestDuration.observe(
      { method: 'GET', route: '/health/live', status_code: '200' },
      0.015
    );

    const metricsOutput = await register.metrics();
    expect(metricsOutput).toContain('app_http_requests_total');
    expect(metricsOutput).toContain('app_http_request_duration_seconds');
    expect(metricsOutput).toContain('app_process_cpu_user_seconds_total');
  });
});
