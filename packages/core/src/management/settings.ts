import { z } from 'zod';
import type { ApplySettingsCommand, ManagementAuthority, ManagementScope, SaveSettingsCommand, SettingsApplication, SettingsMutationReceipt, SettingsOperation, SettingsSection, SettingsSectionName, SettingsSectionValue, SettingsSnapshot, ManagementSettingsProvider } from './contracts.js';
import { ManagementFault } from './errors.js';
import { applicationSchema, mutationReceiptSchema, authoritySchema, checked, parseApplySettingsCommand, parseSaveSettingsCommand, parseSettingsSnapshot, parseSettingsValues, scopeSchema, sectionSchemas } from './schemas.js';
/** Durable application plus the immutable captured value used by the trusted host. */
export interface StoredSettingsApplication {
  /** Safe application projection. */
  view: SettingsApplication;
  /** Exact value to be confirmed, never a later draft. */
  value: SettingsSectionValue;
}
/** Durable idempotency entry, kept server-side. */
export interface SettingsCommandReceipt {
  /** Original request identity. */
  commandId: string;
  /** Command kind prevents cross-operation ID reuse. */
  operation: 'saveSettings' | 'applySettings';
  /** Canonical validated command, without credentials. */
  fingerprint: string;
  /** Durable save acknowledgement or original application request. */
  receipt: SettingsMutationReceipt | SettingsApplication;
}
/** Host-persisted aggregate. Do not expose command fingerprints or captured requests as browser settings. */
export interface SettingsRecord {
  /** Credential-free settings projection. */
  snapshot: SettingsSnapshot;
  /** Bounded immutable command acknowledgements. */
  commands: SettingsCommandReceipt[];
  /** Bounded application history, including captured values. */
  applications: StoredSettingsApplication[];
}
/** Durable host port. Both hosting modes must atomically fence the same version and epoch. */
export interface ManagementSettingsStore {
  /**
   * Reads the authoritative aggregate, never a browser-selected fallback.
   * @param scope - Verified tenant/site identity.
   * @returns Detached record, or null when not provisioned.
   * @example
   * import type { ManagementSettingsStore, ManagementScope } from '@alneas/sitekit/management';
   * export const read = (s: ManagementSettingsStore, scope: ManagementScope) => s.read(scope);
   */
  read(scope: ManagementScope): Promise<SettingsRecord | null>;
  /**
   * Atomically replaces the aggregate only when scope, version and authority epoch match.
   * Authority changes must also change the aggregate version. Atomically compare the live permission
   * generation for the bound actor/operation; a revocation cannot race between checking and writing.
   * Never upsert on a lost CAS.
   * @param input - Verified old fences and complete replacement record.
   * @returns True for exactly one winner; false must leave persistence unchanged.
   * @example
   * import type { ManagementSettingsStore } from '@alneas/sitekit/management';
   * export const replace = (s: ManagementSettingsStore, c: Parameters<ManagementSettingsStore['compareAndSwap']>[0]) => s.compareAndSwap(c);
   */
  compareAndSwap(input: {
    /** Verified scope. */
    scope: ManagementScope;
    /** Reviewed aggregate version. */
    expectedVersion: string;
    /** Reviewed authority epoch. */
    expectedAuthorityEpoch: string;
    /** Current permission generation for the same bound actor/operation. */
    expectedPermissionVersion: string;
    /** Complete detached replacement. */
    next: SettingsRecord;
  }): Promise<boolean>;
}
/** Trusted-server completion; intentionally absent from ManagementSettingsProvider. */
export interface CompleteSettingsApplication {
  /** Wire version. */
  protocolVersion: 1;
  /** Reserved application identity. */
  applicationId: string;
  /** Current aggregate version, refreshed without re-executing the effect. */
  expectedVersion: string;
  /** Original authority epoch. */
  authorityEpoch: string;
  /** Confirmed outcome; uncertainty must remain applying. */
  outcome: 'applied' | 'failed';
  /** Host proof of application, or proof that rejection cannot later apply. */
  receiptId: string;
  /** Safe failure code, required only for failed outcomes. */
  errorCode?: 'unavailable' | 'rejected';
}
/** Trusted admission result. Hosts advance this generation whenever relevant permissions change. */
export interface SettingsAdmission {
  /** Exactly true when this operation is currently permitted. */
  allowed: boolean;
  /** Opaque current permission generation, atomically fenced by the store. */
  version: string;
}
/** Live server admission input; the factory binds the authenticated actor outside this data. */
export interface SettingsAuthorizationRequest {
  /** Verified tenant/site. */
  scope: ManagementScope;
  /** Current operation, including a distinct trusted completion privilege. */
  operation: SettingsOperation;
  /** Selected section when known. */
  section?: SettingsSectionName;
  /** Proposed/captured settings for destination-level checks. */
  value?: SettingsSectionValue;
}
/** Shared server policy dependencies; actual persistence and application effects remain host-owned. */
export interface ManagementSettingsServiceOptions {
  /** Verified host identity, never supplied in a command body. */
  scope: ManagementScope;
  /** Authoritative durable storage. */
  store: ManagementSettingsStore;
  /**
   * Checks current identity, capability, subscription, site and destination permissions.
   * Called again before committing or returning replay data.
   * @param request - Scoped operation and proposed/captured value.
   * @returns Current grant decision and its atomic permission generation.
   * @example
   * import type { ManagementSettingsServiceOptions, SettingsAuthorizationRequest } from '@alneas/sitekit/management';
   * export const admit = (o: ManagementSettingsServiceOptions, r: SettingsAuthorizationRequest) => o.authorize(r);
   */
  authorize(request: SettingsAuthorizationRequest): Promise<SettingsAdmission>;
  /**
   * Verifies an existing effect/rejection receipt, never executes the effect itself.
   * An unknown outcome is not a proven rejection and must not return true.
   * @param input - Captured request/value and supplied proof, all bound to this scope.
   * @returns Exactly true only for the matching confirmed outcome.
   * @example
   * import type { ManagementSettingsServiceOptions } from '@alneas/sitekit/management';
   * export const verify = (o: ManagementSettingsServiceOptions, r: Parameters<ManagementSettingsServiceOptions['verifyApplication']>[0]) => o.verifyApplication(r);
   */
  verifyApplication(input: {
    /** Verified site identity. */
    scope: ManagementScope;
    /** Original application request. */
    application: SettingsApplication;
    /** Immutable section value. */
    value: SettingsSectionValue;
    /** Claimed outcome and proof. */
    completion: CompleteSettingsApplication;
  }): Promise<boolean>;
}
/** Server API shared by both hosts; context presentation and external application are separate ports. */
export interface ManagementSettingsService extends Omit<ManagementSettingsProvider, 'context'> {
  /**
   * Confirms an admitted request using host-verified effect/rejection proof.
   * @param input - Original application, current CAS fence and proof identity.
   * @returns Verified application state; never executes the underlying effect.
   * @example
   * import type { ManagementSettingsService, CompleteSettingsApplication } from '@alneas/sitekit/management';
   * export const complete = (s: ManagementSettingsService, c: CompleteSettingsApplication) => s.completeApplication(c);
   */
  completeApplication(input: CompleteSettingsApplication): Promise<SettingsApplication>;
}

const names = ['site', 'localization', 'measurement', 'reporting', 'social'] as const;
const id = z.string().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/);
const completionSchema = z.discriminatedUnion('outcome', [
  z.strictObject({ protocolVersion: z.literal(1), applicationId: id, expectedVersion: id, authorityEpoch: id, outcome: z.literal('applied'), receiptId: id }),
  z.strictObject({ protocolVersion: z.literal(1), applicationId: id, expectedVersion: id, authorityEpoch: id, outcome: z.literal('failed'), receiptId: id, errorCode: z.enum(['unavailable', 'rejected']) }),
]);
const commandSchema = z.discriminatedUnion('operation', [
  z.strictObject({ commandId: id, operation: z.literal('saveSettings'), fingerprint: z.string().max(16384), receipt: mutationReceiptSchema }),
  z.strictObject({ commandId: id, operation: z.literal('applySettings'), fingerprint: z.string().max(16384), receipt: applicationSchema }),
]);
const recordSchema = z.strictObject({ snapshot: z.unknown(), commands: z.array(commandSchema).max(256), applications: z.array(z.strictObject({ view: applicationSchema, value: z.unknown() })).max(128) });
const fault = (code: ConstructorParameters<typeof ManagementFault>[0]): never => { throw new ManagementFault(code); };
const admissionSchema = z.strictObject({ allowed: z.boolean(), version: id });
const acceptCas = (result: unknown) => { if (result === false) fault('conflict'); else if (result !== true) fault('unavailable'); };
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => [k, canonical(v)])) : value;
function readRecord(input: unknown, scope: ManagementScope): SettingsRecord {
  try {
    const parsed = recordSchema.parse(input), snapshot = parseSettingsSnapshot(parsed.snapshot);
    if (snapshot.scope.siteId !== scope.siteId || snapshot.scope.tenantId !== scope.tenantId || new TextEncoder().encode(JSON.stringify(parsed)).byteLength > 1024 * 1024) return fault('unavailable');
    if (new Set(parsed.commands.map(c => c.commandId)).size !== parsed.commands.length || new Set(parsed.applications.map(a => a.view.id)).size !== parsed.applications.length) return fault('unavailable');
    for (const command of parsed.commands) {
      if (command.commandId !== command.receipt.commandId) return fault('unavailable');
      const input = command.operation === 'saveSettings' ? parseSaveSettingsCommand(JSON.parse(command.fingerprint)) : parseApplySettingsCommand(JSON.parse(command.fingerprint));
      if (JSON.stringify(canonical(input)) !== command.fingerprint || input.commandId !== command.commandId || input.section !== command.receipt.section) return fault('unavailable');
      if (command.operation === 'applySettings') {
        const receipt = command.receipt, application = parsed.applications.find(a => a.view.id === receipt.id);
        if (!application || receipt.status !== 'applying') return fault('unavailable');
        for (const key of ['id', 'commandId', 'section', 'savedRevision', 'expectedEffectiveRevision', 'authorityEpoch', 'requestedAt'] as const) if (receipt[key] !== application.view[key]) return fault('unavailable');
        const apply = input as ApplySettingsCommand;
        if (apply.authorityEpoch !== receipt.authorityEpoch || apply.savedRevision !== receipt.savedRevision || apply.expectedEffectiveRevision !== receipt.expectedEffectiveRevision) return fault('unavailable');
      } else {
        const saved = snapshot.sections[input.section].saved;
        if (command.receipt.version === input.expectedVersion || saved.revision === command.receipt.savedRevision && JSON.stringify(canonical(saved.value)) !== JSON.stringify(canonical((input as SaveSettingsCommand).value))) return fault('unavailable');
      }
    }
    for (const application of parsed.applications) if (!parsed.commands.some(c => c.operation === 'applySettings' && c.receipt.id === application.view.id && c.commandId === application.view.commandId)) return fault('unavailable');
    for (const application of parsed.applications) application.value = sectionSchemas[application.view.section].parse(application.value);
    for (const name of names) {
      const application = snapshot.sections[name].application;
      if (application && !parsed.applications.some(a => a.view.id === application.id && JSON.stringify(a.view) === JSON.stringify(application))) return fault('unavailable');
    }
    return { snapshot, commands: parsed.commands, applications: parsed.applications } as SettingsRecord;
  } catch { return fault('unavailable'); }
}
/**
 * Bootstraps an unprovisioned record with safe saved defaults and no invented application receipts.
 * Existing hosts must migrate actual effective values/receipts explicitly instead of reinitializing.
 * @param input - Verified scope/authority and initial site configuration.
 * @returns A detached record for an atomic host-owned create operation.
 * @example
 * import { createSettingsRecord } from '@alneas/sitekit/management';
 * export const bootstrap = (input: Parameters<typeof createSettingsRecord>[0]) => createSettingsRecord(input);
 */
export function createSettingsRecord(input: {
  /** Verified site identity. */
  scope: ManagementScope;
  /** Verified execution owner. */
  authority: ManagementAuthority;
  /** Explicit bootstrap fields; collection/publication defaults may be omitted. */
  values: unknown;
}): SettingsRecord {
  const scope = checked(scopeSchema, input.scope), authority = checked(authoritySchema, input.authority), values = parseSettingsValues(input.values);
  const sections = Object.fromEntries(names.map(name => [name, { saved: { revision: crypto.randomUUID(), value: values[name] }, effective: null, application: null }]));
  return { snapshot: parseSettingsSnapshot({ protocolVersion: 1, scope, authority, version: crypto.randomUUID(), sections }), commands: [], applications: [] };
}
/**
 * Computes a section's saved/effective presentation without implying a whole-site application.
 * @param section - Current section projection.
 * @returns The current draft/application state for the saved revision.
 * @example
 * import { settingsSectionStatus, type SettingsSection } from '@alneas/sitekit/management';
 * export const status = (s: SettingsSection<unknown>) => settingsSectionStatus(s);
 */
export function settingsSectionStatus(section: SettingsSection<unknown>): 'not_applied' | 'applying' | 'applied' | 'failed' {
  if (section.application?.savedRevision === section.saved.revision && section.application.status === 'applying') return 'applying';
  if (section.effective?.revision === section.saved.revision) return 'applied';
  return section.application?.savedRevision === section.saved.revision && section.application.status === 'failed' ? 'failed' : 'not_applied';
}
/**
 * Creates the shared policy used by standalone and EAOS hosts over their own durable store.
 * It reserves requests and verifies existing receipts; it never runs a build or posts to SNS.
 * @param options - Bound host scope, atomic store, live admission and receipt verifier.
 * @returns Settings operations with identical save/apply/conflict semantics in either mode.
 * @example
 * import { createManagementSettingsService, type ManagementSettingsServiceOptions } from '@alneas/sitekit/management';
 * export const service = (options: ManagementSettingsServiceOptions) => createManagementSettingsService(options);
 */
export function createManagementSettingsService(options: ManagementSettingsServiceOptions): ManagementSettingsService {
  if (typeof options?.authorize !== 'function' || typeof options.verifyApplication !== 'function' || typeof options.store?.read !== 'function' || typeof options.store.compareAndSwap !== 'function') return fault('invalid');
  const scope = checked(scopeSchema, options.scope), store = options.store;
  const guard = async <T>(work: () => Promise<T>): Promise<T> => { try { return await work(); } catch (error) { if (error instanceof ManagementFault) throw error; return fault('unavailable'); } };
  const admit = async (operation: SettingsOperation, section?: SettingsSectionName, value?: SettingsSectionValue) => {
    const decision = admissionSchema.safeParse(await options.authorize(structuredClone({ scope, operation, ...(section ? { section } : {}), ...(value ? { value } : {}) })));
    if (!decision.success) return fault('unavailable');
    if (!decision.data.allowed) return fault('forbidden');
    return decision.data.version;
  };
  const load = async () => readRecord(await store.read({ ...scope }), scope);
  const fence = (record: SettingsRecord, input: { expectedVersion: string; authorityEpoch: string }, active = true) => {
    if (record.snapshot.authority.epoch !== input.authorityEpoch || record.snapshot.version !== input.expectedVersion) fault('conflict');
    if (active && record.snapshot.authority.status !== 'active') fault('unavailable');
  };
  const replay = (record: SettingsRecord, operation: SettingsCommandReceipt['operation'], input: SaveSettingsCommand | ApplySettingsCommand) => {
    const receipt = record.commands.find(c => c.commandId === input.commandId);
    if (!receipt) return undefined;
    if (receipt.operation !== operation || receipt.fingerprint !== JSON.stringify(canonical(input))) return fault('conflict');
    if (record.snapshot.authority.epoch !== input.authorityEpoch) return fault('conflict');
    if (record.snapshot.authority.status !== 'active') return fault('unavailable');
    return receipt;
  };
  const commit = async (record: SettingsRecord, original: SettingsSnapshot, operation: SettingsOperation, section: SettingsSectionName, value?: SettingsSectionValue) => {
    const permissionVersion = await admit(operation, section, value);
    record.snapshot.version = crypto.randomUUID();
    const next = readRecord(record, scope);
    acceptCas(await store.compareAndSwap({ scope: { ...scope }, expectedVersion: original.version, expectedAuthorityEpoch: original.authority.epoch, expectedPermissionVersion: permissionVersion, next }));
  };
  const ensureCapacity = (record: SettingsRecord, application = false) => { if (record.commands.length >= 256 || application && record.applications.length >= 128) fault('capacity'); };
  return {
    settings: () => guard(async () => { await admit('readSettings'); const record = await load(); await admit('readSettings'); return record.snapshot; }),
    saveSettings: input => guard(async () => {
      const command = parseSaveSettingsCommand(input); await admit('saveSettings', command.section, command.value); const record = await load();
      const old = replay(record, 'saveSettings', command); if (old) { await admit('saveSettings', command.section, command.value); return structuredClone(old.receipt) as SettingsMutationReceipt; }
      fence(record, command); ensureCapacity(record); const original = structuredClone(record.snapshot), section = record.snapshot.sections[command.section] as SettingsSection<SettingsSectionValue>;
      section.saved = { revision: crypto.randomUUID(), value: command.value };
      const receipt: SettingsMutationReceipt = { commandId: command.commandId, version: crypto.randomUUID(), section: command.section, savedRevision: section.saved.revision };
      record.commands.push({ commandId: command.commandId, operation: 'saveSettings', fingerprint: JSON.stringify(canonical(command)), receipt });
      // The receipt must contain the exact committed version, including across process restart.
      const permissionVersion = await admit('saveSettings', command.section, command.value); record.snapshot.version = receipt.version;
      acceptCas(await store.compareAndSwap({ scope: { ...scope }, expectedVersion: original.version, expectedAuthorityEpoch: original.authority.epoch, expectedPermissionVersion: permissionVersion, next: readRecord(record, scope) }));
      return structuredClone(receipt);
    }),
    applySettings: input => guard(async () => {
      const command = parseApplySettingsCommand(input); await admit('applySettings', command.section); const record = await load();
      const old = replay(record, 'applySettings', command); if (old) { const application = record.applications.find(a => a.view.id === (old.receipt as SettingsApplication).id) ?? fault('unavailable'); await admit('applySettings', command.section, application.value); return structuredClone(application.view); }
      fence(record, command); ensureCapacity(record, true); const original = structuredClone(record.snapshot), section = record.snapshot.sections[command.section];
      if (section.saved.revision !== command.savedRevision || (section.effective?.revision ?? null) !== command.expectedEffectiveRevision || section.application?.status === 'applying') fault('conflict');
      const view: SettingsApplication = { id: crypto.randomUUID(), commandId: command.commandId, section: command.section, savedRevision: command.savedRevision, expectedEffectiveRevision: command.expectedEffectiveRevision, authorityEpoch: command.authorityEpoch, status: 'applying', requestedAt: new Date().toISOString() };
      section.application = view; record.applications.push({ view, value: structuredClone(section.saved.value) });
      record.commands.push({ commandId: command.commandId, operation: 'applySettings', fingerprint: JSON.stringify(canonical(command)), receipt: structuredClone(view) });
      await commit(record, original, 'applySettings', command.section, section.saved.value); return structuredClone(view);
    }),
    application: idValue => guard(async () => { const applicationId = checked(id, idValue); await admit('readApplication'); const record = await load(); const application = record.applications.find(a => a.view.id === applicationId) ?? fault('invalid'); await admit('readApplication', application.view.section); return structuredClone(application.view); }),
    completeApplication: input => guard(async () => {
      const completion = checked(completionSchema, input) as CompleteSettingsApplication; await admit('completeApplication'); const record = await load();
      const application = record.applications.find(a => a.view.id === completion.applicationId) ?? fault('invalid'), view = application.view;
      if (record.snapshot.authority.epoch !== completion.authorityEpoch || view.authorityEpoch !== completion.authorityEpoch) fault('conflict');
      if (view.status !== 'applying') {
        if (view.status !== completion.outcome || view.receiptId !== completion.receiptId || view.errorCode !== completion.errorCode) fault('conflict');
        await admit('completeApplication', view.section, application.value); return structuredClone(view);
      }
      fence(record, completion, false); const original = structuredClone(record.snapshot), section = record.snapshot.sections[view.section] as SettingsSection<SettingsSectionValue>;
      if (section.application?.id !== view.id || (section.effective?.revision ?? null) !== view.expectedEffectiveRevision) fault('conflict');
      await admit('completeApplication', view.section, application.value);
      if (await options.verifyApplication(structuredClone({ scope, application: view, value: application.value, completion })) !== true) fault('unavailable');
      view.status = completion.outcome; view.completedAt = new Date().toISOString(); view.receiptId = completion.receiptId;
      if (completion.outcome === 'failed') view.errorCode = completion.errorCode!;
      else section.effective = { revision: view.savedRevision, value: structuredClone(application.value), receiptId: completion.receiptId, appliedAt: view.completedAt };
      section.application = structuredClone(view);
      await commit(record, original, 'completeApplication', view.section, application.value); return structuredClone(view);
    }),
  };
}

/**
 * Validates a complete server-side settings aggregate for authenticated migration.
 * @param input - Captured server record, never a browser settings DTO.
 * @param scope - Independently verified tenant/site identity.
 * @returns Validated aggregate including immutable command/application history.
 * @example
 * import {parseSettingsRecord,type ManagementScope} from '@alneas/sitekit/management';
 * export const validate = (input:unknown,scope:ManagementScope) => parseSettingsRecord(input,scope);
 */
export function parseSettingsRecord(input:unknown,scope:ManagementScope):SettingsRecord{return readRecord(input,scope);}
