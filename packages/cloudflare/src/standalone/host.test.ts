import {expect,it} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
import {sqliteBinding} from '../marketing/testing.test.js';
import {parseSettingsValues} from '@alneas/sitekit/management';
import {createManagementHttpProvider} from '@alneas/sitekit/management/http';
import {createStandaloneHost,createStandaloneBootstrapSql,createStandalonePublicationRequest} from './index.js';
import {createSecretBox} from './social/secrets.js';
it('runs verified admin, actual settings, OAuth, publication proposals and Cron using public ports',async()=>{
 const db=new DatabaseSync(':memory:');try{
 const {privateKey,publicKey}=await generateKeyPair('RS256');const jwk={...await exportJWK(publicKey),kid:'local'};
 const configuration={origin:'https://site.test',scope:{tenantId:'tenant',siteId:'site'},initialValues:parseSettingsValues({site:{name:'Original',url:'https://site.test'},localization:{defaultLocale:'ja',locales:['ja'],prefixStrategy:'never',timezone:'Asia/Tokyo'},reporting:{currency:'JPY'}}),startedAt:'2026-01-01T00:00:00Z',access:{issuer:'https://team.cloudflareaccess.com',audience:'sitekit',keySet:{keys:[jwk]}},pages:[{locale:'ja',path:'/',title:'Home',body:'Welcome'}],meta:{appId:'123',apiVersion:'v25.0',permissions:['pages_show_list'],allowedMediaOrigins:['https://media.test']}};
 db.exec(createStandaloneBootstrapSql(configuration,['editor']));
 const token=await new SignJWT({type:'app'}).setProtectedHeader({alg:'RS256',kid:'local'}).setSubject('editor').setIssuer(configuration.access.issuer).setAudience('sitekit').setIssuedAt().setExpirationTime('10m').sign(privateKey);
 const publicationKey=new Uint8Array(32).fill(3);let sent=0;const calls:string[]=[];
 const metaFetch:typeof fetch=async(input)=>{const u=new URL(String(input));calls.push(u.pathname);if(u.pathname.endsWith('/oauth/access_token'))return Response.json({access_token:'sensitive-fixture-token',expires_in:86400});if(u.pathname.endsWith('/me/permissions'))return Response.json({data:[{permission:'pages_show_list',status:'granted'}]});if(u.pathname.endsWith('/me/accounts'))return Response.json({data:[{id:'123',name:'Page',access_token:'sensitive-fixture-token',tasks:['CREATE_CONTENT'],instagram_business_account:{id:'456',username:'IG'}}]});if(u.pathname.endsWith('/feed')||u.pathname.endsWith('/photos')||u.pathname.endsWith('/media_publish')){sent++;return Response.json({id:!u.pathname.endsWith('/media_publish')?'123_789':'789'});}if(u.pathname.endsWith('/media'))return Response.json({id:'999'});if(u.pathname.endsWith('/999'))return Response.json({status_code:'FINISHED'});throw Error('Unexpected Meta fixture request');};
 const host=createStandaloneHost(configuration,{database:sqliteBinding(db),publicationKey,assets:{fetch:async()=>new Response('asset')},secrets:createSecretBox({currentKeyId:'one',keys:{one:new Uint8Array(32).fill(9)}}),metaAppSecret:'local-fixture-secret',fetch:metaFetch});
 expect((await host.fetch(new Request('https://site.test/admin'))).status).toBe(401);
 expect((await host.fetch(new Request('https://site.test/admin/client.js'))).status).toBe(401);
 const fetcher:typeof fetch=async(url,init)=>host.fetch(new Request(url,{...init,headers:{...init?.headers,Origin:'https://site.test',Cookie:'CF_Authorization='+token}}));
 expect((await fetcher('https://site.test/admin')).status).toBe(200);
 const client=createManagementHttpProvider({origin:'https://site.test',fetch:fetcher});
 const apply=async(section:'site'|'localization'|'measurement'|'social')=>{const s=await client.settings.settings();return client.settings.applySettings({protocolVersion:1,commandId:crypto.randomUUID(),expectedVersion:s.version,authorityEpoch:s.authority.epoch,section,savedRevision:s.sections[section].saved.revision,expectedEffectiveRevision:s.sections[section].effective?.revision??null});};
 expect((await host.fetch(new Request('https://site.test/'))).status).toBe(503);await apply('site');await apply('localization');expect(await(await host.fetch(new Request('https://site.test/'))).text()).toContain('Original');
 let s=await client.settings.settings();await client.settings.saveSettings({protocolVersion:1,commandId:crypto.randomUUID(),expectedVersion:s.version,authorityEpoch:s.authority.epoch,section:'site',value:{name:'Actually applied',url:'https://site.test'}});
 expect(await(await host.fetch(new Request('https://site.test/'))).text()).toContain('Original');await apply('site');expect(await(await host.fetch(new Request('https://site.test/'))).text()).toContain('Actually applied');
 const connection=await client.marketing.connect();const state=new URL(connection.url).searchParams.get('state')!;
 const callback=await fetcher('https://site.test/api/sitekit/management/oauth/callback?'+new URLSearchParams({state,code:'fixture'}));expect(callback.status).toBe(303);
 const accounts=await client.marketing.accounts();expect(accounts).toHaveLength(2);expect(JSON.stringify(accounts)).not.toContain('sensitive-fixture-token');
 s=await client.settings.settings();await client.settings.saveSettings({protocolVersion:1,commandId:crypto.randomUUID(),expectedVersion:s.version,authorityEpoch:s.authority.epoch,section:'social',value:{enabled:true,accountIds:accounts.map(a=>a.id),requiresApproval:true}});await apply('social');
 expect((await host.fetch(await createStandalonePublicationRequest('https://site.test/api/sitekit/publication',{contentId:'post',revision:'one',title:'Title',excerpt:'Body',canonicalUrl:'https://site.test/post',imageUrl:'https://media.test/photo.jpg'},publicationKey))).status).toBe(202);
 await host.published({contentId:'post',revision:'one',title:'Title',excerpt:'Body',canonicalUrl:'https://site.test/post',imageUrl:'https://media.test/photo.jpg'});
 let jobs=await client.marketing.jobs();expect(jobs).toHaveLength(2);expect(jobs.every(j=>j.status==='draft')).toBe(true);
 for(const job of jobs)await client.marketing.jobAction(job.id,job.version,'approve');
 await Promise.all([host.scheduled(),host.scheduled()]);await host.scheduled();expect(sent).toBe(2);jobs=await client.marketing.jobs();expect(jobs.every(j=>j.status==='published')).toBe(true);
 expect(JSON.stringify(db.prepare('SELECT payload FROM sitekit_social_state').get())).not.toContain('sensitive-fixture-token');
 let online=true,delegations=0;
 const connected=createStandaloneHost(configuration,{database:sqliteBinding(db),assets:{fetch:async()=>new Response('asset')},authority:{status:async()=>{if(!online)throw Error('partition');return {scope:configuration.scope,owner:'eaos',epoch:'connected',active:true} as any},connection:async()=>({} as any),executor:{reconcile:async()=>{throw Error("no local effects")},resolve:async()=>{},perform:async()=>{throw Error('local execution must stay off')}},management:async(_request,subject)=>{expect(subject).toBe('editor');delegations++;return Response.json({remote:true})},runtime:async()=>({site:{name:'EAOS applied',url:'https://site.test'},localization:configuration.initialValues.localization}),analytics:async()=>Response.json({accepted:1}),published:async()=>[]}});
 expect(await(await connected.fetch(new Request('https://site.test/'))).text()).toContain('EAOS applied');expect(await connected.scheduled()).toEqual({applications:0,purged:0});
 expect((await connected.fetch(new Request('https://site.test/api/sitekit/management/settings',{headers:{Cookie:'CF_Authorization='+token}}))).status).toBe(200);expect(delegations).toBe(1);
 online=false;expect((await connected.fetch(new Request('https://site.test/'))).status).toBe(503);expect((await connected.fetch(new Request('https://site.test/api/analytics',{method:'POST'}))).status).toBe(503);expect(sent).toBe(2);

 }finally{db.close();}
});
