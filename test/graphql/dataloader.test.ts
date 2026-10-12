/**
 * @file Unit tests validating DataLoader batching and N+1 query elimination.
 * @module test/graphql/dataloader
 */

import { describe, expect, it, vi } from 'vitest';
import type { FileRecord, User } from '#src/db/schema.js';
import { createLoaders } from '#src/graphql/loaders.js';
import type { FilesRepository } from '#src/modules/files/repository.js';
import type { UsersRepository } from '#src/modules/users/repository.js';

describe('GraphQL DataLoader Relation Batching (N+1 Prevention)', () => {
  it('fetches nested user and file relations in constant query count', async () => {
    // 10 mock users
    const mockUsers: User[] = Array.from({ length: 10 }).map((_, i) => ({
      id: `usr_${i + 1}`,
      email: `user${i + 1}@example.com`,
      passwordHash: 'hash',
      role: 'user',
      emailVerified: true,
      avatarUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    }));

    // Mock files belonging to these users
    const mockFiles: FileRecord[] = mockUsers.flatMap((u, idx) => [
      {
        id: `fil_${idx * 2 + 1}`,
        ownerId: u.id,
        key: `uploads/file_${idx * 2 + 1}.png`,
        bucket: 'test-bucket',
        originalName: `file_${idx * 2 + 1}.png`,
        mimeType: 'image/png',
        size: 1024,
        checksum: 'abc',
        status: 'ready',
        visibility: 'private',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      },
      {
        id: `fil_${idx * 2 + 2}`,
        ownerId: u.id,
        key: `uploads/file_${idx * 2 + 2}.png`,
        bucket: 'test-bucket',
        originalName: `file_${idx * 2 + 2}.png`,
        mimeType: 'image/png',
        size: 2048,
        checksum: 'def',
        status: 'ready',
        visibility: 'private',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      },
    ]);

    // Track query executions
    const findByIdsMock = vi.fn(async (ids: string[]) => {
      const idSet = new Set(ids);
      return mockUsers.filter((u) => idSet.has(u.id));
    });

    const findByOwnerIdsMock = vi.fn(async (ownerIds: string[]) => {
      const ownerSet = new Set(ownerIds);
      return mockFiles.filter((f) => ownerSet.has(f.ownerId));
    });

    const usersRepo = {
      findByIds: findByIdsMock,
    } as unknown as UsersRepository;

    const filesRepo = {
      findByOwnerIds: findByOwnerIdsMock,
    } as unknown as FilesRepository;

    const loaders = createLoaders(usersRepo, filesRepo);

    // Concurrently load 10 users through DataLoader
    const loadedUsers = await Promise.all(mockUsers.map((u) => loaders.userLoader.load(u.id)));

    expect(loadedUsers).toHaveLength(10);
    // Exactly 1 batched query for all 10 users (O(1), not 10 queries)
    expect(findByIdsMock).toHaveBeenCalledTimes(1);
    expect(findByIdsMock.mock.calls[0]?.[0]).toHaveLength(10);

    // Concurrently load files for all 10 users through userFilesLoader
    const userFiles = await Promise.all(mockUsers.map((u) => loaders.userFilesLoader.load(u.id)));

    expect(userFiles).toHaveLength(10);
    // Exactly 1 batched query for files belonging to all 10 users (O(1), not 10 queries)
    expect(findByOwnerIdsMock).toHaveBeenCalledTimes(1);
    expect(findByOwnerIdsMock.mock.calls[0]?.[0]).toHaveLength(10);

    // Each user receives their respective 2 files
    for (const files of userFiles) {
      expect(files).toHaveLength(2);
    }
  });
});
