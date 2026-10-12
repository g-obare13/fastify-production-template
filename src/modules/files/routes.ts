/**
 * @file File presigned upload, validation confirmation, and download REST routes.
 * @module modules/files/routes
 */

import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { BadRequestError, UnauthorizedError, errorResponses } from '#src/lib/errors.js';
import { createStorageProvider } from '#src/lib/storage/factory.js';
import { DrizzleFilesRepository } from './repository.js';
import {
  confirmUploadRequestSchema,
  downloadUrlResponseSchema,
  fileResponseSchema,
  presignedUploadRequestSchema,
  presignedUploadResponseSchema,
} from './schemas.js';
import { FilesService } from './service.js';

const AUTH_SECURITY = [{ bearerAuth: [] }, { cookieAuth: [] }, { apiKeyAuth: [] }];

/**
 * Registers direct S3 presigned upload, confirmation, download, and file deletion endpoints.
 *
 * Decorators added: none.
 * Env vars read: none.
 * Hooks registered: none (route-level `preHandler` guards used).
 *
 * @param app Fastify application instance with Zod type provider.
 */
export const filesRoutes: FastifyPluginAsyncZod = async (app) => {
  if (!app.db?.client) {
    throw new Error('Database client must be registered before files routes');
  }

  const repo = new DrizzleFilesRepository(app.db.client);
  const storage = createStorageProvider();
  const service = new FilesService(repo, storage);

  app.post(
    '/files/presign',
    {
      preHandler: [app.authenticate as never],
      schema: {
        tags: ['Files'],
        summary: 'Request direct-to-storage presigned upload URL',
        description:
          'Validates declared MIME type and size, creates a pending database record, and issues an expiring S3 presigned PUT URL for direct client-to-storage upload.',
        security: AUTH_SECURITY,
        body: presignedUploadRequestSchema,
        response: {
          201: presignedUploadResponseSchema,
          ...errorResponses,
        },
      },
    },
    async (request, reply) => {
      const user = request.user;
      if (!user) throw new UnauthorizedError('Authentication required');
      const result = await service.requestPresignedUpload(user.id, request.body);
      return reply.status(201).send(result);
    }
  );

  app.post(
    '/files/confirm',
    {
      preHandler: [app.authenticate as never],
      schema: {
        tags: ['Files'],
        summary: 'Confirm completed upload and activate file record',
        description:
          'Verifies object existence via HeadObject, sniffs binary magic numbers to prevent MIME spoofing, and transitions the file to ready state.',
        security: AUTH_SECURITY,
        body: confirmUploadRequestSchema,
        response: {
          200: fileResponseSchema,
          ...errorResponses,
        },
      },
    },
    async (request, reply) => {
      const user = request.user;
      if (!user) throw new UnauthorizedError('Authentication required');
      const confirmed = await service.confirmUpload(
        request.body.fileId,
        user.id,
        request.body.checksum
      );
      return reply.status(200).send({
        id: confirmed.id,
        ownerId: confirmed.ownerId,
        originalName: confirmed.originalName,
        mimeType: confirmed.mimeType,
        size: Number(confirmed.size),
        status: confirmed.status,
        visibility: confirmed.visibility,
        createdAt: confirmed.createdAt.toISOString(),
        updatedAt: confirmed.updatedAt.toISOString(),
      });
    }
  );

  app.get(
    '/files/:id/download',
    {
      preHandler: [app.authenticate as never],
      schema: {
        tags: ['Files'],
        summary: 'Get short-lived presigned download URL for private or public file',
        description:
          'Generates a time-limited presigned GET URL for authorized users or public files.',
        security: AUTH_SECURITY,
        params: z.object({ id: z.string().describe('File record ULID identifier') }),
        response: {
          200: downloadUrlResponseSchema,
          ...errorResponses,
        },
      },
    },
    async (request, reply) => {
      const user = request.user;
      if (!user) throw new UnauthorizedError('Authentication required');
      const result = await service.getDownloadUrl(
        (request.params as { id: string }).id,
        user.id,
        user.role
      );
      return reply.status(200).send(result);
    }
  );

  // REST streaming multipart upload fallback
  app.post(
    '/files/upload',
    {
      preHandler: [app.authenticate as never],
      schema: {
        tags: ['Files'],
        summary: 'Streaming multipart file upload fallback (REST only)',
        description:
          'Streams file data directly to storage without buffering in application memory. Recommended for simple multipart clients.',
        security: AUTH_SECURITY,
        response: {
          201: fileResponseSchema,
          ...errorResponses,
        },
      },
    },
    async (request, reply) => {
      const user = request.user;
      if (!user) throw new UnauthorizedError('Authentication required');
      const part = await request.file();
      if (!part) {
        throw new BadRequestError('No file provided in multipart upload');
      }

      const uploaded = await service.uploadFileStream(
        user.id,
        part.filename,
        part.mimetype,
        part.file
      );

      return reply.status(201).send({
        id: uploaded.id,
        ownerId: uploaded.ownerId,
        originalName: uploaded.originalName,
        mimeType: uploaded.mimeType,
        size: Number(uploaded.size),
        status: uploaded.status,
        visibility: uploaded.visibility,
        createdAt: uploaded.createdAt.toISOString(),
        updatedAt: uploaded.updatedAt.toISOString(),
      });
    }
  );

  // Soft delete file
  app.delete(
    '/files/:id',
    {
      preHandler: [app.authenticate as never],
      schema: {
        tags: ['Files'],
        summary: 'Soft delete a stored file',
        description:
          'Marks a file record as deleted and enqueues object removal in background maintenance.',
        security: AUTH_SECURITY,
        params: z.object({ id: z.string().describe('File record ULID identifier') }),
        response: {
          204: z.null().describe('File deleted successfully'),
          ...errorResponses,
        },
      },
    },
    async (request, reply) => {
      const user = request.user;
      if (!user) throw new UnauthorizedError('Authentication required');
      await service.deleteFile((request.params as { id: string }).id, user.id, user.role);
      return reply.status(204).send(null);
    }
  );
};
