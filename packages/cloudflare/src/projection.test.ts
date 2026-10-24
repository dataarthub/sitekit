import { describe, expect, it } from 'vitest';
import { buildSiteSnapshot, computeSiteSnapshotChecksum } from '@alneas/sitekit';
import { createD1R2SiteSnapshotProjection } from './projection.js';
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
        if (query.includes("status IN ('staged', 'promoted')")) {
          const [siteId, revision] = values as [string, string];
          const row = database.revisions.get(`${siteId}/${revision}`);
          return (row && (row.status === 'staged' || row.status === 'promoted')
            ? { revision: row.revision } : null) as T | null;
        }
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
        if (query.includes('SELECT * FROM site_snapshot_revisions')) {
          const [siteId, revision] = values as [string, string];
          return (database.revisions.get(`${siteId}/${revision}`) ?? null) as T | null;
        }
        if (query.includes('SELECT r.*')) {
          const siteId = values[0] as string;
          const head = database.heads.get(siteId);
          return (head ? database.revisions.get(`${siteId}/${head.revision}`) ?? null : null) as T | null;
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

describe('D1/R2 snapshot projection', () => {
  it('stages, promotes, and reads one immutable revision', async () => {
    const database = new MemoryD1();
    const bucket = new MemoryR2();
    const contentJson = JSON.stringify([{
      id: 'post-1',
      collection: 'posts',
      slug: 'hello',
      locale: 'ja',
      title: 'Hello',
      tags: ['news'],
      data: {},
    }]);
    const mediaJson = JSON.stringify([{
      id: 'image-1',
      url: 'https://cdn.example.test/image.webp',
      alt: 'A view',
      tags: ['hero'],
      metadata: {},
    }]);
    const checksum = await computeSiteSnapshotChecksum(contentJson, mediaJson);
    const projection = createD1R2SiteSnapshotProjection(database, bucket, {
      now: () => '2026-09-18T00:00:00.000Z',
      fetch: async url => ({
        ok: true,
        status: 200,
        text: async () => url === 'manifest.json'
          ? JSON.stringify({
            schemaVersion: '1',
            siteId: 'site-1',
            revision: 'rev-1',
            generatedAt: '2026-09-18T00:00:00.000Z',
            contentVersion: 'content-1',
            mediaVersion: 'media-1',
            checksum,
            locales: ['ja'],
          })
          : url === 'content.json' ? contentJson : mediaJson,
      }),
    });

    await projection.stage({
      manifest: {
        schemaVersion: '1',
        siteId: 'site-1',
        revision: 'rev-1',
        generatedAt: '2026-09-18T00:00:00.000Z',
        contentVersion: 'content-1',
        mediaVersion: 'media-1',
        checksum,
        locales: ['ja'],
      },
      manifestUrl: 'manifest.json',
      contentUrl: 'content.json',
      mediaUrl: 'media.json',
    });
    await projection.promote('site-1', 'rev-1');

    await expect(projection.getCurrentManifest('site-1')).resolves.toMatchObject({ revision: 'rev-1' });
    const snapshot = await projection.getSnapshot('site-1');
    expect(snapshot.manifest.revision).toBe('rev-1');
    await expect(snapshot.content.listCollection({ collection: 'posts' })).resolves.toHaveLength(1);
    const content = await projection.getContentAdapter('site-1');
    const media = await projection.getMediaAdapter('site-1');
    await expect(content.listCollection({ collection: 'posts' })).resolves.toHaveLength(1);
    await expect(media.getMedia({ id: 'image-1' })).resolves.toMatchObject({ alt: 'A view' });
    await projection.rollback('site-1', 'rev-1');
    await expect(projection.getCurrentManifest('site-1')).resolves.toMatchObject({ revision: 'rev-1' });
  });

  it('does not promote a revision that was not staged', async () => {
    const projection = createD1R2SiteSnapshotProjection(new MemoryD1(), new MemoryR2());
    await expect(projection.promote('site-1', 'missing')).rejects.toThrow('not staged');
  });

  it('rejects a payload whose checksum does not match the manifest', async () => {
    const projection = createD1R2SiteSnapshotProjection(new MemoryD1(), new MemoryR2(), {
      fetch: async url => ({
        ok: true,
        status: 200,
        text: async () => url === 'manifest.json'
          ? JSON.stringify({
            schemaVersion: '1',
            siteId: 'site-1',
            revision: 'rev-2',
            generatedAt: '2026-09-18T00:00:00.000Z',
            contentVersion: 'content-1',
            mediaVersion: 'media-1',
            checksum: 'sha256:wrong',
            locales: ['ja'],
          })
          : '[]',
      }),
    });
    await expect(projection.stage({
      manifest: {
        schemaVersion: '1',
        siteId: 'site-1',
        revision: 'rev-2',
        generatedAt: '2026-09-18T00:00:00.000Z',
        contentVersion: 'content-1',
        mediaVersion: 'media-1',
        checksum: 'sha256:wrong',
        locales: ['ja'],
      },
      manifestUrl: 'manifest.json',
      contentUrl: 'content.json',
      mediaUrl: 'media.json',
    })).rejects.toThrow('checksum mismatch');
  });
});


describe('stored projection delivery contracts', () => {
  async function fixture() {
    const database = new MemoryD1();
    const bucket = new MemoryR2();
    const payloads = new Map<string, string>();
    const projection = createD1R2SiteSnapshotProjection(database, bucket, {
      fetch: async url => ({ ok: true, status: 200, text: async () => payloads.get(url)! }),
    });
    async function stage(siteId: string, revision: string, visible = true) {
      const snapshot = await buildSiteSnapshot({
        siteId, revision, generatedAt: '2026-10-22T00:00:00.000Z',
        contentVersion: revision, mediaVersion: revision, locales: ['en'],
        content: visible ? [{ id: 'article', collection: 'posts', slug: 'article', locale: 'en', title: siteId, tags: [], data: {} }] : [],
        media: visible ? [{ id: 'image', url: 'https://cdn.example.test/' + siteId, alt: siteId, tags: [], metadata: {} }] : [],
      });
      const prefix = siteId + '/' + revision;
      payloads.set(prefix + '/content', snapshot.contentJson);
      payloads.set(prefix + '/media', snapshot.mediaJson);
      await projection.stage({ manifest: snapshot.manifest, contentUrl: prefix + '/content', mediaUrl: prefix + '/media' });
      return snapshot;
    }
    return { database, bucket, projection, stage };
  }

  for (const name of ['content', 'media']) {
    for (const damage of ['replace', 'remove']) {
      it(`rejects ${damage} of stored ${name} before any delivery adapter is returned`, async () => {
        const { bucket, projection, stage } = await fixture();
        await stage('site-a', 'rev-1');
        await projection.promote('site-a', 'rev-1');
        const key = `eaos-snapshots/site-a/rev-1/${name}.json`;
        if (damage === 'remove') bucket.objects.delete(key);
        else bucket.objects.set(key, '[]');
        await expect(projection.getSnapshot('site-a')).rejects.toThrow(/missing|checksum/i);
        await expect(projection.getContentAdapter('site-a')).rejects.toThrow(/missing|checksum/i);
        await expect(projection.getMediaAdapter('site-a')).rejects.toThrow(/missing|checksum/i);
      });
    }
  }

  it('withdraws content and media from the current head without changing another site or an explicitly pinned revision', async () => {
    const { projection, stage } = await fixture();
    await stage('site-a', 'rev-1');
    await stage('site-b', 'rev-1');
    await projection.promote('site-a', 'rev-1');
    await projection.promote('site-b', 'rev-1');
    await stage('site-a', 'rev-2', false);
    await projection.promote('site-a', 'rev-2');
    const current = await projection.getSnapshot('site-a');
    expect(current.manifest.revision).toBe('rev-2');
    await expect(current.content.getPage({ id: 'article' })).resolves.toBeNull();
    await expect(current.content.listCollection({ collection: 'posts' })).resolves.toEqual([]);
    await expect(current.media.getMedia({ id: 'image' })).resolves.toBeNull();
    const other = await projection.getSnapshot('site-b');
    await expect(other.content.getPage({ id: 'article' })).resolves.toMatchObject({ title: 'site-b' });
    const pinned = await projection.getSnapshot('site-a', 'rev-1');
    await expect(pinned.content.getPage({ id: 'article' })).resolves.toMatchObject({ title: 'site-a' });
    await expect(projection.getSnapshot('site-b', 'rev-2')).rejects.toThrow('No snapshot revision');
    await expect(projection.promote('site-b', 'rev-2')).rejects.toThrow('not staged');
  });
});
