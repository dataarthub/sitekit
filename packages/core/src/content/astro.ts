import type {
  CollectionQuery,
  ContentAdapter,
  ContentItem,
  ContentPage,
  ContentQuery,
} from '../contracts/content.js';

/**
 * Minimal Astro-style entry shape consumed without importing the Astro runtime.
 * @typeParam TData - Frontmatter payload shape carried by the source collection entry. Must satisfy the declared Record<string, unknown> constraint.
 */
export interface AstroContentCollectionEntry<
  TData extends Record<string, unknown> = Record<string, unknown>,
> {
  /**
   * Stable record identifier used for lookup and cross-record references.
   */
  id: string;
  /**
   * URL-facing record identifier, interpreted within its collection.
   */
  slug?: string;
  /**
   * Collection name used to group and select records.
   */
  collection?: string;
  /**
   * Source-specific payload retained without sanitizing arbitrary fields.
   */
  data: TData;
  /**
   * Optional source Markdown used by default page heading extraction.
   */
  body?: string;
}

/**
 * Async callback returning collection entries before framework query filtering and pagination.
 * @param collection - Collection identifier whose complete candidate records are requested.
 * @returns All collection entries before mapping, filtering and pagination.
 * @example
 * ```ts
 * import type { AstroCollectionLoader } from '@alneas/sitekit/content';
 * type Callback = AstroCollectionLoader;
 * export function invoke(callback: Callback, ...args: Parameters<Callback>) {
 *   return callback(...args);
 * }
 * ```
 */
export type AstroCollectionLoader = (
  collection: string,
) => Promise<readonly AstroContentCollectionEntry[]>;

/**
 * Default entry mapping configuration, or a callback replacing the default mapping entirely.
 */
export interface AstroContentAdapterOptions {
  /** Locale used when entry data supplies neither locale nor lang; otherwise defaults to ja. */
  defaultLocale?: string;
  /** Collection-name map of structured-data types used by default entry mapping. */
  structuredDataTypes?: Record<string, string>;
  /**
   * Replaces the default entry mapper; filtering is applied to its returned item.
   * @param entry - Astro-style source entry to normalize before query filtering.
   * @param collection - Collection identifier whose complete candidate records are requested.
   * @returns A normalized canonical content item before query filtering.
   * @example
   * ```ts
   * import type { AstroContentAdapterOptions } from '@alneas/sitekit/content';
   * type Callback = NonNullable<AstroContentAdapterOptions['mapEntry']>;
   * export function invoke(callback: Callback, ...args: Parameters<Callback>) {
   *   return callback(...args);
   * }
   * ```
   */
  mapEntry?: (
    entry: AstroContentCollectionEntry,
    collection: string,
  ) => ContentItem;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function dateValue(value: unknown): string | undefined {
  if (value instanceof Date) return value.toISOString();
  const string = stringValue(value);
  if (!string) return undefined;
  const date = new Date(string);
  return Number.isNaN(date.valueOf()) ? undefined : date.toISOString();
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function headingsFromBody(body: string | undefined): Array<{ id: string; level: number; text: string }> {
  if (!body) return [];
  return [...body.matchAll(/^(#{1,6})\s+(.+)$/gm)]
    .map(match => {
      const hashes = match[1];
      const text = match[2];
      if (!hashes || !text) return null;
      const normalizedText = text.trim();
      return {
        id: normalizedText
          .toLowerCase()
          .replace(/[^\p{L}\p{N}\s-]/gu, '')
          .trim()
          .replace(/\s+/g, '-'),
        level: hashes.length,
        text: normalizedText,
      };
    })
    .filter((heading): heading is { id: string; level: number; text: string } => heading !== null);
}

function defaultMapEntry(
  entry: AstroContentCollectionEntry,
  collection: string,
  options: AstroContentAdapterOptions,
): ContentItem {
  const data = entry.data;
  const draft = data.draft === true;
  const isPaid = data.isPaid === true;
  const visibility = isPaid ? 'paid' : 'public';
  const slug = entry.slug ?? stringValue(data.slug) ?? entry.id;
  const locale = stringValue(data.locale) ?? stringValue(data.lang) ?? options.defaultLocale ?? 'ja';
  const summary = stringValue(data.description ?? data.summary);
  const publishedAt = dateValue(data.publishedAt ?? data.pubDate);
  const modifiedAt = dateValue(data.modifiedAt ?? data.updatedDate);
  const status = draft
    ? 'draft'
    : data.status === 'scheduled' || data.status === 'archived'
      ? data.status
      : 'published';

  return {
    id: entry.id,
    collection,
    slug,
    locale,
    title: stringValue(data.title) ?? entry.id,
    ...(summary ? { summary } : {}),
    ...(entry.body !== undefined ? { body: entry.body } : {}),
    tags: stringArray(data.tags),
    status,
    access: { visibility, aiIndexable: visibility === 'public' && !draft },
    ...(options.structuredDataTypes?.[collection]
      ? { structuredDataType: options.structuredDataTypes[collection] }
      : {}),
    ...(publishedAt ? { publishedAt } : {}),
    ...(modifiedAt ? { modifiedAt } : {}),
    source: { kind: 'generated', id: entry.id },
    data,
  };
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

/**
 * Maps Astro-style collection entries into content pages and filtered collection lists.
 *
 * @param loadCollection - Host-supplied collection loader; this helper does not import the Astro runtime.
 * @param options - Locale fallback, per-collection structured-data types, and optional entry mapper.
 * @returns A content adapter with Markdown heading extraction and cursor/limit slicing.
 * @remarks Default mapping uses ja when neither entry locale nor defaultLocale exists. Draft filtering is a query convenience, not an authorization boundary. Loader and mapper errors reject query operations.
 * @example
 * ```ts
 * import { createAstroContentCollectionAdapter } from '@alneas/sitekit/content';
 * const adapter = createAstroContentCollectionAdapter(
 *   async () => [{ id: 'welcome', data: { title: 'Welcome', locale: 'en' }, body: '# Welcome' }],
 *   { defaultLocale: 'en' },
 * );
 * const page = await adapter.getPage({ collection: 'posts', id: 'welcome' });
 * ```
 */
export function createAstroContentCollectionAdapter(
  loadCollection: AstroCollectionLoader,
  options: AstroContentAdapterOptions = {},
): ContentAdapter {
  const mapEntry = options.mapEntry ?? ((entry, collection) => defaultMapEntry(entry, collection, options));

  async function loadItems(collection: string): Promise<ContentItem[]> {
    const entries = await loadCollection(collection);
    return entries.map(entry => mapEntry(entry, collection));
  }

  return {
    async getPage(query: ContentQuery): Promise<ContentPage | null> {
      const collection = query.collection;
      if (!collection) return null;
      const items = await loadItems(collection);
      const item = items.find(candidate =>
        (query.id === undefined || candidate.id === query.id) &&
        (query.slug === undefined || candidate.slug === query.slug) &&
        matchesQuery(candidate, query),
      );
      if (!item) return null;

      return {
        ...item,
        headings: headingsFromBody(item.body),
        relatedContentIds: stringArray(item.data.relatedContentIds),
      };
    },

    async listCollection(query: CollectionQuery): Promise<ContentItem[]> {
      const items = (await loadItems(query.collection)).filter(item => matchesQuery(item, query));
      const offset = query.cursor ? Number.parseInt(query.cursor, 10) || 0 : 0;
      const limit = query.limit ?? items.length;
      return items.slice(offset, offset + limit);
    },
  };
}
