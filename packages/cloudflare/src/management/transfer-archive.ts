import { ManagementFault } from '@alneas/sitekit/management';
import type { ManagementScope, AuthorityOwner } from '@alneas/sitekit/management';
import type { MarketingDatabase } from '../marketing/types.js';
import type { SecretBox, SealedSecret } from '../standalone/social/types.js';
import type { SiteTransferArchive } from './transfer-peer.js';
/**
 * Creates a durable server-only encrypted archive. No credential or page is stored as plaintext.
 * @param o - Verified operation input.
 * @returns Authoritative result; invalid, stale or unavailable state fails closed.
 * @example import {createD1TransferArchive} from '@alneas/sitekit-cloudflare/management';
 * export const invoke = (operation:typeof createD1TransferArchive,...args:Parameters<typeof createD1TransferArchive>) => operation(...args);
 */
export function createD1TransferArchive(o: {
  /** Operator-provisioned transactional D1 binding. */

  database: MarketingDatabase;
  /** Immutable server-verified tenant and site. */

  scope: ManagementScope;
  /** Exclusive configured execution owner. */

  owner: AuthorityOwner;
  /** Server-only authenticated encryption key ring. */

  secrets: SecretBox
}): SiteTransferArchive {
  const s = Object.freeze({ ...o.scope }), db = o.database;
  const context = (id: string, key: string) => JSON.stringify([s.tenantId, s.siteId, o.owner, id, key]);
  const read = async (id: string, key: string) => {
    const row = await db.prepare('SELECT payload FROM sitekit_transfer_snapshots WHERE tenant_id=? AND site_id=? AND id=? AND kind=?').bind(s.tenantId, s.siteId, id, key).first<{
      /** Trusted server-supplied operation value. */

      payload: string
    }>();
    if (!row) return null;
    try { return JSON.parse(await o.secrets.open(JSON.parse(row.payload) as SealedSecret, context(id, key))) as unknown } catch { throw new ManagementFault('unavailable') }
  };
  return {
    read, async write(id, key, value, replace = false) {
      if (!id || id.length > 160 || !key || key.length > 160) throw new ManagementFault('invalid');
      const clear = JSON.stringify(value); if (!clear || new TextEncoder().encode(clear).byteLength > 256 * 1024) throw new ManagementFault('capacity');
      const payload = JSON.stringify(await o.secrets.seal(clear, context(id, key)));
      const sql = replace ? 'INSERT INTO sitekit_transfer_snapshots(tenant_id,site_id,id,kind,hash,payload) VALUES(?,?,?,?,?,?) ON CONFLICT(tenant_id,site_id,id,kind) DO UPDATE SET payload=excluded.payload,hash=excluded.hash' : 'INSERT INTO sitekit_transfer_snapshots(tenant_id,site_id,id,kind,hash,payload) VALUES(?,?,?,?,?,?) ON CONFLICT DO NOTHING';
      await db.prepare(sql).bind(s.tenantId, s.siteId, id, key, 'encrypted-v1', payload).run(); return read(id, key);
    }
  };
}
