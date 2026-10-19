import type { ContentAdapter, MediaAdapter, MediaAsset, ContentItem } from '../contracts/content.js';
import type {
  SiteSnapshotManifest,
  SiteSnapshotPublisher,
  SiteSnapshotReference,
  SnapshotPublishEvent,
} from '../contracts/projection.js';
import {
  createEaosCmsSnapshotAdapters,
  type EaosCmsContentAdapterOptions,
  type EaosCmsSnapshotLoader,
} from '../content/eaos-cms.js';
import { buildSiteSnapshot, type SiteSnapshotArtifact } from './snapshot.js';

/**
 * Adapters and collection names to enumerate before serializing a site projection.
 */
export interface SnapshotBuildSource {
  /**
   * Content adapter used to retrieve canonical records.
   */
  content: ContentAdapter;
  /** Collection names queried once each without pagination or locale filtering. */
  collections: readonly string[];
  /**
   * Media adapter whose optional listMedia method supplies the complete media inventory.
   */
  media: MediaAdapter;
}

/**
 * Stored JSON artifact category: payload content, payload media, or their manifest.
 */
export type SnapshotArtifactKind = 'manifest' | 'content' | 'media';

/**
 * Host storage boundary that writes an artifact and returns its retrievable URL.
 */
export interface SnapshotArtifactStore {
  /**
   * Writes one JSON artifact through host-owned durable storage.
   *
   * @param input - Input payload to transform or store.
   * @returns A retrievable URL for the stored artifact.
   * @example
   * ```ts
   * import type { SnapshotArtifactStore } from '@alneas/sitekit/projection';
   * type Callback = NonNullable<SnapshotArtifactStore['put']>;
   * export function invoke(host: SnapshotArtifactStore, ...args: Parameters<Callback>) {
   *   return host.put(...args);
   * }
   * ```
   */
  put(input: {
    /**
     * Site identifier used to scope lookup, publication, or configuration.
     */
    siteId: string;
    /**
     * Immutable revision identifier or expected publication revision.
     */
    revision: string;
    /**
     * Discriminator identifying the source or payload category.
     */
    kind: SnapshotArtifactKind;
    /**
     * Exact serialized JSON artifact to persist before publishing its retrievable URL.
     */
    body: string;
    /**
     * JSON MIME type used when storing this manifest or payload.
     */
    contentType: 'application/json';
  }): Promise<string>;
}

/**
 * Inputs and host-owned side effects for building, storing, optionally signing, and publishing one revision.
 */
export interface BuildAndPublishSiteSnapshotOptions {
  /**
   * Site identifier used to scope lookup, publication, or configuration.
   */
  siteId: string;
  /** Immutable projection revision identifier supplied by the host. */
  revision: string;
  /**
   * Host-defined version label for the content payload.
   */
  contentVersion: string;
  /**
   * Host-defined version label for the media payload.
   */
  mediaVersion: string;
  /** Manifest locale labels; the pipeline does not use these to filter records. */
  locales: string[];
  /**
   * Content/media adapters and collection selection enumerated before serialization.
   */
  source: SnapshotBuildSource;
  /** Store responsible for durable writes and returning retrievable artifact URLs. */
  artifacts: SnapshotArtifactStore;
  /** Publication boundary invoked after all artifact URLs have been written. */
  publisher: SiteSnapshotPublisher;
  /**
   * Snapshot generation timestamp text.
   */
  generatedAt?: string;
  /**
   * Optional signer; may add a signature but must preserve manifest metadata and locale order.
   * @param manifest - Original immutable manifest; a signer may add a signature while preserving metadata.
   * @returns The manifest with an optional signature; identity, integrity metadata and locale order must remain unchanged.
   * @example
   * ```ts
   * import type { BuildAndPublishSiteSnapshotOptions } from '@alneas/sitekit/projection';
   * type Callback = NonNullable<BuildAndPublishSiteSnapshotOptions['signManifest']>;
   * export function invoke(callback: Callback, ...args: Parameters<Callback>) {
   *   return callback(...args);
   * }
   * ```
   */
  signManifest?: (manifest: SiteSnapshotManifest) => Promise<SiteSnapshotManifest>;
}

/**
 * Completed publication artifact, retrievable reference URLs, and matching publisher event.
 */
export interface PublishedSiteSnapshot {
  /**
   * Serialized snapshot manifest and payloads produced by the build.
   */
  artifact: SiteSnapshotArtifact;
  /**
   * External provenance or retrievable revision reference associated with this result.
   */
  reference: SiteSnapshotReference;
  /**
   * Matching publication receipt returned after storing the revision.
   */
  event: SnapshotPublishEvent;
}

/**
 * CMS-backed publication options with optional expected site identity and revision/version naming callbacks.
 */
export interface BuildAndPublishEaosCmsSiteSnapshotOptions {
  /**
   * Host loader supplying one approved CMS publication snapshot.
   */
  cms: EaosCmsSnapshotLoader;
  /** Optional guard rejecting a snapshot for another site. */
  expectedSiteId?: string;
  /**
   * Mapping overrides applied when creating canonical content adapters.
   */
  contentOptions?: EaosCmsContentAdapterOptions;
  /** Collection names queried once each without pagination or locale filtering. */
  collections: readonly string[];
  /** Manifest locale labels; the pipeline does not use these to filter records. */
  locales: string[];
  /** Store responsible for durable writes and returning retrievable artifact URLs. */
  artifacts: SnapshotArtifactStore;
  /** Publication boundary invoked after all artifact URLs have been written. */
  publisher: SiteSnapshotPublisher;
  /**
   * Snapshot generation timestamp text.
   */
  generatedAt?: string;
  /**
   * Optional signer; may add a signature but must preserve manifest metadata and locale order.
   * @param manifest - Original immutable manifest; a signer may add a signature while preserving metadata.
   * @returns The manifest with an optional signature; identity, integrity metadata and locale order must remain unchanged.
   * @example
   * ```ts
   * import type { BuildAndPublishEaosCmsSiteSnapshotOptions } from '@alneas/sitekit/projection';
   * type Callback = NonNullable<BuildAndPublishEaosCmsSiteSnapshotOptions['signManifest']>;
   * export function invoke(callback: Callback, ...args: Parameters<Callback>) {
   *   return callback(...args);
   * }
   * ```
   */
  signManifest?: (manifest: SiteSnapshotManifest) => Promise<SiteSnapshotManifest>;
  /**
   * Maps the numeric CMS revision to a projection revision; defaults to cms- plus that number.
   * @param cmsRevision - Positive integer CMS publication revision passed to the naming callback.
   * @returns Projection revision label for this CMS publication.
   * @example
   * ```ts
   * import type { BuildAndPublishEaosCmsSiteSnapshotOptions } from '@alneas/sitekit/projection';
   * type Callback = NonNullable<BuildAndPublishEaosCmsSiteSnapshotOptions['revision']>;
   * export function invoke(callback: Callback, ...args: Parameters<Callback>) {
   *   return callback(...args);
   * }
   * ```
   */
  revision?: (cmsRevision: number) => string;
  /**
   * Maps the numeric CMS revision to both payload version labels; defaults to its string value.
   * @param cmsRevision - Positive integer CMS publication revision passed to the naming callback.
   * @returns Payload version label shared by content and media.
   * @example
   * ```ts
   * import type { BuildAndPublishEaosCmsSiteSnapshotOptions } from '@alneas/sitekit/projection';
   * type Callback = NonNullable<BuildAndPublishEaosCmsSiteSnapshotOptions['version']>;
   * export function invoke(callback: Callback, ...args: Parameters<Callback>) {
   *   return callback(...args);
   * }
   * ```
   */
  version?: (cmsRevision: number) => string;
}

function ensureManifestMatches(
  original: SiteSnapshotManifest,
  signed: SiteSnapshotManifest,
): SiteSnapshotManifest {
  const immutableFields: Array<keyof SiteSnapshotManifest> = [
    'schemaVersion',
    'siteId',
    'revision',
    'generatedAt',
    'contentVersion',
    'mediaVersion',
    'checksum',
  ];
  for (const field of immutableFields) {
    if (signed[field] !== original[field]) throw new Error(`Manifest signer changed immutable field: ${field}`);
  }
  if (signed.locales.join('\u0000') !== original.locales.join('\u0000')) {
    throw new Error('Manifest signer changed immutable field: locales');
  }
  return signed;
}

/**
 * Builds payloads, stores content then media then manifest, and publishes their reference.
 *
 * @param options - Site metadata, candidate collections, content/media adapters, artifact store, publisher, and optional manifest signer.
 * @returns The serialized artifact, stored URLs, and verified matching publication event.
 * @throws Source, storage, signing, serialization, or publisher failures propagate; rejects changed manifest metadata or an unrelated event site/revision.
 * @remarks Sources own public/locale filtering and complete collection loading; this function does not paginate or filter records. Media is empty when listMedia is unavailable. Requires Web Crypto. Partial writes or publication changes are not rolled back on failure.
 * @example
 * ```ts
 * import { buildAndPublishSiteSnapshot } from '@alneas/sitekit/projection';
 * import type { SnapshotBuildSource, SnapshotArtifactStore } from '@alneas/sitekit/projection';
 * import type { SiteSnapshotPublisher } from '@alneas/sitekit/contracts';
 * async function publish(source: SnapshotBuildSource, artifacts: SnapshotArtifactStore, publisher: SiteSnapshotPublisher) {
 *   return buildAndPublishSiteSnapshot({
 *     siteId: 'example', revision: '1', contentVersion: '1', mediaVersion: '1',
 *     locales: ['en'], source, artifacts, publisher,
 *   });
 * }
 * ```
 */
export async function buildAndPublishSiteSnapshot(
  options: BuildAndPublishSiteSnapshotOptions,
): Promise<PublishedSiteSnapshot> {
  const contentLists = await Promise.all(
    options.source.collections.map(collection =>
      options.source.content.listCollection({ collection }),
    ),
  );
  const content: ContentItem[] = contentLists.flat();
  const media: MediaAsset[] = options.source.media.listMedia
    ? await options.source.media.listMedia({})
    : [];
  const artifactInput = {
    siteId: options.siteId,
    revision: options.revision,
    contentVersion: options.contentVersion,
    mediaVersion: options.mediaVersion,
    locales: options.locales,
    content,
    media,
    ...(options.generatedAt ? { generatedAt: options.generatedAt } : {}),
  };
  const unsigned = await buildSiteSnapshot(artifactInput);
  const contentUrl = await options.artifacts.put({
    siteId: options.siteId,
    revision: options.revision,
    kind: 'content',
    body: unsigned.contentJson,
    contentType: 'application/json',
  });
  const mediaUrl = await options.artifacts.put({
    siteId: options.siteId,
    revision: options.revision,
    kind: 'media',
    body: unsigned.mediaJson,
    contentType: 'application/json',
  });
  const manifest = ensureManifestMatches(
    unsigned.manifest,
    options.signManifest ? await options.signManifest(unsigned.manifest) : unsigned.manifest,
  );
  const manifestUrl = await options.artifacts.put({
    siteId: options.siteId,
    revision: options.revision,
    kind: 'manifest',
    body: JSON.stringify(manifest),
    contentType: 'application/json',
  });
  const reference: SiteSnapshotReference = { manifest, manifestUrl, contentUrl, mediaUrl };
  const event = await options.publisher.publish(reference);
  if (event.siteId !== options.siteId || event.revision !== options.revision) {
    throw new Error('Snapshot publisher returned an unrelated revision');
  }
  return {
    artifact: { ...unsigned, manifest },
    reference,
    event,
  };
}

/**
 * Loads one CMS snapshot and publishes selected collections and top-level media through the projection pipeline.
 *
 * @param options - CMS loader, collection/locale metadata, artifact store, publisher, and optional identity/version/signing configuration.
 * @returns The projection artifact, stored reference, and matching publication event.
 * @throws Rejects an expectedSiteId mismatch; loader, adapter, build, storage, signing, and publication failures propagate.
 * @remarks Reads the loader once. Defaults revision to cms- plus the numeric CMS revision and both payload versions to that revision string. The loader owns publication approval and full validation; locales describe the manifest and do not filter source content.
 * @example
 * ```ts
 * import { buildAndPublishEaosCmsSiteSnapshot } from '@alneas/sitekit/projection';
 * import type { SnapshotArtifactStore } from '@alneas/sitekit/projection';
 * import type { EaosCmsSnapshotLoader } from '@alneas/sitekit/content';
 * import type { SiteSnapshotPublisher } from '@alneas/sitekit/contracts';
 * async function publishCms(cms: EaosCmsSnapshotLoader, artifacts: SnapshotArtifactStore, publisher: SiteSnapshotPublisher) {
 *   return buildAndPublishEaosCmsSiteSnapshot({
 *     cms, artifacts, publisher, collections: ['posts'], locales: ['en'],
 *     contentOptions: { defaultLocale: 'en' },
 *   });
 * }
 * ```
 */
export async function buildAndPublishEaosCmsSiteSnapshot(
  options: BuildAndPublishEaosCmsSiteSnapshotOptions,
): Promise<PublishedSiteSnapshot> {
  const snapshot = await options.cms.loadPublishedSnapshot();
  if (options.expectedSiteId !== undefined && snapshot.siteId !== options.expectedSiteId) {
    throw new Error('EAOS CMS snapshot siteId does not match the expected site');
  }
  const adapters = createEaosCmsSnapshotAdapters(snapshot, options.contentOptions);
  const version = options.version?.(snapshot.revision) ?? String(snapshot.revision);
  return buildAndPublishSiteSnapshot({
    siteId: snapshot.siteId,
    revision: options.revision?.(snapshot.revision) ?? `cms-${snapshot.revision}`,
    contentVersion: version,
    mediaVersion: version,
    locales: options.locales,
    source: {
      content: adapters.content,
      collections: options.collections,
      media: adapters.media,
    },
    artifacts: options.artifacts,
    publisher: options.publisher,
    ...(options.generatedAt ? { generatedAt: options.generatedAt } : {}),
    ...(options.signManifest ? { signManifest: options.signManifest } : {}),
  });
}
