import type {
  CollectionQuery,
  ContentAdapter,
  ContentItem,
  ContentPage,
  ContentQuery,
  MediaAdapter,
  MediaAsset,
  MediaQuery,
  SiteSnapshotManifest,
  SiteSnapshotProjection,
  SiteSnapshotReference,
  SiteSnapshot,
} from '@alneas/sitekit';
import { computeSiteSnapshotChecksum } from '@alneas/sitekit';
import { parseCloudflareSnapshotManifest } from './manifest.js';
import type {
  CloudflareD1Database,
  CloudflareFetch,
  CloudflareR2Bucket,
} from './types.js';

interface RevisionRow {
  site_id: string;
  revision: string;
  manifest_json: string;
  content_key: string;
  media_key: string;
  status: string;
}

/**
 * Server-side fetch, R2 key namespace, and projection clock overrides.
 */
export interface CloudflareProjectionOptions {
  /** R2 object key prefix; defaults to `eaos-snapshots`. */
  prefix?: string;
  /** Fetches snapshot JSON; defaults to global fetch and must be supplied outside compatible runtimes. */
  fetch?: CloudflareFetch;
  /** ISO timestamp source for promotion and rollback; defaults to the system clock.
   * @returns Current ISO timestamp used by the owning adapter.
   * @example
   * ```typescript
   * import type { CloudflareProjectionOptions } from '@alneas/sitekit-cloudflare';
   * export function invoke(adapter: CloudflareProjectionOptions, ...args: Parameters<NonNullable<CloudflareProjectionOptions['now']>>) {
   *   if (typeof adapter.now !== 'function') throw new Error('Host callback unavailable');
   *   return adapter.now(...args);
   * }
   * ```
   */
  now?: () => string;
}

function defaultFetch(): CloudflareFetch {
  const fetcher = (globalThis as unknown as { fetch?: CloudflareFetch }).fetch;
  if (!fetcher) throw new Error('A fetch implementation is required outside Workers');
  return fetcher;
}

function keyFor(prefix: string, siteId: string, revision: string, name: string): string {
  return `${prefix}/${siteId}/${revision}/${name}.json`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function contentItem(value: unknown): ContentItem | null {
  const record = asRecord(value);
  if (!record) return null;
  const id = asString(record.id);
  const collection = asString(record.collection);
  const slug = asString(record.slug);
  const locale = asString(record.locale);
  const title = asString(record.title);
  if (!id || !collection || !slug || !locale || !title || !Array.isArray(record.tags)) return null;
  const summary = asString(record.summary);
  const body = asString(record.body);
  const status = asString(record.status) as ContentItem['status'] | undefined;
  const structuredDataType = asString(record.structuredDataType);
  const publishedAt = asString(record.publishedAt);
  const modifiedAt = asString(record.modifiedAt);
  const source = asRecord(record.source) as unknown as ContentItem['source'] | undefined;
  const access = asRecord(record.access) as unknown as ContentItem['access'] | undefined;
  const editorial = asRecord(record.editorial) as unknown as ContentItem['editorial'] | undefined;
  const bodyDocument = asRecord(record.bodyDocument) as unknown as ContentItem['bodyDocument'] | undefined;
  return {
    id,
    collection,
    slug,
    locale,
    title,
    ...(summary ? { summary } : {}),
    ...(body ? { body } : {}),
    tags: record.tags.filter((tag): tag is string => typeof tag === 'string'),
    ...(status ? { status } : {}),
    ...(access ? { access } : {}),
    ...(editorial ? { editorial } : {}),
    ...(bodyDocument ? { bodyDocument } : {}),
    ...(structuredDataType ? { structuredDataType } : {}),
    ...(publishedAt ? { publishedAt } : {}),
    ...(modifiedAt ? { modifiedAt } : {}),
    ...(source ? { source } : {}),
    data: asRecord(record.data) ?? {},
  };
}

function mediaAsset(value: unknown): MediaAsset | null {
  const record = asRecord(value);
  if (!record) return null;
  const id = asString(record.id);
  const url = asString(record.url);
  const alt = asString(record.alt);
  if (!id || !url || !alt || !Array.isArray(record.tags)) return null;
  const title = asString(record.title);
  const caption = asString(record.caption);
  const mimeType = asString(record.mimeType);
  const externalId = asString(record.externalId);
  return {
    id,
    url,
    alt,
    ...(title ? { title } : {}),
    ...(caption ? { caption } : {}),
    ...(typeof record.width === 'number' ? { width: record.width } : {}),
    ...(typeof record.height === 'number' ? { height: record.height } : {}),
    ...(mimeType ? { mimeType } : {}),
    ...(externalId ? { externalId } : {}),
    tags: record.tags.filter((tag): tag is string => typeof tag === 'string'),
    metadata: asRecord(record.metadata) ?? {},
  };
}

function itemsFromPayload<T>(payload: unknown, map: (value: unknown) => T | null): T[] {
  const records = Array.isArray(payload) ? payload : asRecord(payload)?.items;
  if (!Array.isArray(records)) throw new Error('Snapshot payload must be an array or { items: [] }');
  return records.map(map).filter((record): record is T => record !== null);
}

function contentAdapter(items: readonly ContentItem[]): ContentAdapter {
  return {
    async getPage(query: ContentQuery): Promise<ContentPage | null> {
      const item = items.find(candidate =>
        (query.collection === undefined || candidate.collection === query.collection) &&
        (query.id === undefined || candidate.id === query.id) &&
        (query.slug === undefined || candidate.slug === query.slug) &&
        (query.locale === undefined || candidate.locale === query.locale) &&
        (query.includeDrafts || candidate.status !== 'draft'),
      );
      return item ? { ...item, headings: [], relatedContentIds: [] } : null;
    },
    async listCollection(query: CollectionQuery): Promise<ContentItem[]> {
      const filtered = items.filter(item =>
        item.collection === query.collection &&
        (query.locale === undefined || item.locale === query.locale) &&
        item.status !== 'draft' &&
        (query.tags === undefined || query.tags.every(tag => item.tags.includes(tag))),
      );
      const offset = query.cursor ? Number.parseInt(query.cursor, 10) || 0 : 0;
      return filtered.slice(offset, offset + (query.limit ?? filtered.length));
    },
  };
}

function mediaAdapter(items: readonly MediaAsset[]): MediaAdapter {
  return {
    async getMedia(query: MediaQuery): Promise<MediaAsset | null> {
      return items.find(item =>
        (query.id === undefined || item.id === query.id) &&
        (query.externalId === undefined || item.externalId === query.externalId) &&
        (query.tags === undefined || query.tags.every(tag => item.tags.includes(tag))),
      ) ?? null;
    },
    async listMedia(query) {
      const filtered = items.filter(item => query.tags === undefined || query.tags.every(tag => item.tags.includes(tag)));
      return filtered.slice(0, query.limit ?? filtered.length);
    },
  };
}

/**
 * Projects immutable site JSON into R2 and tracks staged revisions and active heads in D1.
 * @remarks Provision `projectionSchemaSql` before use. This server adapter validates payload
 * checksums and optional remote manifest equality; it does not verify embedded signatures or
 * restrict fetch origins. Use the signed HTTP handler or enforce those policies in the host.
 * R2 and D1 operations are separate and may leave partial writes on failure.
 * @example
 * ```typescript
 * import { D1R2SiteSnapshotProjection, type CloudflareD1Database,
 *   type CloudflareR2Bucket } from '@alneas/sitekit-cloudflare';
 * export function exampleProjection(database: CloudflareD1Database, bucket: CloudflareR2Bucket) {
 *   return new D1R2SiteSnapshotProjection(database, bucket);
 * }
 * ```
 */
export class D1R2SiteSnapshotProjection implements SiteSnapshotProjection {
  private readonly fetchImpl: CloudflareFetch;
  private readonly prefix: string;
  private readonly now: () => string;

  /**
   * Creates a projection using server-owned storage bindings.
   * @param database - Provisioned D1 projection database.
   * @param bucket - R2 bucket for immutable JSON payloads.
   * @param options - Fetch, namespace, and clock overrides.
   * @throws If no fetch implementation is available.
   *
   * @example
   * ```typescript
   * import { D1R2SiteSnapshotProjection } from '@alneas/sitekit-cloudflare';
   * export function createProjection(...args: ConstructorParameters<typeof D1R2SiteSnapshotProjection>) {
   *   return new D1R2SiteSnapshotProjection(...args);
   * }
   * ```
   */
  constructor(
    private readonly database: CloudflareD1Database,
    private readonly bucket: CloudflareR2Bucket,
    options: CloudflareProjectionOptions = {},
  ) {
    this.fetchImpl = options.fetch ?? defaultFetch();
    this.prefix = options.prefix ?? 'eaos-snapshots';
    this.now = options.now ?? (() => new Date().toISOString());
  }

  /**
   * Fetches, checksum-validates, and stores a revision without changing the active head.
   * @param reference - Manifest and optional URLs; absent content/media URLs represent `[]` bytes.
   * @returns Resolves after the R2 objects and staged D1 row are written.
   * @throws On malformed JSON/manifest, remote manifest mismatch, checksum mismatch, or I/O failure.
   * @remarks Re-staging upserts the same site/revision and resets its status to staged.
   *
   * @example
   * ```typescript
   * import type { D1R2SiteSnapshotProjection } from '@alneas/sitekit-cloudflare';
   * export function invoke(adapter: D1R2SiteSnapshotProjection, ...args: Parameters<NonNullable<D1R2SiteSnapshotProjection['stage']>>) {
   *   return adapter.stage(...args);
   * }
   * ```
   */
  async stage(reference: SiteSnapshotReference): Promise<void> {
    const manifest = parseCloudflareSnapshotManifest(reference.manifest);
    const contentKey = keyFor(this.prefix, manifest.siteId, manifest.revision, 'content');
    const mediaKey = keyFor(this.prefix, manifest.siteId, manifest.revision, 'media');
    if (reference.manifestUrl) {
      const remoteManifest = parseCloudflareSnapshotManifest(
        JSON.parse(await this.fetchJson(reference.manifestUrl)),
      );
      if (JSON.stringify(remoteManifest) !== JSON.stringify(manifest)) {
        throw new Error(`Snapshot manifest does not match reference: ${manifest.siteId}/${manifest.revision}`);
      }
    }
    const contentBody = await this.fetchJson(reference.contentUrl);
    const mediaBody = await this.fetchJson(reference.mediaUrl);
    const checksum = await computeSiteSnapshotChecksum(contentBody, mediaBody);
    if (checksum !== manifest.checksum) {
      throw new Error(`Snapshot checksum mismatch: ${manifest.siteId}/${manifest.revision}`);
    }
    await this.bucket.put(
      keyFor(this.prefix, manifest.siteId, manifest.revision, 'manifest'),
      JSON.stringify(manifest),
      { httpMetadata: { contentType: 'application/json' } },
    );
    await this.bucket.put(contentKey, contentBody, { httpMetadata: { contentType: 'application/json' } });
    await this.bucket.put(mediaKey, mediaBody, { httpMetadata: { contentType: 'application/json' } });
    await this.database.prepare(`
      INSERT INTO site_snapshot_revisions
        (site_id, revision, manifest_json, content_key, media_key, status)
      VALUES (?, ?, ?, ?, ?, 'staged')
      ON CONFLICT(site_id, revision) DO UPDATE SET
        manifest_json = excluded.manifest_json,
        content_key = excluded.content_key,
        media_key = excluded.media_key,
        status = 'staged'
    `).bind(
      manifest.siteId,
      manifest.revision,
      JSON.stringify(manifest),
      contentKey,
      mediaKey,
    ).run();
  }

  /**
   * Makes an already staged revision the current site head.
   * @param siteId - Site whose active head will change.
   * @param revision - Revision currently marked staged.
   * @returns Resolves after updating the head and revision status.
   * @throws If the revision is not staged, or D1 writes fail.
   *
   * @example
   * ```typescript
   * import type { D1R2SiteSnapshotProjection } from '@alneas/sitekit-cloudflare';
   * export function invoke(adapter: D1R2SiteSnapshotProjection, ...args: Parameters<NonNullable<D1R2SiteSnapshotProjection['promote']>>) {
   *   return adapter.promote(...args);
   * }
   * ```
   */
  async promote(siteId: string, revision: string): Promise<void> {
    const row = await this.database.prepare(
      'SELECT revision FROM site_snapshot_revisions WHERE site_id = ? AND revision = ? AND status = \'staged\'',
    ).bind(siteId, revision).first<Pick<RevisionRow, 'revision'>>();
    if (!row) throw new Error(`Snapshot revision is not staged: ${siteId}/${revision}`);
    await this.database.prepare(`
      INSERT INTO site_projection_heads (site_id, revision, promoted_at)
      VALUES (?, ?, ?)
      ON CONFLICT(site_id) DO UPDATE SET revision = excluded.revision, promoted_at = excluded.promoted_at
    `).bind(siteId, revision, this.now()).run();
    await this.database.prepare(
      'UPDATE site_snapshot_revisions SET status = \'promoted\' WHERE site_id = ? AND revision = ?',
    ).bind(siteId, revision).run();
  }

  /**
   * Points the site head to an existing staged or previously promoted revision.
   * @param siteId - Site whose active head will change.
   * @param revision - Existing revision to activate.
   * @returns Resolves after updating the head and marking the revision promoted.
   * @throws If the revision is unavailable or D1 writes fail.
   *
   * @example
   * ```typescript
   * import type { D1R2SiteSnapshotProjection } from '@alneas/sitekit-cloudflare';
   * export function invoke(adapter: D1R2SiteSnapshotProjection, ...args: Parameters<NonNullable<D1R2SiteSnapshotProjection['rollback']>>) {
   *   return adapter.rollback(...args);
   * }
   * ```
   */
  async rollback(siteId: string, revision: string): Promise<void> {
    const row = await this.database.prepare(
      `SELECT revision FROM site_snapshot_revisions
       WHERE site_id = ? AND revision = ? AND status IN ('staged', 'promoted')`,
    ).bind(siteId, revision).first<Pick<RevisionRow, 'revision'>>();
    if (!row) throw new Error(`Snapshot revision is not available for rollback: ${siteId}/${revision}`);
    await this.database.prepare(`
      INSERT INTO site_projection_heads (site_id, revision, promoted_at)
      VALUES (?, ?, ?)
      ON CONFLICT(site_id) DO UPDATE SET revision = excluded.revision, promoted_at = excluded.promoted_at
    `).bind(siteId, revision, this.now()).run();
    await this.database.prepare(
      'UPDATE site_snapshot_revisions SET status = \'promoted\' WHERE site_id = ? AND revision = ?',
    ).bind(siteId, revision).run();
  }

  /**
   * Reads the manifest joined through the current D1 head.
   * @param siteId - Site to look up.
   * @returns Parsed active manifest, or null when the head/revision join has no row.
   * @throws On D1 failure or invalid stored manifest JSON.
   *
   * @example
   * ```typescript
   * import type { D1R2SiteSnapshotProjection } from '@alneas/sitekit-cloudflare';
   * export function invoke(adapter: D1R2SiteSnapshotProjection, ...args: Parameters<NonNullable<D1R2SiteSnapshotProjection['getCurrentManifest']>>) {
   *   return adapter.getCurrentManifest(...args);
   * }
   * ```
   */
  async getCurrentManifest(siteId: string): Promise<SiteSnapshotManifest | null> {
    const row = await this.database.prepare(`
      SELECT r.manifest_json
      FROM site_projection_heads h
      JOIN site_snapshot_revisions r ON r.site_id = h.site_id AND r.revision = h.revision
      WHERE h.site_id = ?
    `).bind(siteId).first<Pick<RevisionRow, 'manifest_json'>>();
    return row ? parseCloudflareSnapshotManifest(JSON.parse(row.manifest_json)) : null;
  }

  /**
   * Loads a revision into an in-memory content read adapter.
   * @param siteId - Site to resolve.
   * @param revision - Explicit revision, or the current head when omitted.
   * @returns Content adapter for valid records in the stored array or `{ items }` payload.
   * @throws If a revision/object is missing, either stored payload fails its checksum, JSON is malformed, or storage reads fail.
   * @remarks Both stored payloads must match the manifest checksum. Invalid individual records are filtered out.
   *
   * @example
   * ```typescript
   * import type { D1R2SiteSnapshotProjection } from '@alneas/sitekit-cloudflare';
   * export function invoke(adapter: D1R2SiteSnapshotProjection, ...args: Parameters<NonNullable<D1R2SiteSnapshotProjection['getContentAdapter']>>) {
   *   return adapter.getContentAdapter(...args);
   * }
   * ```
   */
  async getContentAdapter(siteId: string, revision?: string): Promise<ContentAdapter> {
    return (await this.getSnapshot(siteId, revision)).content;
  }

  /**
   * Loads a revision into an in-memory media read adapter.
   * @param siteId - Site to resolve.
   * @param revision - Explicit revision, or the current head when omitted.
   * @returns Media adapter for valid records in the stored array or `{ items }` payload.
   * @throws If a revision/object is missing, either stored payload fails its checksum, JSON is malformed, or storage reads fail.
   * @remarks Both stored payloads must match the manifest checksum. Invalid individual records are filtered out.
   *
   * @example
   * ```typescript
   * import type { D1R2SiteSnapshotProjection } from '@alneas/sitekit-cloudflare';
   * export function invoke(adapter: D1R2SiteSnapshotProjection, ...args: Parameters<NonNullable<D1R2SiteSnapshotProjection['getMediaAdapter']>>) {
   *   return adapter.getMediaAdapter(...args);
   * }
   * ```
   */
  async getMediaAdapter(siteId: string, revision?: string): Promise<MediaAdapter> {
    return (await this.getSnapshot(siteId, revision)).media;
  }

  /**
   * Loads a manifest and both payload adapters for one revision.
   * @param siteId - Site to resolve.
   * @param revision - Explicit revision, or the current head when omitted.
   * @returns A snapshot whose content and media payloads are read concurrently.
   * @throws If a revision/object is missing, either payload fails its checksum, JSON is malformed, or storage reads fail.
   *
   * @example
   * ```typescript
   * import type { D1R2SiteSnapshotProjection } from '@alneas/sitekit-cloudflare';
   * export function invoke(adapter: D1R2SiteSnapshotProjection, ...args: Parameters<NonNullable<D1R2SiteSnapshotProjection['getSnapshot']>>) {
   *   return adapter.getSnapshot(...args);
   * }
   * ```
   */
  async getSnapshot(siteId: string, revision?: string): Promise<SiteSnapshot> {
    const row = await this.revisionRow(siteId, revision);
    const manifest = parseCloudflareSnapshotManifest(JSON.parse(row.manifest_json));
    const [contentBody, mediaBody] = await Promise.all([
      this.readBody(row.content_key),
      this.readBody(row.media_key),
    ]);
    if (await computeSiteSnapshotChecksum(contentBody, mediaBody) !== manifest.checksum) {
      throw new Error(`Snapshot checksum mismatch: ${siteId}/${row.revision}`);
    }
    const contentPayload: unknown = JSON.parse(contentBody);
    const mediaPayload: unknown = JSON.parse(mediaBody);
    return {
      manifest,
      content: contentAdapter(itemsFromPayload(contentPayload, contentItem)),
      media: mediaAdapter(itemsFromPayload(mediaPayload, mediaAsset)),
    };
  }

  private async revisionRow(siteId: string, revision?: string): Promise<RevisionRow> {
    const row = revision
      ? await this.database.prepare(
        'SELECT * FROM site_snapshot_revisions WHERE site_id = ? AND revision = ?',
      ).bind(siteId, revision).first<RevisionRow>()
      : await this.database.prepare(`
        SELECT r.*
        FROM site_projection_heads h
        JOIN site_snapshot_revisions r ON r.site_id = h.site_id AND r.revision = h.revision
        WHERE h.site_id = ?
      `).bind(siteId).first<RevisionRow>();
    if (!row) throw new Error(`No snapshot revision found for site: ${siteId}`);
    return row;
  }

  private async fetchJson(url: string | undefined): Promise<string> {
    if (!url) return '[]';
    const response = await this.fetchImpl(url);
    if (!response.ok) throw new Error(`Snapshot fetch failed (${response.status}): ${url}`);
    const body = await response.text();
    JSON.parse(body);
    return body;
  }

  private async readBody(key: string): Promise<string> {
    const object = await this.bucket.get(key);
    if (!object) throw new Error(`Snapshot object missing: ${key}`);
    return object.text();
  }
}

/**
 * Creates the public snapshot projection interface over D1 and R2.
 * @param database - Server-owned D1 binding with projection tables already applied.
 * @param bucket - Server-owned R2 object bucket.
 * @param options - Optional fetch, object prefix, and clock overrides.
 * @returns A D1/R2 snapshot projection with stage, promotion, rollback, and read operations.
 * @throws If no fetch implementation is available.
 * @example
 * ```typescript
 * import { createD1R2SiteSnapshotProjection, type CloudflareD1Database,
 *   type CloudflareR2Bucket } from '@alneas/sitekit-cloudflare';
 * export function exampleProjection(database: CloudflareD1Database, bucket: CloudflareR2Bucket) {
 *   return createD1R2SiteSnapshotProjection(database, bucket, { prefix: 'example-snapshots' });
 * }
 * ```
 */
export function createD1R2SiteSnapshotProjection(
  database: CloudflareD1Database,
  bucket: CloudflareR2Bucket,
  options?: CloudflareProjectionOptions,
): SiteSnapshotProjection {
  return new D1R2SiteSnapshotProjection(database, bucket, options);
}
