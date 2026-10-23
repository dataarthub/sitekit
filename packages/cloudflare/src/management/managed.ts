import { ManagementFault, createManagementSettingsService, parseConsoleReport, parseConsoleQuery, parseManagementContext, parseSettingsSnapshot } from '@alneas/sitekit/management';
import type { ManagementConsoleProvider, ManagementScope, ManagementSettingsStore, ManagementSettingsServiceOptions, SettingsAdmission, SettingsRecord, StoredSettingsApplication, SettingsValues, CompleteSettingsApplication } from '@alneas/sitekit/management';
import { parseMarketingSpendCsv } from '@alneas/sitekit/marketing';
import type { MarketingServices } from '@alneas/sitekit/marketing';
import type { SocialServiceOptions, SocialService, PublicationEvent } from '../standalone/social/types.js';
import { parsePublicationEvent } from '../standalone/publication.js';
import { createManagementHandler } from './handler.js';

/** Server-owned EAOS composition. Its stores must atomically fence live native admission. */
export interface ManagedSiteOptions {
  /** Verified tenant/site, never request JSON. */
  scope: ManagementScope;
  /** Verified human or service principal. */
  userId: string;
  /** Server-bound execution epoch; ownership changes invalidate this runtime. */
  authorityEpoch: string;
  /** Service principals alone may invoke background execution. */
  kind: 'human' | 'service';
  /** Exact gateway origin. */
  origin: string;
  /** Common HTTP prefix, ending in a slash. */
  basePath?: string;
  /** Single authoritative native settings store. */
  settingsStore: ManagementSettingsStore;
  /**
      * Checks premium, lifecycle, site/action rights and returns their current transaction generation.
      * @param operation - Verified server operation input.
      * @param accountId - Verified server operation input.
      * @returns Authoritative result, or a safe admission/validation failure.
      * @example import type {ManagedSiteOptions} from '@alneas/sitekit-cloudflare/management';
      * export const invoke = (o:ManagedSiteOptions,...args:Parameters<ManagedSiteOptions['authorize']>) => o.authorize(...args);
      */
  authorize(operation: string, accountId?: string): Promise<SettingsAdmission>;
  /** Actual EAOS target activation and durable proof lookup. */
  activation: {
    /**
        * Apply exactly this immutable request under the supplied source/admission fences, or resume its existing receipt.
        * @param record - Verified server operation input.
        * @param captured - Verified server operation input.
        * @param permissionVersion - Verified server operation input.
        * @returns Authoritative result, or a safe admission/validation failure.
        * @example import type {ManagedSiteOptions} from '@alneas/sitekit-cloudflare/management';
        * export const invoke = (o:ManagedSiteOptions,...args:Parameters<ManagedSiteOptions['activation']['apply']>) => o.activation.apply(...args);
        */
    apply(record: SettingsRecord, captured: StoredSettingsApplication, permissionVersion: string): Promise<Omit<CompleteSettingsApplication, 'protocolVersion' | 'applicationId' | 'expectedVersion' | 'authorityEpoch'> | null>;
    /** Independently verify an existing target receipt; never execute an effect here. */
    verify: ManagementSettingsServiceOptions['verifyApplication'];
  };
  /**
      * Canonical measurement service hosted by EAOS, using actually applied configuration.
      * @param effective - Verified server operation input.
      * @returns Authoritative result, or a safe admission/validation failure.
      * @example import type {ManagedSiteOptions} from '@alneas/sitekit-cloudflare/management';
      * export const invoke = (o:ManagedSiteOptions,...args:Parameters<ManagedSiteOptions['measurement']>) => o.measurement(...args);
      */
  measurement(effective: Partial<SettingsValues>): Promise<MarketingServices>;
  /**
     * Encrypted provider implementation and native CAS store. Missing configuration is unavailable.
     * @param context - Verified server operation input.
     * @returns Authoritative result, or a safe admission/validation failure.
     * @example import type {ManagedSiteOptions} from '@alneas/sitekit-cloudflare/management';
     * export const invoke = (o:ManagedSiteOptions,...args:Parameters<NonNullable<ManagedSiteOptions['social']>>) => o.social?.(...args);
     */
  social?(context:Pick<SocialServiceOptions,'actor'|'authorize'|'publicationRule'|'publicationOrigin'>):Promise<SocialService>;
}
/** EAOS background pass counts; no external success is fabricated. */
export interface ManagedSiteRunResult {
  /** Settings applications confirmed with a durable target receipt. */
  applications: number;
  /** Expired measurement rows removed under the applied retention policy. */
  purged: number;
}
/** Server ports around one verified EAOS principal, site and execution epoch. */
export interface ManagedSiteRuntime {
  /** Shared public screen provider; every direct operation still checks admission. */
  provider: ManagementConsoleProvider;
  /**
      * Handles the common HTTP contract after the host verifies the actual principal.
      * @param request - Verified operation input.
      * @returns Authoritative result, or a safe failure.
      * @example import type {ManagedSiteRuntime} from '@alneas/sitekit-cloudflare/management';
      * export const invoke = (r:ManagedSiteRuntime,...args:Parameters<ManagedSiteRuntime['fetch']>) => r.fetch(...args);
      */
  fetch(request: Request): Promise<Response>;
  /**
      * Confirms actual native applications and executes due posts using a service principal.
      * @returns Authoritative result, or a safe failure.
      * @example import type {ManagedSiteRuntime} from '@alneas/sitekit-cloudflare/management';
      * export const invoke = (r:ManagedSiteRuntime,...args:Parameters<ManagedSiteRuntime['run']>) => r.run(...args);
      */
  run(): Promise<ManagedSiteRunResult>;
  /**
      * Finishes the actor-bound OAuth exchange without returning credentials.
      * @param input - Verified operation input.
      * @returns Authoritative result, or a safe failure.
      * @example import type {ManagedSiteRuntime} from '@alneas/sitekit-cloudflare/management';
      * export const invoke = (r:ManagedSiteRuntime,...args:Parameters<ManagedSiteRuntime['completeConnect']>) => r.completeConnect(...args);
      */
  completeConnect(input: Parameters<SocialService['completeConnect']>[0]): Promise<void>;
  /**
      * Admits a successful content-publication event using a service principal.
      * @param event - Verified operation input.
      * @returns Authoritative result, or a safe failure.
      * @example import type {ManagedSiteRuntime} from '@alneas/sitekit-cloudflare/management';
      * export const invoke = (r:ManagedSiteRuntime,...args:Parameters<ManagedSiteRuntime['published']>) => r.published(...args);
      */
  published(event: PublicationEvent): ReturnType<SocialService['onPublished']>;
  /**
      * Admits a trusted scoped relay of validated browser telemetry.
      * @param input - Verified operation input.
      * @returns Authoritative result, or a safe failure.
      * @example import type {ManagedSiteRuntime} from '@alneas/sitekit-cloudflare/management';
      * export const invoke = (r:ManagedSiteRuntime,...args:Parameters<ManagedSiteRuntime['ingest']>) => r.ingest(...args);
      */
  ingest(input: Parameters<MarketingServices['analytics']['ingest']>[0]): ReturnType<MarketingServices['analytics']['ingest']>;
  /**
      * Records an authenticated confirmed outcome, independently of browser events.
      * @param input - Verified operation input.
      * @returns Authoritative result, or a safe failure.
      * @example import type {ManagedSiteRuntime} from '@alneas/sitekit-cloudflare/management';
      * export const invoke = (r:ManagedSiteRuntime,...args:Parameters<ManagedSiteRuntime['outcome']>) => r.outcome(...args);
      */
  outcome(input: Parameters<MarketingServices['outcomes']['record']>[0]): ReturnType<MarketingServices['outcomes']['record']>;
}
/**
 * Composes common operations over EAOS-owned storage, live admission and effect ports.
 * @param options - Verified server configuration; never browser-provided factories or credentials.
 * @returns Common provider plus HTTP and trusted execution ports. No local fallback exists.
 * @example
 * import {createManagedSiteRuntime,type ManagedSiteOptions} from '@alneas/sitekit-cloudflare/management';
 * export const connect = (options:ManagedSiteOptions) => createManagedSiteRuntime(options);
 */
export function createManagedSiteRuntime(options: ManagedSiteOptions): ManagedSiteRuntime {
  const scope = Object.freeze({ ...options.scope });
  if (!options.userId || !['human', 'service'].includes(options.kind)) throw new ManagementFault('invalid');
  const record = async () => {
    const r = await options.settingsStore.read(scope); if (!r) throw new ManagementFault('unavailable');
    const s = parseSettingsSnapshot(r.snapshot);
    if (s.scope.tenantId !== scope.tenantId || s.scope.siteId !== scope.siteId) throw new ManagementFault('forbidden');
    if (s.authority.kind !== 'eaos' || s.authority.status !== 'active' || s.authority.epoch !== options.authorityEpoch) throw new ManagementFault('conflict');
    return r;
  };
  const admission = async (operation: string, accountId?: string) => {
    await record();
    if (options.kind !== 'service' && ['run', 'publish', 'publication', 'ingest', 'outcome', 'completeApplication'].includes(operation)) throw new ManagementFault('forbidden');
    const a = await options.authorize(operation, accountId); if (a.allowed !== true || !a.version) throw new ManagementFault('forbidden'); return a;
  };
  const effective = async (): Promise<Partial<SettingsValues>> => {
    const r = await record(); return Object.fromEntries(Object.entries(r.snapshot.sections).filter(([, s]) => s.effective).map(([name, s]) => [name, s.effective!.value]));
  };
  const settings = createManagementSettingsService({ scope, store: options.settingsStore, authorize: async r => admission(r.operation), verifyApplication: options.activation.verify });
  const context = async () => {
    await admission('read'); const s = await settings.settings();
    const permission = async (operation: string) => { const a = await options.authorize(operation); return a.allowed ? { allowed: true as const } : { allowed: false as const, reason: 'forbidden' as const }; };
    const permissions = { readSettings: await permission('readSettings'), saveSettings: await permission('saveSettings'), applySettings: await permission('applySettings'), readApplication: await permission('readApplication') };
    await admission('read'); return parseManagementContext({ protocolVersion: 1, scope, authority: s.authority, capabilities: { settings: { available: true }, measurement: { available: true }, socialPublishing: options.social ? { available: true } : { available: false, reason: 'not_configured' } }, permissions, asOf: new Date().toISOString() });
  };
  const measurement = async () => {
    const service = await options.measurement(await effective());
    if (service.scope.tenantId !== scope.tenantId || service.scope.siteId !== scope.siteId) throw new ManagementFault('forbidden'); return service;
  };
  const social = async () => {
    if (!options.social) throw new ManagementFault('unavailable');
    const value = await effective(); if (!value.site) throw new ManagementFault('unavailable');
    const service=await options.social({actor:{...scope,userId:options.userId},publicationOrigin:value.site.url,authorize:async(op,id)=>{await admission(op,id);return true;},publicationRule:async()=> (await effective()).social??{enabled:false,accountIds:[],requiresApproval:true}});
    if(service.scope.tenantId!==scope.tenantId||service.scope.siteId!==scope.siteId)throw new ManagementFault('forbidden');return service;
  };
  const call = async<T>(operation: string, work: () => Promise<T>) => { await admission(operation); const value = await work(); await admission(operation); return value; };
  const provider: ManagementConsoleProvider = {
    settings: { context, settings: settings.settings, saveSettings: settings.saveSettings, applySettings: settings.applySettings, application: settings.application }, marketing: {
      report: q => call('read', async () => parseConsoleReport(await (await measurement()).analytics.report(parseConsoleQuery(q)))),
      importSpend: csv => call('spend', async () => (await measurement()).campaigns.importSpend(parseMarketingSpendCsv(csv))),
      accounts: () => call('read', async () => (await social()).accounts()), jobs: () => call('read', async () => (await social()).jobs()), connect: () => call('connect', async () => (await social()).connect()),
      disconnect: (id, version) => call('disconnect', async () => (await social()).disconnect(id, version)), createPost: input => call('post', async () => (await social()).createPost(input)), jobAction: (id, version, action) => call(action === 'reconcile' ? 'reconcile' : 'post', async () => (await social()).jobAction(id, version, action)),
    }, access: async () => { await admission('read'); const rows = await Promise.all(['read', 'spend', 'connect', 'disconnect', 'post', 'reconcile'].map(async op => { const a = await options.authorize(op); return [op, a.allowed ? { allowed: true } : { allowed: false, reason: 'forbidden' }]; })); await admission('read'); return Object.fromEntries(rows) as Awaited<ReturnType<ManagementConsoleProvider['access']>>; }
  };
  const handler = createManagementHandler({ origin: options.origin, ...(options.basePath ? { basePath: options.basePath } : {}), session: async () => options.kind === 'human' ? { scope, provider, authorize: async op => { await admission(op); return true; } } : null });
  return {
    /** Common screen provider. Direct calls still require live native admission. */
    provider,
    /** Authenticated host calls this port only after resolving the actual principal and registered site. */
    fetch: (request: Request) => handler(request, {}),
    /**
     * Resume actual native applications and deliver due jobs; service principal only.
     * @returns Authoritative result, or a safe admission/validation failure.
     * @example import {createManagedSiteRuntime,type ManagedSiteOptions} from '@alneas/sitekit-cloudflare/management';
     * export const runtime = (o:ManagedSiteOptions) => createManagedSiteRuntime(o);
     */
    async run() {
      await admission('run'); let applications = 0;
      for (const captured of (await record()).applications.filter(a => a.view.status === 'applying').slice(0, 10)) {
        const a = await admission('completeApplication'), source = await record();
        const proof = await options.activation.apply(source, captured, a.version); if (!proof) continue;
        const latest = (await record()).snapshot;
        await settings.completeApplication({ protocolVersion: 1, applicationId: captured.view.id, expectedVersion: latest.version, authorityEpoch: captured.view.authorityEpoch, ...proof }); applications++;
      }
      await admission('run'); if (options.social) await (await social()).runDue(10);
      await admission('run'); const value = await effective(); const purged = value.measurement ? await (await measurement()).analytics.purge() : 0;
      return { applications, purged };
    },
    /** Actor-bound OAuth completion, never a token-bearing browser DTO. */
    completeConnect: (input: {/** Server-owned operation value. */
      /** Server-owned operation value. */
      state: string;/** Server-owned operation value. */
      /** Server-owned operation value. */
      code: string
    }) => call('connect', async () => (await social()).completeConnect(input)),
    /** Successful content-publication hook, service principal only. */
    published: (event: PublicationEvent) => call('publication', async () => (await social()).onPublished(parsePublicationEvent(event))),
    /** Trusted site relay; browser telemetry is validated by the canonical ingester. */
    ingest: (input: Parameters<MarketingServices['analytics']['ingest']>[0]) => call('ingest', async () => (await effective()).measurement?.enabled ? (await measurement()).analytics.ingest(input) : { accepted: 0, rejected: 0, duplicateEventIds: [] }),
    /** Trusted confirmed lead/booking port, separate from browser telemetry. */
    outcome: (input: Parameters<MarketingServices['outcomes']['record']>[0]) => call('outcome', async () => (await measurement()).outcomes.record(input)),
  };
}
