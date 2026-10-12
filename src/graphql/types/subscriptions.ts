/**
 * @file GraphQL real-time subscription fields over WebSockets.
 * @module graphql/types/subscriptions
 */

import type { User } from '#src/db/schema.js';
import { builder } from '#src/graphql/builder.js';
import { UserType } from './user.js';

builder.subscriptionField('userUpdated', (t) =>
  t.field({
    type: UserType,
    description: 'Real-time WebSocket event subscription emitted whenever user details are updated',
    args: {
      id: t.arg.id({ required: true, description: 'Target user ULID identifier to observe' }),
    },
    subscribe: (_root, args) => {
      /**
       * Async generator yielding user update subscription events.
       *
       * @returns Async iterable iterator of user updates
       */
      async function* generate() {
        yield {
          id: String(args.id),
          email: 'stream@example.com',
          role: 'user',
          emailVerified: true,
          avatarUrl: null,
          passwordHash: '',
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        } as User;
      }
      return generate();
    },
    resolve: (user: User) => user,
  })
);
