import { beforeEach, describe, expect, it } from 'vitest';
import type { PostRepository, PostRecord } from '#src/modules/posts/repository.js';
import { PostService } from '#src/modules/posts/service.js';
import { ForbiddenError, NotFoundError } from '#src/lib/errors.js';
import { createPaginatedResponse, decodeCursor } from '#src/lib/pagination.js';
import type { CursorPaginatedResponse } from '#src/lib/pagination.js';
import type { ListPostsQuery } from '#src/modules/posts/schemas.js';

class InMemoryPostRepository implements PostRepository {
  public items: Map<string, PostRecord> = new Map();

  async listPosts(query: ListPostsQuery): Promise<CursorPaginatedResponse<PostRecord>> {
    const limit = query.limit ?? 20;
    const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;
    const records = [...this.items.values()]
      .filter((item) => {
        if (item.deletedAt) return false;
        if (!cursor) return true;
        const dateDifference = item.createdAt.getTime() - Date.parse(cursor.createdAt);
        return dateDifference < 0 || (dateDifference === 0 && item.id < cursor.id);
      })
      .sort(
        (a, b) =>
          b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id)
      )
      .slice(0, limit + 1);

    return createPaginatedResponse(
      records,
      limit,
      records.length > limit,
      query.cursor !== undefined
    );
  }

  async findById(id: string): Promise<PostRecord | null> {
    return this.items.get(id) ?? null;
  }

  async create(data: Omit<PostRecord, 'deletedAt' | 'createdAt' | 'updatedAt'>): Promise<PostRecord> {
    const record: PostRecord = {
      ...data,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.items.set(data.id, record);
    return record;
  }

  async update(id: string, data: { title?: string | undefined; content?: string | undefined }): Promise<PostRecord> {
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

describe('PostService', () => {
  let repo: InMemoryPostRepository;
  let service: PostService;

  beforeEach(() => {
    repo = new InMemoryPostRepository();
    service = new PostService(repo);
  });

  it('creates and fetches a post', async () => {
    const created = await service.create('usr_1', { title: 'Test Post' });
    expect(created.id).toBeDefined();
    expect(created.title).toBe('Test Post');

    const fetched = await service.getById(created.id);
    expect(fetched.id).toBe(created.id);
  });

  it('throws NotFoundError for non-existent record', async () => {
    await expect(service.getById('non_existent')).rejects.toThrow(NotFoundError);
  });

  it('lists posts with pagination metadata', async () => {
    await service.create('usr_1', { title: 'First Post' });
    await service.create('usr_1', { title: 'Second Post' });

    const result = await service.listPosts({ limit: 1 });

    expect(result.items).toHaveLength(1);
    expect(['First Post', 'Second Post']).toContain(result.items[0]?.title);
    expect(result.pageInfo.hasMore).toBe(true);
    expect(result.pageInfo.nextCursor).toBeTruthy();

    const nextPage = await service.listPosts({
      limit: 1,
      cursor: result.pageInfo.nextCursor ?? undefined,
    });
    expect(nextPage.items).toHaveLength(1);
    expect(nextPage.items[0]?.id).not.toBe(result.items[0]?.id);
    expect(nextPage.pageInfo.hasMore).toBe(false);
  });

  it('allows only the author or an admin to edit and delete a post', async () => {
    const post = await service.create('author_1', { title: 'Owned Post' });

    await expect(
      service.update(post.id, 'other_user', 'user', { title: 'Not allowed' })
    ).rejects.toThrow(ForbiddenError);
    await expect(service.delete(post.id, 'other_user', 'user')).rejects.toThrow(
      ForbiddenError
    );

    await expect(
      service.update(post.id, 'author_1', 'user', { title: 'Updated by author' })
    ).resolves.toMatchObject({ title: 'Updated by author' });
    await expect(service.delete(post.id, 'admin_1', 'admin')).resolves.toBeUndefined();
    await expect(service.getById(post.id)).rejects.toThrow(NotFoundError);
  });

  it('allows an admin to edit another user’s post', async () => {
    const post = await service.create('author_1', { title: 'Owned Post' });

    await expect(
      service.update(post.id, 'admin_1', 'admin', { title: 'Admin edit' })
    ).resolves.toMatchObject({ title: 'Admin edit' });
  });
});
