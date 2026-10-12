# ADR 004: Redis Fail-Open vs Fail-Closed Strategy for Rate Limiting

## Status
Accepted

## Context
In a distributed microservice or API cluster, rate limiting is commonly backed by a shared Redis instance. If the Redis cluster encounters network partitions, failovers, or downtime, the application must define whether to allow traffic through unthrottled or reject requests until Redis recovers. Different routes have drastically different availability and security requirements.

## Decision
We implemented a configurable tiered fallback strategy controlled by `RATE_LIMIT_ALLOW_LIST_FAIL_OPEN`:
1. **Public & Informational Routes (Fail-Open)**:
   - For standard read endpoints (e.g. `GET /v1/users`, health checks, public catalogs), availability takes priority over strict throttling.
   - If Redis connection drops, rate limiting falls back to an in-memory sliding window or logs an alert and permits the request to prevent widespread cascading outages.
2. **High-Risk & Security-Sensitive Routes (Fail-Closed)**:
   - For sensitive routes (e.g. `POST /v1/auth/login`, `POST /v1/auth/signup`, password resets, API key creation), security and brute-force prevention take priority over availability.
   - If Redis is unavailable and cannot reliably count attempts or progressive ban state, the route immediately rejects requests with HTTP 503 (`SERVICE_UNAVAILABLE`) or enforces strict in-memory locks.
3. **Progressive Bans**:
   - Repeat rate limit violations on security endpoints trigger progressive duration bans (e.g. 15 minutes -> 1 hour -> 24 hours) stored in dedicated Redis key prefixes (`rate_limit:ban:{ip}`).

## Consequences
- **Positive**:
  - High availability for the majority of application endpoints during temporary cache/Redis maintenance.
  - Zero tolerance for brute-force attacks against credential verification endpoints during network degradation.
- **Negative**:
  - Developers configuring custom routes must explicitly declare the route tier to ensure appropriate fail-open/fail-closed semantics.
