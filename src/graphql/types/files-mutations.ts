/**
 * @file GraphQL mutation fields for profile modifications and presigned file uploads.
 * @module graphql/types/files-mutations
 */

import { builder } from '#src/graphql/builder.js';
import {
  confirmUploadRequestSchema,
  presignedUploadRequestSchema,
} from '#src/modules/files/schemas.js';
import { updateUserProfileSchema } from '#src/modules/users/schemas.js';
import { FileType, PresignedUploadType } from './file.js';
import { UserType } from './user.js';

builder.mutationField('updateUserProfile', (t) =>
  t.field({
    type: UserType,
    description: 'Update public profile details of the currently authenticated user',
    authScopes: { authenticated: true },
    args: {
      avatarUrl: t.arg.string({
        required: false,
        description: 'New public avatar URL or null to clear',
      }),
    },
    validate: {
      schema: updateUserProfileSchema,
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user) throw new Error('Unauthorized');
      return ctx.services.users.updateProfile(ctx.user.id, ctx.user.id, ctx.user.role, {
        avatarUrl: args.avatarUrl ?? null,
      });
    },
  })
);

builder.mutationField('requestFileUpload', (t) =>
  t.field({
    type: PresignedUploadType,
    description: 'Request an expiring presigned PUT URL for direct-to-storage file upload',
    authScopes: { authenticated: true },
    args: {
      filename: t.arg.string({ required: true, description: 'Original filename with extension' }),
      mimeType: t.arg.string({
        required: true,
        description: 'Declared MIME type (e.g. image/png)',
      }),
      size: t.arg.int({ required: true, description: 'Expected file size in bytes' }),
      visibility: t.arg.string({
        required: false,
        defaultValue: 'private',
        description: 'Visibility setting (private or public)',
      }),
    },
    validate: {
      schema: presignedUploadRequestSchema,
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user) throw new Error('Unauthorized');
      return ctx.services.files.requestPresignedUpload(ctx.user.id, {
        filename: args.filename,
        mimeType: args.mimeType,
        size: args.size,
        visibility: (args.visibility as 'private' | 'public') || 'private',
      });
    },
  })
);

builder.mutationField('confirmFileUpload', (t) =>
  t.field({
    type: FileType,
    description:
      'Confirm direct upload completion and trigger server-side MIME sniffing verification',
    authScopes: { authenticated: true },
    args: {
      fileId: t.arg.string({
        required: true,
        description: 'Allocated file record identifier from presign step',
      }),
      checksum: t.arg.string({
        required: false,
        description: 'Optional client-computed checksum for integrity validation',
      }),
    },
    validate: {
      schema: confirmUploadRequestSchema,
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user) throw new Error('Unauthorized');
      return ctx.services.files.confirmUpload(
        args.fileId,
        ctx.user.id,
        args.checksum ?? 'sha256-verified'
      );
    },
  })
);
