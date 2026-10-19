import type { ContentItem, MediaAsset } from '../contracts/content.js';
import type { SiteSnapshotManifest } from '../contracts/projection.js';

/**
 * Revision metadata and already selected content/media records for deterministic array serialization.
 */
export interface SiteSnapshotBuildInput {
  /**
   * Site identifier used to scope lookup, publication, or configuration.
   */
  siteId: string;
  /**
   * Immutable revision identifier or expected publication revision.
   */
  revision: string;
  /**
   * Host-defined version label for the content payload.
   */
  contentVersion: string;
  /**
   * Host-defined version label for the media payload.
   */
  mediaVersion: string;
  /** Manifest locale labels sorted lexically; does not filter payload records. */
  locales: string[];
  /** Already selected content records; sorted by id before serialization. */
  content: readonly ContentItem[];
  /** Already selected media records; sorted by id before serialization. */
  media: readonly MediaAsset[];
  /** ISO timestamp metadata; defaults to the current time when omitted. */
  generatedAt?: string;
  /** Manifest schema label; defaults to 1 without compatibility validation. */
  schemaVersion?: string;
}

/**
 * Manifest and exact serialized content/media payload strings covered by its checksum.
 */
export interface SiteSnapshotArtifact {
  /**
   * Manifest metadata describing the immutable site revision.
   */
  manifest: SiteSnapshotManifest;
  /**
   * Serialized content array sorted by record identifier.
   */
  contentJson: string;
  /**
   * Serialized media array sorted by record identifier.
   */
  mediaJson: string;
}

function sortById<T extends { id: string }>(records: readonly T[]): T[] {
  return [...records].sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
}

function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Hashes the UTF-8 bytes of content JSON, one newline, and media JSON using SHA-256.
 *
 * @param contentJson - Exact serialized content payload.
 * @param mediaJson - Exact serialized media payload.
 * @returns A lowercase hexadecimal digest prefixed with sha256:.
 * @throws Web Crypto digest failures reject the promise.
 * @remarks Requires Web Crypto subtle.digest. Does not parse, sort, or canonicalize the supplied strings.
 * @example
 * ```ts
 * import { computeSiteSnapshotChecksum } from '@alneas/sitekit/projection';
 * const checksum = await computeSiteSnapshotChecksum('[]', '[]');
 * ```
 */
export async function computeSiteSnapshotChecksum(
  contentJson: string,
  mediaJson: string,
): Promise<string> {
  const checksumInput = `${contentJson}\n${mediaJson}`;
  return `sha256:${toHex(
    await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(checksumInput)),
  )}`;
}

/**
 * Sorts content/media records by ID and serializes their payloads with a shared checksum and manifest.
 *
 * @param input - Site/revision metadata and content/media arrays to serialize.
 * @returns A manifest and exact JSON strings used for the checksum.
 * @throws JSON serialization and checksum failures propagate.
 * @remarks Requires Web Crypto. Sorts record arrays and locale names, but does not normalize object property order, filter access, validate metadata, or freeze the result. Equal inputs need fixed generatedAt for identical manifests.
 * @example
 * ```ts
 * import { buildSiteSnapshot } from '@alneas/sitekit/projection';
 * const artifact = await buildSiteSnapshot({ siteId: 'example', revision: '1', contentVersion: '1', mediaVersion: '1', locales: ['en'], content: [], media: [], generatedAt: '2026-01-01T00:00:00Z' });
 * ```
 */
export async function buildSiteSnapshot(
  input: SiteSnapshotBuildInput,
): Promise<SiteSnapshotArtifact> {
  const contentJson = JSON.stringify(sortById(input.content));
  const mediaJson = JSON.stringify(sortById(input.media));
  const checksum = await computeSiteSnapshotChecksum(contentJson, mediaJson);
  const generatedAt = input.generatedAt ?? new Date().toISOString();

  return {
    manifest: {
      schemaVersion: input.schemaVersion ?? '1',
      siteId: input.siteId,
      revision: input.revision,
      generatedAt,
      contentVersion: input.contentVersion,
      mediaVersion: input.mediaVersion,
      checksum,
      locales: [...input.locales].sort((left, right) =>
        left < right ? -1 : left > right ? 1 : 0,
      ),
    },
    contentJson,
    mediaJson,
  };
}
