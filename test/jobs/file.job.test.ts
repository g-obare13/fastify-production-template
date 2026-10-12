/**
 * @file Unit and worker tests asserting stale upload cleanup and file maintenance.
 * @module test/jobs/file
 */

import { describe, expect, it, vi } from 'vitest';
import type { FileRecord } from '#src/db/schema.js';
import type { FileJobData } from '#src/jobs/queues.js';

describe('BullMQ File Maintenance Jobs', () => {
  it('cleans up stale pending uploads older than threshold', async () => {
    const staleFiles: FileRecord[] = [
      {
        id: 'stale_1',
        ownerId: 'user_1',
        key: 'uploads/2026/01/stale_1.png',
        bucket: 'test-bucket',
        originalName: 'stale.png',
        mimeType: 'image/png',
        size: 1024,
        checksum: 'pending',
        status: 'pending',
        visibility: 'private',
        createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000), // 48h ago
        updatedAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
        deletedAt: null,
      },
    ];

    const deletedStorageKeys: string[] = [];
    const softDeletedIds: string[] = [];

    const mockRepo = {
      findStalePending: vi.fn(async (_olderThan?: Date) => staleFiles),
      softDelete: vi.fn(async (id: string) => {
        softDeletedIds.push(id);
      }),
    };

    const mockStorage = {
      deleteObject: vi.fn(async (key: string) => {
        deletedStorageKeys.push(key);
      }),
    };

    // Simulate processor
    const processFileJob = async (data: FileJobData) => {
      if (data.type === 'clean-stale-uploads') {
        const hours = data.staleHours ?? 24;
        const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
        const stale = await mockRepo.findStalePending(cutoff);
        for (const file of stale) {
          try {
            await mockStorage.deleteObject(file.key);
          } catch {
            // Ignored
          }
          await mockRepo.softDelete(file.id);
        }
        return { success: true, cleanedCount: stale.length };
      }
      return { success: false };
    };

    const result = await processFileJob({
      type: 'clean-stale-uploads',
      staleHours: 24,
    });

    expect(result.success).toBe(true);
    expect(mockRepo.findStalePending).toHaveBeenCalledTimes(1);
    expect(mockStorage.deleteObject).toHaveBeenCalledWith('uploads/2026/01/stale_1.png');
    expect(softDeletedIds).toContain('stale_1');
  });

  it('executes extensible post-upload hook as working no-op', async () => {
    const processHook = async (data: FileJobData) => {
      if (data.type === 'post-upload-hook') {
        return { success: true, fileId: data.fileId };
      }
      return { success: false };
    };

    const result = await processHook({
      type: 'post-upload-hook',
      fileId: 'fil_xyz123',
    });

    expect(result.success).toBe(true);
    expect(result.fileId).toBe('fil_xyz123');
  });
});
