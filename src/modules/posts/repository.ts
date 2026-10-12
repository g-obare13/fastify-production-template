/**
 * @file Persistence contract and Drizzle implementation for posts.
 * @module modules/posts/repository
 */

import { and, desc, eq, isNull, lt, or } from 'drizzle-orm';
import type { Database } from '#src/db/client.js';
import { posts } from '#src/db/schema.js';
import { NotFoundError } from '#src/lib/errors.js';
import { createPaginatedResponse, decodeCursor } from '#src/lib/pagination.js';
import type { CursorPaginatedResponse } from '#src/lib/pagination.js';
import type { ListPostsQuery } from './schemas.js';

/**
 * A post row returned by the repository.
 */
export interface PostRecord {
  id: string;
  title: string;
  content: string | null;
  userId: string;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Persistence operations used by the posts service.
 */
export interface PostRepository {
  /**
   * Retrieves active posts in cursor order.
   *
   * @param query Pagination parameters.
   * @returns A cursor-paginated collection of posts.
   */
  listPosts(query: ListPostsQuery): Promise<CursorPaginatedResponse<PostRecord>>;

  /**
   * Finds an active post by ID.
   *
   * @param id Post identifier.
   * @returns The post or null when it does not exist or was deleted.
   */
  findById(id: string): Promise<PostRecord | null>;

  /**
   * Inserts a post.
   *
   * @param data Post fields to insert.
   * @returns The inserted post.
   */
  create(
    data: Omit<PostRecord, 'deletedAt' | 'createdAt' | 'updatedAt'>
  ): Promise<PostRecord>;

  /**
   * Updates an active post.
   *
   * @param id Post identifier.
   * @param data Fields to update.
   * @returns The updated post.
   */
  update(
    id: string,
    data: { title?: string | undefined; content?: string | undefined }
  ): Promise<PostRecord>;

  /**
   * Soft-deletes an active post.
   *
   * @param id Post identifier.
   */
  softDelete(id: string): Promise<void>;
}

/**
 * Drizzle-backed PostgreSQL implementation of the posts repository.
 */
export class DrizzlePostsRepository implements PostRepository {
  /**
   * Creates a posts repository using the shared Drizzle database client.
   *
   * @param db The application's Drizzle database instance.
   */
  constructor(private readonly db: Database) {}

  /**
   * Retrieves a cursor-paginated list of active posts.
   *
   * @param query Pagination parameters.
   * @returns A cursor-paginated collection of posts.
   */
  async listPosts(query: ListPostsQuery): Promise<CursorPaginatedResponse<PostRecord>> {
    const limit = query.limit ?? 20;
    const cursorCondition = query.cursor
      ? (() => {
          const decoded = decodeCursor(query.cursor);
          const createdAt = new Date(decoded.createdAt);
          return or(
            lt(posts.createdAt, createdAt),
            and(eq(posts.createdAt, createdAt), lt(posts.id, decoded.id))
          );
        })()
      : undefined;

    const records = await this.db
      .select()
      .from(posts)
      .where(and(isNull(posts.deletedAt), cursorCondition))
      .orderBy(desc(posts.createdAt), desc(posts.id))
      .limit(limit + 1);

    return createPaginatedResponse(
      records,
      limit,
      records.length > limit,
      query.cursor !== undefined
    );
  }

  /**
   * Finds an active post by ID.
   *
   * @param id The post identifier.
   * @returns The post, or null when it does not exist or was deleted.
   */
  async findById(id: string): Promise<PostRecord | null> {
    const [post] = await this.db
      .select()
      .from(posts)
      .where(and(eq(posts.id, id), isNull(posts.deletedAt)))
      .limit(1);

    return post ?? null;
  }

  /**
   * Inserts a post and returns its database-generated timestamps.
   *
   * @param data Post fields to insert.
   * @returns The inserted post.
   */
  async create(
    data: Omit<PostRecord, 'deletedAt' | 'createdAt' | 'updatedAt'>
  ): Promise<PostRecord> {
    const [post] = await this.db.insert(posts).values(data).returning();
    if (!post) {
      throw new Error('Post insert did not return the created record');
    }
    return post;
  }

  /**
   * Updates fields on an active post and refreshes its updated timestamp.
   *
   * @param id The post identifier.
   * @param data Fields to update.
   * @returns The updated post.
   */
  async update(
    id: string,
    data: { title?: string | undefined; content?: string | undefined }
  ): Promise<PostRecord> {
    const [post] = await this.db
      .update(posts)
      .set({
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.content !== undefined ? { content: data.content } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(posts.id, id), isNull(posts.deletedAt)))
      .returning();

    if (!post) {
      throw new NotFoundError('Post not found');
    }
    return post;
  }

  /**
   * Soft-deletes an active post.
   *
   * @param id The post identifier.
   */
  async softDelete(id: string): Promise<void> {
    const [post] = await this.db
      .update(posts)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(posts.id, id), isNull(posts.deletedAt)))
      .returning({ id: posts.id });

    if (!post) {
      throw new NotFoundError('Post not found');
    }
  }
}
