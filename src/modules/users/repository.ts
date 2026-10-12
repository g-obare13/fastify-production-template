/**
 * @file Database repository querying and managing User records in PostgreSQL.
 * @module modules/users/repository
 */

import { and, desc, eq, gt, inArray, isNull, lt } from 'drizzle-orm';
import type { Database } from '#src/db/client.js';
import { type User, users } from '#src/db/schema.js';
import {
  type CursorPaginatedResponse,
  type CursorPaginationQuery,
  decodeCursor,
  encodeCursor,
} from '#src/lib/pagination.js';
import type { ListUsersQuery } from './schemas.js';

/** Repository contract for user accounts and paginated lists. */
export interface UsersRepository {
  /**
   * Finds an active user by ID.
   *
   * @param id User ID
   * @returns User entity or null if not found
   */
  findById(id: string): Promise<User | null>;

  /**
   * Batch finds active users by their IDs.
   *
   * @param ids List of user IDs
   * @returns List of found user entities
   */
  findByIds(ids: string[]): Promise<User[]>;

  /**
   * Finds an active user by email address.
   *
   * @param email User email address
   * @returns User entity or null if not found
   */
  findByEmail(email: string): Promise<User | null>;

  /**
   * Retrieves a cursor-paginated list of active users.
   *
   * @param query Pagination and filtering parameters
   * @returns Paginated users response
   */
  listUsers(query: ListUsersQuery): Promise<CursorPaginatedResponse<User>>;

  /**
   * Updates user fields by ID.
   *
   * @param id User ID
   * @param data Fields to update
   * @returns Updated user entity
   */
  updateUser(id: string, data: Partial<User>): Promise<User>;

  /**
   * Soft deletes a user by setting deletedAt timestamp.
   *
   * @param id User ID
   * @returns Resolves when deleted
   */
  softDeleteUser(id: string): Promise<void>;
}

/** Drizzle ORM implementation of the users repository. */
export class DrizzleUsersRepository implements UsersRepository {
  /**
   * Initializes users repository with Drizzle database client.
   *
   * @param db Drizzle database client instance.
   */
  constructor(private readonly db: Database) {}

  /**
   * Finds an active user by ID.
   *
   * @param id User ID
   * @returns User entity or null if not found
   */
  async findById(id: string): Promise<User | null> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.id, id), isNull(users.deletedAt)))
      .limit(1);
    return user ?? null;
  }

  /**
   * Batch finds active users by their IDs.
   *
   * @param ids List of user IDs
   * @returns List of found user entities
   */
  async findByIds(ids: string[]): Promise<User[]> {
    if (ids.length === 0) return [];
    return this.db
      .select()
      .from(users)
      .where(and(inArray(users.id, ids), isNull(users.deletedAt)));
  }

  /**
   * Finds an active user by email address.
   *
   * @param email User email address
   * @returns User entity or null if not found
   */
  async findByEmail(email: string): Promise<User | null> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.email, email), isNull(users.deletedAt)))
      .limit(1);
    return user ?? null;
  }

  /**
   * Retrieves a cursor-paginated list of active users.
   *
   * @param query Pagination and filtering parameters
   * @returns Paginated users response
   */
  async listUsers(query: ListUsersQuery): Promise<CursorPaginatedResponse<User>> {
    const limit = query.limit ?? 20;
    const conditions = [isNull(users.deletedAt)];

    if (query.role) {
      conditions.push(eq(users.role, query.role));
    }

    if (query.cursor) {
      const decoded = decodeCursor(query.cursor);
      conditions.push(lt(users.createdAt, new Date(decoded.createdAt)));
    }

    const records = await this.db
      .select()
      .from(users)
      .where(and(...conditions))
      .orderBy(desc(users.createdAt))
      .limit(limit + 1);

    const hasNextPage = records.length > limit;
    const items = hasNextPage ? records.slice(0, limit) : records;

    const startCursor = items[0]
      ? encodeCursor({ id: items[0].id, createdAt: items[0].createdAt.toISOString() })
      : null;

    const lastItem = items[items.length - 1];
    const endCursor = lastItem
      ? encodeCursor({ id: lastItem.id, createdAt: lastItem.createdAt.toISOString() })
      : null;

    return {
      items,
      pageInfo: {
        nextCursor: hasNextPage ? endCursor : null,
        hasMore: hasNextPage,
        hasNextPage,
        hasPreviousPage: query.cursor !== undefined,
        startCursor,
        endCursor,
        limit,
      },
    };
  }

  /**
   * Updates user fields by ID.
   *
   * @param id User ID
   * @param data Fields to update
   * @returns Updated user entity
   */
  async updateUser(id: string, data: Partial<User>): Promise<User> {
    const [updated] = await this.db
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(users.id, id), isNull(users.deletedAt)))
      .returning();
    if (!updated) throw new Error('User not found or deleted');
    return updated;
  }

  /**
   * Soft deletes a user by setting deletedAt timestamp.
   *
   * @param id User ID
   * @returns Resolves when deleted
   */
  async softDeleteUser(id: string): Promise<void> {
    await this.db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, id));
  }
}
