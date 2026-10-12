/**
 * @file Validation schemas and DTOs for post endpoints.
 * @module modules/posts/schemas
 */

import { z } from 'zod';
import { cursorPaginationQuerySchema, pageInfoSchema } from '#src/lib/pagination.js';

/** Query parameters for cursor-paginated post listings. */
export const listPostsQuerySchema = cursorPaginationQuerySchema.pick({
  limit: true,
  cursor: true,
});

/** Schema describing a post returned by the API. */
export const postResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string().nullable().optional(),
  userId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

/** Schema describing the paginated response from the posts collection. */
export const paginatedPostsResponseSchema = z.object({
  items: z.array(postResponseSchema),
  pageInfo: pageInfoSchema,
});

/** Schema validating a request to create a post. */
export const createPostRequestSchema = z.object({
  title: z.string().min(1).max(255),
  content: z.string().optional(),
});

/** Schema validating a request to update a post. */
export const updatePostRequestSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  content: z.string().optional(),
}).refine((input) => input.title !== undefined || input.content !== undefined, {
  message: 'At least one field must be provided',
});

/** Type representing post list pagination parameters. */
export type ListPostsQuery = z.infer<typeof listPostsQuerySchema>;
/** Type representing the paginated posts API response. */
export type PaginatedPostsResponse = z.infer<typeof paginatedPostsResponseSchema>;
/** Type representing an individual post API response. */
export type PostResponse = z.infer<typeof postResponseSchema>;
/** Type representing a request to create a post. */
export type CreatePostRequest = z.infer<typeof createPostRequestSchema>;
/** Type representing a request to update a post. */
export type UpdatePostRequest = z.infer<typeof updatePostRequestSchema>;
