/**
 * @file GraphQL query fields for individual users, paginated collections, and files.
 * @module graphql/types/queries
 */

import { resolveCursorConnection } from '@pothos/plugin-relay';
import type { User } from '#src/db/schema.js';
import { builder } from '#src/graphql/builder.js';
import { encodeCursor } from '#src/lib/pagination.js';
import { FileType } from './file.js';
import { UserType } from './user.js';

builder.queryField('user', (t) =>
  t.field({
    type: UserType,
    nullable: true,
    description: 'Fetch an individual user profile by unique ID',
    args: {
      id: t.arg.id({ required: true, description: 'Target user ULID identifier' }),
    },
    resolve: async (_root, args, ctx) => {
      return ctx.loaders.userLoader.load(String(args.id));
    },
  })
);

builder.queryField('users', (t) =>
  t.field({
    type: [UserType],
    description: 'List users with keyset cursor pagination',
    args: {
      limit: t.arg.int({
        required: false,
        defaultValue: 20,
        description: 'Maximum number of records to return (1-100)',
      }),
      cursor: t.arg.string({
        required: false,
        description: 'Opaque base64 cursor token from previous page',
      }),
    },
    authScopes: { authenticated: true },
    resolve: async (_root, args, ctx) => {
      const res = await ctx.services.users.listUsers({
        limit: args.limit ?? 20,
        ...(args.cursor ? { cursor: args.cursor } : {}),
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });
      return res.items;
    },
  })
);

// Relay Connection using the shared cursor pagination helper
builder.queryField('usersConnection', (t) =>
  t.connection({
    type: UserType,
    description: 'Relay-compliant paginated connection of user accounts',
    authScopes: { authenticated: true },
    resolve: async (_root, args, ctx) => {
      return resolveCursorConnection(
        {
          args,
          toCursor: (value: unknown) => {
            const user = value as User;
            return encodeCursor({ id: user.id, createdAt: user.createdAt.toISOString() });
          },
        },
        async ({ before, after, limit, inverted }) => {
          const cursor = after || before;
          const res = await ctx.services.users.listUsers({
            limit,
            ...(cursor ? { cursor } : {}),
            sortBy: 'createdAt',
            sortOrder: inverted ? 'asc' : 'desc',
          });
          return res.items;
        }
      );
    },
  })
);

builder.queryField('file', (t) =>
  t.field({
    type: FileType,
    nullable: true,
    description: 'Fetch file metadata by unique file record ID',
    args: {
      id: t.arg.id({ required: true, description: 'Target file ULID identifier' }),
    },
    authScopes: { authenticated: true },
    resolve: async (_root, args, ctx) => {
      return ctx.loaders.fileLoader.load(String(args.id));
    },
  })
);

builder.queryField('files', (t) =>
  t.field({
    type: [FileType],
    description: 'List all files owned by the currently authenticated user',
    authScopes: { authenticated: true },
    resolve: async (_root, _args, ctx) => {
      if (!ctx.user) return [];
      return ctx.loaders.userFilesLoader.load(ctx.user.id);
    },
  })
);
