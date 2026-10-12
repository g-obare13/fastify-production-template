/**
 * @file Business domain service for user profiles, administrative role grants, and soft deletion.
 * @module modules/users/service
 */

import type { User } from '#src/db/schema.js';
import { ForbiddenError, NotFoundError } from '#src/lib/errors.js';
import type { CursorPaginatedResponse } from '#src/lib/pagination.js';
import type { UsersRepository } from './repository.js';
import type { ListUsersQuery, UpdateUserProfile, UpdateUserRole } from './schemas.js';

/** Service orchestrating user profile updates, authorization checks, and directory queries. */
export class UsersService {
  /**
   * Initializes users service with database repository.
   *
   * @param repo Users database repository instance.
   */
  constructor(private readonly repo: UsersRepository) {}

  /**
   * Retrieves a single user by unique identifier.
   *
   * @param id User identifier
   * @returns User entity
   * @throws NotFoundError When user does not exist
   */
  async getUserById(id: string): Promise<User> {
    const user = await this.repo.findById(id);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    return user;
  }

  /**
   * Retrieves a paginated list of users with optional filtering.
   *
   * @param query Pagination and filtering parameters
   * @returns Cursor paginated users response
   */
  async listUsers(query: ListUsersQuery): Promise<CursorPaginatedResponse<User>> {
    return this.repo.listUsers(query);
  }

  /**
   * Updates user profile fields subject to ownership or admin role authorization.
   *
   * @param userId Target user ID to update
   * @param currentUserId Authenticated user ID executing the request
   * @param currentUserRole Role of the executing user
   * @param data Profile update payload
   * @returns Updated user entity
   * @throws ForbiddenError When user attempts to update another profile without admin role
   * @throws NotFoundError When user does not exist
   */
  async updateProfile(
    userId: string,
    currentUserId: string,
    currentUserRole: 'user' | 'admin',
    data: UpdateUserProfile
  ): Promise<User> {
    if (userId !== currentUserId && currentUserRole !== 'admin') {
      throw new ForbiddenError('You can only update your own profile');
    }

    await this.getUserById(userId);
    return this.repo.updateUser(userId, {
      ...(data.avatarUrl !== undefined ? { avatarUrl: data.avatarUrl } : {}),
    });
  }

  /**
   * Updates a user's system role, preventing self-demotion/promotion.
   *
   * @param userId Target user ID
   * @param currentUserId Authenticated user ID executing the request
   * @param data New role assignment
   * @returns Updated user entity
   * @throws ForbiddenError When administrator attempts to change their own role
   * @throws NotFoundError When user does not exist
   */
  async updateRole(userId: string, currentUserId: string, data: UpdateUserRole): Promise<User> {
    if (userId === currentUserId) {
      throw new ForbiddenError('Administrators cannot change their own role');
    }

    await this.getUserById(userId);
    return this.repo.updateUser(userId, { role: data.role });
  }

  /**
   * Soft deletes a user account, preventing self-deletion.
   *
   * @param userId Target user ID to delete
   * @param currentUserId Authenticated user ID executing the request
   * @returns Resolves when user is soft deleted
   * @throws ForbiddenError When administrator attempts to delete their own account
   * @throws NotFoundError When user does not exist
   */
  async deleteUser(userId: string, currentUserId: string): Promise<void> {
    if (userId === currentUserId) {
      throw new ForbiddenError('Administrators cannot delete their own account');
    }

    await this.getUserById(userId);
    await this.repo.softDeleteUser(userId);
  }
}
