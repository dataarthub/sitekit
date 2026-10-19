import { describe, expect, it, vi } from 'vitest';
import type { ContentAdapter, ContentPage } from '../contracts/content.js';
import { createFallbackContentRepository } from './repository.js';

const page: ContentPage = {
  id: 'post-1',
  collection: 'posts',
  slug: 'hello',
  locale: 'ja',
  title: 'Hello',
  tags: ['news'],
  headings: [],
  relatedContentIds: [],
  data: {},
};

describe('fallback content repository', () => {
  it('uses the first source with a page or non-empty collection', async () => {
    const primary: ContentAdapter = {
      getPage: async () => null,
      listCollection: async () => [],
    };
    const fallback: ContentAdapter = {
      getPage: async () => page,
      listCollection: async () => [page],
    };

    const repository = createFallbackContentRepository([primary, fallback]);

    await expect(repository.getPage({ id: 'post-1' })).resolves.toEqual(page);
    await expect(repository.listCollection({ collection: 'posts' })).resolves.toEqual([page]);
  });

  it('falls through after a source error and reports it', async () => {
    const onError = vi.fn();
    const primary: ContentAdapter = {
      getPage: async () => {
        throw new Error('D1 unavailable');
      },
      listCollection: async () => {
        throw new Error('D1 unavailable');
      },
    };
    const fallback: ContentAdapter = {
      getPage: async () => page,
      listCollection: async () => [page],
    };

    const repository = createFallbackContentRepository([primary, fallback], { onError });

    await expect(repository.getPage({ slug: 'hello' })).resolves.toEqual(page);
    await expect(repository.listCollection({ collection: 'posts' })).resolves.toEqual([page]);
    expect(onError).toHaveBeenCalledTimes(2);
  });

  it('does not expose validation unless a source implements it', () => {
    const repository = createFallbackContentRepository([
      { getPage: async () => null, listCollection: async () => [] },
    ]);

    expect(repository.validate).toBeUndefined();
  });
});
