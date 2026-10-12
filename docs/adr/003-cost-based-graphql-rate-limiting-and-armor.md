# ADR 003: Cost-Based GraphQL Rate Limiting and Armor Security Rules

## Status
Accepted

## Context
GraphQL endpoints allow clients to craft arbitrarily complex nested queries, request infinite recursive fields, or perform alias batching attacks (e.g. issuing thousands of identical subqueries under different alias keys in a single POST request). Standard HTTP request-rate limiting alone is inadequate because a single HTTP request can trigger thousands of database operations.

## Decision
We implemented a defense-in-depth security layer combining AST validation rules (Armor equivalents) and complexity scoring:
1. **Query Depth Limiting (`createDepthLimitRule`)**:
   - Rejects queries that exceed a maximum nesting depth (`GRAPHQL_MAX_DEPTH`, default: 8).
2. **Field Alias Limiting (`createMaxAliasesRule`)**:
   - Rejects queries containing more than `GRAPHQL_MAX_ALIASES` (default: 15) to prevent alias batching Denial of Service.
3. **Directive Limiting (`createMaxDirectivesRule`)**:
   - Rejects queries exceeding `GRAPHQL_MAX_DIRECTIVES` (default: 5) to prevent directive-based CPU exhaustion attacks.
4. **Complexity Scoring (`createComplexityLimitRule`)**:
   - Each scalar field costs 1 point.
   - Object and connection fields cost 2 points.
   - Mutating operations cost a baseline of 5 points.
   - Queries exceeding `GRAPHQL_MAX_COMPLEXITY` (default: 100) are rejected prior to execution.
5. **Introspection Protection**:
   - Introspection is automatically disabled in production (`NoSchemaIntrospectionCustomRule`) unless explicitly permitted via `GRAPHQL_INTROSPECTION_ENABLED=true`.
6. **Persisted Queries Allow-List Mode**:
   - In locked-down production environments (`GRAPHQL_PERSISTED_QUERIES_ONLY=true`), arbitrary queries are rejected; only pre-registered query hashes known to the server are executed.

## Consequences
- **Positive**:
  - Eliminates Denial of Service vectors unique to GraphQL.
  - Predictable CPU and database load per operation.
  - Transparent error messages with stable `GRAPHQL_QUERY_TOO_COMPLEX` codes.
- **Negative**:
  - Complex frontend queries must stay within predefined depth and complexity budgets.
