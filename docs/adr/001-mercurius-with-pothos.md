# ADR 001: Mercurius with Pothos (Code-First GraphQL)

## Status
Accepted

## Context
When building a modern backend supporting both REST and GraphQL APIs, teams often struggle with schema synchronization, type safety, and runtime overhead. Traditional approaches either use SDL-first (which requires separate tooling to generate TypeScript types) or heavy frameworks like Apollo Server that add unnecessary abstractions on top of Fastify.

## Decision
We chose **Mercurius** as the GraphQL runtime and **Pothos** as the schema builder:
1. **Mercurius**: Built specifically for Fastify by the Fastify core team. It leverages Fastify's JIT compilation and event-driven architecture, avoiding the overhead of Express adapters or nested middleware.
2. **Pothos**: A code-first schema builder with best-in-class TypeScript type inference. Pothos allows defining types, arguments, queries, and mutations with full static type checking without any code generation build step for the server.
3. **Plugins & Architecture**:
   - Pothos plugins used: `@pothos/plugin-dataloader` (batched queries eliminating N+1), `@pothos/plugin-relay` (Relay-compliant cursor connections), `@pothos/plugin-scope-auth` (declarative authorization), `@pothos/plugin-errors` (type-safe error unions), and `@pothos/plugin-zod` (runtime input validation).
   - Shared business services (`AuthService`, `UsersService`, `FilesService`) are injected via Fastify context, guaranteeing exact parity with REST endpoints.

## Consequences
- **Positive**:
  - Maximum runtime throughput with zero middleware translation latency.
  - Complete TypeScript compile-time safety across resolvers and context.
  - Shared validation logic via Zod and identical error code enums.
  - O(1) query count for nested relations using batched DataLoaders.
- **Negative**:
  - Developers need familiarity with the Pothos builder syntax instead of raw GraphQL SDL.
