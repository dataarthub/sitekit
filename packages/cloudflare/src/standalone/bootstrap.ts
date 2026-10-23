import {authoritySchemaSql} from '../management/authority-store.js';
import {transferBusinessSchemaSql} from '../management/standalone-transfer.js';
import { createSettingsRecord, parseSettingsValues } from '@alneas/sitekit/management';
import { managementSchemaSql } from '../management/store.js';
import { marketingSchemaSql } from '../marketing/schema.js';
import { socialStateSchemaSql } from './social/store.js';
import { grantSchemaSql } from './grants.js';
import { runtimeSchemaSql, runnerSubject } from './runtime.js';
import type {MarketingDatabase} from '../marketing/types.js';
import type { StandaloneConfiguration } from './types.js';
/** Idempotent D1 schema for settings, measurement, encrypted jobs, ACLs and activation receipts. */
export const standaloneSchemaSql = managementSchemaSql + marketingSchemaSql + socialStateSchemaSql + grantSchemaSql + runtimeSchemaSql + authoritySchemaSql + transferBusinessSchemaSql;
const quote = (value: string) => "'" + value.replace(/'/g, "''") + "'";
/**
 * Builds replayable schema and first-install saved-settings/grant SQL without replacing an existing site.
 * @param config - Trusted configuration or scoped server binding.
 * @param administrators - Trusted configuration or scoped server binding.
 * @returns Scoped result; invalid state or stale admission fails closed.
 * @example import { createStandaloneBootstrapSql } from '@alneas/sitekit-cloudflare/standalone';
 * export const invoke = (...args: Parameters<typeof createStandaloneBootstrapSql>) => createStandaloneBootstrapSql(...args);
 */
function statements(config: StandaloneConfiguration, administrators: string[]): string[] {
  if (!administrators.length || administrators.length > 20 || administrators.some(s => !s || s.length > 160 || s.startsWith('sitekit:'))) throw new Error('Explicit administrator subjects required');
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(config.scope.tenantId) || !/^[A-Za-z0-9_-]{1,80}$/.test(config.scope.siteId)) throw new Error('Invalid site identity');
  const record = createSettingsRecord({ scope: config.scope, authority: { kind: 'standalone', epoch: crypto.randomUUID(), status: 'active' }, values: parseSettingsValues(config.initialValues) }), s = record.snapshot;
  const { tenantId, siteId } = config.scope;
  const sql = [...standaloneSchemaSql.split(';').map(s=>s.trim()).filter(Boolean), `INSERT INTO sitekit_management_settings VALUES(${[tenantId, siteId, s.version, s.authority.epoch, JSON.stringify(record)].map(quote).join(',')}) ON CONFLICT DO NOTHING`];
  const grants = [...new Set(administrators)].map(subject => ({ subject, kind: 'human', operations: ['read', 'readSettings', 'saveSettings', 'applySettings', 'readApplication', 'post', 'spend', 'connect', 'disconnect', 'reconcile', 'manageConnection'] }));
  grants.push({ subject: runnerSubject, kind: 'service', operations: ['read', 'readSettings', 'readApplication', 'completeApplication', 'run', 'publish'] }, { subject: 'sitekit:publisher', kind: 'service', operations: ['read', 'post', 'publication'] });
  for (const grant of grants) {
    const version = crypto.randomUUID();
    sql.push(`INSERT INTO sitekit_standalone_grants SELECT ${[tenantId, siteId, grant.subject, grant.kind].map(quote).join(',')},1,${quote(version)},${quote(JSON.stringify(grant.operations))} WHERE EXISTS(SELECT 1 FROM sitekit_management_settings WHERE tenant_id=${quote(tenantId)} AND site_id=${quote(siteId)} AND version=${quote(s.version)}) ON CONFLICT DO NOTHING`);
    sql.push(`INSERT INTO sitekit_management_admission SELECT tenant_id,site_id,subject,version,enabled FROM sitekit_standalone_grants WHERE tenant_id=${quote(tenantId)} AND site_id=${quote(siteId)} AND subject=${quote(grant.subject)} AND version=${quote(version)} ON CONFLICT DO NOTHING`);
  }
  return sql;
}

/**
 * Builds replayable first-install SQL for Wrangler without replacing an existing site.
 * @param config - Operator-owned deployment configuration.
 * @param administrators - Explicit verified human subjects.
 * @returns SQL migration and initial saved settings/grants; no settings are falsely applied.
 * @example
 * import { createStandaloneBootstrapSql } from '@alneas/sitekit-cloudflare/standalone';
 * export const setup = (...args: Parameters<typeof createStandaloneBootstrapSql>) => createStandaloneBootstrapSql(...args);
 */
export function createStandaloneBootstrapSql(config:StandaloneConfiguration,administrators:string[]):string{return statements(config,administrators).map(sql=>sql+';').join('\n');}
/**
 * Initializes a D1 binding atomically using prepared statements, including multiline schemas.
 * @param db - Trusted local or operator-selected D1 binding.
 * @param config - Deployment configuration and imported initial values.
 * @param administrators - Explicit human subjects to provision only on first installation.
 * @returns Completion after the migration/seed batch; existing settings and grants are preserved.
 * @example
 * import { initializeStandaloneDatabase } from '@alneas/sitekit-cloudflare/standalone';
 * export const setup = (...args: Parameters<typeof initializeStandaloneDatabase>) => initializeStandaloneDatabase(...args);
 */
export async function initializeStandaloneDatabase(db:MarketingDatabase,config:StandaloneConfiguration,administrators:string[]):Promise<void>{await db.batch(statements(config,administrators).map(sql=>db.prepare(sql)));}
