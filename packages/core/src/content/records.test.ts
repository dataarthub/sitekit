import { describe, expect, it } from 'vitest';
import { createRecordContentAdapter } from './records.js';

interface WebmediaPostRecord {
  id: string;
  title: string;
  description: string;
  category: string;
  lang: string;
  slug: string;
  contentMarkdown?: string;
  pubDate: string;
  isPaid?: boolean;
  tags?: string[];
}

describe('record content adapter', () => {
  it('maps a webmedia-shaped record without coupling the framework to its schema', async () => {
    const record: WebmediaPostRecord = {
      id: 'post-1',
      title: 'A shared post',
      description: 'Published from the canonical source',
      category: 'news',
      lang: 'ja',
      slug: 'shared-post',
      contentMarkdown: '# Heading\n\nBody',
      pubDate: '2026-09-18T00:00:00.000Z',
      tags: ['eaos', 'webmedia'],
    };

    const adapter = createRecordContentAdapter<WebmediaPostRecord>(
      async collection => (collection === 'posts' ? [record] : []),
      {
        mapRecord: value => ({
          id: value.id,
          collection: 'posts',
          slug: value.slug,
          locale: value.lang,
          title: value.title,
          summary: value.description,
          body: value.contentMarkdown,
          tags: value.tags ?? [],
          status: 'published',
          access: { visibility: value.isPaid ? 'paid' : 'public', aiIndexable: !value.isPaid },
          publishedAt: value.pubDate,
          source: { kind: 'd1', id: value.id },
          data: { category: value.category },
        }),
      },
    );

    const page = await adapter.getPage({ collection: 'posts', slug: 'shared-post' });
    expect(page?.title).toBe('A shared post');
    expect(page?.headings).toEqual([{ id: 'heading', level: 1, text: 'Heading' }]);
    expect((await adapter.listCollection({ collection: 'posts', tags: ['webmedia'] })).length).toBe(1);
  });
});
