/**
 * @file Tests Posts route registration in the generated OpenAPI document.
 * @module test/modules/posts.routes
 */

import fastifySwagger from '@fastify/swagger';
import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler, jsonSchemaTransform } from 'fastify-type-provider-zod';
import { afterEach, describe, expect, it } from 'vitest';
import type { Database } from '#src/db/client.js';
import { postsRoutes } from '#src/modules/posts/routes.js';

describe('Posts REST routes', () => {
  let app: ReturnType<typeof Fastify> | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('registers Posts endpoints in the versioned OpenAPI document', async () => {
    app = Fastify();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    app.decorate('db', {
      client: {} as Database,
      healthCheck: async () => ({ healthy: true }),
      close: async () => {},
    });
    app.decorate('authenticate', async () => {});

    await app.register(fastifySwagger, {
      openapi: {
        openapi: '3.1.0',
        info: { title: 'Test API', version: '1.0.0' },
        components: {
          securitySchemes: {
            bearerAuth: { type: 'http', scheme: 'bearer' },
          },
        },
      },
      transform: jsonSchemaTransform,
    });
    await app.register(postsRoutes, { prefix: '/v1' });
    await app.ready();

    const paths = app.swagger().paths;
    expect(paths).toHaveProperty('/v1/posts');
    expect(paths).toHaveProperty('/v1/posts/{id}');
    expect(paths['/v1/posts']?.get?.tags).toContain('Posts');
    expect(paths['/v1/posts']?.post?.tags).toContain('Posts');
    expect(paths['/v1/posts/{id}']?.get?.tags).toContain('Posts');
    expect(paths['/v1/posts/{id}']?.patch?.tags).toContain('Posts');
    expect(paths['/v1/posts/{id}']?.delete?.tags).toContain('Posts');
    expect(paths['/v1/posts']?.get?.security).toBeUndefined();
    expect(paths['/v1/posts/{id}']?.get?.security).toBeUndefined();
    expect(paths['/v1/posts']?.post?.security).toEqual([{ bearerAuth: [] }]);
    expect(paths['/v1/posts/{id}']?.patch?.security).toEqual([{ bearerAuth: [] }]);
    expect(paths['/v1/posts/{id}']?.delete?.security).toEqual([{ bearerAuth: [] }]);
    expect(paths['/v1/posts']?.get?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'limit', in: 'query' }),
        expect.objectContaining({ name: 'cursor', in: 'query' }),
      ])
    );
  });
});
