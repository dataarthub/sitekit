import { describe, expect, it } from 'vitest';
import { createR2MediaUploadAdapter } from './media.js';

describe('Cloudflare R2 media upload adapter', () => {
  it('stores the upload and returns a provider-neutral media asset', async () => {
    let uploaded: { key: string; body: unknown; contentType?: string } | undefined;
    const adapter = createR2MediaUploadAdapter({
      get: async () => null,
      put: async (key, body, options) => {
        uploaded = { key, body, contentType: options?.httpMetadata?.contentType };
      },
    }, {
      baseUrl: 'https://cdn.example/',
      prefix: '/uploads/',
      idFactory: () => 'asset-1.webp',
    });

    const asset = await adapter.upload({
      fileName: 'hero image.webp',
      contentType: 'image/webp',
      body: new Uint8Array([1, 2, 3]),
      visibility: 'paid',
      alt: 'Hero image',
      metadata: { origin: 'webmedia' },
    });

    expect(uploaded).toEqual({
      key: 'uploads/asset-1.webp',
      body: new Uint8Array([1, 2, 3]),
      contentType: 'image/webp',
    });
    expect(asset).toMatchObject({
      id: 'asset-1.webp',
      url: 'https://cdn.example/uploads/asset-1.webp',
      provider: 'r2',
      access: { visibility: 'paid', signedUrlRequired: true },
      source: { kind: 'r2', id: 'uploads/asset-1.webp' },
      metadata: { origin: 'webmedia' },
    });
  });

  it('normalizes object ids before writing R2 keys', async () => {
    let key = '';
    const adapter = createR2MediaUploadAdapter({
      get: async () => null,
      put: async uploadedKey => { key = uploadedKey; },
    }, {
      baseUrl: 'https://cdn.example',
      idFactory: () => '../unsafe/name.webp',
    });

    await adapter.upload({ fileName: 'name.webp', contentType: 'image/webp', body: 'bytes' });
    expect(key).toBe('media/unsafe/name.webp');
  });
});
