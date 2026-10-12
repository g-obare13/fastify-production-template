/**
 * @file Application error classes and RFC 9457 Problem Details serialization.
 * @module src/lib/errors
 */

import { z } from 'zod';

/**
 * Stable, machine-readable application error codes shared across REST and GraphQL.
 */
export const ErrorCode = {
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  AUTH_TOKEN_INVALID: 'AUTH_TOKEN_INVALID',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  CSRF_VIOLATION: 'CSRF_VIOLATION',
  API_KEY_INVALID: 'API_KEY_INVALID',
  API_KEY_REVOKED: 'API_KEY_REVOKED',
  ORIGIN_MISMATCH: 'ORIGIN_MISMATCH',
} as const;

/**
 * Union type representing all allowable application error codes.
 */
export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Parameter validation failure detail conforming to RFC 9457 extensions.
 */
export interface ProblemDetailsInvalidParam {
  /** Field name of the invalid parameter */
  name: string;
  /** Human-readable explanation of why the parameter is invalid */
  reason: string;
  /** JSON Pointer or query path to the invalid parameter */
  path?: string;
}

/**
 * RFC 9457 Problem Details payload structure.
 */
export interface ProblemDetails {
  /** URI identifying problem category */
  type: string;
  /** Short summary of the problem type */
  title: string;
  /** HTTP status code */
  status: number;
  /** Human-readable explanation specific to this occurrence */
  detail: string;
  /** URI identifying specific occurrence */
  instance?: string | undefined;
  /** Stable application error code enum */
  code: string;
  /** Injected correlation identifier */
  requestId?: string | undefined;
  /** Field-level invalid parameters array */
  invalidParams?: ProblemDetailsInvalidParam[] | undefined;
  /** Arbitrary structured problem extensions */
  [key: string]: unknown;
}

/**
 * Zod schema validating and serializing RFC 9457 Problem Details responses.
 */
export const problemDetailsSchema = z
  .object({
    type: z.string().describe('URI reference identifying the problem type'),
    title: z.string().describe('Short summary of the problem type'),
    status: z.number().describe('HTTP status code'),
    detail: z.string().describe('Detailed explanation of this error occurrence'),
    instance: z.string().optional().describe('URI reference identifying this specific occurrence'),
    code: z.string().describe('Stable machine-readable error code'),
    requestId: z.string().optional().describe('Unique request tracing ID'),
    invalidParams: z
      .array(
        z.object({
          name: z.string(),
          reason: z.string(),
          path: z.string().optional(),
        })
      )
      .optional()
      .describe('List of invalid parameter details for validation failures'),
  })
  .describe('RFC 9457 Problem Details');

/**
 * Pre-configured OpenAPI error response mapping for standard HTTP status codes.
 */
export const errorResponses = {
  400: problemDetailsSchema.describe('Bad Request'),
  401: problemDetailsSchema.describe('Unauthorized'),
  403: problemDetailsSchema.describe('Forbidden'),
  404: problemDetailsSchema.describe('Not Found'),
  409: problemDetailsSchema.describe('Conflict'),
  422: problemDetailsSchema.describe('Unprocessable Entity'),
  429: problemDetailsSchema.describe('Too Many Requests'),
  500: problemDetailsSchema.describe('Internal Server Error'),
};

/**
 * Base abstract class for all domain errors that translate into RFC 9457 Problem Details.
 */
export abstract class AppError extends Error {
  /** HTTP status code returned for this error */
  abstract readonly statusCode: number;
  /** Stable application error code enum */
  abstract readonly code: string;

  /**
   * Constructs a new AppError with a human-readable message and optional details.
   *
   * @param message Explanatory error message
   * @param details Additional structured metadata describing the failure
   */
  constructor(
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Serializes the error into an RFC 9457 Problem Details object.
   *
   * @param requestId Correlation request identifier
   * @param instance Request URI path that originated the error
   * @returns Problem details payload
   * @example
   * ```ts
   * const problem = err.toProblemDetails('req_123', '/v1/users/42');
   * ```
   */
  toProblemDetails(requestId?: string, instance?: string): ProblemDetails {
    const problem: ProblemDetails = {
      type: `https://api.example.com/errors/${this.code.toLowerCase().replace(/_/g, '-')}`,
      title: this.name,
      status: this.statusCode,
      detail: this.message,
      code: this.code,
    };

    if (instance !== undefined) problem.instance = instance;
    if (requestId !== undefined) problem.requestId = requestId;
    if (this.details && typeof this.details === 'object') {
      problem.details = this.details;
    }

    return problem;
  }
}

/**
 * Raised when a requested resource does not exist (HTTP 404).
 */
export class NotFoundError extends AppError {
  readonly statusCode = 404;
  readonly code = ErrorCode.NOT_FOUND;
}

/**
 * Raised when a state-changing operation conflicts with existing resource state (HTTP 409).
 */
export class ConflictError extends AppError {
  readonly statusCode = 409;
  readonly code = ErrorCode.CONFLICT;
}

/**
 * Raised when request lacks valid authentication credentials (HTTP 401).
 */
export class UnauthorizedError extends AppError {
  readonly statusCode = 401;
  readonly code: string;

  /**
   * Constructs an UnauthorizedError with message and specific error code.
   *
   * @param message Explanatory authentication failure message
   * @param code Stable error code enum
   */
  constructor(message: string, code: string = ErrorCode.UNAUTHORIZED) {
    super(message);
    this.code = code;
  }
}

/**
 * Raised when supplied login credentials do not match stored records (HTTP 401).
 */
export class InvalidCredentialsError extends UnauthorizedError {
  /**
   * Constructs an InvalidCredentialsError with default message.
   *
   * @param message Failure explanation
   */
  constructor(message = 'Invalid email or password') {
    super(message, ErrorCode.AUTH_INVALID_CREDENTIALS);
  }
}

/**
 * Raised when authenticated caller lacks required permissions (HTTP 403).
 */
export class ForbiddenError extends AppError {
  readonly statusCode = 403;
  readonly code = ErrorCode.FORBIDDEN;
}

/**
 * Raised when CSRF token verification fails on mutating requests (HTTP 403).
 */
export class CsrfViolationError extends AppError {
  readonly statusCode = 403;
  readonly code = ErrorCode.CSRF_VIOLATION;

  /**
   * Constructs a CsrfViolationError with default message.
   *
   * @param message Failure explanation
   */
  constructor(message = 'CSRF token validation failed') {
    super(message);
  }
}

/**
 * Raised when request syntax or structure is malformed (HTTP 400).
 */
export class BadRequestError extends AppError {
  readonly statusCode = 400;
  readonly code: string;

  /**
   * Constructs a BadRequestError with message and error code.
   *
   * @param message Explanatory error message
   * @param code Stable error code enum
   */
  constructor(message: string, code: string = ErrorCode.BAD_REQUEST) {
    super(message);
    this.code = code;
  }
}

/**
 * Raised when request payload fails schema validation constraints (HTTP 422).
 */
export class ValidationError extends AppError {
  readonly statusCode = 422;
  readonly code = ErrorCode.VALIDATION_ERROR;

  /**
   * Constructs a ValidationError with message and invalid parameter list.
   *
   * @param message Error description
   * @param invalidParams Detailed field validation failures
   */
  constructor(
    message: string,
    public readonly invalidParams?: ProblemDetailsInvalidParam[]
  ) {
    super(message);
  }

  /**
   * Serializes validation failure into RFC 9457 with invalidParams list.
   *
   * @param requestId Correlation request identifier
   * @param instance Request URI path
   * @returns Problem details payload including invalidParams
   */
  override toProblemDetails(requestId?: string, instance?: string): ProblemDetails {
    const base = super.toProblemDetails(requestId, instance);
    if (this.invalidParams !== undefined) {
      base.invalidParams = this.invalidParams;
    }
    return base;
  }
}

/**
 * Raised when client exceeds rate limit quotas (HTTP 429).
 */
export class RateLimitedError extends AppError {
  readonly statusCode = 429;
  readonly code = ErrorCode.RATE_LIMITED;

  /**
   * Constructs a RateLimitedError with retry delay.
   *
   * @param message Rate limit notice
   * @param retryAfter Cooldown duration in seconds before next allowed request
   */
  constructor(
    message = 'Too many requests. Rate limit exceeded.',
    public readonly retryAfter?: number
  ) {
    super(message);
  }

  /**
   * Serializes rate limit failure into RFC 9457 including retryAfter header.
   *
   * @param requestId Correlation request identifier
   * @param instance Request URI path
   * @returns Problem details payload with retryAfter
   */
  override toProblemDetails(requestId?: string, instance?: string): ProblemDetails {
    const base = super.toProblemDetails(requestId, instance);
    if (this.retryAfter !== undefined) {
      base.retryAfter = this.retryAfter;
    }
    return base;
  }
}

/**
 * Raised when an unexpected server error occurs (HTTP 500).
 */
export class InternalServerError extends AppError {
  readonly statusCode = 500;
  readonly code = ErrorCode.INTERNAL_SERVER_ERROR;
}

/**
 * Raised when a downstream dependency is temporarily unavailable (HTTP 503).
 */
export class ServiceUnavailableError extends AppError {
  readonly statusCode = 503;
  readonly code = ErrorCode.SERVICE_UNAVAILABLE;
}
