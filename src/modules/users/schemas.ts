/**
 * @file Zod validation schemas and DTOs for user account management and queries.
 * @module modules/users/schemas
 */

import { z } from 'zod';
import { cursorPaginationQuerySchema } from '#src/lib/pagination.js';
import { userProfileSchema } from '#src/modules/auth/schemas.js';

/** Query parameters schema for keyset paginated user queries with role filters. */
export const listUsersQuerySchema = cursorPaginationQuerySchema.extend({
  role: z.enum(['user', 'admin']).optional(),
  email: z.string().optional(),
  fields: z.string().optional(),
  include: z.string().optional(),
});

/** Query parameter schema for sparse fieldsets and relation inclusions. */
export const getUserQuerySchema = z.object({
  fields: z.string().optional(),
  include: z.string().optional(),
});

/** Schema for updating user avatar and profile details. */
export const updateUserProfileSchema = z.object({
  avatarUrl: z.string().url().nullable().optional(),
});

/** Schema for administrative role modification. */
export const updateUserRoleSchema = z.object({
  role: z.enum(['user', 'admin']),
});

/** Keyset paginated response envelope for user lists. */
export const paginatedUsersResponseSchema = z.object({
  items: z.array(z.record(z.unknown())),
  pageInfo: z.object({
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
    hasNextPage: z.boolean().optional(),
    hasPreviousPage: z.boolean().optional(),
    startCursor: z.string().nullable().optional(),
    endCursor: z.string().nullable().optional(),
    limit: z.number().optional(),
  }),
});

/** Schema validating URL parameter containing user ID. */
export const userIdParamSchema = z.object({
  id: z.string(),
});

/** Type representing user list pagination and filtering query parameters. */
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

/** Type representing single user query options. */
export type GetUserQuery = z.infer<typeof getUserQuerySchema>;

/** Type representing user profile update request body. */
export type UpdateUserProfile = z.infer<typeof updateUserProfileSchema>;

/** Type representing user role modification request body. */
export type UpdateUserRole = z.infer<typeof updateUserRoleSchema>;
