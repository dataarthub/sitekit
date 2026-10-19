import type { ContentItem } from '../contracts/content.js';

/** Body-free searchable metadata with a public or restricted access marker. */
export interface SearchDocument {
  /**
   * Stable identifier for this record.
   */
  id: string;
  /**
   * Host collection identifier.
   */
  collection: string;
  /**
   * Content locale identifier.
   */
  locale: string;
  /**
   * Display title for this record.
   */
  title: string;
  /**
   * Optional editorial summary.
   */
  summary?: string;
  /**
   * URL associated with this record.
   */
  url?: string;
  /**
   * Editorial tags associated with this content.
   */
  tags: string[];
  /**
   * Public or restricted marker; restricted records contain no body fields.
   */
  access: 'public' | 'restricted';
  /**
   * Publication timestamp when supplied by the source.
   */
  publishedAt?: string;
  /**
   * Optional editorial relationships retained from canonical content.
   */
  editorial?: ContentItem['editorial'];
}

/** Controls search URLs and inclusion of members-only or paid records. */
export interface SearchIndexOptions {
  /**
   * Pure URL resolver that may run twice per item; undefined falls back to canonicalUrl.
   * @param item - Eligible canonical content record whose public URL is requested.
   * @returns The item URL, or undefined to fall back to the item canonicalUrl.
   * @example
   * ```ts
   * import type { SearchIndexOptions } from '@alneas/sitekit/search';
   * export function useUrlFor(host: SearchIndexOptions, ...args: Parameters<NonNullable<SearchIndexOptions['urlFor']>>) {
   * return host.urlFor?.(...args);
   * }
   * ```
   */
  urlFor?: (item: ContentItem) => string | undefined;
  /** Includes members and paid records by default; private records are always excluded. */
  includeRestricted?: boolean;
}

function isSearchable(item: ContentItem, includeRestricted: boolean): boolean {
  if (item.status !== undefined && item.status !== 'published') return false;
  if (item.access?.visibility === 'private') return false;
  return includeRestricted || item.access?.visibility === undefined || item.access.visibility === 'public';
}

/**
 * Builds body-free search records from published, non-private content.
 *
 * @param items - Canonical collection to project.
 * @param options - URL resolver and restricted-content inclusion policy (default true).
 * @returns Search records sorted by descending publication time, treating invalid or missing dates as zero.
 * @remarks Members and paid content are included by default, but body and data are never copied. The URL resolver may be called twice per item and should be pure.
 * @example
 * ```ts
 * import { buildSearchDocuments } from '@alneas/sitekit/search';
 * const documents = buildSearchDocuments([], { includeRestricted: false });
 * ```
 */
export function buildSearchDocuments(
  items: readonly ContentItem[],
  options: SearchIndexOptions = {},
): SearchDocument[] {
  return items
    .filter(item => isSearchable(item, options.includeRestricted ?? true))
    .map(item => ({
      id: item.id,
      collection: item.collection,
      locale: item.locale,
      title: item.title,
      ...(item.summary !== undefined ? { summary: item.summary } : {}),
      ...(options.urlFor?.(item) ?? item.canonicalUrl
        ? { url: options.urlFor?.(item) ?? item.canonicalUrl }
        : {}),
      tags: item.tags,
      access: (item.access?.visibility && item.access.visibility !== 'public' ? 'restricted' : 'public') as 'public' | 'restricted',
      ...(item.publishedAt !== undefined ? { publishedAt: item.publishedAt } : {}),
      ...(item.editorial !== undefined ? { editorial: item.editorial } : {}),
    }))
    .sort((a, b) => (Date.parse(b.publishedAt ?? '') || 0) - (Date.parse(a.publishedAt ?? '') || 0));
}

/**
 * Ranks published candidates by shared tags and editorial series within the source locale.
 *
 * @param source - Item supplying the locale, tags, series, and excluded identifier.
 * @param candidates - Items to rank; private and unpublished entries are excluded.
 * @param limit - Maximum results selected by Array.slice; defaults to 5.
 * @returns Matching original content objects, highest score first; ties retain input order.
 * @remarks Shared tags score 3 points each and a shared series scores 5. Restricted bodies are not removed; apply access projection before delivery.
 * @example
 * ```ts
 * import { findRelatedContent } from '@alneas/sitekit/search';
 * const content = { id: 'guide', collection: 'guides', slug: 'guide', locale: 'en', title: 'Guide', tags: [], data: {} };
 * const related = findRelatedContent(content, [], 3);
 * ```
 */
export function findRelatedContent(
  source: ContentItem,
  candidates: readonly ContentItem[],
  limit = 5,
): ContentItem[] {
  const sourceTags = new Set(source.tags);
  const sourceSeries = source.editorial?.seriesId;
  return candidates
    .filter(item => item.id !== source.id && item.locale === source.locale)
    .filter(item => item.status === undefined || item.status === 'published')
    .filter(item => item.access?.visibility !== 'private')
    .map(item => {
      const sharedTags = item.tags.filter(tag => sourceTags.has(tag)).length;
      const sameSeries = sourceSeries !== undefined && item.editorial?.seriesId === sourceSeries;
      return { item, score: sharedTags * 3 + (sameSeries ? 5 : 0) };
    })
    .filter(candidate => candidate.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(candidate => candidate.item);
}
