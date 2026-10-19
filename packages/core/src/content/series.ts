import type { ContentItem } from '../contracts/content.js';

/**
 * Sorted series candidates, current zero-based position, and optional adjacent items.
 * @typeParam T - Content item shape preserved while sorting, grouping, and selecting adjacent items.
 */
export interface SeriesNavigation<T> {
  /** Newly sorted candidate array. */
  items: T[];
  /** Zero-based position of current in items. */
  index: number;
  /** Matched item with the requested identifier. */
  current: T;
  /** Previous item when current is not first. */
  previous?: T;
  /** Next item when current is not last. */
  next?: T;
}

/** Minimal content identity, chapter metadata, and publication date required for series ordering. */
type SeriesItem = Pick<ContentItem, 'id' | 'editorial' | 'publishedAt'>;

function chapterParts(value: string | undefined): Array<number | string> {
  if (!value?.trim()) return [];
  return value.trim().split('.').map(part => {
    const normalized = part.trim();
    return /^\d+$/.test(normalized) ? Number(normalized) : normalized.toLocaleLowerCase();
  });
}

/**
 * Compares dot-separated chapter labels with numeric segments ordered numerically before text segments.
 *
 * @param a - First chapter label; missing or blank labels have no segments.
 * @param b - Second chapter label; missing or blank labels have no segments.
 * @returns A negative number, zero, or positive number according to chapter order.
 * @example
 * ```ts
 * import { compareSeriesChapters } from '@alneas/sitekit/content';
 * const order = compareSeriesChapters('1.2', '1.10'); // negative
 * ```
 */
export function compareSeriesChapters(a?: string, b?: string): number {
  const partsA = chapterParts(a);
  const partsB = chapterParts(b);
  const length = Math.max(partsA.length, partsB.length);

  for (let index = 0; index < length; index += 1) {
    const partA = partsA[index];
    const partB = partsB[index];
    if (partA === undefined && partB === undefined) break;
    if (partA === undefined) return -1;
    if (partB === undefined) return 1;
    if (partA === partB) continue;
    if (typeof partA === 'number' && typeof partB === 'number') return partA - partB;
    if (typeof partA === 'number') return -1;
    if (typeof partB === 'number') return 1;
    return partA < partB ? -1 : 1;
  }

  return 0;
}

function compareSeriesItems<T extends SeriesItem>(a: T, b: T): number {
  const chapterA = a.editorial?.seriesChapter;
  const chapterB = b.editorial?.seriesChapter;
  if (chapterA === undefined && chapterB !== undefined) return 1;
  if (chapterA !== undefined && chapterB === undefined) return -1;

  const chapterOrder = compareSeriesChapters(chapterA, chapterB);
  if (chapterOrder !== 0) return chapterOrder;

  const publishedA = Date.parse(a.publishedAt ?? '');
  const publishedB = Date.parse(b.publishedAt ?? '');
  if (Number.isFinite(publishedA) && Number.isFinite(publishedB) && publishedA !== publishedB) {
    return publishedA - publishedB;
  }
  return a.id.localeCompare(b.id);
}

/**
 * Copies and sorts items by chapter, then valid publication dates, then identifier.
 *
 * @param items - Candidate items already scoped to the desired series and locale.
 * @returns A new array in reading order; the input array is unchanged.
 * @remarks This helper does not filter series membership, locale, draft status, or access. Items with a chapter precede items without one.
 * @example
 * ```ts
 * import { sortSeriesItems } from '@alneas/sitekit/content';
 * const ordered = sortSeriesItems([{ id: 'b', editorial: { seriesChapter: '2' } }, { id: 'a', editorial: { seriesChapter: '1' } }]);
 * ```
 * @typeParam T - Content item shape preserved while sorting, grouping, and selecting adjacent items. Must satisfy the declared SeriesItem constraint.
 */
export function sortSeriesItems<T extends SeriesItem>(items: readonly T[]): T[] {
  return [...items].sort(compareSeriesItems);
}

/**
 * Groups items with a truthy editorial seriesId and sorts each group in reading order.
 *
 * @param items - Candidate items with any required locale and visibility filtering already applied.
 * @returns A map from series identifier to a new sorted array; items without a series identifier are omitted.
 * @remarks Groups are keyed only by seriesId, so mixed-locale inputs remain mixed.
 * @example
 * ```ts
 * import { groupSeriesItems } from '@alneas/sitekit/content';
 * const groups = groupSeriesItems([{ id: 'intro', editorial: { seriesId: 'guide', seriesChapter: '1' } }]);
 * ```
 * @typeParam T - Content item shape preserved while sorting, grouping, and selecting adjacent items. Must satisfy the declared SeriesItem constraint.
 */
export function groupSeriesItems<T extends SeriesItem>(items: readonly T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const seriesId = item.editorial?.seriesId;
    if (!seriesId) continue;
    const group = groups.get(seriesId) ?? [];
    group.push(item);
    groups.set(seriesId, group);
  }

  for (const [seriesId, group] of groups) groups.set(seriesId, sortSeriesItems(group));
  return groups;
}

/**
 * Finds the current item and its neighbors after sorting supplied candidates in reading order.
 *
 * @param items - Already scoped series candidates.
 * @param currentId - Identifier of the current item.
 * @returns Sorted items, a zero-based index, and available neighbors, or null if currentId is absent.
 * @remarks Does not filter candidates for series, locale, publication status, or access.
 * @example
 * ```ts
 * import { getSeriesNavigation } from '@alneas/sitekit/content';
 * const navigation = getSeriesNavigation([{ id: 'intro' }, { id: 'next' }], 'intro');
 * ```
 * @typeParam T - Content item shape preserved while sorting, grouping, and selecting adjacent items. Must satisfy the declared SeriesItem constraint.
 */
export function getSeriesNavigation<T extends SeriesItem>(
  items: readonly T[],
  currentId: string,
): SeriesNavigation<T> | null {
  const ordered = sortSeriesItems(items);
  const index = ordered.findIndex(item => item.id === currentId);
  const current = ordered[index];
  if (index < 0 || current === undefined) return null;

  return {
    items: ordered,
    index,
    current,
    ...(ordered[index - 1] !== undefined ? { previous: ordered[index - 1] } : {}),
    ...(ordered[index + 1] !== undefined ? { next: ordered[index + 1] } : {}),
  };
}
