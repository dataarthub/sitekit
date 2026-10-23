import {parseConnectionStatus,parseConnectionPlan,parseConnectionAdvance} from './authority.js';
import { z } from 'zod';
import type { ManagementConsoleProvider, MarketingAccess, SocialAccount, SocialJob } from './console-contracts.js';
import { parseApplySettingsCommand, parseManagementContext, parseSaveSettingsCommand, parseSettingsApplication, parseSettingsMutationReceipt, parseSettingsSnapshot } from './schemas.js';
import { parseConsoleQuery, parseConsoleReportView, parseSocialPost, parseConsoleAccounts, parseConsoleJobs, parseConsoleJob, parseConsoleAccess, parseConsoleConnection, parseConsoleSpend } from './console-schemas.js';
import { ManagementFault } from './errors.js';
/** Browser transport configuration. */
export interface ManagementHttpOptions {
  /** Exact application origin; defaults to the current browser origin. */
  origin?: string;
  /** Same-origin route prefix. */
  basePath?: string;
  /** Fetch transport, normally the browser implementation. */
  fetch?: typeof fetch;
}
/**
 * Creates bounded same-origin settings and marketing browser ports. Writes never retry automatically.
 * @param options - Origin, route prefix and fetch transport.
 * @returns Shared provider composition without credentials or server dependencies.
 * @example
 * import { createManagementHttpProvider } from '@alneas/sitekit/management/http';
 * export const provider = createManagementHttpProvider({origin:'https://example.test'});
 */
export function createManagementHttpProvider(options: ManagementHttpOptions = {}): ManagementConsoleProvider {
  const origin = new URL(options.origin ?? globalThis.location?.origin);
  const base = options.basePath ?? '/api/sitekit/management/';
  if (origin.href !== origin.origin+'/' || origin.username || origin.password || !['https:','http:'].includes(origin.protocol) || (origin.protocol==='http:' && !['localhost','127.0.0.1'].includes(origin.hostname)) || !/^\/(?!\/)[A-Za-z0-9/_-]+\/$/.test(base)) throw new ManagementFault('invalid');
  const request = async <T>(path:string, parse:(v:unknown)=>T, input?:unknown, csv=false):Promise<T> => {
    const response=await (options.fetch ?? fetch)(origin.origin+base+path,{method:input===undefined?'GET':'POST',credentials:'same-origin',redirect:'error',cache:'no-store',headers:input===undefined?{}:{'Content-Type':csv?'text/csv; charset=utf-8':'application/json'},...(input===undefined?{}:{body:csv?String(input):JSON.stringify(input)})});
    if (!response.ok) throw new ManagementFault(({400:'invalid',403:'forbidden',409:'conflict',413:'capacity'} as const)[response.status as 400] ?? 'unavailable');
    const reader=response.body?.getReader(); if(!reader) throw new ManagementFault('unavailable');
    let size=0, text=''; const decoder=new TextDecoder('utf-8',{fatal:true});
    try {
      for(;;) { const part=await reader.read(); if(part.done) break; size+=part.value.byteLength; if(size>1024*1024) {await reader.cancel(); throw new ManagementFault('capacity');} text+=decoder.decode(part.value,{stream:true}); }
      return parse(JSON.parse(text+decoder.decode()));
    } catch(error) { if(error instanceof ManagementFault) throw error; throw new ManagementFault('unavailable'); }
    finally {reader.releaseLock();}
  };
  return {
    connection:{status:()=>request('connection/status',parseConnectionStatus),plan:input=>request('connection/plan',parseConnectionStatus,parseConnectionPlan(input)),advance:input=>request('connection/advance',parseConnectionStatus,parseConnectionAdvance(input))},
    settings:{context:()=>request('context',parseManagementContext),settings:()=>request('settings',parseSettingsSnapshot),saveSettings:input=>request('settings/save',parseSettingsMutationReceipt,parseSaveSettingsCommand(input)),applySettings:input=>request('settings/apply',parseSettingsApplication,parseApplySettingsCommand(input)),application:id=>request('application?id='+encodeURIComponent(id),parseSettingsApplication)},
    access:()=>request('access',parseConsoleAccess),
    marketing:{
      report:query=>request('report?'+new URLSearchParams({...parseConsoleQuery(query)}),parseConsoleReportView),
      importSpend:csv=>request('spend',parseConsoleSpend,csv,true),
      accounts:()=>request('accounts',parseConsoleAccounts),
      jobs:()=>request('posts',parseConsoleJobs),
      createPost:input=>request('posts',parseConsoleJobs,parseSocialPost(input)),
      jobAction:(id,version,action)=>request('action',parseConsoleJob,{id,version,action}),
      disconnect:async(id,version)=>{await request('disconnect',v=>z.strictObject({disconnected:z.literal(true)}).parse(v),{id,version});},
      connect:()=>request('connect',parseConsoleConnection,{}),
    },
  };
}
