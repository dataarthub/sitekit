import { describe, expect, it } from 'vitest';
import { resolveMediaDelivery } from './delivery.js';
import type { MediaAsset } from '../contracts/content.js';

const asset: MediaAsset = {
  id: 'asset-1',
  url: 'https://cdn.example/asset-1.webp',
  alt: 'Asset',
  tags: [],
  metadata: {},
  access: { visibility: 'paid', signedUrlRequired: true, expiresInSeconds: 300 },
};

describe('media delivery policy', () => {
  it('requires a signed private response without an entitlement', () => {
    expect(resolveMediaDelivery(asset)).toEqual({
      allowed: false,
      cache: 'no-store',
      requiresSignedUrl: true,
      expiresInSeconds: 300,
    });
  });

  it('allows an entitled asset with private caching', () => {
    expect(resolveMediaDelivery(asset, { entitlements: ['asset-1'] })).toMatchObject({
      allowed: true,
      cache: 'private',
      requiresSignedUrl: true,
    });
  });
});
