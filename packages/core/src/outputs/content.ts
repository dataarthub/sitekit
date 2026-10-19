import type { ContentItem } from '../contracts/content.js';

/** Site metadata and URL resolution shared by feed and AI-navigation outputs. */
export interface ContentOutputOptions {
  /**
   * Display name used in generated output.
   */
  siteName: string;
  /**
   * Site origin or base URL used in output metadata.
   */
  siteUrl: string;
  /**
   * Human-readable description for this record or operation.
   */
  description?: string;
  /**
   * Optional canonical URL of the feed itself.
   */
  feedUrl?: string;
  /**
   * Content records supplied to the consumer.
   */
  items: readonly ContentItem[];
  /**
   * Resolves the public URL of the supplied canonical content.
   * @param item - Eligible canonical content record whose public URL is requested.
   * @returns Public URL inserted into the generated feed or Markdown navigation entry.
   * @example
   * ```ts
   * import type { ContentOutputOptions } from '@alneas/sitekit/outputs';
   * export function useUrlFor(host: ContentOutputOptions, ...args: Parameters<NonNullable<ContentOutputOptions['urlFor']>>) {
   * return host.urlFor(...args);
   * }
   * ```
   */
  urlFor: (item: ContentItem) => string;
  /** Array.slice end index after eligibility filtering and descending publication-date sorting. */
  limit?: number;
}

/** JSON Feed 1.1 entry containing optional plain-text content and publication metadata. */
export interface JsonFeedItem {
  /**
   * Stable identifier for this record.
   */
  id: string;
  /**
   * URL associated with this record.
   */
  url: string;
  /**
   * Display title for this record.
   */
  title: string;
  /**
   * Optional editorial summary.
   */
  summary?: string;
  /**
   * Plain-text feed body copied from the content body.
   */
  content_text?: string;
  /**
   * Source publication timestamp.
   */
  date_published?: string;
  /**
   * Source modification timestamp.
   */
  date_modified?: string;
  /**
   * Editorial tags associated with this content.
   */
  tags?: string[];
  /**
   * Content locale identifier used by JSON Feed.
   */
  language?: string;
}

/** JSON Feed 1.1 document returned before serialization. */
export interface JsonFeed {
  /**
   * JSON Feed specification identifier, fixed at version 1.1.
   */
  version: 'https://jsonfeed.org/version/1.1';
  /**
   * Display title for this record.
   */
  title: string;
  /**
   * Site home URL in JSON Feed format.
   */
  home_page_url: string;
  /**
   * Optional feed URL in JSON Feed format.
   */
  feed_url?: string;
  /**
   * Human-readable description for this record or operation.
   */
  description?: string;
  /**
   * Content records supplied to the consumer.
   */
  items: JsonFeedItem[];
}

function isPublicItem(item: ContentItem): boolean {
  return (
    (item.status === undefined || item.status === 'published') &&
    (item.access?.visibility === undefined || item.access.visibility === 'public') &&
    item.access?.aiIndexable !== false
  );
}

function sortedItems(options: ContentOutputOptions): ContentItem[] {
  return options.items
    .filter(isPublicItem)
    .sort((a, b) => {
      const aTime = a.publishedAt ? Date.parse(a.publishedAt) : 0;
      const bTime = b.publishedAt ? Date.parse(b.publishedAt) : 0;
      return bTime - aTime;
    })
    .slice(0, options.limit ?? options.items.length);
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function cdata(value: string): string {
  return `<![CDATA[${value.replaceAll(']]>', ']]]]><![CDATA[>')}]]>`;
}

function toJsonFeedItem(item: ContentItem, url: string): JsonFeedItem {
  return {
    id: item.id,
    url,
    title: item.title,
    ...(item.summary ? { summary: item.summary } : {}),
    ...(item.body ? { content_text: item.body } : {}),
    ...(item.publishedAt ? { date_published: item.publishedAt } : {}),
    ...(item.modifiedAt ? { date_modified: item.modifiedAt } : {}),
    ...(item.tags.length > 0 ? { tags: item.tags } : {}),
    ...(item.locale ? { language: item.locale } : {}),
  };
}

/**
 * Builds a JSON Feed 1.1 object from eligible public content.
 *
 * @param options - Site metadata, content, URL resolver, and optional item limit.
 * @returns A JSON-serializable feed object, including body as content_text when present.
 * @remarks Includes only published (or unspecified-status), public, AI-indexable items, sorted newest first. The limit is applied after filtering.
 * @example
 * ```ts
 * import { buildJsonFeed } from '@alneas/sitekit/outputs';
 * const output = buildJsonFeed({ siteName: 'Example', siteUrl: 'https://example.com', items: [], urlFor: item => `https://example.com/${item.slug}` });
 * ```
 */
export function buildJsonFeed(options: ContentOutputOptions): JsonFeed {
  const items = sortedItems(options);
  return {
    version: 'https://jsonfeed.org/version/1.1',
    title: options.siteName,
    home_page_url: options.siteUrl,
    ...(options.feedUrl ? { feed_url: options.feedUrl } : {}),
    ...(options.description ? { description: options.description } : {}),
    items: items.map(item => toJsonFeedItem(item, options.urlFor(item))),
  };
}

/**
 * Serializes eligible public content as an RSS 2.0 feed.
 *
 * @param options - Site metadata, content, URL resolver, and optional item limit.
 * @returns RSS XML with escaped values and summary-or-body descriptions.
 * @remarks Includes only published (or unspecified-status), public, AI-indexable items, sorted newest first. The limit is applied after filtering.
 * @example
 * ```ts
 * import { buildRssFeed } from '@alneas/sitekit/outputs';
 * const output = buildRssFeed({ siteName: 'Example', siteUrl: 'https://example.com', items: [], urlFor: item => `https://example.com/${item.slug}` });
 * ```
 */
export function buildRssFeed(options: ContentOutputOptions): string {
  const items = sortedItems(options).map(item => {
    const url = options.urlFor(item);
    const description = item.summary ?? item.body ?? '';
    const categories = item.tags.map(tag => `<category>${escapeXml(tag)}</category>`).join('');
    return [
      '<item>',
      `<guid isPermaLink="true">${escapeXml(url)}</guid>`,
      `<title>${escapeXml(item.title)}</title>`,
      `<link>${escapeXml(url)}</link>`,
      `<description>${cdata(description)}</description>`,
      item.publishedAt ? `<pubDate>${escapeXml(new Date(item.publishedAt).toUTCString())}</pubDate>` : '',
      categories,
      '</item>',
    ].join('');
  }).join('');

  const selfLink = options.feedUrl
    ? `<atom:link href="${escapeXml(options.feedUrl)}" rel="self" type="application/rss+xml"/>`
    : '';
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '<channel>',
    `<title>${escapeXml(options.siteName)}</title>`,
    `<link>${escapeXml(options.siteUrl)}</link>`,
    `<description>${escapeXml(options.description ?? '')}</description>`,
    selfLink,
    items,
    '</channel>',
    '</rss>',
  ].join('');
}

/**
 * Builds a Markdown navigation index of eligible public content.
 *
 * @param options - Site metadata, content, URL resolver, and optional item limit.
 * @returns A newline-terminated index of linked titles and optional summaries.
 * @remarks Includes only published (or unspecified-status), public, AI-indexable items, sorted newest first. The limit is applied after filtering.
 * @example
 * ```ts
 * import { buildLlmsTxt } from '@alneas/sitekit/outputs';
 * const output = buildLlmsTxt({ siteName: 'Example', siteUrl: 'https://example.com', items: [], urlFor: item => `https://example.com/${item.slug}` });
 * ```
 */
export function buildLlmsTxt(options: ContentOutputOptions): string {
  const lines = [`# ${options.siteName}`];
  if (options.description) lines.push(`> ${options.description}`);
  lines.push('', '## Content');
  for (const item of sortedItems(options)) {
    const url = options.urlFor(item);
    const summary = item.summary ? `: ${item.summary}` : '';
    lines.push(`- [${item.title}](${url})${summary}`);
  }
  return `${lines.join('\n')}\n`;
}
