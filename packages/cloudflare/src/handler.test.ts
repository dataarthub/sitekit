import { describe, expect, it } from 'vitest';
import { computeSiteSnapshotChecksum } from '@alneas/sitekit';
import { createSnapshotProjectionHandler, signSnapshotProjectionRequest } from './handler.js';
import type { CloudflareD1Database, CloudflareD1Statement, CloudflareR2Bucket } from './types.js';

type Revision = {
  site_id: string;
  revision: string;
  manifest_json: string;
  content_key: string;
  media_key: string;
  status: string;
};

class MemoryD1 implements CloudflareD1Database {
  revisions = new Map<string, Revision>();
  heads = new Map<string, { revision: string; promoted_at: string }>();

  prepare(query: string): CloudflareD1Statement {
    const database = this;
    let values: unknown[] = [];
    return {
      bind(...boundValues) {
        values = boundValues;
        return this;
      },
      async first<T>() {
        if (query.includes('SELECT revision FROM site_snapshot_revisions')) {
          const [siteId, revision] = values as [string, string];
          const row = database.revisions.get(`${siteId}/${revision}`);
          return (row?.status === 'staged' ? { revision: row.revision } : null) as T | null;
        }
        if (query.includes('SELECT r.manifest_json')) {
          const siteId = values[0] as string;
          const head = database.heads.get(siteId);
          const row = head ? database.revisions.get(`${siteId}/${head.revision}`) : undefined;
          return (row ? { manifest_json: row.manifest_json } : null) as T | null;
        }
        return null;
      },
      async run() {
        if (query.includes('INSERT INTO site_snapshot_revisions')) {
          const [siteId, revision, manifestJson, contentKey, mediaKey] = values as [string, string, string, string, string];
          database.revisions.set(`${siteId}/${revision}`, {
            site_id: siteId,
            revision,
            manifest_json: manifestJson,
            content_key: contentKey,
            media_key: mediaKey,
            status: 'staged',
          });
        } else if (query.includes('INSERT INTO site_projection_heads')) {
          const [siteId, revision, promotedAt] = values as [string, string, string];
          database.heads.set(siteId, { revision, promoted_at: promotedAt });
        } else if (query.includes('UPDATE site_snapshot_revisions')) {
          const [siteId, revision] = values as [string, string];
          const row = database.revisions.get(`${siteId}/${revision}`);
          if (row) row.status = 'promoted';
        }
        return {};
      },
    };
  }
}

class MemoryR2 implements CloudflareR2Bucket {
  objects = new Map<string, string>();

  async get(key: string) {
    const value = this.objects.get(key);
    return value === undefined ? null : { text: async () => value };
  }

  async put(key: string, value: string) {
    this.objects.set(key, value);
  }
}

const reference = {
  manifest: {
    schemaVersion: '1',
    siteId: 'site-1',
    revision: 'rev-1',
    generatedAt: '2026-09-18T00:00:00.000Z',
    contentVersion: 'content-1',
    mediaVersion: 'media-1',
    checksum: 'sha256:test',
    locales: ['ja'],
  },
  manifestUrl: 'https://eaos.example/snapshots/site-1/rev-1/manifest.json',
  contentUrl: 'https://eaos.example/snapshots/site-1/rev-1/content.json',
  mediaUrl: 'https://eaos.example/snapshots/site-1/rev-1/media.json',
};

describe('snapshot projection handler', () => {
  it('authenticates, stages, promotes and returns a publication event', async () => {
    const database = new MemoryD1();
    const bucket = new MemoryR2();
    const handler = createSnapshotProjectionHandler({
      bindings: () => ({ database, bucket, hmacSecret: 'test-secret' }),
      allowedOrigins: ['https://eaos.example'],
      fetch: async url => ({
        ok: true,
        status: 200,
        text: async () => url.endsWith('/manifest.json')
          ? JSON.stringify({ ...reference.manifest, checksum: await computeSiteSnapshotChecksum('[]', '[]') })
          : '[]',
      }),
      now: () => '2026-09-18T00:01:00.000Z',
    });
    const publication = {
      ...reference,
      manifest: { ...reference.manifest, checksum: await computeSiteSnapshotChecksum('[]', '[]') },
    };
    const body = JSON.stringify(publication);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = await signSnapshotProjectionRequest('test-secret', timestamp, body);

    const response = await handler(new Request('https://edge.example/internal/site-snapshots', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-eaos-protocol-version': '1',
        'x-eaos-timestamp': timestamp,
        'x-eaos-signature': signature,
      },
      body,
    }), {});

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      siteId: 'site-1',
      revision: 'rev-1',
      idempotencyKey: 'site-1:rev-1',
    });
    expect(database.heads.get('site-1')?.revision).toBe('rev-1');
  });

  it('rejects stale or invalid signatures before projection', async () => {
    const handler = createSnapshotProjectionHandler({
      bindings: () => ({ database: new MemoryD1(), bucket: new MemoryR2(), hmacSecret: 'test-secret' }),
    });
    const response = await handler(new Request('https://edge.example/internal/site-snapshots', {
      method: 'POST',
      headers: {
        'x-eaos-protocol-version': '1',
        'x-eaos-timestamp': String(Math.floor(Date.now() / 1000) - 301),
        'x-eaos-signature': 'invalid',
      },
      body: '{}',
    }), {});

    expect(response.status).toBe(401);
  });
});
