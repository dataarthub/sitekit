import type { ContentItem, ContentPage, MediaAsset } from '../contracts/content.js';
import { contentBodyToText } from '../content/rich.js';

/** Named entity and optional canonical or equivalent identity URLs. */
export interface EntityReference {
  /**
   * Stable identifier for the referenced entity.
   */
  id: string;
  /**
   * Entity classification supplied by the host.
   */
  type: string;
  /**
   * Human-readable name.
   */
  name: string;
  /**
   * URL associated with this record.
   */
  url?: string;
  /**
   * Optional URLs identifying equivalent entities.
   */
  sameAs?: string[];
}

/** Attribution link with optional publisher and retrieval timestamp. */
export interface Citation {
  /**
   * Human-readable label.
   */
  label: string;
  /**
   * URL associated with this record.
   */
  url: string;
  /**
   * Optional publisher attribution.
   */
  publisher?: string;
  /**
   * Optional retrieval timestamp for the cited source.
   */
  retrievedAt?: string;
}

/** Portable content projection with explicit public and AI-indexing permissions. */
export interface MachineReadableContent {
  /**
   * Stable identifier for this record.
   */
  id: string;
  /**
   * Host-supplied canonical URL for this content.
   */
  canonicalUrl: string;
  /**
   * Content locale identifier.
   */
  locale: string;
  /**
   * Display title for this record.
   */
  title: string;
  /**
   * Optional structured-data content type.
   */
  contentType?: string;
  /**
   * Optional editorial summary.
   */
  summary?: string;
  /**
   * Optional textual body included by the projection policy.
   */
  body?: string;
  /**
   * Editorial tags associated with this content.
   */
  tags: string[];
  /**
   * Page headings; collection items without headings produce an empty list.
   */
  headings: Array<{
  /**
                     * Stable identifier for this record.
                     */
                    id: string;
  /**
                                 * Heading level copied from the canonical page.
                                 */
                                level: number;
  /**
                                                * Heading text copied from the canonical page.
                                                */
                                               text: string }>;
  /**
   * Entity references; the built-in projection initializes an empty list.
   */
  entities: EntityReference[];
  /**
   * Projected media identity, URL and descriptive metadata.
   */
  media: Array<Pick<MediaAsset, 'id' | 'url' | 'alt' | 'title' | 'caption'>>;
  /**
   * Publication timestamp when supplied by the source.
   */
  publishedAt?: string;
  /**
   * Last modification timestamp when supplied by the source.
   */
  modifiedAt?: string;
  /**
   * Optional upstream content provenance.
   */
  source?: {
  /**
              * Source-system kind identifying the upstream representation.
              */
             kind: string;
  /**
                            * Stable identifier for this record.
                            */
                           id?: string;
  /**
                                         * URL associated with this record.
                                         */
                                        url?: string;
  /**
                                                       * Timestamp of the last upstream synchronization.
                                                       */
                                                      syncedAt?: string };
  /**
   * Attribution links; the built-in projection initializes an empty list.
   */
  citations: Citation[];
  /**
   * Content visibility and AI-indexing flags.
   */
  permissions: {
    /**
     * Whether the content visibility is public.
     */
    public: boolean;
    /**
     * Whether AI indexing is permitted by content policy.
     */
    aiIndexable: boolean;
  };
}

/** Boundary for replacing the default machine-readable content projection. */
export interface MachineReadableContentAdapter {
  /**
   * Converts canonical content into an integration-specific machine-readable record.
   *
   * @param content - Canonical item or page.
   * @param context - Canonical URL and optional media references.
   * @returns The projection, synchronously or asynchronously.
   *
   * @example
   * ```ts
   * import type { MachineReadableContentAdapter } from '@alneas/sitekit/ai';
   * export function useToMachineReadable(host: MachineReadableContentAdapter, ...args: Parameters<NonNullable<MachineReadableContentAdapter['toMachineReadable']>>) {
   * return host.toMachineReadable(...args);
   * }
   * ```
   */
  toMachineReadable(
    content: ContentItem | ContentPage,
    context: {
  /**
                * Host-supplied canonical URL for this content.
                */
               canonicalUrl: string;
  /**
                                      * Projected media identity, URL and descriptive metadata.
                                      */
                                     media?: MediaAsset[] },
  ): Promise<MachineReadableContent> | MachineReadableContent;
}

/** Provider-neutral AI context whose body may be omitted by access policy. */
export interface AiContextDocument {
  /**
   * Canonical content identifier.
   */
  contentId: string;
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
   * Optional textual body included by the projection policy.
   */
  body?: string;
  /**
   * Host-supplied canonical URL for this content.
   */
  canonicalUrl: string;
  /**
   * Attribution links; the built-in projection initializes an empty list.
   */
  citations: Citation[];
  /**
   * Content visibility and AI-indexing flags.
   */
  permissions: MachineReadableContent['permissions'];
  /**
   * Host or provider metadata carried alongside the normalized record.
   */
  metadata: Record<string, unknown>;
}

/** Controls AI body truncation and caller-supplied context metadata. */
export interface AiContextOptions {
  /** String.slice end index applied to the permitted body; defaults to 12000. */
  maxBodyCharacters?: number;
  /** Caller metadata merged after generated tags and contentType, replacing matching keys. */
  metadata?: Record<string, unknown>;
}

/**
 * Builds provider-neutral context with an optional truncated public body.
 *
 * @param content - Content to project; visibility and AI indexing control body disclosure.
 * @param context - Canonical URL and optional media supplied by the host.
 * @param options - Body character limit (default 12000) and metadata overrides.
 * @returns Context, citations, permission flags, and metadata for AI integrations.
 * @remarks Publication status is not checked. Metadata overrides generated tags and contentType; non-body metadata remains available for restricted content.
 * @example
 * ```ts
 * import { buildAiContext } from '@alneas/sitekit/ai';
 * const content = { id: 'guide', collection: 'guides', slug: 'guide', locale: 'en', title: 'Guide', tags: [], data: {} };
 * const context = buildAiContext(content, { canonicalUrl: 'https://example.com/guide' });
 * ```
 */
export function buildAiContext(
  content: ContentItem | ContentPage,
  context: {
  /**
              * Host-supplied canonical URL for this content.
              */
             canonicalUrl: string;
  /**
                                    * Projected media identity, URL and descriptive metadata.
                                    */
                                   media?: MediaAsset[] },
  options: AiContextOptions = {},
): AiContextDocument {
  const machineReadable = buildMachineReadableContent(content, context);
  const maxBodyCharacters = options.maxBodyCharacters ?? 12000;
  return {
    contentId: machineReadable.id,
    locale: machineReadable.locale,
    title: machineReadable.title,
    ...(machineReadable.summary !== undefined ? { summary: machineReadable.summary } : {}),
    ...(machineReadable.body !== undefined
      ? { body: machineReadable.body.slice(0, maxBodyCharacters) }
      : {}),
    canonicalUrl: machineReadable.canonicalUrl,
    citations: machineReadable.citations,
    permissions: machineReadable.permissions,
    metadata: {
      tags: machineReadable.tags,
      ...(machineReadable.contentType ? { contentType: machineReadable.contentType } : {}),
      ...(options.metadata ?? {}),
    },
  };
}

/**
 * Projects canonical content into a provider-neutral machine-readable record.
 *
 * @param content - Content with optional body, headings, and source metadata.
 * @param context - Canonical URL and optional media references.
 * @returns A record whose body is included only for public, AI-indexable content.
 * @remarks Missing visibility defaults to public and AI indexing defaults to public visibility. Publication status is not checked; entities and citations start empty.
 * @example
 * ```ts
 * import { buildMachineReadableContent } from '@alneas/sitekit/ai';
 * const content = { id: 'guide', collection: 'guides', slug: 'guide', locale: 'en', title: 'Guide', tags: [], data: {} };
 * const record = buildMachineReadableContent(content, { canonicalUrl: 'https://example.com/guide' });
 * ```
 */
export function buildMachineReadableContent(
  content: ContentItem | ContentPage,
  context: {
  /**
              * Host-supplied canonical URL for this content.
              */
             canonicalUrl: string;
  /**
                                    * Projected media identity, URL and descriptive metadata.
                                    */
                                   media?: MediaAsset[] },
): MachineReadableContent {
  const headings = 'headings' in content ? content.headings : [];
  const isPublic =
    content.access?.visibility === undefined || content.access.visibility === 'public';
  const aiIndexable = content.access?.aiIndexable ?? isPublic;
  const body = content.body ?? (content.bodyDocument ? contentBodyToText(content.bodyDocument) : undefined);
  return {
    id: content.id,
    canonicalUrl: context.canonicalUrl,
    locale: content.locale,
    title: content.title,
    ...(content.structuredDataType !== undefined
      ? { contentType: content.structuredDataType }
      : {}),
    ...(content.summary !== undefined ? { summary: content.summary } : {}),
    ...(body !== undefined && isPublic && aiIndexable ? { body } : {}),
    tags: content.tags,
    headings,
    entities: [],
    media: (context.media ?? []).map(({ id, url, alt, title, caption }) => ({
      id,
      url,
      alt,
      ...(title !== undefined ? { title } : {}),
      ...(caption !== undefined ? { caption } : {}),
    })),
    ...(content.publishedAt !== undefined ? { publishedAt: content.publishedAt } : {}),
    ...(content.modifiedAt !== undefined ? { modifiedAt: content.modifiedAt } : {}),
    ...(content.source !== undefined ? { source: content.source } : {}),
    citations: [],
    permissions: {
      public: isPublic,
      aiIndexable,
    },
  };
}
