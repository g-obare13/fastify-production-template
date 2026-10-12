# ADR 005: Multi-Mode Auth Core (Bearer, httpOnly Cookies, API Keys, Sessions)

## Status
Accepted

## Context
Production backends serve heterogeneous clients:
1. Single Page Applications (SPAs) and Server-Side Rendered (SSR) frameworks (Next.js, Nuxt, SvelteKit) requiring XSS-resilient `httpOnly` cookies with Double Submit CSRF protection.
2. Mobile and Native applications requiring standard `Authorization: Bearer <JWT>` tokens.
3. Server-to-server microservices and automated CLI integrations requiring cryptographically hashed, scoped API Keys (`app_...`).
Duplicating authentication logic across multiple middlewares or separating transports leads to inconsistent security postures and maintenance drift.

## Decision
We implemented a unified, multi-mode authentication core in `src/plugins/auth.ts` and `src/modules/auth/service.ts`:
1. **Multi-Mode Priority Resolution**:
   - For every incoming request (REST or GraphQL), the authenticator inspects:
     - `x-api-key` header -> Looks up the hashed key in the database, verifies expiration and scopes (e.g. `read:users`, `write:files`).
     - `Authorization: Bearer <token>` header -> Verifies the JWT signature, claims, and non-revocation status.
     - `access_token` signed httpOnly cookie -> Verifies the cookie signature, JWT claims, and enforces CSRF protection via double-submit `x-csrf-token` header comparison against `csrf_token` cookie on all state-mutating requests (`POST`, `PUT`, `PATCH`, `DELETE`).
2. **Session and Token Family Rotation**:
   - Refresh tokens are tracked in families. If an old refresh token is reused after already being rotated, the entire token family is immediately revoked to thwart token theft.
   - Users can list active sessions (`device`, `ipAddress`, `lastActiveAt`) and revoke specific sessions or all other sessions.
3. **PKCE for OAuth / Client Flows**:
   - Standard S256 code challenge generation and verification utilities (`generatePkceChallenge`, `verifyPkceChallenge`).
4. **Shared by REST and GraphQL**:
   - Fastify's decorator `app.authenticate` and `app.authenticateOptional` decorate `request.user` universally, making authentication context identical across REST handlers and Mercurius GraphQL execution contexts.

## Consequences
- **Positive**:
  - Full client flexibility: mobile, SPA, SSR, and third-party automated scripts authenticate transparently.
  - Zero duplication between REST and GraphQL authentication layers.
  - Complete CSRF and token-theft mitigation.
- **Negative**:
  - Requires maintaining cookie, bearer, and API key lookup code paths in the shared auth plugin.
