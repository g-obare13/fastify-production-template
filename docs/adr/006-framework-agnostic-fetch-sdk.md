# ADR 006: Framework-Agnostic Fetch SDK with Single-Flight Refresh Mutex

## Status
Accepted

## Context
Fullstack TypeScript applications typically need client libraries for web, Node.js scripts, React Native, and SSR edge workers (Cloudflare Workers, Vercel Edge). Bundling heavy dependencies (like Axios or Node-specific `http` agents) increases bundle sizes, causes runtime incompatibility in edge runtimes, and complicates maintenance. Furthermore, when access tokens expire, concurrent requests can trigger multiple redundant token refresh calls (a "thundering herd" refresh race).

## Decision
We built the official SDK (`packages/sdk`) using standard Web APIs (`fetch`, `Headers`, `Response`) and `openapi-fetch`:
1. **Zero Node-Only Dependencies**:
   - Relies exclusively on standard `fetch`, allowing it to run natively in Browsers, Node.js 18+, Deno, Bun, and Edge Workers.
2. **Compile-Time Type Safety**:
   - Powered by TypeScript types generated directly from `openapi.json` via `openapi-typescript`.
3. **Single-Flight Refresh Mutex**:
   - If an API request receives HTTP 401 and an `onRefreshToken` callback is provided, the client executes a single asynchronous refresh request.
   - All concurrent requests in flight wait for the same underlying Promise, preventing duplicate refresh calls.
4. **Resilience & Rate Limiting**:
   - Automatic exponential backoff retries on HTTP 5xx errors and network failures.
   - Respects HTTP 429 `Retry-After` headers before retrying.
5. **RFC 9457 Problem Details Integration**:
   - Non-2xx responses automatically throw a typed `ApiError` class exposing structured fields: `status`, `code`, `title`, `detail`, `requestId`, and `invalidParams`.
6. **Dual Transport Support**:
   - In addition to typed REST endpoints, the SDK provides `client.graphql(query, variables)` using the same authenticated fetch core.

## Consequences
- **Positive**:
  - Extremely lightweight bundle footprint (< 5KB minified/gzipped).
  - Works seamlessly across all modern JavaScript runtimes without polyfills.
  - Complete protection against token refresh race conditions.
- **Negative**:
  - Older environments lacking global `fetch` require a polyfill (e.g. `undici` or `cross-fetch`).
