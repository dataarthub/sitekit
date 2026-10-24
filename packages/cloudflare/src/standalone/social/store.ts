import type { CloudflareD1Database } from '../../types.js';
import type { ConsoleScope } from '@alneas/sitekit/management';
import { ConsoleFault, type SocialState, type SocialStateStore } from './types.js';

export const socialStateSchemaSql = `CREATE TABLE IF NOT EXISTS sitekit_social_state (
 tenant_id TEXT NOT NULL, site_id TEXT NOT NULL, revision INTEGER NOT NULL, payload TEXT NOT NULL,
 PRIMARY KEY (tenant_id, site_id)
);`;
function checked(scope: ConsoleScope): ConsoleScope {
  if (![scope.tenantId, scope.siteId].every(value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value))) throw new ConsoleFault('invalid');
  return Object.freeze({ tenantId: scope.tenantId, siteId: scope.siteId });
}
function initial(scope: ConsoleScope): SocialState {
  return { schemaVersion: 1, ...scope, accounts: [], jobs: [], oauth: [], publications: [] };
}
function validate(value: SocialState, scope: ConsoleScope): string {
  if (value.schemaVersion !== 1 || value.tenantId !== scope.tenantId || value.siteId !== scope.siteId || !Array.isArray(value.accounts) || !Array.isArray(value.jobs) || !Array.isArray(value.oauth) || !Array.isArray(value.publications)) throw new ConsoleFault('unavailable');
  const payload = JSON.stringify(value);
  if (value.publications.length > 500 || value.jobs.length > 500 || value.accounts.length > 20 || value.oauth.length > 20 || new TextEncoder().encode(payload).byteLength > 512 * 1024) throw new ConsoleFault('capacity');
  return payload;
}
/** D1 compare-and-swap store for one bounded site aggregate; no network side effects occur in CAS retries. */
export function createD1SocialStore(options: { database: CloudflareD1Database; scope: ConsoleScope; admission: { subject: string; version: string; epoch: string } }): SocialStateStore {
  const scope = checked(options.scope), db = options.database;
  const fence = `EXISTS(SELECT 1 FROM sitekit_management_admission a JOIN sitekit_management_settings s ON s.tenant_id=a.tenant_id AND s.site_id=a.site_id WHERE a.tenant_id=? AND a.site_id=? AND a.subject=? AND a.version=? AND a.allowed=1 AND s.epoch=? AND json_extract(s.payload,'$.snapshot.authority.kind')='standalone' AND json_extract(s.payload,'$.snapshot.authority.status')='active')`;
  const fences=()=>[scope.tenantId,scope.siteId,options.admission.subject,options.admission.version,options.admission.epoch];
  return {
    scope,
    async read() {
      const row = await db.prepare('SELECT revision, payload FROM sitekit_social_state WHERE tenant_id = ? AND site_id = ?').bind(scope.tenantId, scope.siteId).first<{ revision: number; payload: string }>();
      if (!row) return { revision: 0, value: initial(scope) };
      const value = JSON.parse(row.payload) as SocialState; validate(value, scope);
      return { revision: row.revision, value };
    },
    async compareAndSwap(revision, value) {
      const payload = validate(value, scope);
      const statement = revision === 0
        ? db.prepare(`INSERT INTO sitekit_social_state (tenant_id, site_id, revision, payload) SELECT ?, ?, 1, ? WHERE ${fence} ON CONFLICT DO NOTHING RETURNING revision`).bind(scope.tenantId, scope.siteId, payload,...fences())
        : db.prepare(`UPDATE sitekit_social_state SET revision = revision + 1, payload = ? WHERE tenant_id = ? AND site_id = ? AND revision = ? AND ${fence} RETURNING revision`).bind(payload, scope.tenantId, scope.siteId, revision,...fences());
      return (await statement.first<{ revision: number }>())?.revision === revision + 1;
    },
  };
}
