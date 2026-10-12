/**
 * @file GraphQL User object type definition and field resolvers.
 * @module graphql/types/user
 */

import type { User } from '#src/db/schema.js';
import { builder } from '#src/graphql/builder.js';
import { FileType } from './file.js';

/** GraphQL object type representation for platform user accounts. */
export const UserType = builder.objectRef<User>('User');

UserType.implement({
  description: 'Registered platform user account with profile information and roles',
  fields: (t) => ({
    id: t.exposeID('id', {
      description: 'Unique user identifier (ULID)',
    }),
    email: t.exposeString('email', {
      description: 'Primary verified email address of the user',
    }),
    role: t.exposeString('role', {
      description: 'Role-based access level (e.g. user, admin)',
    }),
    emailVerified: t.exposeBoolean('emailVerified', {
      description: 'Whether the user email address has been confirmed',
    }),
    avatarUrl: t.exposeString('avatarUrl', {
      nullable: true,
      description: 'Optional public avatar image URL',
    }),
    createdAt: t.string({
      description: 'Timestamp when the user account was created (ISO 8601 UTC)',
      resolve: (u) => u.createdAt.toISOString(),
    }),
    updatedAt: t.string({
      description: 'Timestamp when the user account was last modified (ISO 8601 UTC)',
      resolve: (u) => u.updatedAt.toISOString(),
    }),
    files: t.field({
      type: [FileType],
      description: 'Files uploaded by this user, resolved in O(1) via DataLoader',
      resolve: (u, _args, ctx) => ctx.loaders.userFilesLoader.load(u.id),
    }),
  }),
});
