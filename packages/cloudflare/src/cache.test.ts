import { describe, expect, it } from 'vitest';
import { createCloudflareCachePurgeAdapter } from './cache.js';

describe('Cloudflare cache revalidation', () => {
  it('purges normalized URLs through the injected fetcher', async () => {
    let requestBody = '';
    const adapter = createCloudflareCachePurgeAdapter({
      zoneId: 'zone-1',
      apiToken: 'token-1',
      siteUrl: 'https://example.com',
      fetch: async (input, init) => {
        requestBody = String(init?.body);
        expect(input).toBe('https://api.cloudflare.com/client/v4/zones/zone-1/purge_cache');
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      },
    });

    const result = await adapter.revalidate({
      siteId: 'site-1',
      revision: 'rev-1',
      urls: ['/ja/posts/one', 'https://cdn.example/asset.webp'],
    });

    expect(result).toEqual({ accepted: true, invalidated: 2, revision: 'rev-1' });
    expect(JSON.parse(requestBody)).toEqual({
      files: ['https://example.com/ja/posts/one', 'https://cdn.example/asset.webp'],
    });
  });

  it('returns a structured failure without throwing on provider errors', async () => {
    const adapter = createCloudflareCachePurgeAdapter({
      zoneId: 'zone-1',
      apiToken: 'token-1',
      fetch: async () => new Response(JSON.stringify({ success: false, errors: [{ message: 'denied' }] }), { status: 403 }),
    });

    await expect(adapter.revalidate({ siteId: 'site-1', urls: ['/'] })).resolves.toMatchObject({
      accepted: false,
      error: { code: 'cloudflare_purge_failed', message: 'denied' },
    });
  });
});
