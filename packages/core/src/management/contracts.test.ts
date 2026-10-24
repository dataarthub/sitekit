import { describe, it, expect } from 'vitest';
import { parseSettingsValues, parseSaveSettingsCommand, parseApplySettingsCommand, parseManagementContext, parseSettingsSnapshot, parseSettingsApplication, parseSettingsMutationReceipt } from './index.js';
const values = { site: { name: 'Site', url: 'https://example.com' }, localization: { defaultLocale: 'ja', locales: ['ja', 'en'], prefixStrategy: 'default-unprefixed', timezone: 'Asia/Tokyo' }, reporting: { currency: 'JPY' } };
const save = { protocolVersion: 1, commandId: 'save-1', expectedVersion: 'version-1', authorityEpoch: 'epoch-1', section: 'site', value: values.site };
describe('public management contracts', () => {
 it('initializes safe bootstrap defaults without inventing site identity, language or money', () => {
  const parsed = parseSettingsValues(values);
  expect(parsed.measurement).toEqual({ enabled: false, retentionDays: 90, consentMode: 'opt-in', consentDays: 180 });
  expect(parsed.social).toEqual({ enabled: false, accountIds: [], requiresApproval: true });
  expect(() => parseSettingsValues({})).toThrow();
  expect(parsed.site.url).toBe('https://example.com');
 });
 it.each([
  { site: { name: '', url: 'https://example.com' } }, { site: { name: 'Site', url: 'https://user:password@example.com' } },
  { site: { name: 'Site', url: 'http://example.com' } }, { site: { name: 'Site', url: 'https://example.com/?token=secret' } },
  { localization: { ...values.localization, defaultLocale: 'fr' } }, { localization: { ...values.localization, locales: ['en-US', 'en-us'] } },
  { localization: { ...values.localization, timezone: 'not/a-zone' } }, { reporting: { currency: 'notmoney' } },
  { measurement: { enabled: true, retentionDays: 29, consentMode: 'opt-in', consentDays: 180 } },
  { social: { enabled: true, accountIds: [], requiresApproval: false } }, { secret: 'hidden' },
 ])('rejects invalid settings: %j', patch => { expect(() => parseSettingsValues({ ...values, ...patch })).toThrow(); });
 it('rejects forged actor/scope/permission fields and unsupported protocol', () => {
  expect(parseSaveSettingsCommand(save)).toEqual(save);
  for (const patch of [{ protocolVersion: 2 }, { actor: 'admin' }, { siteId: 'foreign' }, { permissions: { save: true } }, { expectedVersion: '' }, { authorityEpoch: '' }, { value: { ...values.site, accessToken: 'private' } }]) expect(() => parseSaveSettingsCommand({ ...save, ...patch })).toThrow();
  expect(() => parseSaveSettingsCommand({ ...save, section: 'measurement', value: { enabled: true } })).toThrow();
 });
 it('requires an explicit saved revision and expected effective revision when applying', () => {
  const command = { protocolVersion: 1, commandId: 'apply-1', expectedVersion: 'version-2', authorityEpoch: 'epoch-1', section: 'site', savedRevision: 'saved-1', expectedEffectiveRevision: null };
  expect(parseApplySettingsCommand(command)).toEqual(command);
  const { expectedEffectiveRevision: _ignored, ...missing } = command;
  expect(() => parseApplySettingsCommand(missing)).toThrow();
  expect(() => parseApplySettingsCommand({ ...command, value: values.site })).toThrow();
 });
 it('validates safe display context without accepting arbitrary capability or secret keys', () => {
  const granted = { allowed: true }, ready = { available: true };
  const context = { protocolVersion: 1, scope: { tenantId: 'tenant', siteId: 'site' }, authority: { kind: 'eaos', epoch: 'epoch-1', status: 'active' }, capabilities: { settings: ready, measurement: ready, socialPublishing: ready }, permissions: { readSettings: granted, saveSettings: granted, applySettings: granted, readApplication: granted }, asOf: '2026-10-23T00:00:00.000Z' };
  expect(parseManagementContext(context)).toEqual(context);
  expect(() => parseManagementContext({ ...context, token: 'private' })).toThrow();
  expect(() => parseManagementContext({ ...context, permissions: { ...context.permissions, publishAnything: granted } })).toThrow();
  expect(() => parseManagementContext({ ...context, authority: { ...context.authority, status: 'broken' } })).toThrow();
 });
 it('validates application and mutation response DTOs without accepting raw provider fields', () => {
  const receipt = { commandId: 'c1', version: 'v1', section: 'site', savedRevision: 's1' };
  expect(parseSettingsMutationReceipt(receipt)).toEqual(receipt);
  expect(() => parseSettingsMutationReceipt({ ...receipt, secret: 'hidden' })).toThrow();
  const request = { id: 'a1', commandId: 'c2', section: 'site', savedRevision: 's1', expectedEffectiveRevision: null, authorityEpoch: 'epoch-1', status: 'applying', requestedAt: '2026-10-23T00:00:00.000Z' };
  expect(parseSettingsApplication(request)).toEqual(request);
  expect(() => parseSettingsApplication({ ...request, status: 'applied' })).toThrow();
  expect(() => parseSettingsApplication({ ...request, diagnostics: 'provider secret' })).toThrow();
 });
 it('rejects different values advertised under the same saved/effective revision', () => {
  const parsed = parseSettingsValues(values);
  const sections: Record<string, unknown> = Object.fromEntries(Object.entries(parsed).map(([name, value]) => [name, { saved: { revision: 'revision-' + name, value }, effective: null, application: null }]));
  sections.site = { saved: { revision: 'same', value: parsed.site }, effective: { revision: 'same', value: { ...parsed.site, name: 'Different' }, receiptId: 'proof', appliedAt: '2026-10-23T00:00:00.000Z' }, application: null };
  expect(() => parseSettingsSnapshot({ protocolVersion: 1, scope: { tenantId: 'tenant', siteId: 'site' }, authority: { kind: 'standalone', epoch: 'epoch-1', status: 'active' }, version: 'v1', sections })).toThrow();
 });
 it('rejects a malformed saved/effective snapshot rather than accepting a raw store object', () => {
  expect(() => parseSettingsSnapshot({ protocolVersion: 1, ...values })).toThrow();
 });
});
