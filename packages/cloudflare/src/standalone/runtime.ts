import { createManagementSettingsService, ManagementFault, parseSettingsSnapshot } from '@alneas/sitekit/management';
import type { ManagementScope, SettingsRecord, SettingsValues, SettingsSectionName } from '@alneas/sitekit/management';
import { createD1ManagementSettingsStore } from '../management/store.js';
import type { MarketingDatabase } from '../marketing/types.js';
import { readStandaloneGrant } from './grants.js';
import type { StandaloneConfiguration, StandaloneEffect } from './types.js';
export const runtimeSchemaSql = `CREATE TABLE IF NOT EXISTS sitekit_standalone_effects(
 tenant_id TEXT NOT NULL,site_id TEXT NOT NULL,application_id TEXT NOT NULL,receipt_id TEXT NOT NULL,
 section TEXT NOT NULL,saved_revision TEXT NOT NULL,epoch TEXT NOT NULL,status TEXT NOT NULL,value TEXT NOT NULL,applied_at TEXT NOT NULL,
 PRIMARY KEY(tenant_id,site_id,application_id));
CREATE TABLE IF NOT EXISTS sitekit_standalone_runtime(
 tenant_id TEXT NOT NULL,site_id TEXT NOT NULL,section TEXT NOT NULL,application_id TEXT NOT NULL,value TEXT NOT NULL,
 PRIMARY KEY(tenant_id,site_id,section));`;
export const runnerSubject = 'sitekit:runner';
/**
 * Executes the trusted standalone operation.
 * @param db - Trusted configuration or scoped server binding.
 * @param scope - Trusted configuration or scoped server binding.
 * @returns Scoped result; invalid state or stale admission fails closed.
 * @example import { standaloneRecord } from '@alneas/sitekit-cloudflare/standalone';
 * export const invoke = (...args: Parameters<typeof standaloneRecord>) => standaloneRecord(...args);
 */
export async function standaloneRecord(db: MarketingDatabase, scope: ManagementScope): Promise<SettingsRecord> {
  const record = await createD1ManagementSettingsStore(db, runnerSubject).read(scope);
  if (!record) throw new ManagementFault('unavailable'); parseSettingsSnapshot(record.snapshot); return record;
}
/**
 * Reads the actual activated target projection, independent of unconfirmed saved drafts.
 * @param db - Trusted configuration or scoped server binding.
 * @param scope - Trusted configuration or scoped server binding.
 * @returns Scoped result; invalid state or stale admission fails closed.
 * @example import { readStandaloneRuntime } from '@alneas/sitekit-cloudflare/standalone';
 * export const invoke = (...args: Parameters<typeof readStandaloneRuntime>) => readStandaloneRuntime(...args);
 */
export async function readStandaloneRuntime(db: MarketingDatabase, scope: ManagementScope): Promise<Partial<SettingsValues>> {
  const rows = await db.prepare('SELECT section,value FROM sitekit_standalone_runtime WHERE tenant_id=? AND site_id=?').bind(scope.tenantId, scope.siteId).all<{
  /** Applied settings section. */
    section: SettingsSectionName;
  /** Exact captured configuration, not a later draft. */
    value: string
  }>();
  const values: Partial<SettingsValues> = {}; for (const row of rows.results) Object.assign(values, { [row.section]: JSON.parse(row.value) }); return values;
}
async function effect(db: MarketingDatabase, scope: ManagementScope, id: string): Promise<StandaloneEffect | null> {
  const row = await db.prepare('SELECT * FROM sitekit_standalone_effects WHERE tenant_id=? AND site_id=? AND application_id=?').bind(scope.tenantId, scope.siteId, id).first<Record<string, string>>();
  return row ? { applicationId: row.application_id!, receiptId: row.receipt_id!, section: row.section! as SettingsSectionName, savedRevision: row.saved_revision!, authorityEpoch: row.epoch!, status: row.status! as StandaloneEffect['status'], value: JSON.parse(row.value!), appliedAt: row.applied_at! } : null;
}
/**
 * Activates pending captured settings under live authority and records verified completion; resumes existing receipts without reactivation.
 * @param db - Trusted configuration or scoped server binding.
 * @param config - Trusted configuration or scoped server binding.
 * @returns Scoped result; invalid state or stale admission fails closed.
 * @example import { runStandaloneSettings } from '@alneas/sitekit-cloudflare/standalone';
 * export const invoke = (...args: Parameters<typeof runStandaloneSettings>) => runStandaloneSettings(...args);
 */
export async function runStandaloneSettings(db: MarketingDatabase, config: StandaloneConfiguration): Promise<number> {
  const scope = config.scope, grant = await readStandaloneGrant(db, scope, runnerSubject);
  if (!grant?.enabled || grant.kind !== 'service' || !grant.operations.includes('run') || !grant.operations.includes('completeApplication')) throw new ManagementFault('forbidden');
  const service = createManagementSettingsService({
    scope, store: createD1ManagementSettingsStore(db, runnerSubject), authorize: async request => {
      const live = await readStandaloneGrant(db, scope, runnerSubject); return { allowed: live?.enabled === true && live.version === grant.version && live.kind === 'service' && live.operations.includes(request.operation), version: live?.version ?? 'missing' };
    }, verifyApplication: async request => {
      const proof = await effect(db, scope, request.application.id);
      return !!proof && proof.receiptId === request.completion.receiptId && proof.section === request.application.section && proof.savedRevision === request.application.savedRevision && proof.authorityEpoch === request.application.authorityEpoch && JSON.stringify(proof.value) === JSON.stringify(request.value) && (proof.status === 'applied' ? request.completion.outcome === 'applied' : request.completion.outcome === 'failed');
    }
  });
  let completed = 0;
  const pending = (await standaloneRecord(db, scope)).applications.filter(a => a.view.status === 'applying').slice(0, 10);
  for (const captured of pending) {
    let proof = await effect(db, scope, captured.view.id);
    if (!proof) {
      const record = await standaloneRecord(db, scope), s = record.snapshot;
      if (s.authority.kind !== 'standalone' || s.authority.status !== 'active' || s.authority.epoch !== captured.view.authorityEpoch) throw new ManagementFault('conflict');
      let rejected = false, socialRevision: number | undefined;
      if (captured.view.section === 'localization') {
        const value = captured.value as SettingsValues['localization'];
        rejected = value.locales.some(locale => !config.pages.some(page => page.locale === locale)) || (value.prefixStrategy === 'never' && value.locales.length > 1);
      }
      if (captured.view.section === 'social' && (captured.value as SettingsValues['social']).enabled) {
        const social = await db.prepare('SELECT revision,payload FROM sitekit_social_state WHERE tenant_id=? AND site_id=?').bind(scope.tenantId, scope.siteId).first<{
  /** Stable successful publication revision. */
          revision: number;
  /** Trusted payload value. */
          payload: string
        }>();
        socialRevision = social?.revision ?? 0;
        const accounts = social ? JSON.parse(social.payload).accounts as {
  /** Trusted view value. */
          view: {
  /** Trusted id value. */
            id: string;
  /** Recorded activation or definitive rejection outcome. */
            status: string;
  /** Trusted expiresAt value. */
            expiresAt: string
          }
        }[] : [];
        rejected = (captured.value as SettingsValues['social']).accountIds.some(id => !accounts.some(account => account.view.id === id && account.view.status === 'connected' && Date.parse(account.view.expiresAt) > Date.now()));
      }
      const receipt = 'runtime:' + captured.view.id, now = new Date().toISOString(), value = JSON.stringify(captured.value);
      const fence = `EXISTS(SELECT 1 FROM sitekit_management_settings s JOIN sitekit_management_admission a ON a.tenant_id=s.tenant_id AND a.site_id=s.site_id
   WHERE s.tenant_id=? AND s.site_id=? AND s.version=? AND s.epoch=? AND json_extract(s.payload,'$.snapshot.authority.kind')='standalone' AND json_extract(s.payload,'$.snapshot.authority.status')='active'
   AND a.subject=? AND a.version=? AND a.allowed=1 AND EXISTS(SELECT 1 FROM json_each(s.payload,'$.applications') p WHERE json_extract(p.value,'$.view.id')=? AND json_extract(p.value,'$.view.status')='applying' AND json_extract(p.value,'$.view.savedRevision')=? AND json(json_extract(p.value,'$.value'))=json(?)))
   ${socialRevision === undefined ? '' : `AND COALESCE((SELECT revision FROM sitekit_social_state WHERE tenant_id=? AND site_id=?),0)=?`}`;
      const fences = [scope.tenantId, scope.siteId, s.version, s.authority.epoch, runnerSubject, grant.version, captured.view.id, captured.view.savedRevision, value, ...(socialRevision === undefined ? [] : [scope.tenantId, scope.siteId, socialRevision])];
      const statements = [db.prepare(`INSERT INTO sitekit_standalone_effects(tenant_id,site_id,application_id,receipt_id,section,saved_revision,epoch,status,value,applied_at)
   SELECT ?,?,?,?,?,?,?,?,?,? WHERE ${fence} ON CONFLICT DO NOTHING RETURNING receipt_id`).bind(scope.tenantId, scope.siteId, captured.view.id, receipt, captured.view.section, captured.view.savedRevision, s.authority.epoch, rejected ? 'rejected' : 'applied', value, now, ...fences)];
      if (!rejected) statements.push(db.prepare(`INSERT INTO sitekit_standalone_runtime(tenant_id,site_id,section,application_id,value)
   SELECT tenant_id,site_id,section,application_id,value FROM sitekit_standalone_effects WHERE tenant_id=? AND site_id=? AND application_id=? AND status='applied' AND ${fence}
   ON CONFLICT(tenant_id,site_id,section) DO UPDATE SET application_id=excluded.application_id,value=excluded.value RETURNING application_id`).bind(scope.tenantId, scope.siteId, captured.view.id, ...fences));
      await db.batch(statements); proof = await effect(db, scope, captured.view.id);
      if (!proof) throw new ManagementFault('conflict');
    }
    // Existing proof resumes confirmation after a crash; activation is never repeated.
    const snapshot = await service.settings();
    try { await service.completeApplication({ protocolVersion: 1, applicationId: proof.applicationId, expectedVersion: snapshot.version, authorityEpoch: proof.authorityEpoch, outcome: proof.status === 'applied' ? 'applied' : 'failed', receiptId: proof.receiptId, ...(proof.status === 'rejected' ? { errorCode: 'rejected' as const } : {}) }); completed++; }
    catch (e) { if (!(e instanceof ManagementFault && e.code === 'conflict')) throw e; }
  }
  return completed;
}
