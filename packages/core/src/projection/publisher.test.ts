import { describe, expect, it } from 'vitest';
import type { ContentAdapter, MediaAdapter } from '../contracts/content.js';
import type {
  SiteSnapshotManifest,
  SiteSnapshotProjection,
  SiteSnapshotReference,
} from '../contracts/projection.js';
import { createProjectionSnapshotPublisher } from './publisher.js';

const contentAdapter = {} as ContentAdapter;
const mediaAdapter = {} as MediaAdapter;
const manifest: SiteSnapshotManifest = {
  schemaVersion: '1',
  siteId: 'site-a',
  revision: '2026-09-18.001',
  generatedAt: '2026-09-18T00:00:00.000Z',
  contentVersion: 'content-1',
  mediaVersion: 'media-1',
  checksum: 'sha256:abc',
  locales: ['ja'],
};

describe('projection snapshot publisher', () => {
  it('stages, promotes, verifies and emits an idempotent publication event', async () => {
    const calls: string[] = [];
    const projection: SiteSnapshotProjection = {
      async stage(reference) {
        calls.push(`stage:${reference.manifest.revision}`);
      },
      async promote(siteId, revision) {
        calls.push(`promote:${siteId}:${revision}`);
      },
      async rollback() {
        calls.push('rollback');
      },
      async getCurrentManifest() {
        return manifest;
      },
      async getSnapshot() {
        return { manifest, content: contentAdapter, media: mediaAdapter };
      },
      async getContentAdapter() {
        return contentAdapter;
      },
      async getMediaAdapter() {
        return mediaAdapter;
      },
    };
    const reference: SiteSnapshotReference = {
      manifest,
      manifestUrl: 'https://edge.example/snapshots/site-a/2026-09-18.001/manifest.json',
    };
    const publisher = createProjectionSnapshotPublisher(projection, {
      eventId: () => 'event-1',
      publishedAt: () => '2026-09-18T00:01:00.000Z',
    });

    await expect(publisher.publish(reference)).resolves.toEqual({
      eventId: 'event-1',
      idempotencyKey: 'site-a:2026-09-18.001',
      siteId: 'site-a',
      revision: '2026-09-18.001',
      manifestUrl: reference.manifestUrl,
      publishedAt: '2026-09-18T00:01:00.000Z',
    });
    expect(calls).toEqual(['stage:2026-09-18.001', 'promote:site-a:2026-09-18.001']);
  });

  it('does not emit a publication event when head verification fails', async () => {
    const projection: SiteSnapshotProjection = {
      stage: async () => undefined,
      promote: async () => undefined,
      rollback: async () => undefined,
      getCurrentManifest: async () => ({ ...manifest, checksum: 'sha256:other' }),
      getSnapshot: async () => ({ manifest, content: contentAdapter, media: mediaAdapter }),
      getContentAdapter: async () => contentAdapter,
      getMediaAdapter: async () => mediaAdapter,
    };
    const publisher = createProjectionSnapshotPublisher(projection);

    await expect(
      publisher.publish({ manifest, manifestUrl: 'https://edge.example/manifest.json' }),
    ).rejects.toThrow('could not be verified');
  });
});
