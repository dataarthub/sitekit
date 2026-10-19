import { describe, expect, it } from 'vitest';
import type { ContentAdapter, MediaAdapter } from '../contracts/content.js';
import type { SiteSnapshotPublisher } from '../contracts/projection.js';
import { buildAndPublishEaosCmsSiteSnapshot, buildAndPublishSiteSnapshot } from './build-publish.js';

const content: ContentAdapter = {
  async getPage() { return null; },
  async listCollection(query) {
    return [{
      id: `${query.collection}-1`,
      collection: query.collection,
      slug: `${query.collection}-1`,
      locale: 'ja',
      title: query.collection,
      tags: [],
      data: {},
    }];
  },
};

const media: MediaAdapter = {
  async getMedia() { return null; },
  async listMedia() {
    return [{ id: 'image-1', url: 'https://cdn.example/image.webp', alt: 'Image', tags: [], metadata: {} }];
  },
};

describe('build and publish site snapshot', () => {
  it('writes payloads before the manifest and publishes the complete reference', async () => {
    const writes: string[] = [];
    let publishedReference: Parameters<SiteSnapshotPublisher['publish']>[0] | undefined;
    const publisher: SiteSnapshotPublisher = {
      async publish(reference) {
        publishedReference = reference;
        return {
          eventId: 'event-1',
          idempotencyKey: 'site-1:rev-1',
          siteId: 'site-1',
          revision: 'rev-1',
          manifestUrl: reference.manifestUrl!,
          publishedAt: '2026-09-18T00:01:00.000Z',
        };
      },
    };

    const result = await buildAndPublishSiteSnapshot({
      siteId: 'site-1',
      revision: 'rev-1',
      contentVersion: 'cms-4',
      mediaVersion: 'media-2',
      locales: ['ja'],
      source: { content, collections: ['posts', 'pages'], media },
      artifacts: {
        async put(input) {
          writes.push(input.kind);
          return `https://eaos.example/${input.kind}/${input.siteId}/${input.revision}.json`;
        },
      },
      publisher,
      generatedAt: '2026-09-18T00:00:00.000Z',
      signManifest: async manifest => ({
        ...manifest,
        signature: { algorithm: 'ed25519', keyId: 'eaos-prod', value: 'signature' },
      }),
    });

    expect(writes).toEqual(['content', 'media', 'manifest']);
    expect(publishedReference?.manifest.signature?.algorithm).toBe('ed25519');
    expect(result.artifact.contentJson).toContain('posts-1');
    expect(result.event.revision).toBe('rev-1');
  });

  it('rejects a signer that changes the snapshot identity or checksum', async () => {
    const publisher: SiteSnapshotPublisher = {
      async publish() {
        throw new Error('publisher should not be called');
      },
    };
    await expect(buildAndPublishSiteSnapshot({
      siteId: 'site-1',
      revision: 'rev-1',
      contentVersion: 'cms-4',
      mediaVersion: 'media-2',
      locales: ['ja'],
      source: { content, collections: ['posts'], media },
      artifacts: { async put() { return 'https://eaos.example/object.json'; } },
      publisher,
      signManifest: async manifest => ({ ...manifest, revision: 'rev-2' }),
    })).rejects.toThrow('immutable field: revision');
  });

  it('builds a host snapshot directly from one EAOS CMS publication revision', async () => {
    const writes: string[] = [];
    const publisher: SiteSnapshotPublisher = {
      async publish(reference) {
        return {
          eventId: 'event-2',
          idempotencyKey: 'site-1:cms-7',
          siteId: reference.manifest.siteId,
          revision: reference.manifest.revision,
          manifestUrl: reference.manifestUrl!,
          publishedAt: '2026-09-18T00:02:00.000Z',
        };
      },
    };
    const result = await buildAndPublishEaosCmsSiteSnapshot({
      cms: {
        async loadPublishedSnapshot() {
          return {
            siteId: 'site-1',
            revision: 7,
            posts: [{
              id: 'post-1',
              title: 'CMS article',
              slug: 'cms-article',
              contentType: 'NEWS',
              bodyMarkdown: '# CMS article',
              publishedAt: '2026-09-18T00:00:00.000Z',
            }],
            assets: [{ id: 'image-1', cdnUrl: 'https://cdn.example/cms.webp' }],
          };
        },
      },
      collections: ['news'],
      locales: ['ja'],
      artifacts: {
        async put(input) {
          writes.push(input.kind);
          return `https://eaos.example/${input.kind}.json`;
        },
      },
      publisher,
    });

    expect(writes).toEqual(['content', 'media', 'manifest']);
    expect(result.reference.manifest.revision).toBe('cms-7');
    expect(result.reference.manifest.contentVersion).toBe('7');
    expect(result.reference.manifest.mediaVersion).toBe('7');
    expect(result.artifact.contentJson).toContain('cms-article');
  });

  it('rejects an EAOS CMS snapshot for an unexpected site', async () => {
    await expect(buildAndPublishEaosCmsSiteSnapshot({
      expectedSiteId: 'site-expected',
      cms: {
        async loadPublishedSnapshot() {
          return { siteId: 'site-other', revision: 1, posts: [] };
        },
      },
      collections: [],
      locales: ['ja'],
      artifacts: { async put() { return 'https://eaos.example/object.json'; } },
      publisher: { async publish() { throw new Error('publisher should not be called'); } },
    })).rejects.toThrow('does not match the expected site');
  });
});
