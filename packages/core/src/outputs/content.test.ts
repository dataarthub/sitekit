import { describe, expect, it } from 'vitest';
import type { ContentItem } from '../contracts/content.js';
import { buildJsonFeed, buildLlmsTxt, buildRssFeed } from './content.js';

const items: ContentItem[] = [
  {
    id: 'new',
    collection: 'posts',
    slug: 'new',
    locale: 'ja',
    title: 'New & useful',
    summary: 'Summary',
    body: 'Body',
    tags: ['news'],
    publishedAt: '2026-02-01T00:00:00.000Z',
    data: {},
  },
  {
    id: 'paid',
    collection: 'posts',
    slug: 'paid',
    locale: 'ja',
    title: 'Paid',
    body: 'Private body',
    tags: [],
    publishedAt: '2026-03-01T00:00:00.000Z',
    access: { visibility: 'paid' },
    data: {},
  },
];

const options = {
  siteName: 'Example',
  siteUrl: 'https://example.test',
  feedUrl: 'https://example.test/rss.xml',
  description: 'A site',
  items,
  urlFor: (item: ContentItem) => `https://example.test/posts/${item.slug}`,
};

describe('content outputs', () => {
  it('creates public JSON Feed and excludes restricted content', () => {
    const feed = buildJsonFeed(options);
    expect(feed.items).toHaveLength(1);
    expect(feed.items[0]).toMatchObject({ id: 'new', content_text: 'Body', language: 'ja' });
  });

  it('creates escaped RSS and llms.txt from the same source', () => {
    const rss = buildRssFeed(options);
    const llms = buildLlmsTxt(options);

    expect(rss).toContain('New &amp; useful');
    expect(rss).not.toContain('Private body');
    expect(llms).toContain('- [New & useful](https://example.test/posts/new): Summary');
    expect(llms).not.toContain('Paid');
  });
});
