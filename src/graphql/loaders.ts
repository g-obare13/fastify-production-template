/**
 * @file Batched DataLoader factories preventing N+1 queries in GraphQL relationships.
 * @module graphql/loaders
 */

import DataLoader from 'dataloader';
import type { FileRecord, User } from '#src/db/schema.js';
import type { FilesRepository } from '#src/modules/files/repository.js';
import type { UsersRepository } from '#src/modules/users/repository.js';

/** Set of memoized DataLoaders bound per request context. */
export interface Loaders {
  userLoader: DataLoader<string, User | null>;
  userFilesLoader: DataLoader<string, FileRecord[]>;
  fileLoader: DataLoader<string, FileRecord | null>;
}

/**
 * Creates scoped DataLoader instances to batch database queries for users and files.
 *
 * @param usersRepo Repository for resolving user entities.
 * @param filesRepo Optional repository for resolving file entities.
 * @returns Instantiated DataLoaders.
 */
export function createLoaders(usersRepo: UsersRepository, filesRepo?: FilesRepository): Loaders {
  // Batch fetch users to prevent N+1 queries: exactly 1 database query for any number of IDs
  const userLoader = new DataLoader<string, User | null>(async (ids) => {
    const uniqueIds = Array.from(new Set(ids));
    const records = await usersRepo.findByIds(uniqueIds);
    const map = new Map<string, User>(records.map((u) => [u.id, u]));
    return ids.map((id) => map.get(id) ?? null);
  });

  // Batch fetch files by ownerId: exactly 1 database query for any number of owners
  const userFilesLoader = new DataLoader<string, FileRecord[]>(async (ownerIds) => {
    if (!filesRepo) return ownerIds.map(() => []);
    const uniqueOwnerIds = Array.from(new Set(ownerIds));
    const records = await filesRepo.findByOwnerIds(uniqueOwnerIds);
    const groups = new Map<string, FileRecord[]>();
    for (const record of records) {
      const list = groups.get(record.ownerId) ?? [];
      list.push(record);
      groups.set(record.ownerId, list);
    }
    return ownerIds.map((id) => groups.get(id) ?? []);
  });

  // Batch fetch files by ID: exactly 1 database query
  const fileLoader = new DataLoader<string, FileRecord | null>(async (ids) => {
    if (!filesRepo) return ids.map(() => null);
    const uniqueIds = Array.from(new Set(ids));
    const records = await filesRepo.findByIds(uniqueIds);
    const map = new Map<string, FileRecord>(records.map((f) => [f.id, f]));
    return ids.map((id) => map.get(id) ?? null);
  });

  return {
    userLoader,
    userFilesLoader,
    fileLoader,
  };
}
