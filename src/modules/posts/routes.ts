/**
 * @file Public and authenticated REST endpoints for managing posts.
 * @module modules/posts/routes
 */

import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { UnauthorizedError, errorResponses } from '#src/lib/errors.js';
import { DrizzlePostsRepository } from './repository.js';
import type { PostRepository } from './repository.js';
import {
  createPostRequestSchema,
  listPostsQuerySchema,
  paginatedPostsResponseSchema,
  postResponseSchema,
  updatePostRequestSchema,
} from './schemas.js';
import { PostService } from './service.js';

/**
 * Creates the posts REST routes using the supplied repository.
 *
 * @param repo Persistence implementation for post operations.
 * @returns Fastify plugin that registers the post endpoints.
 */
export function createPostsRoutes(repo: PostRepository): FastifyPluginAsyncZod {
  return async (app) => {
    const service = new PostService(repo);

    app.get(
      '/posts',
      {
        schema: {
          tags: ['Posts'],
          summary: 'List posts (public)',
          description:
            'Public endpoint. Returns active posts in reverse chronological order using cursor-based pagination.',
          querystring: listPostsQuerySchema,
          response: { 200: paginatedPostsResponseSchema, ...errorResponses },
        },
      },
      async (request, reply) => {
        const result = await service.listPosts(request.query);
        return reply.status(200).send(result);
      }
    );

    app.get(
      '/posts/:id',
      {
        schema: {
          tags: ['Posts'],
          summary: 'Get Post by ID (public)',
          description: 'Public endpoint. Retrieves one active post by its ID.',
          params: z.object({ id: z.string() }),
          response: { 200: postResponseSchema, ...errorResponses },
        },
      },
      async (request, reply) => {
        const item = await service.getById(request.params.id);
        return reply.send(item);
      }
    );

    app.post(
      '/posts',
      {
        preHandler: [app.authenticate as never],
        schema: {
          tags: ['Posts'],
          summary: 'Create new Post (authenticated)',
          description: 'Creates a post owned by the authenticated user.',
          security: [{ bearerAuth: [] }],
          body: createPostRequestSchema,
          response: { 201: postResponseSchema, ...errorResponses },
        },
      },
      async (request, reply) => {
        const user = request.user;
        if (!user) throw new UnauthorizedError('Authentication required');
        const item = await service.create(user.id, request.body);
        return reply.status(201).send(item);
      }
    );

    app.patch(
      '/posts/:id',
      {
        preHandler: [app.authenticate as never],
        schema: {
          tags: ['Posts'],
          summary: 'Edit Post (author or admin)',
          description: 'Updates a post. Only its author or an admin can make changes.',
          security: [{ bearerAuth: [] }],
          params: z.object({ id: z.string() }),
          body: updatePostRequestSchema,
          response: { 200: postResponseSchema, ...errorResponses },
        },
      },
      async (request, reply) => {
        const user = request.user;
        if (!user) throw new UnauthorizedError('Authentication required');
        const item = await service.update(
          request.params.id,
          user.id,
          user.role,
          request.body
        );
        return reply.status(200).send(item);
      }
    );

    app.delete(
      '/posts/:id',
      {
        preHandler: [app.authenticate as never],
        schema: {
          tags: ['Posts'],
          summary: 'Delete Post (author or admin)',
          description:
            'Soft-deletes a post. Only its author or an admin can delete it.',
          security: [{ bearerAuth: [] }],
          params: z.object({ id: z.string() }),
          response: { 204: z.null(), ...errorResponses },
        },
      },
      async (request, reply) => {
        const user = request.user;
        if (!user) throw new UnauthorizedError('Authentication required');
        await service.delete(request.params.id, user.id, user.role);
        return reply.status(204).send(null);
      }
    );
  };
}

/**
 * Registers posts routes using the application's database connection.
 *
 * @param app Fastify application with the database plugin registered.
 */
export const postsRoutes: FastifyPluginAsyncZod = async (app) => {
  if (!app.db?.client) {
    throw new Error('Database client must be registered before posts routes');
  }

  await app.register(createPostsRoutes(new DrizzlePostsRepository(app.db.client)));
};
