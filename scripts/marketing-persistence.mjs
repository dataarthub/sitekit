// Run inside an archive-installed consumer: no workspace imports or private SDKs.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { parseMarketingSpendCsv, resolveMarketingServices } from '@alneas/sitekit/marketing';
import { createD1MarketingServices, marketingSchemaSql, createMarketingHandler, createHmacMarketingAuthorizer } from '@alneas/sitekit-cloudflare/marketing';

const db = new DatabaseSync(':memory:');
db.exec(marketingSchemaSql);
class Statement {
  constructor(sql, values = []) { this.sql = sql; this.values = values; }
  bind(...values) { return new Statement(this.sql, values); }
  async first() { return db.prepare(this.sql).get(...this.values) ?? null; }
  async all() { return { results: db.prepare(this.sql).all(...this.values) }; }
  async run() { return { meta: { changes: Number(db.prepare(this.sql).run(...this.values).changes) } }; }
}
const database = {
  prepare: sql => new Statement(sql),
  async batch(statements) {
    db.exec('BEGIN');
    try { const results = []; for (const statement of statements) results.push(await statement.all()); db.exec('COMMIT'); return results; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  },
};
const scope = { siteId: 'standalone-example' };
const now = new Date('2026-10-23T00:00:00Z');
const services = () => resolveMarketingServices({ backend: 'standalone', scope }, {
  standalone: verifiedScope => createD1MarketingServices({ database, scope: verifiedScope, startedAt: '2026-08-01T00:00:00Z', now: () => now }),
});
const secret = 'measurement-consumer-test-secret-'.repeat(2);
const authorize = createHmacMarketingAuthorizer({ now: () => now, keys: () => [{ id: 'source', secret, scope, operations: ['outcome', 'report'], outcomeSource: 'booking' }] });
const handler = createMarketingHandler({ publicScope: () => scope, services, authorize });
const attributionId = 'b51e17ab-67f6-42ae-a63c-55e97ed7af92';
const hex = bytes => Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, '0')).join('');
async function signed(path, body) {
  const url = 'https://site.example' + path;
  const method = body === undefined ? 'GET' : 'POST';
  const text = body === undefined ? '' : JSON.stringify(body);
  const timestamp = String(now.getTime() / 1000);
  const hash = hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  const message = ['sitekit-marketing-v1', 'source', timestamp, method, url, hash].join('\n');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)));
  return new Request(url, { method, headers: { 'Content-Type': 'application/json', 'X-SiteKit-Key-Id': 'source', 'X-SiteKit-Timestamp': timestamp, 'X-SiteKit-Signature': signature }, ...(body === undefined ? {} : { body: text }) });
}
try {
  const batch = { events: [{ eventId: 'view', siteId: scope.siteId, event: 'page_view', occurredAt: '2026-10-10T00:00:00Z', pagePath: '/', consent: 'analytics', attributionId, campaign: { source: 'meta', medium: 'paid_social', campaign: 'autumn' } }] };
  const response = await handler(new Request('https://site.example/api/analytics', { method: 'POST', headers: { Origin: 'https://site.example', 'Content-Type': 'application/json' }, body: JSON.stringify(batch) }), {});
  assert.equal(response.status, 202);
  const outcome = { source: 'booking', eventId: 'confirmed-1', kind: 'booking', occurredAt: '2026-10-20T00:00:00Z', attributionId, amountMinor: 30000, currency: 'JPY' };
  assert.equal((await handler(await signed('/api/marketing/outcomes', outcome), {})).status, 202);
  assert.deepEqual(await (await handler(await signed('/api/marketing/outcomes', outcome), {})).json(), { accepted: true, duplicate: true });
  await services().campaigns.importSpend(parseMarketingSpendCsv('id,occurredAt,source,medium,campaign,amountMinor,currency\na,2026-10-10T00:00:00Z,meta,paid_social,autumn,10000,JPY'));
  const report = await handler(await signed('/api/marketing/report?from=2026-10-01T00:00:00Z&to=2026-10-23T00:00:00Z&timezone=Asia%2FTokyo&currency=JPY'), {});
  assert.equal(report.status, 200);
  const payload = await report.json();
  assert.equal(payload.totals.confirmedConversions, 1);
  assert.equal(payload.totals.cpaMinor, 10000);
  assert.equal(payload.totals.roas, 3);
  assert.equal(payload.totals.pageViews, 1);
  assert.equal(services().capabilities.socialPublishing, false);
  console.log('Installed standalone marketing: signed outcome replay, real SQLite persistence, CSV spending and campaign report passed.');
} finally { db.close(); }
