import type { AnalyticsIngestAdapter } from '../contracts/integrations.js';
import type { MarketingOutcome, MarketingReportQuery, MarketingScope, MarketingSpendImport } from './schemas.js';

/** Durable acknowledgement of an immutable trusted outcome. */
export interface MarketingOutcomeReceipt {
  /** True after durable acceptance, including an identical replay. */
  accepted: boolean;
  /** True when this source/event identity had already been recorded. */
  duplicate: boolean;
}
/** Durable acknowledgement of an atomic spending import. */
export interface MarketingImportReceipt {
  /** Number of newly inserted rows. */
  accepted: number;
  /** Number of identical rows already stored. */
  duplicates: number;
}
/** Metrics in one currency; null means unavailable, not zero. */
export interface MarketingMetrics {
  /** Observed page views, excluding duplicate event IDs. */
  pageViews: number;
  /** Observed outbound booking clicks, not confirmed bookings. */
  bookingStarts: number;
  /** Observed form success signals, not trusted confirmed leads. */
  contactSubmits: number;
  /** Confirmed leads plus confirmed bookings. */
  confirmedConversions: number;
  /** Confirmed leads from trusted sources. */
  leads: number;
  /** Confirmed reservations from trusted sources. */
  bookings: number;
  /** Outcomes lacking an eligible acquisition record. */
  unattributedConversions: number;
  /** Confirmed revenue in minor units, or null for unknown/mixed currency values. */
  revenueMinor: number | null;
  /** Recorded spending in minor units, or null when missing/mixed currency. */
  spendMinor: number | null;
  /** Spending divided by confirmed conversions, in minor units; may be fractional. */
  cpaMinor: number | null;
  /** Attributed confirmed revenue divided by spending; unavailable for incomplete inputs. */
  roas: number | null;
}
/** Campaign-level metrics with explicit unknown acquisition dimensions. */
export interface MarketingCampaignReport extends MarketingMetrics {
  /** Acquisition source, or null when no source is known. */
  source: string | null;
  /** Acquisition medium, or null when no medium is known. */
  medium: string | null;
  /** Campaign label, or null when no campaign is known. */
  campaign: string | null;
}
/** Comparable report returned by standalone and managed providers. */
export interface MarketingReport {
  /** Requested inclusive/exclusive reporting interval and presentation settings. */
  period: MarketingReportQuery;
  /** Query execution time in UTC. */
  asOf: string;
  /** Shared acquisition attribution definition. */
  attributionModel: 'last-non-direct-30d-v1';
  /** Earliest retained/configured collection instant. */
  retainedFrom: string;
  /** Whether collection covers the complete 30-day pre-period lookback. */
  lookbackComplete: boolean;
  /** Always recorded-only: input spending is not asserted to cover all ad accounts. */
  spendCoverage: 'recorded-only';
  /** Site totals; unattributed revenue is excluded from return-on-spend calculations. */
  totals: MarketingMetrics;
  /** Observed acquisition and campaign spending buckets. */
  campaigns: MarketingCampaignReport[];
}
/** Scoped measurement ingestion, reporting and privacy operations. */
export interface MarketingAnalyticsService extends AnalyticsIngestAdapter {
  /**
   * Queries a bounded, currency-aware report.
   * @param query - Inclusive/exclusive instants, timezone and currency.
   * @returns The current report with coverage metadata.
   * @example
   * import type { MarketingAnalyticsService } from '@alneas/sitekit/marketing';
   * export function report(s: MarketingAnalyticsService, q: Parameters<MarketingAnalyticsService['report']>[0]) { return s.report(q); }
   */
  report(query: MarketingReportQuery): Promise<MarketingReport>;
  /**
   * Removes acquisition links to a consent reference without exposing other sites.
   * @param attributionId - Opaque browser reference to forget.
   * @returns Completion after scoped records lose the reference.
   * @example
   * import type { MarketingAnalyticsService } from '@alneas/sitekit/marketing';
   * export function forget(s: MarketingAnalyticsService, id: string) { return s.forget(id); }
   */
  forget(attributionId: string): Promise<void>;
  /**
   * Deletes scoped records outside the configured retention window.
   * @returns Number of deleted records.
   * @example
   * import type { MarketingAnalyticsService } from '@alneas/sitekit/marketing';
   * export function purge(s: MarketingAnalyticsService) { return s.purge(); }
   */
  purge(): Promise<number>;
}
/** Server-authorized confirmed outcome intake. */
export interface MarketingOutcomeService {
  /**
   * Durably records one immutable source event.
   * @param input - Separately authenticated integration outcome.
   * @returns Acceptance and replay identity acknowledgement.
   * @example
   * import type { MarketingOutcomeService, MarketingOutcome } from '@alneas/sitekit/marketing';
   * export function record(s: MarketingOutcomeService, input: MarketingOutcome) { return s.record(input); }
   */
  record(input: MarketingOutcome): Promise<MarketingOutcomeReceipt>;
}
/** Server-authorized manual/CSV spending imports. */
export interface MarketingCampaignService {
  /**
   * Atomically imports spending rows; changed replay values conflict.
   * @param input - Validated immutable spending rows.
   * @returns Counts of new and identical existing rows.
   * @example
   * import type { MarketingCampaignService, MarketingSpendImport } from '@alneas/sitekit/marketing';
   * export function importSpend(s: MarketingCampaignService, input: MarketingSpendImport) { return s.importSpend(input); }
   */
  importSpend(input: MarketingSpendImport): Promise<MarketingImportReceipt>;
}
/** Runtime-discoverable supported operations; social delivery is a separate extension. */
export interface MarketingCapabilities {
  /** Whether the common measurement contract is available. */
  measurement: boolean;
  /** Whether a social publishing extension is connected. */
  socialPublishing: boolean;
}
/** One authoritative provider bundle for a verified site scope. */
export interface MarketingServices {
  /** Immutable host-derived identity used by every operation. */
  scope: MarketingScope;
  /** Explicit feature availability, independent of content backend. */
  capabilities: MarketingCapabilities;
  /** Event intake, reports and retention/privacy operations. */
  analytics: MarketingAnalyticsService;
  /** Trusted lead/booking intake. */
  outcomes: MarketingOutcomeService;
  /** Campaign spending input. */
  campaigns: MarketingCampaignService;
}
/**
 * Server-only factory bound by the host; never accept it from a browser.
 * @param scope - Already authorized site/tenant identity.
 * @returns One scoped provider bundle.
 * @example
 * import type { MarketingServiceFactory, MarketingScope } from '@alneas/sitekit/marketing';
 * export function create(factory: MarketingServiceFactory, scope: MarketingScope) { return factory(scope); }
 */
export type MarketingServiceFactory = (scope: MarketingScope) => MarketingServices;
/** Factories explicitly supplied by the server; unavailable backends never silently fall back. */
export interface MarketingProviderFactories {
  /** Standalone factory; no managed ecosystem dependency is required. */
  standalone?: MarketingServiceFactory;
  /** Optional managed provider factory implementing the same contracts. */
  eaos?: MarketingServiceFactory;
}
