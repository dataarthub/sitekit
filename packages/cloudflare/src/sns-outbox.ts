import type { SocialDeliveryResult, SocialPostDraft, SocialPublisher } from '@alneas/sitekit';
import { createD1DataAccessAdapter } from './data-access.js';
import type { CloudflareD1Database } from './types.js';

/**
 * Persisted delivery lifecycle; unknown represents an unresolved nonfinal result.
 */
export type SocialOutboxStatus = 'queued' | 'publishing' | 'published' | 'failed' | 'unknown';

/**
 * Persisted normalized social draft and its latest delivery state.
 */
export interface SocialOutboxEntry {
  /** Generated global outbox row ID. */
  id: string;
  /** Global deduplication key supplied by the draft. */
  idempotencyKey: string;
  /** Original normalized draft serialized into D1. */
  draft: SocialPostDraft;
  /** Current queue/delivery state. */
  status: SocialOutboxStatus;
  /** Number of successful claims. */
  attempt: number;
  /** Latest recorded delivery result when present. */
  result?: SocialDeliveryResult;
  /** Enqueue timestamp. */
  createdAt: string;
  /** Latest claim or delivery timestamp. */
  updatedAt: string;
}

/**
 * Provisioned D1 database and social outbox table names.
 */
export interface D1SocialOutboxOptions {
  /** Server-owned D1 binding with outbox/history schema applied. */
  database: CloudflareD1Database;
  /** Validated outbox table identifier; defaults to `social_outbox`. */
  outboxTable?: string;
  /** Validated history table identifier; defaults to `social_delivery_history`. */
  historyTable?: string;
}

/**
 * Social publisher that enqueues drafts for separately authorized delivery workers.
 */
export interface D1SocialOutbox extends SocialPublisher {
  /**
   * Enqueues a draft or returns its existing idempotency result.
   * @param draft - Normalized draft with a global idempotency key.
   * @returns Existing delivery result or queued acknowledgement.
   *
   * @example
   * ```typescript
   * import type { D1SocialOutbox } from '@alneas/sitekit-cloudflare';
   * export function invoke(adapter: D1SocialOutbox, ...args: Parameters<NonNullable<D1SocialOutbox['enqueue']>>) {
   *   return adapter.enqueue(...args);
   * }
   * ```
   */
  enqueue(draft: SocialPostDraft): Promise<SocialDeliveryResult>;
  /**
   * Conditionally moves oldest queued rows to publishing and increments attempts.
   * @param limit - Maximum claims clamped to 1–100; defaults to 10.
   * @returns Rows successfully claimed by this call.
   *
   * @example
   * ```typescript
   * import type { D1SocialOutbox } from '@alneas/sitekit-cloudflare';
   * export function invoke(adapter: D1SocialOutbox, ...args: Parameters<NonNullable<D1SocialOutbox['claim']>>) {
   *   return adapter.claim(...args);
   * }
   * ```
   */
  claim(limit?: number): Promise<SocialOutboxEntry[]>;
  /**
   * Records delivery for publishing/unknown entries; published entries remain final.
   * @param idempotencyKey - Enqueued draft key.
   * @param result - Host-validated worker delivery result.
   * @returns Updated entry; rejects missing or nondelivery states.
   *
   * @example
   * ```typescript
   * import type { D1SocialOutbox } from '@alneas/sitekit-cloudflare';
   * export function invoke(adapter: D1SocialOutbox, ...args: Parameters<NonNullable<D1SocialOutbox['recordDelivery']>>) {
   *   return adapter.recordDelivery(...args);
   * }
   * ```
   */
  recordDelivery(idempotencyKey: string, result: SocialDeliveryResult): Promise<SocialOutboxEntry>;
  /**
   * Lists recent entries across the configured outbox.
   * @param limit - Maximum rows clamped to 1–500; defaults to 100.
   * @returns Entries by creation time descending.
   *
   * @example
   * ```typescript
   * import type { D1SocialOutbox } from '@alneas/sitekit-cloudflare';
   * export function invoke(adapter: D1SocialOutbox, ...args: Parameters<NonNullable<D1SocialOutbox['list']>>) {
   *   return adapter.list(...args);
   * }
   * ```
   */
  list(limit?: number): Promise<SocialOutboxEntry[]>;
}

interface OutboxRow {
  id: string;
  idempotency_key: string;
  draft_json: string;
  status: SocialOutboxStatus;
  attempt: number;
  result_json?: string;
  created_at: string;
  updated_at: string;
}

function identifier(value: string, label: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) throw new Error(`Invalid D1 ${label}: ${value}`);
  return value;
}

function toEntry(row: OutboxRow): SocialOutboxEntry {
  return {
    id: row.id,
    idempotencyKey: row.idempotency_key,
    draft: JSON.parse(row.draft_json) as SocialPostDraft,
    status: row.status,
    attempt: Number(row.attempt),
    ...(row.result_json ? { result: JSON.parse(row.result_json) as SocialDeliveryResult } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function resultFor(entry: SocialOutboxEntry): SocialDeliveryResult {
  const status: SocialDeliveryResult['status'] = entry.status === 'published'
    ? 'published'
    : entry.status === 'failed' ? 'failed' : 'queued';
  return entry.result ?? {
    status,
    platform: entry.draft.platform,
    idempotencyKey: entry.idempotencyKey,
  };
}

/**
 * Creates a D1 social outbox; publish enqueues rather than contacting a platform.
 * @param options - Provisioned database and optional table names.
 * @returns An enqueue/publish adapter plus worker claim, delivery recording, and list operations.
 * @throws If a table identifier is invalid; methods propagate storage and stored JSON failures.
 * @remarks The host authenticates authors/workers and isolates sites; there is no tenant filter.
 * Idempotency keys are global. Enqueue check/insert is separate and may race under concurrency.
 * Claim uses a status-conditional UPDATE and requires `meta.changes === 1`. There is no lease,
 * reclaim, or automatic retry: a crashed publishing claim requires host reconciliation. Delivery
 * state update and history insertion are separate writes. Apply socialOutboxSchemaSql explicitly.
 * @example
 * ```typescript
 * import { createD1SocialOutbox } from '@alneas/sitekit-cloudflare/sns-outbox';
 * import type { CloudflareD1Database } from '@alneas/sitekit-cloudflare';
 * export function exampleOutbox(database: CloudflareD1Database) {
 *   return createD1SocialOutbox({ database });
 * }
 * ```
 */
export function createD1SocialOutbox(options: D1SocialOutboxOptions): D1SocialOutbox {
  const outboxTable = options.outboxTable ?? 'social_outbox';
  const historyTable = options.historyTable ?? 'social_delivery_history';
  identifier(outboxTable, 'outbox table identifier');
  identifier(historyTable, 'history table identifier');
  const db = createD1DataAccessAdapter(options.database, { readOnly: false });
  const get = async (idempotencyKey: string): Promise<SocialOutboxEntry | null> => {
    const rows = await db.find<OutboxRow>(outboxTable, { idempotency_key: idempotencyKey }, { limit: 1 });
    return rows[0] ? toEntry(rows[0]) : null;
  };

  const enqueue = async (draft: SocialPostDraft): Promise<SocialDeliveryResult> => {
      const existing = await get(draft.idempotencyKey);
      if (existing) return resultFor(existing);
      const now = new Date().toISOString();
      const row = await db.create<OutboxRow>(outboxTable, {
        id: crypto.randomUUID(),
        idempotency_key: draft.idempotencyKey,
        draft_json: JSON.stringify(draft),
        status: 'queued',
        attempt: 0,
        created_at: now,
        updated_at: now,
      });
      return resultFor(toEntry(row));
    };

  return {
    enqueue,
    publish: enqueue,
    async claim(limit = 10) {
      const rows = await db.find<OutboxRow>(outboxTable, { status: 'queued' }, { sort: { created_at: 1 }, limit: Math.min(Math.max(limit, 1), 100) });
      const claimed: SocialOutboxEntry[] = [];
      for (const row of rows) {
        const updatedAt = new Date().toISOString();
        const updateResult = await options.database
          .prepare(`UPDATE ${outboxTable} SET status = ?, attempt = ?, updated_at = ? WHERE id = ? AND status = ?`)
          .bind('publishing', Number(row.attempt) + 1, updatedAt, row.id, 'queued')
          .run() as { meta?: { changes?: number } };
        if (updateResult.meta?.changes !== 1) continue;
        const updated = await db.find<OutboxRow>(outboxTable, { id: row.id }, { limit: 1 });
        if (!updated[0]) continue;
        claimed.push(toEntry(updated[0]));
      }
      return claimed;
    },
    async recordDelivery(idempotencyKey, result) {
      const existing = await get(idempotencyKey);
      if (!existing) throw new Error('Social outbox entry not found');
      if (existing.status === 'published') return existing;
      if (!['publishing', 'unknown'].includes(existing.status)) throw new Error('Social outbox entry is not in delivery state');
      const updatedAt = new Date().toISOString();
      const status: SocialOutboxStatus = result.status === 'published'
        ? 'published' : result.status === 'failed' ? 'failed' : result.status === 'skipped' ? 'failed' : 'unknown';
      const row = await db.update<OutboxRow>(outboxTable, existing.id, {
        status, result_json: JSON.stringify(result), updated_at: updatedAt,
      });
      await db.create(historyTable, {
        id: crypto.randomUUID(), outbox_id: existing.id, idempotency_key: idempotencyKey,
        status: result.status, result_json: JSON.stringify(result), created_at: updatedAt,
      });
      return toEntry(row);
    },
    async list(limit = 100) {
      const rows = await db.find<OutboxRow>(outboxTable, undefined, { sort: { created_at: -1 }, limit: Math.min(Math.max(limit, 1), 500) });
      return rows.map(toEntry);
    },
  };
}
