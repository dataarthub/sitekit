import { describe, expect, it } from 'vitest';
import { createR2MediaLibraryAdapter } from './media-library.js';
import type { CloudflareD1Database, CloudflareD1Statement, CloudflareR2Bucket } from './types.js';

type Row = Record<string, unknown>;

class MediaD1 implements CloudflareD1Database {
  rows = new Map<string, Row>();
  prepare(query: string): CloudflareD1Statement {
    const database = this;
    let values: unknown[] = [];
    const select = () => {
      const rows = [...this.rows.values()];
      if (query.includes('WHERE id = ?')) return rows.filter(row => row.id === values[0]);
      return rows;
    };
    const statement: CloudflareD1Statement = {
      bind: (...bound) => { values = bound; return statement; },
      async all<T>() { return { results: select() as T[] }; },
      async first<T>() { return (select()[0] ?? null) as T | null; },
      async run() {
        if (query.startsWith('INSERT INTO')) {
          const columns = query.slice(query.indexOf('(') + 1, query.indexOf(')')).split(', ');
          database.rows.set(String(values[0]), Object.fromEntries(columns.map((column, index) => [column, values[index]])));
        } else if (query.startsWith('UPDATE')) {
          const id = String(values.at(-1));
          const row = database.rows.get(id);
          if (row) row.asset_json = values[0];
        } else if (query.startsWith('DELETE')) {
          database.rows.delete(String(values[0]));
        }
        return {};
      },
    };
    return statement;
  }
}

class MediaR2 implements CloudflareR2Bucket {
  objects = new Map<string, string | Uint8Array>();
  async get(key: string) { return this.objects.has(key) ? { text: async () => String(this.objects.get(key)) } : null; }
  async put(key: string, value: string | ArrayBuffer | Uint8Array | Blob) { this.objects.set(key, value instanceof Uint8Array || typeof value === 'string' ? value : String(value)); }
  async delete(key: string) { this.objects.delete(key); }
}

describe('R2 media library adapter', () => {
  it('keeps R2 bytes and D1 metadata together for list, update and delete', async () => {
    const database = new MediaD1();
    const bucket = new MediaR2();
    const library = createR2MediaLibraryAdapter(bucket, {
      database, baseUrl: 'https://cdn.example', idFactory: () => 'asset-1.webp',
    });
    const asset = await library.upload({ fileName: 'hero.webp', contentType: 'image/webp', body: 'bytes', alt: 'Hero', metadata: { source: 'sample' } });
    expect(await library.getMedia({ id: asset.id })).toMatchObject({ id: asset.id, alt: 'Hero' });
    expect(await library.listMedia({ tags: [], limit: 10 })).toHaveLength(1);
    await expect(library.updateMetadata(asset.id, { alt: 'Updated', tags: ['hero'] })).resolves.toMatchObject({ alt: 'Updated', tags: ['hero'] });
    await expect(library.delete(asset.id)).resolves.toBe(true);
    expect(bucket.objects.size).toBe(0);
    expect(await library.getMedia({ id: asset.id })).toBeNull();
  });
});
