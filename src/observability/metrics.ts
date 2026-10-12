/**
 * @file Prometheus metrics registry and HTTP/GraphQL instrumentation counters.
 * @module observability/metrics
 */

import client from 'prom-client';

/** Prometheus registry holding application metrics. */
export const register = new client.Registry();

client.collectDefaultMetrics({
  register,
  prefix: 'app_',
});

/** Histogram tracking HTTP request durations across methods, routes, and status codes. */
export const httpRequestDuration = new client.Histogram({
  name: 'app_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
});

/** Counter tracking total HTTP requests processed. */
export const httpRequestsTotal = new client.Counter({
  name: 'app_http_requests_total',
  help: 'Total number of HTTP requests processed',
  labelNames: ['method', 'route', 'status_code'],
});

/** Counter tracking rate limit violations across routes and tiers. */
export const rateLimitViolationsTotal = new client.Counter({
  name: 'app_rate_limit_violations_total',
  help: 'Total number of rate limit violations',
  labelNames: ['route', 'tier'],
});

/** Counter tracking Redis failures occurring during rate limit evaluation. */
export const rateLimitRedisFailuresTotal = new client.Counter({
  name: 'app_rate_limit_redis_failures_total',
  help: 'Total number of Redis failures during rate limit checks',
  labelNames: ['route', 'tier'],
});

/** Counter tracking GraphQL operation counts grouped by operation name and type. */
export const graphqlOperationsTotal = new client.Counter({
  name: 'app_graphql_operations_total',
  help: 'Total number of GraphQL operations processed',
  labelNames: ['operation_name', 'operation_type', 'status'],
});

/** Histogram tracking GraphQL query and mutation execution durations. */
export const graphqlOperationDuration = new client.Histogram({
  name: 'app_graphql_operation_duration_seconds',
  help: 'Duration of GraphQL operations in seconds',
  labelNames: ['operation_name', 'operation_type'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
});

register.registerMetric(httpRequestDuration);
register.registerMetric(httpRequestsTotal);
register.registerMetric(rateLimitViolationsTotal);
register.registerMetric(rateLimitRedisFailuresTotal);
register.registerMetric(graphqlOperationsTotal);
register.registerMetric(graphqlOperationDuration);
