/**
 * Provides JSON Schema compilers for Fastify routes registered by Mercurius.
 * @module graphql/fastify-compilers
 */

import AjvCompiler from '@fastify/ajv-compiler';
import FastJsonStringifyCompiler from '@fastify/fast-json-stringify-compiler';
import type { RouteOptions } from 'fastify';

const jsonSchemaSerializerCompiler = FastJsonStringifyCompiler()({}, {});

/**
 * Compilers for Mercurius' JSON Schema request and response validation.
 */
export const graphqlRouteCompilers: Pick<
  RouteOptions,
  'validatorCompiler' | 'serializerCompiler'
> = {
  validatorCompiler: AjvCompiler()({}, { customOptions: {} }),
  serializerCompiler: (routeSchema) =>
    jsonSchemaSerializerCompiler({
      ...routeSchema,
      httpStatus: routeSchema.httpStatus ?? '200',
    }),
};
