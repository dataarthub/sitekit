import { parseAnalyticsBatch } from '@alneas/sitekit/analytics';
import { parseMarketingOutcome, parseMarketingReportQuery, parseMarketingScope, parseMarketingSpendImport } from '@alneas/sitekit/marketing';
import type { MarketingServices } from '@alneas/sitekit/marketing';
import type { D1MarketingOptions, MarketingStatement } from './types.js';
import { buildMarketingReport } from './reports.js';
import type { MarketingRecord } from './reports.js';

const day = 86400000;
const insertSql = `INSERT INTO sitekit_marketing_records
 (tenant_id, site_id, kind, record_id, fingerprint, write_id, occurred_at, attribution_id,
  event_name, outcome_kind, source, medium, campaign, amount_minor, currency)
 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7,
  CASE WHEN EXISTS (SELECT 1 FROM sitekit_marketing_revocations
    WHERE tenant_id = ?1 AND site_id = ?2 AND reference_hash = ?8) THEN NULL ELSE ?8 END,
  ?9, ?10, ?11, ?12, ?13, ?14, ?15)
 ON CONFLICT (tenant_id, site_id, kind, record_id) DO UPDATE SET
 fingerprint = CASE WHEN fingerprint = excluded.fingerprint THEN fingerprint ELSE NULL END
 RETURNING write_id`;

/**
 * Creates standalone, site-scoped measurement with durable dedupe and bounded SQL reporting.
 * @param options - Server-owned D1 binding, verified scope, collection coverage and retention.
 * @returns The common measurement services; social delivery is explicitly unavailable.
 * @remarks Ingest is for public consented browser events. Outcome/spending methods require a
 * separate trusted server boundary. Imports are atomic, changed replays conflict, and reports
 * reject more than 10,000 period records rather than silently truncating. No credentials or
 * private SDKs are needed. Apply marketingSchemaSql explicitly before use.
 * @example
 * import { createD1MarketingServices, type MarketingDatabase } from '@alneas/sitekit-cloudflare/marketing';
 * export function services(database: MarketingDatabase) { return createD1MarketingServices({ database, scope: { siteId: 'example' }, startedAt: '2026-10-01T00:00:00Z' }); }
 */
export function createD1MarketingServices(options: D1MarketingOptions): MarketingServices {
  const scope = Object.freeze(parseMarketingScope(options.scope));
  const tenant = scope.tenantId ?? '';
  const db = options.database;
  const retention = options.retentionDays ?? 90;
  if (!Number.isInteger(retention) || retention < 30 || retention > 365) throw new Error('Retention must be 30–365 days');
  const started = Date.parse(options.startedAt);
  if (!Number.isFinite(started)) throw new Error('Explicit collection start instant required');
  parseMarketingReportQuery({ from: options.startedAt, to: new Date(started + 1).toISOString(), timezone: 'UTC', currency: 'JPY' });
  const clock = () => {
    const time = (options.now?.() ?? new Date()).getTime();
    if (!Number.isFinite(time)) throw new Error('Invalid marketing clock');
    return time;
  };
  const bounds = (time: number) => ({ cutoff: time - retention * day, retained: Math.max(started, time - retention * day) });
  const timeAllowed = (date: string, time: number) => Date.parse(date) >= bounds(time).retained && Date.parse(date) <= time + 300000;
  const hash = async (value: string) => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  };
  const prepareWrite = async (kind: string, id: string, row: Omit<MarketingRecord, 'kind' | 'record_id' | 'acquisition'>, writeId: string): Promise<MarketingStatement> => {
    const referenceHash = row.attribution_id ? await hash(row.attribution_id) : null;
    const values = [tenant, scope.siteId, kind, id, row.occurred_at, referenceHash, row.event_name, row.outcome_kind, row.source, row.medium, row.campaign, row.amount_minor, row.currency];
    const fingerprint = await hash(JSON.stringify(values));
    return db.prepare(insertSql).bind(tenant, scope.siteId, kind, id, fingerprint, writeId, ...values.slice(4));
  };
  const empty = (date: string): Omit<MarketingRecord, 'kind' | 'record_id' | 'acquisition'> => ({ occurred_at: new Date(date).toISOString(), attribution_id: null, event_name: null, outcome_kind: null, source: null, medium: null, campaign: null, amount_minor: null, currency: null });
  return {
    scope,
    capabilities: Object.freeze({ measurement: true, socialPublishing: false }),
    analytics: {
      async ingest(input) {
        const batch = parseAnalyticsBatch(input);
        const time = clock(), writeId = crypto.randomUUID();
        const valid = batch.events.filter(event => event.siteId === scope.siteId && event.consent === 'analytics' && !['conversion', 'booking_complete'].includes(event.event) && timeAllowed(event.occurredAt, time));
        const statements = await Promise.all(valid.map(event => prepareWrite('event', event.eventId, {
          ...empty(event.occurredAt), attribution_id: event.attributionId ?? null, event_name: event.event,
          source: event.campaign?.source?.trim() || null, medium: event.campaign?.medium?.trim() || null, campaign: event.campaign?.campaign?.trim() || null,
        }, writeId)));
        const duplicateEventIds: string[] = [];
        if (statements.length) {
          const results = await db.batch(statements);
          const seen = new Set<string>();
          results.forEach((result, index) => {
            const id = valid[index]!.eventId;
            if (result.results[0]?.write_id !== writeId || seen.has(id)) duplicateEventIds.push(id);
            seen.add(id);
          });
        }
        return { accepted: valid.length, rejected: batch.events.length - valid.length, duplicateEventIds: [...new Set(duplicateEventIds)] };
      },
      async report(input) {
        const query = parseMarketingReportQuery(input), time = clock();
        const retained = bounds(time).retained;
        if (Date.parse(query.from) < retained) throw new RangeError('Report starts before retained collection coverage');
        // One statement gives the report and acquisition lookups a consistent read snapshot.
        const rows = await db.prepare(`SELECT r.*,
          CASE WHEN r.kind = 'outcome' AND r.attribution_id IS NOT NULL THEN (
            SELECT json_object('source', a.source, 'medium', a.medium, 'campaign', a.campaign)
            FROM sitekit_marketing_records a
            WHERE a.tenant_id = r.tenant_id AND a.site_id = r.site_id AND a.kind = 'event'
              AND a.attribution_id = r.attribution_id AND a.occurred_at <= r.occurred_at
              AND a.occurred_at >= strftime('%Y-%m-%dT%H:%M:%fZ', julianday(r.occurred_at) - 30)
              AND a.occurred_at >= ? AND (a.source IS NOT NULL OR a.medium IS NOT NULL OR a.campaign IS NOT NULL)
              AND COALESCE(a.source, '') NOT IN ('direct', '(direct)') AND COALESCE(a.medium, '') NOT IN ('direct', '(none)')
            ORDER BY a.occurred_at DESC, a.record_id DESC LIMIT 1
          ) ELSE NULL END AS acquisition
          FROM sitekit_marketing_records r
          WHERE r.tenant_id = ? AND r.site_id = ? AND r.occurred_at >= ? AND r.occurred_at < ?
          ORDER BY r.occurred_at, r.kind, r.record_id LIMIT 10001`).bind(new Date(retained).toISOString(), tenant, scope.siteId, query.from, query.to).all<MarketingRecord>();
        if (rows.results.length > 10000) throw new RangeError('Report exceeds 10000 records; shorten the period');
        return buildMarketingReport(rows.results, query, new Date(time).toISOString(), new Date(retained).toISOString());
      },
      async forget(attributionId) {
        // Reuse outcome validation for a UUID without accepting arbitrary SQL or scopes.
        parseMarketingOutcome({ source: 'privacy', eventId: 'privacy', kind: 'lead', occurredAt: new Date(clock()).toISOString(), attributionId });
        const referenceHash = await hash(attributionId);
        await db.batch([
          db.prepare('INSERT INTO sitekit_marketing_revocations (tenant_id, site_id, reference_hash, forgotten_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING').bind(tenant, scope.siteId, referenceHash, new Date(clock()).toISOString()),
          db.prepare('UPDATE sitekit_marketing_records SET attribution_id = NULL WHERE tenant_id = ? AND site_id = ? AND attribution_id = ?').bind(tenant, scope.siteId, referenceHash),
        ]);
      },
      async purge() {
        const result = await db.prepare('DELETE FROM sitekit_marketing_records WHERE tenant_id = ? AND site_id = ? AND occurred_at < ?').bind(tenant, scope.siteId, new Date(bounds(clock()).cutoff).toISOString()).run() as { meta?: { changes?: unknown } };
        if (!Number.isSafeInteger(result?.meta?.changes)) throw new Error('Missing retention deletion receipt');
        return result.meta!.changes as number;
      },
    },
    outcomes: {
      async record(input) {
        const value = parseMarketingOutcome(input);
        if (!timeAllowed(value.occurredAt, clock())) throw new RangeError('Outcome outside collection/retention window');
        const writeId = crypto.randomUUID();
        const statement = await prepareWrite('outcome', JSON.stringify([value.source, value.eventId]), { ...empty(value.occurredAt), attribution_id: value.attributionId ?? null, outcome_kind: value.kind, amount_minor: value.amountMinor ?? null, currency: value.currency ?? null }, writeId);
        const result = await statement.first<{ write_id: string }>();
        return { accepted: true, duplicate: result?.write_id !== writeId };
      },
    },
    campaigns: {
      async importSpend(input) {
        const value = parseMarketingSpendImport(input), time = clock(), writeId = crypto.randomUUID();
        if (value.rows.some(row => !timeAllowed(row.occurredAt, time))) throw new RangeError('Spending outside collection/retention window');
        const statements = await Promise.all(value.rows.map(row => prepareWrite('spend', row.id, { ...empty(row.occurredAt), source: row.source ?? null, medium: row.medium ?? null, campaign: row.campaign ?? null, amount_minor: row.amountMinor, currency: row.currency }, writeId)));
        const results = await db.batch(statements);
        const newIds = new Set<string>();
        results.forEach((result, index) => { if (result.results[0]?.write_id === writeId) newIds.add(value.rows[index]!.id); });
        return { accepted: newIds.size, duplicates: value.rows.length - newIds.size };
      },
    },
  };
}
