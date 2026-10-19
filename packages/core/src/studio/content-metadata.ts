import type {
  ContentAccessPolicy,
  ContentBodyDocument,
  ContentOfferKind,
  ContentItem,
} from '../contracts/content.js';

/** Stable data-envelope key for host access policy and portable body metadata. */
export const HOST_STUDIO_METADATA_KEY = '__eaosHostSite';

/** Optional host metadata carried inside a provider document data object. */
export interface HostStudioMetadata {
  /** Publication visibility/offer metadata; enforcement remains a host responsibility. */
  access?: ContentAccessPolicy;
  /** Portable body format and value; does not imply a rendering or sanitization engine. */
  bodyDocument?: ContentBodyDocument;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function accessPolicy(value: unknown): ContentAccessPolicy | undefined {
  if (!isRecord(value)) return undefined;
  const visibility = value.visibility;
  if (visibility !== 'public' && visibility !== 'members' && visibility !== 'paid' && visibility !== 'private') {
    return undefined;
  }
  const offer = isRecord(value.offer)
    && typeof value.offer.id === 'string'
    && typeof value.offer.amount === 'number'
    && typeof value.offer.currency === 'string'
    && (value.offer.kind === 'one-time' || value.offer.kind === 'subscription' || value.offer.kind === 'membership')
    ? {
      id: value.offer.id,
      amount: value.offer.amount,
      currency: value.offer.currency,
      kind: value.offer.kind as ContentOfferKind,
    }
    : undefined;
  return {
    visibility,
    ...(typeof value.aiIndexable === 'boolean' ? { aiIndexable: value.aiIndexable } : {}),
    ...(typeof value.entitlementKey === 'string' ? { entitlementKey: value.entitlementKey } : {}),
    ...(offer ? { offer } : {}),
  };
}

function bodyDocument(value: unknown): ContentBodyDocument | undefined {
  if (!isRecord(value)) return undefined;
  const format = value.format;
  if (format !== 'markdown' && format !== 'html' && format !== 'blocks' && format !== 'json') return undefined;
  const documentValue = value.value;
  if (
    typeof documentValue !== 'string'
    && !(Array.isArray(documentValue) && documentValue.every(item => isRecord(item)))
    && !isRecord(documentValue)
  ) return undefined;
  return {
    format,
    value: documentValue as ContentBodyDocument['value'],
    ...(typeof value.version === 'string' ? { version: value.version } : {}),
    ...(value.source === 'cms' || value.source === 'blocknote' || value.source === 'markdown' || value.source === 'generated' || value.source === 'external'
      ? { source: value.source } : {}),
  };
}

/**
 * Reads recognized access/body fields from the reserved host metadata envelope.
 * @param data - Provider-owned document data; never mutated.
 * @returns Parsed optional access and body metadata, or an empty object for an absent/invalid envelope.
 * @remarks Invalid fields are ignored. This parser does not authorize access or sanitize HTML.
 * @example
 * ```typescript
 * import { readHostStudioMetadata } from '@alneas/sitekit/studio/content-metadata';
 * const metadata = readHostStudioMetadata({ __eaosHostSite: { access: { visibility: 'public' } } });
 * console.log(metadata.access?.visibility);
 * ```
 */
export function readHostStudioMetadata(data: Readonly<Record<string, unknown>>): HostStudioMetadata {
  const envelope = data[HOST_STUDIO_METADATA_KEY];
  if (!isRecord(envelope)) return {};
  const access = accessPolicy(envelope.access);
  const document = bodyDocument(envelope.bodyDocument);
  return {
    ...(access ? { access } : {}),
    ...(document ? { bodyDocument: document } : {}),
  };
}

/**
 * Merges host metadata into a new data envelope while preserving collection-specific fields.
 * @param data - Existing document data, including unrecognized envelope fields to preserve.
 * @param metadata - Access/body metadata to merge when supplied.
 * @returns A shallow copy of the data object with a merged reserved envelope.
 * @remarks Omitted metadata does not delete an existing field. Inputs are not mutated.
 * @example
 * ```typescript
 * import { writeHostStudioMetadata } from '@alneas/sitekit/studio/content-metadata';
 * const data = writeHostStudioMetadata({ category: 'news' }, { access: { visibility: 'public' } });
 * console.log(data.category);
 * ```
 */
export function writeHostStudioMetadata(
  data: Readonly<Record<string, unknown>>,
  metadata: HostStudioMetadata,
): Record<string, unknown> {
  const existing = isRecord(data[HOST_STUDIO_METADATA_KEY]) ? data[HOST_STUDIO_METADATA_KEY] : {};
  const envelope = {
    ...existing,
    ...(metadata.access ? { access: metadata.access } : {}),
    ...(metadata.bodyDocument ? { bodyDocument: metadata.bodyDocument } : {}),
  };
  return { ...data, [HOST_STUDIO_METADATA_KEY]: envelope };
}

/**
 * Projects a compatible provider document into the host content shape with parsed metadata.
 * @param document - Studio document with identity, Markdown body and provider data.
 * @returns A ContentItem with copied tags/data and recognized access/body metadata.
 * @remarks Optional modifiedAt is retained; createdAt is not projected by this function.
 * It does not render Markdown, sanitize body content, enforce visibility or persist changes.
 * @example
 * ```typescript
 * import { projectStudioDocument } from '@alneas/sitekit/studio/content-metadata';
 * const item = projectStudioDocument({ id: 'post-1', collection: 'posts', locale: 'en',
 * slug: 'welcome', title: 'Welcome', body: '# Welcome', tags: [], status: 'draft', data: {} });
 * console.log(item.slug);
 * ```
 *
 * @typeParam T - Provider document shape containing the required identity, Markdown body, status and data fields; additional fields are accepted. Must satisfy {
 * id: string;
 * collection: string;
 * locale: string;
 * slug: string;
 * title: string;
 * summary?: string;
 * body: string;
 * tags: string[];
 * status: ContentItem['status'];
 * data: Record<string, unknown>;
 * createdAt?: string;
 * modifiedAt?: string;
 * }.
 */
export function projectStudioDocument<T extends {
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
   * Path slug used for this content.
   */
  slug: string;
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
  body: string;
  /**
   * Editorial tags associated with this content.
   */
  tags: string[];
  /**
   * Normalized lifecycle state reported by the provider.
   */
  status: ContentItem['status'];
  /**
   * Payload associated with this record.
   */
  data: Record<string, unknown>;
  /**
   * Creation timestamp supplied by the provider.
   */
  createdAt?: string;
  /**
   * Last modification timestamp when supplied by the source.
   */
  modifiedAt?: string;
}>(document: T): ContentItem {
  const metadata = readHostStudioMetadata(document.data);
  return {
    id: document.id,
    collection: document.collection,
    locale: document.locale,
    slug: document.slug,
    title: document.title,
    ...(document.summary !== undefined ? { summary: document.summary } : {}),
    body: document.body,
    ...(metadata.bodyDocument ? { bodyDocument: metadata.bodyDocument } : {}),
    tags: [...document.tags],
    ...(document.status ? { status: document.status } : {}),
    ...(metadata.access ? { access: metadata.access } : {}),
    ...(document.modifiedAt ? { modifiedAt: document.modifiedAt } : {}),
    data: { ...document.data },
  };
}
