import { z } from 'zod';
import type { ConsoleReport, ConsoleReportQuery, SocialPostInput, SocialAccount, SocialJob, MarketingAccess } from './console-contracts.js';

const id = z.string().trim().min(1).max(160);
const instant = z.string().datetime({ offset: true }).transform(value => new Date(value).toISOString());
const ids = z.array(id).min(1).max(20).refine(values => new Set(values).size === values.length, 'Duplicate destinations');
const image = z.url().refine(value => { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && !u.hash; }, 'HTTPS media URL required');
const socialPostSchema = z.strictObject({ idempotencyKey: id, accountIds: ids, text: z.string().trim().min(1).max(63206), imageUrl: image.optional(), scheduledAt: instant.optional() });
const ruleSchema = z.strictObject({ version: z.number().int().nonnegative(), enabled: z.boolean(), accountIds: z.array(id).max(20).refine(values => new Set(values).size === values.length), requiresApproval: z.boolean() }).refine(value => !value.enabled || value.accountIds.length > 0);
const reportQuerySchema = z.strictObject({ from: instant, to: instant, timezone: z.string().refine(value => { try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; } }), currency: z.string().regex(/^[A-Z]{3}$/) }).refine(v => Date.parse(v.to) > Date.parse(v.from) && Date.parse(v.to) - Date.parse(v.from) <= 93 * 86400000);
const count = z.number().int().nonnegative();
const money = z.number().nonnegative().finite().nullable();
const measured = { confirmedConversions: count, spendMinor: money, revenueMinor: money, cpaMinor: money, roas: money };
const reportSchema = z.object({ asOf: instant, period: z.object({ currency: z.string().regex(/^[A-Z]{3}$/) }), spendCoverage: z.string(), totals: z.object({ ...measured, pageViews: count, leads: count, bookings: count, unattributedConversions: count }), campaigns: z.array(z.object({ ...measured, source: z.string().nullable(), campaign: z.string().nullable() })).max(10000) });

/**
 * Validates a credential-free publication request with unique destinations.
 * @param input - Untrusted boundary data.
 * @returns Validated credential-free value; invalid data throws.
 * @example import { parseSocialPost } from '@alneas/sitekit/management';
 * export const validate = (input: unknown) => parseSocialPost(input);
 */
export function parseSocialPost(input: unknown): SocialPostInput {
  const value = socialPostSchema.parse(input);
  return { idempotencyKey: value.idempotencyKey, accountIds: value.accountIds, text: value.text, ...(value.imageUrl ? { imageUrl: value.imageUrl } : {}), ...(value.scheduledAt ? { scheduledAt: value.scheduledAt } : {}) };
}

/**
 * Validates a report window of at most 93 days and an IANA timezone.
 * @param input - Untrusted boundary data.
 * @returns Validated credential-free value; invalid data throws.
 * @example import { parseConsoleQuery } from '@alneas/sitekit/management';
 * export const validate = (input: unknown) => parseConsoleQuery(input);
 */
export function parseConsoleQuery(input: unknown): ConsoleReportQuery { return reportQuerySchema.parse(input); }
/**
 * Projects the canonical measurement report into the common console view.
 * @param input - Untrusted boundary data.
 * @returns Validated credential-free value; invalid data throws.
 * @example import { parseConsoleReport } from '@alneas/sitekit/management';
 * export const validate = (input: unknown) => parseConsoleReport(input);
 */
export function parseConsoleReport(input: unknown): ConsoleReport {
  const report = reportSchema.parse(input);
  return { asOf: report.asOf, currency: report.period.currency, coverage: report.spendCoverage, totals: report.totals, campaigns: report.campaigns };
}
/**
 * Validates the credential-free report projection.
 * @param input - Untrusted boundary data.
 * @returns Validated credential-free value; invalid data throws.
 * @example import { parseConsoleReportView } from '@alneas/sitekit/management';
 * export const validate = (input: unknown) => parseConsoleReportView(input);
 */
export function parseConsoleReportView(input: unknown): ConsoleReport {
  const value = z.object({ asOf: instant, currency: z.string().regex(/^[A-Z]{3}$/), coverage: z.string(), totals: reportSchema.shape.totals, campaigns: reportSchema.shape.campaigns }).parse(input);
  return value;
}

const permission = z.union([z.strictObject({ allowed: z.literal(true) }), z.strictObject({ allowed: z.literal(false), reason: z.enum(['forbidden', 'subscription_required', 'unavailable']) })]);
const marketingAccessSchema = z.strictObject({ read: permission, spend: permission, connect: permission, disconnect: permission, post: permission, reconcile: permission });
const httpsUrl = z.url().refine(v => { const u = new URL(v); return u.protocol === 'https:' && !u.username && !u.password; });
const accountSchema = z.object({ id: z.string(), platform: z.enum(['facebook', 'instagram']), name: z.string(), status: z.enum(['connected', 'reconnect_required', 'disconnected']), expiresAt: instant, version: z.number().int().positive() });
const jobSchema = z.object({ id: z.string(), version: z.number().int().positive(), accountId: z.string(), platform: z.enum(['facebook', 'instagram']), text: z.string(), imageUrl: httpsUrl.optional(), status: z.enum(['draft', 'scheduled', 'queued', 'publishing', 'retry_wait', 'published', 'failed', 'unknown', 'cancelled']), scheduledAt: instant.optional(), createdAt: instant, attempt: z.number().int().nonnegative(), nextAttemptAt: instant.optional(), publishedAt: instant.optional(), externalId: z.string().optional(), externalUrl: httpsUrl.optional(), errorCode: z.string().optional() });

/**
 * Validates and strips private fields from destination projections.
 * @param input - Untrusted boundary data.
 * @returns Validated credential-free value; invalid data throws.
 * @example import { parseConsoleAccounts } from '@alneas/sitekit/management';
 * export const validate = (input: unknown) => parseConsoleAccounts(input);
 */
export function parseConsoleAccounts(input: unknown): SocialAccount[] { return z.array(accountSchema).max(20).parse(input) as SocialAccount[]; }
/**
 * Validates and strips private fields from scoped job projections.
 * @param input - Untrusted boundary data.
 * @returns Validated credential-free value; invalid data throws.
 * @example import { parseConsoleJobs } from '@alneas/sitekit/management';
 * export const validate = (input: unknown) => parseConsoleJobs(input);
 */
export function parseConsoleJobs(input: unknown): SocialJob[] { return z.array(jobSchema).max(500).parse(input) as SocialJob[]; }
/**
 * Validates one safe publication job.
 * @param input - Untrusted boundary data.
 * @returns Validated credential-free value; invalid data throws.
 * @example import { parseConsoleJob } from '@alneas/sitekit/management';
 * export const validate = (input: unknown) => parseConsoleJob(input);
 */
export function parseConsoleJob(input: unknown): SocialJob { return jobSchema.parse(input) as SocialJob; }
/**
 * Validates presentation-only immediate operation grants.
 * @param input - Untrusted boundary data.
 * @returns Validated credential-free value; invalid data throws.
 * @example import { parseConsoleAccess } from '@alneas/sitekit/management';
 * export const validate = (input: unknown) => parseConsoleAccess(input);
 */
export function parseConsoleAccess(input: unknown): MarketingAccess { return marketingAccessSchema.parse(input) as MarketingAccess; }
/**
 * Validates the HTTPS Meta authorization redirect.
 * @param input - Untrusted boundary data.
 * @returns Validated credential-free value; invalid data throws.
 * @example import { parseConsoleConnection } from '@alneas/sitekit/management';
 * export const validate = (input: unknown) => parseConsoleConnection(input);
 */
export function parseConsoleConnection(input: unknown): {
  /** Host-validated Meta OAuth redirect URL. */
  url: string
} { return z.strictObject({ url: httpsUrl.refine(v => new URL(v).origin === 'https://www.facebook.com') }).parse(input); }
/**
 * Validates the advertising-spend import acknowledgement.
 * @param input - Untrusted boundary data.
 * @returns Validated credential-free value; invalid data throws.
 * @example import { parseConsoleSpend } from '@alneas/sitekit/management';
 * export const validate = (input: unknown) => parseConsoleSpend(input);
 */
export function parseConsoleSpend(input: unknown): {
  /** Number of newly accepted rows. */
  accepted: number;
  /** Number of previously registered rows. */
  duplicates: number
} { return z.strictObject({ accepted: z.number().int().nonnegative(), duplicates: z.number().int().nonnegative() }).parse(input); }
