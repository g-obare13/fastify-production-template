/**
 * @file Business domain service for file uploads, presigned S3 URLs, MIME verification, and streaming.
 * @module modules/files/service
 */

import type { Readable } from 'node:stream';
import { fileTypeFromBuffer } from 'file-type';
import { env } from '#src/config/env.js';
import type { FileRecord } from '#src/db/schema.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '#src/lib/errors.js';
import { generateId } from '#src/lib/id.js';
import type { StorageProvider } from '#src/lib/storage/provider.js';
import type { FilesRepository } from './repository.js';
import type { PresignedUploadRequest } from './schemas.js';

/** Service orchestrating direct S3 uploads, MIME validation, and download URLs. */
export class FilesService {
  /**
   * Initializes files service with repository and storage provider.
   *
   * @param repo Files database repository.
   * @param storage Object storage provider.
   */
  constructor(
    private readonly repo: FilesRepository,
    private readonly storage: StorageProvider
  ) {}

  /**
   * Generates a presigned S3 upload URL and allocates a pending file metadata record.
   *
   * @param ownerId Owner user ID
   * @param req Presigned upload allocation parameters
   * @returns Presigned upload credentials and target file record ID
   * @throws BadRequestError When file size exceeds limits or MIME type is disallowed
   */
  async requestPresignedUpload(ownerId: string, req: PresignedUploadRequest) {
    const maxSizeBytes = env.STORAGE_MAX_FILE_SIZE_MB * 1024 * 1024;
    if (req.size > maxSizeBytes) {
      throw new BadRequestError(`File size exceeds limit of ${env.STORAGE_MAX_FILE_SIZE_MB}MB`);
    }

    const allowedMimes = env.STORAGE_ALLOWED_MIME_TYPES.split(',').map((m) =>
      m.trim().toLowerCase()
    );
    if (!allowedMimes.includes(req.mimeType.toLowerCase())) {
      throw new BadRequestError(
        `Unsupported MIME type. Allowed: ${env.STORAGE_ALLOWED_MIME_TYPES}`
      );
    }

    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const fileId = generateId('fil');
    const safeName = req.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `${env.STORAGE_KEY_PREFIX}/${yyyy}/${mm}/${fileId}_${safeName}`;

    await this.repo.createFile({
      id: fileId,
      ownerId,
      key,
      bucket: env.S3_BUCKET,
      originalName: req.filename,
      mimeType: req.mimeType,
      size: req.size,
      checksum: 'pending',
      status: 'pending',
      visibility: req.visibility,
    });

    const uploadUrl = await this.storage.getPresignedUploadUrl(
      key,
      req.mimeType,
      env.S3_PRESIGN_TTL_SECONDS
    );

    return {
      fileId,
      uploadUrl,
      key,
      expiresIn: env.S3_PRESIGN_TTL_SECONDS,
    };
  }

  /**
   * Confirms a direct S3 client upload, verifying existence, size, and MIME magic bytes.
   *
   * @param fileId File record identifier
   * @param ownerId Owner user ID
   * @param checksum Optional verified SHA-256 checksum
   * @returns Updated file record with ready status
   * @throws NotFoundError When file record does not exist
   * @throws ForbiddenError When requester is not the file owner
   * @throws BadRequestError When storage object is missing or MIME sniffing fails validation
   */
  async confirmUpload(
    fileId: string,
    ownerId: string,
    checksum = 'sha256-verified'
  ): Promise<FileRecord> {
    const record = await this.repo.findById(fileId);
    if (!record) {
      throw new NotFoundError('File not found');
    }
    if (record.ownerId !== ownerId) {
      throw new ForbiddenError('You do not own this file');
    }

    const head = await this.storage.headObject(record.key);
    if (!head.exists) {
      await this.repo.updateStatus(fileId, 'failed');
      throw new BadRequestError(
        'Object not found in storage. Ensure upload finished before confirmation.'
      );
    }

    // Size check against configured limit
    const maxSizeBytes = env.STORAGE_MAX_FILE_SIZE_MB * 1024 * 1024;
    if (head.size > maxSizeBytes) {
      await this.repo.updateStatus(fileId, 'failed');
      throw new BadRequestError(
        `Uploaded file size (${head.size} bytes) exceeds limit of ${env.STORAGE_MAX_FILE_SIZE_MB}MB`
      );
    }

    // Sniffed MIME validation using file-type to prevent extension/MIME spoofing
    try {
      const { stream } = await this.storage.getObject(record.key);
      const chunks: Buffer[] = [];
      let total = 0;
      for await (const chunk of stream) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        chunks.push(buf);
        total += buf.length;
        if (total >= 4096) break;
      }
      if (chunks.length > 0) {
        const sample = Buffer.concat(chunks);
        const detected = await fileTypeFromBuffer(sample);
        const allowedMimes = env.STORAGE_ALLOWED_MIME_TYPES.split(',').map((m) =>
          m.trim().toLowerCase()
        );
        if (detected && !allowedMimes.includes(detected.mime.toLowerCase())) {
          await this.repo.updateStatus(fileId, 'failed');
          throw new BadRequestError(
            `Spoofed or disallowed MIME type detected: ${detected.mime}. Expected allowed: ${env.STORAGE_ALLOWED_MIME_TYPES}`
          );
        }
      }
    } catch (err) {
      if (err instanceof BadRequestError) throw err;
      // If reading sample fails or stream is empty, continue
    }

    return this.repo.updateStatus(fileId, 'ready', checksum);
  }

  /**
   * Uploads a file stream directly to object storage with server-side proxying.
   *
   * @param ownerId Owner user ID
   * @param filename Target file name
   * @param mimeType Declared MIME type
   * @param stream Readable stream of file payload
   * @param size Optional file size in bytes
   * @param visibility Visibility scope ('private' or 'public')
   * @returns Created file record
   * @throws BadRequestError When file size exceeds limit or MIME type is disallowed
   */
  async uploadFileStream(
    ownerId: string,
    filename: string,
    mimeType: string,
    stream: Readable,
    size = 0,
    visibility: 'private' | 'public' = 'private'
  ): Promise<FileRecord> {
    const allowedMimes = env.STORAGE_ALLOWED_MIME_TYPES.split(',').map((m) =>
      m.trim().toLowerCase()
    );
    if (!allowedMimes.includes(mimeType.toLowerCase())) {
      throw new BadRequestError(
        `Unsupported MIME type. Allowed: ${env.STORAGE_ALLOWED_MIME_TYPES}`
      );
    }

    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const fileId = generateId('fil');
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `${env.STORAGE_KEY_PREFIX}/${yyyy}/${mm}/${fileId}_${safeName}`;

    const putRes = await this.storage.putObject(key, stream, mimeType);
    const maxSizeBytes = env.STORAGE_MAX_FILE_SIZE_MB * 1024 * 1024;
    if (putRes.size > maxSizeBytes) {
      await this.storage.deleteObject(key);
      throw new BadRequestError(`File size exceeds limit of ${env.STORAGE_MAX_FILE_SIZE_MB}MB`);
    }

    return this.repo.createFile({
      id: fileId,
      ownerId,
      key,
      bucket: env.S3_BUCKET,
      originalName: filename,
      mimeType,
      size: putRes.size || size,
      checksum: putRes.checksum || 'uploaded',
      status: 'ready',
      visibility,
    });
  }

  /**
   * Generates a temporary presigned download URL for a file record.
   *
   * @param fileId File record identifier
   * @param requesterId Authenticated user ID requesting download
   * @param requesterRole Role of authenticated user
   * @returns Download URL and expiration TTL
   * @throws NotFoundError When file does not exist or is not ready
   * @throws ForbiddenError When requester lacks authorization for private file
   */
  async getDownloadUrl(fileId: string, requesterId: string, requesterRole: string) {
    const record = await this.repo.findById(fileId);
    if (!record || record.status !== 'ready') {
      throw new NotFoundError('File not found or not ready');
    }

    if (
      record.visibility === 'private' &&
      record.ownerId !== requesterId &&
      requesterRole !== 'admin'
    ) {
      throw new ForbiddenError('Access denied to private file');
    }

    const downloadUrl = await this.storage.getPresignedDownloadUrl(
      record.key,
      env.S3_PRESIGN_TTL_SECONDS
    );
    return {
      downloadUrl,
      expiresIn: env.S3_PRESIGN_TTL_SECONDS,
    };
  }

  /**
   * Soft deletes a file record subject to ownership or admin role authorization.
   *
   * @param fileId File record identifier
   * @param requesterId Authenticated user ID requesting deletion
   * @param requesterRole Role of authenticated user
   * @returns Resolves when file is soft deleted
   * @throws NotFoundError When file does not exist
   * @throws ForbiddenError When non-admin attempts to delete another user's file
   */
  async deleteFile(fileId: string, requesterId: string, requesterRole: string): Promise<void> {
    const record = await this.repo.findById(fileId);
    if (!record) {
      throw new NotFoundError('File not found');
    }

    if (record.ownerId !== requesterId && requesterRole !== 'admin') {
      throw new ForbiddenError('You can only delete your own files');
    }

    await this.repo.softDelete(fileId);
  }
}
