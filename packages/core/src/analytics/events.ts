import { z } from 'zod';

/** Validates bounded UTM fields and supported click identifiers. */
export const campaignContextSchema = z.object({
  /**
   * UTM source value, limited to 512 characters.
   */
  source: z.string().max(512).optional(),
  /**
   * UTM medium value, limited to 512 characters.
   */
  medium: z.string().max(512).optional(),
  /**
   * UTM campaign value, limited to 512 characters.
   */
  campaign: z.string().max(512).optional(),
  /**
   * UTM search-term value, limited to 512 characters.
   */
  term: z.string().max(512).optional(),
  /**
   * UTM content value, limited to 512 characters.
   */
  content: z.string().max(512).optional(),
  /**
   * Supported provider click identifiers, each limited to 512 characters.
   */
  clickIds: z.record(z.enum(['gclid', 'fbclid', 'yclid', 'msclkid', 'ttclid']), z.string().max(512)).optional(),
});

/** Validates experiment and variant identifiers with optional exposure identity. */
export const experimentContextSchema = z.object({
  /**
   * Host identifier for the experiment.
   */
  experimentId: z.string(),
  /**
   * Host identifier for the selected experiment variant.
   */
  variantId: z.string(),
  /**
   * Optional exposure identifier, limited to 512 characters.
   */
  exposureId: z.string().max(512).optional(),
});

/** Runtime enumeration of supported normalized site event names. */
export const siteEventSchema = z.enum([
  'page_view',
  'section_view',
  'cta_impression',
  'cta_click',
  'gallery_open',
  'external_link_click',
  'navigation_click',
  'share_click',
  'share_complete',
  'booking_start',
  'booking_complete',
  'contact_submit',
  'experiment_exposure',
  'conversion',
]);

/** Validates one event and defaults metadata to an empty object. */
export const analyticsEventSchema = z.object({
  /**
   * Nonempty event identifier of at most 128 characters.
   */
  eventId: z.string().min(1).max(128),
  /**
   * Nonempty site identifier of at most 128 characters.
   */
  siteId: z.string().min(1).max(128),
  /**
   * Supported normalized site-event name.
   */
  event: siteEventSchema,
  /**
   * ISO datetime describing when the event occurred.
   */
  occurredAt: z.string().datetime(),
  /**
   * Nonempty page path of at most 2048 characters.
   */
  pagePath: z.string().min(1).max(2048),
  /**
   * Optional session identifier, limited to 512 characters.
   */
  sessionId: z.string().max(512).optional(),
  /**
   * Optional visitor identifier, limited to 512 characters.
   */
  anonymousId: z.string().max(512).optional(),
  /**
   * Optional canonical content identifier, limited to 512 characters.
   */
  contentId: z.string().max(512).optional(),
  /**
   * Optional section identifier, limited to 512 characters.
   */
  sectionId: z.string().max(512).optional(),
  /**
   * Optional validated campaign attribution and supported click identifiers.
   */
  campaign: campaignContextSchema.optional(),
  /**
   * Optional experiment assignment and exposure context.
   */
  experiment: experimentContextSchema.optional(),
  /**
   * Optional consent state associated with this event.
   */
  consent: z.enum(['unknown', 'denied', 'analytics', 'personalized']).optional(),
  /**
   * Optional referrer, limited to 512 characters.
   */
  referrer: z.string().max(512).optional(),
  /**
   * Optional finite numeric event value.
   */
  value: z.number().finite().optional(),
  /**
   * Host event metadata; defaults to an empty object.
   */
  metadata: z.record(z.string(), z.unknown()).default({}),
});

/** Validates batches of 1–100 events and an optional receipt timestamp. */
export const analyticsBatchSchema = z.object({
  /**
   * Between 1 and 100 validated analytics events.
   */
  events: z.array(analyticsEventSchema).min(1).max(100),
  /**
   * Optional ISO receipt datetime.
   */
  receivedAt: z.string().datetime().optional(),
});

/** Supported normalized site event names. */
export type SiteEvent = z.infer<typeof siteEventSchema>;
/** Validated UTM attribution and supported click identifiers. */
export type CampaignContext = z.infer<typeof campaignContextSchema>;
/** Experiment assignment and optional exposure identity. */
export type ExperimentContext = z.infer<typeof experimentContextSchema>;
/** Validated normalized event with required metadata. */
export type AnalyticsEvent = z.infer<typeof analyticsEventSchema>;
/** Validated batch containing 1–100 events. */
export type AnalyticsBatch = z.infer<typeof analyticsBatchSchema>;
/** Event input permitting generated identifiers, timestamps, and default metadata. */
export type AnalyticsEventInput = Omit<AnalyticsEvent, 'eventId' | 'occurredAt' | 'metadata'> &
  Partial<Pick<AnalyticsEvent, 'eventId' | 'occurredAt' | 'metadata'>>;

/** Sink receiving schema-validated analytics events. */
export interface AnalyticsProvider {
  /**
   * Delivers one validated analytics event.
   *
   * @param event - Normalized event to record.
   * @returns Completion, synchronously or asynchronously.
   *
   * @example
   * ```ts
   * import type { AnalyticsProvider } from '@alneas/sitekit/analytics';
   * export function useTrack(host: AnalyticsProvider, ...args: Parameters<NonNullable<AnalyticsProvider['track']>>) {
   * return host.track(...args);
   * }
   * ```
   */
  track(event: AnalyticsEvent): Promise<void> | void;
}

/** Versioned metric formula and the events and dimensions it consumes. */
export interface MetricDefinition {
  /**
   * Stable identifier for this record.
   */
  id: string;
  /**
   * Human-readable name.
   */
  name: string;
  /**
   * Human-readable description for this record or operation.
   */
  description: string;
  /**
   * Host-defined expression describing metric calculation.
   */
  formula: string;
  /**
   * Dimension names consumed by the metric formula.
   */
  dimensions: string[];
  /**
   * Normalized event names consumed by the metric formula.
   */
  sourceEvents: SiteEvent[];
  /**
   * Version identifier for this definition.
   */
  version: string;
}

/**
 * Validates and normalizes one event using the canonical analytics schema.
 *
 * @param value - Untrusted event payload.
 * @returns A parsed event with metadata defaulting to an empty object.
 * @throws ZodError when the event violates the schema.
 * @example
 * ```ts
 * import { parseAnalyticsEvent } from '@alneas/sitekit/analytics';
 * const event = parseAnalyticsEvent({ eventId: 'event', siteId: 'example', event: 'page_view', occurredAt: '2026-01-01T00:00:00.000Z', pagePath: '/' });
 * ```
 */
export function parseAnalyticsEvent(value: unknown): AnalyticsEvent {
  return analyticsEventSchema.parse(value);
}

/**
 * Validates a batch containing between 1 and 100 analytics events.
 *
 * @param value - Untrusted batch payload with events and optional receivedAt.
 * @returns A parsed batch whose events have normalized schema defaults.
 * @throws ZodError for invalid events, timestamps, or batch size.
 * @example
 * ```ts
 * import { parseAnalyticsBatch, createAnalyticsEvent } from '@alneas/sitekit/analytics';
 * const batch = parseAnalyticsBatch({ events: [createAnalyticsEvent({ siteId: 'example', event: 'page_view', pagePath: '/' })] });
 * ```
 */
export function parseAnalyticsBatch(value: unknown): AnalyticsBatch {
  return analyticsBatchSchema.parse(value);
}

/**
 * Creates and validates an event, generating missing identity and occurrence time.
 *
 * @param input - Event fields with optional eventId, occurredAt, and metadata.
 * @returns A validated event with a UUID and current ISO timestamp when omitted.
 * @throws ZodError when input violates the event schema.
 * @remarks Requires crypto.randomUUID when eventId is omitted.
 * @example
 * ```ts
 * import { createAnalyticsEvent } from '@alneas/sitekit/analytics';
 * const event = createAnalyticsEvent({ siteId: 'example', event: 'page_view', pagePath: '/' });
 * ```
 */
export function createAnalyticsEvent(
  input: AnalyticsEventInput,
): AnalyticsEvent {
  return parseAnalyticsEvent({
    ...input,
    eventId: input.eventId ?? crypto.randomUUID(),
    occurredAt: input.occurredAt ?? new Date().toISOString(),
  });
}
