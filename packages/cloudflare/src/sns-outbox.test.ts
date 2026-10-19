import { describe, expect, it } from 'vitest';
import type { SocialPostDraft } from '@alneas/sitekit';
import { createD1SocialOutbox } from './sns-outbox.js';
import type { CloudflareD1Database, CloudflareD1Statement } from './types.js';

type Row = Record<string, unknown>;

class OutboxD1 implements CloudflareD1Database {
  rows = new Map<string, Map<string, Row>>();

  prepare(query: string): CloudflareD1Statement {
    const database = this;
    let values: unknown[] = [];
    const statement: CloudflareD1Statement = {
      bind: (...bound) => { values = bound; return statement; },
      async all<T>() { return { results: database.select(query, values) as T[] }; },
      async first<T>() { return (database.select(query, values)[0] ?? null) as T | null; },
      async run() { return database.runQuery(query, values); },
    };
    return statement;
  }

  private table(name: string): Map<string, Row> {
    let table = this.rows.get(name);
    if (!table) { table = new Map(); this.rows.set(name, table); }
    return table;
  }

  private select(query: string, values: unknown[]): Row[] {
    const tableName = query.match(/FROM ([A-Za-z_][A-Za-z0-9_]*)/)?.[1] ?? '';
    let rows = [...this.table(tableName).values()];
    if (query.includes('idempotency_key = ?')) rows = rows.filter(row => row.idempotency_key === values[0]);
    if (query.includes('status = ?')) rows = rows.filter(row => row.status === values[query.includes('idempotency_key = ?') ? 1 : 0]);
    if (query.includes('id = ?')) rows = rows.filter(row => row.id === values[0]);
    return rows;
  }

  private runQuery(query: string, values: unknown[]): { meta: { changes: number } } {
    const insert = query.match(/^INSERT INTO ([A-Za-z_][A-Za-z0-9_]*) \(([^)]+)\)/);
    if (insert) {
      const columns = insert[2]!.split(', ');
      const row = Object.fromEntries(columns.map((column, index) => [column, values[index]]));
      this.table(insert[1]!).set(String(row.id), row);
      return { meta: { changes: 1 } };
    }

    const update = query.match(/^UPDATE ([A-Za-z_][A-Za-z0-9_]*) SET (.+) WHERE id = \?/);
    if (update) {
      const table = this.table(update[1]!);
      const atomicClaim = query.endsWith('AND status = ?');
      const id = String(values.at(atomicClaim ? -2 : -1));
      const row = table.get(id);
      if (!row) return { meta: { changes: 0 } };
      if (atomicClaim && row.status !== values.at(-1)) return { meta: { changes: 0 } };
      const assignments = update[2]!.split(', ').map(assignment => assignment.split(' = ')[0]!);
      assignments.forEach((column, index) => { row[column] = values[index]; });
      table.set(id, row);
      return { meta: { changes: 1 } };
    }
    return { meta: { changes: 0 } };
  }
}

const draft: SocialPostDraft = {
  id: 'post-1', platform: 'instagram', text: 'New article', media: [], idempotencyKey: 'post-1:instagram',
};

describe('D1 social outbox', () => {
  it('deduplicates, claims and records delivery history', async () => {
    const database = new OutboxD1();
    const outbox = createD1SocialOutbox({ database });

    await expect(outbox.enqueue(draft)).resolves.toMatchObject({ status: 'queued', idempotencyKey: draft.idempotencyKey });
    await expect(outbox.publish(draft)).resolves.toMatchObject({ status: 'queued', idempotencyKey: draft.idempotencyKey });
    const claimed = await outbox.claim();
    expect(claimed).toHaveLength(1);
    expect(claimed[0]).toMatchObject({ status: 'publishing', attempt: 1 });

    await expect(outbox.recordDelivery(draft.idempotencyKey, {
      status: 'published', platform: 'instagram', idempotencyKey: draft.idempotencyKey,
      externalId: 'remote-1',
    })).resolves.toMatchObject({ status: 'published' });
    expect(database.rows.get('social_delivery_history')?.size).toBe(1);
    await expect(outbox.list()).resolves.toHaveLength(1);
  });
});
