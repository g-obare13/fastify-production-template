/**
 * @file Local filesystem storage provider implementation for development and testing.
 * @module src/lib/storage/local-disk
 */

import fs from 'node:fs';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { env } from '#src/config/env.js';
import { NotFoundError } from '#src/lib/errors.js';
import type { StorageObjectMetadata, StorageProvider } from './provider.js';

/**
 * Local disk storage provider persisting files to a directory on the host filesystem.
 */
export class LocalDiskStorageProvider implements StorageProvider {
  /** Identifier of the active storage driver */
  readonly driver = 'local' as const;
  private readonly baseDir: string;

  /**
   * Initializes local storage rooted in the configured base directory.
   *
   * @param baseDir Optional override directory path
   */
  constructor(baseDir?: string) {
    this.baseDir = path.resolve(baseDir ?? env.STORAGE_LOCAL_DIR);
    if (!fs.existsSync(this.baseDir)) {
      try {
        fs.mkdirSync(this.baseDir, { recursive: true });
      } catch {
        // Ignored if unprivileged in prod
      }
    }
  }

  /**
   * Validates that local disk operations are allowed in the current environment.
   *
   * @throws Error If running in production without explicit local storage override
   */
  private checkProductionAllowed(): void {
    if (env.NODE_ENV === 'production' && !env.STORAGE_ALLOW_LOCAL_IN_PROD) {
      throw new Error(
        'Storage operation rejected: local disk storage is prohibited in production without STORAGE_ALLOW_LOCAL_IN_PROD=true. Configure S3 storage credentials.'
      );
    }
  }

  /**
   * Resolves a storage key to an absolute filesystem path safely preventing directory traversal.
   *
   * @param key Relative storage key
   * @returns Absolute verified filesystem path
   * @throws Error If path traversal outside base directory is detected
   */
  private resolvePath(key: string): string {
    const safeKey = key.replace(/\.\./g, '').replace(/^[\/\\]+/, '');
    const target = path.resolve(this.baseDir, safeKey);
    if (!target.startsWith(this.baseDir)) {
      throw new Error('Path traversal attack detected');
    }
    return target;
  }

  /**
   * Saves a buffer or readable stream to local disk storage.
   *
   * @param key Relative destination storage key
   * @param body Payload buffer or readable stream
   * @param _contentType MIME content type
   * @returns Object size in bytes
   */
  async putObject(
    key: string,
    body: Readable | Buffer,
    _contentType: string
  ): Promise<{ size: number }> {
    this.checkProductionAllowed();
    const filePath = this.resolvePath(key);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    if (Buffer.isBuffer(body)) {
      fs.writeFileSync(filePath, body);
      return { size: body.length };
    }

    const writeStream = fs.createWriteStream(filePath);
    await new Promise<void>((resolve, reject) => {
      body.pipe(writeStream);
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    const stat = fs.statSync(filePath);
    return { size: stat.size };
  }

  /**
   * Reads an object from local disk storage as a readable stream.
   *
   * @param key Relative storage key
   * @returns Readable stream and length in bytes
   * @throws NotFoundError When file does not exist on disk
   */
  async getObject(key: string): Promise<{ stream: Readable; contentLength: number }> {
    this.checkProductionAllowed();
    const filePath = this.resolvePath(key);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundError('Storage object not found');
    }
    const stat = fs.statSync(filePath);
    return {
      stream: fs.createReadStream(filePath),
      contentLength: stat.size,
    };
  }

  /**
   * Unlinks an object from local disk storage if it exists.
   *
   * @param key Relative storage key
   */
  async deleteObject(key: string): Promise<void> {
    const filePath = this.resolvePath(key);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  /**
   * Retrieves file existence and byte size without reading payload.
   *
   * @param key Relative storage key
   * @returns File size and existence flag
   */
  async headObject(key: string): Promise<StorageObjectMetadata> {
    const filePath = this.resolvePath(key);
    if (!fs.existsSync(filePath)) {
      return { size: 0, exists: false };
    }
    const stat = fs.statSync(filePath);
    return {
      size: stat.size,
      exists: true,
    };
  }

  /**
   * Generates a local mock presigned upload URL.
   *
   * @param key Destination key
   * @param _contentType MIME content type
   * @returns Local HTTP upload endpoint URL
   */
  async getPresignedUploadUrl(key: string, _contentType: string): Promise<string> {
    this.checkProductionAllowed();
    return `http://${env.HOST}:${env.PORT}/v1/files/local-upload?key=${encodeURIComponent(key)}`;
  }

  /**
   * Generates a local mock presigned download URL.
   *
   * @param key Source key
   * @returns Local HTTP download endpoint URL
   */
  async getPresignedDownloadUrl(key: string): Promise<string> {
    this.checkProductionAllowed();
    return `http://${env.HOST}:${env.PORT}/v1/files/local-download?key=${encodeURIComponent(key)}`;
  }

  /**
   * Initiates a mock local multipart upload session.
   *
   * @param key Storage key
   * @returns Synthetic uploadId string
   */
  async createMultipartUpload(key: string): Promise<string> {
    this.checkProductionAllowed();
    return `local-mp-${Date.now()}`;
  }

  /**
   * Generates a local mock part upload URL.
   *
   * @param key Storage key
   * @param uploadId Mock session ID
   * @param partNumber Part index
   * @returns Part upload URL string
   */
  async signPart(key: string, uploadId: string, partNumber: number): Promise<string> {
    this.checkProductionAllowed();
    return `http://${env.HOST}:${env.PORT}/v1/files/local-upload-part?key=${encodeURIComponent(key)}&uploadId=${uploadId}&part=${partNumber}`;
  }

  /**
   * Finalizes mock multipart upload on local filesystem.
   *
   * @param _key Target storage key
   * @param _uploadId Mock session identifier
   */
  async completeMultipartUpload(_key: string, _uploadId: string): Promise<void> {}

  /**
   * Aborts mock multipart upload on local filesystem.
   *
   * @param _key Target storage key
   * @param _uploadId Mock session identifier
   */
  async abortMultipartUpload(_key: string, _uploadId: string): Promise<void> {}

  /**
   * Checks health and availability of the local disk storage provider.
   *
   * @returns Health status indicating whether local disk driver is permitted
   */
  async healthCheck(): Promise<{ healthy: boolean; driver: string; error?: string }> {
    if (env.NODE_ENV === 'production' && !env.STORAGE_ALLOW_LOCAL_IN_PROD) {
      return {
        healthy: false,
        driver: 'local',
        error:
          'Local disk storage is disabled in production without STORAGE_ALLOW_LOCAL_IN_PROD=true',
      };
    }
    return { healthy: true, driver: 'local' };
  }
}
