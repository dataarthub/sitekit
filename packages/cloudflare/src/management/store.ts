import type { ManagementScope, ManagementSettingsStore, SettingsRecord } from '@alneas/sitekit/management';
import { ManagementFault, parseSettingsSnapshot } from '@alneas/sitekit/management';
import type { CloudflareD1Database } from '../types.js';
/** D1 migration for authoritative settings and the atomic actor permission-generation fence. */
export const managementSchemaSql = `
CREATE TABLE IF NOT EXISTS sitekit_management_settings (
 tenant_id TEXT NOT NULL, site_id TEXT NOT NULL, version TEXT NOT NULL,
 epoch TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(tenant_id,site_id)
);
CREATE TABLE IF NOT EXISTS sitekit_management_admission (
 tenant_id TEXT NOT NULL, site_id TEXT NOT NULL, subject TEXT NOT NULL,
 version TEXT NOT NULL, allowed INTEGER NOT NULL CHECK(allowed IN (0,1)),
 PRIMARY KEY(tenant_id,site_id,subject)
);`;
function changed(value:unknown):boolean {
 const count=(value as {meta?:{changes?:unknown}})?.meta?.changes;
 if(typeof count!=='number' || ![0,1].includes(count)) throw new ManagementFault('unavailable');
 return count===1;
}
/**
 * Creates an actor-bound authoritative store. Admission rows must advance with every ACL change.
 * @param db - Provisioned D1 database.
 * @param subject - Verified server-side actor identity, not browser JSON.
 * @returns Store using one SQL statement to fence versions, authority and live permission generation.
 * @example
 * import { createD1ManagementSettingsStore } from '@alneas/sitekit-cloudflare/management';
 * import type { CloudflareD1Database } from '@alneas/sitekit-cloudflare';
 * export const store = (db: CloudflareD1Database) => createD1ManagementSettingsStore(db, 'verified-subject');
 */
export function createD1ManagementSettingsStore(db:CloudflareD1Database,subject:string):ManagementSettingsStore {
 if(!subject || subject.length>160) throw new ManagementFault('invalid');
 return {
  async read(scope:ManagementScope) {
   const row=await db.prepare('SELECT payload FROM sitekit_management_settings WHERE tenant_id=? AND site_id=?').bind(scope.tenantId,scope.siteId).first<{payload:string}>();
   if(!row) return null;
   try { return JSON.parse(row.payload) as SettingsRecord; } catch { throw new ManagementFault('unavailable'); }
  },
  async compareAndSwap(input) {
   const {scope,next}=input;
   const snapshot=parseSettingsSnapshot(next.snapshot);
   if(snapshot.scope.tenantId!==scope.tenantId || snapshot.scope.siteId!==scope.siteId) throw new ManagementFault('forbidden');
   return changed(await db.prepare(`UPDATE sitekit_management_settings SET version=?,epoch=?,payload=?
    WHERE tenant_id=? AND site_id=? AND version=? AND epoch=?
    AND EXISTS(SELECT 1 FROM sitekit_management_admission a WHERE a.tenant_id=? AND a.site_id=? AND a.subject=? AND a.version=? AND a.allowed=1)`)
    .bind(snapshot.version,snapshot.authority.epoch,JSON.stringify(next),scope.tenantId,scope.siteId,input.expectedVersion,input.expectedAuthorityEpoch,scope.tenantId,scope.siteId,subject,input.expectedPermissionVersion).run());
  },
 };
}
/**
 * Inserts a new unprovisioned record without replacing existing settings. This is a trusted setup action.
 * @param db - Provisioned D1 database.
 * @param record - Validated initial record from createSettingsRecord, never request JSON.
 * @returns True only for first initialization; an existing site is preserved.
 * @example
 * import { initializeD1ManagementSettings } from '@alneas/sitekit-cloudflare/management';
 * import type { CloudflareD1Database } from '@alneas/sitekit-cloudflare';
 * import type { SettingsRecord } from '@alneas/sitekit/management';
 * export const initialize = (db: CloudflareD1Database, record: SettingsRecord) => initializeD1ManagementSettings(db, record);
 */
export async function initializeD1ManagementSettings(db:CloudflareD1Database,record:SettingsRecord):Promise<boolean> {
 const s=parseSettingsSnapshot(record.snapshot);
 if(record.commands.length || record.applications.length || Object.values(s.sections).some(section=>section.effective || section.application)) throw new ManagementFault('invalid');
 return changed(await db.prepare('INSERT INTO sitekit_management_settings(tenant_id,site_id,version,epoch,payload) VALUES(?,?,?,?,?) ON CONFLICT(tenant_id,site_id) DO NOTHING').bind(s.scope.tenantId,s.scope.siteId,s.version,s.authority.epoch,JSON.stringify(record)).run());
}
