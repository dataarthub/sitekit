import type { SiteSnapshotManifest } from '@alneas/sitekit';

function requiredString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Invalid snapshot manifest field: ${name}`);
  }
  return value;
}

/**
 * Parses the public structural manifest contract at the Cloudflare boundary.
 * @param value - Untrusted decoded JSON to validate and normalize.
 * @returns Required manifest fields plus a structurally valid optional signature.
 * @throws If required strings, locale entries, or signature fields are malformed.
 * @remarks Does not verify cryptographic signatures, checksum bytes, timestamps, or schema
 * version support. Empty locale arrays are accepted and unknown fields are discarded.
 * @example
 * ```typescript
 * import { parseCloudflareSnapshotManifest } from '@alneas/sitekit-cloudflare';
 * const manifest = parseCloudflareSnapshotManifest({
 *   schemaVersion: '1', siteId: 'example-site', revision: 'example-revision',
 *   generatedAt: '2026-01-01T00:00:00.000Z', contentVersion: '1', mediaVersion: '1',
 *   checksum: 'example-checksum', locales: ['en'],
 * });
 * ```
 */
export function parseCloudflareSnapshotManifest(value: unknown): SiteSnapshotManifest {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Snapshot manifest must be an object');
  }
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.locales) || record.locales.some(locale => typeof locale !== 'string' || locale.length === 0)) {
    throw new Error('Invalid snapshot manifest field: locales');
  }
  const manifest: SiteSnapshotManifest = {
    schemaVersion: requiredString(record.schemaVersion, 'schemaVersion'),
    siteId: requiredString(record.siteId, 'siteId'),
    revision: requiredString(record.revision, 'revision'),
    generatedAt: requiredString(record.generatedAt, 'generatedAt'),
    contentVersion: requiredString(record.contentVersion, 'contentVersion'),
    mediaVersion: requiredString(record.mediaVersion, 'mediaVersion'),
    checksum: requiredString(record.checksum, 'checksum'),
    locales: record.locales,
  };
  if (record.signature !== undefined) {
    if (typeof record.signature !== 'object' || record.signature === null) {
      throw new Error('Invalid snapshot manifest field: signature');
    }
    const signature = record.signature as Record<string, unknown>;
    const algorithm = signature.algorithm;
    if (algorithm !== 'hmac-sha256' && algorithm !== 'ed25519') {
      throw new Error('Invalid snapshot manifest field: signature.algorithm');
    }
    manifest.signature = {
      algorithm,
      keyId: requiredString(signature.keyId, 'signature.keyId'),
      value: requiredString(signature.value, 'signature.value'),
    };
  }
  return manifest;
}
