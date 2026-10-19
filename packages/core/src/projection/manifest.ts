import { z } from 'zod';
import type { SiteSnapshotManifest } from '../contracts/projection.js';

/** Structural signature metadata schema; does not verify cryptographic authenticity. */
export const snapshotSignatureSchema = z.object({
  /** Accepted signature algorithm label; schema validation does not verify the signature. */
  algorithm: z.enum(['hmac-sha256', 'ed25519']),
  /** Nonempty verification-key identifier; no key material is stored here. */
  keyId: z.string().min(1),
  /** Nonempty encoded signature text; encoding and authenticity are checked separately. */
  value: z.string().min(1),
});

/** Manifest metadata validation with a timestamp and at least one locale; payload integrity is checked separately. */
export const siteSnapshotManifestSchema = z.object({
  /** Nonempty manifest schema label; compatibility is not checked by this schema. */
  schemaVersion: z.string().min(1),
  /** Nonempty site identifier associated with this revision. */
  siteId: z.string().min(1),
  /** Nonempty immutable projection revision label. */
  revision: z.string().min(1),
  /** ISO datetime describing when the revision was generated. */
  generatedAt: z.string().datetime(),
  /** Nonempty version label for the serialized content payload. */
  contentVersion: z.string().min(1),
  /** Nonempty version label for the serialized media payload. */
  mediaVersion: z.string().min(1),
  /** Nonempty integrity value; this schema does not recompute or verify it. */
  checksum: z.string().min(1),
  /** At least one nonempty locale identifier advertised by the revision. */
  locales: z.array(z.string().min(1)).min(1),
  /** Optional structural signature metadata; cryptographic verification belongs to the projection. */
  signature: snapshotSignatureSchema.optional(),
});

/**
 * Validates manifest metadata and returns its supported fields.
 *
 * @param value - Unknown manifest-like value.
 * @returns A parsed manifest with nonempty identifiers/locales, an ISO timestamp, and optional signature metadata.
 * @throws A ZodError when a manifest field fails schema validation.
 * @remarks Checks shape only: checksum text, payload integrity, signature authenticity, and schema-version compatibility are not verified. Unknown fields are stripped.
 * @example
 * ```ts
 * import { parseSiteSnapshotManifest, computeSiteSnapshotChecksum } from '@alneas/sitekit/projection';
 * const manifest = parseSiteSnapshotManifest({ schemaVersion: '1', siteId: 'example', revision: '1', generatedAt: '2026-01-01T00:00:00Z', contentVersion: '1', mediaVersion: '1', checksum: await computeSiteSnapshotChecksum('[]', '[]'), locales: ['en'] });
 * ```
 */
export function parseSiteSnapshotManifest(value: unknown): SiteSnapshotManifest {
  const parsed = siteSnapshotManifestSchema.parse(value);
  const manifest = {
    schemaVersion: parsed.schemaVersion,
    siteId: parsed.siteId,
    revision: parsed.revision,
    generatedAt: parsed.generatedAt,
    contentVersion: parsed.contentVersion,
    mediaVersion: parsed.mediaVersion,
    checksum: parsed.checksum,
    locales: parsed.locales,
  };
  return parsed.signature === undefined
    ? manifest
    : { ...manifest, signature: parsed.signature };
}
