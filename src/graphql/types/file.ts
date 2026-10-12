/**
 * @file GraphQL File and PresignedUpload object types and resolvers.
 * @module graphql/types/file
 */

import type { FileRecord } from '#src/db/schema.js';
import { builder } from '#src/graphql/builder.js';
import { UserType } from './user.js';

/** GraphQL object type representing stored file records and metadata. */
export const FileType = builder.objectRef<FileRecord>('File');

FileType.implement({
  description: 'Stored file object in storage provider',
  fields: (t) => ({
    id: t.exposeID('id', {
      description: 'Unique file record identifier (ULID)',
    }),
    ownerId: t.exposeString('ownerId', {
      description: 'Identifier of the user who uploaded the file',
    }),
    originalName: t.exposeString('originalName', {
      description: 'Original client filename upon upload',
    }),
    mimeType: t.exposeString('mimeType', {
      description: 'Verified MIME type (verified via binary magic numbers)',
    }),
    size: t.exposeInt('size', {
      description: 'File size in bytes',
    }),
    status: t.exposeString('status', {
      description: 'File lifecycle state (pending, ready, deleted)',
    }),
    visibility: t.exposeString('visibility', {
      description: 'Access visibility control (private, public)',
    }),
    createdAt: t.string({
      description: 'Timestamp when the file record was initialized (ISO 8601 UTC)',
      resolve: (f) => f.createdAt.toISOString(),
    }),
    updatedAt: t.string({
      description: 'Timestamp when the file record was last updated (ISO 8601 UTC)',
      resolve: (f) => f.updatedAt.toISOString(),
    }),
    owner: t.field({
      type: UserType,
      nullable: true,
      description: 'Owning user entity resolved in O(1) via DataLoader',
      resolve: (f, _args, ctx) => ctx.loaders.userLoader.load(f.ownerId),
    }),
    downloadUrl: t.string({
      nullable: true,
      description: 'Expiring presigned download URL for authorized callers',
      resolve: async (f, _args, ctx) => {
        if (f.status !== 'ready') return null;
        try {
          const res = await ctx.services.files.getDownloadUrl(
            f.id,
            ctx.user?.id ?? '',
            ctx.user?.role ?? 'user'
          );
          return res.downloadUrl;
        } catch {
          return null;
        }
      },
    }),
  }),
});

/** GraphQL object type containing expiring presigned direct S3 upload URLs. */
export const PresignedUploadType = builder

  .objectRef<{
    fileId: string;
    uploadUrl: string;
    key: string;
    expiresIn: number;
  }>('PresignedUpload')
  .implement({
    description: 'Direct-to-storage presigned upload URL and descriptor',
    fields: (t) => ({
      fileId: t.exposeString('fileId', {
        description: 'Allocated file record identifier for upload confirmation',
      }),
      uploadUrl: t.exposeString('uploadUrl', {
        description: 'Direct HTTP PUT presigned S3 upload URL',
      }),
      key: t.exposeString('key', {
        description: 'Storage provider object key',
      }),
      expiresIn: t.exposeInt('expiresIn', {
        description: 'Validity duration of the upload URL in seconds',
      }),
    }),
  });
