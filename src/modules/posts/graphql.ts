/**
 * @file GraphQL Post type and query field definitions.
 * @module modules/posts/graphql
 */

import { builder } from '#src/graphql/builder.js';
import type { PostRecord } from './repository.js';

/** GraphQL object type for a post. */
export const PostType = builder.objectRef<PostRecord>('Post').implement({
  description: 'Post entity',
  fields: (t) => ({
    id: t.exposeID('id'),
    title: t.exposeString('title'),
    content: t.exposeString('content', { nullable: true }),
    userId: t.exposeString('userId'),
    createdAt: t.string({
      description: 'Timestamp when the post was created (ISO 8601 UTC)',
      resolve: (post) => post.createdAt.toISOString(),
    }),
    updatedAt: t.string({
      description: 'Timestamp when the post was last modified (ISO 8601 UTC)',
      resolve: (post) => post.updatedAt.toISOString(),
    }),
  }),
});

builder.queryField('post', (t) =>
  t.field({
    type: PostType,
    nullable: true,
    args: {
      id: t.arg.string({ required: true }),
    },
    resolve: async (_root, _args, _ctx) => {
      // Resolve using module service or data loader
      return null;
    },
  })
);
