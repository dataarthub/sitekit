import { describe, expect, it } from 'vitest';
import {
  createMarkdownPreview,
  projectContentForAccess,
  resolveContentAccess,
  splitPaywall,
} from './index.js';
import type { ContentItem } from '../contracts/content.js';

const baseContent: ContentItem = {
  id: 'article-1',
  collection: 'posts',
  slug: 'article-1',
  locale: 'ja',
  title: 'Article',
  body: 'protected body',
  tags: [],
  access: {
    visibility: 'paid',
    entitlementKey: 'post:article-1',
    offer: { id: 'post:article-1', amount: 500, currency: 'JPY', kind: 'one-time' },
  },
  data: {},
};

describe('content access contract', () => {
  it('resolves public content to a public full projection', async () => {
    const result = await resolveContentAccess({
      ...baseContent,
      access: { visibility: 'public' },
    });

    expect(result).toMatchObject({ mode: 'full', entitled: true, cache: 'public' });
  });

  it('supports provider-independent entitlements and private caching', async () => {
    const result = await resolveContentAccess(baseContent, {
      entitlements: ['post:article-1'],
    });

    expect(result).toMatchObject({
      mode: 'full',
      entitled: true,
      reason: 'entitled',
      cache: 'private',
    });
  });

  it('returns a safe preview projection without the protected body', async () => {
    const result = await resolveContentAccess(baseContent);
    const projection = projectContentForAccess(baseContent, result);

    expect(result).toMatchObject({ mode: 'preview', cache: 'public' });
    expect(projection.body).toBeUndefined();
    expect(projection.title).toBe('Article');
  });

  it('can fail closed for private content and unpublished content', async () => {
    const privateResult = await resolveContentAccess({
      ...baseContent,
      access: { visibility: 'private' },
    });
    const draftResult = await resolveContentAccess({ ...baseContent, status: 'draft' });

    expect(privateResult).toMatchObject({ mode: 'denied', reason: 'private', cache: 'no-store' });
    expect(draftResult).toMatchObject({ mode: 'denied', reason: 'not-published', cache: 'no-store' });
  });

  it('shares paywall splitting and bounded Markdown preview behavior', () => {
    expect(splitPaywall('free\n\n---paywall---\n\npaid')).toEqual({
      hasPaywall: true,
      freeContent: 'free',
      paidContent: 'paid',
    });
    expect(createMarkdownPreview('one\n\ntwo\n\nthree', { paragraphs: 2 })).toBe('one\n\ntwo');
  });
});
