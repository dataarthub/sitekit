import type { MediaAdapter, MediaAsset, MediaQuery } from '@alneas/sitekit/contracts';
import type { MediaUploadAdapter, MediaUploadRequest } from '@alneas/sitekit/media';
import { createD1DataAccessAdapter, type CloudflareDataAccessAdapter } from './data-access.js';
import { createR2MediaUploadAdapter, type R2MediaUploadOptions } from './media.js';
import type { CloudflareD1Database, CloudflareR2Bucket } from './types.js';

interface MediaRow {
  id: string;
  asset_json: string;
  key: string;
  tenant_id?: string;
}

/**
 * Server bindings and optional tenant scope for the R2/D1 media library.
 * @remarks Tenant filters activate only when both tenantField and tenantId are nonempty;
 * object IDs and keys must be globally unique across tenants sharing storage.
 */
export interface R2MediaLibraryOptions extends R2MediaUploadOptions {
  /** Provisioned D1 metadata database. */
  database: CloudflareD1Database;
  /** Metadata table identifier; defaults to `media_assets`. */
  table?: string;
  /** Optional D1 tenant column, paired with a trusted tenantId. */
  tenantField?: string;
  /** Host-resolved tenant scope; never take this directly from unverified browser input. */
  tenantId?: string;
}

/**
 * Media read/upload adapter with mutable metadata and object deletion operations.
 */
export interface MediaLibraryAdapter extends MediaAdapter, MediaUploadAdapter {
  /**
   * Updates only the allowed metadata fields on an existing scoped asset.
   * @param id - Globally unique asset ID.
   * @param patch - Fields to replace; metadata is replaced rather than merged.
   * @returns The updated asset.
   * @throws If the scoped asset is missing or storage operations fail.
   *
   * @example
   * ```typescript
   * import type { MediaLibraryAdapter } from '@alneas/sitekit-cloudflare';
   * export function invoke(adapter: MediaLibraryAdapter, ...args: Parameters<NonNullable<MediaLibraryAdapter['updateMetadata']>>) {
   *   return adapter.updateMetadata(...args);
   * }
   * ```
   */
  updateMetadata(id: string, patch: Partial<Pick<MediaAsset, 'alt' | 'title' | 'caption' | 'rights' | 'tags' | 'metadata'>>): Promise<MediaAsset>;
  /**
   * Deletes the R2 object followed by its D1 metadata row.
   * @param id - Globally unique asset ID.
   * @returns False when absent, otherwise true after both deletions.
   * @throws If the bucket lacks delete support or either storage operation fails.
   *
   * @example
   * ```typescript
   * import type { MediaLibraryAdapter } from '@alneas/sitekit-cloudflare';
   * export function invoke(adapter: MediaLibraryAdapter, ...args: Parameters<NonNullable<MediaLibraryAdapter['delete']>>) {
   *   return adapter.delete(...args);
   * }
   * ```
   */
  delete(id: string): Promise<boolean>;
}

function parseAsset(value: string): MediaAsset {
  const parsed = JSON.parse(value) as Partial<MediaAsset>;
  if (typeof parsed.id !== 'string' || typeof parsed.url !== 'string' || typeof parsed.alt !== 'string'
    || !Array.isArray(parsed.tags) || typeof parsed.metadata !== 'object' || parsed.metadata === null) {
    throw new Error('Invalid R2 media metadata');
  }
  return parsed as MediaAsset;
}

function scopedFilter(tenantField: string | undefined, tenantId: string | undefined, filter: Record<string, unknown> = {}) {
  return tenantField && tenantId ? { ...filter, [tenantField]: tenantId } : filter;
}

function rowsToAssets(rows: MediaRow[]): MediaAsset[] {
  return rows.map(row => parseAsset(row.asset_json));
}

/**
 * Creates a standalone media library using R2 bytes and D1 metadata.
 * @param bucket - Server-owned R2 binding for upload and optional deletion.
 * @param options - Existing metadata database, delivery URL, naming, and optional tenant scope.
 * @returns A read/upload adapter with metadata updates and deletion.
 * @remarks Apply `mediaLibrarySchemaSql` explicitly. Host code owns authentication and private
 * media delivery. Upload inserts metadata after writing R2; on insert failure it attempts object
 * cleanup only when bucket.delete exists. Deletion removes R2 first, so later D1 failure can
 * leave stale metadata. Listing checks tags only within the latest 100 metadata rows, returns
 * at most 100 assets, and does not implement cursor pagination. Scoped reads precede ID-only
 * metadata writes; globally unique IDs and a trusted provider scope are required.
 * @example
 * ```typescript
 * import { createR2MediaLibraryAdapter, type CloudflareD1Database,
 *   type CloudflareR2Bucket } from '@alneas/sitekit-cloudflare';
 * export function exampleLibrary(database: CloudflareD1Database, bucket: CloudflareR2Bucket) {
 *   return createR2MediaLibraryAdapter(bucket, {
 *     database, baseUrl: 'https://media.example.invalid',
 *     tenantField: 'tenant_id', tenantId: 'example-tenant',
 *     idFactory: () => crypto.randomUUID(),
 *   });
 * }
 * ```
 */
export function createR2MediaLibraryAdapter(
  bucket: CloudflareR2Bucket,
  options: R2MediaLibraryOptions,
): MediaLibraryAdapter {
  const table = options.table ?? 'media_assets';
  const database = createD1DataAccessAdapter(options.database, { readOnly: false });
  const tenantField = options.tenantField;
  const tenantId = options.tenantId;
  const uploader = createR2MediaUploadAdapter(bucket, options);

  const getRow = async (id: string): Promise<MediaRow | null> => {
    const rows = await database.find<MediaRow>(table, scopedFilter(tenantField, tenantId, { id }), { limit: 1 });
    return rows[0] ?? null;
  };

  return {
    async upload(request: MediaUploadRequest): Promise<MediaAsset> {
      const asset = await uploader.upload(request);
      const key = typeof asset.source?.id === 'string' ? asset.source.id : asset.id;
      try {
        await database.create(table, {
          id: asset.id,
          key,
          asset_json: JSON.stringify(asset),
          ...(asset.externalId ? { external_id: asset.externalId } : {}),
          ...(tenantField && tenantId ? { [tenantField]: tenantId } : {}),
        });
      } catch (error) {
        if (bucket.delete) await bucket.delete(key).catch(() => undefined);
        throw error;
      }
      return asset;
    },
    async getMedia(query: MediaQuery): Promise<MediaAsset | null> {
      const filter = query.id
        ? { id: query.id }
        : query.externalId ? { external_id: query.externalId } : undefined;
      if (!filter) return null;
      const rows = await database.find<MediaRow>(table, scopedFilter(tenantField, tenantId, filter), { limit: 1 });
      return rows[0] ? parseAsset(rows[0].asset_json) : null;
    },
    async listMedia(query): Promise<MediaAsset[]> {
      const limit = Math.min(Math.max(query.limit ?? 50, 1), 100);
      const rows = await database.find<MediaRow>(table, scopedFilter(tenantField, tenantId), {
        sort: { modified_at: -1 },
        limit: 100,
      });
      const assets = rowsToAssets(rows);
      const filtered = query.tags?.length
        ? assets.filter(asset => query.tags!.every(tag => asset.tags.includes(tag)))
        : assets;
      return filtered.slice(0, limit);
    },
    async updateMetadata(id, patch) {
      const row = await getRow(id);
      if (!row) throw new Error(`R2 media asset not found: ${id}`);
      const asset = parseAsset(row.asset_json);
      const updated: MediaAsset = {
        ...asset,
        ...(patch.alt !== undefined ? { alt: patch.alt } : {}),
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.caption !== undefined ? { caption: patch.caption } : {}),
        ...(patch.rights !== undefined ? { rights: patch.rights } : {}),
        ...(patch.tags !== undefined ? { tags: [...patch.tags] } : {}),
        ...(patch.metadata !== undefined ? { metadata: { ...patch.metadata } } : {}),
      };
      await database.update(table, id, { asset_json: JSON.stringify(updated), modified_at: new Date().toISOString() });
      return updated;
    },
    async delete(id) {
      const row = await getRow(id);
      if (!row) return false;
      if (!bucket.delete) throw new Error('R2 bucket delete binding is required for media deletion');
      await bucket.delete(row.key);
      await database.delete(table, id);
      return true;
    },
  };
}
