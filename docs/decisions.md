# Architecture Decision Records (ADRs)

## ADR 0001: Fastify 5 with Type Provider Zod as Single Source of Truth
- **Status:** Accepted
- **Context:** Fastify uses JSON Schema by default for request validation and serialization. In TypeScript backends, duplicating TypeScript interfaces, JSON Schemas, and runtime validation leads to schema drift and maintenance overhead.
- **Decision:** Adopt `fastify-type-provider-zod`. Zod schemas define the runtime validation rules, OpenAPI documentation specifications, and TypeScript types in a single declaration.
- **Consequences:** Eliminates schema drift, enables compile-time type inference for handlers, and automatically powers Scalar / Swagger OpenAPI 3.1 documentation without separate specification files.

---

## ADR 0002: Dual REST and GraphQL API Surfaces with Mercurius and Pothos
- **Status:** Accepted
- **Context:** Modern platforms often require dual client interfaces: lightweight REST endpoints for webhooks/third parties and flexible GraphQL queries for interactive frontends.
- **Decision:** Use Mercurius (the high-performance Fastify GraphQL adapter) alongside Pothos GraphQL schema builder.
- **Rationale:**
  - Pothos is code-first, highly type-safe, and integrates cleanly with Zod validation and DataLoader batching.
  - Mercurius integrates directly with Fastify's JIT compiler, lifecycle hooks, and error handling.
  - Business logic resides strictly in reusable services (`AuthService`, `UsersService`, `FilesService`), ensuring contract parity between REST and GraphQL.
- **Consequences:** Both REST (`/v1/*`) and GraphQL (`/graphql`) share identical auth, business logic, and database layers without duplication.

---

## ADR 0003: Direct-to-Storage Presigned Upload Pattern
- **Status:** Accepted
- **Context:** Streaming multipart uploads directly through the application server consumes Node.js event-loop bandwidth, memory, and limits horizontal scalability.
- **Decision:** Implement direct-to-storage presigned uploads for S3-compatible backends and a matching LocalDisk driver for offline development.
  1. Client calls `POST /v1/files/presign` with file metadata (MIME type, size, filename).
  2. Server validates allowlists, creates a `pending` record, and generates a presigned PUT URL.
  3. Client uploads directly to S3 / MinIO.
  4. Client calls `POST /v1/files/confirm`, where the server verifies object existence and metadata before marking the file as `uploaded`.
- **Consequences:** Near-zero application server memory usage during uploads, maximum throughput, and cloud-native scalability.

---

## ADR 0004: RFC 9457 Problem Details Error Hierarchy
- **Status:** Accepted
- **Context:** Standardizing API error responses across REST and GraphQL surfaces is essential for robust client error handling.
- **Decision:** Adopt IETF RFC 9457 (Problem Details for HTTP APIs) with `application/problem+json` content-type.
- **Implementation:**
  - Base `AppError` class providing `status`, `title`, `type`, `detail`, `code`, and optional `invalidParams`.
  - Concrete subclasses: `BadRequestError`, `UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `ConflictError`, `UnprocessableEntityError`, `TooManyRequestsError`, `InternalServerError`.
  - Mercurius GraphQL errors format identical machine-readable error codes in `extensions.code`.

---

## ADR 0005: Drizzle ORM over Prisma or TypeORM
- **Status:** Accepted
- **Context:** Object-Relational Mappers (ORMs) can introduce hidden query overhead, heavy binary engines, and cold-start latency.
- **Decision:** Adopt Drizzle ORM with native `pg` connection pooling.
- **Rationale:**
  - Zero heavy binary engines (unlike Prisma query engine binaries).
  - TypeScript-native SQL query builder with type-safe schema definitions.
  - Automatic migration generator via `drizzle-kit generate`.
  - Seamless transaction handling and connection pooling.

---

## ADR 0006: Redis-Backed Idempotency and Rate Limiting
- **Status:** Accepted
- **Context:** Distributed distributed environments need distributed state for rate limiting and preventing duplicate state mutation on network retries.
- **Decision:**
  - **Rate Limiting:** Backed by Redis via `@fastify/rate-limit` using sliding window counters.
  - **Idempotency:** Custom Redis hook enforcing `Idempotency-Key` headers on mutating requests, preventing race conditions via short-lived in-progress distributed locks and caching executed responses.

---

## ADR 0007: OpenTelemetry and Prometheus Multi-Tier Observability
- **Status:** Accepted
- **Context:** Production services require structured distributed tracing, metrics aggregation, and health probes.
- **Decision:**
  - OpenTelemetry NodeSDK with auto-instrumentations for HTTP, Postgres, and Redis.
  - Dedicated Prometheus metrics registry on `/metrics` recording request durations and status code counters.
  - RFC-compliant Kubernetes health endpoints: `/health/live` (liveness) and `/health/ready` (readiness checking DB, Redis, and storage).
