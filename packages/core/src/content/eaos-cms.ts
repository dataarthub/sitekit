import type {
  CollectionQuery,
  ContentAdapter,
  ContentItem,
  ContentPage,
  ContentQuery,
  MediaAdapter,
  MediaAsset,
} from '../contracts/content.js';
import { createRecordContentAdapter } from './records.js';

/**
 * CMS content-type label; known labels have default collection mappings and custom strings are supported.
 */
export type EaosCmsContentType = 'POST' | 'PAGE' | 'PAGES' | 'NEWS' | (string & {});

/**
 * Public taxonomy entry whose slug becomes a normalized content tag.
 */
export interface EaosCmsCategoryRecord {
  /**
   * Stable record identifier used for lookup and cross-record references.
   */
  id: string;
  /**
   * Human-readable or registry lookup name interpreted by the consuming host.
   */
  name: string;
  /**
   * URL-facing record identifier, interpreted within its collection.
   */
  slug: string;
}

/**
 * Public asset descriptor containing delivery URL and display/integrity metadata, without a storage object key.
 */
export interface EaosCmsAssetRecord {
  /**
   * Stable record identifier used for lookup and cross-record references.
   */
  id: string;
  /**
   * Original display filename, when supplied by the CMS.
   */
  filename?: string;
  /** Public delivery URL; parsing checks its string shape, not reachability or URL security. */
  cdnUrl: string;
  /** SHA-256 of the original public image bytes, lowercase hexadecimal. */
  sha256?: string;
  /**
   * Declared media MIME type; consumers must validate bytes where required.
   */
  mimeType?: string;
  /**
   * Default accessible media description, used when localized descriptions are unavailable.
   */
  altText?: string;
  /**
   * Japanese accessible description retained for localized rendering.
   */
  altJa?: string;
  /**
   * English accessible description retained for localized rendering.
   */
  altEn?: string;
  /**
   * Source-defined media category label.
   */
  category?: string;
  /**
   * Human-readable display title supplied by the content source.
   */
  title?: string;
  /**
   * Optional display caption for the media.
   */
  caption?: string;
  /**
   * Intrinsic or rendition width in pixels, when known.
   */
  width?: number;
  /**
   * Intrinsic or rendition height in pixels, when known.
   */
  height?: number;
  /**
   * Rights or licensing information supplied by the source.
   */
  rights?: string;
  /**
   * Taxonomy labels used by supported adapter filters; record adapters require every requested tag.
   */
  tags?: string[];
}

/**
 * Public CMS publication record; approval and access selection belong to the supplying source.
 */
export interface EaosCmsPublishedContentRecord {
  /**
   * Stable record identifier used for lookup and cross-record references.
   */
  id: string;
  /**
   * Human-readable display title supplied by the content source.
   */
  title: string;
  /**
   * URL-facing record identifier, interpreted within its collection.
   */
  slug: string;
  /**
   * Declared payload MIME type or CMS content category, according to the enclosing contract.
   */
  contentType: EaosCmsContentType;
  /** Published Markdown body, preserved without rendering or sanitization. */
  bodyMarkdown: string;
  /** Optional rich-body payload, retained without editor-specific validation. */
  bodyJson?: unknown;
  /**
   * Locale identifier associated with the record or requested result.
   */
  locale?: string;
  /**
   * Optional search/display title override retained in normalized record data.
   */
  metaTitle?: string;
  /**
   * Optional search/display summary override retained in normalized record data.
   */
  metaDescription?: string;
  /**
   * CMS taxonomy records whose slugs are mapped to normalized tags.
   */
  categories?: EaosCmsCategoryRecord[];
  /**
   * Optional lead image descriptor retained as content metadata.
   */
  eyecatch?: EaosCmsAssetRecord;
  /**
   * Identifiers of assets associated with this published record.
   */
  mediaAssetIds?: string[];
  /**
   * Embedded asset descriptors associated with this record.
   */
  mediaAssets?: EaosCmsAssetRecord[];
  /** Publication date text; mapping to normalized content requires a parseable date. */
  publishedAt: string;
  /** Optional modification date text; mapping requires a parseable date when present. */
  modifiedAt?: string;
}

/**
 * Mapping options for converting CMS content types, locale fallbacks, and canonical URLs.
 */
export interface EaosCmsContentAdapterOptions {
  /** Fallback when record.locale is absent; defaults to ja. */
  defaultLocale?: string;
  /** Optional prefix for collection/encoded-slug canonical URLs; not validated here. */
  canonicalBaseUrl?: string;
  /** Overrides default content-type collection names; unknown types otherwise use lowercase labels. */
  collectionByType?: Partial<Record<string, string>>;
}

/**
 * Host boundary returning approved public content records on demand.
 */
export interface EaosCmsContentLoader {
  /**
   * Loads approved public content records from the host source.
   *
   * @returns Approved public content records supplied by the host.
   * @example
   * ```ts
   * import type { EaosCmsContentLoader } from '@alneas/sitekit/content';
   * type Callback = NonNullable<EaosCmsContentLoader['loadPublished']>;
   * export function invoke(host: EaosCmsContentLoader, ...args: Parameters<Callback>) {
   *   return host.loadPublished(...args);
   * }
   * ```
   */
  loadPublished(): Promise<readonly EaosCmsPublishedContentRecord[]>;
}

/**
 * Host boundary returning approved public asset descriptors on demand.
 */
export interface EaosCmsAssetLoader {
  /**
   * Loads approved public media descriptors from the host source.
   *
   * @returns Approved public asset descriptors supplied by the host.
   * @example
   * ```ts
   * import type { EaosCmsAssetLoader } from '@alneas/sitekit/content';
   * type Callback = NonNullable<EaosCmsAssetLoader['loadPublishedAssets']>;
   * export function invoke(host: EaosCmsAssetLoader, ...args: Parameters<Callback>) {
   *   return host.loadPublishedAssets(...args);
   * }
   * ```
   */
  loadPublishedAssets(): Promise<readonly EaosCmsAssetRecord[]>;
}

/**
 * One site publication revision containing public posts and optional top-level assets.
 */
export interface EaosCmsPublishedSnapshot {
  /** Declares the publication expects SHA-256 image integrity; build pinning enforces missing hashes. */
  imageIntegrity?: 'sha256';
  /**
   * Site identifier used to scope lookup, publication, or configuration.
   */
  siteId: string;
  /** Positive safe integer publication revision. */
  revision: number;
  /**
   * Optional host template identifier attached to this publication.
   */
  templateId?: string;
  /**
   * Approved public content records contained in this publication.
   */
  posts: readonly EaosCmsPublishedContentRecord[];
  /** Top-level public media inventory; embedded post assets are not automatically merged into it. */
  assets?: readonly EaosCmsAssetRecord[];
}

/**
 * Host boundary loading one public CMS publication snapshot per call.
 */
export interface EaosCmsSnapshotLoader {
  /**
   * Loads one approved public site publication from the host source.
   *
   * @returns One approved public site publication snapshot.
   * @example
   * ```ts
   * import type { EaosCmsSnapshotLoader } from '@alneas/sitekit/content';
   * type Callback = NonNullable<EaosCmsSnapshotLoader['loadPublishedSnapshot']>;
   * export function invoke(host: EaosCmsSnapshotLoader, ...args: Parameters<Callback>) {
   *   return host.loadPublishedSnapshot(...args);
   * }
   * ```
   */
  loadPublishedSnapshot(): Promise<EaosCmsPublishedSnapshot>;
}

/**
 * Site identifier and exact serialized request body supplied to a dynamic authentication-header callback.
 */
export interface EaosCmsSnapshotRequest {
  /**
   * Site identifier used to scope lookup, publication, or configuration.
   */
  siteId: string;
  /**
   * Exact serialized JSON body sent to or signed for the publication endpoint.
   */
  body: string;
}

/**
 * Minimal fetch-response surface required for snapshot HTTP loading.
 */
export interface EaosCmsSnapshotHttpResponse {
  /**
   * Whether the HTTP status indicates success according to the transport.
   */
  ok: boolean;
  /**
   * Numeric HTTP response status used in transport failure diagnostics.
   */
  status: number;
  /**
   * Parses the transport response as JSON.
   *
   * @returns The parsed response payload; parsing failures reject.
   * @example
   * ```ts
   * import type { EaosCmsSnapshotHttpResponse } from '@alneas/sitekit/content';
   * type Callback = NonNullable<EaosCmsSnapshotHttpResponse['json']>;
   * export function invoke(host: EaosCmsSnapshotHttpResponse, ...args: Parameters<Callback>) {
   *   return host.json(...args);
   * }
   * ```
   */
  json(): Promise<unknown>;
}

/**
 * Injectable POST transport returning a response whose JSON is validated by the snapshot loader.
 * @param url - Destination URL for this HTTP request.
 * @param init - HTTP method, headers and serialized request body.
 * @returns HTTP response whose JSON is validated by the snapshot loader.
 * @example
 * ```ts
 * import type { EaosCmsSnapshotHttpClient } from '@alneas/sitekit/content';
 * type Callback = EaosCmsSnapshotHttpClient;
 * export function invoke(callback: Callback, ...args: Parameters<Callback>) {
 *   return callback(...args);
 * }
 * ```
 */
export type EaosCmsSnapshotHttpClient = (
  url: string,
  init: {
    /**
     * HTTP request method; the receiving API documents the supported values and default.
     */
    method: 'POST';
    /**
     * HTTP headers supplied by the host; keep authentication values in server-side code.
     */
    headers: Record<string, string>;
    /**
     * Exact serialized JSON body sent to or signed for the publication endpoint.
     */
    body: string;
  },
) => Promise<EaosCmsSnapshotHttpResponse>;

/**
 * Server-side endpoint, site identity, transport, and optional static or request-derived authentication headers.
 */
export interface HttpEaosCmsSnapshotLoaderOptions {
  /** HTTPS snapshot endpoint receiving a POST with the requested siteId. */
  endpoint: string;
  /**
   * Site identifier used to scope lookup, publication, or configuration.
   */
  siteId: string;
  /** Optional transport; otherwise uses global fetch. */
  fetch?: EaosCmsSnapshotHttpClient;
  /**
   * Static or request-derived headers; supply authentication only from server-side code.
   * @param request - Operation input supplied to the host boundary.
   * @returns Authentication headers for this exact site and serialized request.
   * @example
   * ```ts
   * import type { HttpEaosCmsSnapshotLoaderOptions } from '@alneas/sitekit/content';
   * type Callback = Extract<NonNullable<HttpEaosCmsSnapshotLoaderOptions['headers']>, (...args: never[]) => unknown>;
   * export function invoke(callback: Callback, ...args: Parameters<Callback>) {
   *   return callback(...args);
   * }
   * ```
   */
  headers?: Record<string, string>
    | ((request: EaosCmsSnapshotRequest) => Record<string, string> | Promise<Record<string, string>>);
}

/**
 * Normalized content and media adapters sharing one supplied snapshot and its site/revision identity.
 */
export interface EaosCmsSnapshotAdapters {
  /**
   * Site identifier used to scope lookup, publication, or configuration.
   */
  siteId: string;
  /** Positive safe integer publication revision. */
  revision: string;
  /**
   * Content adapter used to retrieve canonical records.
   */
  content: ContentAdapter;
  /**
   * Media adapter or inventory used by the consuming pipeline.
   */
  media: MediaAdapter;
}

const defaultCollectionByType: Record<string, string> = {
  POST: 'posts', PAGE: 'pages', PAGES: 'pages', NEWS: 'news',
};

function defaultFetch(): EaosCmsSnapshotHttpClient {
  const fetcher = (globalThis as unknown as { fetch?: EaosCmsSnapshotHttpClient }).fetch;
  if (!fetcher) throw new Error('A fetch implementation is required outside Workers');
  return fetcher;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function requiredString(record: Record<string, unknown>, field: string, path: string): string {
  const value = record[field];
  if (typeof value !== 'string' || value === '') throw new Error(`Invalid EAOS CMS snapshot field: ${path}.${field}`);
  return value;
}

function stringAllowEmpty(record: Record<string, unknown>, field: string, path: string): string {
  const value = record[field];
  if (typeof value !== 'string') throw new Error(`Invalid EAOS CMS snapshot field: ${path}.${field}`);
  return value;
}

function optionalString(record: Record<string, unknown>, field: string, path: string): string | undefined {
  const value = record[field];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new Error(`Invalid EAOS CMS snapshot field: ${path}.${field}`);
  return value;
}

function optionalNumber(record: Record<string, unknown>, field: string, path: string): number | undefined {
  const value = record[field];
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) {
    throw new Error(`Invalid EAOS CMS snapshot field: ${path}.${field}`);
  }
  return value;
}

function optionalStringArray(record: Record<string, unknown>, field: string, path: string): string[] | undefined {
  const value = record[field];
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || item === '')) {
    throw new Error(`Invalid EAOS CMS snapshot field: ${path}.${field}`);
  }
  return [...value] as string[];
}

function parseCategory(value: unknown, path: string): EaosCmsCategoryRecord {
  if (!isRecord(value)) throw new Error(`Invalid EAOS CMS snapshot category: ${path}`);
  return {
    id: requiredString(value, 'id', path),
    name: requiredString(value, 'name', path),
    slug: requiredString(value, 'slug', path),
  };
}

function parseAsset(value: unknown, path: string): EaosCmsAssetRecord {
  if (!isRecord(value)) throw new Error(`Invalid EAOS CMS snapshot asset: ${path}`);
  if ('objectKey' in value) throw new Error(`Private EAOS CMS field is not allowed: ${path}.objectKey`);
  const sha256 = optionalString(value, 'sha256', path);
  if (sha256 !== undefined && !/^[a-f0-9]{64}$/.test(sha256)) throw new Error(`Invalid image sha256: ${path}.sha256`);
  const filename = optionalString(value, 'filename', path);
  const mimeType = optionalString(value, 'mimeType', path);
  const altText = optionalString(value, 'altText', path);
  const altJa = optionalString(value, 'altJa', path);
  const altEn = optionalString(value, 'altEn', path);
  const category = optionalString(value, 'category', path);
  const title = optionalString(value, 'title', path);
  const caption = optionalString(value, 'caption', path);
  const width = optionalNumber(value, 'width', path);
  const height = optionalNumber(value, 'height', path);
  const rights = optionalString(value, 'rights', path);
  const tags = optionalStringArray(value, 'tags', path);
  return {
    id: requiredString(value, 'id', path),
    cdnUrl: requiredString(value, 'cdnUrl', path),
    ...(sha256 !== undefined ? { sha256 } : {}),
    ...(filename !== undefined ? { filename } : {}),
    ...(mimeType !== undefined ? { mimeType } : {}),
    ...(altText !== undefined ? { altText } : {}),
    ...(altJa !== undefined ? { altJa } : {}),
    ...(altEn !== undefined ? { altEn } : {}),
    ...(category !== undefined ? { category } : {}),
    ...(title !== undefined ? { title } : {}),
    ...(caption !== undefined ? { caption } : {}),
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
    ...(rights !== undefined ? { rights } : {}),
    ...(tags !== undefined ? { tags } : {}),
  };
}

function parsePublishedContent(value: unknown, path: string): EaosCmsPublishedContentRecord {
  if (!isRecord(value)) throw new Error(`Invalid EAOS CMS snapshot post: ${path}`);
  const categories = value.categories;
  if (categories !== undefined && !Array.isArray(categories)) {
    throw new Error(`Invalid EAOS CMS snapshot categories: ${path}.categories`);
  }
  const eyecatch = value.eyecatch === undefined
    ? undefined
    : parseAsset(value.eyecatch, `${path}.eyecatch`);
  const parsedCategories = categories === undefined
    ? undefined
    : categories.map((category, index) => parseCategory(category, `${path}.categories[${index}]`));
  const bodyJson = value.bodyJson;
  if (bodyJson !== undefined && (typeof bodyJson !== 'object' || bodyJson === null)) {
    throw new Error(`Invalid EAOS CMS snapshot field: ${path}.bodyJson`);
  }
  const locale = optionalString(value, 'locale', path);
  const mediaAssetIds = optionalStringArray(value, 'mediaAssetIds', path);
  const mediaAssets = value.mediaAssets;
  if (mediaAssets !== undefined && !Array.isArray(mediaAssets)) {
    throw new Error(`Invalid EAOS CMS snapshot field: ${path}.mediaAssets`);
  }
  const metaTitle = optionalString(value, 'metaTitle', path);
  const metaDescription = optionalString(value, 'metaDescription', path);
  const modifiedAt = optionalString(value, 'modifiedAt', path);
  return {
    id: requiredString(value, 'id', path),
    title: requiredString(value, 'title', path),
    slug: requiredString(value, 'slug', path),
    contentType: requiredString(value, 'contentType', path),
    bodyMarkdown: stringAllowEmpty(value, 'bodyMarkdown', path),
    ...(bodyJson !== undefined ? { bodyJson } : {}),
    ...(locale !== undefined ? { locale } : {}),
    ...(metaTitle !== undefined ? { metaTitle } : {}),
    ...(metaDescription !== undefined ? { metaDescription } : {}),
    ...(parsedCategories ? { categories: parsedCategories } : {}),
    ...(eyecatch ? { eyecatch } : {}),
    ...(mediaAssetIds ? { mediaAssetIds } : {}),
    ...(mediaAssets ? { mediaAssets: mediaAssets.map((asset, index) => parseAsset(asset, `${path}.mediaAssets[${index}]`)) } : {}),
    publishedAt: requiredString(value, 'publishedAt', path),
    ...(modifiedAt !== undefined ? { modifiedAt } : {}),
  };
}

/**
 * Validates and projects unknown publication JSON into the supported public CMS snapshot shape.
 *
 * @param value - Decoded snapshot JSON to validate.
 * @returns A newly mapped snapshot containing recognized public fields.
 * @throws An Error when required fields, revision, or optional recognized fields are invalid.
 * @remarks Rejects asset objectKey fields and invalid hashes, but does not authenticate the publisher, fetch asset bytes, verify signatures, or validate date strings. Unknown fields are omitted.
 * @example
 * ```ts
 * import { parsePublishedSnapshot } from '@alneas/sitekit/content';
 * const snapshot = parsePublishedSnapshot({ siteId: 'example', revision: 1, posts: [] });
 * ```
 */
export function parsePublishedSnapshot(value: unknown): EaosCmsPublishedSnapshot {
  if (!isRecord(value)) throw new Error('Invalid EAOS CMS publication snapshot response');
  const siteId = requiredString(value, 'siteId', 'snapshot');
  if (value.imageIntegrity !== undefined && value.imageIntegrity !== 'sha256') throw new Error('Invalid snapshot imageIntegrity');
  const revision = value.revision;
  if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 1) {
    throw new Error('Invalid EAOS CMS publication snapshot revision');
  }
  const templateId = optionalString(value, 'templateId', 'snapshot');
  if (!Array.isArray(value.posts)) throw new Error('Invalid EAOS CMS publication snapshot posts');
  const assets = value.assets;
  if (assets !== undefined && !Array.isArray(assets)) {
    throw new Error('Invalid EAOS CMS publication snapshot assets');
  }
  return {
    ...(value.imageIntegrity === 'sha256' ? { imageIntegrity: 'sha256' as const } : {}),
    siteId,
    revision,
    ...(templateId !== undefined ? { templateId } : {}),
    posts: value.posts.map((post, index) => parsePublishedContent(post, `snapshot.posts[${index}]`)),
    ...(assets ? {
      assets: assets.map((asset, index) => parseAsset(asset, `snapshot.assets[${index}]`)),
    } : {}),
  };
}

/**
 * Creates a loader that POSTs a site identifier and validates the returned publication snapshot.
 *
 * @param options - HTTPS endpoint, expected site identifier, optional fetch client, and request headers.
 * @returns A loader that fetches and validates a fresh snapshot on every call.
 * @throws An Error for a missing siteId, invalid/non-HTTPS endpoint, or unavailable fetch. Loader calls reject on HTTP errors, malformed snapshots, mismatched site IDs, or client/header callback failures.
 * @remarks Keep authentication headers and signing callbacks on the server. Authentication is provided by the caller; this helper validates the response shape and site identity. It does not pin a revision or configure a timeout.
 * @example
 * ```ts
 * import { createHttpEaosCmsSnapshotLoader } from '@alneas/sitekit/content';
 * const loader = createHttpEaosCmsSnapshotLoader({ endpoint: 'https://example.org/api/publication', siteId: 'example' });
 * const snapshot = await loader.loadPublishedSnapshot();
 * ```
 */
export function createHttpEaosCmsSnapshotLoader(
  options: HttpEaosCmsSnapshotLoaderOptions,
): EaosCmsSnapshotLoader {
  if (!options.siteId) throw new Error('EAOS CMS siteId is required');
  let endpoint: URL;
  try {
    endpoint = new URL(options.endpoint);
  } catch {
    throw new Error('EAOS CMS snapshot endpoint must be a valid HTTPS URL');
  }
  if (endpoint.protocol !== 'https:') throw new Error('EAOS CMS snapshot endpoint must use HTTPS');
  const fetcher = options.fetch ?? defaultFetch();

  return {
    async loadPublishedSnapshot(): Promise<EaosCmsPublishedSnapshot> {
      const body = JSON.stringify({ siteId: options.siteId });
      const request = { siteId: options.siteId, body };
      const customHeaders = typeof options.headers === 'function'
        ? await options.headers(request)
        : options.headers ?? {};
      const response = await fetcher(endpoint.toString(), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...customHeaders,
        },
        body,
      });
      if (!response.ok) throw new Error(`EAOS CMS snapshot request failed (${response.status})`);
      const snapshot = parsePublishedSnapshot(await response.json());
      if (snapshot.siteId !== options.siteId) {
        throw new Error('EAOS CMS snapshot response does not match the requested site');
      }
      return snapshot;
    },
  };
}

function collectionFor(record: EaosCmsPublishedContentRecord, options: EaosCmsContentAdapterOptions): string {
  return options.collectionByType?.[record.contentType]
    ?? defaultCollectionByType[record.contentType]
    ?? record.contentType.toLowerCase();
}

function canonicalUrl(base: string | undefined, collection: string, slug: string): string | undefined {
  if (!base) return undefined;
  return `${base.replace(/\/$/, '')}/${collection}/${encodeURIComponent(slug)}`;
}

/**
 * Maps a published CMS record to normalized content with category tags and optional canonical URL.
 *
 * @param record - Already approved public CMS content record.
 * @param options - Locale fallback, canonical base URL, and content-type collection overrides.
 * @returns A published, public, AI-indexable content item with ISO publication dates.
 * @throws A RangeError when a supplied publication or modification date cannot be converted to ISO format.
 * @remarks This mapper assumes the caller has selected publishable content; it does not enforce authorization or sanitize bodyMarkdown/bodyJson. Unknown types fall back to lowercase collection names.
 * @example
 * ```ts
 * import { mapEaosCmsPublishedContent } from '@alneas/sitekit/content';
 * const item = mapEaosCmsPublishedContent({ id: 'welcome', title: 'Welcome', slug: 'welcome', contentType: 'POST', bodyMarkdown: '# Welcome', publishedAt: '2026-01-01T00:00:00Z' }, { defaultLocale: 'en' });
 * ```
 */
export function mapEaosCmsPublishedContent(
  record: EaosCmsPublishedContentRecord,
  options: EaosCmsContentAdapterOptions = {},
): ContentItem {
  const collection = collectionFor(record, options);
  const categories = record.categories ?? [];
  const structuredDataType = record.contentType === 'NEWS' || record.contentType === 'POST'
    ? 'Article'
    : 'WebPage';
  const url = canonicalUrl(options.canonicalBaseUrl, collection, record.slug);
  return {
    id: record.id,
    collection,
    slug: record.slug,
    locale: record.locale ?? options.defaultLocale ?? 'ja',
    title: record.title,
    ...(record.metaDescription ? { summary: record.metaDescription } : {}),
    body: record.bodyMarkdown,
    tags: categories.map(category => category.slug),
    status: 'published',
    access: { visibility: 'public', aiIndexable: true },
    structuredDataType,
    publishedAt: new Date(record.publishedAt).toISOString(),
    ...(record.modifiedAt ? { modifiedAt: new Date(record.modifiedAt).toISOString() } : {}),
    ...(url ? { canonicalUrl: url } : {}),
    source: { kind: 'eaos-cms', id: record.id },
    data: {
      contentType: record.contentType,
      metaTitle: record.metaTitle ?? '',
      categories,
      ...(record.bodyJson !== undefined ? { bodyJson: record.bodyJson } : {}),
      ...(record.eyecatch ? { eyecatchAssetId: record.eyecatch.id } : {}),
      ...(record.mediaAssetIds ? { mediaAssetIds: [...record.mediaAssetIds] } : {}),
      ...(record.mediaAssets ? { mediaAssets: record.mediaAssets.map(mapEaosCmsAsset) } : {}),
    },
  };
}

/**
 * Projects public CMS asset fields into the normalized media contract.
 *
 * @param record - Public CMS asset descriptor, already selected for publication.
 * @returns A media asset using cdnUrl, generic altText, tags, and available display metadata.
 * @remarks Does not validate or fetch URLs, apply localized alt text, preserve sha256, or sign delivery URLs. The returned object contains only explicitly mapped fields.
 * @example
 * ```ts
 * import { mapEaosCmsAsset } from '@alneas/sitekit/content';
 * const asset = mapEaosCmsAsset({ id: 'cover', cdnUrl: 'https://example.org/cover.webp', altText: 'Cover' });
 * ```
 */
export function mapEaosCmsAsset(record: EaosCmsAssetRecord): MediaAsset {
  return {
    id: record.id,
    url: record.cdnUrl,
    alt: record.altText ?? '',
    ...((record.title ?? record.filename) ? { title: record.title ?? record.filename } : {}),
    ...(record.caption ? { caption: record.caption } : {}),
    ...(record.width !== undefined ? { width: record.width } : {}),
    ...(record.height !== undefined ? { height: record.height } : {}),
    ...(record.mimeType ? { mimeType: record.mimeType } : {}),
    ...(record.rights ? { rights: record.rights } : {}),
    source: { kind: 'eaos-cms', id: record.id },
    tags: record.tags ?? [],
    provider: 'eaos-cms',
    metadata: {},
  };
}

/**
 * Loads CMS records on each query and maps records belonging to the requested collection.
 *
 * @param loader - Source responsible for returning approved public records.
 * @param options - Collection mapping, locale fallback, and canonical URL configuration.
 * @returns A normalized content adapter with locale/tag filtering and numeric cursor pagination.
 * @remarks The loader owns publication and authorization checks. This adapter does not parse or authenticate its input records; loader and mapping failures reject queries.
 * @example
 * ```ts
 * import { createEaosCmsContentAdapter } from '@alneas/sitekit/content';
 * const adapter = createEaosCmsContentAdapter({ loadPublished: async () => [] }, { defaultLocale: 'en' });
 * const posts = await adapter.listCollection({ collection: 'posts' });
 * ```
 */
export function createEaosCmsContentAdapter(
  loader: EaosCmsContentLoader,
  options: EaosCmsContentAdapterOptions = {},
): ContentAdapter {
  return createRecordContentAdapter(async collection => {
    const records = await loader.loadPublished();
    return records.filter(record => collectionFor(record, options) === collection);
  }, {
    mapRecord: record => mapEaosCmsPublishedContent(record, options),
  });
}

/**
 * Creates content and media adapters backed by one supplied CMS publication snapshot.
 *
 * @param snapshot - Public snapshot retained by reference for subsequent adapter queries.
 * @param options - Content collection mapping, locale fallback, and canonical URL configuration.
 * @returns Site ID, string revision, and adapters reading posts and top-level assets from that snapshot.
 * @throws An Error for an invalid site identity, revision, posts array, or post identifier.
 * @remarks Performs limited identity/revision/post checks, not full parsing or freezing. Parse untrusted JSON first and avoid mutating the snapshot while using its adapters. Embedded post media is not added to the top-level media list.
 * @example
 * ```ts
 * import { createEaosCmsSnapshotAdapters } from '@alneas/sitekit/content';
 * const adapters = createEaosCmsSnapshotAdapters({ siteId: 'example', revision: 1, posts: [], assets: [] }, { defaultLocale: 'en' });
 * ```
 */
export function createEaosCmsSnapshotAdapters(
  snapshot: EaosCmsPublishedSnapshot,
  options: EaosCmsContentAdapterOptions = {},
): EaosCmsSnapshotAdapters {
  if (!snapshot.siteId || !Number.isSafeInteger(snapshot.revision) || snapshot.revision < 1) {
    throw new Error('Invalid EAOS CMS publication snapshot');
  }
  if (!Array.isArray(snapshot.posts) || snapshot.posts.some(post => !post || typeof post.id !== 'string')) {
    throw new Error('Invalid EAOS CMS publication posts');
  }
  const content = createRecordContentAdapter(async collection =>
    snapshot.posts.filter(record => collectionFor(record, options) === collection), {
    mapRecord: record => mapEaosCmsPublishedContent(record, options),
  });
  const media = createEaosCmsMediaAdapter({
    loadPublishedAssets: async () => snapshot.assets ?? [],
  });
  return {
    siteId: snapshot.siteId,
    revision: String(snapshot.revision),
    content,
    media,
  };
}

/**
 * Reads one CMS snapshot and creates both content and media adapters from it.
 *
 * @param loader - Snapshot source invoked once by this call.
 * @param options - Content mapping options passed to createEaosCmsSnapshotAdapters.
 * @returns Adapters sharing the loaded snapshot and its site/revision metadata.
 * @throws Loader failures and adapter snapshot checks propagate.
 * @remarks The loader owns authentication and snapshot validation; returned adapters retain the loaded snapshot by reference.
 * @example
 * ```ts
 * import { loadEaosCmsSnapshotAdapters } from '@alneas/sitekit/content';
 * const adapters = await loadEaosCmsSnapshotAdapters({ loadPublishedSnapshot: async () => ({ siteId: 'example', revision: 1, posts: [] }) });
 * ```
 */
export async function loadEaosCmsSnapshotAdapters(
  loader: EaosCmsSnapshotLoader,
  options: EaosCmsContentAdapterOptions = {},
): Promise<EaosCmsSnapshotAdapters> {
  return createEaosCmsSnapshotAdapters(await loader.loadPublishedSnapshot(), options);
}

/**
 * Maps published CMS assets on each lookup or list request.
 *
 * @param loader - Source responsible for returning approved public assets.
 * @returns An adapter matching identifiers and all requested tags, with optional list limits.
 * @remarks Does not authenticate records or check asset delivery. The mapped shape has no externalId, so queries requesting an externalId do not match these assets. Loader failures reject queries.
 * @example
 * ```ts
 * import { createEaosCmsMediaAdapter } from '@alneas/sitekit/content';
 * const adapter = createEaosCmsMediaAdapter({ loadPublishedAssets: async () => [{ id: 'cover', cdnUrl: 'https://example.org/cover.webp' }] });
 * const cover = await adapter.getMedia({ id: 'cover' });
 * ```
 */
export function createEaosCmsMediaAdapter(loader: EaosCmsAssetLoader): MediaAdapter {
  return {
    async getMedia(query) {
      const assets = (await loader.loadPublishedAssets()).map(mapEaosCmsAsset);
      return assets.find(asset =>
        (query.id === undefined || asset.id === query.id) &&
        (query.externalId === undefined || asset.externalId === query.externalId) &&
        (query.tags === undefined || query.tags.every(tag => asset.tags.includes(tag))),
      ) ?? null;
    },
    async listMedia(query: { tags?: string[]; limit?: number }) {
      const assets = (await loader.loadPublishedAssets()).map(mapEaosCmsAsset).filter(asset =>
        query.tags === undefined || query.tags.every(tag => asset.tags.includes(tag)),
      );
      return assets.slice(0, query.limit ?? assets.length);
    },
  };
}
