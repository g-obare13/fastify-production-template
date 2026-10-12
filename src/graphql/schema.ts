/**
 * @file Compiled executable GraphQL schema generated from Pothos type definitions.
 * @module graphql/schema
 */

import { builder } from './builder.js';
import '#src/graphql/types/file.js';
import '#src/graphql/types/user.js';
import '#src/graphql/types/auth.js';
import '#src/graphql/types/queries.js';
import '#src/graphql/types/files-mutations.js';
import '#src/graphql/types/subscriptions.js';

/** Compiled executable GraphQL schema. */
export const schema = builder.toSchema();
