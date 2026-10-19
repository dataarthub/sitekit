import type { CampaignContext, ExperimentContext } from '../analytics/events.js';
import type { AnalyticsBatch } from '../analytics/events.js';

/** Site and locale context for generating a provider booking destination. */
export interface BookingLinkRequest {
  /**
   * Site identifier used to scope lookup, publication, or configuration.
   */
  siteId: string;
  /**
   * Locale identifier associated with the record or requested result.
   */
  locale: string;
  /**
   * Optional provider resource identifier used to select the booking destination.
   */
  resourceId?: string;
  /**
   * Optional campaign attribution passed to the provider.
   */
  campaign?: CampaignContext;
  /**
   * Optional experiment attribution passed to the provider.
   */
  experiment?: ExperimentContext;
}

/** Provider booking destination and optional resource identity. */
export interface BookingLink {
  /**
   * Booking destination URL supplied by the provider.
   */
  href: string;
  /**
   * Provider identifier used to interpret external identities.
   */
  provider: string;
  /**
   * Optional provider resource identifier used to select the booking destination.
   */
  resourceId?: string;
}

/** Boundary for generating a booking URL without coupling rendering to a provider. */
export interface BookingAdapter {
  /**
   * Resolves a provider booking destination.
   *
   * @param request - Site, locale, resource, and attribution context.
   * @returns The provider destination.
   * @example
   * ```ts
   * import type { BookingAdapter } from '@alneas/sitekit/contracts';
   * type Callback = NonNullable<BookingAdapter['getBookingLink']>;
   * export function invoke(host: BookingAdapter, ...args: Parameters<Callback>) {
   *   return host.getBookingLink(...args);
   * }
   * ```
   */
  getBookingLink(request: BookingLinkRequest): Promise<BookingLink>;
}

/** Experiment and optional visitor identifiers used to assign a variant. */
export interface ExperimentAssignmentRequest {
  /**
   * Site identifier used to scope lookup, publication, or configuration.
   */
  siteId: string;
  /**
   * Identifier of the experiment being assigned or recorded.
   */
  experimentId: string;
  /**
   * Optional pseudonymous visitor identifier used for provider bucketing.
   */
  anonymousId?: string;
  /**
   * Optional session identifier used for provider bucketing.
   */
  sessionId?: string;
}

/** Assigned variant and exposure identifier for one experiment. */
export interface ExperimentAssignment {
  /**
   * Identifier of the experiment being assigned or recorded.
   */
  experimentId: string;
  /**
   * Provider-assigned experiment variant identifier.
   */
  variantId: string;
  /**
   * Provider-assigned identifier correlating assignment and exposure.
   */
  exposureId: string;
}

/** Boundary for variant assignment and exposure recording. */
export interface ExperimentProvider {
  /**
   * Assigns an experiment variant using provider-defined bucketing.
   *
   * @param request - Experiment and optional visitor identifiers.
   * @returns The variant and exposure identity.
   * @example
   * ```ts
   * import type { ExperimentProvider } from '@alneas/sitekit/contracts';
   * type Callback = NonNullable<ExperimentProvider['assign']>;
   * export function invoke(host: ExperimentProvider, ...args: Parameters<Callback>) {
   *   return host.assign(...args);
   * }
   * ```
   */
  assign(request: ExperimentAssignmentRequest): Promise<ExperimentAssignment>;
  /**
   * Records that an assigned variant was exposed.
   *
   * @param assignment - Assignment returned by the experiment provider.
   * @returns Completion of exposure recording.
   * @example
   * ```ts
   * import type { ExperimentProvider } from '@alneas/sitekit/contracts';
   * type Callback = NonNullable<ExperimentProvider['recordExposure']>;
   * export function invoke(host: ExperimentProvider, ...args: Parameters<Callback>) {
   *   return host.recordExposure(...args);
   * }
   * ```
   */
  recordExposure(assignment: ExperimentAssignment): Promise<void>;
}

/** Provider identity and optional URL and update time for an external record. */
export interface ExternalContentReference {
  /**
   * Provider identifier used to interpret external identities.
   */
  provider: string;
  /**
   * Identifier assigned by the external provider.
   */
  externalId: string;
  /**
   * Delivery or reference URL supplied by the host; this field alone does not validate or authorize access.
   */
  url?: string;
  /**
   * Provider update timestamp text, when available.
   */
  updatedAt?: string;
}

/** Provider-specific pagination or incremental synchronization token. */
export interface ContentSyncCursor {
  /**
   * Provider identifier used to interpret external identities.
   */
  provider: string;
  /**
   * Opaque provider continuation or incremental synchronization token.
   */
  value?: string;
}

/**
 * Normalized external records and continuation state returned by a sync adapter.
 * @typeParam T - Provider payload shape carried by each normalized external record; defaults to unknown.
 */
export interface ContentSyncResult<T = unknown> {
  /**
   * Batch of externally sourced records ready for upstream normalization.
   */
  records: Array<{
    /**
     * External provenance or retrievable revision reference associated with this result.
     */
    reference: ExternalContentReference;
    /**
     * Discriminator identifying the source or payload category.
     */
    kind: 'article' | 'media' | 'event';
    /**
     * Normalized provider payload retained for upstream processing.
     */
    payload: T;
  }>;
  /**
   * Continuation state for the next pull, when available.
   */
  nextCursor?: ContentSyncCursor;
  /**
   * Whether the provider reports additional batches after this result.
   */
  hasMore: boolean;
}

/**
 * Implemented by EAOS integrations, not by the Astro renderer.
 * The host only consumes the normalized ContentAdapter output.
 * @typeParam T - Provider payload shape carried by each normalized external record; defaults to unknown.
 */
export interface ExternalContentSyncAdapter<T = unknown> {
  /**
   * Pulls a batch of external records for upstream normalization.
   *
   * @param cursor - Optional provider continuation or synchronization cursor.
   * @returns Normalized records and continuation state.
   * @example
   * ```ts
   * import type { ExternalContentSyncAdapter } from '@alneas/sitekit/contracts';
   * type Callback = NonNullable<ExternalContentSyncAdapter<unknown>['pull']>;
   * export function invoke(host: ExternalContentSyncAdapter, ...args: Parameters<Callback>) {
   *   return host.pull(...args);
   * }
   * ```
   */
  pull(cursor?: ContentSyncCursor): Promise<ContentSyncResult<T>>;
}

/** Known social platform identifier or an integration-defined platform name. */
export type SocialPlatform = 'x' | 'instagram' | 'facebook' | 'line' | 'youtube' | (string & {});

/** Portable social publication payload with a caller-supplied idempotency key. */
export interface SocialPostDraft {
  /**
   * Stable record identifier used for lookup and cross-record references.
   */
  id: string;
  /**
   * Social platform identifier selecting provider delivery behavior.
   */
  platform: SocialPlatform;
  /**
   * Human-readable text carried by this entry.
   */
  text: string;
  /**
   * Optional canonical content identifier associated with the post.
   */
  contentId?: string;
  /**
   * Media attachment descriptors containing source identifiers, delivery URLs, and accessible descriptions for the social provider.
   */
  media: Array<{
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
  }>;
  /**
   * Requested publication timestamp text; scheduling support belongs to the provider.
   */
  scheduledAt?: string;
  /**
   * Caller or publisher key for recognizing repeated delivery of the same operation.
   */
  idempotencyKey: string;
  /**
   * Host-defined metadata retained for downstream consumers.
   */
  metadata?: Record<string, unknown>;
}

/** Normalized social publication outcome. */
export type SocialDeliveryStatus = 'queued' | 'published' | 'failed' | 'skipped';

/** Provider-neutral delivery receipt or structured failure. */
export interface SocialDeliveryResult {
  /**
   * Provider delivery outcome, including returned failures that do not require an exception.
   */
  status: SocialDeliveryStatus;
  /**
   * Social platform identifier selecting provider delivery behavior.
   */
  platform: SocialPlatform;
  /**
   * Caller or publisher key for recognizing repeated delivery of the same operation.
   */
  idempotencyKey: string;
  /**
   * Identifier assigned by the external provider.
   */
  externalId?: string;
  /**
   * Provider URL for the published item, when available.
   */
  externalUrl?: string;
  /**
   * Publication timestamp text supplied by the source.
   */
  publishedAt?: string;
  /**
   * Structured provider failure; distinct from exceptions or rejected operations.
   */
  error?: {
  /**
   * Machine-readable failure identifier supplied by the producer.
   */
  code: string;
  /**
   * Human-readable explanation of the failure; avoid including secrets.
   */
  message: string };
}

/**
 * Provider boundary for SNS integrations. Authentication, retries, and
 * provider-specific payloads belong in the EAOS integration, not the Astro
 * renderer.
 */
export interface SocialPublisher {
  /**
   * Publishes or queues a normalized social draft.
   *
   * @param draft - Payload and caller-supplied idempotency key.
   * @returns The delivery receipt or structured failure.
   * @example
   * ```ts
   * import type { SocialPublisher } from '@alneas/sitekit/contracts';
   * type Callback = NonNullable<SocialPublisher['publish']>;
   * export function invoke(host: SocialPublisher, ...args: Parameters<Callback>) {
   *   return host.publish(...args);
   * }
   * ```
   */
  publish(draft: SocialPostDraft): Promise<SocialDeliveryResult>;
}

/** Collector receipt counting accepted and rejected events and naming duplicates. */
export interface AnalyticsIngestResult {
  /**
   * Whether the provider accepted invalidation, or the number of accepted events for ingestion.
   */
  accepted: number;
  /**
   * Number of events rejected by the collector.
   */
  rejected: number;
  /**
   * Identifiers the collector recognized as duplicates.
   */
  duplicateEventIds: string[];
}

/**
 * Server-side boundary for a Cloudflare Worker or other edge collector.
 * Durable storage and aggregation remain EAOS responsibilities.
 */
export interface AnalyticsIngestAdapter {
  /**
   * Accepts a validated event batch into server-side collection.
   *
   * @param batch - Schema-validated events and optional receipt timestamp.
   * @returns Counts and duplicate event identifiers.
   * @example
   * ```ts
   * import type { AnalyticsIngestAdapter } from '@alneas/sitekit/contracts';
   * type Callback = NonNullable<AnalyticsIngestAdapter['ingest']>;
   * export function invoke(host: AnalyticsIngestAdapter, ...args: Parameters<Callback>) {
   *   return host.ingest(...args);
   * }
   * ```
   */
  ingest(batch: AnalyticsBatch): Promise<AnalyticsIngestResult>;
}
