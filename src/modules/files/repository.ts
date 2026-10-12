/**
 * @file Database repository persisting and querying file metadata in PostgreSQL.
 * @module modules/files/repository
 */

import { and, desc, eq, inArray, isNull, lt } from 'drizzle-orm';
import type { Database } from '#src/db/client.js';
import { type FileRecord, type NewFileRecord, files } from '#src/db/schema.js';

/** Repository contract for file records and pending upload cleanups. */
export interface FilesRepository {
  /**
   * Inserts a new file metadata record.
   *
   * @param record New file record payload
   * @returns Created file record entity
   */
  createFile(record: NewFileRecord): Promise<FileRecord>;

  /**
   * Retrieves an active file record by ID.
   *
   * @param id File record identifier
   * @returns File record entity or null if not found
   */
  findById(id: string): Promise<FileRecord | null>;

  /**
   * Batch retrieves active file records by IDs.
   *
   * @param ids Array of file IDs
   * @returns Array of found file records
   */
  findByIds(ids: string[]): Promise<FileRecord[]>;

  /**
   * Batch retrieves active file records across multiple owner IDs.
   *
   * @param ownerIds Array of user owner IDs
   * @returns Array of found file records
   */
  findByOwnerIds(ownerIds: string[]): Promise<FileRecord[]>;

  /**
   * Lists active file records for a specific owner ordered by creation date descending.
   *
   * @param ownerId Owner user ID
   * @param limit Maximum number of records to return
   * @returns Array of file records
   */
  listByOwner(ownerId: string, limit?: number): Promise<FileRecord[]>;

  /**
   * Finds an active file record by storage object key.
   *
   * @param key Storage object key
   * @returns File record entity or null if not found
   */
  findByKey(key: string): Promise<FileRecord | null>;

  /**
   * Updates file upload status and optional verified checksum.
   *
   * @param id File record identifier
   * @param status New file status
   * @param checksum Optional computed checksum string
   * @returns Updated file record entity
   */
  updateStatus(id: string, status: string, checksum?: string): Promise<FileRecord>;

  /**
   * Soft deletes a file record by setting deletedAt timestamp.
   *
   * @param id File record identifier
   * @returns Resolves when marked deleted
   */
  softDelete(id: string): Promise<void>;

  /**
   * Finds pending file records older than specified cutoff timestamp for garbage collection.
   *
   * @param olderThan Cutoff date threshold
   * @returns Array of stale pending file records
   */
  findStalePending(olderThan: Date): Promise<FileRecord[]>;
}

/** Drizzle ORM implementation of the files repository. */
export class DrizzleFilesRepository implements FilesRepository {
  /**
   * Initializes files repository with database client.
   *
   * @param db Drizzle database client instance.
   */
  constructor(private readonly db: Database) {}

  /**
   * Inserts a new file metadata record.
   *
   * @param record New file record payload
   * @returns Created file record entity
   */
  async createFile(record: NewFileRecord): Promise<FileRecord> {
    const [created] = await this.db.insert(files).values(record).returning();
    if (!created) throw new Error('Failed to create file record');
    return created;
  }

  /**
   * Retrieves an active file record by ID.
   *
   * @param id File record identifier
   * @returns File record entity or null if not found
   */
  async findById(id: string): Promise<FileRecord | null> {
    const [record] = await this.db
      .select()
      .from(files)
      .where(and(eq(files.id, id), isNull(files.deletedAt)))
      .limit(1);
    return record ?? null;
  }

  /**
   * Batch retrieves active file records by IDs.
   *
   * @param ids Array of file IDs
   * @returns Array of found file records
   */
  async findByIds(ids: string[]): Promise<FileRecord[]> {
    if (ids.length === 0) return [];
    return this.db
      .select()
      .from(files)
      .where(and(inArray(files.id, ids), isNull(files.deletedAt)));
  }

  /**
   * Batch retrieves active file records across multiple owner IDs.
   *
   * @param ownerIds Array of user owner IDs
   * @returns Array of found file records
   */
  async findByOwnerIds(ownerIds: string[]): Promise<FileRecord[]> {
    if (ownerIds.length === 0) return [];
    return this.db
      .select()
      .from(files)
      .where(and(inArray(files.ownerId, ownerIds), isNull(files.deletedAt)));
  }

  /**
   * Lists active file records for a specific owner ordered by creation date descending.
   *
   * @param ownerId Owner user ID
   * @param limit Maximum number of records to return
   * @returns Array of file records
   */
  async listByOwner(ownerId: string, limit = 50): Promise<FileRecord[]> {
    return this.db
      .select()
      .from(files)
      .where(and(eq(files.ownerId, ownerId), isNull(files.deletedAt)))
      .orderBy(desc(files.createdAt))
      .limit(limit);
  }

  /**
   * Finds an active file record by storage object key.
   *
   * @param key Storage object key
   * @returns File record entity or null if not found
   */
  async findByKey(key: string): Promise<FileRecord | null> {
    const [record] = await this.db
      .select()
      .from(files)
      .where(and(eq(files.key, key), isNull(files.deletedAt)))
      .limit(1);
    return record ?? null;
  }

  /**
   * Updates file upload status and optional verified checksum.
   *
   * @param id File record identifier
   * @param status New file status
   * @param checksum Optional computed checksum string
   * @returns Updated file record entity
   */
  async updateStatus(id: string, status: string, checksum?: string): Promise<FileRecord> {
    const [updated] = await this.db
      .update(files)
      .set({
        status,
        ...(checksum ? { checksum } : {}),
        updatedAt: new Date(),
      })
      .where(eq(files.id, id))
      .returning();
    if (!updated) throw new Error('File not found to update status');
    return updated;
  }

  /**
   * Soft deletes a file record by setting deletedAt timestamp.
   *
   * @param id File record identifier
   * @returns Resolves when marked deleted
   */
  async softDelete(id: string): Promise<void> {
    await this.db
      .update(files)
      .set({ status: 'deleted', deletedAt: new Date() })
      .where(eq(files.id, id));
  }

  /**
   * Finds pending file records older than specified cutoff timestamp for garbage collection.
   *
   * @param olderThan Cutoff date threshold
   * @returns Array of stale pending file records
   */
  async findStalePending(olderThan: Date): Promise<FileRecord[]> {
    return this.db
      .select()
      .from(files)
      .where(and(eq(files.status, 'pending'), lt(files.createdAt, olderThan)));
  }
}
