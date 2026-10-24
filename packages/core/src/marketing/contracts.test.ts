import { describe, expect, it } from 'vitest';
import { parseMarketingScope, parseMarketingReportQuery, parseMarketingOutcome, parseMarketingSpendCsv, resolveMarketingServices } from './index.js';

describe('neutral marketing contracts', () => {
  it('refuses ambiguous scope, invalid timezones and unbounded report periods', () => {
    expect(() => parseMarketingScope({ siteId: ' ', backend: 'eaos' })).toThrow();
    const query = { from: '2026-10-01T00:00:00Z', to: '2026-10-23T00:00:00Z', timezone: 'Asia/Tokyo', currency: 'JPY' };
    expect(parseMarketingReportQuery(query).from).toBe('2026-10-01T00:00:00.000Z');
    for (const patch of [{ timezone: 'unknown' }, { to: query.from }, { to: '2027-10-01T00:00:00Z' }, { currency: 'jpy' }, { tenantId: 'other' }]) {
      expect(() => parseMarketingReportQuery({ ...query, ...patch })).toThrow();
    }
  });

  it('requires exact minor units, trusted source identity and a currency for valued outcomes', () => {
    const outcome = { source: 'booking', eventId: 'order-1', kind: 'booking', occurredAt: '2026-10-20T00:00:00Z', amountMinor: 10000, currency: 'JPY' };
    expect(parseMarketingOutcome(outcome).amountMinor).toBe(10000);
    for (const patch of [{ source: '' }, { amountMinor: 1.1 }, { currency: undefined }, { siteId: 'forged' }, { attributionId: 'guess' }]) {
      expect(() => parseMarketingOutcome({ ...outcome, ...patch })).toThrow();
    }
  });

  it('selects exactly one host-supplied provider without an EAOS dependency or fallback', () => {
    const calls: string[] = [];
    const factory = (scope: { siteId: string }) => { calls.push(scope.siteId); return { scope, capabilities: { measurement: true, socialPublishing: false } } as never; };
    expect(resolveMarketingServices({ backend: 'standalone', scope: { siteId: 'a' } }, { standalone: factory }).scope).toEqual({ siteId: 'a' });
    expect(calls).toEqual(['a']);
    expect(() => resolveMarketingServices({ backend: 'eaos', scope: { siteId: 'a' } }, { standalone: factory })).toThrow();
    expect(() => resolveMarketingServices({ backend: 'invalid', scope: { siteId: 'a' } }, { standalone: factory })).toThrow();
    expect(() => resolveMarketingServices({ backend: 'standalone', scope: { siteId: 'a', tenantId: 't' } }, { standalone: () => ({ scope: { siteId: 'a', tenantId: 'other' } }) as never })).toThrow();
  });

  it('imports quoted CSV amounts without guessing currency, silently rounding or accepting duplicate headings', () => {
    const header = 'id,occurredAt,source,medium,campaign,amountMinor,currency\r\n';
    expect(parseMarketingSpendCsv(header + 'row-1,2026-10-10T00:00:00Z,meta,paid_social,"autumn, sale",10000,JPY\r\n').rows[0]).toMatchObject({ id: 'row-1', campaign: 'autumn, sale', amountMinor: 10000 });
    for (const body of [header + 'a,2026-10-10T00:00:00Z,meta,,,1.1,JPY', header + 'a,2026-10-10T00:00:00Z,meta,,,100,', 'id,id\na,b', header + '"unclosed', 'x'.repeat(131073)]) {
      expect(() => parseMarketingSpendCsv(body)).toThrow();
    }
  });
});
