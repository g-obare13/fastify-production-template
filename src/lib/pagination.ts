/**
 * @file Opaque cursor-based pagination and sorting helpers for REST and GraphQL.
 * @module src/lib/pagination
 */

import { z } from 'zod';
import { BadRequestError } from './errors.js';

/**
 * Payload encoded inside opaque pagination cursors.
 */
export interface CursorPayload {
  /** Resource unique identifier */
  id: string;
  /** ISO 8601 UTC timestamp of creation */
  createdAt: string;
}

/**
 * Encodes an ID and timestamp into an opaque, URL-safe base64 pagination cursor.
 *
 * @param payload Object containing resource ID and creation timestamp
 * @returns Opaque URL-safe base64 cursor string
 * @example
 * ```ts
 * const cursor = encodeCursor({ id: 'usr_123', createdAt: '2026-10-11T12:00:00.000Z' });
 * ```
 */
export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

/**
 * Decodes an opaque base64 cursor into its constituent ID and timestamp fields.
 *
 * @param cursor URL-safe base64 string previously produced by encodeCursor
 * @returns Decoded cursor payload
 * @throws BadRequestError When the cursor is malformed or invalid
 * @example
 * ```ts
 * const { id, createdAt } = decodeCursor(rawCursor);
 * ```
 */
export function decodeCursor(cursor: string): CursorPayload {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.id !== 'string' || typeof parsed.createdAt !== 'string') {
      throw new Error('Invalid cursor structure');
    }
    return parsed as CursorPayload;
  } catch {
    throw new BadRequestError('Invalid or malformed pagination cursor');
  }
}

/**
 * Zod schema validating common cursor pagination query parameters.
 */
export const cursorPaginationQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(20),
  cursor: z.string().optional(),
  sortBy: z.string().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

/**
 * Parsed and validated cursor pagination query parameters.
 */
export type CursorPaginationQuery = z.infer<typeof cursorPaginationQuerySchema>;

/**
 * Zod schema describing pagination metadata and page boundaries.
 */
export const pageInfoSchema = z.object({
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
  hasNextPage: z.boolean().optional(),
  hasPreviousPage: z.boolean().optional(),
  startCursor: z.string().nullable().optional(),
  endCursor: z.string().nullable().optional(),
  limit: z.number().optional(),
});

/**
 * Metadata describing current page status and next cursor availability.
 */
export type PageInfo = z.infer<typeof pageInfoSchema>;

/**
 * Standard enveloped paginated response structure.
 */
export interface CursorPaginatedResponse<T> {
  /** Current page array of records */
  items: T[];
  /** Pagination traversal metadata */
  pageInfo: {
    nextCursor: string | null;
    hasMore: boolean;
    hasNextPage?: boolean;
    hasPreviousPage?: boolean;
    startCursor?: string | null;
    endCursor?: string | null;
    limit: number;
  };
}

/**
 * Constructs a standardized paginated response with computed pageInfo and cursors.
 *
 * @param items Array of fetched database items (including extra lookahead item if queried)
 * @param limit Requested page size
 * @param hasExtraItem Whether query returned limit + 1 items indicating another page exists
 * @param hasPreviousCursor Whether initial request included a cursor parameter
 * @returns Enveloped items array and complete pageInfo object
 * @example
 * ```ts
 * const response = createPaginatedResponse(records, 20, records.length > 20, !!cursor);
 * ```
 */
export function createPaginatedResponse<T extends { id: string; createdAt: Date | string }>(
  items: T[],
  limit: number,
  hasExtraItem: boolean,
  hasPreviousCursor = false
): CursorPaginatedResponse<T> {
  const resultItems = hasExtraItem ? items.slice(0, limit) : items;
  const startItem = resultItems[0];
  const lastItem = resultItems[resultItems.length - 1];

  const startCursor = startItem
    ? encodeCursor({
        id: startItem.id,
        createdAt:
          typeof startItem.createdAt === 'string'
            ? startItem.createdAt
            : startItem.createdAt.toISOString(),
      })
    : null;

  const endCursor = lastItem
    ? encodeCursor({
        id: lastItem.id,
        createdAt:
          typeof lastItem.createdAt === 'string'
            ? lastItem.createdAt
            : lastItem.createdAt.toISOString(),
      })
    : null;

  return {
    items: resultItems,
    pageInfo: {
      nextCursor: hasExtraItem ? endCursor : null,
      hasMore: hasExtraItem,
      hasNextPage: hasExtraItem,
      hasPreviousPage: hasPreviousCursor,
      startCursor,
      endCursor,
      limit,
    },
  };
}

/**
 * Validates requested sort field against allowed whitelist, falling back to default.
 *
 * @param field Field name supplied by caller
 * @param allowedFields Whitelisted database column names
 * @param defaultField Fallback column name
 * @returns Validated sort field
 * @example
 * ```ts
 * const sort = validateSortField(query.sortBy, ['createdAt', 'email'] as const, 'createdAt');
 * ```
 */
export function validateSortField<T extends string>(
  field: string,
  allowedFields: readonly T[],
  defaultField: T
): T {
  if (allowedFields.includes(field as T)) {
    return field as T;
  }
  return defaultField;
}
