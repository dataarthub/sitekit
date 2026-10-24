import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { MarketingDatabase, MarketingStatement } from './index.js';
import { it, expect } from 'vitest';

// A test-only transport shim: SQL, uniqueness, rollback and persistence use SQLite itself.
export function sqliteBinding(db: DatabaseSync): MarketingDatabase {
  class Statement implements MarketingStatement {
    constructor(readonly sql: string, readonly values: SQLInputValue[] = []) {}
    bind(...values: unknown[]) { return new Statement(this.sql, values as SQLInputValue[]); }
    async first<T>() { return (db.prepare(this.sql).get(...this.values) ?? null) as T | null; }
    async all<T>() { return { results: db.prepare(this.sql).all(...this.values) as T[] }; }
    async run() { const result = db.prepare(this.sql).run(...this.values); return { meta: { changes: Number(result.changes) } }; }
  }
  return {
    prepare: sql => new Statement(sql),
    async batch(statements) {
      db.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.all<Record<string, unknown>>());
        db.exec('COMMIT');
        return results;
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
  };
}
it('executes SQLite constraints rather than simulating record behavior', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE test (id TEXT PRIMARY KEY)');
  db.prepare('INSERT INTO test VALUES (?)').run('same');
  expect(() => db.prepare('INSERT INTO test VALUES (?)').run('same')).toThrow();
  db.close();
});
