import { describe, expect, it } from 'vitest';
import { parseSiteSnapshotManifest } from './manifest.js';

describe('site snapshot manifest', () => {
  it('accepts a signed, versioned manifest', () => {
    const manifest = parseSiteSnapshotManifest({
      schemaVersion: '1',
      siteId: 'hotel-a',
      revision: '2026-09-18.001',
      generatedAt: '2026-09-18T06:00:00.000Z',
      contentVersion: 'content-42',
      mediaVersion: 'media-19',
      checksum: 'sha256:abc',
      locales: ['ja', 'en'],
      signature: { algorithm: 'ed25519', keyId: 'eaos-prod', value: 'signature' },
    });

    expect(manifest.revision).toBe('2026-09-18.001');
    expect(manifest.signature?.algorithm).toBe('ed25519');
  });

  it('rejects an incomplete manifest before staging', () => {
    expect(() => parseSiteSnapshotManifest({ siteId: 'hotel-a' })).toThrow();
  });
});
