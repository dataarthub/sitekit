import type { ConnectionCapability } from '../connection/contracts.js';
/** Authenticated host scope; never selected by mutation JSON. */
export interface ManagementScope {
  /** Opaque tenant identifier. */
  tenantId: string;
  /** Opaque site identifier. */
  siteId: string;
}
/** Display metadata and optimistic fence, not authorization evidence. */
export interface ManagementAuthority {
  /** Current configured execution owner. */
  kind: 'standalone' | 'eaos';
  /** Opaque generation changed during an authority transition. */
  epoch: string;
  /** Paused and transferring owners cannot accept new settings writes. */
  status: 'active' | 'paused' | 'transferring';
}
/** Site settings grouped into independently applicable sections. */
export interface SettingsValues {
  /** Public identity used by the site build. */
  site: {
    /** Nonempty display name. */
    name: string;
    /** Canonical HTTPS origin, without credentials, query or fragment. */
    url: string;
  };
  /** Locale routing and presentation time. */
  localization: {
    /** Default member of locales. */
    defaultLocale: string;
    /** Unique canonical locale identifiers. */
    locales: string[];
    /** Existing public locale-prefix vocabulary. */
    prefixStrategy: 'always' | 'default-unprefixed' | 'never';
    /** IANA timezone; existing scheduled UTC instants remain unchanged. */
    timezone: string;
  };
  /** Applied collection policy, not a visitor's consent choice. */
  measurement: {
    /** Whether collection may run, subject to actual consent. */
    enabled: boolean;
    /** Retention in whole days, 30 through 365. */
    retentionDays: number;
    /** Existing browser collector consent mode. */
    consentMode: 'opt-in' | 'opt-out';
    /** Visitor-choice lifetime in whole days, 1 through 365. */
    consentDays: number;
  };
  /** Defaults only; never converts existing spending or revenue. */
  reporting: {
    /** Uppercase ISO currency supported by the runtime. */
    currency: string;
  };
  /** Applied automatic-publication rule; credentials live exclusively on servers. */
  social: {
    /** Automatic publication is disabled on new installations. */
    enabled: boolean;
    /** Host-authorized destination IDs. */
    accountIds: string[];
    /** Whether new automatic post proposals require approval. */
    requiresApproval: boolean;
  };
}
/** Supported section keys. */
export type SettingsSectionName = keyof SettingsValues;
/** Portable value of any section. */
export type SettingsSectionValue = SettingsValues[SettingsSectionName];
/** Settings operations checked against live server admission. */
export type SettingsOperation = 'readSettings' | 'saveSettings' | 'applySettings' | 'readApplication' | 'completeApplication';
/** Presentation-only permission; servers must resolve it again for each request. */
export type ManagementPermission = {
  /** Advertised action availability. */
  allowed: true;
} | {
  /** Advertised action availability. */
  allowed: false;
  /** Safe reason without provider diagnostics. */
  reason: 'forbidden' | 'subscription_required' | 'unavailable';
};
/** Safe context consumed by either management shell. */
export interface ManagementContext {
  /** Wire protocol version, distinct from document revisions. */
  protocolVersion: 1;
  /** Host-authenticated identity. */
  scope: ManagementScope;
  /** Configured owner and generation. */
  authority: ManagementAuthority;
  /** Display-only feature availability. */
  capabilities: {
    /** Common settings support. */
    settings: ConnectionCapability;
    /** Measurement support. */
    measurement: ConnectionCapability;
    /** Social publication support. */
    socialPublishing: ConnectionCapability;
  };
  /** Display-only action permissions. Trusted completion is never a browser action. */
  permissions: Record<Exclude<SettingsOperation, 'completeApplication'>, ManagementPermission>;
  /** Context freshness instant in UTC. */
  asOf: string;
}
/** Durable application request, completed only through trusted host confirmation. */
export interface SettingsApplication {
  /** Opaque application identifier. */
  id: string;
  /** Client request identity, unique across settings commands. */
  commandId: string;
  /** Section whose captured saved value is being applied. */
  section: SettingsSectionName;
  /** Captured saved revision; a newer draft is never substituted. */
  savedRevision: string;
  /** Effective revision observed when admitted. */
  expectedEffectiveRevision: string | null;
  /** Authority generation of this request. */
  authorityEpoch: string;
  /** Explicit application phase. */
  status: 'applying' | 'applied' | 'failed';
  /** Request time in UTC. */
  requestedAt: string;
  /** Completion time for an applied or failed request. */
  completedAt?: string;
  /** Verified host receipt identity, present after application or proven rejection. */
  receiptId?: string;
  /** Fixed safe failure code, present only after failure. */
  errorCode?: 'unavailable' | 'rejected';
}
/** Saved and effective values for one section.
 * @typeParam T - Complete validated value of the selected settings section.
 */
export interface SettingsSection<T> {
  /** Editable configuration; saving does not affect runtime. */
  saved: {
    /** Opaque saved revision. */
    revision: string;
    /** Complete validated section value. */
    value: T;
  };
  /** Confirmed runtime configuration, or null before the first successful application. */
  effective: {
    /** Saved revision confirmed by the host. */
    revision: string;
    /** Captured value confirmed by the host. */
    value: T;
    /** Verified application receipt. */
    receiptId: string;
    /** Confirmation time in UTC. */
    appliedAt: string;
  } | null;
  /** Most recent application, distinct from a newer saved draft. */
  application: SettingsApplication | null;
}
/** Shared safe settings projection; no credential or storage implementation fields. */
export interface SettingsSnapshot {
  /** Wire version. */
  protocolVersion: 1;
  /** Authenticated record scope. */
  scope: ManagementScope;
  /** Configured owner and current fence. */
  authority: ManagementAuthority;
  /** Opaque aggregate CAS version, changed by every settings mutation. */
  version: string;
  /** Each section carries its own saved and effective revision. */
  sections: {
    /** Public site identity. */
    site: SettingsSection<SettingsValues['site']>;
    /** Language and timezone policy. */
    localization: SettingsSection<SettingsValues['localization']>;
    /** Measurement policy. */
    measurement: SettingsSection<SettingsValues['measurement']>;
    /** Report defaults. */
    reporting: SettingsSection<SettingsValues['reporting']>;
    /** Automatic publication policy. */
    social: SettingsSection<SettingsValues['social']>;
  };
}
/** Common mutation fence. Actor, tenant and site are resolved exclusively by the host. */
export interface SettingsCommand {
  /** Wire version. */
  protocolVersion: 1;
  /** Stable replay identity; a changed payload requires a new ID. */
  commandId: string;
  /** Aggregate CAS version the caller reviewed. */
  expectedVersion: string;
  /** Authority generation the caller reviewed. */
  authorityEpoch: string;
}
/** Complete replacement of one saved section, not an unversioned patch. */
export type SaveSettingsCommand = SettingsCommand & {
  [K in SettingsSectionName]: {
    /** Selected section. */
    section: K;
    /** Complete section value; omitted fields are not silently reset. */
    value: SettingsValues[K];
  }
}[SettingsSectionName];
/** Explicit request to apply a particular saved section revision. */
export interface ApplySettingsCommand extends SettingsCommand {
  /** Selected section. */
  section: SettingsSectionName;
  /** Exact saved revision to apply. */
  savedRevision: string;
  /** Exact currently effective revision, including null before first application. */
  expectedEffectiveRevision: string | null;
}
/** Durable acknowledgement of a save, also returned on an identical replay. */
export interface SettingsMutationReceipt {
  /** Original command identity. */
  commandId: string;
  /** Aggregate version immediately after this save. */
  version: string;
  /** Saved section. */
  section: SettingsSectionName;
  /** Newly saved revision. */
  savedRevision: string;
}
/** First shared provider surface; marketing/social screen operations compose with it later. */
export interface ManagementSettingsProvider {
  /**
   * Reads presentation context from the authenticated host.
   * @returns Safe capabilities and permissions, never authorization evidence.
   * @example
   * import type { ManagementSettingsProvider } from '@alneas/sitekit/management';
   * export const context = (p: ManagementSettingsProvider) => p.context();
   */
  context(): Promise<ManagementContext>;
  /**
   * Reads saved and effective settings.
   * @returns Current scoped snapshot.
   * @example
   * import type { ManagementSettingsProvider } from '@alneas/sitekit/management';
   * export const read = (p: ManagementSettingsProvider) => p.settings();
   */
  settings(): Promise<SettingsSnapshot>;
  /**
   * Saves one draft section without applying it.
   * @param input - Versioned complete section replacement.
   * @returns Durable save receipt.
   * @example
   * import type { ManagementSettingsProvider, SaveSettingsCommand } from '@alneas/sitekit/management';
   * export const save = (p: ManagementSettingsProvider, c: SaveSettingsCommand) => p.saveSettings(c);
   */
  saveSettings(input: SaveSettingsCommand): Promise<SettingsMutationReceipt>;
  /**
   * Reserves application without claiming an external effect succeeded.
   * @param input - Version and captured saved/effective revisions.
   * @returns Durable application request.
   * @example
   * import type { ManagementSettingsProvider, ApplySettingsCommand } from '@alneas/sitekit/management';
   * export const apply = (p: ManagementSettingsProvider, c: ApplySettingsCommand) => p.applySettings(c);
   */
  applySettings(input: ApplySettingsCommand): Promise<SettingsApplication>;
  /**
   * Reads an application's current status without executing it.
   * @param id - Opaque scoped application identity.
   * @returns Current request or completion receipt.
   * @example
   * import type { ManagementSettingsProvider } from '@alneas/sitekit/management';
   * export const status = (p: ManagementSettingsProvider, id: string) => p.application(id);
   */
  application(id: string): Promise<SettingsApplication>;
}
