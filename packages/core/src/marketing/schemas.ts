import { z } from 'zod';

const id = z.string().trim().min(1).max(128);
const instant = z.string().datetime({ offset: true }).transform(value => new Date(value).toISOString());
const money = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const currency = z.string().regex(/^[A-Z]{3}$/);
const dimensions = {
  /** Acquisition source, or absent for unknown attribution. */
  source: z.string().trim().min(1).max(512).optional(),
  /** Acquisition medium, or absent for unknown attribution. */
  medium: z.string().trim().min(1).max(512).optional(),
  /** Campaign label as captured from UTM parameters. */
  campaign: z.string().trim().min(1).max(512).optional(),
};
/** Strict host-resolved site and tenant identity schema. */
const scopeSchema = z.strictObject({
  /** Host-authorized site identity. */
  siteId: id,
  /** Host-authorized tenant identity when the installation is multi-tenant. */
  tenantId: id.optional(),
});
/** Bounded report interval, timezone and currency schema. */
const querySchema = z.strictObject({
  /** Inclusive instant, normalized to UTC. */
  from: instant,
  /** Exclusive instant, normalized to UTC. */
  to: instant,
  /** IANA timezone for presentation; boundaries remain explicit instants. */
  timezone: z.string().max(128).refine(value => { try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; } }),
  /** Reporting currency; mixed currencies produce unavailable money metrics. */
  currency,
}).refine(value => Date.parse(value.to) > Date.parse(value.from) && Date.parse(value.to) - Date.parse(value.from) <= 93 * 86400000, 'Report periods must be positive and at most 93 days');
/** Confirmed source outcome and optional attribution/revenue schema. */
const outcomeSchema = z.strictObject({
  /** Trusted integration identity, established by server authorization. */
  source: id,
  /** Immutable event identity within the trusted source and site. */
  eventId: id,
  /** Confirmed lead or confirmed reservation, never inferred from a click. */
  kind: z.enum(['lead', 'booking']),
  /** Confirmed outcome time, normalized to UTC. */
  occurredAt: instant,
  /** Opaque consent-aware browser reference, when the integration can return it. */
  attributionId: z.uuid().optional(),
  /** Nonnegative amount in currency minor units, not a floating major-unit amount. */
  amountMinor: money.optional(),
  /** Currency required exactly when an outcome amount is supplied. */
  currency: currency.optional(),
}).refine(value => (value.amountMinor === undefined) === (value.currency === undefined), 'Amount and currency must be supplied together');
/** Immutable, individually identified spending allocation schema. */
const spendRowSchema = z.strictObject({
  /** Immutable row identity across all imports within a site. */
  id,
  /** Allocation instant; an import must allocate spending into the desired reporting interval. */
  occurredAt: instant,
  ...dimensions,
  /** Spending in currency minor units. Explicit zero differs from absent spending. */
  amountMinor: money,
  /** Currency of the spending row. */
  currency,
});
/** Atomic, bounded spending import schema. */
const spendSchema = z.strictObject({
  /** At most 100 immutable rows; repeated IDs cannot change their original value. */
  rows: z.array(spendRowSchema).min(1).max(100),
});

/** Validated, server-owned marketing scope. */
export type MarketingScope = z.infer<typeof scopeSchema>;
/** Bounded report period with explicit timezone and currency. */
export type MarketingReportQuery = z.infer<typeof querySchema>;
/** A trusted integration's confirmed outcome. */
export type MarketingOutcome = z.infer<typeof outcomeSchema>;
/** Immutable manual or CSV-normalized campaign spending row. */
export type MarketingSpendRow = z.infer<typeof spendRowSchema>;
/** Bounded import of immutable spending rows. */
export type MarketingSpendImport = z.infer<typeof spendSchema>;

/**
 * Validates a host-derived scope without accepting backend selectors or extra fields.
 * @param input - Untrusted scope-shaped input; authorization remains the host's responsibility.
 * @returns The validated site and optional tenant identity.
 * @example
 * import { parseMarketingScope } from '@alneas/sitekit/marketing';
 * parseMarketingScope({ siteId: 'example' });
 */
export function parseMarketingScope(input: unknown): MarketingScope { return scopeSchema.parse(input); }
/**
 * Validates report bounds, IANA timezone and uppercase currency.
 * @param input - Report query with inclusive start and exclusive end instants.
 * @returns A normalized report query covering at most 93 days.
 * @example
 * import { parseMarketingReportQuery } from '@alneas/sitekit/marketing';
 * parseMarketingReportQuery({ from: '2026-10-01T00:00:00Z', to: '2026-10-02T00:00:00Z', timezone: 'Asia/Tokyo', currency: 'JPY' });
 */
export function parseMarketingReportQuery(input: unknown): MarketingReportQuery { return querySchema.parse(input); }
/**
 * Validates a confirmed outcome without granting trust to its caller.
 * @param input - Payload from a separately authenticated source.
 * @returns The normalized outcome; valued outcomes require a currency.
 * @example
 * import { parseMarketingOutcome } from '@alneas/sitekit/marketing';
 * parseMarketingOutcome({ source: 'forms', eventId: 'lead-1', kind: 'lead', occurredAt: '2026-10-01T00:00:00Z' });
 */
export function parseMarketingOutcome(input: unknown): MarketingOutcome { return outcomeSchema.parse(input); }
/**
 * Validates a bounded spending import; CSV parsing belongs to the importing host.
 * @param input - Object containing up to 100 immutable spending rows.
 * @returns Rows with canonical timestamps and integer minor-unit amounts.
 * @example
 * import { parseMarketingSpendImport } from '@alneas/sitekit/marketing';
 * parseMarketingSpendImport({ rows: [{ id: 'row-1', occurredAt: '2026-10-01T00:00:00Z', amountMinor: 10000, currency: 'JPY' }] });
 */
export function parseMarketingSpendImport(input: unknown): MarketingSpendImport { return spendSchema.parse(input); }
