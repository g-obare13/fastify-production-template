/**
 * @file GraphQL authentication types, mutation resolvers, and session queries.
 * @module graphql/types/auth
 */

import { z } from 'zod';
import { builder } from '#src/graphql/builder.js';
import type { AuthTokensResponse } from '#src/modules/auth/schemas.js';
import {
  loginRequestSchema,
  refreshRequestSchema,
  signupRequestSchema,
} from '#src/modules/auth/schemas.js';
import { UserType } from './user.js';

/** GraphQL payload returned upon successful authentication containing access/refresh tokens. */
export const AuthPayloadType = builder.objectRef<AuthTokensResponse>('AuthPayload').implement({
  description: 'Authentication token pair and user profile',
  fields: (t) => ({
    accessToken: t.exposeString('accessToken', {
      description: 'Signed JWT access token for Bearer authorization',
    }),
    refreshToken: t.exposeString('refreshToken', {
      nullable: true,
      description: 'Rotating refresh token for renewing access tokens',
    }),
    tokenType: t.exposeString('tokenType', {
      description: 'Token type scheme (always Bearer)',
    }),
    expiresIn: t.exposeString('expiresIn', {
      description: 'Access token expiration duration string (e.g. 15m)',
    }),
    user: t.field({
      type: UserType,
      description: 'Authenticated user account profile',
      resolve: (parent) => ({
        ...parent.user,
        avatarUrl: parent.user.avatarUrl ?? null,
        deletedAt: null,
        passwordHash: '',
        createdAt: new Date(parent.user.createdAt),
        updatedAt: new Date(parent.user.updatedAt),
      }),
    }),
  }),
});

/** Generic GraphQL operation confirmation response containing status flag and message. */
export const MessageResponseType = builder
  .objectRef<{ message: string; success: boolean }>('MessageResponse')

  .implement({
    description: 'Generic operation confirmation message',
    fields: (t) => ({
      message: t.exposeString('message', {
        description: 'Informational message describing operation outcome',
      }),
      success: t.exposeBoolean('success', {
        description: 'True if the operation succeeded without errors',
      }),
    }),
  });

// Queries
builder.queryField('me', (t) =>
  t.field({
    type: UserType,
    nullable: true,
    description: 'Fetch the currently authenticated user profile from session or bearer token',
    authScopes: { public: true },
    resolve: async (_root, _args, ctx) => {
      if (!ctx.user) return null;
      return ctx.services.users.getUserById(ctx.user.id);
    },
  })
);

// Mutations
builder.mutationField('signup', (t) =>
  t.field({
    type: AuthPayloadType,
    description: 'Register a new user account with email and password credentials',
    args: {
      email: t.arg.string({ required: true, description: 'User email address' }),
      password: t.arg.string({
        required: true,
        description: 'Plaintext password (minimum 8 characters)',
      }),
    },
    validate: {
      schema: signupRequestSchema,
    },
    resolve: async (_root, args, ctx) => {
      return ctx.services.auth.signup(args);
    },
  })
);

builder.mutationField('login', (t) =>
  t.field({
    type: AuthPayloadType,
    description: 'Authenticate an existing user account and issue token pair',
    args: {
      email: t.arg.string({ required: true, description: 'Registered user email address' }),
      password: t.arg.string({ required: true, description: 'Account password' }),
    },
    validate: {
      schema: loginRequestSchema,
    },
    resolve: async (_root, args, ctx) => {
      return ctx.services.auth.login(args);
    },
  })
);

builder.mutationField('refreshToken', (t) =>
  t.field({
    type: AuthPayloadType,
    description: 'Rotate a refresh token to generate a new access token and rotating refresh token',
    args: {
      refreshToken: t.arg.string({ required: true, description: 'Current active refresh token' }),
    },
    validate: {
      schema: z.object({ refreshToken: z.string().min(1) }),
    },
    resolve: async (_root, args, ctx) => {
      return ctx.services.auth.refresh(args.refreshToken);
    },
  })
);
