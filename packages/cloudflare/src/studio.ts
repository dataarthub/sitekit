import type {
  ContentStudioDocument,
  ContentStudioListQuery,
  ContentStudioListResult,
  ContentStudioProvider,
  ContentStudioPublishOptions,
  ContentStudioSaveOptions,
} from '@alneas/appkit-core/data/content';
import { createD1DataAccessAdapter, type CloudflareDataAccessAdapter } from './data-access.js';
import type { CloudflareD1Database } from './types.js';

const parseJson = (value: unknown, fallback: unknown) => {
  if (typeof value !== 'string') return value ?? fallback;
  try { return JSON.parse(value); } catch { return fallback; }
};

interface StudioRow {
  id: string;
  collection: string;
  locale: string;
  slug: string;
  title: string;
  summary?: string;
  body: string;
  tags?: string;
  status?: ContentStudioDocument['status'];
  data?: string;
  created_at?: string;
  modified_at?: string;
  [key: string]: unknown;
}

/**
 * Configures a standalone D1 authoring store; it does not establish user identity.
 * @remarks Tenant scoping requires both `tenantField` and a nonempty `tenantId`.
 * Use a provider per authenticated tenant and keep the D1 binding on the server.
 */
export interface D1ContentStudioProviderOptions {
  /** Server-owned D1 binding with the authoring schema already applied. */
  database: CloudflareD1Database;
  /** Content table identifier; defaults to `content_items`. */
  table?: string;
  /** Optional tenant column identifier; no tenant predicate is added when omitted. */
  tenantField?: string;
  /** Trusted tenant value resolved by the host, paired with `tenantField`. */
  tenantId?: string;
}

interface StudioCursor {
  modifiedAt: string;
  id: string;
}

function identifier(value: string, label: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) throw new Error(`Invalid D1 ${label}: ${value}`);
  return value;
}

function encodeCursor(cursor: StudioCursor): string {
  const bytes = new TextEncoder().encode(JSON.stringify(cursor));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeCursor(value: string): StudioCursor {
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
    const bytes = Uint8Array.from(atob(normalized), character => character.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Partial<StudioCursor>;
    if (typeof parsed.modifiedAt !== 'string' || typeof parsed.id !== 'string' || !parsed.id) throw new Error();
    return { modifiedAt: parsed.modifiedAt, id: parsed.id };
  } catch {
    throw new Error('Invalid D1 Content Studio cursor');
  }
}

function toDocument(row: StudioRow): ContentStudioDocument {
  return {
    id: String(row.id),
    collection: String(row.collection),
    locale: String(row.locale || 'ja'),
    slug: String(row.slug),
    title: String(row.title || ''),
    summary: typeof row.summary === 'string' ? row.summary : '',
    body: String(row.body || ''),
    tags: parseJson(row.tags, []) as string[],
    status: row.status ?? 'draft',
    data: parseJson(row.data, {}) as Record<string, unknown>,
    ...(row.created_at ? { createdAt: row.created_at } : {}),
    ...(row.modified_at ? { modifiedAt: row.modified_at } : {}),
  };
}

function rowFor(document: ContentStudioDocument, now: string, tenantField?: string, tenantId?: string): Record<string, unknown> {
  return {
    id: document.id || crypto.randomUUID(),
    collection: document.collection,
    locale: document.locale,
    slug: document.slug,
    title: document.title,
    summary: document.summary ?? '',
    body: document.body,
    tags: JSON.stringify(document.tags),
    status: document.status,
    data: JSON.stringify(document.data),
    modified_at: now,
    ...(tenantField && tenantId ? { [tenantField]: tenantId } : {}),
  };
}

/**
 * Creates an independent Content Studio provider backed by an existing D1 table.
 * @param options - Server database binding, table selection, and optional trusted tenant scope.
 * @returns A provider supporting cursor lists, reads, draft saves, and publication status updates.
 * @throws If a table or tenant column identifier is invalid; provider calls propagate D1 failures.
 * @remarks Authentication and authorization belong to the host. Lists sort by descending
 * `modified_at` and `id`, clamp page sizes to 1–100, and use an opaque cursor.
 * Draft saves check `expectedModifiedAt` before writing, but the check and write are separate
 * operations, not an atomic compare-and-swap. Publishing with `scheduledAt` only stores a
 * scheduled status; an external scheduler must perform publication. No snapshot, cache purge,
 * or upstream content synchronization runs automatically. Tenant-scoped reads precede ID-based writes;
 * use globally unique document IDs and a schema matching this contract.
 * @example
 * ```typescript
 * import { createD1ContentStudioProvider, type CloudflareD1Database }
 *   from '@alneas/sitekit-cloudflare';
 * import type { ContentStudioProvider } from '@alneas/appkit-core/data/content';
 *
 * export function exampleProvider(database: CloudflareD1Database): ContentStudioProvider {
 *   return createD1ContentStudioProvider({
 *     database, tenantField: 'tenant_id', tenantId: 'example-tenant',
 *   });
 * }
 * ```
 */
export function createD1ContentStudioProvider(options: D1ContentStudioProviderOptions): ContentStudioProvider {
  const table = options.table ?? 'content_items';
  identifier(table, 'table identifier');
  const tenantField = options.tenantField ? identifier(options.tenantField, 'tenant column identifier') : undefined;
  const idField = 'id';
  const db = createD1DataAccessAdapter(options.database, { readOnly: false });
  const scopedFilter = (filter: Record<string, unknown> = {}) => (
    tenantField && options.tenantId ? { ...filter, [tenantField]: options.tenantId } : filter
  );

  const getRow = async (id: string): Promise<StudioRow | null> => {
    const rows = await db.find<StudioRow>(table, scopedFilter({ [idField]: id }), { limit: 1 });
    return rows[0] ?? null;
  };

  return {
    async list(query: ContentStudioListQuery) {
      const limit = Math.min(Math.max(query.limit ?? 50, 1), 100);
      const clauses = ['collection = ?'];
      const values: unknown[] = [query.collection];
      if (query.locale) {
        clauses.push('locale = ?');
        values.push(query.locale);
      }
      if (query.status && query.status !== 'all') {
        clauses.push('status = ?');
        values.push(query.status);
      }
      if (tenantField && options.tenantId) {
        clauses.push(`${tenantField} = ?`);
        values.push(options.tenantId);
      }
      if (query.search?.trim()) {
        const needle = `%${query.search.trim().toLocaleLowerCase()}%`;
        clauses.push('(LOWER(title) LIKE ? OR LOWER(slug) LIKE ? OR LOWER(summary) LIKE ?)');
        values.push(needle, needle, needle);
      }
      if (query.cursor) {
        const cursor = decodeCursor(query.cursor);
        clauses.push('(modified_at < ? OR (modified_at = ? AND id < ?))');
        values.push(cursor.modifiedAt, cursor.modifiedAt, cursor.id);
      }
      const result = await options.database
        .prepare(`SELECT * FROM ${table} WHERE ${clauses.join(' AND ')} ORDER BY modified_at DESC, id DESC LIMIT ?`)
        .bind(...values, limit + 1)
        .all<StudioRow>();
      const rows = Array.isArray(result.results) ? result.results : [];
      const pageRows = rows.slice(0, limit);
      const output: ContentStudioListResult = { items: pageRows.map(toDocument) };
      if (rows.length > limit) {
        const last = pageRows[pageRows.length - 1];
        if (!last?.modified_at) throw new Error('D1 Content Studio row has no modified_at value');
        output.nextCursor = encodeCursor({ modifiedAt: last.modified_at, id: last.id });
      }
      return output;
    },
    async get(documentId: string) {
      const row = await getRow(documentId);
      return row ? toDocument(row) : null;
    },
    async saveDraft(document: ContentStudioDocument, saveOptions?: ContentStudioSaveOptions) {
      const now = new Date().toISOString();
      const existing = document.id ? await getRow(document.id) : null;
      if (saveOptions?.expectedModifiedAt && existing?.modified_at !== saveOptions.expectedModifiedAt) {
        throw new Error('Content Studio document changed since it was loaded');
      }
      const id = document.id || crypto.randomUUID();
      const row = rowFor({ ...document, id, status: 'draft' }, now, tenantField, options.tenantId);
      if (existing) await db.update(table, id, row);
      else await db.create(table, { ...row, created_at: now });
      const saved = await getRow(id);
      return saved ? toDocument(saved) : toDocument(row as StudioRow);
    },
    async publish(documentId: string, publishOptions?: ContentStudioPublishOptions) {
      const existing = await getRow(documentId);
      if (!existing) throw new Error('Content Studio document not found');
      const status = publishOptions?.scheduledAt ? 'scheduled' : 'published';
      const modifiedAt = new Date().toISOString();
      await db.update(table, documentId, { status, modified_at: modifiedAt, ...(publishOptions?.scheduledAt ? { scheduled_at: publishOptions.scheduledAt } : {}) });
      return toDocument({ ...existing, status, modified_at: modifiedAt });
    },
  };
}
