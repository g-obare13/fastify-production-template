/**
 * @file User directory and profile management REST route endpoints.
 * @module modules/users/routes
 */

import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { User } from '#src/db/schema.js';
import {
  BadRequestError,
  ForbiddenError,
  UnauthorizedError,
  errorResponses,
} from '#src/lib/errors.js';
import { applySparseFieldset, parseFieldsets } from '#src/lib/fieldsets.js';
import { createStorageProvider } from '#src/lib/storage/factory.js';
import type { StorageProvider } from '#src/lib/storage/provider.js';
import { userProfileSchema } from '#src/modules/auth/schemas.js';
import { DrizzleUsersRepository } from './repository.js';
import {
  getUserQuerySchema,
  listUsersQuerySchema,
  paginatedUsersResponseSchema,
  updateUserProfileSchema,
  updateUserRoleSchema,
  userIdParamSchema,
} from './schemas.js';
import { UsersService } from './service.js';

const ALLOWED_USER_FIELDS = [
  'id',
  'email',
  'role',
  'emailVerified',
  'avatarUrl',
  'createdAt',
  'updatedAt',
] as const;

const AUTH_SECURITY = [{ bearerAuth: [] }, { cookieAuth: [] }, { apiKeyAuth: [] }];

/**
 * Registers user directory, profile update, role elevation, and deletion routes.
 *
 * Decorators added: none.
 * Env vars read: none.
 * Hooks registered: none (route-level `preHandler` guards used).
 *
 * @param app Fastify application instance with Zod type provider.
 */
export const usersRoutes: FastifyPluginAsyncZod = async (app) => {
  if (!app.db?.client) {
    throw new Error('Database client must be registered before users routes');
  }

  const repo = new DrizzleUsersRepository(app.db.client);
  const service = new UsersService(repo);

  const formatUser = (u: User) => ({
    id: u.id,
    email: u.email,
    role: u.role as 'user' | 'admin',
    emailVerified: u.emailVerified,
    avatarUrl: u.avatarUrl ?? null,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
  });

  // List users with cursor pagination
  app.get(
    '/users',
    {
      preHandler: [app.authenticate as never],
      schema: {
        tags: ['Users'],
        summary: 'List users with cursor-based pagination',
        description:
          'Fetches a paginated slice of registered users with keyset cursor pagination and optional sparse fieldset filtering.',
        security: AUTH_SECURITY,
        querystring: listUsersQuerySchema,
        response: {
          200: paginatedUsersResponseSchema,
          ...errorResponses,
        },
      },
    },
    async (request, reply) => {
      const result = await service.listUsers(request.query);
      const fields = parseFieldsets(request.query.fields, ALLOWED_USER_FIELDS);
      const formattedItems = result.items.map((u) => {
        const base = formatUser(u);
        return applySparseFieldset(base, fields);
      });

      return reply.status(200).send({
        items: formattedItems,
        pageInfo: result.pageInfo,
      });
    }
  );

  // Get user profile by ID
  app.get(
    '/users/:id',
    {
      preHandler: [app.authenticate as never],
      schema: {
        tags: ['Users'],
        summary: 'Get user by ID',
        description:
          'Retrieves public profile information for a specific user identified by their ULID.',
        security: AUTH_SECURITY,
        params: userIdParamSchema,
        querystring: getUserQuerySchema,
        response: {
          200: userProfileSchema,
          ...errorResponses,
        },
      },
    },
    async (request, reply) => {
      const user = await service.getUserById(request.params.id);
      const fields = parseFieldsets(request.query.fields, ALLOWED_USER_FIELDS);
      const formatted = formatUser(user);
      return reply
        .status(200)
        .send(applySparseFieldset(formatted, fields) as z.infer<typeof userProfileSchema>);
    }
  );

  // Update profile
  app.patch(
    '/users/:id',
    {
      preHandler: [app.authenticate as never],
      schema: {
        tags: ['Users'],
        summary: 'Update user profile (avatarUrl)',
        description: 'Updates editable profile fields for a user account (e.g. avatar URL).',
        security: AUTH_SECURITY,
        params: userIdParamSchema,
        body: updateUserProfileSchema,
        response: {
          200: userProfileSchema,
          ...errorResponses,
        },
      },
    },
    async (request, reply) => {
      const session = request.user;
      if (!session) {
        throw new UnauthorizedError('Authentication required');
      }
      const updated = await service.updateProfile(
        request.params.id,
        session.id,
        session.role,
        request.body
      );
      return reply.status(200).send(formatUser(updated));
    }
  );

  // Update user role (Admin only)
  app.patch(
    '/users/:id/role',
    {
      preHandler: [
        app.authenticate as never,
        (app.authorize ? app.authorize(['admin']) : () => {}) as never,
      ],
      schema: {
        tags: ['Users'],
        summary: 'Change user role (admin only)',
        description:
          'Elevates or modifies the role-based access control level of a user (requires admin privileges).',
        security: AUTH_SECURITY,
        params: userIdParamSchema,
        body: updateUserRoleSchema,
        response: {
          200: userProfileSchema,
          ...errorResponses,
        },
      },
    },
    async (request, reply) => {
      const session = request.user;
      if (!session) {
        throw new UnauthorizedError('Authentication required');
      }
      const updated = await service.updateRole(request.params.id, session.id, request.body);
      return reply.status(200).send(formatUser(updated));
    }
  );

  // Soft delete user (Admin only)
  app.delete(
    '/users/:id',
    {
      preHandler: [
        app.authenticate as never,
        (app.authorize ? app.authorize(['admin']) : () => {}) as never,
      ],
      schema: {
        tags: ['Users'],
        summary: 'Soft delete a user account (admin only)',
        description: 'Marks a user account as deleted without removing historical audit traces.',
        security: AUTH_SECURITY,
        params: userIdParamSchema,
        response: {
          204: z.null().describe('User successfully soft deleted'),
          ...errorResponses,
        },
      },
    },
    async (request, reply) => {
      const session = request.user;
      if (!session) {
        throw new UnauthorizedError('Authentication required');
      }
      await service.deleteUser(request.params.id, session.id);
      return reply.status(204).send(null);
    }
  );

  // Upload user avatar
  app.post(
    '/users/:id/avatar',
    {
      preHandler: [app.authenticate as never],
      schema: {
        tags: ['Users'],
        summary: 'Upload user profile avatar image',
        description:
          'Streams a multipart image file directly to storage and attaches it to the user profile.',
        security: AUTH_SECURITY,
        params: userIdParamSchema,
        response: {
          200: userProfileSchema,
          ...errorResponses,
        },
      },
    },
    async (request, reply) => {
      const session = request.user;
      if (!session) {
        throw new UnauthorizedError('Authentication required');
      }

      const targetId = request.params.id;
      if (targetId !== session.id && session.role !== 'admin') {
        throw new ForbiddenError('You can only update your own avatar');
      }

      const part = await request.file();
      if (!part) {
        throw new BadRequestError('No avatar image file provided');
      }

      const storage = (app.storage?.provider ?? createStorageProvider()) as StorageProvider;
      const ext = part.filename.split('.').pop() || 'png';
      const key = `avatars/${targetId}_${Date.now()}.${ext}`;
      await storage.putObject(key, part.file, part.mimetype);

      const avatarUrl = await storage.getPresignedDownloadUrl(key);
      const updated = await service.updateProfile(targetId, session.id, session.role, {
        avatarUrl,
      });

      return reply.status(200).send(formatUser(updated));
    }
  );
};
