import type { ContentAdapter, MediaAdapter } from './content.js';

/** Signature algorithm, verification-key identifier, and encoded signature value. */
export interface SnapshotSignature {
  /**
   * Signature algorithm selected by the signing and verification implementation.
   */
  algorithm: 'hmac-sha256' | 'ed25519';
  /**
   * Public identifier used to select the verification key; not the key itself.
   */
  keyId: string;
  /**
   * Encoded signature bytes interpreted by the selected signature algorithm.
   */
  value: string;
}

/** Versioned identity and integrity metadata for one immutable site revision. */
export interface SiteSnapshotManifest {
  /**
   * Version label for the manifest shape.
   */
  schemaVersion: string;
  /**
   * Site identifier used to scope lookup, publication, or configuration.
   */
  siteId: string;
  /** Immutable revision identifier used for staging, promotion, and rollback. */
  revision: string;
  /**
   * Snapshot generation timestamp text.
   */
  generatedAt: string;
  /**
   * Host-defined version label for the content payload.
   */
  contentVersion: string;
  /**
   * Host-defined version label for the media payload.
   */
  mediaVersion: string;
  /** Integrity value whose computation and verification are owned by the projection implementation. */
  checksum: string;
  /**
   * Locale identifiers advertised for the site or revision.
   */
  locales: string[];
  /**
   * Optional integrity signature; verification is performed by the projection implementation.
   */
  signature?: SnapshotSignature;
}

/** Snapshot manifest with optional locations for the manifest and payloads. */
export interface SiteSnapshotReference {
  /**
   * Manifest metadata describing the immutable site revision.
   */
  manifest: SiteSnapshotManifest;
  /**
   * Retrievable URL for the serialized manifest.
   */
  manifestUrl?: string;
  /**
   * Retrievable URL for the serialized content payload.
   */
  contentUrl?: string;
  /**
   * Retrievable URL for the serialized media payload.
   */
  mediaUrl?: string;
}

/** Resolved immutable revision with content and media adapters. */
export interface SiteSnapshot {
  /**
   * Manifest metadata describing the immutable site revision.
   */
  manifest: SiteSnapshotManifest;
  /**
   * Content adapter used to retrieve canonical records.
   */
  content: ContentAdapter;
  /**
   * Media adapter or inventory used by the consuming pipeline.
   */
  media: MediaAdapter;
}

/** Edge projection boundary for staging, activating, and reading site revisions. */
export interface SiteSnapshotProjection {
  /**
   * Stages an immutable revision before activation.
   *
   * @param reference - Manifest and optional payload locations.
   * @returns Completion of staging.
   * @example
   * ```ts
   * import type { SiteSnapshotProjection } from '@alneas/sitekit/contracts';
   * type Callback = NonNullable<SiteSnapshotProjection['stage']>;
   * export function invoke(host: SiteSnapshotProjection, ...args: Parameters<Callback>) {
   *   return host.stage(...args);
   * }
   * ```
   */
  stage(reference: SiteSnapshotReference): Promise<void>;
  /**
   * Activates a staged revision for a site.
   *
   * @param siteId - Site identifier.
   * @param revision - Revision to activate.
   * @returns Completion of promotion.
   * @example
   * ```ts
   * import type { SiteSnapshotProjection } from '@alneas/sitekit/contracts';
   * type Callback = NonNullable<SiteSnapshotProjection['promote']>;
   * export function invoke(host: SiteSnapshotProjection, ...args: Parameters<Callback>) {
   *   return host.promote(...args);
   * }
   * ```
   */
  promote(siteId: string, revision: string): Promise<void>;
  /**
   * Restores a previously available revision.
   *
   * @param siteId - Site identifier.
   * @param revision - Revision to restore.
   * @returns Completion of rollback.
   * @example
   * ```ts
   * import type { SiteSnapshotProjection } from '@alneas/sitekit/contracts';
   * type Callback = NonNullable<SiteSnapshotProjection['rollback']>;
   * export function invoke(host: SiteSnapshotProjection, ...args: Parameters<Callback>) {
   *   return host.rollback(...args);
   * }
   * ```
   */
  rollback(siteId: string, revision: string): Promise<void>;
  /**
   * Reads the manifest of the currently active revision.
   *
   * @param siteId - Site identifier.
   * @returns The active manifest, or null when no revision is active.
   * @example
   * ```ts
   * import type { SiteSnapshotProjection } from '@alneas/sitekit/contracts';
   * type Callback = NonNullable<SiteSnapshotProjection['getCurrentManifest']>;
   * export function invoke(host: SiteSnapshotProjection, ...args: Parameters<Callback>) {
   *   return host.getCurrentManifest(...args);
   * }
   * ```
   */
  getCurrentManifest(siteId: string): Promise<SiteSnapshotManifest | null>;
  /**
   * Reads a selected site revision using projection-defined retrieval policy.
   *
   * @param siteId - Site identifier.
   * @param revision - Revision identifier; omitted to use the current revision.
   * @returns The selected manifest and content and media adapters.
   * @example
   * ```ts
   * import type { SiteSnapshotProjection } from '@alneas/sitekit/contracts';
   * type Callback = NonNullable<SiteSnapshotProjection['getSnapshot']>;
   * export function invoke(host: SiteSnapshotProjection, ...args: Parameters<Callback>) {
   *   return host.getSnapshot(...args);
   * }
   * ```
   */
  getSnapshot(siteId: string, revision?: string): Promise<SiteSnapshot>;
  /**
   * Reads a selected site revision using projection-defined retrieval policy.
   *
   * @param siteId - Site identifier.
   * @param revision - Revision identifier; omitted to use the current revision.
   * @returns The selected revision content adapter.
   * @example
   * ```ts
   * import type { SiteSnapshotProjection } from '@alneas/sitekit/contracts';
   * type Callback = NonNullable<SiteSnapshotProjection['getContentAdapter']>;
   * export function invoke(host: SiteSnapshotProjection, ...args: Parameters<Callback>) {
   *   return host.getContentAdapter(...args);
   * }
   * ```
   */
  getContentAdapter(siteId: string, revision?: string): Promise<ContentAdapter>;
  /**
   * Reads a selected site revision using projection-defined retrieval policy.
   *
   * @param siteId - Site identifier.
   * @param revision - Revision identifier; omitted to use the current revision.
   * @returns The selected revision media adapter.
   * @example
   * ```ts
   * import type { SiteSnapshotProjection } from '@alneas/sitekit/contracts';
   * type Callback = NonNullable<SiteSnapshotProjection['getMediaAdapter']>;
   * export function invoke(host: SiteSnapshotProjection, ...args: Parameters<Callback>) {
   *   return host.getMediaAdapter(...args);
   * }
   * ```
   */
  getMediaAdapter(siteId: string, revision?: string): Promise<MediaAdapter>;
}

/**
 * EAOS-side publication boundary. The publisher owns canonical data and only
 * announces an immutable revision to the edge projection.
 */
export interface SiteSnapshotPublisher {
  /**
   * Announces an immutable canonical revision to a projection.
   *
   * @param reference - Published manifest and payload locations.
   * @returns A publication receipt for the revision.
   * @example
   * ```ts
   * import type { SiteSnapshotPublisher } from '@alneas/sitekit/contracts';
   * type Callback = NonNullable<SiteSnapshotPublisher['publish']>;
   * export function invoke(host: SiteSnapshotPublisher, ...args: Parameters<Callback>) {
   *   return host.publish(...args);
   * }
   * ```
   */
  publish(reference: SiteSnapshotReference): Promise<SnapshotPublishEvent>;
}

/** Publication receipt identifying an immutable revision and its idempotency key. */
export interface SnapshotPublishEvent {
  /**
   * Publication event identifier supplied by the publisher.
   */
  eventId: string;
  /**
   * Caller or publisher key for recognizing repeated delivery of the same operation.
   */
  idempotencyKey: string;
  /**
   * Site identifier used to scope lookup, publication, or configuration.
   */
  siteId: string;
  /**
   * Immutable revision identifier or expected publication revision.
   */
  revision: string;
  /**
   * Retrievable URL for the serialized manifest.
   */
  manifestUrl: string;
  /**
   * Publication timestamp text supplied by the source.
   */
  publishedAt: string;
}
