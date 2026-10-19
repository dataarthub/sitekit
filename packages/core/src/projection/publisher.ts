import type {
  SiteSnapshotProjection,
  SiteSnapshotPublisher,
  SiteSnapshotReference,
  SnapshotPublishEvent,
} from '../contracts/projection.js';

/**
 * Optional event metadata factories and fallback manifest URL resolver used after projection promotion.
 */
export interface ProjectionPublisherOptions {
  /**
   * Fallback URL resolver used when the reference omits manifestUrl.
   * @param reference - Immutable manifest and optional retrievable payload locations.
   * @returns Manifest URL included in the publication receipt.
   * @example
   * ```ts
   * import type { ProjectionPublisherOptions } from '@alneas/sitekit/projection';
   * type Callback = NonNullable<ProjectionPublisherOptions['manifestUrl']>;
   * export function invoke(callback: Callback, ...args: Parameters<Callback>) {
   *   return callback(...args);
   * }
   * ```
   */
  manifestUrl?: (reference: SiteSnapshotReference) => string;
  /**
   * Event identifier factory; defaults to crypto.randomUUID.
   * @returns New publication event identifier.
   * @example
   * ```ts
   * import type { ProjectionPublisherOptions } from '@alneas/sitekit/projection';
   * type Callback = NonNullable<ProjectionPublisherOptions['eventId']>;
   * export function invoke(callback: Callback, ...args: Parameters<Callback>) {
   *   return callback(...args);
   * }
   * ```
   */
  eventId?: () => string;
  /**
   * Publication timestamp factory; defaults to the current ISO timestamp.
   * @returns Publication timestamp text used in the receipt.
   * @example
   * ```ts
   * import type { ProjectionPublisherOptions } from '@alneas/sitekit/projection';
   * type Callback = NonNullable<ProjectionPublisherOptions['publishedAt']>;
   * export function invoke(callback: Callback, ...args: Parameters<Callback>) {
   *   return callback(...args);
   * }
   * ```
   */
  publishedAt?: () => string;
}

function defaultEventId(): string {
  return globalThis.crypto.randomUUID();
}

/**
 * Coordinates stage and promote operations, then checks the projection head revision and checksum.
 *
 * @param projection - Projection implementation owning storage, promotion, and current-manifest lookup.
 * @param options - Optional manifest URL resolver, event ID generator, and publication clock.
 * @returns A publisher producing a publication event after head verification succeeds.
 * @throws Returned publish calls reject projection failures, head mismatch, missing manifest URL, or callback errors.
 * @remarks Atomicity, payload verification, and rollback belong to the projection. Head verification occurs after promotion; later failures do not undo it. Default event IDs require crypto.randomUUID.
 * @example
 * ```ts
 * import { createProjectionSnapshotPublisher } from '@alneas/sitekit/projection';
 * import type { SiteSnapshotProjection } from '@alneas/sitekit/contracts';
 * function publisherFor(projection: SiteSnapshotProjection) {
 *   return createProjectionSnapshotPublisher(projection, {
 *     manifestUrl: reference => `https://example.org/revisions/${encodeURIComponent(reference.manifest.revision)}/manifest.json`,
 *   });
 * }
 * ```
 */
export function createProjectionSnapshotPublisher(
  projection: SiteSnapshotProjection,
  options: ProjectionPublisherOptions = {},
): SiteSnapshotPublisher {
  return {
    async publish(reference: SiteSnapshotReference): Promise<SnapshotPublishEvent> {
      const { manifest } = reference;
      await projection.stage(reference);
      await projection.promote(manifest.siteId, manifest.revision);

      const current = await projection.getCurrentManifest(manifest.siteId);
      if (!current || current.revision !== manifest.revision || current.checksum !== manifest.checksum) {
        throw new Error(`Snapshot promotion could not be verified: ${manifest.siteId}/${manifest.revision}`);
      }

      const manifestUrl = reference.manifestUrl ?? options.manifestUrl?.(reference);
      if (!manifestUrl) throw new Error('A manifest URL is required for snapshot publish events');
      const publishedAt = options.publishedAt?.() ?? new Date().toISOString();

      return {
        eventId: options.eventId?.() ?? defaultEventId(),
        idempotencyKey: `${manifest.siteId}:${manifest.revision}`,
        siteId: manifest.siteId,
        revision: manifest.revision,
        manifestUrl,
        publishedAt,
      };
    },
  };
}
