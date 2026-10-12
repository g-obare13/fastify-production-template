/**
 * @file Factory instantiation resolving active storage provider driver from configuration.
 * @module src/lib/storage/factory
 */

import { env } from '#src/config/env.js';
import { LocalDiskStorageProvider } from './local-disk.js';
import type { StorageProvider } from './provider.js';
import { S3StorageProvider } from './s3.js';

/**
 * Creates the appropriate StorageProvider instance based on environment variables and credentials.
 *
 * @returns Configured S3StorageProvider or LocalDiskStorageProvider instance
 * @example
 * ```ts
 * const storage = createStorageProvider();
 * const meta = await storage.headObject('uploads/avatar.png');
 * ```
 */
export function createStorageProvider(): StorageProvider {
  const hasS3Config =
    env.STORAGE_DRIVER === 's3' ||
    Boolean(
      env.S3_BUCKET &&
        ((env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY) ||
          process.env.AWS_ROLE_ARN ||
          process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI)
    );

  if (hasS3Config) {
    return new S3StorageProvider();
  }

  return new LocalDiskStorageProvider();
}
