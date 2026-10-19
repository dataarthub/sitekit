import { describe, expect, it } from 'vitest';
import { compareSeriesChapters, getSeriesNavigation, groupSeriesItems, sortSeriesItems } from './series.js';

const item = (id: string, chapter?: string, publishedAt?: string) => ({
  id,
  editorial: { seriesId: 'series-a', ...(chapter !== undefined ? { seriesChapter: chapter } : {}) },
  ...(publishedAt !== undefined ? { publishedAt } : {}),
});

describe('content series helpers', () => {
  it('compares dotted chapter numbers numerically', () => {
    expect(compareSeriesChapters('1.10', '1.2')).toBeGreaterThan(0);
    expect(compareSeriesChapters('1.2', '1.2.1')).toBeLessThan(0);
  });

  it('sorts without mutating the source and places unnumbered items last', () => {
    const source = [item('ten', '1.10'), item('two', '1.2'), item('unknown')];
    expect(sortSeriesItems(source).map(value => value.id)).toEqual(['two', 'ten', 'unknown']);
    expect(source.map(value => value.id)).toEqual(['ten', 'two', 'unknown']);
  });

  it('groups and resolves previous/next items', () => {
    const items = [item('two', '2'), item('one', '1'), { id: 'other', editorial: { seriesId: 'other' } }];
    const groups = groupSeriesItems(items);
    expect(groups.get('series-a')?.map(value => value.id)).toEqual(['one', 'two']);
    expect(getSeriesNavigation(groups.get('series-a') ?? [], 'two')).toMatchObject({
      index: 1,
      previous: { id: 'one' },
    });
    expect(getSeriesNavigation(items, 'missing')).toBeNull();
  });
});
