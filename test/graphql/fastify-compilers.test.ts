/**
 * @file Regression tests for Mercurius routes using Fastify's JSON Schema compilers.
 * @module test/graphql/fastify-compilers
 */

import Fastify from 'fastify';
import mercurius from 'mercurius';
import { describe, expect, it } from 'vitest';
import {
  serializerCompiler as zodSerializerCompiler,
  validatorCompiler as zodValidatorCompiler,
} from 'fastify-type-provider-zod';
import { graphqlRouteCompilers } from '#src/graphql/fastify-compilers.js';

describe('Mercurius Fastify route compilers', () => {
  it('serves GraphQL introspection with the app-level Zod compilers enabled', async () => {
    const app = Fastify();
    app.setValidatorCompiler(zodValidatorCompiler);
    app.setSerializerCompiler(zodSerializerCompiler);

    await app.register(mercurius, {
      schema: 'type Query { ping: String! }',
      path: '/graphql',
      additionalRouteOptions: graphqlRouteCompilers,
    });

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/graphql',
        payload: { query: '{ __schema { queryType { name } } }' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        data: { __schema: { queryType: { name: 'Query' } } },
      });
    } finally {
      await app.close();
    }
  });
});
