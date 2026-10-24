import { z } from 'zod';
import type { ApplySettingsCommand, ManagementContext, SaveSettingsCommand, SettingsSnapshot, SettingsValues, SettingsApplication, SettingsMutationReceipt } from './contracts.js';
import { ManagementFault } from './errors.js';
const id = z.string().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/);
const instant = z.iso.datetime();
const canonicalLocale = z.string().min(2).max(64).transform((value, ctx) => {
  try { return Intl.getCanonicalLocales(value)[0]!; } catch { ctx.addIssue({ code: 'custom', message: 'Invalid locale' }); return z.NEVER; }
});
const sectionNames = ['site', 'localization', 'measurement', 'reporting', 'social'] as const;
const site = z.strictObject({ name: z.string().trim().min(1).max(200), url: z.url().refine(value => { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && u.pathname === '/' && !u.search && !u.hash; }).transform(value => new URL(value).origin) });
const localization = z.strictObject({ defaultLocale: canonicalLocale, locales: z.array(canonicalLocale).min(1).max(16), prefixStrategy: z.enum(['always', 'default-unprefixed', 'never']), timezone: z.string().min(1).max(128).refine(value => { try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; } }) }).refine(value => new Set(value.locales).size === value.locales.length && value.locales.includes(value.defaultLocale));
const measurement = z.strictObject({ enabled: z.boolean(), retentionDays: z.number().int().min(30).max(365), consentMode: z.enum(['opt-in', 'opt-out']), consentDays: z.number().int().min(1).max(365) });
const reporting = z.strictObject({ currency: z.string().regex(/^[A-Z]{3}$/).refine(value => Intl.supportedValuesOf('currency').includes(value)) });
const social = z.strictObject({ enabled: z.boolean(), accountIds: z.array(id).max(20).refine(value => new Set(value).size === value.length), requiresApproval: z.boolean() }).refine(value => !value.enabled || value.accountIds.length > 0);
export const sectionSchemas = { site, localization, measurement, reporting, social };
export const scopeSchema = z.strictObject({ tenantId: id, siteId: id });
export const authoritySchema = z.strictObject({ kind: z.enum(['standalone', 'eaos']), epoch: id, status: z.enum(['active', 'paused', 'transferring']) });
export const settingsValuesSchema = z.strictObject(sectionSchemas);
export const applicationSchema = z.strictObject({ id, commandId: id, section: z.enum(sectionNames), savedRevision: id, expectedEffectiveRevision: id.nullable(), authorityEpoch: id, status: z.enum(['applying', 'applied', 'failed']), requestedAt: instant, completedAt: instant.optional(), receiptId: id.optional(), errorCode: z.enum(['unavailable', 'rejected']).optional() }).superRefine((value, ctx) => {
  if (value.status === 'applying' ? value.completedAt !== undefined || value.receiptId !== undefined || value.errorCode !== undefined : !value.completedAt || !value.receiptId || (value.status === 'applied' ? value.errorCode !== undefined : !value.errorCode)) ctx.addIssue({ code: 'custom', message: 'Invalid application phase' });
});
export const mutationReceiptSchema = z.strictObject({ commandId: id, version: id, section: z.enum(sectionNames), savedRevision: id });
const command = { protocolVersion: z.literal(1), commandId: id, expectedVersion: id, authorityEpoch: id };
const saveSchema = z.union(sectionNames.map(section => z.strictObject({ ...command, section: z.literal(section), value: sectionSchemas[section] })));
const applySchema = z.strictObject({ ...command, section: z.enum(sectionNames), savedRevision: id, expectedEffectiveRevision: id.nullable() });
const sectionSchema = <T extends z.ZodType>(value: T) => z.strictObject({ saved: z.strictObject({ revision: id, value }), effective: z.strictObject({ revision: id, value, receiptId: id, appliedAt: instant }).nullable(), application: applicationSchema.nullable() });
const snapshotSchema = z.strictObject({ protocolVersion: z.literal(1), scope: scopeSchema, authority: authoritySchema, version: id, sections: z.strictObject({ site: sectionSchema(site), localization: sectionSchema(localization), measurement: sectionSchema(measurement), reporting: sectionSchema(reporting), social: sectionSchema(social) }) }).superRefine((snapshot, ctx) => {
  for (const name of sectionNames) {
    const section = snapshot.sections[name];
    if (section.application?.section !== undefined && section.application.section !== name) ctx.addIssue({ code: 'custom', message: 'Application section differs' });
    if (section.effective?.revision === section.saved.revision && JSON.stringify(section.effective.value) !== JSON.stringify(section.saved.value)) ctx.addIssue({ code: 'custom', message: 'Revision values differ' });
  }
});
const capability = z.union([z.strictObject({ available: z.literal(true) }), z.strictObject({ available: z.literal(false), reason: z.enum(['subscription_required', 'not_configured', 'forbidden', 'unavailable']) })]);
const permission = z.union([z.strictObject({ allowed: z.literal(true) }), z.strictObject({ allowed: z.literal(false), reason: z.enum(['forbidden', 'subscription_required', 'unavailable']) })]);
const contextSchema = z.strictObject({ protocolVersion: z.literal(1), scope: scopeSchema, authority: authoritySchema, capabilities: z.strictObject({ settings: capability, measurement: capability, socialPublishing: capability }), permissions: z.strictObject({ readSettings: permission, saveSettings: permission, applySettings: permission, readApplication: permission }), asOf: instant });
export function checked<T>(schema: z.ZodType<T>, input: unknown): T {
  try { return schema.parse(input); } catch { throw new ManagementFault('invalid'); }
}
/**
 * Validates bootstrap values, supplying only safe collection/publication defaults.
 * @param input - Explicit site, localization and reporting configuration.
 * @returns Canonical complete settings; existing values are not overwritten.
 * @example
 * import { parseSettingsValues } from '@alneas/sitekit/management';
 * export const defaults = parseSettingsValues({ site: { name: 'Site', url: 'https://example.com' }, localization: { defaultLocale: 'en', locales: ['en'], prefixStrategy: 'never', timezone: 'UTC' }, reporting: { currency: 'USD' } });
 */
export function parseSettingsValues(input: unknown): SettingsValues {
  return checked(settingsValuesSchema.extend({ measurement: measurement.default({ enabled: false, retentionDays: 90, consentMode: 'opt-in', consentDays: 180 }), social: social.default({ enabled: false, accountIds: [], requiresApproval: true }) }), input);
}
/**
 * Validates a complete section save and its concurrency fences.
 * @param input - Untrusted command, without scope or actor fields.
 * @returns Strict saved-section command.
 * @example
 * import { parseSaveSettingsCommand } from '@alneas/sitekit/management';
 * export const parseSave = (input: unknown) => parseSaveSettingsCommand(input);
 */
export function parseSaveSettingsCommand(input: unknown): SaveSettingsCommand { return checked(saveSchema, input) as SaveSettingsCommand; }
/**
 * Validates an explicit apply request, without substituting a newer saved value.
 * @param input - Untrusted apply command.
 * @returns Strict apply command.
 * @example
 * import { parseApplySettingsCommand } from '@alneas/sitekit/management';
 * export const parseApply = (input: unknown) => parseApplySettingsCommand(input);
 */
export function parseApplySettingsCommand(input: unknown): ApplySettingsCommand { return checked(applySchema, input); }
/**
 * Validates a credential-free snapshot at a storage or browser boundary.
 * @param input - Snapshot from a host.
 * @returns Detached canonical settings projection.
 * @example
 * import { parseSettingsSnapshot } from '@alneas/sitekit/management';
 * export const parseSnapshot = (input: unknown) => parseSettingsSnapshot(input);
 */
export function parseSettingsSnapshot(input: unknown): SettingsSnapshot { return checked(snapshotSchema, input) as SettingsSnapshot; }
/**
 * Validates display context; the result must never grant server privileges.
 * @param input - Untrusted presentation context.
 * @returns Safe context with explicit capabilities and permissions.
 * @example
 * import { parseManagementContext } from '@alneas/sitekit/management';
 * export const parseContext = (input: unknown) => parseManagementContext(input);
 */
export function parseManagementContext(input: unknown): ManagementContext { return checked(contextSchema, input) as ManagementContext; }

/**
 * Validates an application response without exposing provider diagnostics.
 * @param input - Untrusted application projection.
 * @returns Strict request or verified completion projection.
 * @example
 * import { parseSettingsApplication } from '@alneas/sitekit/management';
 * export const parseApplication = (input: unknown) => parseSettingsApplication(input);
 */
export function parseSettingsApplication(input: unknown): SettingsApplication { return checked(applicationSchema, input) as SettingsApplication; }
/**
 * Validates a durable save acknowledgement.
 * @param input - Untrusted save response.
 * @returns Original command, committed version and saved revision.
 * @example
 * import { parseSettingsMutationReceipt } from '@alneas/sitekit/management';
 * export const parseReceipt = (input: unknown) => parseSettingsMutationReceipt(input);
 */
export function parseSettingsMutationReceipt(input: unknown): SettingsMutationReceipt { return checked(mutationReceiptSchema, input); }
