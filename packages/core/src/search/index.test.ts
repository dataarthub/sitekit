import { describe, expect, it } from 'vitest';
import { buildSearchDocuments, findRelatedContent } from './index.js';
import type { ContentItem } from '../contracts/content.js';

const item = (id: string, overrides: Partial<ContentItem> = {}): ContentItem => ({
  id,
  collection: 'posts',
  slug: id,
  locale: 'ja',
  title: id,
  tags: ['ai', 'property'],
  status: 'published',
  access: { visibility: 'public' },
  data: {},
  ...overrides,
});

describe('content search contracts', () => {
  it('creates a restricted-safe search projection without body content', () => {
    const documents = buildSearchDocuments([
      item('paid', { access: { visibility: 'paid' }, body: 'must not be indexed here' }),
      item('public', { publishedAt: '2026-01-01T00:00:00.000Z' }),
      item('draft', { status: 'draft' }),
    ]);

    expect(documents.map(document => document.id)).toEqual(['public', 'paid']);
    expect(documents.find(document => document.id === 'paid')).not.toHaveProperty('body');
  });

  it('ranks same-series and shared-taxonomy content as related', () => {
    const source = item('source', { editorial: { seriesId: 'series-1' } });
    const related = item('related', { editorial: { seriesId: 'series-1' } });
    const unrelated = item('unrelated', { tags: ['other'] });

    expect(findRelatedContent(source, [unrelated, related])).toEqual([related]);
  });
});
