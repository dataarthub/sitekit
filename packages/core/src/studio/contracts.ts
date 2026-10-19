import type { ContentItem, ContentStatus, MediaAsset } from '../contracts/content.js';

/** Host-defined collection label and draft factory for the management UI; not a server authorization rule. */
export interface StudioCollectionDefinition {
  /**
   * Collection identifier used by listing and draft creation.
   */
  id: string;
  /**
   * Human-readable label.
   */
  label: string;
  /**
   * Human-readable description for this record or operation.
   */
  description?: string;
  /**
   * Optional supported-locale metadata; the basic selector currently exposes ja and en.
   */
  locales?: readonly string[];
  /**
   * Host capability metadata; BasicStudioApp uses Markdown editing.
   */
  supportsRichText?: boolean;
  /**
   * Host capability metadata; BasicStudioApp does not provide a media picker.
   */
  supportsMedia?: boolean;
  /**
   * Builds a host-defined draft using the supplied collection, locale and initial identity.
   * @param input - Input data supplied by the host.
   * @returns A new canonical draft initialized from the supplied host collection and locale.
   * @example
   * ```ts
   * import type { StudioCollectionDefinition } from '@alneas/sitekit/studio/contracts';
   * export function useCreateDraft(host: StudioCollectionDefinition, ...args: Parameters<NonNullable<StudioCollectionDefinition['createDraft']>>) {
   * return host.createDraft?.(...args);
   * }
   * ```
   */
  createDraft?: (input: {
    /**
     * Host collection identifier.
     */
    collection: string;
    /**
     * Content locale identifier.
     */
    locale: string;
    /**
     * Initial document identifier; BasicStudioApp supplies an empty string for a new draft.
     */
    id: string;
    /**
     * Path slug used for this content.
     */
    slug: string;
  }) => ContentItem;
}

/** Collection-scoped listing request; providers choose supported filtering and cursor semantics. */
export interface StudioListQuery {
  /**
   * Host collection identifier.
   */
  collection: string;
  /**
   * Content locale identifier.
   */
  locale?: string;
  /**
   * Provider-defined search text.
   */
  search?: string;
  /**
   * Normalized lifecycle state reported by the provider.
   */
  status?: ContentStatus | 'all';
  /**
   * Requested maximum result count; interpretation belongs to the provider.
   */
  limit?: number;
  /**
   * Opaque continuation cursor from an earlier list response.
   */
  cursor?: string;
}

/** Optional draft-save concurrency metadata; support is provider-specific. */
export interface StudioSaveOptions {
  /** Last observed modification time; supporting providers reject stale edits. */
  expectedModifiedAt?: string;
  /**
   * Optional provider-specific audit reason for saving.
   */
  reason?: string;
}

/** Optional publish scheduling and reason metadata; scheduling support is provider-specific. */
export interface StudioPublishOptions {
  /** Requested future publish time; the basic UI publishes immediately. */
  scheduledAt?: string;
  /**
   * Optional provider-specific audit reason for publishing.
   */
  reason?: string;
}

/** Revision metadata exposed by an optional host history adapter. */
export interface StudioRevision {
  /**
   * Stable identifier for this record.
   */
  id: string;
  /**
   * Identifier of the document owning this revision.
   */
  documentId: string;
  /**
   * Host collection identifier.
   */
  collection: string;
  /**
   * Normalized lifecycle state reported by the provider.
   */
  status: 'draft' | 'published' | 'archived';
  /**
   * Creation timestamp supplied by the provider.
   */
  createdAt: string;
  /**
   * Optional identifier of the revision author.
   */
  createdBy?: string;
  /**
   * Optional descriptive message supplied by the provider.
   */
  message?: string;
}

/** One page of content records with an optional opaque continuation cursor. */
export interface StudioListResult {
  /**
   * Content records supplied to the consumer.
   */
  items: ContentItem[];
  /**
   * Opaque continuation cursor for the next provider page.
   */
  nextCursor?: string;
}

/** Host-owned persistence boundary for basic management and optional media/history features. */
export interface StudioProvider {
  /**
   * Lists one page without changing publication state.
   * @param query - Collection, locale, search, status and pagination criteria interpreted by the provider.
   * @returns One page of content and an optional provider continuation cursor.
   * @example
   * ```ts
   * import type { StudioProvider } from '@alneas/sitekit/studio/contracts';
   * export function useList(host: StudioProvider, ...args: Parameters<NonNullable<StudioProvider['list']>>) {
   * return host.list(...args);
   * }
   * ```
   */
  list(query: StudioListQuery): Promise<StudioListResult>;
  /**
   * Loads a complete document by its host/provider identifier, or null when absent.
   * @param documentId - Identifier of the document owning this revision.
   * @returns The complete content document, or null when the provider has no matching record.
   * @example
   * ```ts
   * import type { StudioProvider } from '@alneas/sitekit/studio/contracts';
   * export function useGet(host: StudioProvider, ...args: Parameters<NonNullable<StudioProvider['get']>>) {
   * return host.get(...args);
   * }
   * ```
   */
  get(documentId: string): Promise<ContentItem | null>;
  /**
   * Saves and returns the assigned ID/current timestamp; rejection must leave client input available for retry.
   * @param document - Current canonical content document.
   * @param options - Optional modification-time concurrency check and provider audit reason.
   * @returns The saved document with provider-assigned identity and current modification metadata.
   * @example
   * ```ts
   * import type { StudioProvider } from '@alneas/sitekit/studio/contracts';
   * export function useSaveDraft(host: StudioProvider, ...args: Parameters<NonNullable<StudioProvider['saveDraft']>>) {
   * return host.saveDraft(...args);
   * }
   * ```
   */
  saveDraft(document: ContentItem, options?: StudioSaveOptions): Promise<ContentItem>;
  /**
   * Returns the updated publication state; does not imply an external website deployment.
   * @param documentId - Identifier of the document owning this revision.
   * @param options - Optional provider-supported scheduling time and publication reason.
   * @returns The document with its updated provider publication state; website deployment remains a host concern.
   * @example
   * ```ts
   * import type { StudioProvider } from '@alneas/sitekit/studio/contracts';
   * export function usePublish(host: StudioProvider, ...args: Parameters<NonNullable<StudioProvider['publish']>>) {
   * return host.publish(...args);
   * }
   * ```
   */
  publish(documentId: string, options?: StudioPublishOptions): Promise<ContentItem>;
  /**
   * Optional advanced history capability; not used by BasicStudioApp.
   * @param documentId - Identifier of the document owning this revision.
   * @returns Revision metadata supplied by the host history provider.
   * @example
   * ```ts
   * import type { StudioProvider } from '@alneas/sitekit/studio/contracts';
   * export function useListRevisions(host: StudioProvider, ...args: Parameters<NonNullable<StudioProvider['listRevisions']>>) {
   * return host.listRevisions?.(...args);
   * }
   * ```
   */
  listRevisions?(documentId: string): Promise<StudioRevision[]>;
  /**
   * Optional media capability; not used by the built-in Markdown editor.
   * @param query - Optional media search text and requested result limit.
   * @returns Matching media assets supplied by the host media provider.
   * @example
   * ```ts
   * import type { StudioProvider } from '@alneas/sitekit/studio/contracts';
   * export function useListMedia(host: StudioProvider, ...args: Parameters<NonNullable<StudioProvider['listMedia']>>) {
   * return host.listMedia?.(...args);
   * }
   * ```
   */
  listMedia?(query?: {
  /**
                        * Provider-defined search text.
                        */
                       search?: string;
  /**
                                         * Requested maximum result count; interpretation belongs to the provider.
                                         */
                                        limit?: number }): Promise<MediaAsset[]>;
}

/** Markdown value, change callback and disabled state supplied to an injected body editor. */
export interface StudioBodyEditorProps {
  /**
   * Current editor text.
   */
  value: string;
  /**
   * Reports the new editor text or metadata patch to the host.
   * @param value - Current editor text.
   * @returns Completes the host callback without a result value.
   * @example
   * ```ts
   * import type { StudioBodyEditorProps } from '@alneas/sitekit/studio/contracts';
   * export function useOnChange(host: StudioBodyEditorProps, ...args: Parameters<NonNullable<StudioBodyEditorProps['onChange']>>) {
   * return host.onChange(...args);
   * }
   * ```
   */
  onChange: (value: string) => void;
  /**
   * Whether the host requests disabled editing controls.
   */
  disabled?: boolean;
}

/** Loaded content rows and host create/select callbacks supplied to a list renderer. */
export interface StudioCollectionListProps {
  /**
   * Content records supplied to the consumer.
   */
  items: readonly ContentItem[];
  /**
   * Whether the host is currently loading content.
   */
  loading: boolean;
  /**
   * Reports the content row selected by the user.
   * @param item - Content record selected from the displayed collection rows.
   * @returns Completes the host callback without a result value.
   * @example
   * ```ts
   * import type { StudioCollectionListProps } from '@alneas/sitekit/studio/contracts';
   * export function useOnSelect(host: StudioCollectionListProps, ...args: Parameters<NonNullable<StudioCollectionListProps['onSelect']>>) {
   * return host.onSelect(...args);
   * }
   * ```
   */
  onSelect: (item: ContentItem) => void;
  /**
   * Requests creation of a new content document.
   * @returns Completes the host callback without a result value.
   * @example
   * ```ts
   * import type { StudioCollectionListProps } from '@alneas/sitekit/studio/contracts';
   * export function useOnCreate(host: StudioCollectionListProps, ...args: Parameters<NonNullable<StudioCollectionListProps['onCreate']>>) {
   * return host.onCreate(...args);
   * }
   * ```
   */
  onCreate: () => void;
}

/** Current document and patch callback supplied to a host metadata renderer. */
export interface StudioMetadataEditorProps {
  /**
   * Current canonical content document.
   */
  document: ContentItem;
  /**
   * Whether the host requests disabled editing controls.
   */
  disabled?: boolean;
  /**
   * Reports the new editor text or metadata patch to the host.
   * @param patch - Changed content fields to merge into the host editor state.
   * @returns Completes the host callback without a result value.
   * @example
   * ```ts
   * import type { StudioMetadataEditorProps } from '@alneas/sitekit/studio/contracts';
   * export function useOnChange(host: StudioMetadataEditorProps, ...args: Parameters<NonNullable<StudioMetadataEditorProps['onChange']>>) {
   * return host.onChange(...args);
   * }
   * ```
   */
  onChange: (patch: Partial<ContentItem>) => void;
}
