/**
 * @file Abstraction contract and metadata interfaces for object storage providers.
 * @module src/lib/storage/provider
 */

import type { Readable } from 'node:stream';

/**
 * Metadata attributes of an object stored in storage.
 */
export interface StorageObjectMetadata {
  /** Size of object in bytes */
  size: number;
  /** Inferred or declared MIME content type */
  contentType?: string;
  /** Whether the object currently exists in storage */
  exists: boolean;
}

/**
 * Universal object storage provider contract supporting S3 and local filesystem drivers.
 */
export interface StorageProvider {
  /** Identifier of the active storage driver */
  readonly driver: 's3' | 'local';

  /**
   * Uploads an object directly to storage.
   *
   * @param key Unique storage object key
   * @param body Stream or Buffer payload to persist
   * @param contentType MIME type of the payload
   * @returns Metadata including uploaded byte count and checksum
   */
  putObject(
    key: string,
    body: Readable | Buffer,
    contentType: string
  ): Promise<{ size: number; checksum?: string }>;

  /**
   * Retrieves an object stream from storage.
   *
   * @param key Unique storage object key
   * @returns Readable stream and headers
   */
  getObject(
    key: string
  ): Promise<{ stream: Readable; contentType?: string; contentLength?: number }>;

  /**
   * Deletes an object from storage.
   *
   * @param key Unique storage object key
   * @returns Resolves when object is deleted
   */
  deleteObject(key: string): Promise<void>;

  /**
   * Retrieves object headers and existence without downloading payload.
   *
   * @param key Unique storage object key
   * @returns Object size, content type, and existence flag
   */
  headObject(key: string): Promise<StorageObjectMetadata>;

  /**
   * Generates a presigned direct upload URL.
   *
   * @param key Destination storage key
   * @param contentType Expected MIME content type
   * @param expiresIn URL validity duration in seconds
   * @returns Temporary presigned upload URL
   */
  getPresignedUploadUrl(key: string, contentType: string, expiresIn?: number): Promise<string>;

  /**
   * Generates a presigned temporary download URL.
   *
   * @param key Source storage key
   * @param expiresIn URL validity duration in seconds
   * @returns Temporary presigned download URL
   */
  getPresignedDownloadUrl(key: string, expiresIn?: number): Promise<string>;

  /**
   * Initiates a multipart upload session.
   *
   * @param key Target storage key
   * @param contentType MIME type of the final file
   * @returns Session uploadId string
   */
  createMultipartUpload(key: string, contentType: string): Promise<string>;

  /**
   * Signs a specific part of an active multipart upload.
   *
   * @param key Target storage key
   * @param uploadId Active session identifier
   * @param partNumber 1-based part index
   * @returns Presigned part upload URL
   */
  signPart(key: string, uploadId: string, partNumber: number): Promise<string>;

  /**
   * Finalizes an active multipart upload session after all parts are uploaded.
   *
   * @param key Target storage key
   * @param uploadId Active session identifier
   * @param parts Completed parts list with part numbers and ETags
   * @returns Resolves when multipart object is assembled
   */
  completeMultipartUpload(
    key: string,
    uploadId: string,
    parts: Array<{ partNumber: number; etag: string }>
  ): Promise<void>;

  /**
   * Aborts an active multipart upload session and frees allocated storage.
   *
   * @param key Target storage key
   * @param uploadId Active session identifier
   * @returns Resolves when multipart session is aborted
   */
  abortMultipartUpload(key: string, uploadId: string): Promise<void>;

  /**
   * Evaluates health and connectivity of the storage backend.
   *
   * @returns Health status object with driver name and error if unhealthy
   */
  healthCheck(): Promise<{ healthy: boolean; driver: string; error?: string }>;
}
