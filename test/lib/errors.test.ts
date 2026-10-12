/**
 * @file Unit tests verifying AppError hierarchy and RFC 9457 Problem Details formatting.
 * @module test/lib/errors
 */

import { describe, expect, it } from 'vitest';
import {
  ConflictError,
  ForbiddenError,
  InternalServerError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '#src/lib/errors.js';

describe('AppError Hierarchy & Problem Details RFC 9457', () => {
  it('formats NotFoundError correctly', () => {
    const err = new NotFoundError('User not found');
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    const problem = err.toProblemDetails('req-123', '/users/1');
    expect(problem.status).toBe(404);
    expect(problem.title).toBe('NotFoundError');
    expect(problem.detail).toBe('User not found');
    expect(problem.requestId).toBe('req-123');
    expect(problem.instance).toBe('/users/1');
  });

  it('formats ConflictError correctly', () => {
    const err = new ConflictError('Email already exists');
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('CONFLICT');
  });

  it('formats UnauthorizedError and ForbiddenError correctly', () => {
    const unauth = new UnauthorizedError('Token expired');
    expect(unauth.statusCode).toBe(401);

    const forbidden = new ForbiddenError('Insufficient permissions');
    expect(forbidden.statusCode).toBe(403);
  });

  it('formats ValidationError with invalidParams', () => {
    const valErr = new ValidationError('Invalid inputs', [
      { name: 'email', reason: 'Must be a valid email' },
    ]);
    expect(valErr.statusCode).toBe(422);
    const problem = valErr.toProblemDetails('req-999');
    expect(problem.invalidParams).toHaveLength(1);
    expect(problem.invalidParams?.[0]?.name).toBe('email');
  });

  it('formats InternalServerError correctly', () => {
    const err = new InternalServerError('Database failure');
    expect(err.statusCode).toBe(500);
  });
});
