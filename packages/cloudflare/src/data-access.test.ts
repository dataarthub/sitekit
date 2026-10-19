import { describe, expect, it } from 'vitest';
import { createD1DataAccessAdapter, type CloudflareDataQueryOptions } from './data-access.js';
import type { CloudflareD1Database, CloudflareD1Statement } from './types.js';

class RecordingStatement implements CloudflareD1Statement {
  constructor(
    private readonly result: { rows?: Record<string, unknown>[]; first?: Record<string, unknown> | null },
    private readonly record: { sql: string; values: unknown[] },
  ) {}

  bind(...values: unknown[]): CloudflareD1Statement {
    this.record.values = values;
    return this;
  }

  async first<T>(): Promise<T | null> {
    return (this.result.first ?? this.result.rows?.[0] ?? null) as T | null;
  }

  async all<T>(): Promise<{ results: T[] }> {
    return { results: (this.result.rows ?? []) as T[] };
  }

  async run(): Promise<unknown> {
    return { success: true };
  }
}

class RecordingD1 implements CloudflareD1Database {
  calls: { sql: string; values: unknown[] }[] = [];
  next = { rows: [] as Record<string, unknown>[], first: null as Record<string, unknown> | null };

  prepare(query: string): CloudflareD1Statement {
    const call = { sql: query, values: [] as unknown[] };
    this.calls.push(call);
    return new RecordingStatement(this.next, call);
  }
}

describe('D1 data access adapter', () => {
  it('builds parameterized queries compatible with app-core content adapters', async () => {
    const db = new RecordingD1();
    db.next.rows = [{ id: 'post-1', status: 'published' }];
    const adapter = createD1DataAccessAdapter(db, { cacheScope: 'site:test' });

    const result = await adapter.find('posts', {
      status: 'published',
      score: { $gte: 10 },
    }, {
      sort: { published_at: -1 },
      limit: 10,
      projection: ['id', 'status'],
    });

    expect(result).toEqual([{ id: 'post-1', status: 'published' }]);
    expect(db.calls[0]).toEqual({
      sql: 'SELECT id, status FROM posts WHERE status = ? AND score >= ? ORDER BY published_at DESC LIMIT 10',
      values: ['published', 10],
    });
    expect(adapter.cacheScope).toBe('site:test');
  });

  it('is read-only by default and allows explicit authoring mode', async () => {
    const db = new RecordingD1();
    const readOnly = createD1DataAccessAdapter(db, { idFactory: () => 'created-1' });
    await expect(readOnly.create('posts', { title: 'Draft' })).rejects.toThrow('read-only');

    const writable = createD1DataAccessAdapter(db, {
      readOnly: false,
      idFactory: () => 'created-1',
    });
    db.next.first = { id: 'created-1', title: 'Draft' };
    await expect(writable.create('posts', { title: 'Draft' })).resolves.toEqual({
      id: 'created-1',
      title: 'Draft',
    });
    expect(db.calls[0]?.sql).toBe('INSERT INTO posts (title, id) VALUES (?, ?)');
    expect(db.calls[0]?.values).toEqual(['Draft', 'created-1']);
  });

  it('rejects unsafe identifiers and unsupported filters', async () => {
    const db = new RecordingD1();
    const adapter = createD1DataAccessAdapter(db);
    await expect(adapter.find('posts; DROP TABLE posts', {})).rejects.toThrow('Invalid D1 table identifier');
    await expect(adapter.find('posts', { title: { $regex: 'draft' } })).rejects.toThrow('Unsupported D1 filter operator');
  });

  it('supports count and pagination options', async () => {
    const db = new RecordingD1();
    db.next.first = { count: 3 };
    const adapter = createD1DataAccessAdapter(db);
    await expect(adapter.count('posts', { status: { $in: ['published', 'draft'] } }, {
      skip: 2,
    } satisfies CloudflareDataQueryOptions)).resolves.toBe(3);
    expect(db.calls[0]?.sql).toBe('SELECT COUNT(*) AS count FROM posts WHERE status IN (?, ?)');
    expect(db.calls[0]?.values).toEqual(['published', 'draft']);
  });
});
