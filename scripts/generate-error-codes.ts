/**
 * @file CLI generator producing markdown error catalogs and descriptions from ErrorCode enum.
 * @module scripts/generate-error-codes
 */

import fs from 'node:fs';
import path from 'node:path';
import { ErrorCode } from '#src/lib/errors.js';

interface ErrorMetadata {
  status: number;
  description: string;
  recovery: string;
}

const ERROR_METADATA: Record<string, ErrorMetadata> = {
  BAD_REQUEST: {
    status: 400,
    description: 'The request payload or syntax is malformed or missing required structure.',
    recovery: 'Check payload formatting and JSON syntax against the OpenAPI specification.',
  },
  VALIDATION_FAILED: {
    status: 422,
    description: 'The request parameters failed schema validation constraints.',
    recovery: 'Inspect invalidParams array in the response to fix invalid parameter values.',
  },
  VALIDATION_ERROR: {
    status: 422,
    description: 'Input failed business validation rules or field constraints.',
    recovery: 'Ensure all values satisfy length, regex, or uniqueness requirements.',
  },
  UNAUTHORIZED: {
    status: 401,
    description: 'Authentication is required but was not provided or invalid.',
    recovery: 'Provide a valid Bearer token, session cookie, or x-api-key header.',
  },
  AUTH_INVALID_CREDENTIALS: {
    status: 401,
    description: 'The provided email or password does not match any existing user.',
    recovery: 'Verify credentials and retry. Check for caps lock or typos.',
  },
  AUTH_TOKEN_EXPIRED: {
    status: 401,
    description: 'The access token has expired (typically after 15 minutes).',
    recovery: 'Call POST /v1/auth/refresh to obtain a fresh access token.',
  },
  AUTH_TOKEN_INVALID: {
    status: 401,
    description: 'The token signature or claims could not be verified.',
    recovery: 'Re-authenticate via POST /v1/auth/login.',
  },
  FORBIDDEN: {
    status: 403,
    description: 'Authenticated caller does not possess required role or scope.',
    recovery: 'Request necessary administrative privileges or API key scopes.',
  },
  NOT_FOUND: {
    status: 404,
    description: 'The targeted resource does not exist or has been soft-deleted.',
    recovery: 'Verify the resource identifier in the path URL.',
  },
  CONFLICT: {
    status: 409,
    description: 'State conflict (e.g. unique constraint violation, existing email).',
    recovery: 'Use a different unique key or check resource state before retrying.',
  },
  RATE_LIMITED: {
    status: 429,
    description: 'Request quota exceeded for the current sliding window or IP is banned.',
    recovery: 'Wait the duration specified in the Retry-After header before retrying.',
  },
  INTERNAL_SERVER_ERROR: {
    status: 500,
    description: 'An unexpected internal error occurred on the server.',
    recovery: 'Contact support with the provided requestId.',
  },
  SERVICE_UNAVAILABLE: {
    status: 503,
    description: 'The service is temporarily degraded or undergoing maintenance.',
    recovery: 'Retry with exponential backoff.',
  },
  CSRF_VIOLATION: {
    status: 403,
    description: 'The x-csrf-token header does not match the csrf_token cookie.',
    recovery: 'Include the value from csrf_token cookie in the x-csrf-token header.',
  },
  API_KEY_INVALID: {
    status: 401,
    description: 'The provided x-api-key header is not recognized or has expired.',
    recovery: 'Generate a new API key in the admin dashboard.',
  },
  API_KEY_REVOKED: {
    status: 401,
    description: 'The API key has been revoked by an administrator or user.',
    recovery: 'Rotate to an active API key.',
  },
  ORIGIN_MISMATCH: {
    status: 403,
    description: 'Origin or Referer header does not match configured CORS allowlist.',
    recovery: 'Verify application domain is included in CORS_ORIGIN configuration.',
  },
};

const outputPath = path.resolve('docs/error-codes.md');

let markdown = `# Error Code Reference (RFC 9457)

This document provides the authoritative, stable error codes returned across both **REST** (\`application/problem+json\`) and **GraphQL** (\`extensions.code\`) API transports.

All errors conform to [RFC 9457 Problem Details for HTTP APIs](https://www.rfc-editor.org/rfc/rfc9457.html).

---

## Stable Error Code Catalog

| Error Code | HTTP Status | Description | Client Recovery Action |
|---|---|---|---|
`;

for (const [code, val] of Object.entries(ErrorCode)) {
  const meta = ERROR_METADATA[val] ?? {
    status: 400,
    description: 'General application error',
    recovery: 'Inspect the error details and retry.',
  };
  markdown += `| \`${code}\` | \`${meta.status}\` | ${meta.description} | ${meta.recovery} |\n`;
}

markdown += `
---

## RFC 9457 Problem Details Structure

REST error responses use \`Content-Type: application/problem+json; charset=utf-8\`:

\`\`\`json
{
  "type": "https://api.example.com/errors/auth-invalid-credentials",
  "title": "Unauthorized",
  "status": 401,
  "code": "AUTH_INVALID_CREDENTIALS",
  "detail": "Invalid email or password",
  "instance": "/v1/auth/login",
  "requestId": "req_01JABCDEF123456789"
}
\`\`\`

## GraphQL Error Structure

GraphQL error responses surface the identical stable code in \`extensions.code\`:

\`\`\`json
{
  "errors": [
    {
      "message": "Invalid email or password",
      "locations": [{ "line": 2, "column": 3 }],
      "path": ["login"],
      "extensions": {
        "code": "AUTH_INVALID_CREDENTIALS",
        "requestId": "req_01JABCDEF123456789"
      }
    }
  ]
}
\`\`\`
`;

fs.writeFileSync(outputPath, markdown, 'utf8');
process.stdout.write(`[gen:errors] Error codes reference generated -> ${outputPath}\n`);
