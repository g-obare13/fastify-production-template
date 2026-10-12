# Environment Configuration Reference

> Generated automatically from the Zod environment schema. Do not edit directly.

| Variable | Type | Default | Required | Description |
| :--- | :--- | :--- | :--- | :--- |
| `NODE_ENV` | `string` | `development` | No | Node environment (development, test, production) |
| `PORT` | `number` | `3000` | No | Server listening port |
| `HOST` | `string` | `0.0.0.0` | No | Server binding network host |
| `LOG_LEVEL` | `string` | `info` | No | Logging level (fatal, error, warn, info, debug, trace, silent) |
| `TRUST_PROXY` | `string` | `127.0.0.1,::1` | No | Trusted reverse proxy IP list or hop count (fail-safe in production) |
| `API_PREFIX` | `string` | `/v1` | No | Base path prefix for all REST routes |
| `REST_ENABLED` | `boolean` | `true` | No | Toggle REST API surface on/off |
| `GRAPHQL_ENABLED` | `boolean` | `true` | No | Toggle GraphQL API surface on/off |
| `DOCS_ENABLED` | `boolean` | `true` | No | Toggle API documentation UI and spec endpoints on/off (defaults to false in production) |
| `DOCS_UI` | `string` | `scalar` | No | Interactive documentation UI renderer: scalar or swagger |
| `DOCS_BASIC_AUTH_USER` | `string` | `(empty)` | No | HTTP Basic Auth username to protect docs in staging/production |
| `DOCS_BASIC_AUTH_PASSWORD` | `string` | `(empty)` | No | HTTP Basic Auth password to protect docs in staging/production |
| `DOCS_EXPOSE_SCHEMA` | `boolean` | `true` | No | Serve printed GraphQL schema at /schema.graphql |
| `API_TITLE` | `string` | `Fastify Production API` | No | OpenAPI title for documentation |
| `API_DESCRIPTION` | `string` | `Production-grade Fastify template with REST, GraphQL, Auth, and Storage` | No | OpenAPI description |
| `API_CONTACT_NAME` | `string` | `API Support` | No | OpenAPI contact name |
| `API_CONTACT_EMAIL` | `string` | `support@example.com` | No | OpenAPI contact email |
| `API_CONTACT_URL` | `string` | `https://example.com/support` | No | OpenAPI contact URL |
| `API_LICENSE_NAME` | `string` | `MIT` | No | OpenAPI license name |
| `API_LICENSE_URL` | `string` | `https://opensource.org/licenses/MIT` | No | OpenAPI license URL |
| `API_SERVERS` | `string` | `http://localhost:3000` | No | Comma-separated OpenAPI server URLs |
| `CORS_ORIGIN` | `string` | `http://localhost:3000` | No | Primary allowed CORS origin |
| `CORS_ORIGINS` | `string` | `(empty)` | No | Comma-separated exact origins, wildcard subdomains, and regex patterns |
| `CORS_CREDENTIALS` | `boolean` | `true` | No | Enable credentials (cookies/auth) in CORS headers |
| `CORS_DEV_PRESET` | `boolean` | `true` | No | Allow common frontend dev ports (3000, 5173, 4200, 8081) |
| `JWT_SECRET` | `string` | `(empty)` | **Yes** | Secret key for signing access JWTs (min 32 chars) |
| `JWT_EXPIRES_IN` | `string` | `15m` | No | Lifespan of access JWT |
| `REFRESH_TOKEN_EXPIRES_DAYS` | `number` | `7` | No | Lifespan of refresh tokens in days |
| `COOKIE_SECRET` | `string` | `(empty)` | **Yes** | Secret key for signing HTTP cookies (min 32 chars) |
| `COOKIE_DOMAIN` | `string` | `localhost` | No | Domain attribute for session cookies |
| `COOKIE_SECURE` | `boolean` | `false` | No | Require HTTPS for cookies (true in production) |
| `DATABASE_URL` | `string` | `(empty)` | **Yes** | PostgreSQL connection URL |
| `REDIS_URL` | `string` | `redis://localhost:6379` | **Yes** | Redis connection URL for caching, rate limiting, and BullMQ |
| `RATE_LIMIT_ENABLED` | `boolean` | `true` | No | Enable distributed rate limiting |
| `RATE_LIMIT_MAX` | `number` | `100` | No | Max requests per sliding window |
| `RATE_LIMIT_WINDOW_MS` | `number` | `60000` | No | Sliding window duration in milliseconds |
| `RATE_LIMIT_FAIL_MODE` | `string` | `closed` | No | Behavior when Redis is down: open or closed |
| `STORAGE_DRIVER` | `string` | `local` | No | Storage driver: local or s3 |
| `STORAGE_ALLOW_LOCAL_IN_PROD` | `boolean` | `false` | No | Allow local storage in production (unsafe fallback) |
| `S3_BUCKET` | `string` | `app-uploads` | No | S3 / MinIO bucket name |
| `S3_REGION` | `string` | `us-east-1` | No | AWS / S3 region |
| `S3_ENDPOINT` | `string` | `(empty)` | No | Custom S3 endpoint for MinIO, Cloudflare R2, Wasabi |
| `S3_ACCESS_KEY_ID` | `string` | `(empty)` | No | S3 access key ID |
| `S3_SECRET_ACCESS_KEY` | `string` | `(empty)` | No | S3 secret access key |
| `STORAGE_MAX_FILE_SIZE_MB` | `number` | `25` | No | Max allowed file upload size in MB |
| `GRAPHQL_PLAYGROUND_ENABLED` | `boolean` | `true` | No | Enable GraphiQL playground in non-production |
| `GRAPHQL_MAX_DEPTH` | `number` | `10` | No | Maximum allowable GraphQL query AST depth |
| `GRAPHQL_MAX_COMPLEXITY` | `number` | `1000` | No | Maximum query complexity score threshold |
| `GRAPHQL_PERSISTED_QUERIES_ONLY` | `boolean` | `false` | No | Enforce persisted query allow-list mode |
