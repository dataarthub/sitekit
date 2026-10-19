import assert from 'node:assert/strict';
import { Database } from 'bun:sqlite';
import { contentStudioSchemaSql } from '@alneas/sitekit-cloudflare';
import { createContentStudioHandler } from '@alneas/sitekit-cloudflare/studio-handler';
import { createHttpStudioProvider } from '@alneas/sitekit/studio/http-provider';
import { createD1ContentStudioProvider } from '@alneas/sitekit-cloudflare/studio';

const db = new Database(':memory:');
db.exec(contentStudioSchemaSql);
const database = { prepare(sql) {
  let values = [];
  return {
    bind(...input) { values = input; return this; },
    async all() { return { results: db.query(sql).all(...values) }; },
    async first() { return db.query(sql).get(...values); },
    async run() { return db.query(sql).run(...values); },
  };
} };
try {
  const direct = createD1ContentStudioProvider({ database });
  const handler = createContentStudioHandler({ bindings: () => direct, authorize: () => true });
  const provider = createHttpStudioProvider({ fetch: (url, init) => handler(new Request(new URL(String(url), 'https://site.example'), init), {}) });
  const saved = await provider.saveDraft({ id: '', collection: 'posts', locale: 'ja', slug: 'hello', title: 'First draft', summary: '', body: '# Markdown', tags: [], data: {}, status: 'draft' });
  assert(saved.id && saved.createdAt, 'New draft must satisfy the public schema');
  const updated = await provider.saveDraft({ ...saved, title: 'Updated' }, { expectedModifiedAt: saved.modifiedAt });
  assert.equal(updated.createdAt, saved.createdAt);
  const published = await provider.publish(saved.id);
  assert.equal(published.status, 'published');
  const reconnected = createD1ContentStudioProvider({ database });
  assert.equal((await reconnected.get(saved.id)).title, 'Updated');
  assert.equal((await reconnected.list({ collection: 'posts', search: 'Updated' })).items.length, 1);
  console.log('Public HTTP client + handler + real SQLite schema: create, update, publish and reconnect persistence passed');
} finally { db.close(); }
