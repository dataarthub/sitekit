import type {
  CollectionQuery,
  ContentAdapter,
  ContentItem,
  ContentPage,
  ContentQuery,
} from '../contracts/content.js';

/**
 * Async host callback returning every candidate record for a collection; query filtering is applied after mapping.
 * @typeParam TRecord - Source record shape preserved until the host mapper produces canonical content.
 * @param collection - Collection identifier whose complete candidate records are requested.
 * @returns All source records before mapping, filtering and pagination.
 * @example
 * ```ts
 * import type { RecordCollectionLoader } from '@alneas/sitekit/content';
 * type Callback = RecordCollectionLoader<unknown>;
 * export function invoke(callback: Callback, ...args: Parameters<Callback>) {
 *   return callback(...args);
 * }
 * ```
 */
export type RecordCollectionLoader<TRecord> = (
  collection: string,
) => Promise<readonly TRecord[]>;

/**
 * Host-owned conversion from source records to normalized content and optional page details.
 * @typeParam TRecord - Source record shape preserved until the host mapper produces canonical content.
 */
export interface RecordContentAdapterOptions<TRecord> {
  /**
   * Converts each source record to the normalized content contract before filtering.
   * @param record - Source record to normalize before query filtering.
   * @param collection - Collection identifier whose complete candidate records are requested.
   * @returns A normalized canonical content item before query filtering.
   * @example
   * ```ts
   * import type { RecordContentAdapterOptions } from '@alneas/sitekit/content';
   * type Callback = NonNullable<RecordContentAdapterOptions<unknown>['mapRecord']>;
   * export function invoke(callback: Callback, ...args: Parameters<Callback>) {
   *   return callback(...args);
   * }
   * ```
   */
  mapRecord: (record: TRecord, collection: string) => ContentItem;
  /**
   * Overrides default Markdown-heading and related-ID extraction for page queries.
   * @param item - Canonical content item to enrich with page-specific details.
   * @returns A page enriched with host-defined headings and related content.
   * @example
   * ```ts
   * import type { RecordContentAdapterOptions } from '@alneas/sitekit/content';
   * type Callback = NonNullable<RecordContentAdapterOptions<unknown>['createPage']>;
   * export function invoke(callback: Callback, ...args: Parameters<Callback>) {
   *   return callback(...args);
   * }
   * ```
   */
  createPage?: (item: ContentItem) => ContentPage;
}

function matchesQuery(
  item: ContentItem,
  query: { locale?: string; tags?: string[]; includeDrafts?: boolean },
): boolean {
  if (query.locale && item.locale !== query.locale) return false;
  if (!query.includeDrafts && item.status === 'draft') return false;
  if (query.tags && !query.tags.every(tag => item.tags.includes(tag))) return false;
  return true;
}

function defaultCreatePage(item: ContentItem): ContentPage {
  const headings = [...(item.body ?? '').matchAll(/^(#{1,6})\s+(.+)$/gm)]
    .map(match => {
      const hashes = match[1];
      const text = match[2]?.trim();
      if (!hashes || !text) return null;
      return {
        id: text
          .toLowerCase()
          .replace(/[^\p{L}\p{N}\s-]/gu, '')
          .trim()
          .replace(/\s+/g, '-'),
        level: hashes.length,
        text,
      };
    })
    .filter(
      (heading): heading is { id: string; level: number; text: string } => heading !== null,
    );

  const relatedContentIds = Array.isArray(item.data.relatedContentIds)
    ? item.data.relatedContentIds.filter((value): value is string => typeof value === 'string')
    : [];

  return { ...item, headings, relatedContentIds };
}

/**
 * Maps host-owned records into queryable normalized content without depending on the source storage client.
 *
 * @param loadCollection - Loads all records for a named collection on each query.
 * @param options - Required record mapper and optional page conversion callback.
 * @returns An adapter filtering locale, draft status, and all requested tags, then slicing lists by numeric cursor and limit.
 * @remarks Page queries require a collection. Default page conversion extracts Markdown headings and relatedContentIds; it does not render or sanitize body content. Loader and mapper failures reject query operations.
 * @example
 * ```ts
 * import { createRecordContentAdapter } from '@alneas/sitekit/content';
 * import type { ContentItem } from '@alneas/sitekit/contracts';
 * const records: ContentItem[] = [];
 * const adapter = createRecordContentAdapter(async () => records, { mapRecord: record => record });
 * const posts = await adapter.listCollection({ collection: 'posts', locale: 'en' });
 * ```
 * @typeParam TRecord - Source record shape preserved until the host mapper produces canonical content.
 */
export function createRecordContentAdapter<TRecord>(
  loadCollection: RecordCollectionLoader<TRecord>,
  options: RecordContentAdapterOptions<TRecord>,
): ContentAdapter {
  async function loadItems(collection: string): Promise<ContentItem[]> {
    const records = await loadCollection(collection);
    return records.map(record => options.mapRecord(record, collection));
  }

  return {
    async getPage(query: ContentQuery): Promise<ContentPage | null> {
      if (!query.collection) return null;
      const items = await loadItems(query.collection);
      const item = items.find(candidate =>
        (query.id === undefined || candidate.id === query.id) &&
        (query.slug === undefined || candidate.slug === query.slug) &&
        matchesQuery(candidate, query),
      );
      if (!item) return null;
      return options.createPage?.(item) ?? defaultCreatePage(item);
    },

    async listCollection(query: CollectionQuery): Promise<ContentItem[]> {
      const items = (await loadItems(query.collection)).filter(item => matchesQuery(item, query));
      const offset = query.cursor ? Number.parseInt(query.cursor, 10) || 0 : 0;
      const limit = query.limit ?? items.length;
      return items.slice(offset, offset + limit);
    },
  };
}
