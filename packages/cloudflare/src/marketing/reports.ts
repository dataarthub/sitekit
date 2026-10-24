import type { MarketingCampaignReport, MarketingMetrics, MarketingReport, MarketingReportQuery } from '@alneas/sitekit/marketing';

// Internal persisted row; identifiers and fingerprints never leave reporting responses.
export interface MarketingRecord {
  kind: string;
  record_id: string;
  occurred_at: string;
  attribution_id: string | null;
  event_name: string | null;
  outcome_kind: string | null;
  source: string | null;
  medium: string | null;
  campaign: string | null;
  amount_minor: number | null;
  currency: string | null;
  acquisition?: string | null;
}
function metrics(): MarketingMetrics {
  return { pageViews: 0, bookingStarts: 0, contactSubmits: 0, confirmedConversions: 0, leads: 0, bookings: 0, unattributedConversions: 0, revenueMinor: 0, spendMinor: null, cpaMinor: null, roas: null };
}
type Accumulator = { value: MarketingMetrics; spend: boolean; spendValid: boolean; revenueValid: boolean; attributedRevenue: number };
function accumulator(value = metrics()): Accumulator { return { value, spend: false, spendValid: true, revenueValid: true, attributedRevenue: 0 }; }
function add(target: Accumulator, row: MarketingRecord, currency: string, attributed: boolean) {
  const m = target.value;
  if (row.kind === 'event') {
    if (row.event_name === 'page_view') m.pageViews++;
    if (row.event_name === 'booking_start') m.bookingStarts++;
    if (row.event_name === 'contact_submit') m.contactSubmits++;
  } else if (row.kind === 'outcome') {
    m.confirmedConversions++;
    if (row.outcome_kind === 'lead') m.leads++; else m.bookings++;
    if (!attributed) m.unattributedConversions++;
    if (row.amount_minor === null || row.currency !== currency) target.revenueValid = false;
    else { m.revenueMinor! += row.amount_minor; if (attributed) target.attributedRevenue += row.amount_minor; }
  } else if (row.kind === 'spend') {
    target.spend = true;
    if (row.currency !== currency) target.spendValid = false;
    m.spendMinor = (m.spendMinor ?? 0) + (row.amount_minor ?? 0);
  }
}
function finish(target: Accumulator) {
  const m = target.value;
  if (!target.spend || !target.spendValid || !Number.isSafeInteger(m.spendMinor)) m.spendMinor = null;
  if (!target.revenueValid || !Number.isSafeInteger(m.revenueMinor)) m.revenueMinor = null;
  m.cpaMinor = m.spendMinor !== null && m.confirmedConversions > 0 ? m.spendMinor / m.confirmedConversions : null;
  m.roas = m.spendMinor !== null && m.spendMinor > 0 && m.revenueMinor !== null ? target.attributedRevenue / m.spendMinor : null;
}
export function buildMarketingReport(rows: MarketingRecord[], period: MarketingReportQuery, asOf: string, retainedFrom: string): MarketingReport {
  const totals = accumulator();
  const buckets = new Map<string, Accumulator & { value: MarketingCampaignReport }>();
  for (const row of rows) {
    const dimensions: { source: string | null; medium: string | null; campaign: string | null } = row.kind === 'outcome'
      ? row.acquisition ? JSON.parse(row.acquisition) : { source: null, medium: null, campaign: null }
      : { source: row.source, medium: row.medium, campaign: row.campaign };
    const key = JSON.stringify([dimensions.source, dimensions.medium, dimensions.campaign]);
    let bucket = buckets.get(key);
    if (!bucket) { bucket = { ...accumulator(), value: { ...metrics(), ...dimensions } }; buckets.set(key, bucket); }
    const attributed = !!row.acquisition;
    add(totals, row, period.currency, attributed); add(bucket, row, period.currency, attributed);
  }
  finish(totals);
  for (const bucket of buckets.values()) finish(bucket);
  return { period, asOf, attributionModel: 'last-non-direct-30d-v1', retainedFrom, lookbackComplete: Date.parse(retainedFrom) <= Date.parse(period.from) - 30 * 86400000, spendCoverage: 'recorded-only', totals: totals.value, campaigns: [...buckets.values()].map(value => value.value) };
}
