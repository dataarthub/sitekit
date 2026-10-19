import type {
  CommerceEventRepository,
  CommerceWebhookAdapter,
  CommerceWebhookResult,
  EntitlementCheck,
  EntitlementRecord,
  EntitlementRepository,
  PaymentAdapter,
  PurchaseRecord,
  PurchaseRepository,
  PurchaseStatus,
  CommerceWriter,
} from '@alneas/sitekit/commerce';
import type { CloudflareD1Database } from './types.js';

/**
 * Table names and expiry clock for consumer-side commerce persistence.
 */
export interface D1CommerceRepositoryOptions {
  /** Validated entitlement table identifier; defaults to `content_entitlements`. */
  entitlementTable?: string;
  /** Validated purchase table identifier; defaults to `content_purchases`. */
  purchaseTable?: string;
  /** ISO timestamp source for expiry comparisons and event/purchase timestamps.
   * @returns Current ISO timestamp used by the owning adapter.
   * @example
   * ```typescript
   * import type { D1CommerceRepositoryOptions } from '@alneas/sitekit-cloudflare';
   * export function invoke(adapter: D1CommerceRepositoryOptions, ...args: Parameters<NonNullable<D1CommerceRepositoryOptions['now']>>) {
   *   if (typeof adapter.now !== 'function') throw new Error('Host callback unavailable');
   *   return adapter.now(...args);
   * }
   * ```
   */
  now?: () => string;
}

/**
 * Combined entitlement checks, purchase reads/writes, and webhook event claims backed by D1.
 */
export type D1CommerceRepository = EntitlementRepository
  & PurchaseRepository
  & CommerceWriter
  & CommerceEventRepository;

/**
 * Verified payment webhook integration and its consumer-side persistence boundary.
 */
export interface D1CommerceWebhookAdapterOptions {
  /** Host payment implementation responsible for authenticating and parsing provider webhooks. */
  paymentAdapter: Pick<PaymentAdapter, 'handleWebhook'> & {
    /** Provider namespace for webhook event claims; defaults to `payment-provider` when omitted. */
    provider?: string
  };
  /** Consumer-side repository used after the provider accepts an event. */
  repository: D1CommerceRepository;
}

function identifier(value: string | undefined, fallback: string): string {
  const resolved = value ?? fallback;
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(resolved)) {
    throw new Error(`Invalid D1 table identifier: ${resolved}`);
  }
  return resolved;
}

function purchaseFromRow(row: Record<string, unknown>): PurchaseRecord {
  const requiredString = (key: string): string => {
    const value = row[key];
    if (typeof value !== 'string' || value.length === 0) throw new Error(`Invalid purchase row: ${key}`);
    return value;
  };
  const amount = row.amount;
  const currency = row.currency;
  if (typeof amount !== 'number' || typeof currency !== 'string') throw new Error('Invalid purchase row: amount');
  const metadata = typeof row.metadata_json === 'string'
    ? JSON.parse(row.metadata_json) as Record<string, string>
    : undefined;
  return {
    id: requiredString('id'),
    siteId: requiredString('site_id'),
    contentId: requiredString('content_id'),
    entitlementKey: requiredString('entitlement_key'),
    status: requiredString('status') as PurchaseRecord['status'],
    amount: { amount, currency },
    provider: requiredString('provider'),
    ...(typeof row.provider_reference === 'string' ? { providerReference: row.provider_reference } : {}),
    ...(typeof row.subject_id === 'string' ? { subjectId: row.subject_id } : {}),
    ...(typeof row.purchased_at === 'string' ? { purchasedAt: row.purchased_at } : {}),
    ...(typeof row.expires_at === 'string' ? { expiresAt: row.expires_at } : {}),
    ...(metadata !== undefined ? { metadata } : {}),
  };
}

/**
 * Creates consumer-side entitlement and purchase persistence without applying schema.
 * @param db - Server-owned D1 database with commerce tables provisioned.
 * @param options - Optional table names and timestamp source.
 * @returns A commerce repository whose entitlement checks deny missing subjects.
 * @throws If configured table identifiers are invalid; repository calls propagate D1/row parsing errors.
 * @remarks A subject must be authenticated by the host before checking entitlements. Checks
 * accept only paid/active rows with a future expiry or no expiry. Purchase IDs and webhook
 * provider/event IDs are global within their tables; no host tenant policy is inferred.
 * `claimEvent` requires D1 run metadata with `meta.changes` and uses the fixed
 * `commerce_webhook_events` table.
 * @example
 * ```typescript
 * import { createD1CommerceRepository, type CloudflareD1Database }
 *   from '@alneas/sitekit-cloudflare';
 * export function exampleCommerce(database: CloudflareD1Database) {
 *   return createD1CommerceRepository(database);
 * }
 * ```
 */
export function createD1CommerceRepository(
  db: CloudflareD1Database,
  options: D1CommerceRepositoryOptions = {},
): D1CommerceRepository {
  const entitlementTable = identifier(options.entitlementTable, 'content_entitlements');
  const purchaseTable = identifier(options.purchaseTable, 'content_purchases');
  const now = options.now ?? (() => new Date().toISOString());

  return {
    async hasEntitlement(check: EntitlementCheck): Promise<boolean> {
      // Paid content must have an authenticated subject. A token-only check is
      // deliberately left to an upstream identity adapter.
      if (!check.subjectId) return false;
      const row = await db.prepare(`
        SELECT 1 AS entitled
        FROM ${entitlementTable}
        WHERE site_id = ?
          AND entitlement_key = ?
          AND subject_id = ?
          AND status IN ('paid', 'active')
          AND (expires_at IS NULL OR expires_at > ?)
        LIMIT 1
      `).bind(check.siteId, check.entitlementKey, check.subjectId, now()).first<{ entitled: number }>();
      return row?.entitled === 1;
    },

    async recordPurchase(purchase: PurchaseRecord): Promise<void> {
      await db.prepare(`
        INSERT INTO ${purchaseTable} (
          id, site_id, content_id, entitlement_key, status, amount, currency,
          provider, provider_reference, subject_id, purchased_at, expires_at, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          status = excluded.status,
          amount = excluded.amount,
          currency = excluded.currency,
          provider = excluded.provider,
          provider_reference = excluded.provider_reference,
          subject_id = excluded.subject_id,
          purchased_at = excluded.purchased_at,
          expires_at = excluded.expires_at,
          metadata_json = excluded.metadata_json
      `).bind(
        purchase.id,
        purchase.siteId,
        purchase.contentId,
        purchase.entitlementKey,
        purchase.status,
        purchase.amount.amount,
        purchase.amount.currency,
        purchase.provider,
        purchase.providerReference ?? null,
        purchase.subjectId ?? null,
        purchase.purchasedAt ?? now(),
        purchase.expiresAt ?? null,
        purchase.metadata ? JSON.stringify(purchase.metadata) : null,
      ).run();
    },

    async setEntitlement(entitlement: EntitlementRecord): Promise<void> {
      await db.prepare(`
        INSERT INTO ${entitlementTable} (
          site_id, entitlement_key, subject_id, status, expires_at
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(site_id, entitlement_key, subject_id) DO UPDATE SET
          status = excluded.status,
          expires_at = excluded.expires_at
      `).bind(
        entitlement.siteId,
        entitlement.entitlementKey,
        entitlement.subjectId,
        entitlement.status,
        entitlement.expiresAt ?? null,
      ).run();
    },

    async updatePurchaseStatus(id: string, status: PurchaseStatus): Promise<void> {
      await db.prepare(`UPDATE ${purchaseTable} SET status = ? WHERE id = ?`).bind(status, id).run();
    },

    async claimEvent(event: { provider: string; eventId: string; eventType?: string }): Promise<boolean> {
      const result = await db.prepare(`
        INSERT OR IGNORE INTO commerce_webhook_events (
          provider, event_id, event_type, created_at
        ) VALUES (?, ?, ?, ?)
      `).bind(
        event.provider,
        event.eventId,
        event.eventType ?? null,
        now(),
      ).run() as { meta?: { changes?: number } };
      return result.meta?.changes === 1;
    },

    async getPurchase(id: string): Promise<PurchaseRecord | null> {
      const row = await db.prepare(`SELECT * FROM ${purchaseTable} WHERE id = ? LIMIT 1`).bind(id).first<Record<string, unknown>>();
      return row ? purchaseFromRow(row) : null;
    },

    async listForSubject(siteId: string, subjectId: string): Promise<PurchaseRecord[]> {
      const result = await db.prepare(`
        SELECT * FROM ${purchaseTable}
        WHERE site_id = ? AND subject_id = ?
        ORDER BY purchased_at DESC
      `).bind(siteId, subjectId).all<Record<string, unknown>>();
      return result.results.map(purchaseFromRow);
    },
  };
}

/**
 * Persists accepted provider webhook results with event-level idempotency.
 * @param options - Signature-verifying payment adapter and provisioned commerce repository.
 * @returns A webhook adapter that claims events, writes purchases, and updates entitlements.
 * @throws If handleWebhook is absent; returned handle calls propagate verifier and repository failures.
 * @remarks The payment adapter must authenticate the provider request. Event claims happen
 * before purchase/entitlement writes and are not transactional with them: a later failure can
 * leave an event claimed with incomplete effects. Duplicate claims return duplicate: true.
 * Paid purchases with subjects grant active entitlement; refunded/cancelled/expired results
 * with purchases revoke it. Delivery retry/reconciliation policy belongs to the host.
 * @example
 * ```typescript
 * import { createD1CommerceWebhookAdapter, type D1CommerceWebhookAdapterOptions }
 *   from '@alneas/sitekit-cloudflare';
 * export function exampleWebhook(options: D1CommerceWebhookAdapterOptions) {
 *   // options.paymentAdapter verifies provider signatures before accepting an event.
 *   return createD1CommerceWebhookAdapter(options);
 * }
 * ```
 */
export function createD1CommerceWebhookAdapter(
  options: D1CommerceWebhookAdapterOptions,
): CommerceWebhookAdapter {
  if (!options.paymentAdapter.handleWebhook) {
    throw new Error('The payment adapter must implement handleWebhook');
  }
  const handleWebhook = options.paymentAdapter.handleWebhook;
  const provider = options.paymentAdapter.provider ?? 'payment-provider';

  return {
    async handle(request: Request): Promise<CommerceWebhookResult> {
      const result = await handleWebhook(request);
      if (!result.accepted || !result.eventId) return result;

      const claimed = await options.repository.claimEvent({
        provider,
        eventId: result.eventId,
        ...(result.eventType ? { eventType: result.eventType } : {}),
      });
      if (!claimed) return { ...result, duplicate: true };

      if (result.purchase) {
        if (result.status === 'refunded' || result.status === 'cancelled' || result.status === 'expired') {
          await options.repository.updatePurchaseStatus(result.purchase.id, result.purchase.status);
          if (result.purchase.subjectId) {
            await options.repository.setEntitlement({
              siteId: result.purchase.siteId,
              entitlementKey: result.purchase.entitlementKey,
              subjectId: result.purchase.subjectId,
              status: 'revoked',
            });
          }
        } else {
          await options.repository.recordPurchase(result.purchase);
          if (result.purchase.status === 'paid' && result.purchase.subjectId) {
            await options.repository.setEntitlement({
              siteId: result.purchase.siteId,
              entitlementKey: result.purchase.entitlementKey,
              subjectId: result.purchase.subjectId,
              status: 'active',
              ...(result.purchase.expiresAt ? { expiresAt: result.purchase.expiresAt } : {}),
            });
          }
        }
      }
      return result;
    },
  };
}
