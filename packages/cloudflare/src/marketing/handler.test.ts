import { afterEach, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { createD1MarketingServices, createMarketingHandler, marketingSchemaSql } from './index.js';
import { sqliteBinding } from './testing.test.js';

const databases: DatabaseSync[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });
function setup() {
  const db = new DatabaseSync(':memory:'); databases.push(db); db.exec(marketingSchemaSql);
  const database = sqliteBinding(db);
  return createMarketingHandler({
    publicScope: () => ({ siteId: 'public-site' }),
    services: (_env: unknown, scope) => createD1MarketingServices({ database, scope, startedAt: '2026-09-01T00:00:00Z', now: () => new Date('2026-10-23T00:00:00Z') }),
    authorize: ({ request }) => request.headers.get('Authorization') === 'Bearer test-fixture' ? { scope: { siteId: 'public-site' }, outcomeSource: 'forms' } : null,
  });
}
const req = (path: string, body?: unknown, authorized = false, headers = {}) => new Request('https://site.example' + path, {
  method: body === undefined ? 'GET' : 'POST', headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json', Origin: 'https://site.example' }), ...(authorized ? { Authorization: 'Bearer test-fixture' } : {}), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const outcome = { source: 'forms', eventId: 'lead-1', kind: 'lead', occurredAt: '2026-10-20T00:00:00Z' };
const period = '/api/marketing/report?from=2026-10-01T00:00:00Z&to=2026-10-23T00:00:00Z&timezone=Asia%2FTokyo&currency=JPY';

it('runs a real standalone intake-to-report flow and never admits client-confirmed revenue', async () => {
  const handle = setup();
  const response = await handle(req('/api/analytics', { events: [{ siteId: 'public-site', eventId: 'v1', event: 'page_view', pagePath: '/', consent: 'analytics', occurredAt: '2026-10-20T00:00:00Z' }] }), {});
  expect(response.status).toBe(202);
  expect(await response.json()).toMatchObject({ accepted: 1 });
  expect((await handle(req('/api/marketing/outcomes', outcome), {})).status).toBe(401);
  expect((await handle(req('/api/marketing/outcomes', outcome, true), {})).status).toBe(202);
  const report = await handle(req(period, undefined, true), {});
  expect(report.headers.get('Cache-Control')).toBe('no-store');
  expect(await report.json()).toMatchObject({ totals: { pageViews: 1, leads: 1, bookings: 0 } });
});

it('rejects forged scope/source, cross-origin mutation and unrecognized operations', async () => {
  const handle = setup();
  expect((await handle(req(period), {})).status).toBe(401);
  expect((await handle(req('/api/marketing/outcomes', { ...outcome, source: 'booking' }, true), {})).status).toBe(403);
  expect((await handle(req('/api/marketing/outcomes', { ...outcome, siteId: 'victim' }, true), {})).status).toBe(400);
  expect((await handle(req(period + '&siteId=victim', undefined, true), {})).status).toBe(400);
  expect((await handle(req('/api/marketing/outcomes', outcome, true, { Origin: 'https://attacker.invalid' }), {})).status).toBe(403);
  expect((await handle(req('/api/analytics', { events: [] }, false, { Origin: 'https://attacker.invalid' }), {})).status).toBe(403);
  expect((await handle(req('/api/marketing/unknown', outcome, true), {})).status).toBe(404);
  expect((await handle(req('/api/marketing/report', {}, true), {})).status).toBe(405);
});

it('bounds streamed bodies and keeps immutable conflicts distinct from temporary storage failures', async () => {
  const handle = setup();
  expect((await handle(req('/api/marketing/outcomes', outcome, true, { 'Content-Type': 'text/plain' }), {})).status).toBe(415);
  expect((await handle(req('/api/marketing/outcomes', { ...outcome, padding: 'x'.repeat(131073) }, true), {})).status).toBe(413);
  expect((await handle(req('/api/marketing/outcomes', outcome, true), {})).status).toBe(202);
  expect((await handle(req('/api/marketing/outcomes', { ...outcome, kind: 'booking' }, true), {})).status).toBe(409);
  const broken = createMarketingHandler({ publicScope: () => ({ siteId: 'a' }), authorize: () => ({ scope: { siteId: 'a' } }), services: () => { throw new Error('private storage credentials'); } });
  const result = await broken(req(period, undefined, true), {});
  expect(result.status).toBe(503);
  expect(await result.text()).not.toContain('credentials');
});

it('accepts authenticated CSV spending and returns a permanent range error for unsupported report periods', async () => {
  const handle = setup();
  const csv = 'id,occurredAt,source,medium,campaign,amountMinor,currency\na,2026-10-10T00:00:00Z,meta,paid_social,autumn,10000,JPY';
  const response = await handle(new Request('https://site.example/api/marketing/spend', { method: 'POST', headers: { 'Content-Type': 'text/csv', Authorization: 'Bearer test-fixture', Origin: 'https://site.example' }, body: csv }), {});
  expect(response.status).toBe(202);
  expect(await response.json()).toEqual({ accepted: 1, duplicates: 0 });
  expect((await (await handle(req(period, undefined, true), {})).json()).totals.spendMinor).toBe(10000);
  expect((await handle(req(period.replace('2026-10-01', '2026-01-01'), undefined, true), {})).status).toBe(400);
  expect((await handle(req(period.replace('2026-10-01', '2026-08-15'), undefined, true), {})).status).toBe(422);
});
