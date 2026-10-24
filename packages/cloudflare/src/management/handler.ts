import { z } from 'zod';
import {parseConnectionStatus,parseConnectionPlan,parseConnectionAdvance} from '@alneas/sitekit/management';
import { ManagementFault, parseManagementContext, parseSettingsSnapshot, parseSaveSettingsCommand, parseApplySettingsCommand, parseSettingsMutationReceipt, parseSettingsApplication, parseConsoleQuery, parseSocialPost, parseConsoleReportView, parseConsoleAccounts, parseConsoleJobs, parseConsoleJob, parseConsoleAccess, parseConsoleConnection, parseConsoleSpend } from '@alneas/sitekit/management';
import type { ManagementConsoleProvider, ManagementScope, MarketingOperation, SettingsOperation } from '@alneas/sitekit/management';
/** One authenticated server session; never construct it from unverified identity headers. */
export interface ManagementSession {
 /** Authenticated tenant/site binding. */
 scope: ManagementScope;
 /** Actor-bound service ports. The settings service rechecks live admission and atomic grants. */
 provider: ManagementConsoleProvider;
 /**
  * Rechecks current session, site and action rights on every request.
  * @param operation - Immediate operation or settings action.
  * @returns Exactly true to admit the action.
  * @example
  * import type { ManagementSession } from '@alneas/sitekit-cloudflare/management';
  * export const admit = (s: ManagementSession) => s.authorize('readSettings');
  */
 authorize(operation:MarketingOperation|Exclude<SettingsOperation,'completeApplication'>):Promise<boolean>;
}
/** Standalone or managed same-origin gateway configuration.
 * @typeParam TEnv - Deployment bindings passed to the verified session resolver.
 */
export interface ManagementHandlerOptions<TEnv> {
 /** Exact deployment origin; local HTTP is limited to loopback hosts. */
 origin:string;
 /** Route prefix shared with the browser provider. */
 basePath?:string;
 /**
  * Verifies the actual session and binds scope and provider. No anonymous default exists.
  * @param request - Incoming request.
  * @param env - Deployment bindings.
  * @returns Verified session or null for unauthenticated callers.
  * @example
  * import type { ManagementHandlerOptions } from '@alneas/sitekit-cloudflare/management';
  * export const session = (o: ManagementHandlerOptions<unknown>, r: Request) => o.session(r, {});
  */
 session(request:Request,env:TEnv):Promise<ManagementSession|null>;
}
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
async function read(request:Request,csv=false) {
 if(!(csv?/^text\/csv(?:;|$)/i:/^application\/json(?:;|$)/i).test(request.headers.get('Content-Type')??'')) throw new ManagementFault('invalid');
 const reader=request.body?.getReader(); if(!reader) throw new ManagementFault('invalid');
 let size=0,text=''; const decoder=new TextDecoder('utf-8',{fatal:true});
 try {for(;;){const chunk=await reader.read();if(chunk.done) break;size+=chunk.value.byteLength;if(size>128*1024){await reader.cancel();throw new ManagementFault('capacity');}text+=decoder.decode(chunk.value,{stream:true});}text+=decoder.decode();return csv?text:JSON.parse(text);}
 catch(e){if(e instanceof ManagementFault)throw e;throw new ManagementFault('invalid');}finally{reader.releaseLock();}
}
const id=z.string().trim().min(1).max(160);
const action=z.strictObject({id,version:z.number().int().positive(),action:z.enum(['approve','cancel','retry','reconcile'])});
function bound<T extends {scope:ManagementScope}>(result:T,scope:ManagementScope):T {if(result.scope.tenantId!==scope.tenantId || result.scope.siteId!==scope.siteId)throw new ManagementFault('forbidden');return result;}
/**
 * Creates a common gateway around authoritative host ports, with no effect executor or fallback store.
 * @typeParam TEnv - Deployment binding type.
 * @param options - Exact origin and verified session resolver.
 * @returns Request handler; trusted application completion is deliberately not a browser route.
 * @example
 * import { createManagementHandler } from '@alneas/sitekit-cloudflare/management';
 * import type { ManagementSession } from '@alneas/sitekit-cloudflare/management';
 * export const handler = (resolve: (r: Request, env: unknown) => Promise<ManagementSession | null>) => createManagementHandler({origin:'https://example.test',session:resolve});
 */
export function createManagementHandler<TEnv>(options:ManagementHandlerOptions<TEnv>): (request:Request,env:TEnv)=>Promise<Response> {
 const origin=new URL(options.origin),base=options.basePath??'/api/sitekit/management/';
 if(origin.href!==origin.origin+'/' || origin.username || origin.password || !['http:','https:'].includes(origin.protocol) || (origin.protocol==='http:'&&!['localhost','127.0.0.1'].includes(origin.hostname)) || !/^\/(?!\/)[A-Za-z0-9/_-]+\/$/.test(base))throw new ManagementFault('invalid');
 return async(request:Request,env:TEnv):Promise<Response>=>{
 const url=new URL(request.url);
 if(url.origin!==origin.origin || !url.pathname.startsWith(base))return json({error:'not_found'},404);
 const route=url.pathname.slice(base.length);
 const reads:Record<string,MarketingOperation|SettingsOperation>={'connection/status':'read',context:'read',settings:'readSettings',application:'readApplication',access:'read',report:'read',accounts:'read',posts:'read'};
 const writes:Record<string,MarketingOperation|SettingsOperation>={'connection/plan':'read','connection/advance':'read','settings/save':'saveSettings','settings/apply':'applySettings',spend:'spend',connect:'connect',disconnect:'disconnect',posts:'post',action:'post'};
 let operation=request.method==='GET'?reads[route]:request.method==='POST'?writes[route]:undefined;
 if(!operation)return json({error:'method_not_allowed'},405);
 if(request.method==='POST'&&request.headers.get('Origin')!==origin.origin)return json({error:'forbidden'},403);
 try {
  if(url.searchParams.size!==new Set(url.searchParams.keys()).size || (!['report','application'].includes(route)&&url.searchParams.size))throw new ManagementFault('invalid');
  const session=await options.session(request,env);if(!session)return json({error:'unauthorized'},401);
  z.strictObject({tenantId:z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),siteId:z.string().regex(/^[A-Za-z0-9_-]{1,80}$/)}).parse(session.scope);
  const input=request.method==='POST'?await read(request,route==='spend'):undefined;
  const parsedAction=route==='action'?action.parse(input):undefined;
  if(parsedAction?.action==='reconcile')operation='reconcile';
  if(await session.authorize(operation as MarketingOperation|Exclude<SettingsOperation,'completeApplication'>)!==true)throw new ManagementFault('forbidden');
  if(route.startsWith('connection/')){
   const connection=session.provider.connection;if(!connection)throw new ManagementFault('unavailable');
   const result=route==='connection/status'?await connection.status():route==='connection/plan'?await connection.plan(parseConnectionPlan(input)):await connection.advance(parseConnectionAdvance(input));
   return json(bound(parseConnectionStatus(result),session.scope));
  }
  const {settings,marketing}=session.provider;
  const context=bound(parseManagementContext(await settings.context()),session.scope);
  if(request.method==='POST' && context.authority.status!=='active')throw new ManagementFault('conflict');
  const capability=route.startsWith('settings')||route==='application'||route==='context'?context.capabilities.settings:route==='report'||route==='spend'?context.capabilities.measurement:context.capabilities.socialPublishing;
  if(route!=='access'&&route!=='context'&&!capability.available)throw new ManagementFault('forbidden');
  if(route==='context')return json(context);
  if(route==='settings')return json(bound(parseSettingsSnapshot(await settings.settings()),session.scope));
  if(route==='settings/save')return json(parseSettingsMutationReceipt(await settings.saveSettings(parseSaveSettingsCommand(input))));
  if(route==='settings/apply')return json(parseSettingsApplication(await settings.applySettings(parseApplySettingsCommand(input))),202);
  if(route==='application') {const args=z.strictObject({id}).parse(Object.fromEntries(url.searchParams));return json(parseSettingsApplication(await settings.application(args.id)));}
  if(route==='access')return json(parseConsoleAccess(await session.provider.access()));
  if(route==='report')return json(parseConsoleReportView(await marketing.report(parseConsoleQuery(Object.fromEntries(url.searchParams)))));
  if(route==='accounts')return json(parseConsoleAccounts(await marketing.accounts()));
  if(route==='posts')return request.method==='GET'?json(parseConsoleJobs(await marketing.jobs())):json(parseConsoleJobs(await marketing.createPost(parseSocialPost(input))),202);
  if(route==='action')return json(parseConsoleJob(await marketing.jobAction(parsedAction!.id,parsedAction!.version,parsedAction!.action)));
  if(route==='disconnect'){const v=z.strictObject({id,version:z.number().int().positive()}).parse(input);await marketing.disconnect(v.id,v.version);return json({disconnected:true});}
  if(route==='spend')return json(parseConsoleSpend(await marketing.importSpend(String(input))),202);
  z.strictObject({}).parse(input);return json(parseConsoleConnection(await marketing.connect()));
 }catch(e){if(e instanceof ManagementFault)return json({error:e.code},{invalid:400,forbidden:403,conflict:409,capacity:413,unavailable:503}[e.code]);if(e instanceof Error&&e.name==='ZodError')return json({error:'invalid'},400);return json({error:'unavailable'},503);}
 };
}
