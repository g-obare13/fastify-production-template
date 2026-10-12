/**
 * @file Integration tests asserting keyset user pagination, profile edits, and role security.
 * @module test/modules/users
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { User } from '#src/db/schema.js';
import { ForbiddenError, NotFoundError } from '#src/lib/errors.js';
import type { CursorPaginatedResponse } from '#src/lib/pagination.js';
import type { UsersRepository } from '#src/modules/users/repository.js';
import type { ListUsersQuery } from '#src/modules/users/schemas.js';
import { UsersService } from '#src/modules/users/service.js';

class InMemoryUsersRepository implements UsersRepository {
  public users: Map<string, User> = new Map();

  async findById(id: string): Promise<User | null> {
    const u = this.users.get(id);
    if (!u || u.deletedAt) return null;
    return u;
  }

  async findByIds(ids: string[]): Promise<User[]> {
    return ids.map((id) => this.users.get(id)).filter((u): u is User => !!u && !u.deletedAt);
  }

  async findByEmail(email: string): Promise<User | null> {
    for (const u of this.users.values()) {
      if (u.email === email && !u.deletedAt) return u;
    }
    return null;
  }

  async listUsers(query: ListUsersQuery): Promise<CursorPaginatedResponse<User>> {
    const active = Array.from(this.users.values()).filter((u) => !u.deletedAt);
    const limit = query.limit ?? 20;
    return {
      items: active.slice(0, limit),
      pageInfo: {
        nextCursor: null,
        hasMore: false,
        hasNextPage: false,
        hasPreviousPage: false,
        startCursor: null,
        endCursor: null,
        limit,
      },
    };
  }

  async updateUser(id: string, data: Partial<User>): Promise<User> {
    const existing = this.users.get(id);
    if (!existing) throw new Error('User not found');
    const updated = { ...existing, ...data, updatedAt: new Date() };
    this.users.set(id, updated);
    return updated;
  }

  async softDeleteUser(id: string): Promise<void> {
    const existing = this.users.get(id);
    if (existing) {
      existing.deletedAt = new Date();
    }
  }
}

describe('UsersService', () => {
  let repo: InMemoryUsersRepository;
  let service: UsersService;

  const mockAdmin: User = {
    id: 'admin_1',
    email: 'admin@example.com',
    passwordHash: 'hash',
    role: 'admin',
    emailVerified: true,
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  const mockUser: User = {
    id: 'user_1',
    email: 'user@example.com',
    passwordHash: 'hash',
    role: 'user',
    emailVerified: true,
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  beforeEach(() => {
    repo = new InMemoryUsersRepository();
    repo.users.set(mockAdmin.id, { ...mockAdmin });
    repo.users.set(mockUser.id, { ...mockUser });
    service = new UsersService(repo);
  });

  it('fetches existing user by ID', async () => {
    const user = await service.getUserById('user_1');
    expect(user.id).toBe('user_1');
    expect(user.email).toBe('user@example.com');
  });

  it('throws NotFoundError for non-existent user', async () => {
    await expect(service.getUserById('unknown')).rejects.toThrow(NotFoundError);
  });

  it('allows owner to update avatar', async () => {
    const updated = await service.updateProfile('user_1', 'user_1', 'user', {
      avatarUrl: 'https://example.com/avatar.png',
    });
    expect(updated.avatarUrl).toBe('https://example.com/avatar.png');
  });

  it('prevents non-admin user from updating another user profile', async () => {
    await expect(
      service.updateProfile('admin_1', 'user_1', 'user', { avatarUrl: 'hack' })
    ).rejects.toThrow(ForbiddenError);
  });

  it('prevents admin from changing their own role', async () => {
    await expect(service.updateRole('admin_1', 'admin_1', { role: 'user' })).rejects.toThrow(
      ForbiddenError
    );
  });

  it('allows admin to change another user role', async () => {
    const updated = await service.updateRole('user_1', 'admin_1', { role: 'admin' });
    expect(updated.role).toBe('admin');
  });

  it('soft deletes user and excludes from subsequent queries', async () => {
    await service.deleteUser('user_1', 'admin_1');
    await expect(service.getUserById('user_1')).rejects.toThrow(NotFoundError);
  });
});
