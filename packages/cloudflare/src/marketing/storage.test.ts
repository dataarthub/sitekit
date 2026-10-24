import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { createD1MarketingServices, marketingSchemaSql } from './index.js';
import { sqliteBinding } from './testing.test.js';

const now = '2026-10-23T00:00:00.000Z';
const attributionId = 'b51e17ab-67f6-42ae-a63c-55e97ed7af92';
const query = { from: '2026-10-01T00:00:00Z', to: now, timezone: 'Asia/Tokyo', currency: 'JPY' };
const databases: DatabaseSync[] = [];
function setup() {
  const db = new DatabaseSync(':memory:'); databases.push(db); db.exec(marketingSchemaSql);
  const database = sqliteBinding(db);
  const options = { database, scope: { siteId: 'a', tenantId: 'tenant' }, startedAt: '2026-08-01T00:00:00Z', now: () => new Date(now) };
  return { db, options, service: createD1MarketingServices(options) };
}
afterEach(() => { for (const db of databases.splice(0)) db.close(); });
const event = (eventId = 'e1', patch = {}) => ({ eventId, siteId: 'a', event: 'page_view', occurredAt: '2026-10-10T00:00:00Z', pagePath: '/', consent: 'analytics', attributionId, campaign: { source: 'meta', medium: 'paid_social', campaign: 'autumn' }, metadata: { email: 'do-not-store@example.invalid' }, ...patch });
const outcome = (eventId = 'o1', patch = {}) => ({ source: 'booking', eventId, kind: 'booking', occurredAt: '2026-10-20T00:00:00Z', attributionId, amountMinor: 15000, currency: 'JPY', ...patch });
const spend = (id = 'spend1', patch = {}) => ({ id, occurredAt: '2026-10-10T00:00:00Z', source: 'meta', medium: 'paid_social', campaign: 'autumn', amountMinor: 10000, currency: 'JPY', ...patch });

describe('standalone measurement on real SQLite', () => {
  it('persists unique consented events, rejects browser outcomes and isolates tenant/site identity', async () => {
    const { db, service, options } = setup();
    expect(await service.analytics.ingest({ events: [event(), event(), event('denied', { consent: 'denied' }), event('sale', { event: 'conversion' }), event('other', { siteId: 'b' })] })).toEqual({ accepted: 2, rejected: 3, duplicateEventIds: ['e1'] });
    expect((await service.analytics.report(query)).totals.pageViews).toBe(1);
    const other = createD1MarketingServices({ ...options, scope: { siteId: 'a', tenantId: 'other' } });
    expect((await other.analytics.report(query)).totals.pageViews).toBe(0);
    await other.analytics.ingest({ events: [event()] });
    expect(db.prepare('SELECT COUNT(*) AS n FROM sitekit_marketing_records').get()?.n).toBe(2);
    const text = JSON.stringify(db.prepare('SELECT * FROM sitekit_marketing_records').all());
    expect(text).not.toContain('do-not-store');
  });

  it('attributes two trusted bookings and calculates CPA/ROAS without double counting replays', async () => {
    const { service, options } = setup();
    await service.analytics.ingest({ events: [event(), event('direct', { occurredAt: '2026-10-19T00:00:00Z', campaign: undefined })] });
    expect(await service.outcomes.record(outcome())).toEqual({ accepted: true, duplicate: false });
    expect(await service.outcomes.record(outcome())).toEqual({ accepted: true, duplicate: true });
    await service.outcomes.record(outcome('o2'));
    expect(await service.campaigns.importSpend({ rows: [spend()] })).toEqual({ accepted: 1, duplicates: 0 });
    expect(await service.campaigns.importSpend({ rows: [spend()] })).toEqual({ accepted: 0, duplicates: 1 });
    // Recreate the provider to prove persistence rather than in-memory aggregation.
    const report = await createD1MarketingServices(options).analytics.report(query);
    expect(report.totals).toMatchObject({ pageViews: 2, confirmedConversions: 2, bookings: 2, leads: 0, revenueMinor: 30000, spendMinor: 10000, cpaMinor: 5000, roas: 3 });
    expect(report.campaigns.find(row => row.campaign === 'autumn')).toMatchObject({ confirmedConversions: 2, revenueMinor: 30000, roas: 3 });
  });

  it('keeps expired, future, foreign and forgotten references unattributed', async () => {
    const { service, options } = setup();
    await service.analytics.ingest({ events: [event('old', { occurredAt: '2026-09-01T00:00:00Z' }), event('future', { attributionId: 'd215b31a-052e-4783-8bfb-18a48ef4dd7f', occurredAt: '2026-10-21T00:00:00Z' })] });
    await service.outcomes.record(outcome());
    await service.outcomes.record(outcome('future', { attributionId: 'd215b31a-052e-4783-8bfb-18a48ef4dd7f' }));
    const other = createD1MarketingServices({ ...options, scope: { siteId: 'b' } });
    await other.outcomes.record(outcome('foreign'));
    expect((await other.analytics.report(query)).totals.unattributedConversions).toBe(1);
    expect((await service.analytics.report(query)).totals.unattributedConversions).toBe(2);
    await service.analytics.ingest({ events: [event('late', { occurredAt: '2026-10-18T00:00:00Z' })] });
    expect((await service.analytics.report(query)).totals.unattributedConversions).toBe(1);
    await service.analytics.forget(attributionId);
    expect((await service.analytics.report(query)).totals.unattributedConversions).toBe(2);
  });

  it('uses an inclusive 30-day lookback with deterministic last non-direct acquisition', async () => {
    const { service } = setup();
    await service.analytics.ingest({ events: [event('boundary', { occurredAt: '2026-09-20T00:00:00Z' })] });
    await service.outcomes.record(outcome('at-boundary'));
    await service.outcomes.record(outcome('outside', { occurredAt: '2026-10-20T00:00:00.001Z' }));
    expect((await service.analytics.report(query)).totals.unattributedConversions).toBe(1);
  });

  it('reports missing, zero and mixed-currency inputs as unavailable, never as free advertising', async () => {
    const { service } = setup();
    expect((await service.analytics.report(query)).totals).toMatchObject({ spendMinor: null, revenueMinor: 0, cpaMinor: null, roas: null });
    await service.campaigns.importSpend({ rows: [spend('zero', { amountMinor: 0 })] });
    expect((await service.analytics.report(query)).totals).toMatchObject({ spendMinor: 0, cpaMinor: null, roas: null });
    await service.outcomes.record(outcome());
    await service.campaigns.importSpend({ rows: [spend('usd', { currency: 'USD' })] });
    expect((await service.analytics.report(query)).totals).toMatchObject({ spendMinor: null, cpaMinor: null, roas: null });
  });

  it('rolls back conflicting imports atomically and rejects changed outcome identities', async () => {
    const { service } = setup();
    await service.campaigns.importSpend({ rows: [spend()] });
    await expect(service.campaigns.importSpend({ rows: [spend('new'), spend('spend1', { amountMinor: 999 })] })).rejects.toThrow();
    expect((await service.analytics.report(query)).totals.spendMinor).toBe(10000);
    await service.outcomes.record(outcome());
    await expect(service.outcomes.record(outcome('o1', { amountMinor: 999 }))).rejects.toThrow();
    expect((await service.analytics.report(query)).totals.revenueMinor).toBe(15000);
  });

  it('enforces event time limits and report boundaries, and purges old records per scope', async () => {
    const { service, options } = setup();
    expect(await service.analytics.ingest({ events: [event('too-old', { occurredAt: '2026-01-01T00:00:00Z' }), event('too-new', { occurredAt: '2026-12-01T00:00:00Z' })] })).toMatchObject({ accepted: 0, rejected: 2 });
    await service.analytics.ingest({ events: [event('start', { occurredAt: '2026-10-01T00:00:00Z' }), event('end', { occurredAt: now })] });
    expect((await service.analytics.report(query)).totals.pageViews).toBe(1);
    const later = createD1MarketingServices({ ...options, now: () => new Date('2027-02-01T00:00:00Z') });
    expect(await later.analytics.purge()).toBe(2);
    await expect(later.analytics.report(query)).rejects.toThrow();
  });

  it('preserves dedupe after privacy withdrawal and does not restore a forgotten acquisition on replay', async () => {
    const { service } = setup();
    await service.analytics.ingest({ events: [event()] });
    await service.analytics.forget(attributionId);
    await service.analytics.ingest({ events: [event()] });
    await service.outcomes.record(outcome());
    const report = await service.analytics.report(query);
    expect(report.totals.unattributedConversions).toBe(1);
    expect(report.totals.pageViews).toBe(1);
  });

  it('never restores a forgotten reference through delayed previously unseen events or outcomes', async () => {
    const { service, db } = setup();
    await service.analytics.forget(attributionId);
    await service.analytics.ingest({ events: [event('delayed-first-delivery')] });
    await service.outcomes.record(outcome('delayed-outcome'));
    expect((await service.analytics.report(query)).totals.unattributedConversions).toBe(1);
    expect(JSON.stringify(db.prepare('SELECT * FROM sitekit_marketing_records').all())).not.toContain(attributionId);
  });

  it('bounds report reads and refuses ambiguous collection start dates', async () => {
    const { db, service, options } = setup();
    expect(() => createD1MarketingServices({ ...options, startedAt: '2026-02-30T00:00:00Z' })).toThrow();
    db.exec(`WITH RECURSIVE n(v) AS (SELECT 1 UNION ALL SELECT v+1 FROM n WHERE v<10001)
      INSERT INTO sitekit_marketing_records (tenant_id,site_id,kind,record_id,fingerprint,write_id,occurred_at,event_name)
      SELECT 'tenant','a','event',CAST(v AS TEXT),'hash','write','2026-10-10T00:00:00.000Z','page_view' FROM n`);
    await expect(service.analytics.report(query)).rejects.toThrow(/10000/);
  });
});
