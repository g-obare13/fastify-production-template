/**
 * @file Integration tests asserting presigned uploads, MIME validation, and download URLs.
 * @module test/modules/files
 */

import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it } from 'vitest';
import type { FileRecord, NewFileRecord } from '#src/db/schema.js';
import { BadRequestError, ForbiddenError } from '#src/lib/errors.js';
import type { StorageObjectMetadata, StorageProvider } from '#src/lib/storage/provider.js';
import type { FilesRepository } from '#src/modules/files/repository.js';
import { FilesService } from '#src/modules/files/service.js';

class InMemoryFilesRepository implements FilesRepository {
  public files: Map<string, FileRecord> = new Map();

  async createFile(record: NewFileRecord): Promise<FileRecord> {
    const file: FileRecord = {
      ...record,
      status: record.status ?? 'pending',
      visibility: record.visibility ?? 'private',
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.files.set(record.id, file);
    return file;
  }

  async findById(id: string): Promise<FileRecord | null> {
    return this.files.get(id) ?? null;
  }

  async findByIds(ids: string[]): Promise<FileRecord[]> {
    return ids.map((id) => this.files.get(id)).filter((f): f is FileRecord => !!f && !f.deletedAt);
  }

  async findByOwnerIds(ownerIds: string[]): Promise<FileRecord[]> {
    return Array.from(this.files.values()).filter(
      (f) => ownerIds.includes(f.ownerId) && !f.deletedAt
    );
  }

  async listByOwner(ownerId: string, limit = 50): Promise<FileRecord[]> {
    return Array.from(this.files.values())
      .filter((f) => f.ownerId === ownerId && !f.deletedAt)
      .slice(0, limit);
  }

  async findByKey(key: string): Promise<FileRecord | null> {
    for (const f of this.files.values()) {
      if (f.key === key) return f;
    }
    return null;
  }

  async updateStatus(id: string, status: string, checksum?: string): Promise<FileRecord> {
    const file = this.files.get(id);
    if (!file) throw new Error('File not found');
    file.status = status;
    if (checksum) file.checksum = checksum;
    file.updatedAt = new Date();
    return file;
  }

  async softDelete(id: string): Promise<void> {
    const file = this.files.get(id);
    if (file) {
      file.deletedAt = new Date();
      file.status = 'deleted';
    }
  }

  async findStalePending(olderThan: Date): Promise<FileRecord[]> {
    return Array.from(this.files.values()).filter(
      (f) => f.status === 'pending' && f.createdAt < olderThan
    );
  }
}

class MockStorageProvider implements StorageProvider {
  readonly driver = 'local' as const;
  public objects: Map<string, { size: number; contentType: string; data?: Buffer }> = new Map();

  async putObject(key: string, body: Readable | Buffer, contentType: string) {
    const buf = Buffer.isBuffer(body) ? body : Buffer.from('mock content');
    this.objects.set(key, { size: buf.length, contentType, data: buf });
    return { size: buf.length };
  }

  async getObject(key: string) {
    const obj = this.objects.get(key);
    const data = obj?.data ?? Buffer.from('mock content');
    return { stream: Readable.from([data]) as Readable, contentLength: data.length };
  }

  async deleteObject(key: string) {
    this.objects.delete(key);
  }

  async headObject(key: string): Promise<StorageObjectMetadata> {
    const obj = this.objects.get(key);
    if (!obj) return { size: 0, exists: false };
    const res: StorageObjectMetadata = { size: obj.size, exists: true };
    if (obj.contentType !== undefined) res.contentType = obj.contentType;
    return res;
  }

  async getPresignedUploadUrl(key: string): Promise<string> {
    return `https://storage.example.com/upload/${key}`;
  }

  async getPresignedDownloadUrl(key: string): Promise<string> {
    return `https://storage.example.com/download/${key}`;
  }

  async createMultipartUpload() {
    return 'mp-123';
  }
  async signPart() {
    return 'https://storage.example.com/part';
  }
  async completeMultipartUpload() {}
  async abortMultipartUpload() {}
  async healthCheck() {
    return { healthy: true, driver: 'local' };
  }
}

describe('FilesService & Direct-to-Storage Flow', () => {
  let repo: InMemoryFilesRepository;
  let storage: MockStorageProvider;
  let service: FilesService;

  beforeEach(() => {
    repo = new InMemoryFilesRepository();
    storage = new MockStorageProvider();
    service = new FilesService(repo, storage);
  });

  it('generates presigned upload URL and pending file record', async () => {
    const res = await service.requestPresignedUpload('user_123', {
      filename: 'document.pdf',
      mimeType: 'application/pdf',
      size: 1024 * 50,
      visibility: 'private',
    });

    expect(res.fileId).toBeDefined();
    expect(res.uploadUrl).toContain('document.pdf');

    const file = await repo.findById(res.fileId);
    expect(file).not.toBeNull();
    expect(file?.status).toBe('pending');
  });

  it('rejects upload exceeding max size threshold', async () => {
    const hugeSize = 100 * 1024 * 1024; // 100MB exceeds default 25MB
    await expect(
      service.requestPresignedUpload('user_123', {
        filename: 'huge.iso',
        mimeType: 'application/pdf',
        size: hugeSize,
        visibility: 'private',
      })
    ).rejects.toThrow(BadRequestError);
  });

  it('rejects disallowed MIME type on presign request', async () => {
    await expect(
      service.requestPresignedUpload('user_123', {
        filename: 'malware.exe',
        mimeType: 'application/x-msdownload',
        size: 5000,
        visibility: 'private',
      })
    ).rejects.toThrow(BadRequestError);
  });

  it('confirms uploaded object and updates status to ready', async () => {
    const presign = await service.requestPresignedUpload('user_123', {
      filename: 'photo.png',
      mimeType: 'image/png',
      size: 2048,
      visibility: 'private',
    });

    // Valid PNG signature bytes
    const pngBytes = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    ]);
    storage.objects.set(presign.key, {
      size: pngBytes.length,
      contentType: 'image/png',
      data: pngBytes,
    });

    const confirmed = await service.confirmUpload(presign.fileId, 'user_123');
    expect(confirmed.status).toBe('ready');
  });

  it('rejects confirmUpload when MIME spoofing is detected', async () => {
    const presign = await service.requestPresignedUpload('user_123', {
      filename: 'innocent.png',
      mimeType: 'image/png',
      size: 1024,
      visibility: 'private',
    });

    // Spoofed executable DOS/PE header (MZ) disguised as image/png
    const exeBytes = Buffer.from('MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff\x00\x00');
    storage.objects.set(presign.key, {
      size: exeBytes.length,
      contentType: 'image/png',
      data: exeBytes,
    });

    await expect(service.confirmUpload(presign.fileId, 'user_123')).rejects.toThrow(
      BadRequestError
    );

    const record = await repo.findById(presign.fileId);
    expect(record?.status).toBe('failed');
  });

  it('prevents non-owner from accessing private file download URL', async () => {
    const presign = await service.requestPresignedUpload('user_owner', {
      filename: 'private.pdf',
      mimeType: 'application/pdf',
      size: 2048,
      visibility: 'private',
    });
    storage.objects.set(presign.key, { size: 2048, contentType: 'application/pdf' });
    await service.confirmUpload(presign.fileId, 'user_owner');

    // Access by different user fails
    await expect(service.getDownloadUrl(presign.fileId, 'other_user', 'user')).rejects.toThrow(
      ForbiddenError
    );

    // Access by admin succeeds
    const adminAccess = await service.getDownloadUrl(presign.fileId, 'admin_user', 'admin');
    expect(adminAccess.downloadUrl).toBeDefined();
  });

  it('supports streaming multipart upload fallback and soft delete', async () => {
    const stream = Readable.from([Buffer.from('hello streaming multipart')]);
    const file = await service.uploadFileStream(
      'user_streamer',
      'notes.txt',
      'image/png', // allowlisted type
      stream,
      24
    );

    expect(file.id).toBeDefined();
    expect(file.status).toBe('ready');

    // Soft delete
    await service.deleteFile(file.id, 'user_streamer', 'user');
    const deleted = await repo.findById(file.id);
    expect(deleted?.status).toBe('deleted');
    expect(deleted?.deletedAt).toBeDefined();
  });
});
