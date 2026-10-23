import { ManagementFault } from '@alneas/sitekit/management';
import type { AuthorityRecord, AuthorityPermit, AuthorityStore, ManagementScope } from '@alneas/sitekit/management';
import type { MarketingDatabase } from '../marketing/types.js';
/** Site-local authority/control migrations; never stores a second editable settings copy. */
export const authoritySchemaSql = `CREATE TABLE IF NOT EXISTS sitekit_authority_control(
 tenant_id TEXT NOT NULL,site_id TEXT NOT NULL,version TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(tenant_id,site_id));
CREATE TABLE IF NOT EXISTS sitekit_authority_permits(
 tenant_id TEXT NOT NULL,site_id TEXT NOT NULL,id TEXT NOT NULL,version TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(tenant_id,site_id,id));
CREATE TABLE IF NOT EXISTS sitekit_transfer_snapshots(
 tenant_id TEXT NOT NULL,site_id TEXT NOT NULL,id TEXT NOT NULL,kind TEXT NOT NULL,hash TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(tenant_id,site_id,id,kind));`;
/**
 * Trusted first-install authority setup, preserving every existing owner and epoch.
 * @param db - Verified operation input.
 * @param record - Verified operation input.
 * @returns Authoritative result; invalid, stale or unavailable state fails closed.
 * @example import {initializeAuthority} from '@alneas/sitekit-cloudflare/management';
 * export const invoke = (operation:typeof initializeAuthority,...args:Parameters<typeof initializeAuthority>) => operation(...args);
 */
export async function initializeAuthority(db: MarketingDatabase, record: AuthorityRecord): Promise<boolean> {
  if (record.status !== 'active' || record.transfer || record.openPermits.length || record.commands.length) throw new ManagementFault('invalid');
  return !!await db.prepare('INSERT INTO sitekit_authority_control(tenant_id,site_id,version,payload) VALUES(?,?,?,?) ON CONFLICT DO NOTHING RETURNING version').bind(record.scope.tenantId, record.scope.siteId, record.version, JSON.stringify(record)).first();
}
/**
 * Native D1 control+permit CAS, atomically fenced by the bound subject's current permission generation.
 * @param o - Verified operation input.
 * @returns Authoritative result; invalid, stale or unavailable state fails closed.
 * @example import {createD1AuthorityStore} from '@alneas/sitekit-cloudflare/management';
 * export const invoke = (operation:typeof createD1AuthorityStore,...args:Parameters<typeof createD1AuthorityStore>) => operation(...args);
 */
export function createD1AuthorityStore(o: {
  /** Operator-provisioned transactional D1 binding. */

  database: MarketingDatabase;
  /** Immutable server-verified tenant and site. */

  scope: ManagementScope;
  /** Verified server principal whose live permission generation fences writes. */

  subject: string
}): AuthorityStore {
  const db = o.database, s = Object.freeze({ ...o.scope }); if (!o.subject || !Object.values(s).every(v => /^[A-Za-z0-9_-]{1,80}$/.test(v))) throw new ManagementFault('invalid');
  return {
    async read() {
      const r = await db.prepare('SELECT payload FROM sitekit_authority_control WHERE tenant_id=? AND site_id=?').bind(s.tenantId, s.siteId).first<{
        /** Trusted server-supplied operation value. */

        payload: string
      }>(); return r ? JSON.parse(r.payload) as AuthorityRecord : null
    },
    async permit(id) {
      const r = await db.prepare('SELECT payload FROM sitekit_authority_permits WHERE tenant_id=? AND site_id=? AND id=?').bind(s.tenantId, s.siteId, id).first<{
        /** Trusted server-supplied operation value. */

        payload: string
      }>(); return r ? JSON.parse(r.payload) as AuthorityPermit : null
    },
    async compareAndSwap(input) {
      if (input.next.scope.tenantId !== s.tenantId || input.next.scope.siteId !== s.siteId || input.next.version === input.expectedVersion) throw new ManagementFault('forbidden');
      const args: unknown[] = [input.next.version, JSON.stringify(input.next), s.tenantId, s.siteId, input.expectedVersion, s.tenantId, s.siteId, o.subject, input.expectedPermissionVersion];
      let permitFence = ''; if (input.permit) { permitFence = input.expectedPermitVersion === null ? ' AND NOT EXISTS(SELECT 1 FROM sitekit_authority_permits WHERE tenant_id=? AND site_id=? AND id=?)' : ' AND EXISTS(SELECT 1 FROM sitekit_authority_permits WHERE tenant_id=? AND site_id=? AND id=? AND version=?)'; args.push(s.tenantId, s.siteId, input.permit.id); if (input.expectedPermitVersion !== null) args.push(input.expectedPermitVersion) }
      const control = db.prepare(`UPDATE sitekit_authority_control SET version=?,payload=? WHERE tenant_id=? AND site_id=? AND version=? AND EXISTS(SELECT 1 FROM sitekit_management_admission WHERE tenant_id=? AND site_id=? AND subject=? AND version=? AND allowed=1)${permitFence} RETURNING version`).bind(...args);
      if (!input.permit) return (await control.first<{
        /** Opaque optimistic-concurrency version. */

        version: string
      }>())?.version === input.next.version;
      const p = input.permit;
      const permit = input.expectedPermitVersion === null ? db.prepare('INSERT INTO sitekit_authority_permits(tenant_id,site_id,id,version,payload) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM sitekit_authority_control WHERE tenant_id=? AND site_id=? AND version=?) ON CONFLICT DO NOTHING RETURNING version').bind(s.tenantId, s.siteId, p.id, p.version, JSON.stringify(p), s.tenantId, s.siteId, input.next.version) : db.prepare('UPDATE sitekit_authority_permits SET version=?,payload=? WHERE tenant_id=? AND site_id=? AND id=? AND version=? AND EXISTS(SELECT 1 FROM sitekit_authority_control WHERE tenant_id=? AND site_id=? AND version=?) RETURNING version').bind(p.version, JSON.stringify(p), s.tenantId, s.siteId, p.id, input.expectedPermitVersion, s.tenantId, s.siteId, input.next.version);
      const results = await db.batch([control, permit]); if (results[0]?.results[0]?.version !== input.next.version) return false; if (results[1]?.results[0]?.version !== p.version) throw new ManagementFault('unavailable'); return true;
    },
  };
}
