import {createAuthorityDeliveryDriver} from '../management/authority-driver.js';
import { z } from 'zod';
import { createConnectionContext, createManagementSettingsService, ManagementFault, parseSettingsValues, parseConsoleReport } from '@alneas/sitekit/management';
import type { ManagementContext, ManagementConsoleProvider, ManagementScope } from '@alneas/sitekit/management';
import { parseMarketingSpendCsv } from '@alneas/sitekit/marketing';
import { createManagementHandler } from '../management/handler.js';
import { createD1ManagementSettingsStore } from '../management/store.js';
import { createD1MarketingServices } from '../marketing/storage.js';
import { createMarketingHandler } from '../marketing/handler.js';
import { createAccessAuthenticator } from './auth.js';
import { readStandaloneGrant } from './grants.js';
import type { StandaloneGrant, StandaloneOperation } from './grants.js';
import { standaloneRecord, readStandaloneRuntime, runStandaloneSettings, runnerSubject } from './runtime.js';
import { createSocialService, createD1SocialStore, createMetaOAuth, createMetaDeliveryDriver } from './social/index.js';
import type { PublicationEvent, SocialService } from './social/types.js';
import {verifyStandalonePublication,parsePublicationEvent} from './publication.js';
import { renderStandalonePage } from './render.js';
import type { StandaloneConfiguration, StandaloneBindings } from './types.js';
/** Reference host handlers, usable by fetch/scheduled entrypoints and a trusted CMS publication hook. */
export interface StandaloneHost {
  /**
      * Handles public site and authenticated management requests.
      * @param request - Trusted operation input.
      * @returns Operation result, or a safe failure.
      * @example import type { StandaloneHost } from '@alneas/sitekit-cloudflare/standalone';
      * export const invoke = (p: StandaloneHost, ...args: Parameters<StandaloneHost['fetch']>) => p.fetch(...args);
      */
  fetch(request: Request): Promise<Response>;
  /**
      * Runs captured settings activation, due posts and retention under the separate runner grant.
      * @returns Operation result, or a safe failure.
      * @example import type { StandaloneHost } from '@alneas/sitekit-cloudflare/standalone';
      * export const invoke = (p: StandaloneHost, ...args: Parameters<StandaloneHost['scheduled']>) => p.scheduled(...args);
      */
  scheduled(): Promise<{
  /** Trusted applications value. */
    applications: number;
  /** Trusted purged value. */
    purged: number
  }>;
  /**
      * Proposes automatic jobs only after a successful trusted content publication.
      * @param event - Trusted operation input.
      * @returns Operation result, or a safe failure.
      * @example import type { StandaloneHost } from '@alneas/sitekit-cloudflare/standalone';
      * export const invoke = (p: StandaloneHost, ...args: Parameters<StandaloneHost['published']>) => p.published(...args);
      */
  published(event: PublicationEvent): Promise<import('@alneas/sitekit/management').SocialJob[]>;
}
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' } });
const adminHtml = '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>SiteKit 管理</title><link rel="stylesheet" href="/admin/client.css"></head><body><div id="sitekit-admin"></div><script type="module" src="/admin/client.js"></script></body></html>';
/**
 * Composes public authentication, policy application, measurement and encrypted Meta delivery.
 * @param configuration - Immutable operator-owned site, identity and artifact configuration.
 * @param bindings - D1, assets and server-only secrets.
 * @returns Standard fetch, scheduled and trusted publication handlers.
 * @example
 * import { createStandaloneHost } from '@alneas/sitekit-cloudflare/standalone';
 * import type { StandaloneConfiguration, StandaloneBindings } from '@alneas/sitekit-cloudflare/standalone';
 * export const host = (config: StandaloneConfiguration, bindings: StandaloneBindings) => createStandaloneHost(config, bindings);
 */
export function createStandaloneHost(configuration: StandaloneConfiguration, bindings: StandaloneBindings): StandaloneHost {
  const config = structuredClone(configuration); config.initialValues = parseSettingsValues(config.initialValues);
  const origin = new URL(config.origin);
  if (origin.href !== origin.origin + '/' || origin.username || origin.password || !['http:', 'https:'].includes(origin.protocol) || (origin.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(origin.hostname))) throw new ManagementFault('invalid');
  z.strictObject({ tenantId: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/), siteId: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/) }).parse(config.scope);
  z.array(z.strictObject({ locale: z.string().min(2).max(64), path: z.string().regex(/^\/(?:[A-Za-z0-9._~-]+\/?)*$/).refine(p => !p.split('/').some(s => s === '.' || s === '..')), title: z.string().max(200), body: z.string().max(16000) })).min(1).max(100).parse(config.pages);
  if (new TextEncoder().encode(JSON.stringify(config.pages)).length > 512 * 1024 || new Set(config.pages.map(p => p.locale + ':' + p.path)).size !== config.pages.length) throw new ManagementFault('invalid');
  const db = bindings.database, scope = config.scope, authenticate = createAccessAuthenticator(config.access);
  const authority=bindings.authority;
  const status=async()=>{if(!authority){const used=await db.prepare('SELECT id FROM sitekit_transfer_business WHERE tenant_id=? AND site_id=? LIMIT 1').bind(scope.tenantId,scope.siteId).first();if(used)throw new ManagementFault('unavailable');return null;}const a=await authority.status();if(a.scope.tenantId!==scope.tenantId||a.scope.siteId!==scope.siteId)throw new ManagementFault('forbidden');return a};
  const effectiveRuntime=async()=>{const a=await status();if(a?.owner==='eaos'){if(!a.active)throw new ManagementFault('unavailable');return authority!.runtime()}return readStandaloneRuntime(db,scope)};
  const execute=async<T>(operation:string,work:()=>Promise<T>,uncertain?:(value:T)=>boolean)=>{if(!authority)return work();const a=await status();if(!a||a.owner!=='standalone'||!a.active)throw new ManagementFault('unavailable');return authority.executor.perform({id:crypto.randomUUID(),epoch:a.epoch,operation,fingerprint:operation},work,uncertain)};
  const socialReady = () => Boolean(config.meta && bindings.secrets && bindings.metaAppSecret);
  const grantFor = async (subject: string, kind: 'human' | 'service') => { const g = await readStandaloneGrant(db, scope, subject); if (!g?.enabled || g.kind !== kind) throw new ManagementFault('forbidden'); return g; };
  const admitted = async (grant: StandaloneGrant, operation: StandaloneOperation, epoch?: string) => {
    const live = await readStandaloneGrant(db, scope, grant.subject); if (!live?.enabled || live.kind !== grant.kind || live.version !== grant.version || !live.operations.includes(operation)) return false;
    if (!['read', 'readSettings', 'readApplication', 'completeApplication', 'manageConnection'].includes(operation)) { const s = (await standaloneRecord(db, scope)).snapshot; if (s.authority.kind !== 'standalone' || s.authority.status !== 'active' || (epoch && s.authority.epoch !== epoch)) return false; }
    return true;
  };
  const measurement = async () => {
    const runtime = await readStandaloneRuntime(db, scope);
    const coverage=await db.prepare('SELECT payload FROM sitekit_transfer_coverage WHERE tenant_id=? AND site_id=?').bind(scope.tenantId,scope.siteId).first<{payload:string}>();
    return createD1MarketingServices({ database: db, scope, startedAt:coverage?JSON.parse(coverage.payload).startedAt:config.startedAt, retentionDays: runtime.measurement?.retentionDays ?? config.initialValues.measurement.retentionDays });
  };
  const social = async (grant: StandaloneGrant): Promise<SocialService> => {
    if (!socialReady()) throw new ManagementFault('unavailable');
    const snapshot = (await standaloneRecord(db, scope)).snapshot, epoch = snapshot.authority.epoch;
    const runtime = await readStandaloneRuntime(db, scope);
    const nativeDriver=createMetaDeliveryDriver({apiVersion:config.meta!.apiVersion,allowedMediaOrigins:config.meta!.allowedMediaOrigins,...(bindings.fetch?{fetch:bindings.fetch}:{})});
    const driver=authority?createAuthorityDeliveryDriver({driver:nativeDriver,executor:authority.executor,epoch}):nativeDriver;
    return createSocialService({
      actor: { ...scope, userId: grant.subject }, store: createD1SocialStore({ database: db, scope, admission: { subject: grant.subject, version: grant.version, epoch } }), secrets: bindings.secrets!, oauth: createMetaOAuth({ appId: config.meta!.appId, appSecret: bindings.metaAppSecret!, apiVersion: config.meta!.apiVersion, redirectUri: new URL('/api/sitekit/management/oauth/callback', (origin.protocol==='https:'?config.origin:config.initialValues.site.url)).href, permissions: config.meta!.permissions, ...(bindings.fetch ? { fetch: bindings.fetch } : {}) }), driver, publicationOrigin: runtime.site?.url ?? config.initialValues.site.url, allowedMediaOrigins: config.meta!.allowedMediaOrigins, authorize: operation => admitted(grant, operation, epoch), publicationRule: async () => {
        const policy = (await readStandaloneRuntime(db, scope)).social;
        return policy ?? { enabled: false, accountIds: [], requiresApproval: true };
      }
    });
  };
  const context = async (grant: StandaloneGrant): Promise<ManagementContext> => {
    const snapshot = (await standaloneRecord(db, scope)).snapshot, live = await readStandaloneGrant(db, scope, grant.subject);
    const permission = (operation: StandaloneOperation) => live?.enabled && live.kind === 'human' && live.operations.includes(operation) ? { allowed: true as const } : { allowed: false as const, reason: 'forbidden' as const };
    return { protocolVersion: 1, scope, authority: snapshot.authority, capabilities: { settings: { available: true }, measurement: { available: true }, socialPublishing: socialReady() ? { available: true } : { available: false, reason: 'not_configured' } }, permissions: { readSettings: permission('readSettings'), saveSettings: permission('saveSettings'), applySettings: permission('applySettings'), readApplication: permission('readApplication') }, asOf: new Date().toISOString() };
  };
  const provider = async (grant: StandaloneGrant): Promise<ManagementConsoleProvider> => {
    const settings = createManagementSettingsService({ scope, store: createD1ManagementSettingsStore(db, grant.subject), authorize: async request => { const live = await readStandaloneGrant(db, scope, grant.subject); return { allowed: await admitted(grant, request.operation), version: live?.version ?? 'missing' }; }, verifyApplication: async () => false });
    const connection=authority?await authority.connection(grant.subject):undefined;
    const manage=async()=>{if(!await admitted(grant,'manageConnection'))throw new ManagementFault('forbidden')};
    return {
      ...(connection?{connection:{status:async()=>{const value=await connection.status();return {...value,canManage:value.canManage&&await admitted(grant,'manageConnection')}},plan:async input=>{await manage();return connection.plan(input)},advance:async input=>{await manage();return connection.advance(input)}}}:{}),
      settings: { ...settings, context: () => context(grant) }, marketing: {
        report: async query => parseConsoleReport(await (await measurement()).analytics.report(query)), importSpend: async csv => (await measurement()).campaigns.importSpend(parseMarketingSpendCsv(csv)),
        accounts: async () => (await social(grant)).accounts(), jobs: async () => (await social(grant)).jobs(), connect: async () => (await social(grant)).connect(), disconnect: async (id, version) => (await social(grant)).disconnect(id, version), createPost: async input => (await social(grant)).createPost(input), jobAction: async (id, version, action) => (await social(grant)).jobAction(id, version, action),
      }, access: async () => { const live = await readStandaloneGrant(db, scope, grant.subject); const permission = (operation: StandaloneOperation) => live?.enabled && live.operations.includes(operation) ? { allowed: true as const } : { allowed: false as const, reason: 'forbidden' as const }; return { read: permission('read'), post: permission('post'), spend: permission('spend'), connect: permission('connect'), disconnect: permission('disconnect'), reconcile: permission('reconcile') }; }
    };
  };
  const verified = async (request: Request) => { const identity = await authenticate(request); return identity ? grantFor(identity.subject, 'human') : null; };
  const gateway = createManagementHandler({ origin: config.origin, session: async request => { const g = await verified(request); return g ? { scope, provider: await provider(g), authorize: op => admitted(g, op) } : null; } });
  const host: StandaloneHost = {
    async fetch(request) {
      const url = new URL(request.url); if (url.origin !== origin.origin) return json({ error: 'not_found' }, 404);
      try {
        await status();
        if (url.pathname === '/admin/identity') { const identity = await authenticate(request); return identity ? json(identity) : json({ error: 'unauthorized' }, 401); }
        if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) {
          if (!['GET', 'HEAD'].includes(request.method)) return json({ error: 'method_not_allowed' }, 405);
          const g = await verified(request); if (!g) return json({ error: 'unauthorized' }, 401); if (!await admitted(g, 'read')) throw new ManagementFault('forbidden');
          if(url.pathname==='/admin/bootstrap'&&authority&&!(await status())!.active){const a=(await status())!;const now=new Date();return json({identityKey:g.subject+':'+g.version,context:createConnectionContext(a),initialQuery:{from:new Date(now.getTime()-30*86400000).toISOString(),to:now.toISOString(),timezone:'UTC',currency:'JPY'}})}
          if (url.pathname === '/admin/bootstrap' && (await status())?.owner==='eaos') {const a=await status();if(!a?.active)throw new ManagementFault('unavailable');return authority!.management(request,g.subject);}
          if (url.pathname === '/admin/bootstrap') { const runtime = await readStandaloneRuntime(db, scope); const now = new Date(); return json({ identityKey: g.subject + ':' + g.version, context: await context(g), initialQuery: { from: new Date(now.getTime() - 30 * 86400000).toISOString(), to: now.toISOString(), timezone: runtime.localization?.timezone ?? config.initialValues.localization.timezone, currency: runtime.reporting?.currency ?? config.initialValues.reporting.currency } }); }
          if (url.pathname === '/admin' || url.pathname === '/admin/') return new Response(request.method === 'HEAD' ? null : adminHtml, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; base-uri 'none'; frame-ancestors 'none'" } });
          const asset = await bindings.assets.fetch(request); const headers = new Headers(asset.headers); headers.set('Cache-Control', 'private, no-store'); return new Response(asset.body, { status: asset.status, headers });
        }
        if(url.pathname.startsWith('/api/sitekit/management/')&&!url.pathname.startsWith('/api/sitekit/management/connection/')){
          const a=await status();if(a&&!a.active&&url.pathname.endsWith('/context')){const g=await verified(request);if(!g)return json({error:'unauthorized'},401);return json(createConnectionContext(a))}if(a?.owner==='eaos'){const g=await verified(request);if(!g)return json({error:'unauthorized'},401);if(!await admitted(g,'read'))throw new ManagementFault('forbidden');if(!a.active)throw new ManagementFault('unavailable');if(request.method!=='GET'&&request.headers.get('Origin')!==origin.origin)throw new ManagementFault('forbidden');return authority!.management(request,g.subject)}
        }
        if (url.pathname === '/api/sitekit/management/oauth/callback') {
          if (request.method !== 'GET' || url.searchParams.size !== new Set(url.searchParams.keys()).size) return json({ error: 'invalid' }, 400);
          const g = await verified(request); if (!g) return json({ error: 'unauthorized' }, 401);
          const input = z.strictObject({ state: z.string().min(1).max(160), code: z.string().min(1).max(4096) }).parse(Object.fromEntries(url.searchParams));
          await execute('oauth',async()=>{await (await social(g)).completeConnect(input)}); return new Response(null, { status: 303, headers: { Location: origin.origin + '/admin?connection=success', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
        }
        if (url.pathname.startsWith('/api/sitekit/management/')) {
          const work=async()=>{const response = await gateway(request, {});
          if (url.pathname.endsWith('/settings/apply') && response.status === 202) { try { await runStandaloneSettings(db, config); } catch { console.warn(JSON.stringify({ component: 'sitekit', operation: 'settings_application', status: 'pending' })); } }
          return response;};
          const reconciliation=url.pathname.endsWith('/action')&&request.method==='POST'&&(await request.clone().json().catch(()=>null))?.action==='reconcile';
          return request.method==='POST'&&!reconciliation&&!url.pathname.startsWith('/api/sitekit/management/connection/')?execute('management:'+url.pathname,work,r=>r.status>=500):work();
        }
        if (url.pathname === '/sitekit/runtime') {
          const runtime = await effectiveRuntime();
          return json({ siteId: scope.siteId, site: runtime.site ?? null, localization: runtime.localization ?? null, measurement: runtime.measurement ?? { enabled: false, retentionDays: 90, consentMode: 'opt-in', consentDays: 180 } });
        }
        if (url.pathname === '/api/analytics') {
          const a=await status();if(a?.owner==='eaos'){if(!a.active)throw new ManagementFault('unavailable');return authority!.analytics(request)}if(a&&!a.active)throw new ManagementFault('unavailable');
          const s = (await standaloneRecord(db, scope)).snapshot;
          const runtime = await readStandaloneRuntime(db, scope);
          if (s.authority.kind !== 'standalone' || s.authority.status !== 'active' || !runtime.measurement?.enabled) return json({ accepted: 0 }, 202);
          const services = await measurement(); return execute('ingest',()=>createMarketingHandler({ publicScope: () => scope, services: () => services, authorize: () => null })(request, {}),r=>r.status>=500);
        }
        if (url.pathname==='/api/sitekit/publication') {
          if(!bindings.publicationKey)return json({error:'unauthorized'},401);
          const event=await verifyStandalonePublication(request,bindings.publicationKey);
          if(!event)return json({error:'unauthorized'},401);
          return json(await host.published(event),202);
        }
        if (url.pathname.startsWith('/api/')) return json({ error: 'not_found' }, 404);
        if (!['GET', 'HEAD'].includes(request.method)) return json({ error: 'method_not_allowed' }, 405);
        if (url.pathname.startsWith('/assets/') || url.pathname === '/favicon.ico') return bindings.assets.fetch(request);
        return renderStandalonePage(request, await effectiveRuntime(), config.pages);
      } catch (e) { if (e instanceof ManagementFault) return json({ error: e.code }, { invalid: 400, forbidden: 403, conflict: 409, capacity: 413, unavailable: 503 }[e.code]); if (e instanceof Error && e.name === 'ZodError') return json({ error: 'invalid' }, 400); return json({ error: 'unavailable' }, 503); }
    },
    async scheduled() {
      const a=await status();if(a?.owner==='eaos')return {applications:0,purged:0};
      return execute('scheduled',async()=>{
      const applications = await runStandaloneSettings(db, config);
      const grant = await grantFor(runnerSubject, 'service');
      if (!await admitted(grant, 'run')) throw new ManagementFault('forbidden');
      if (socialReady()) await (await social(grant)).runDue(10);
      const runtime = await readStandaloneRuntime(db, scope);
      const purged = runtime.measurement ? (await measurement()).analytics.purge() : Promise.resolve(0);
      return { applications, purged: await purged };});
    },
    async published(event) { const a=await status();if(a?.owner==='eaos'){if(!a.active)throw new ManagementFault('unavailable');return authority!.published(parsePublicationEvent(event))}return execute('publication',async()=>{const grant = await grantFor('sitekit:publisher', 'service'); if (!await admitted(grant, 'publication')) throw new ManagementFault('forbidden'); return (await social(grant)).onPublished(parsePublicationEvent(event));}); },
  };
  return host;
}
