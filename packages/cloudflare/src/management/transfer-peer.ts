import { ManagementFault, parseSettingsRecord, parseConsoleAccounts, parseConsoleJob } from '@alneas/sitekit/management';
import type { AuthorityOwner, ManagementScope, TransferInventory, TransferManifest, AuthorityTransferPeer } from '@alneas/sitekit/management';
import type { SecretBox, SealedSecret } from '../standalone/social/types.js';
/** One server-only migration record; pages never pass through browser DTOs. */
export interface SiteTransferItem {
  /** Canonical record kind or verified principal category. */

  kind: string;
  /** Stable canonical record key. */

  key: string;
  /** Validated canonical value; server records may contain encrypted envelopes. */

  value: unknown
}
/** Host-persisted encrypted archive operations; write is idempotent unless replace is explicit. */
export interface SiteTransferArchive {
  /**
     * Runs the scoped server operation under its durable authority fence.
     * @param id - Durable identity retained across retries.
     * @param key - Stable canonical record key.
     * @returns Authoritative result; invalid, stale or unavailable state fails closed.
     * @example import type {SiteTransferArchive} from '@alneas/sitekit-cloudflare/management';
     * export const invoke = (operation:NonNullable<SiteTransferArchive>['read'],...args:Parameters<NonNullable<SiteTransferArchive>['read']>) => operation(...args);
     */

  read(id: string, key: string): Promise<unknown | null>;
  /**
     * Runs the scoped server operation under its durable authority fence.
     * @param id - Durable identity retained across retries.
     * @param key - Stable canonical record key.
     * @param value - Validated canonical value; server records may contain encrypted envelopes.
     * @param replace - Verified operation input.
     * @returns Authoritative result; invalid, stale or unavailable state fails closed.
     * @example import type {SiteTransferArchive} from '@alneas/sitekit-cloudflare/management';
     * export const invoke = (operation:NonNullable<SiteTransferArchive>['write'],...args:Parameters<NonNullable<SiteTransferArchive>['write']>) => operation(...args);
     */

  write(id: string, key: string, value: unknown, replace?: boolean): Promise<unknown>
}
/** Native business-state ports, invoked only after the stable authority closes/drains operations. */
export interface SiteTransferData {

  /**
     * Runs the scoped server operation under its durable authority fence.
     * @returns Authoritative result; invalid, stale or unavailable state fails closed.
     * @example import type {SiteTransferData} from '@alneas/sitekit-cloudflare/management';
     * export const invoke = (operation:NonNullable<SiteTransferData>['read'],...args:Parameters<NonNullable<SiteTransferData>['read']>) => operation(...args);
     */

  read(): Promise<SiteTransferItem[] | null>;

  /**
     * Runs the scoped server operation under its durable authority fence.
     * @param transferId - Stable handoff identity, or null when no plan exists.
     * @param source - Verified operation input.
     * @returns Authoritative result; invalid, stale or unavailable state fails closed.
     * @example import type {SiteTransferData} from '@alneas/sitekit-cloudflare/management';
     * export const invoke = (operation:NonNullable<SiteTransferData>['pause'],...args:Parameters<NonNullable<SiteTransferData>['pause']>) => operation(...args);
     */

  pause(transferId: string, source: SiteTransferItem[]): Promise<void>;

  /**
     * Runs the scoped server operation under its durable authority fence.
     * @param transferId - Stable handoff identity, or null when no plan exists.
     * @param items - Verified operation input.
     * @param epoch - Opaque execution generation; previous generations cannot dispatch.
     * @returns Authoritative result; invalid, stale or unavailable state fails closed.
     * @example import type {SiteTransferData} from '@alneas/sitekit-cloudflare/management';
     * export const invoke = (operation:NonNullable<SiteTransferData>['activate'],...args:Parameters<NonNullable<SiteTransferData>['activate']>) => operation(...args);
     */

  activate(transferId: string, items: SiteTransferItem[], epoch: string): Promise<void>;
}
/** Trusted transfer peer; target credential encryption uses an authenticated server channel. */
export interface SiteTransferPeerOptions {

  /** Immutable server-verified tenant and site. */

  scope: ManagementScope;
  /** Exclusive configured execution owner. */

  owner: AuthorityOwner;
  /** Server-only authenticated encryption key ring. */

  secrets: SecretBox;
  /** Durable encrypted server-only snapshot storage. */

  archive: SiteTransferArchive;
  /** Transactional native business-state adapter. */

  data: SiteTransferData;

  /**
     * Runs the scoped server operation under its durable authority fence.
     * @returns Authoritative result; invalid, stale or unavailable state fails closed.
     * @example import type {SiteTransferPeerOptions} from '@alneas/sitekit-cloudflare/management';
     * export const invoke = (operation:NonNullable<SiteTransferPeerOptions>['control'],...args:Parameters<NonNullable<SiteTransferPeerOptions>['control']>) => operation(...args);
     */

  control(): Promise<{
    /** Exclusive configured execution owner. */

    owner: AuthorityOwner;
    /** Opaque execution generation; previous generations cannot dispatch. */

    epoch: string;
    /** Durable handoff phase; failure resumes this phase. */

    phase: string;
    /** Stable handoff identity, or null when no plan exists. */

    transferId: string | null
  }>;

  /**
     * Runs the scoped server operation under its durable authority fence.
     * @param token - Verified operation input.
     * @param context - Verified operation input.
     * @returns Authoritative result; invalid, stale or unavailable state fails closed.
     * @example import type {SiteTransferPeerOptions} from '@alneas/sitekit-cloudflare/management';
     * export const invoke = (operation:NonNullable<SiteTransferPeerOptions>['sealTarget'],...args:Parameters<NonNullable<SiteTransferPeerOptions>['sealTarget']>) => operation(...args);
     */

  sealTarget(token: string, context: string): Promise<SealedSecret>;

  /**
     * Trusted UTC server clock.
     * @returns Authoritative result; invalid, stale or unavailable state fails closed.
     * @example import type {SiteTransferPeerOptions} from '@alneas/sitekit-cloudflare/management';
     * export const invoke = (operation:NonNullable<SiteTransferPeerOptions['now']>,...args:Parameters<NonNullable<SiteTransferPeerOptions['now']>>) => operation(...args);
     */

  now?: () => Date;
}
type Data = Record<string, any>;
const fail = (code: 'invalid' | 'conflict' | 'unavailable' | 'capacity'): never => { throw new ManagementFault(code) };
const canonical = (v: any): any => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
const stringify = (v: unknown) => JSON.stringify(canonical(v));
const hash = async (v: unknown) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stringify(v)))), v => v.toString(16).padStart(2, '0')).join('');
function semantic(items: SiteTransferItem[], inventory = false) {
  return items.map(item => {
    const clone = structuredClone(item) as SiteTransferItem & {
      /** Validated canonical value; server records may contain encrypted envelopes. */

      value: Data
    };
    if (clone.kind === 'account') clone.value.secret = null;
    if (inventory && clone.kind === 'settings') { delete clone.value.snapshot.version; delete clone.value.snapshot.authority.status; }
    return clone;
  })
}
function pages(items: SiteTransferItem[]) {
  const result: SiteTransferItem[][] = []; let batch: SiteTransferItem[] = [];
  for (const item of items) { if (new TextEncoder().encode(stringify(item)).byteLength > 90 * 1024) fail('capacity'); const next = [...batch, item]; if (batch.length && (next.length > 100 || new TextEncoder().encode(stringify(next)).byteLength > 96 * 1024)) { result.push(batch); batch = [] } batch.push(item) } if (batch.length) result.push(batch); return result;
}
/**
 * Server-only normalized item validation, including credential envelopes and immutable settings history.
 * @param input - Verified operation input.
 * @param scope - Immutable server-verified tenant and site.
 * @returns Authoritative result; invalid, stale or unavailable state fails closed.
 * @example import {parseSiteTransferItems} from '@alneas/sitekit-cloudflare/management';
 * export const invoke = (operation:typeof parseSiteTransferItems,...args:Parameters<typeof parseSiteTransferItems>) => operation(...args);
 */
export function parseSiteTransferItems(input: unknown, scope: ManagementScope): SiteTransferItem[] {
  if (!Array.isArray(input) || input.length > 50000 || new TextEncoder().encode(stringify(input)).byteLength > 8 * 1024 * 1024) fail('capacity');
  const result = structuredClone(input) as SiteTransferItem[], keys = new Set<string>(); let roots = 0;
  for (const item of result) {
    if (!item || !/^[a-z][a-z-]{0,40}$/.test(item.kind) || typeof item.key !== 'string' || !item.key || item.key.length > 240 || keys.has(item.kind + ':' + item.key)) fail('invalid'); keys.add(item.kind + ':' + item.key);
    const v = item.value as Data;
    if (item.kind === 'settings') { if (item.key !== 'root' || ++roots !== 1) fail('invalid'); item.value = parseSettingsRecord(v, scope) }
    if (item.kind === 'account') { parseConsoleAccounts([v.view]); if (typeof v.externalId !== 'string' || !v.externalId) fail('invalid'); if (v.secret && (!v.secret.keyId || !v.secret.iv || !v.secret.ciphertext)) fail('invalid'); if (v.view.status === 'connected' && !v.secret) fail('conflict') }
    if (item.kind === 'job') { parseConsoleJob(v.view); if (typeof v.requestKey !== 'string' || typeof v.fingerprint !== 'string') fail('invalid') }
    if (['measurement', 'revocation'].includes(item.kind) && (v.tenant_id !== scope.tenantId || v.site_id !== scope.siteId)) fail('conflict');
  }
  if (roots !== 1) fail('invalid'); return result.sort((a, b) => (a.kind + ':' + a.key).localeCompare(b.kind + ':' + b.key, 'en'));
}
/**
 * Creates resumable paged staging and exact owner/epoch activation, with server-only credential re-encryption.
 * Backend pause/activate must be transactional and idempotent by transfer identity.
 * @param o - Verified operation input.
 * @returns Authoritative result; invalid, stale or unavailable state fails closed.
 * @example import {createSiteTransferPeer} from '@alneas/sitekit-cloudflare/management';
 * export const invoke = (operation:typeof createSiteTransferPeer,...args:Parameters<typeof createSiteTransferPeer>) => operation(...args);
 */
export function createSiteTransferPeer(o: SiteTransferPeerOptions): AuthorityTransferPeer {
  const aad = (id: string) => JSON.stringify([o.scope.tenantId, o.scope.siteId, id]);
  const read = async () => { const raw = await o.data.read(); return raw ? parseSiteTransferItems(raw, o.scope) : null };
  async function prepared(items: SiteTransferItem[]) { const result = structuredClone(items); for (const item of result) if (item.kind === 'account') { const a = item.value as Data; a.credentialHash = a.secret ? await hash(await o.secrets.open(a.secret, aad(a.view.id))) : null } return result }
  async function inventory(): Promise<TransferInventory> {
    const items = await read(); if (!items) fail('unavailable'); const normalized = await prepared(items!); const root = normalized.find(i => i.kind === 'settings')!.value as Data;
    return { revision: await hash(semantic(normalized, true)), identity: root.snapshot.sections.site.saved.value.url, blocked: root.snapshot.authority.status !== 'active' || root.applications.some((a: Data) => a.view.status === 'applying') || normalized.some(i => i.kind === 'job' && ['publishing', 'unknown'].includes((i.value as Data).view.status)) };
  }
  async function persist(id: string, key: string, value: unknown, replace = false) { const old = await o.archive.read(id, key); if (old !== null && !replace) { if (Array.isArray(old) && Array.isArray(value)) { if (stringify(semantic(old)) !== stringify(semantic(value))) fail('conflict') } else if (stringify(old) !== stringify(value)) fail('conflict'); return old } return o.archive.write(id, key, value, replace) }
  async function loadPages(id: string, prefix: string, count: number) { const result: SiteTransferItem[] = []; for (let i = 0; i < count; i++) { const page = await o.archive.read(id, prefix + i); if (!Array.isArray(page)) fail('unavailable'); result.push(...page as SiteTransferItem[]) } return result }
  return {
    inspect: inventory,
    async preflight(_id, source) {
      const items = await read(); if (!items) { await persist(_id, 'target-baseline', { revision: null }); return } const current = await inventory(), root = items.find(i => i.kind === 'settings')!.value as Data; const recovery = await o.archive.read('site', 'recovery') as Data | null;
      if (source.identity !== root.snapshot.sections.site.saved.value.url) fail('conflict');
      if (root.snapshot.authority.status !== 'active' && recovery?.sourceRevision === current.revision) { await persist(_id, 'target-baseline', { revision: current.revision }); return; }
      fail('conflict');
    },
    async freeze(id, expectedSourceRevision) {
      const existing = await o.archive.read(id, 'manifest') as TransferManifest | null; if (existing) { if (existing.sourceRevision !== expectedSourceRevision) fail('conflict'); return existing }
      let rawMeta = await o.archive.read(id, 'raw') as Data | null; let captured: SiteTransferItem[];
      if (rawMeta) { if (rawMeta.sourceRevision !== expectedSourceRevision) fail('conflict'); captured = await loadPages(id, 'raw-page-', rawMeta.pages) } else {
        const items = await read(); if (!items) fail('unavailable'); captured = await prepared(items!); const current = await inventory(); if (current.revision !== expectedSourceRevision || current.blocked) fail('conflict'); const chunks = pages(captured); for (let i = 0; i < chunks.length; i++)await persist(id, 'raw-page-' + i, chunks[i]); rawMeta = { sourceRevision: expectedSourceRevision, pages: chunks.length }; await persist(id, 'raw', rawMeta);
      }
      await o.data.pause(id, captured);
      await persist('site', 'recovery', { transferId: id, sourceRevision: expectedSourceRevision }, true);
      const exported = structuredClone(captured); for (const item of exported) if (item.kind === 'account') { const a = item.value as Data; if (a.secret) a.secret = await o.sealTarget(await o.secrets.open(a.secret, aad(a.view.id)), aad(a.view.id)) }
      const chunks = pages(exported); for (let i = 0; i < chunks.length; i++)await persist(id, 'page-' + i, chunks[i]);
      const manifest = { hash: await hash(semantic(exported)), sourceRevision: expectedSourceRevision, cutoff: (o.now?.() ?? new Date()).toISOString(), counts: exported.reduce((a, i) => (a[i.kind] = (a[i.kind] ?? 0) + 1, a), {} as Record<string, number>) }; await persist(id, 'pages', chunks.length); await persist(id, 'manifest', manifest); return manifest;
    },
    async page(id, cursor) { const count = await o.archive.read(id, 'pages'); if (typeof count !== 'number') return fail('unavailable'); const index = cursor === null ? 0 : Number(cursor); if (!Number.isInteger(index) || index < 0 || index >= count) fail('invalid'); const items = await o.archive.read(id, 'page-' + index); if (!Array.isArray(items)) fail('unavailable'); return { items: items as unknown[], next: index + 1 < count ? String(index + 1) : null } },
    async import(id, manifest, page) {
      const old = await o.archive.read(id, 'ready') as Data | null; if (old) { if (old.hash !== manifest.hash) fail('conflict'); return { id: old.id, hash: old.hash } }
      const items: SiteTransferItem[] = []; let cursor: string | null = null; const seen = new Set<string>(); for (let i = 0; i < 1000; i++) { const key = cursor ?? 'first'; if (seen.has(key)) fail('conflict'); seen.add(key); const p = await page(cursor); if (!Array.isArray(p.items) || new TextEncoder().encode(stringify(p.items)).byteLength > 128 * 1024) fail('capacity'); items.push(...p.items as SiteTransferItem[]); if (items.length > 50000) fail('capacity'); cursor = p.next; if (cursor === null) break; if (i === 999) fail('capacity') }
      const parsed = parseSiteTransferItems(items, o.scope); if (await hash(semantic(parsed)) !== manifest.hash) fail('conflict');
      const counts = parsed.reduce((a, i) => (a[i.kind] = (a[i.kind] ?? 0) + 1, a), {} as Record<string, number>); if (stringify(counts) !== stringify(manifest.counts)) fail('conflict');
      for (const item of parsed) if (item.kind === 'account') { const a = item.value as Data; const digest = a.secret ? await hash(await o.secrets.open(a.secret, aad(a.view.id))) : null; if (digest !== a.credentialHash) fail('conflict') }
      const chunks = pages(parsed); for (let i = 0; i < chunks.length; i++)await persist(id, 'staged-' + i, chunks[i]); const ready = { id: crypto.randomUUID(), hash: manifest.hash, pages: chunks.length, phase: 'ready' }; const durable=await o.archive.write(id,'ready',ready) as Data;if(!durable||durable.hash!==manifest.hash||durable.pages!==chunks.length||typeof durable.id!=='string'||!['ready','active'].includes(durable.phase))fail('conflict');return {id:durable.id,hash:durable.hash};
    },
    async activate(id, epoch, receipt) {
      const ready = await o.archive.read(id, 'ready') as Data | null; if (!ready || ready.id !== receipt) return fail('conflict'); if (ready.phase === 'active') { if (ready.epoch !== epoch) fail('conflict'); return }
      const control = await o.control(); if (control.owner !== o.owner || control.epoch !== epoch || control.transferId !== id || !['activating', 'complete'].includes(control.phase)) fail('conflict');
      const baseline = await o.archive.read(id, 'target-baseline') as Data | null; if (!baseline) fail('conflict');
      const before = await read(), currentRoot = before?.find(i => i.kind === 'settings')?.value as Data | undefined;
      const alreadyActivated = currentRoot?.snapshot.authority.kind === o.owner && currentRoot?.snapshot.authority.epoch === epoch && currentRoot?.snapshot.authority.status === 'active';
      if (!alreadyActivated) { const revision = before ? (await inventory()).revision : null; if (revision !== baseline!.revision) fail('conflict') }
      const items = parseSiteTransferItems(await loadPages(id, 'staged-', ready.pages), o.scope); const root = items.find(i => i.kind === 'settings')!.value as Data; root.snapshot.authority = { kind: o.owner, epoch, status: 'active' }; root.snapshot.version = crypto.randomUUID(); parseSettingsRecord(root, o.scope);
      for (const item of items) if (item.kind === 'account') delete (item.value as Data).credentialHash;
      await o.data.activate(id, items, epoch); await persist(id, 'ready', { ...ready, phase: 'active', epoch }, true);
    },
  };
}
