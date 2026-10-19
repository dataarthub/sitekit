import { describe, expect, it } from 'vitest';
import { createD1ContentStudioProvider } from './studio.js';
import type { CloudflareD1Database, CloudflareD1Statement } from './types.js';

class StudioD1 implements CloudflareD1Database {
  calls: string[] = [];
  rows = [{ id: 'post-1', collection: 'posts', locale: 'ja', slug: 'hello', title: 'Hello', body: '# Hello', tags: '[]', data: '{}', status: 'draft', modified_at: '2026-09-19T00:00:00.000Z' }];

  prepare(query: string): CloudflareD1Statement {
    this.calls.push(query);
    const database = this;
    return {
      bind() { return this; },
      async all<T>() { return { results: database.rows as T[] }; },
      async first<T>() { return database.rows[0] as T ?? null; },
      async run() { return { success: true }; },
    };
  }
}

describe('D1 Content Studio provider', () => {
  it('implements the shared provider contract without EAOS', async () => {
    const db = new StudioD1();
    const provider = createD1ContentStudioProvider({ database: db });
    const result = await provider.list({ collection: 'posts', locale: 'ja', search: 'hello' });
    expect(result.items[0]).toMatchObject({ id: 'post-1', title: 'Hello', status: 'draft' });
    expect(db.calls[0]).toContain('SELECT');
  });

  it('returns a stable keyset cursor for subsequent pages', async () => {
    const db = new StudioD1();
    db.rows = [
      { ...db.rows[0], id: 'post-2', modified_at: '2026-09-20T00:00:00.000Z' },
      db.rows[0],
    ];
    const provider = createD1ContentStudioProvider({ database: db });
    const result = await provider.list({ collection: 'posts', limit: 1 });
    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).toBeTypeOf('string');
    await provider.list({ collection: 'posts', limit: 1, cursor: result.nextCursor });
    expect(db.calls.at(-1)).toContain('modified_at < ?');
  });
});
