/**
 * @file CLI generator scaffolding full vertical slice modules with schemas, repository, service, routes, and tests.
 * @module scripts/generate-module
 */

import fs from 'node:fs';
import path from 'node:path';

const moduleName = process.argv[2];

if (!moduleName) {
  console.error('Usage: pnpm gen:module <name>');
  console.error('Example: pnpm gen:module posts');
  process.exit(1);
}

const cleanName = moduleName.toLowerCase().replace(/[^a-z0-9_-]/g, '');
const pascalName = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
const singularPascal = pascalName.endsWith('s') ? pascalName.slice(0, -1) : pascalName;
const singularLower = singularPascal.toLowerCase();

const moduleDir = path.resolve('src/modules', cleanName);
const testFile = path.resolve('test/modules', `${cleanName}.test.ts`);

if (fs.existsSync(moduleDir)) {
  console.error(`Error: Module directory ${moduleDir} already exists.`);
  process.exit(1);
}

fs.mkdirSync(moduleDir, { recursive: true });

// 1. Schemas
const schemasContent = `import { z } from 'zod';

export const ${singularLower}ResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string().nullable().optional(),
  userId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const create${singularPascal}RequestSchema = z.object({
  title: z.string().min(1).max(255),
  content: z.string().optional(),
});

export const update${singularPascal}RequestSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  content: z.string().optional(),
});

export type ${singularPascal}Response = z.infer<typeof ${singularLower}ResponseSchema>;
export type Create${singularPascal}Request = z.infer<typeof create${singularPascal}RequestSchema>;
export type Update${singularPascal}Request = z.infer<typeof update${singularPascal}RequestSchema>;
`;

// 2. Repository
const repositoryContent = `export interface ${singularPascal}Record {
  id: string;
  title: string;
  content: string | null;
  userId: string;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ${singularPascal}Repository {
  findById(id: string): Promise<${singularPascal}Record | null>;
  create(data: Omit<${singularPascal}Record, 'deletedAt' | 'createdAt' | 'updatedAt'>): Promise<${singularPascal}Record>;
  update(id: string, data: { title?: string | undefined; content?: string | undefined }): Promise<${singularPascal}Record>;
  softDelete(id: string): Promise<void>;
}
`;

// 3. Service
const serviceContent = `import { NotFoundError } from '#src/lib/errors.js';
import { generateId } from '#src/lib/id.js';
import type { ${singularPascal}Repository, ${singularPascal}Record } from './repository.js';
import type { Create${singularPascal}Request, Update${singularPascal}Request } from './schemas.js';

export class ${singularPascal}Service {
  constructor(private readonly repo: ${singularPascal}Repository) {}

  async getById(id: string): Promise<${singularPascal}Record> {
    const record = await this.repo.findById(id);
    if (!record || record.deletedAt) {
      throw new NotFoundError('${singularPascal} not found');
    }
    return record;
  }

  async create(userId: string, input: Create${singularPascal}Request): Promise<${singularPascal}Record> {
    const id = generateId('${singularLower}');
    return this.repo.create({
      id,
      title: input.title,
      content: input.content ?? null,
      userId,
    });
  }

  async update(id: string, input: Update${singularPascal}Request): Promise<${singularPascal}Record> {
    await this.getById(id);
    return this.repo.update(id, input);
  }

  async delete(id: string): Promise<void> {
    await this.getById(id);
    await this.repo.softDelete(id);
  }
}
`;

// 4. Routes
const routesContent = `import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { UnauthorizedError } from '#src/lib/errors.js';
import type { ${singularPascal}Repository } from './repository.js';
import {
  create${singularPascal}RequestSchema,
  ${singularLower}ResponseSchema,
  update${singularPascal}RequestSchema,
} from './schemas.js';
import { ${singularPascal}Service } from './service.js';

export function create${pascalName}Routes(repo: ${singularPascal}Repository): FastifyPluginAsyncZod {
  return async (app) => {
    const service = new ${singularPascal}Service(repo);

    app.get(
      '/${cleanName}/:id',
      {
        schema: {
          tags: ['${pascalName}'],
          summary: 'Get ${singularPascal} by ID',
          params: z.object({ id: z.string() }),
          response: { 200: ${singularLower}ResponseSchema },
        },
      },
      async (request, reply) => {
        const item = await service.getById(request.params.id);
        return reply.send(item);
      }
    );

    app.post(
      '/${cleanName}',
      {
        preHandler: [app.authenticate as never],
        schema: {
          tags: ['${pascalName}'],
          summary: 'Create new ${singularPascal}',
          security: [{ bearerAuth: [] }],
          body: create${singularPascal}RequestSchema,
          response: { 201: ${singularLower}ResponseSchema },
        },
      },
      async (request, reply) => {
        const user = request.user;
        if (!user) throw new UnauthorizedError('Authentication required');
        const item = await service.create(user.id, request.body);
        return reply.status(201).send(item);
      }
    );
  };
}
`;

// 5. Test
const testContent = `import { beforeEach, describe, expect, it } from 'vitest';
import type { ${singularPascal}Repository, ${singularPascal}Record } from '#src/modules/${cleanName}/repository.js';
import { ${singularPascal}Service } from '#src/modules/${cleanName}/service.js';
import { NotFoundError } from '#src/lib/errors.js';

class InMemory${singularPascal}Repository implements ${singularPascal}Repository {
  public items: Map<string, ${singularPascal}Record> = new Map();

  async findById(id: string): Promise<${singularPascal}Record | null> {
    return this.items.get(id) ?? null;
  }

  async create(data: Omit<${singularPascal}Record, 'deletedAt' | 'createdAt' | 'updatedAt'>): Promise<${singularPascal}Record> {
    const record: ${singularPascal}Record = {
      ...data,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.items.set(data.id, record);
    return record;
  }

  async update(id: string, data: { title?: string | undefined; content?: string | undefined }): Promise<${singularPascal}Record> {
    const item = this.items.get(id);
    if (!item) throw new Error('Not found');
    const updated = {
      ...item,
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.content !== undefined ? { content: data.content } : {}),
      updatedAt: new Date(),
    };
    this.items.set(id, updated);
    return updated;
  }

  async softDelete(id: string): Promise<void> {
    const item = this.items.get(id);
    if (item) item.deletedAt = new Date();
  }
}

describe('${singularPascal}Service', () => {
  let repo: InMemory${singularPascal}Repository;
  let service: ${singularPascal}Service;

  beforeEach(() => {
    repo = new InMemory${singularPascal}Repository();
    service = new ${singularPascal}Service(repo);
  });

  it('creates and fetches a ${singularLower}', async () => {
    const created = await service.create('usr_1', { title: 'Test ${singularPascal}' });
    expect(created.id).toBeDefined();
    expect(created.title).toBe('Test ${singularPascal}');

    const fetched = await service.getById(created.id);
    expect(fetched.id).toBe(created.id);
  });

  it('throws NotFoundError for non-existent record', async () => {
    await expect(service.getById('non_existent')).rejects.toThrow(NotFoundError);
  });
});
`;

// 6. GraphQL Types & Resolvers
const graphqlContent = `import { builder } from '#src/graphql/builder.js';
import type { ${singularPascal}Record } from './repository.js';

export const ${singularPascal}Type = builder.objectRef<${singularPascal}Record>('${singularPascal}').implement({
  description: '${singularPascal} entity',
  fields: (t) => ({
    id: t.exposeID('id'),
    title: t.exposeString('title'),
    content: t.exposeString('content', { nullable: true }),
    userId: t.exposeString('userId'),
    createdAt: t.expose('createdAt', { type: 'Date' }),
    updatedAt: t.expose('updatedAt', { type: 'Date' }),
  }),
});

builder.queryField('${singularLower}', (t) =>
  t.field({
    type: ${singularPascal}Type,
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
`;

fs.writeFileSync(path.join(moduleDir, 'schemas.ts'), schemasContent, 'utf8');
fs.writeFileSync(path.join(moduleDir, 'repository.ts'), repositoryContent, 'utf8');
fs.writeFileSync(path.join(moduleDir, 'service.ts'), serviceContent, 'utf8');
fs.writeFileSync(path.join(moduleDir, 'routes.ts'), routesContent, 'utf8');
fs.writeFileSync(path.join(moduleDir, 'graphql.ts'), graphqlContent, 'utf8');
fs.writeFileSync(testFile, testContent, 'utf8');

process.stdout.write(
  `Successfully generated module "${cleanName}" in src/modules/${cleanName} (REST + GraphQL) and test in test/modules/${cleanName}.test.ts\n`
);
