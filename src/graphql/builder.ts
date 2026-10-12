/**
 * @file Pothos code-first schema builder configuration with Relay, Auth, and DataLoader plugins.
 * @module graphql/builder
 */

import SchemaBuilder from '@pothos/core';
import DataloaderPlugin from '@pothos/plugin-dataloader';
import ErrorsPlugin from '@pothos/plugin-errors';
import RelayPlugin from '@pothos/plugin-relay';
import ScopeAuthPlugin from '@pothos/plugin-scope-auth';
import ValidationPlugin from '@pothos/plugin-zod';
import type { GraphQLContext } from './context.js';

/** Pothos GraphQL schema builder configured with scope-auth and Relay support. */
export const builder = new SchemaBuilder<{
  Context: GraphQLContext;
  AuthScopes: {
    public: boolean;
    authenticated: boolean;
    admin: boolean;
  };
  DefaultFieldNullability: false;
}>({
  plugins: [ScopeAuthPlugin, RelayPlugin, ErrorsPlugin, ValidationPlugin, DataloaderPlugin],
  defaultFieldNullability: false,
  scopeAuth: {
    authScopes: async (context: GraphQLContext) => ({
      public: true,
      authenticated: context.user !== null,
      admin: context.user?.role === 'admin',
    }),
  },
  relay: {
    clientMutationId: 'omit',
    cursorType: 'String',
    pageInfoTypeOptions: {
      description: 'Pagination metadata conforming to Relay Connection specification',
    },
  },
  errors: {
    defaultTypes: [Error],
    directResult: true,
  },
});

builder.queryType({
  description: 'Root query operations exposing user, file, and connection queries',
});
builder.mutationType({
  description: 'Root mutation operations for authentication, profile updates, and file uploads',
});
builder.subscriptionType({
  description: 'Root real-time subscription operations for live event streams',
});
