// Local acceptance fixture only: signed test sessions and synthetic runtime receipts. Never deploy.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {createSettingsRecord,createManagementSettingsService} from '../../../packages/core/dist/management/index.js';
import {createManagementHandler,createD1ManagementSettingsStore,initializeD1ManagementSettings,managementSchemaSql} from '../../../packages/cloudflare/dist/management/index.js';
import {createHmac,timingSafeEqual} from 'node:crypto';
const db=new DatabaseSync(process.env.SITEKIT_MANAGEMENT_TEST_DB ?? ':memory:');db.exec(managementSchemaSql);
const secret=crypto.randomUUID();
const seal=v=>createHmac('sha256',secret).update(v).digest('hex');
class Statement{constructor(sql,values=[]){this.sql=sql;this.values=values;}bind(...values){return new Statement(this.sql,values);}async first(){return db.prepare(this.sql).get(...this.values)??null;}async all(){return{results:db.prepare(this.sql).all(...this.values)};}async run(){return{meta:{changes:Number(db.prepare(this.sql).run(...this.values).changes)}};}}
const binding={prepare:sql=>new Statement(sql)};
const allow={allowed:true},deny={allowed:false,reason:'forbidden'};
const record=site=>createSettingsRecord({scope:{tenantId:'tenant',siteId:site},authority:{kind:'standalone',epoch:'initial',status:'active'},values:{site:{name:site==='other'?'Other site':'Demo site',url:'https://example.test'},localization:{defaultLocale:'ja',locales:['ja','en'],prefixStrategy:'default-unprefixed',timezone:'Asia/Tokyo'},reporting:{currency:'JPY'}}});
for(const site of ['site','other']){await initializeD1ManagementSettings(binding,record(site));db.prepare('INSERT INTO sitekit_management_admission VALUES(?,?,?,?,?) ON CONFLICT DO NOTHING').run('tenant',site,'editor','one',1);}
const receipts=new Set();let settingsCalls=0,saveCalls=0;
const scope=site=>({tenantId:'tenant',siteId:site});
function provider(site,readonly=false,settingsDenied=false){
 const service=createManagementSettingsService({scope:scope(site),store:createD1ManagementSettingsStore(binding,'editor'),authorize:async r=>({allowed:!settingsDenied&&(!readonly||r.operation==='readSettings'||r.operation==='readApplication'),version:'one'}),verifyApplication:async r=>receipts.has(r.completion.receiptId)});
 return{settings:{...service,context:async()=>({protocolVersion:1,scope:scope(site),authority:{kind:'standalone',epoch:'initial',status:'active'},capabilities:{settings:settingsDenied?{available:false,reason:'forbidden'}:{available:true},measurement:{available:true},socialPublishing:{available:true}},permissions:{readSettings:settingsDenied?deny:allow,readApplication:settingsDenied?deny:allow,saveSettings:readonly||settingsDenied?deny:allow,applySettings:readonly||settingsDenied?deny:allow},asOf:new Date().toISOString()}),settings:async()=>{settingsCalls++;return service.settings();},saveSettings:async c=>{saveCalls++;return service.saveSettings(c);},applySettings:async c=>{const application=await service.applySettings(c);setTimeout(async()=>{const s=await service.settings();const receiptId='host-'+application.id;receipts.add(receiptId);await service.completeApplication({protocolVersion:1,applicationId:application.id,expectedVersion:s.version,authorityEpoch:s.authority.epoch,outcome:'applied',receiptId});},300).unref();return application;}},marketing:{accounts:async()=>[{id:'fb-page',platform:'facebook',name:'Demo page',status:'connected',expiresAt:'2027-01-01T00:00:00Z',version:1}],jobs:async()=>[],report:async()=>({asOf:new Date().toISOString(),currency:'JPY',coverage:'registered-only',totals:{pageViews:12,leads:2,bookings:1,confirmedConversions:3,unattributedConversions:1,spendMinor:null,revenueMinor:null,cpaMinor:null,roas:null},campaigns:[]}),importSpend:async()=>({accepted:0,duplicates:0}),connect:async()=>({url:'https://www.facebook.com/dialog/oauth'}),disconnect:async()=>{},createPost:async()=>[],jobAction:async()=>{throw Error('not fixture action');}},access:async()=>({read:allow,post:readonly?deny:allow,spend:readonly?deny:allow,connect:readonly?deny:allow,disconnect:readonly?deny:allow,reconcile:readonly?deny:allow})};
}
const port=Number(process.env.SITEKIT_MANAGEMENT_TEST_PORT ?? 4387);
const origin='http://127.0.0.1:'+port;
function verified(req){const raw=req.headers.get('cookie')?.match(/session=([^;]+)/)?.[1];if(!raw)return null;const [subject,sig]=raw.split('.');if(!sig||sig.length!==64)return null;return timingSafeEqual(Buffer.from(sig),Buffer.from(seal(subject)))?subject:null;}
function handler(site){return createManagementHandler({origin,basePath:site==='other'?'/api/other/management/':'/api/sitekit/management/',session:async req=>{const user=verified(req);if(!user)return null;const p=provider(site,user==='readonly',user==='marketing');return{scope:scope(site),provider:p,authorize:async op=>user==='marketing'?!['readSettings','saveSettings','applySettings','readApplication'].includes(op):user!=='readonly'||['read','readSettings','readApplication'].includes(op)};}});}
const handlers={site:handler('site'),other:handler('other')};
const server=createServer(async(req,res)=>{
 try{const url=new URL(req.url,origin);let response;
 if(url.pathname==='/login'){const user=url.searchParams.get('marketing')==='1'?'marketing':url.searchParams.get('readonly')==='1'?'readonly':'editor';response=new Response('ok',{headers:{'Set-Cookie':`session=${user}.${seal(user)}; HttpOnly; SameSite=Strict; Path=/`}});}
 else if(url.pathname==='/bootstrap'){const site=url.searchParams.get('site')==='other'?'other':'site';const p=provider(site);response=Response.json({identityKey:'verified-editor',context:await p.settings.context()});}
 else if(url.pathname==='/stats')response=Response.json({saveCalls,settingsCalls});
 else if(url.pathname.startsWith('/api/')){const body=[];for await(const part of req)body.push(part);response=await handlers[url.pathname.startsWith('/api/other/')?'other':'site'](new Request(url,{method:req.method,headers:req.headers,...(body.length?{body:Buffer.concat(body)}:{})}),{});}
 else if(url.pathname.endsWith('.js')||url.pathname.endsWith('.css'))response=new Response(await readFile(new URL('../../../.verification/public-management/web/'+url.pathname.split('/').at(-1),import.meta.url)),{headers:{'Content-Type':url.pathname.endsWith('.css')?'text/css':'application/javascript'}});
 else response=new Response('<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Management acceptance</title><link rel="stylesheet" href="/client.css"><div id="app"></div><script type="module" src="/client.js"></script></html>',{headers:{'Content-Type':'text/html; charset=utf-8'}});
 res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch(e){console.error(e);res.writeHead(500);res.end('fixture failure');}
});server.listen(port,'127.0.0.1',()=>console.log('fixture ready '+port));
