/**
 * @file Amazon S3 and S3-compatible (MinIO, R2) object storage provider implementation.
 * @module src/lib/storage/s3
 */

import type { Readable } from 'node:stream';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '#src/config/env.js';
import { NotFoundError } from '#src/lib/errors.js';
import type { StorageObjectMetadata, StorageProvider } from './provider.js';

/**
 * S3-compatible storage provider leveraging AWS SDK v3 with presigned upload and multipart support.
 */
export class S3StorageProvider implements StorageProvider {
  /** Identifier of the active storage driver */
  readonly driver = 's3' as const;
  private readonly client: S3Client;
  private readonly bucket: string;

  /**
   * Initializes the AWS S3 client configured from application environment variables.
   */
  constructor() {
    this.bucket = env.S3_BUCKET;
    const config: S3ClientConfig = {
      region: env.S3_REGION,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
    };

    if (env.S3_ENDPOINT) {
      config.endpoint = env.S3_ENDPOINT;
    }
    if (env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY) {
      config.credentials = {
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      };
    }

    this.client = new S3Client(config);
  }

  /**
   * Uploads an object to S3 using managed parallel stream upload.
   *
   * @param key Target object key in bucket
   * @param body Stream or Buffer data payload
   * @param contentType MIME type of the upload
   * @returns Uploaded byte count
   */
  async putObject(
    key: string,
    body: Readable | Buffer,
    contentType: string
  ): Promise<{ size: number }> {
    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      },
    });
    await upload.done();
    const head = await this.headObject(key);
    return { size: head.size };
  }

  /**
   * Fetches an object stream and headers from S3 bucket.
   *
   * @param key Target object key
   * @returns Readable stream, content type, and content length
   * @throws NotFoundError When key does not exist in bucket
   */
  async getObject(
    key: string
  ): Promise<{ stream: Readable; contentType?: string; contentLength?: number }> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );
      const res: { stream: Readable; contentType?: string; contentLength?: number } = {
        stream: response.Body as Readable,
      };
      if (response.ContentType !== undefined) res.contentType = response.ContentType;
      if (response.ContentLength !== undefined) res.contentLength = response.ContentLength;
      return res;
    } catch {
      throw new NotFoundError('Storage object not found in S3');
    }
  }

  /**
   * Deletes an object from the S3 bucket.
   *
   * @param key Target object key
   */
  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
    );
  }

  /**
   * Fetches object headers to check existence and size.
   *
   * @param key Target object key
   * @returns Object size, content type, and existence status
   */
  async headObject(key: string): Promise<StorageObjectMetadata> {
    try {
      const response = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );
      const res: StorageObjectMetadata = {
        size: response.ContentLength ?? 0,
        exists: true,
      };
      if (response.ContentType !== undefined) res.contentType = response.ContentType;
      return res;
    } catch {
      return { size: 0, exists: false };
    }
  }

  /**
   * Generates an S3 presigned PUT URL allowing clients to upload directly to storage.
   *
   * @param key Target object key
   * @param contentType Expected MIME content type
   * @param expiresIn Validity duration in seconds
   * @returns Signed PUT URL string
   */
  async getPresignedUploadUrl(
    key: string,
    contentType: string,
    expiresIn = env.S3_PRESIGN_TTL_SECONDS
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });
    return getSignedUrl(this.client, command, { expiresIn });
  }

  /**
   * Generates a presigned GET URL for temporary secure client downloads.
   *
   * @param key Target object key
   * @param expiresIn Validity duration in seconds
   * @returns Signed GET URL string
   */
  async getPresignedDownloadUrl(
    key: string,
    expiresIn = env.S3_PRESIGN_TTL_SECONDS
  ): Promise<string> {
    if (env.S3_PUBLIC_BASE_URL) {
      return `${env.S3_PUBLIC_BASE_URL.replace(/\/$/, '')}/${key}`;
    }
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return getSignedUrl(this.client, command, { expiresIn });
  }

  /**
   * Starts a multipart upload session in S3.
   *
   * @param key Destination object key
   * @param contentType MIME type of the final object
   * @returns S3 session UploadId string
   * @throws Error If initiating multipart upload fails
   */
  async createMultipartUpload(key: string, contentType: string): Promise<string> {
    const res = await this.client.send(
      new CreateMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
      })
    );
    if (!res.UploadId) throw new Error('Failed to initiate multipart upload in S3');
    return res.UploadId;
  }

  /**
   * Generates a presigned URL to upload a single part of a multipart upload.
   *
   * @param key Destination object key
   * @param uploadId Active session identifier
   * @param partNumber 1-based part sequence number
   * @returns Presigned part upload URL
   */
  async signPart(key: string, uploadId: string, partNumber: number): Promise<string> {
    const command = new UploadPartCommand({
      Bucket: this.bucket,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
    });
    return getSignedUrl(this.client, command, { expiresIn: env.S3_PRESIGN_TTL_SECONDS });
  }

  /**
   * Assembles all uploaded parts to finalize a multipart object.
   *
   * @param key Destination object key
   * @param uploadId Active session identifier
   * @param parts List of part numbers and ETags returned by S3
   */
  async completeMultipartUpload(
    key: string,
    uploadId: string,
    parts: Array<{ partNumber: number; etag: string }>
  ): Promise<void> {
    await this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: parts.map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
        },
      })
    );
  }

  /**
   * Aborts an incomplete multipart upload and releases storage allocations.
   *
   * @param key Destination object key
   * @param uploadId Active session identifier
   */
  async abortMultipartUpload(key: string, uploadId: string): Promise<void> {
    await this.client.send(
      new AbortMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
      })
    );
  }

  /**
   * Executes a HeadBucket health check verifying S3 connectivity and bucket existence.
   *
   * @returns Health status object with driver name and error details if unavailable
   */
  async healthCheck(): Promise<{ healthy: boolean; driver: string; error?: string }> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return { healthy: true, driver: 's3' };
    } catch (err) {
      return { healthy: false, driver: 's3', error: (err as Error).message };
    }
  }
}
