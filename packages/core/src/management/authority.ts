import { z } from 'zod';
import { ManagementFault } from './errors.js';
import type { ManagementScope } from './contracts.js';
import type { SettingsAdmission } from './settings.js';
/** Exclusive site execution owner. */
export type AuthorityOwner = 'standalone' | 'eaos';
/** Credential-free transfer manifest; actual pages travel only between trusted server peers. */
export interface TransferManifest {
  /** Canonical content digest, excluding randomized credential ciphertext. */

  hash: string;
  /** Exact frozen source inventory fingerprint. */

  sourceRevision: string;
  /** UTC snapshot capture time. */

  cutoff: string;
  /** Record counts by canonical kind. */

  counts: Record<string, number>
}
/** Native source inventory used to reject changed or uncertain transfers. */
export interface TransferInventory {
  /** Immutable source inventory fingerprint. */

  revision: string;
  /** Canonical site identity used to reject unrelated destinations. */

  identity: string;
  /** True when uncertainty or unfinished application prevents freezing. */

  blocked: boolean
}
/** Durable operation admission; unresolved records never expire into a new owner's permission. */
export interface AuthorityPermit {
  /** Durable identity retained across retries. */

  id: string;
  /** Opaque optimistic-concurrency version. */

  version: string;
  /** Exclusive configured execution owner. */

  owner: AuthorityOwner;
  /** Opaque execution generation; previous generations cannot dispatch. */

  epoch: string;
  /** Server-authorized operation identity. */

  operation: string;
  /** Immutable operation-input identity; changed replays conflict. */

  fingerprint: string;
  /** Persisted lifecycle or effect outcome. */

  status: 'open' | 'unknown' | 'completed' | 'not-executed';
  /** Trusted durable evidence for a definitive effect outcome. */

  proof?: string
}
/** Durable control plane. Business settings remain in the active owner's store. */
export interface AuthorityRecord {

  /** Immutable server-verified tenant and site. */

  scope: ManagementScope;
  /** Opaque optimistic-concurrency version. */

  version: string;
  /** Exclusive configured execution owner. */

  owner: AuthorityOwner;
  /** Opaque execution generation; previous generations cannot dispatch. */

  epoch: string;
  /** Monotonically increasing owner generation. */

  generation: number;
  /** Persisted lifecycle or effect outcome. */

  status: 'active' | 'closing' | 'frozen' | 'activating';
  /** Unresolved durable admissions; these never expire into permission to dispatch. */

  openPermits: string[];

  /** Current durable handoff, or null before the first plan. */

  transfer: null | {
    /** Durable identity retained across retries. */

    id: string;
    /** Owner relinquishing execution. */

    from: AuthorityOwner;
    /** Owner receiving execution. */

    to: AuthorityOwner;
    /** Exact frozen source inventory fingerprint. */

    sourceRevision: string;
    /** Canonical site identity used to reject unrelated destinations. */

    identity: string;
    /** Durable handoff phase; failure resumes this phase. */

    phase: 'planned' | 'draining' | 'frozen' | 'ready' | 'activating' | 'complete';
    /** Frozen source content manifest. */

    manifest?: TransferManifest;
    /** Verified destination staging receipt. */

    ready?: {
      /** Durable identity retained across retries. */

      id: string;
      /** Canonical content digest, excluding randomized credential ciphertext. */

      hash: string
    }
  };

  /** Idempotent command identities and their immutable input fingerprints. */

  commands: {
    /** Durable identity retained across retries. */

    id: string;
    /** Immutable operation-input identity; changed replays conflict. */

    fingerprint: string
  }[];
}
/** Atomic control+permit store; permission generation is fenced in the same commit. */
export interface AuthorityStore {

  /**
     * Runs the scoped server operation under its durable authority fence.
     * @returns Authoritative result; invalid, stale or unavailable state fails closed.
     * @example import type {AuthorityStore} from '@alneas/sitekit/management';
     * export const invoke = (operation:NonNullable<AuthorityStore>['read'],...args:Parameters<NonNullable<AuthorityStore>['read']>) => operation(...args);
     */

  read(): Promise<AuthorityRecord | null>;

  /**
     * Runs the scoped server operation under its durable authority fence.
     * @param id - Durable identity retained across retries.
     * @returns Authoritative result; invalid, stale or unavailable state fails closed.
     * @example import type {AuthorityStore} from '@alneas/sitekit/management';
     * export const invoke = (operation:NonNullable<AuthorityStore>['permit'],...args:Parameters<NonNullable<AuthorityStore>['permit']>) => operation(...args);
     */

  permit(id: string): Promise<AuthorityPermit | null>;

  /**
     * Runs the scoped server operation under its durable authority fence.
     * @param input - Verified operation input.
     * @returns Authoritative result; invalid, stale or unavailable state fails closed.
     * @example import type {AuthorityStore} from '@alneas/sitekit/management';
     * export const invoke = (operation:NonNullable<AuthorityStore>['compareAndSwap'],...args:Parameters<NonNullable<AuthorityStore>['compareAndSwap']>) => operation(...args);
     */

  compareAndSwap(input: {
    /** Current optimistic control version. */

    expectedVersion: string;
    /** Live permission generation fenced atomically with the write. */

    expectedPermissionVersion: string;
    /** Complete validated replacement control record. */

    next: AuthorityRecord;
    /** Optional effect admission updated in the same atomic commit. */

    permit?: AuthorityPermit;
    /** Previous permit version, or null for insertion. */

    expectedPermitVersion?: string | null
  }): Promise<boolean>;
}
/** Trusted peer ports must persist idempotent phase receipts and never publish while staging. */
export interface AuthorityTransferPeer {

  /**
     * Runs the scoped server operation under its durable authority fence.
     * @returns Authoritative result; invalid, stale or unavailable state fails closed.
     * @example import type {AuthorityTransferPeer} from '@alneas/sitekit/management';
     * export const invoke = (operation:NonNullable<AuthorityTransferPeer>['inspect'],...args:Parameters<NonNullable<AuthorityTransferPeer>['inspect']>) => operation(...args);
     */

  inspect(): Promise<TransferInventory>;

  /**
     * Runs the scoped server operation under its durable authority fence.
     * @param transferId - Stable handoff identity, or null when no plan exists.
     * @param source - Verified operation input.
     * @returns Authoritative result; invalid, stale or unavailable state fails closed.
     * @example import type {AuthorityTransferPeer} from '@alneas/sitekit/management';
     * export const invoke = (operation:NonNullable<AuthorityTransferPeer>['preflight'],...args:Parameters<NonNullable<AuthorityTransferPeer>['preflight']>) => operation(...args);
     */

  preflight(transferId: string, source: TransferInventory): Promise<void>;

  /**
     * Runs the scoped server operation under its durable authority fence.
     * @param transferId - Stable handoff identity, or null when no plan exists.
     * @param expectedSourceRevision - Verified operation input.
     * @returns Authoritative result; invalid, stale or unavailable state fails closed.
     * @example import type {AuthorityTransferPeer} from '@alneas/sitekit/management';
     * export const invoke = (operation:NonNullable<AuthorityTransferPeer>['freeze'],...args:Parameters<NonNullable<AuthorityTransferPeer>['freeze']>) => operation(...args);
     */

  freeze(transferId: string, expectedSourceRevision: string): Promise<TransferManifest>;

  /**
     * Runs the scoped server operation under its durable authority fence.
     * @param transferId - Stable handoff identity, or null when no plan exists.
     * @param cursor - Verified operation input.
     * @returns Authoritative result; invalid, stale or unavailable state fails closed.
     * @example import type {AuthorityTransferPeer} from '@alneas/sitekit/management';
     * export const invoke = (operation:NonNullable<AuthorityTransferPeer>['page'],...args:Parameters<NonNullable<AuthorityTransferPeer>['page']>) => operation(...args);
     */

  page(transferId: string, cursor: string | null): Promise<{
    /** Trusted server-supplied operation value. */

    items: unknown[];
    /** Complete validated replacement control record. */

    next: string | null
  }>;

  /**
     * Runs the scoped server operation under its durable authority fence.
     * @param transferId - Stable handoff identity, or null when no plan exists.
     * @param manifest - Frozen source content manifest.
     * @param page - Verified operation input.
     * @returns Authoritative result; invalid, stale or unavailable state fails closed.
     * @example import type {AuthorityTransferPeer} from '@alneas/sitekit/management';
     * export const invoke = (operation:NonNullable<AuthorityTransferPeer>['import'],...args:Parameters<NonNullable<AuthorityTransferPeer>['import']>) => operation(...args);
     */

  import(transferId: string, manifest: TransferManifest, page: (cursor: string | null) => Promise<{
    /** Trusted server-supplied operation value. */

    items: unknown[];
    /** Complete validated replacement control record. */

    next: string | null
  }>): Promise<{
    /** Durable identity retained across retries. */

    id: string;
    /** Canonical content digest, excluding randomized credential ciphertext. */

    hash: string
  }>;

  /**
     * Runs the scoped server operation under its durable authority fence.
     * @param transferId - Stable handoff identity, or null when no plan exists.
     * @param epoch - Opaque execution generation; previous generations cannot dispatch.
     * @param readyReceiptId - Verified operation input.
     * @returns Authoritative result; invalid, stale or unavailable state fails closed.
     * @example import type {AuthorityTransferPeer} from '@alneas/sitekit/management';
     * export const invoke = (operation:NonNullable<AuthorityTransferPeer>['activate'],...args:Parameters<NonNullable<AuthorityTransferPeer>['activate']>) => operation(...args);
     */

  activate(transferId: string, epoch: string, readyReceiptId: string): Promise<void>;
}
/** Durable server control surface, separate from browser connection commands. */
export interface AuthorityService extends ConnectionProvider {

  /**
     * Runs the scoped server operation under its durable authority fence.
     * @param idValue - Verified operation input.
     * @returns Authoritative result; invalid, stale or unavailable state fails closed.
     * @example import type {AuthorityService} from '@alneas/sitekit/management';
     * export const invoke = (operation:NonNullable<AuthorityService>['permit'],...args:Parameters<NonNullable<AuthorityService>['permit']>) => operation(...args);
     */
  permit(idValue: string): Promise<AuthorityPermit | null>;

  /**
     * Runs the scoped server operation under its durable authority fence.
     * @param input - Verified operation input.
     * @returns Authoritative result; invalid, stale or unavailable state fails closed.
     * @example import type {AuthorityService} from '@alneas/sitekit/management';
     * export const invoke = (operation:NonNullable<AuthorityService>['issue'],...args:Parameters<NonNullable<AuthorityService>['issue']>) => operation(...args);
     */
  issue(input: {
    /** Durable identity retained across retries. */
    id: string;
    /** Exclusive configured execution owner. */
    owner: AuthorityOwner;
    /** Opaque execution generation; previous generations cannot dispatch. */
    epoch: string;
    /** Server-authorized operation identity. */
    operation: string;
    /** Immutable operation-input identity; changed replays conflict. */
    fingerprint: string
  }): Promise<{
    /** Trusted server-supplied operation value. */
    created: boolean;
    /** Optional effect admission updated in the same atomic commit. */
    permit: AuthorityPermit
  }>;

  /**
     * Runs the scoped server operation under its durable authority fence.
     * @param input - Verified operation input.
     * @returns Authoritative result; invalid, stale or unavailable state fails closed.
     * @example import type {AuthorityService} from '@alneas/sitekit/management';
     * export const invoke = (operation:NonNullable<AuthorityService>['finish'],...args:Parameters<NonNullable<AuthorityService>['finish']>) => operation(...args);
     */
  finish(input: {
    /** Durable identity retained across retries. */
    id: string;
    /** Trusted server-supplied operation value. */
    outcome: 'completed' | 'not-executed' | 'unknown';
    /** Trusted durable evidence for a definitive effect outcome. */
    proof?: string
  }): Promise<ConnectionStatus>;
}
/** Server-owned authority composition; browser calls never select endpoints or credentials. */
export interface AuthorityServiceOptions {

  /** Immutable server-verified tenant and site. */

  scope: ManagementScope;
  /** Durable atomic site control store. */

  store: AuthorityStore;
  /** Explicit server-configured adapters for each owner. */

  peers: Partial<Record<AuthorityOwner, AuthorityTransferPeer>>;

  /**
     * Runs the scoped server operation under its durable authority fence.
     * @param operation - Server-authorized operation identity.
     * @returns Authoritative result; invalid, stale or unavailable state fails closed.
     * @example import type {AuthorityServiceOptions} from '@alneas/sitekit/management';
     * export const invoke = (operation:NonNullable<AuthorityServiceOptions>['authorize'],...args:Parameters<NonNullable<AuthorityServiceOptions>['authorize']>) => operation(...args);
     */

  authorize(operation: 'read' | 'manageConnection' | 'issuePermit' | 'resolvePermit'): Promise<SettingsAdmission>;

  /**
     * Runs the scoped server operation under its durable authority fence.
     * @param permit - Optional effect admission updated in the same atomic commit.
     * @param proof - Trusted durable evidence for a definitive effect outcome.
     * @param outcome - Verified operation input.
     * @returns Authoritative result; invalid, stale or unavailable state fails closed.
     * @example import type {AuthorityServiceOptions} from '@alneas/sitekit/management';
     * export const invoke = (operation:NonNullable<AuthorityServiceOptions>['verifyPermit'],...args:Parameters<NonNullable<AuthorityServiceOptions>['verifyPermit']>) => operation(...args);
     */

  verifyPermit(permit: AuthorityPermit, proof: string, outcome: 'completed' | 'not-executed'): Promise<boolean>;
}
/** Safe shared connection display. Availability and permission never replace server admission. */
export interface ConnectionStatus {
  /** Immutable server-verified tenant and site. */

  scope: ManagementScope;
  /** Opaque optimistic-concurrency version. */

  version: string;
  /** Exclusive configured execution owner. */

  owner: AuthorityOwner;
  /** Opaque execution generation; previous generations cannot dispatch. */

  epoch: string;
  /** Monotonically increasing owner generation. */

  generation: number;
  /** Durable handoff phase; failure resumes this phase. */

  phase: 'active' | 'planned' | 'draining' | 'frozen' | 'ready' | 'activating' | 'complete';
  /** True only when the current owner may admit new operations. */

  active: boolean;
  /** Whether the opposite trusted server peer is configured. */

  configured: boolean;
  /** Current display permission; each mutation must still reauthorize. */

  canManage: boolean;
  /** Unresolved durable admissions; these never expire into permission to dispatch. */

  openPermits: number;
  /** Uncertain effects that block cutover until verified reconciliation. */

  unknownPermits: number;
  /** Stable handoff identity, or null when no plan exists. */

  transferId: string | null;
  /** Configured destination owner; never a browser-selected endpoint. */

  target: AuthorityOwner | null
}
/** Explicit connect/disconnect plan; the target is a configured owner, never a URL. */
export interface ConnectionPlanCommand {
  /** Unique caller command identity retained for idempotent replay. */

  commandId: string;
  /** Current optimistic control version. */

  expectedVersion: string;
  /** Current execution generation expected by the caller. */

  authorityEpoch: string;
  /** Configured destination owner; never a browser-selected endpoint. */

  target: AuthorityOwner
}
/** Idempotent transfer phase request, with an optimistic control version. */
export interface ConnectionAdvanceCommand {
  /** Unique caller command identity retained for idempotent replay. */

  commandId: string;
  /** Current optimistic control version. */

  expectedVersion: string;
  /** Stable handoff identity, or null when no plan exists. */

  transferId: string
}
/** Browser connection commands; no permit, snapshot or credential methods are exposed. */
export interface ConnectionProvider {
  /**
     * Runs the scoped server operation under its durable authority fence.
     * @returns Authoritative result; invalid, stale or unavailable state fails closed.
     * @example import type {ConnectionProvider} from '@alneas/sitekit/management';
     * export const invoke = (operation:NonNullable<ConnectionProvider>['status'],...args:Parameters<NonNullable<ConnectionProvider>['status']>) => operation(...args);
     */

  status(): Promise<ConnectionStatus>;
  /**
     * Runs the scoped server operation under its durable authority fence.
     * @param command - Verified operation input.
     * @returns Authoritative result; invalid, stale or unavailable state fails closed.
     * @example import type {ConnectionProvider} from '@alneas/sitekit/management';
     * export const invoke = (operation:NonNullable<ConnectionProvider>['plan'],...args:Parameters<NonNullable<ConnectionProvider>['plan']>) => operation(...args);
     */

  plan(command: ConnectionPlanCommand): Promise<ConnectionStatus>;
  /**
     * Runs the scoped server operation under its durable authority fence.
     * @param command - Verified operation input.
     * @returns Authoritative result; invalid, stale or unavailable state fails closed.
     * @example import type {ConnectionProvider} from '@alneas/sitekit/management';
     * export const invoke = (operation:NonNullable<ConnectionProvider>['advance'],...args:Parameters<NonNullable<ConnectionProvider>['advance']>) => operation(...args);
     */

  advance(command: ConnectionAdvanceCommand): Promise<ConnectionStatus>
}
const id = z.string().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/), owner = z.enum(['standalone', 'eaos']);
const scopeSchema = z.strictObject({ tenantId: id, siteId: id });
const planSchema = z.strictObject({ commandId: id, expectedVersion: id, authorityEpoch: id, target: owner });
const advanceSchema = z.strictObject({ commandId: id, expectedVersion: id, transferId: id });
const manifestSchema = z.strictObject({ hash: z.string().regex(/^[a-f0-9]{64}$/), sourceRevision: id, cutoff: z.iso.datetime({ offset: true }), counts: z.record(z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,40}$/), z.number().int().nonnegative()).refine(v => Object.keys(v).length <= 32) });
const statusSchema = z.strictObject({ scope: scopeSchema, version: id, owner, epoch: id, generation: z.number().int().positive(), phase: z.enum(['active', 'planned', 'draining', 'frozen', 'ready', 'activating', 'complete']), active: z.boolean(), configured: z.boolean(), canManage: z.boolean(), openPermits: z.number().int().nonnegative(), unknownPermits: z.number().int().nonnegative(), transferId: id.nullable(), target: owner.nullable() });
const checked = <T>(schema: z.ZodType<T>, value: unknown): T => { try { return schema.parse(value) } catch { throw new ManagementFault('invalid') } };
/**
 * Validate the credential-free connection projection.
 * @param value - Validated canonical value; server records may contain encrypted envelopes.
 * @returns Authoritative result; invalid, stale or unavailable state fails closed.
 * @example import {parseConnectionStatus} from '@alneas/sitekit/management';
 * export const invoke = (operation:typeof parseConnectionStatus,...args:Parameters<typeof parseConnectionStatus>) => operation(...args);
 */
export function parseConnectionStatus(value: unknown): ConnectionStatus { return checked(statusSchema, value) }
/**
 * Validate explicit connection planning input.
 * @param value - Validated canonical value; server records may contain encrypted envelopes.
 * @returns Authoritative result; invalid, stale or unavailable state fails closed.
 * @example import {parseConnectionPlan} from '@alneas/sitekit/management';
 * export const invoke = (operation:typeof parseConnectionPlan,...args:Parameters<typeof parseConnectionPlan>) => operation(...args);
 */
export function parseConnectionPlan(value: unknown): ConnectionPlanCommand { return checked(planSchema, value) }
/**
 * Validate idempotent transfer advancement input.
 * @param value - Validated canonical value; server records may contain encrypted envelopes.
 * @returns Authoritative result; invalid, stale or unavailable state fails closed.
 * @example import {parseConnectionAdvance} from '@alneas/sitekit/management';
 * export const invoke = (operation:typeof parseConnectionAdvance,...args:Parameters<typeof parseConnectionAdvance>) => operation(...args);
 */
export function parseConnectionAdvance(value: unknown): ConnectionAdvanceCommand { return checked(advanceSchema, value) }
/**
 * Create first-install authority control without replacing an existing owner.
 * @param input - Verified operation input.
 * @returns Authoritative result; invalid, stale or unavailable state fails closed.
 * @example import {createAuthorityRecord} from '@alneas/sitekit/management';
 * export const invoke = (operation:typeof createAuthorityRecord,...args:Parameters<typeof createAuthorityRecord>) => operation(...args);
 */
export function createAuthorityRecord(input: {
  /** Immutable server-verified tenant and site. */

  scope: ManagementScope;
  /** Exclusive configured execution owner. */

  owner: AuthorityOwner;
  /** Opaque execution generation; previous generations cannot dispatch. */

  epoch: string
}): AuthorityRecord {
  return { scope: checked(scopeSchema, input.scope), owner: checked(owner, input.owner), epoch: checked(id, input.epoch), version: crypto.randomUUID(), generation: 1, status: 'active', openPermits: [], transfer: null, commands: [] };
}
/**
 * Create fail-closed, resumable transfer control and separately durable operation permits.
 * @param o - Verified operation input.
 * @returns Authoritative result; invalid, stale or unavailable state fails closed.
 * @example import {createAuthorityService} from '@alneas/sitekit/management';
 * export const invoke = (operation:typeof createAuthorityService,...args:Parameters<typeof createAuthorityService>) => operation(...args);
 */
export function createAuthorityService(o: AuthorityServiceOptions): AuthorityService {
  const scope = checked(scopeSchema, o.scope);
  const allow = async (operation: Parameters<AuthorityServiceOptions['authorize']>[0]) => { const a = await o.authorize(operation); if (a.allowed !== true || !a.version) throw new ManagementFault('forbidden'); return a };
  const load = async () => { const r = await o.store.read(); if (!r || r.scope.tenantId !== scope.tenantId || r.scope.siteId !== scope.siteId || !Array.isArray(r.openPermits) || new Set(r.openPermits).size !== r.openPermits.length || r.openPermits.length > 1000 || !Array.isArray(r.commands) || r.commands.length > 4096 || !['active', 'closing', 'frozen', 'activating'].includes(r.status)) throw new ManagementFault('unavailable'); return structuredClone(r) };
  const commit = async (old: AuthorityRecord, next: AuthorityRecord, a: SettingsAdmission, permit?: AuthorityPermit, expectedPermitVersion?: string | null) => {
    next.version = crypto.randomUUID(); if (next.commands.length > 4096 || next.openPermits.length > 1000) throw new ManagementFault('capacity');
    if (!await o.store.compareAndSwap({ expectedVersion: old.version, expectedPermissionVersion: a.version, next, ...(permit ? { permit, expectedPermitVersion: expectedPermitVersion ?? null } : {}) })) throw new ManagementFault('conflict');
  };
  const status = async (): Promise<ConnectionStatus> => { await allow('read'); const r = await load(), manage = await o.authorize('manageConnection'); let unknown = 0; for (const p of r.openPermits) { const value = await o.store.permit(p); if (!value || !['open', 'unknown'].includes(value.status)) throw new ManagementFault('unavailable'); if (value.status === 'unknown') unknown++ } await allow('read'); return parseConnectionStatus({ scope, version: r.version, owner: r.owner, epoch: r.epoch, generation: r.generation, phase: r.transfer?.phase ?? 'active', active: r.status === 'active', configured: !!o.peers[r.owner === 'standalone' ? 'eaos' : 'standalone'], canManage: manage.allowed === true, openPermits: r.openPermits.length, unknownPermits: unknown, transferId: r.transfer?.id ?? null, target: r.transfer?.to ?? null }) };
  const replay = (r: AuthorityRecord, command: {
    /** Unique caller command identity retained for idempotent replay. */

    commandId: string
  }, fingerprint: string) => { const old = r.commands.find(c => c.id === command.commandId); if (old && old.fingerprint !== fingerprint) throw new ManagementFault('conflict'); return !!old };
  return {
    status,
    async plan(input: ConnectionPlanCommand) {
      const c = parseConnectionPlan(input), fingerprint = JSON.stringify(c); await allow('manageConnection'); const r = await load(); if (replay(r, c, fingerprint)) return status();
      if (r.version !== c.expectedVersion || r.epoch !== c.authorityEpoch || r.status !== 'active' || r.transfer && r.transfer.phase !== 'complete' || r.owner === c.target) throw new ManagementFault('conflict');
      const source = o.peers[r.owner], target = o.peers[c.target]; if (!source || !target) throw new ManagementFault('unavailable'); const inventory = await source.inspect(); if (inventory.blocked) throw new ManagementFault('conflict'); const transferId = crypto.randomUUID(); await target.preflight(transferId, inventory);
      const a = await allow('manageConnection'), next = structuredClone(r); next.transfer = { id: transferId, from: r.owner, to: c.target, sourceRevision: inventory.revision, identity: inventory.identity, phase: 'planned' }; next.commands.push({ id: c.commandId, fingerprint }); await commit(r, next, a); return status();
    },
    async advance(input: ConnectionAdvanceCommand) {
      const c = parseConnectionAdvance(input), fingerprint = JSON.stringify(c); await allow('manageConnection'); const r = await load(); if (replay(r, c, fingerprint)) return status();
      const t = r.transfer; if (!t || t.id !== c.transferId || r.version !== c.expectedVersion) throw new ManagementFault('conflict'); if (t.phase === 'complete') return status();
      const source = o.peers[t.from], target = o.peers[t.to]; if (!source || !target) throw new ManagementFault('unavailable'); const next = structuredClone(r), transfer = next.transfer!;
      if (t.phase === 'planned') { next.status = 'closing'; transfer.phase = 'draining' }
      else if (t.phase === 'draining') {
        if (r.openPermits.length) return status();
        try { transfer.manifest = checked(manifestSchema, await source.freeze(t.id, t.sourceRevision)); if (transfer.manifest.sourceRevision !== t.sourceRevision) throw new ManagementFault('conflict'); next.status = 'frozen'; transfer.phase = 'frozen' }
        catch (error) { if (!(error instanceof ManagementFault) || error.code !== 'conflict') throw error; const inventory = await source.inspect(); if (inventory.blocked || inventory.revision === t.sourceRevision) throw error; await target.preflight(t.id, inventory); transfer.sourceRevision = inventory.revision }

      } else if (t.phase === 'frozen') {
        if (!t.manifest) throw new ManagementFault('unavailable'); const ready = await target.import(t.id, t.manifest, cursor => source.page(t.id, cursor)); if (!ready.id || ready.hash !== t.manifest.hash) throw new ManagementFault('conflict'); transfer.ready = { id: checked(id, ready.id), hash: ready.hash }; transfer.phase = 'ready';
      } else if (t.phase === 'ready') {
        if (!t.ready || !t.manifest || t.ready.hash !== t.manifest.hash || r.openPermits.length) throw new ManagementFault('conflict'); next.owner = t.to; next.epoch = crypto.randomUUID(); next.generation++; next.status = 'activating'; transfer.phase = 'activating';
      } else if (t.phase === 'activating') {
        if (!t.ready || r.owner !== t.to) throw new ManagementFault('conflict'); await target.activate(t.id, r.epoch, t.ready.id); next.status = 'active'; transfer.phase = 'complete';
      }
      const a = await allow('manageConnection'); next.commands.push({ id: c.commandId, fingerprint }); await commit(r, next, a); return status();
    },
    async permit(idValue: string) { await allow('read'); return o.store.permit(checked(id, idValue)) },
    async issue(input: {
      /** Durable identity retained across retries. */

      id: string;
      /** Exclusive configured execution owner. */

      owner: AuthorityOwner;
      /** Opaque execution generation; previous generations cannot dispatch. */

      epoch: string;
      /** Server-authorized operation identity. */

      operation: string;
      /** Immutable operation-input identity; changed replays conflict. */

      fingerprint: string
    }) {
      const c = checked(z.strictObject({ id, owner, epoch: id, operation: z.string().min(1).max(200), fingerprint: z.string().min(1).max(160) }), input); const a = await allow('issuePermit'), r = await load();
      if (r.owner !== c.owner || r.epoch !== c.epoch) throw new ManagementFault('conflict'); if (r.status !== 'active') throw new ManagementFault('unavailable'); const old = await o.store.permit(c.id);
      if (old) { if (old.owner !== c.owner || old.epoch !== c.epoch || old.operation !== c.operation || old.fingerprint !== c.fingerprint) throw new ManagementFault('conflict'); return { created: false, permit: old } }
      const p: AuthorityPermit = { ...c, version: crypto.randomUUID(), status: 'open' }, next = structuredClone(r); next.openPermits.push(p.id); await commit(r, next, a, p, null); return { created: true, permit: p };
    },
    async finish(input: {
      /** Durable identity retained across retries. */

      id: string;
      /** Trusted server-supplied operation value. */

      outcome: 'completed' | 'not-executed' | 'unknown';
      /** Trusted durable evidence for a definitive effect outcome. */

      proof?: string
    }) {
      const c = checked(z.strictObject({ id, outcome: z.enum(['completed', 'not-executed', 'unknown']), proof: z.string().min(1).max(4096).optional() }), input); const a = await allow('resolvePermit'), r = await load(), p = await o.store.permit(c.id); if (!p) throw new ManagementFault('conflict');
      if (['completed', 'not-executed'].includes(p.status)) { if (p.status !== c.outcome || p.proof !== c.proof) throw new ManagementFault('conflict'); return status() }
      if (c.outcome !== 'unknown' && (!c.proof || await o.verifyPermit(p, c.proof, c.outcome) !== true)) throw new ManagementFault('forbidden');
      const permit = { ...p, status: c.outcome, version: crypto.randomUUID(), ...(c.proof ? { proof: c.proof } : {}) }, next = structuredClone(r); if (c.outcome !== 'unknown') next.openPermits = next.openPermits.filter(id => id !== p.id); await commit(r, next, a, permit, p.version); return status();
    },
  };
}
/**
 * Creates the safe connection-only bootstrap while business state is frozen or owned by the other host.
 * @param status - Server-authorized control projection for this exact site.
 * @returns Context that exposes navigation and connection recovery without business writes.
 * @example
 * import {createConnectionContext} from '@alneas/sitekit/management';
 * import type {ConnectionStatus} from '@alneas/sitekit/management';
 * export const recover = (status:ConnectionStatus) => createConnectionContext(status);
 */
export function createConnectionContext(status:ConnectionStatus):import('./contracts.js').ManagementContext{
 const s=parseConnectionStatus(status),unavailable={available:false as const,reason:'unavailable' as const},denied={allowed:false as const,reason:'unavailable' as const};
 return {protocolVersion:1,scope:s.scope,authority:{kind:s.owner,epoch:s.epoch,status:'paused'},capabilities:{settings:unavailable,measurement:unavailable,socialPublishing:unavailable},permissions:{readSettings:denied,saveSettings:denied,applySettings:denied,readApplication:denied},asOf:new Date().toISOString()};
}
