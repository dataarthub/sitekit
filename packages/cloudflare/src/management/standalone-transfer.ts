import { ManagementFault, parseSettingsRecord } from '@alneas/sitekit/management';
import type { ManagementScope } from '@alneas/sitekit/management';
import type { MarketingDatabase, MarketingStatement } from '../marketing/types.js';
import type { SocialState } from '../standalone/social/types.js';
import { parseSiteTransferItems, type SiteTransferData, type SiteTransferItem } from './transfer-peer.js';
/** Durable business-side pause and activation receipts, coverage and retained foreign provenance. */
export const transferBusinessSchemaSql = `CREATE TABLE IF NOT EXISTS sitekit_transfer_business(
 tenant_id TEXT NOT NULL,site_id TEXT NOT NULL,id TEXT NOT NULL,phase TEXT NOT NULL,epoch TEXT,payload TEXT NOT NULL,PRIMARY KEY(tenant_id,site_id,id,phase));
CREATE TABLE IF NOT EXISTS sitekit_transfer_coverage(tenant_id TEXT NOT NULL,site_id TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(tenant_id,site_id));
CREATE TABLE IF NOT EXISTS sitekit_transfer_history(tenant_id TEXT NOT NULL,site_id TEXT NOT NULL,kind TEXT NOT NULL,item_key TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(tenant_id,site_id,kind,item_key));`;
type Row = Record<string, any>;
const recordColumns = ['tenant_id', 'site_id', 'kind', 'record_id', 'fingerprint', 'write_id', 'occurred_at', 'attribution_id', 'event_name', 'outcome_kind', 'source', 'medium', 'campaign', 'amount_minor', 'currency'];
/**
 * Adapts real standalone D1 state to the server-only canonical transfer protocol.
 * @param o - Verified operation input.
 * @returns Authoritative result; invalid, stale or unavailable state fails closed.
 * @example import {createStandaloneTransferData} from '@alneas/sitekit-cloudflare/management';
 * export const invoke = (operation:typeof createStandaloneTransferData,...args:Parameters<typeof createStandaloneTransferData>) => operation(...args);
 */
export function createStandaloneTransferData(o: {
  /** Operator-provisioned transactional D1 binding. */

  database: MarketingDatabase;
  /** Immutable server-verified tenant and site. */

  scope: ManagementScope;
  /** Original UTC collection start, preserved across migration. */

  startedAt: string
}): SiteTransferData {
  const db = o.database, s = Object.freeze({ ...o.scope }), args = [s.tenantId, s.siteId];
  const all = async (table: string) => (await db.prepare(`SELECT * FROM ${table} WHERE tenant_id=? AND site_id=?`).bind(...args).all<Row>()).results;
  const receipt = async (id: string, phase: string) => db.prepare('SELECT epoch,payload FROM sitekit_transfer_business WHERE tenant_id=? AND site_id=? AND id=? AND phase=?').bind(...args, id, phase).first<{
    /** Opaque execution generation; previous generations cannot dispatch. */

    epoch: string | null;
    /** Trusted server-supplied operation value. */

    payload: string
  }>();
  const current = async () => {
    const r = await db.prepare('SELECT payload FROM sitekit_management_settings WHERE tenant_id=? AND site_id=?').bind(...args).first<{
      /** Trusted server-supplied operation value. */

      payload: string
    }>(); return r ? parseSettingsRecord(JSON.parse(r.payload), s) : null
  };
  const assertion = (condition: string, values: unknown[]) => db.prepare(`SELECT CASE WHEN (${condition}) THEN 1 ELSE json('sitekit_transfer_conflict') END AS admitted`).bind(...values);
  const insert = (table: string, columns: string[], row: Row) => db.prepare(`INSERT INTO ${table}(${columns.join(',')}) VALUES(${columns.map(() => '?').join(',')})`).bind(...columns.map(c => row[c] ?? null));
  const data: SiteTransferData = {
    async read() {
      const root = await current(); if (!root) return null; const items: SiteTransferItem[] = [{ kind: 'settings', key: 'root', value: root }];
      const social = await db.prepare('SELECT payload FROM sitekit_social_state WHERE tenant_id=? AND site_id=?').bind(...args).first<{
        /** Trusted server-supplied operation value. */

        payload: string
      }>();
      if (social) {
        const state = JSON.parse(social.payload) as SocialState; if (state.tenantId !== s.tenantId || state.siteId !== s.siteId || state.schemaVersion !== 1) throw new ManagementFault('unavailable');
        // OAuth handshakes are bound to a host session and cannot cross a cutover.
        if (state.oauth.some(n => Date.parse(n.expiresAt) > Date.now())) throw new ManagementFault('conflict');
        for (const account of state.accounts) items.push({ kind: 'account', key: account.view.id, value: account }); for (const job of state.jobs) items.push({ kind: 'job', key: job.view.id, value: job }); for (const p of state.publications) items.push({ kind: 'publication', key: p.key, value: p });
      }
      for (const row of await all('sitekit_marketing_records')) items.push({ kind: 'measurement', key: JSON.stringify([row.kind, row.record_id]), value: row });
      for (const row of await all('sitekit_marketing_revocations')) items.push({ kind: 'revocation', key: row.reference_hash, value: row });
      for (const row of await all('sitekit_standalone_effects')) items.push({ kind: 'standalone-effect', key: row.application_id, value: row });
      const coverage = await db.prepare('SELECT payload FROM sitekit_transfer_coverage WHERE tenant_id=? AND site_id=?').bind(...args).first<{
        /** Trusted server-supplied operation value. */

        payload: string
      }>(); items.push({ kind: 'coverage', key: 'collection', value: coverage ? JSON.parse(coverage.payload) : { startedAt: o.startedAt } });
      for (const row of await all('sitekit_transfer_history')) items.push({ kind: row.kind, key: row.item_key, value: JSON.parse(row.payload) });
      return parseSiteTransferItems(items, s);
    },
    async pause(id, input) {
      const items = parseSiteTransferItems(input, s), root = parseSettingsRecord(items.find(i => i.kind === 'settings')!.value, s), old = await receipt(id, 'paused');
      if (old) { if (old.payload !== root.snapshot.version) throw new ManagementFault('conflict'); return }
      const next = structuredClone(root); next.snapshot.authority.status = 'paused'; next.snapshot.version = crypto.randomUUID();
      try {
        await db.batch([
          assertion("EXISTS(SELECT 1 FROM sitekit_management_settings WHERE tenant_id=? AND site_id=? AND version=? AND epoch=? AND json_extract(payload,'$.snapshot.authority.status')='active')", [...args, root.snapshot.version, root.snapshot.authority.epoch]),
          db.prepare('UPDATE sitekit_management_settings SET version=?,payload=? WHERE tenant_id=? AND site_id=?').bind(next.snapshot.version, JSON.stringify(next), ...args),
          db.prepare('INSERT INTO sitekit_transfer_business VALUES(?,?,?,?,?,?)').bind(...args, id, 'paused', root.snapshot.authority.epoch, root.snapshot.version),
        ])
      } catch { throw new ManagementFault('conflict') }
    },
    async activate(id, input, epoch) {
      const old = await receipt(id, 'active'); if (old) { if (old.epoch !== epoch) throw new ManagementFault('conflict'); return }
      const items = parseSiteTransferItems(input, s), root = parseSettingsRecord(items.find(i => i.kind === 'settings')!.value, s);
      if (root.snapshot.authority.kind !== 'standalone' || root.snapshot.authority.status !== 'active' || root.snapshot.authority.epoch !== epoch || root.applications.some(a => a.view.status === 'applying')) throw new ManagementFault('conflict');
      const prior = await current(); if (prior && prior.snapshot.authority.status !== 'paused') throw new ManagementFault('conflict');
      if (prior) { const paused = await db.prepare("SELECT id FROM sitekit_transfer_business WHERE tenant_id=? AND site_id=? AND phase='paused' AND epoch=?").bind(...args, prior.snapshot.authority.epoch).first(); if (!paused) throw new ManagementFault('conflict') }
      const jobs = items.filter(i => i.kind === 'job').map(i => i.value as SocialState['jobs'][number]); if (jobs.some(j => ['publishing', 'unknown'].includes(j.view.status))) throw new ManagementFault('conflict');
      const state: SocialState = { schemaVersion: 1, ...s, accounts: items.filter(i => i.kind === 'account').map(i => i.value as SocialState['accounts'][number]), jobs, publications: items.filter(i => i.kind === 'publication').map(i => i.value as SocialState['publications'][number]), oauth: [] };
      const statements: MarketingStatement[] = [prior ? assertion('EXISTS(SELECT 1 FROM sitekit_management_settings WHERE tenant_id=? AND site_id=? AND version=? AND epoch=?)', [...args, prior.snapshot.version, prior.snapshot.authority.epoch]) : assertion('NOT EXISTS(SELECT 1 FROM sitekit_management_settings WHERE tenant_id=? AND site_id=?)', args)];
      for (const table of ['sitekit_management_settings', 'sitekit_social_state', 'sitekit_marketing_records', 'sitekit_marketing_revocations', 'sitekit_standalone_effects', 'sitekit_standalone_runtime', 'sitekit_transfer_coverage', 'sitekit_transfer_history']) statements.push(db.prepare(`DELETE FROM ${table} WHERE tenant_id=? AND site_id=?`).bind(...args));
      statements.push(db.prepare('INSERT INTO sitekit_management_settings VALUES(?,?,?,?,?)').bind(...args, root.snapshot.version, epoch, JSON.stringify(root)), db.prepare('INSERT INTO sitekit_social_state VALUES(?,?,?,?)').bind(...args, 1, JSON.stringify(state)));
      for (const [section, value] of Object.entries(root.snapshot.sections)) if (value.effective) statements.push(db.prepare('INSERT INTO sitekit_standalone_runtime VALUES(?,?,?,?,?)').bind(...args, section, value.application?.id ?? 'transfer:' + id, JSON.stringify(value.effective.value)));
      for (const item of items) {
        const v = item.value as Row;
        if (item.kind === 'measurement') statements.push(insert('sitekit_marketing_records', recordColumns, v));
        else if (item.kind === 'revocation') statements.push(insert('sitekit_marketing_revocations', ['tenant_id', 'site_id', 'reference_hash', 'forgotten_at'], v));
        else if (item.kind === 'standalone-effect') { if (v.tenant_id !== s.tenantId || v.site_id !== s.siteId) throw new ManagementFault('conflict'); statements.push(insert('sitekit_standalone_effects', ['tenant_id', 'site_id', 'application_id', 'receipt_id', 'section', 'saved_revision', 'epoch', 'status', 'value', 'applied_at'], v)) }
        else if (item.kind === 'coverage') { if (item.key !== 'collection' || !Number.isFinite(Date.parse(v.startedAt))) throw new ManagementFault('invalid'); statements.push(db.prepare('INSERT INTO sitekit_transfer_coverage VALUES(?,?,?)').bind(...args, JSON.stringify(v))) }
        else if (!['settings', 'account', 'job', 'publication'].includes(item.kind)) statements.push(db.prepare('INSERT INTO sitekit_transfer_history VALUES(?,?,?,?,?)').bind(...args, item.kind, item.key, JSON.stringify(v)));
      }
      statements.push(db.prepare('INSERT INTO sitekit_transfer_business VALUES(?,?,?,?,?,?)').bind(...args, id, 'active', epoch, root.snapshot.version));
      try { await db.batch(statements) } catch { throw new ManagementFault('conflict') }
    },
  }; return data;
}
