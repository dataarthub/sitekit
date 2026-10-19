import { describe, expect, it } from 'vitest';
import { createEaosCmsContentAdapter, createEaosCmsMediaAdapter } from '../content/eaos-cms.js';
import {
  buildAndPublishSiteSnapshot,
  createHttpSnapshotPublisher,
  signSnapshotPublicationRequest,
  SNAPSHOT_PROJECTION_PROTOCOL_VERSION,
} from './index.js';

const cmsPost = {
  id: 'post-1',
  title: 'Public CMS article',
  slug: 'public-cms-article',
  contentType: 'NEWS' as const,
  bodyMarkdown: '# Public article\n\nEAOS content',
  metaDescription: 'A public article',
  categories: [{ id: 'category-1', name: 'News', slug: 'news' }],
  eyecatch: { id: 'asset-1', cdnUrl: 'https://cdn.example/hero.webp', altText: 'Hero' },
  publishedAt: '2026-09-18T00:00:00.000Z',
};

describe('EAOS CMS to projection publication', () => {
  it('builds, stores and publishes one public CMS revision through the signed protocol', async () => {
    const objects = new Map<string, string>();
    const content = createEaosCmsContentAdapter({ loadPublished: async () => [cmsPost] });
    const media = createEaosCmsMediaAdapter({ loadPublishedAssets: async () => [cmsPost.eyecatch] });
    const publisher = createHttpSnapshotPublisher({
      endpoint: 'https://edge.example/internal/site-snapshots',
      secret: 'eaos-test-secret',
      now: () => '2026-09-18T00:00:00.000Z',
      fetch: async (_url, init) => {
        expect(init.headers['x-eaos-protocol-version']).toBe(SNAPSHOT_PROJECTION_PROTOCOL_VERSION);
        expect(init.headers['x-idempotency-key']).toBe('site-1:cms-7');
        expect(init.headers['x-eaos-signature']).toBe(
          await signSnapshotPublicationRequest(
            'eaos-test-secret',
            init.headers['x-eaos-timestamp']!,
            init.body,
          ),
        );
        const reference = JSON.parse(init.body) as {
          manifest: { siteId: string; revision: string; checksum: string };
          manifestUrl: string;
          contentUrl: string;
          mediaUrl: string;
        };
        expect(reference.manifest.siteId).toBe('site-1');
        expect(reference.manifest.revision).toBe('cms-7');
        expect(objects.has('content')).toBe(true);
        expect(objects.has('media')).toBe(true);
        expect(objects.has('manifest')).toBe(true);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            eventId: 'event-1',
            idempotencyKey: 'site-1:cms-7',
            siteId: 'site-1',
            revision: 'cms-7',
            manifestUrl: reference.manifestUrl,
            publishedAt: '2026-09-18T00:01:00.000Z',
          }),
        };
      },
    });

    const result = await buildAndPublishSiteSnapshot({
      siteId: 'site-1',
      revision: 'cms-7',
      contentVersion: 'cms-7',
      mediaVersion: 'cms-7',
      locales: ['ja'],
      source: { content, collections: ['news'], media },
      artifacts: {
        async put(input) {
          objects.set(input.kind, input.body);
          return `https://eaos.example/${input.kind}/site-1/cms-7.json`;
        },
      },
      publisher,
      generatedAt: '2026-09-18T00:00:00.000Z',
      signManifest: async manifest => ({
        ...manifest,
        signature: { algorithm: 'ed25519', keyId: 'eaos-test', value: 'signed' },
      }),
    });

    expect(result.event).toMatchObject({ siteId: 'site-1', revision: 'cms-7' });
    expect(JSON.parse(objects.get('content')!)[0]).toMatchObject({
      id: 'post-1',
      collection: 'news',
      access: { visibility: 'public' },
    });
    expect(JSON.parse(objects.get('manifest')!).signature.algorithm).toBe('ed25519');
  });
});
