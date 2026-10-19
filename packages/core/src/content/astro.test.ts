import { describe, expect, it } from 'vitest';
import { createAstroContentCollectionAdapter } from './astro.js';

describe('Astro Content Collection adapter', () => {
  const adapter = createAstroContentCollectionAdapter(async collection => [
    {
      id: 'hello',
      slug: 'hello',
      collection,
      data: {
        title: 'Hello',
        description: 'A post',
        pubDate: '2026-01-02',
        lang: 'en',
        tags: ['news'],
        draft: false,
        relatedContentIds: ['next'],
      },
      body: '# Hello\n\n## Details\n\nBody',
    },
    {
      id: 'draft',
      data: { title: 'Draft', draft: true, lang: 'en' },
      body: '# Draft',
    },
  ], { structuredDataTypes: { posts: 'Article' } });

  it('maps webmedia-style frontmatter into normalized content', async () => {
    const page = await adapter.getPage({ collection: 'posts', slug: 'hello', locale: 'en' });

    expect(page).toMatchObject({
      id: 'hello',
      collection: 'posts',
      status: 'published',
      structuredDataType: 'Article',
      access: { visibility: 'public', aiIndexable: true },
      headings: [
        { id: 'hello', level: 1, text: 'Hello' },
        { id: 'details', level: 2, text: 'Details' },
      ],
      relatedContentIds: ['next'],
    });
  });

  it('filters drafts, locales, and tags and supports cursors', async () => {
    await expect(adapter.listCollection({ collection: 'posts', locale: 'en', tags: ['news'] }))
      .resolves.toHaveLength(1);
    await expect(adapter.listCollection({ collection: 'posts', cursor: '1', limit: 1 }))
      .resolves.toHaveLength(0);
    await expect(adapter.listCollection({ collection: 'posts', includeDrafts: true }))
      .resolves.toHaveLength(2);
  });
});
