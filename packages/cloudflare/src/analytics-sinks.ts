import type { AnalyticsBatch, AnalyticsIngestAdapter, AnalyticsIngestResult } from '@alneas/sitekit';

/**
 * Minimal server queue binding receiving a normalized analytics batch.
 */
export interface CloudflareAnalyticsQueue {
  /** Enqueues a batch.
   * @param message - Normalized batch to forward.
   * @returns Resolves when the queue accepts the message.
   *
   * @example
   * ```typescript
   * import type { CloudflareAnalyticsQueue } from '@alneas/sitekit-cloudflare';
   * export function invoke(adapter: CloudflareAnalyticsQueue, ...args: Parameters<NonNullable<CloudflareAnalyticsQueue['send']>>) {
   *   return adapter.send(...args);
   * }
   * ```
   */
  send(message: AnalyticsBatch): Promise<void>;
}

/**
 * Compact Analytics Engine dimensions derived from one normalized event.
 */
export interface AnalyticsEngineDataPoint {
  /** Present event ID, page/session/anonymous/referrer/exposure/consent strings in that order. */
  blobs: string[];
  /** Event numeric value as a single entry, or an empty array. */
  doubles: number[];
  /** Present site/event/content/section/campaign/experiment strings, filtered then capped at 20. */
  indexes: string[];
}

/**
 * Minimal Analytics Engine binding used by the server event writer.
 */
export interface CloudflareAnalyticsEngine {
  /** Writes one event data point.
   * @param point - Compact dimensions for the event.
   * @returns Completion when supported by the binding.
   *
   * @example
   * ```typescript
   * import type { CloudflareAnalyticsEngine } from '@alneas/sitekit-cloudflare';
   * export function invoke(adapter: CloudflareAnalyticsEngine, ...args: Parameters<NonNullable<CloudflareAnalyticsEngine['writeDataPoint']>>) {
   *   return adapter.writeDataPoint(...args);
   * }
   * ```
   */
  writeDataPoint(point: AnalyticsEngineDataPoint): void | Promise<void>;
}

function accepted(batch: AnalyticsBatch): AnalyticsIngestResult {
  return { accepted: batch.events.length, rejected: 0, duplicateEventIds: [] };
}

/**
 * Creates an analytics sink that enqueues each normalized batch once.
 * @param queue - Server-side queue binding.
 * @returns An ingest adapter reporting every event accepted after send resolves.
 * @remarks Queue acceptance is not proof of downstream persistence. This adapter performs no deduplication.
 * @example
 * ```typescript
 * import { createQueueAnalyticsIngestAdapter, type CloudflareAnalyticsQueue }
 *   from '@alneas/sitekit-cloudflare';
 * export function exampleSink(queue: CloudflareAnalyticsQueue) {
 *   return createQueueAnalyticsIngestAdapter(queue);
 * }
 * ```
 */
export function createQueueAnalyticsIngestAdapter(queue: CloudflareAnalyticsQueue): AnalyticsIngestAdapter {
  return {
    async ingest(batch) {
      await queue.send(batch);
      return accepted(batch);
    },
  };
}

function pointFor(event: AnalyticsBatch['events'][number]): AnalyticsEngineDataPoint {
  const campaign = event.campaign;
  const experiment = event.experiment;
  const indexes = [
    event.siteId,
    event.event,
    event.contentId,
    event.sectionId,
    campaign?.source,
    campaign?.medium,
    campaign?.campaign,
    experiment?.experimentId,
    experiment?.variantId,
  ].filter((value): value is string => Boolean(value)).slice(0, 20);
  const blobs = [
    event.eventId,
    event.pagePath,
    event.sessionId,
    event.anonymousId,
    event.referrer,
    experiment?.exposureId,
    event.consent,
  ].filter((value): value is string => Boolean(value));
  return {
    indexes,
    blobs,
    doubles: event.value === undefined ? [] : [event.value],
  };
}

/**
 * Creates an Analytics Engine sink writing one compact data point per event.
 * @param dataset - Server-side Analytics Engine binding.
 * @returns An ingest adapter accepting the batch after all sequential writes finish.
 * @remarks Missing dimensions are filtered, so string positions depend on present fields.
 * No deduplication is performed; a later failure can follow earlier successful writes.
 * @example
 * ```typescript
 * import { createAnalyticsEngineIngestAdapter, type CloudflareAnalyticsEngine }
 *   from '@alneas/sitekit-cloudflare';
 * export function exampleSink(dataset: CloudflareAnalyticsEngine) {
 *   return createAnalyticsEngineIngestAdapter(dataset);
 * }
 * ```
 */
export function createAnalyticsEngineIngestAdapter(
  dataset: CloudflareAnalyticsEngine,
): AnalyticsIngestAdapter {
  return {
    async ingest(batch) {
      for (const event of batch.events) await dataset.writeDataPoint(pointFor(event));
      return accepted(batch);
    },
  };
}

/**
 * Creates a concurrent fanout sink for the same analytics batch.
 * @param adapters - Nonempty collection of destination adapters.
 * @returns An ingest adapter reporting minimum accepted, maximum rejected, and unique duplicate IDs.
 * @throws If adapters is empty; ingest rejects if any destination rejects.
 * @remarks Fanout is not transactional. A rejecting sink may coexist with successful writes to
 * other sinks; host retries must account for duplicates and partial delivery.
 * @example
 * ```typescript
 * import { createFanoutAnalyticsIngestAdapter, createQueueAnalyticsIngestAdapter,
 *   type CloudflareAnalyticsQueue } from '@alneas/sitekit-cloudflare';
 * export function exampleFanout(first: CloudflareAnalyticsQueue, second: CloudflareAnalyticsQueue) {
 *   return createFanoutAnalyticsIngestAdapter([
 *     createQueueAnalyticsIngestAdapter(first), createQueueAnalyticsIngestAdapter(second),
 *   ]);
 * }
 * ```
 */
export function createFanoutAnalyticsIngestAdapter(
  adapters: readonly AnalyticsIngestAdapter[],
): AnalyticsIngestAdapter {
  if (adapters.length === 0) throw new Error('At least one analytics sink is required');
  return {
    async ingest(batch) {
      const results = await Promise.all(adapters.map(adapter => adapter.ingest(batch)));
      return {
        accepted: Math.min(...results.map(result => result.accepted)),
        rejected: Math.max(...results.map(result => result.rejected)),
        duplicateEventIds: [...new Set(results.flatMap(result => result.duplicateEventIds))],
      };
    },
  };
}
