import type { ZodType } from 'zod';

/** Optional selectors and draft policy interpreted by a content adapter. */
export interface ContentQuery {
  /**
   * Optional exact content identifier selector.
   */
  id?: string;
  /**
   * Optional URL slug selector within the requested collection.
   */
  slug?: string;
  /**
   * Locale identifier associated with the record or requested result.
   */
  locale?: string;
  /**
   * Collection name used to group and select records.
   */
  collection?: string;
  /**
   * Whether draft records may be returned; adapters define support and must enforce authorization separately.
   */
  includeDrafts?: boolean;
}

/** Collection listing selectors with adapter-defined pagination and tag filtering. */
export interface CollectionQuery {
  /**
   * Collection name used to group and select records.
   */
  collection: string;
  /**
   * Locale identifier associated with the record or requested result.
   */
  locale?: string;
  /**
   * Maximum requested item count; pagination behavior belongs to the adapter.
   */
  limit?: number;
  /**
   * Opaque adapter continuation token; record adapters interpret it as a numeric offset.
   */
  cursor?: string;
  /**
   * Taxonomy labels used by supported adapter filters; record adapters require every requested tag.
   */
  tags?: string[];
}

/** Provenance metadata for imported or generated content and media. */
export interface ContentSource {
  /**
   * Origin discriminator describing which integration produced the record.
   */
  kind:
    | 'keystatic'
    | 'eaos-cms'
    | 'd1'
    | 'obsidian'
    | 'r2'
    | 'social'
    | 'external'
    | 'generated';
  /**
   * Stable record identifier used for lookup and cross-record references.
   */
  id?: string;
  /**
   * Delivery or reference URL supplied by the host; this field alone does not validate or authorize access.
   */
  url?: string;
  /**
   * Source synchronization timestamp text, when recorded by the host.
   */
  syncedAt?: string;
}

/** Editorial publication lifecycle; omitted status is treated as published by host projections. */
export type ContentStatus = 'draft' | 'scheduled' | 'published' | 'archived';

/** Public, entitlement-restricted, or private delivery policy. */
export type ContentVisibility = 'public' | 'members' | 'paid' | 'private';

/** Commercial offer category; payment adapters determine supported checkout behavior. */
export type ContentOfferKind = 'one-time' | 'subscription' | 'membership';

/** Commercial offer associated with paid content, using currency minor units. */
export interface ContentOffer {
  /**
   * Offer identifier used by payment and entitlement integrations.
   */
  id: string;
  /** Amount in the currency minor unit; adapters enforce their supported range. */
  amount: number;
  /** Currency code interpreted by the payment adapter. */
  currency: string;
  /**
   * Whether this offer represents one-time access, a subscription, or membership.
   */
  kind: ContentOfferKind;
}

/** Delivery and indexing policy attached to canonical content. */
export interface ContentAccessPolicy {
  /** Delivery scope; missing access policy is treated as public by host helpers. */
  visibility: ContentVisibility;
  /** Explicit AI indexing permission; defaults to public visibility in AI projections. */
  aiIndexable?: boolean;
  /** Repository lookup key; access helpers fall back to the content identifier. */
  entitlementKey?: string;
  /** Commercial offer required by paid-content checkout helpers. */
  offer?: ContentOffer;
}

/** Optional editorial grouping, taxonomy, and alternate routing metadata. */
export interface EditorialMetadata {
  /**
   * Encoding discriminator determining how the body payload is interpreted.
   */
  format?: string;
  /**
   * Editorial series identifier used by series grouping helpers.
   */
  seriesId?: string;
  /**
   * Dot-separated chapter label used by series ordering helpers.
   */
  seriesChapter?: string;
  /**
   * Optional alternate routing label for the host to interpret.
   */
  alternateSlug?: string;
  /**
   * Named taxonomy groups and their assigned labels.
   */
  taxonomy?: Record<string, readonly string[]>;
}

/** Encoding discriminator for a portable rich-content document. */
export type ContentBodyFormat = 'markdown' | 'html' | 'blocks' | 'json';

/** String or structured payload carried by a rich-content document. */
export type ContentBodyValue =
  | string
  | Record<string, unknown>
  | readonly Record<string, unknown>[];

/** Portable rich-content representation; the host does not depend on an editor. */
export interface ContentBodyDocument {
  /**
   * Encoding discriminator determining how the body payload is interpreted.
   */
  format: ContentBodyFormat;
  /**
   * Encoded payload or provider-specific token interpreted according to its discriminator.
   */
  value: ContentBodyValue;
  /**
   * Producer-defined format or payload version label.
   */
  version?: string;
  /**
   * Producer category for the portable rich-content payload.
   */
  source?: 'cms' | 'blocknote' | 'markdown' | 'generated' | 'external';
}

/** Canonical content record shared by adapters, access checks, and public projections. */
export interface ContentItem {
  /** Stable identity used by access, search, and projection helpers. */
  id: string;
  /**
   * Collection name used to group and select records.
   */
  collection: string;
  /**
   * URL-facing record identifier, interpreted within its collection.
   */
  slug: string;
  /**
   * Locale identifier associated with the record or requested result.
   */
  locale: string;
  /**
   * Human-readable display title supplied by the content source.
   */
  title: string;
  /**
   * Short display or indexing description, when supplied.
   */
  summary?: string;
  /** Legacy string body; takes precedence over bodyDocument in the AI projection. */
  body?: string;
  /** Portable rich body; omitted alongside body by restricted access projection. */
  bodyDocument?: ContentBodyDocument;
  /**
   * Taxonomy labels used by supported adapter filters; record adapters require every requested tag.
   */
  tags: string[];
  /** Editorial state; access, search, and feed helpers treat omission as published. */
  status?: ContentStatus;
  /**
   * Delivery and indexing policy; hosts remain responsible for enforcement.
   */
  access?: ContentAccessPolicy;
  /**
   * Optional grouping and routing metadata interpreted by editorial helpers.
   */
  editorial?: EditorialMetadata;
  /**
   * Schema.org type label used by structured-data projections.
   */
  structuredDataType?: string;
  /**
   * Publication timestamp text supplied by the source.
   */
  publishedAt?: string;
  /**
   * Last modification timestamp text, when supplied.
   */
  modifiedAt?: string;
  /** Optional canonical URL used when a search URL resolver does not supply one. */
  canonicalUrl?: string;
  /**
   * Optional provenance identifying the content origin.
   */
  source?: ContentSource;
  /** Domain-specific payload; access projection does not remove or sanitize these fields. */
  data: Record<string, unknown>;
}

/** Canonical content item enriched with headings and related-content identifiers. */
export interface ContentPage extends ContentItem {
  /**
   * Ordered page headings used to build in-page navigation.
   */
  headings: Array<{
  /**
   * Heading fragment identifier used by in-page navigation.
   */
  id: string;
  /**
   * Heading depth; Markdown extraction produces levels 1 through 6.
   */
  level: number;
  /**
   * Human-readable text carried by this entry.
   */
  text: string }>;
  /**
   * Identifiers of related content for host resolution.
   */
  relatedContentIds: string[];
}

/** Provider-neutral media reference with descriptive, access, and rendition metadata. */
export interface MediaAsset {
  /**
   * Stable record identifier used for lookup and cross-record references.
   */
  id: string;
  /**
   * Delivery or reference URL supplied by the host; this field alone does not validate or authorize access.
   */
  url: string;
  /**
   * Accessible text describing the media; hosts should supply context-appropriate wording.
   */
  alt: string;
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
   * Declared media MIME type; consumers must validate bytes where required.
   */
  mimeType?: string;
  /**
   * Optional provenance identifying the media origin.
   */
  source?: ContentSource;
  /**
   * Identifier assigned by the external provider.
   */
  externalId?: string;
  /**
   * Rights or licensing information supplied by the source.
   */
  rights?: string;
  /**
   * Taxonomy labels used by supported adapter filters; record adapters require every requested tag.
   */
  tags: string[];
  /**
   * Provider identifier used to interpret external identities.
   */
  provider?: string;
  /**
   * Delivery and indexing policy; hosts remain responsible for enforcement.
   */
  access?: MediaAccessPolicy;
  /**
   * Named alternative delivery variants of the same asset.
   */
  renditions?: Array<{
    /**
     * Human-readable or registry lookup name interpreted by the consuming host.
     */
    name: string;
    /**
     * Delivery or reference URL supplied by the host; this field alone does not validate or authorize access.
     */
    url: string;
    /**
     * Intrinsic or rendition width in pixels, when known.
     */
    width?: number;
    /**
     * Intrinsic or rendition height in pixels, when known.
     */
    height?: number;
    /**
     * Declared media MIME type; consumers must validate bytes where required.
     */
    mimeType?: string;
  }>;
  /**
   * Host-defined metadata retained for downstream consumers.
   */
  metadata: Record<string, unknown>;
}

/** Media visibility and optional signed-delivery requirements. */
export interface MediaAccessPolicy {
  /**
   * Requested delivery scope; authentication and access enforcement belong to the host.
   */
  visibility: Extract<ContentVisibility, 'public' | 'members' | 'paid' | 'private'>;
  /** Signals that delivery must use a signed URL; this contract does not sign URLs. */
  signedUrlRequired?: boolean;
  /** Requested signed URL lifetime in seconds, interpreted by the media provider. */
  expiresInSeconds?: number;
}

/** Optional identifier and tag selectors interpreted by a media adapter. */
export interface MediaQuery {
  /**
   * Optional exact media identifier selector.
   */
  id?: string;
  /**
   * Identifier assigned by the external provider.
   */
  externalId?: string;
  /**
   * Optional tag selectors; each adapter defines combination semantics.
   */
  tags?: string[];
}

/** Asynchronous boundary for canonical content lookup, listing, and optional validation. */
export interface ContentAdapter {
  /**
   * Looks up a canonical page using adapter-defined selector precedence.
   *
   * @param query - Identity, locale, collection, and draft selectors.
   * @returns The matching page, or null when absent.
   * @example
   * ```ts
   * import type { ContentAdapter } from '@alneas/sitekit/contracts';
   * type Callback = NonNullable<ContentAdapter['getPage']>;
   * export function invoke(host: ContentAdapter, ...args: Parameters<Callback>) {
   *   return host.getPage(...args);
   * }
   * ```
   */
  getPage(query: ContentQuery): Promise<ContentPage | null>;
  /**
   * Lists canonical items using adapter-defined filtering and pagination.
   *
   * @param query - Collection selectors and pagination constraints.
   * @returns Matching canonical content items.
   * @example
   * ```ts
   * import type { ContentAdapter } from '@alneas/sitekit/contracts';
   * type Callback = NonNullable<ContentAdapter['listCollection']>;
   * export function invoke(host: ContentAdapter, ...args: Parameters<Callback>) {
   *   return host.listCollection(...args);
   * }
   * ```
   */
  listCollection(query: CollectionQuery): Promise<ContentItem[]>;
  /**
   * Validates collection data when supported by the adapter.
   *
   * @param collection - Collection identifier.
   * @param value - Untrusted collection payload.
   * @returns The adapter-validated value.
   * @example
   * ```ts
   * import type { ContentAdapter } from '@alneas/sitekit/contracts';
   * type Callback = NonNullable<ContentAdapter['validate']>;
   * export function invoke(host: ContentAdapter, ...args: Parameters<Callback>) {
   *   return host.validate?.(...args);
   * }
   * ```
   */
  validate?(collection: string, value: unknown): Promise<unknown>;
}

/** Asynchronous boundary for canonical media lookup and optional listing. */
export interface MediaAdapter {
  /**
   * Looks up a canonical media asset.
   *
   * @param query - Media identity and optional tag selectors.
   * @returns The matching asset, or null when absent.
   * @example
   * ```ts
   * import type { MediaAdapter } from '@alneas/sitekit/contracts';
   * type Callback = NonNullable<MediaAdapter['getMedia']>;
   * export function invoke(host: MediaAdapter, ...args: Parameters<Callback>) {
   *   return host.getMedia(...args);
   * }
   * ```
   */
  getMedia(query: MediaQuery): Promise<MediaAsset | null>;
  /**
   * Lists canonical media assets when supported.
   *
   * @param query - Optional tags and item limit.
   * @returns Matching media assets.
   * @example
   * ```ts
   * import type { MediaAdapter } from '@alneas/sitekit/contracts';
   * type Callback = NonNullable<MediaAdapter['listMedia']>;
   * export function invoke(host: MediaAdapter, ...args: Parameters<Callback>) {
   *   return host.listMedia?.(...args);
   * }
   * ```
   */
  listMedia?(query: {
  /**
   * Taxonomy labels used by supported adapter filters; record adapters require every requested tag.
   */
  tags?: string[];
  /**
   * Maximum requested item count; pagination behavior belongs to the adapter.
   */
  limit?: number }): Promise<MediaAsset[]>;
}

/**
 * Collection identifier paired with its runtime data schema.
 * @typeParam T - Value shape accepted and returned by the collection runtime schema.
 */
export interface ContentSchema<T> {
  /**
   * Collection name used to group and select records.
   */
  collection: string;
  /**
   * Runtime Zod schema validating values stored in this collection.
   */
  schema: ZodType<T>;
}
