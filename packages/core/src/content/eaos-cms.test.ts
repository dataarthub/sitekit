import { describe, expect, it } from 'vitest';
import {
  createEaosCmsContentAdapter,
  createEaosCmsMediaAdapter,
  loadEaosCmsSnapshotAdapters,
  mapEaosCmsPublishedContent,
  createHttpEaosCmsSnapshotLoader,
} from './eaos-cms.js';

const post = {
  id: 'post-1',
  title: 'EAOS news',
  slug: 'eaos-news',
  contentType: 'NEWS' as const,
  bodyMarkdown: '# News\n\nBody',
  metaTitle: 'EAOS news',
  metaDescription: 'A public CMS article',
  categories: [{ id: 'cat-1', name: 'News', slug: 'news' }],
  eyecatch: { id: 'asset-1', cdnUrl: 'https://cdn.example/hero.webp', mimeType: 'image/webp', altText: 'Hero' },
  publishedAt: '2026-09-18T00:00:00.000Z',
};

describe('EAOS CMS adapter', () => {
  it('maps approved content without exposing private CMS fields', () => {
    const item = mapEaosCmsPublishedContent(post, { canonicalBaseUrl: 'https://site.example' });
    expect(item).toMatchObject({
      collection: 'news',
      canonicalUrl: 'https://site.example/news/eaos-news',
      source: { kind: 'eaos-cms', id: 'post-1' },
      access: { visibility: 'public', aiIndexable: true },
    });
    expect(item.data).not.toHaveProperty('objectKey');
  });

  it('preserves JSON content, locale and gallery media metadata in the host contract', () => {
    const item = mapEaosCmsPublishedContent({
      ...post,
      locale: 'en',
      bodyJson: [{ type: 'paragraph', content: [{ type: 'text', text: 'Gallery' }] }],
      mediaAssetIds: ['asset-2'],
      mediaAssets: [{ id: 'asset-2', cdnUrl: 'https://cdn.example/gallery.webp', caption: 'Gallery', width: 1200, height: 800, rights: 'owned', tags: ['gallery'] }],
      modifiedAt: '2026-09-18T01:00:00.000Z',
    }, { canonicalBaseUrl: 'https://site.example' });
    expect(item).toMatchObject({ locale: 'en', modifiedAt: '2026-09-18T01:00:00.000Z' });
    expect(item.data).toMatchObject({ bodyJson: [{ type: 'paragraph' }], mediaAssetIds: ['asset-2'] });
    expect(item.data.mediaAssets).toMatchObject([{ id: 'asset-2', caption: 'Gallery', width: 1200, rights: 'owned' }]);
  });

  it('connects CMS public content and assets to snapshot source adapters', async () => {
    const content = createEaosCmsContentAdapter({ loadPublished: async () => [post] });
    const media = createEaosCmsMediaAdapter({
      loadPublishedAssets: async () => [post.eyecatch!],
    });
    const page = await content.getPage({ collection: 'news', slug: 'eaos-news' });
    expect(page?.headings).toEqual([{ id: 'news', level: 1, text: 'News' }]);
    await expect(media.getMedia({ id: 'asset-1' })).resolves.toMatchObject({ url: post.eyecatch.cdnUrl });
  });

  it('keeps content and media on one published CMS revision', async () => {
    let loads = 0;
    const adapters = await loadEaosCmsSnapshotAdapters({
      async loadPublishedSnapshot() {
        loads += 1;
        return {
          siteId: 'site-1',
          revision: 7,
          posts: [post],
          assets: [post.eyecatch!],
        };
      },
    });

    expect(loads).toBe(1);
    expect(adapters).toMatchObject({ siteId: 'site-1', revision: '7' });
    await expect(adapters.content.getPage({ collection: 'news', slug: 'eaos-news' }))
      .resolves.toMatchObject({ id: 'post-1' });
    await expect(adapters.media.getMedia({ id: 'asset-1' }))
      .resolves.toMatchObject({ id: 'asset-1' });
  });

  it('loads a site-matched public snapshot over an authenticated HTTP boundary', async () => {
    let requestedUrl = '';
    let requestedHeaders: Record<string, string> | undefined;
    let requestedBody: unknown;
    const loader = createHttpEaosCmsSnapshotLoader({
      endpoint: 'https://eaos.example/api/plugins/cms/get_published_snapshot',
      siteId: 'site-1',
      headers: () => ({ authorization: 'Bearer test-token' }),
      fetch: async (url, init) => {
        requestedUrl = url;
        requestedHeaders = init.headers;
        requestedBody = JSON.parse(init.body);
        return {
          ok: true,
          status: 200,
          async json() {
            return { siteId: 'site-1', revision: 8, posts: [post], assets: [post.eyecatch!] };
          },
        };
      },
    });

    await expect(loader.loadPublishedSnapshot()).resolves.toMatchObject({ siteId: 'site-1', revision: 8 });
    expect(requestedUrl).toBe('https://eaos.example/api/plugins/cms/get_published_snapshot');
    expect(requestedHeaders).toMatchObject({ 'content-type': 'application/json', authorization: 'Bearer test-token' });
    expect(requestedBody).toEqual({ siteId: 'site-1' });
  });

  it('rejects non-HTTPS endpoints and private asset fields', async () => {
    expect(() => createHttpEaosCmsSnapshotLoader({
      endpoint: 'http://eaos.example/snapshot',
      siteId: 'site-1',
      fetch: async () => ({ ok: true, status: 200, async json() { return {}; } }),
    })).toThrow('must use HTTPS');

    const loader = createHttpEaosCmsSnapshotLoader({
      endpoint: 'https://eaos.example/snapshot',
      siteId: 'site-1',
      fetch: async () => ({
        ok: true,
        status: 200,
        async json() {
          return {
            siteId: 'site-1',
            revision: 1,
            posts: [{ ...post, eyecatch: { ...post.eyecatch!, objectKey: 'private/key' } }],
          };
        },
      }),
    });
    await expect(loader.loadPublishedSnapshot()).rejects.toThrow('objectKey');
  });

  it('supports injected collection mapping without a domain template', async () => {
    const article = { ...post, contentType: 'ARTICLE', slug: 'welcome', bodyMarkdown: '' };
    const item = mapEaosCmsPublishedContent(article, { collectionByType: { ARTICLE: 'articles' } });
    expect(item.collection).toBe('articles');
    expect(item.slug).toBe('welcome');
    expect(mapEaosCmsPublishedContent({ ...article, contentType: 'ROOM_TYPE' }).collection).toBe('room_type');
    const loader = { async loadPublishedSnapshot() {
      return { siteId: 'example', revision: 1, posts: [article], assets: [] };
    } };
    const adapters = await loadEaosCmsSnapshotAdapters(loader, { collectionByType: { ARTICLE: 'articles' } });
    expect(await adapters.content.getPage({ collection: 'articles', slug: 'welcome', locale: 'ja' })).not.toBeNull();
  });
});
