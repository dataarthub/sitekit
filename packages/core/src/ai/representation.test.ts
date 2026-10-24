import { describe, expect, it } from 'vitest';
import type { ContentPage } from '../contracts/content.js';
import type { MachineReadableContentAdapter } from './representation.js';
import { buildAiContext, buildMachineReadableContent } from './representation.js';

describe('machine-readable content contract', () => {
  it('keeps stable content identity and permissions explicit', async () => {
    const page: ContentPage = {
      id: 'article-1',
      collection: 'articles',
      slug: 'welcome',
      locale: 'en',
      title: 'Welcome',
      tags: ['news'],
      headings: [{ id: 'intro', level: 2, text: 'Introduction' }],
      relatedContentIds: [],
      data: {},
    };
    const adapter: MachineReadableContentAdapter = {
      toMachineReadable: (content, context) => ({
        id: content.id,
        canonicalUrl: context.canonicalUrl,
        locale: content.locale,
        title: content.title,
        tags: content.tags,
        headings: 'headings' in content ? content.headings : [],
        entities: [],
        media: [],
        citations: [],
        permissions: { public: true, aiIndexable: true },
      }),
    };
    const result = await adapter.toMachineReadable(page, { canonicalUrl: 'https://example.com/en/welcome' });
    expect(result.id).toBe('article-1');
    expect(result.permissions.aiIndexable).toBe(true);
  });

  it('builds bounded AI context from the same access-aware representation', () => {
    const page: ContentPage = {
      id: 'article-1',
      collection: 'articles',
      slug: 'welcome',
      locale: 'en',
      title: 'Welcome',
      body: 'hello world',
      tags: ['news'],
      structuredDataType: 'Article',
      headings: [],
      relatedContentIds: [],
      data: {},
    };
    const context = buildAiContext(page, { canonicalUrl: 'https://example.com/article' }, {
      maxBodyCharacters: 5,
      metadata: { source: 'webmedia' },
    });

    expect(context.body).toBe('hello');
    expect(context.metadata).toMatchObject({ source: 'webmedia', contentType: 'Article' });
  });

  it('builds a stable machine-readable representation from canonical content', () => {
    const page = {
      id: 'article-1',
      collection: 'articles',
      slug: 'welcome',
      locale: 'en',
      title: 'Welcome',
      tags: ['news'],
      headings: [{ id: 'intro', level: 2, text: 'Introduction' }],
      relatedContentIds: [],
      data: {},
    };
    const result = buildMachineReadableContent(page, {
      canonicalUrl: 'https://example.com/en/welcome',
      media: [{ id: 'image-1', url: '/image.webp', alt: 'A view', tags: [], metadata: {} }],
    });
    expect(result).toMatchObject({
      id: 'article-1',
      canonicalUrl: 'https://example.com/en/welcome',
      media: [{ id: 'image-1', alt: 'A view' }],
    });
  });

  it('does not expose restricted body content to machine-readable output', () => {
    const result = buildMachineReadableContent(
      {
        id: 'paid-1',
        collection: 'posts',
        slug: 'paid',
        locale: 'ja',
        title: 'Paid article',
        body: 'Members-only body',
        tags: [],
        access: { visibility: 'paid' },
        data: {},
      },
      { canonicalUrl: 'https://example.com/paid' },
    );

    expect(result.body).toBeUndefined();
    expect(result.permissions).toEqual({ public: false, aiIndexable: false });
  });

  it('turns public rich blocks into an AI-readable text projection', () => {
    const result = buildMachineReadableContent({
      id: 'blocks-1',
      collection: 'posts',
      slug: 'blocks',
      locale: 'ja',
      title: 'Blocks',
      tags: [],
      bodyDocument: {
        format: 'blocks',
        value: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello rich world' }] }],
      },
      data: {},
    }, { canonicalUrl: 'https://example.com/blocks' });

    expect(result.body).toBe('Hello rich world');
  });
});


for (const visibility of ['members', 'paid', 'private', 'public'] as const) {
  it(`omits body from machine and AI output for ${visibility} when indexing is denied`, () => {
    const content = { id: 'restricted', collection: 'posts', slug: 'restricted', locale: 'en', title: 'Restricted', tags: [], data: {},
      body: 'SECRET BODY', bodyDocument: { format: 'markdown' as const, value: 'SECRET RICH BODY' },
      access: { visibility, aiIndexable: false } };
    for (const value of [buildMachineReadableContent(content, { canonicalUrl: 'https://example.test/entry' }),
      buildAiContext(content, { canonicalUrl: 'https://example.test/entry' })]) {
      expect(value.body).toBeUndefined();
      expect(value.permissions.aiIndexable).toBe(false);
      expect(JSON.stringify(value)).not.toContain('SECRET');
    }
  });
}
