/**
 * @file Business operations for creating and managing posts.
 * @module modules/posts/service
 */

import { ForbiddenError, NotFoundError } from '#src/lib/errors.js';
import type { CursorPaginatedResponse } from '#src/lib/pagination.js';
import { generateId } from '#src/lib/id.js';
import type { PostRepository, PostRecord } from './repository.js';
import type { CreatePostRequest, ListPostsQuery, UpdatePostRequest } from './schemas.js';

/** Business operations for creating, listing, and managing posts. */
export class PostService {
  /**
   * Initializes the service with a posts repository.
   *
   * @param repo Persistence implementation for posts.
   */
  constructor(private readonly repo: PostRepository) {}

  /**
   * Retrieves a cursor-paginated list of active posts.
   *
   * @param query Pagination parameters.
   * @returns The posts and pagination metadata.
   */
  async listPosts(query: ListPostsQuery): Promise<CursorPaginatedResponse<PostRecord>> {
    return this.repo.listPosts(query);
  }

  /**
   * Retrieves a post by its identifier.
   *
   * @param id Post identifier.
   * @returns The matching active post.
   * @throws NotFoundError When the post does not exist or was deleted.
   */
  async getById(id: string): Promise<PostRecord> {
    const record = await this.repo.findById(id);
    if (!record || record.deletedAt) {
      throw new NotFoundError('Post not found');
    }
    return record;
  }

  /**
   * Creates a post owned by the supplied user.
   *
   * @param userId Authenticated user's identifier.
   * @param input Post fields.
   * @returns The created post.
   */
  async create(userId: string, input: CreatePostRequest): Promise<PostRecord> {
    const id = generateId('post');
    return this.repo.create({
      id,
      title: input.title,
      content: input.content ?? null,
      userId,
    });
  }

  /**
   * Updates an active post.
   *
   * @param id Post identifier.
   * @param userId Authenticated user's identifier.
   * @param role Authenticated user's role.
   * @param input Fields to update.
   * @returns The updated post.
   * @throws ForbiddenError When the requester is neither the author nor an admin.
   */
  async update(
    id: string,
    userId: string,
    role: 'user' | 'admin',
    input: UpdatePostRequest
  ): Promise<PostRecord> {
    const post = await this.getById(id);
    this.assertCanManage(post, userId, role);
    return this.repo.update(id, input);
  }

  /**
   * Soft-deletes an active post.
   *
   * @param id Post identifier.
   * @param userId Authenticated user's identifier.
   * @param role Authenticated user's role.
   * @throws ForbiddenError When the requester is neither the author nor an admin.
   */
  async delete(id: string, userId: string, role: 'user' | 'admin'): Promise<void> {
    const post = await this.getById(id);
    this.assertCanManage(post, userId, role);
    await this.repo.softDelete(id);
  }

  /**
   * Ensures the caller owns the post or has the administrator role.
   *
   * @param post Post being changed.
   * @param userId Authenticated user's identifier.
   * @param role Authenticated user's role.
   * @throws ForbiddenError When the caller lacks permission.
   */
  private assertCanManage(post: PostRecord, userId: string, role: 'user' | 'admin'): void {
    if (post.userId !== userId && role !== 'admin') {
      throw new ForbiddenError('Only the post author or an admin can manage this post');
    }
  }
}
