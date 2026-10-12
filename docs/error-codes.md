# Error Code Reference (RFC 9457)

This document provides the authoritative, stable error codes returned across both **REST** (`application/problem+json`) and **GraphQL** (`extensions.code`) API transports.

All errors conform to [RFC 9457 Problem Details for HTTP APIs](https://www.rfc-editor.org/rfc/rfc9457.html).

---

## Stable Error Code Catalog

| Error Code | HTTP Status | Description | Client Recovery Action |
|---|---|---|---|
| `BAD_REQUEST` | `400` | The request payload or syntax is malformed or missing required structure. | Check payload formatting and JSON syntax against the OpenAPI specification. |
| `VALIDATION_FAILED` | `422` | The request parameters failed schema validation constraints. | Inspect invalidParams array in the response to fix invalid parameter values. |
| `VALIDATION_ERROR` | `422` | Input failed business validation rules or field constraints. | Ensure all values satisfy length, regex, or uniqueness requirements. |
| `UNAUTHORIZED` | `401` | Authentication is required but was not provided or invalid. | Provide a valid Bearer token, session cookie, or x-api-key header. |
| `AUTH_INVALID_CREDENTIALS` | `401` | The provided email or password does not match any existing user. | Verify credentials and retry. Check for caps lock or typos. |
| `AUTH_TOKEN_EXPIRED` | `401` | The access token has expired (typically after 15 minutes). | Call POST /v1/auth/refresh to obtain a fresh access token. |
| `AUTH_TOKEN_INVALID` | `401` | The token signature or claims could not be verified. | Re-authenticate via POST /v1/auth/login. |
| `FORBIDDEN` | `403` | Authenticated caller does not possess required role or scope. | Request necessary administrative privileges or API key scopes. |
| `NOT_FOUND` | `404` | The targeted resource does not exist or has been soft-deleted. | Verify the resource identifier in the path URL. |
| `CONFLICT` | `409` | State conflict (e.g. unique constraint violation, existing email). | Use a different unique key or check resource state before retrying. |
| `RATE_LIMITED` | `429` | Request quota exceeded for the current sliding window or IP is banned. | Wait the duration specified in the Retry-After header before retrying. |
| `INTERNAL_SERVER_ERROR` | `500` | An unexpected internal error occurred on the server. | Contact support with the provided requestId. |
| `SERVICE_UNAVAILABLE` | `503` | The service is temporarily degraded or undergoing maintenance. | Retry with exponential backoff. |
| `CSRF_VIOLATION` | `403` | The x-csrf-token header does not match the csrf_token cookie. | Include the value from csrf_token cookie in the x-csrf-token header. |
| `API_KEY_INVALID` | `401` | The provided x-api-key header is not recognized or has expired. | Generate a new API key in the admin dashboard. |
| `API_KEY_REVOKED` | `401` | The API key has been revoked by an administrator or user. | Rotate to an active API key. |
| `ORIGIN_MISMATCH` | `403` | Origin or Referer header does not match configured CORS allowlist. | Verify application domain is included in CORS_ORIGIN configuration. |

---

## RFC 9457 Problem Details Structure

REST error responses use `Content-Type: application/problem+json; charset=utf-8`:

```json
{
  "type": "https://api.example.com/errors/auth-invalid-credentials",
  "title": "Unauthorized",
  "status": 401,
  "code": "AUTH_INVALID_CREDENTIALS",
  "detail": "Invalid email or password",
  "instance": "/v1/auth/login",
  "requestId": "req_01JABCDEF123456789"
}
```

## GraphQL Error Structure

GraphQL error responses surface the identical stable code in `extensions.code`:

```json
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
```
