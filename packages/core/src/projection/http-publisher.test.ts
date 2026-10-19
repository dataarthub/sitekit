import { describe, expect, it } from 'vitest';
import { createHttpSnapshotPublisher } from './http-publisher.js';

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

describe('HTTP snapshot publisher', () => {
  it('sends a signed immutable reference and validates the returned revision', async () => {
    const calls: Array<{ url: string; headers: Record<string, string>; body: string }> = [];
    const publisher = createHttpSnapshotPublisher({
      endpoint: 'https://edge.example/internal/site-snapshots',
      secret: 'test-secret',
      now: () => '2026-09-18T00:00:00.000Z',
      fetch: async (url, init) => {
        calls.push({ url, headers: init.headers, body: init.body });
        return {
          ok: true,
          status: 200,
          json: async () => ({
            eventId: 'event-1',
            idempotencyKey: 'site-1:rev-1',
            siteId: 'site-1',
            revision: 'rev-1',
            manifestUrl: reference.manifestUrl,
            publishedAt: '2026-09-18T00:01:00.000Z',
          }),
        };
      },
    });

    await expect(publisher.publish(reference)).resolves.toMatchObject({
      siteId: 'site-1',
      revision: 'rev-1',
    });
    expect(calls[0]?.url).toBe('https://edge.example/internal/site-snapshots');
    expect(calls[0]?.headers['x-eaos-timestamp']).toBe(String(Date.parse('2026-09-18T00:00:00.000Z') / 1000));
    expect(calls[0]?.headers['x-eaos-signature']).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(calls[0]?.headers['x-idempotency-key']).toBe('site-1:rev-1');
  });

  it('fails closed when the projection returns another revision', async () => {
    const publisher = createHttpSnapshotPublisher({
      endpoint: 'https://edge.example/internal/site-snapshots',
      secret: 'test-secret',
      fetch: async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          eventId: 'event-1',
          idempotencyKey: 'site-1:rev-2',
          siteId: 'site-1',
          revision: 'rev-2',
          manifestUrl: reference.manifestUrl,
          publishedAt: '2026-09-18T00:01:00.000Z',
        }),
      }),
    });

    await expect(publisher.publish(reference)).rejects.toThrow('does not match');
  });
});
