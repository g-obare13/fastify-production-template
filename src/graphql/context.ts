/**
 * @file GraphQL execution context definition.
 * @module graphql/context
 */

import type { FastifyBaseLogger } from 'fastify';
import type { AuthService } from '#src/modules/auth/service.js';
import type { FilesService } from '#src/modules/files/service.js';
import type { UsersService } from '#src/modules/users/service.js';
import type { UserSession } from '#src/types/fastify.d.js';
import type { Loaders } from './loaders.js';

/** Execution context supplied to every GraphQL resolver. */
export interface GraphQLContext {
  user: UserSession | null;
  requestId: string;
  log: FastifyBaseLogger;
  loaders: Loaders;
  services: {
    auth: AuthService;
    users: UsersService;
    files: FilesService;
  };
}
