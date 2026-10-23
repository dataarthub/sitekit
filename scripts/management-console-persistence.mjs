// Installed archive acceptance: actual HTTP DTOs, policy, D1 SQL and SQLite persistence.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createSettingsRecord,createManagementSettingsService} from '@alneas/sitekit/management';
import {createManagementHttpProvider} from '@alneas/sitekit/management/http';
import {createManagementHandler,createD1ManagementSettingsStore,initializeD1ManagementSettings,managementSchemaSql} from '@alneas/sitekit-cloudflare/management';
for(const kind of ['standalone','eaos']){
 const db=new DatabaseSync(':memory:');db.exec(managementSchemaSql);
 class Statement{constructor(sql,values=[]){this.sql=sql;this.values=values;}bind(...values){return new Statement(this.sql,values);}async first(){return db.prepare(this.sql).get(...this.values)??null;}async all(){return{results:db.prepare(this.sql).all(...this.values)};}async run(){return{meta:{changes:Number(db.prepare(this.sql).run(...this.values).changes)}};}}
 const binding={prepare:sql=>new Statement(sql)};
 const scope={tenantId:'tenant',siteId:'site'},authority={kind,epoch:'epoch',status:'active'};
 const initial=createSettingsRecord({scope,authority,values:{site:{name:'Before',url:'https://example.test'},localization:{defaultLocale:'ja',locales:['ja'],timezone:'Asia/Tokyo',prefixStrategy:'never'},reporting:{currency:'JPY'}}});
 await initializeD1ManagementSettings(binding,initial);db.prepare('INSERT INTO sitekit_management_admission VALUES(?,?,?,?,?)').run('tenant','site','verified-editor','grant-1',1);
 const service=createManagementSettingsService({scope,store:createD1ManagementSettingsStore(binding,'verified-editor'),authorize:async()=>({allowed:true,version:'grant-1'}),verifyApplication:async request=>request.completion.receiptId==='confirmed-runtime-receipt'});
 const allow={allowed:true},deny={allowed:false,reason:'unavailable'};
 const provider={settings:{...service,context:async()=>({protocolVersion:1,scope,authority,capabilities:{settings:{available:true},measurement:{available:false,reason:'not_configured'},socialPublishing:{available:false,reason:'not_configured'}},permissions:{readSettings:allow,readApplication:allow,saveSettings:allow,applySettings:allow},asOf:new Date().toISOString()})},marketing:{},access:async()=>({read:allow,post:deny,connect:deny,disconnect:deny,reconcile:deny,spend:deny})};
 const handler=createManagementHandler({origin:'https://example.test',session:async request=>request.headers.get('Authorization')==='Bearer acceptance-session'?{scope,provider,authorize:async()=>true}:null});
 // The fixture binds a verified test session explicitly; no anonymous handler default exists.
 const client=createManagementHttpProvider({origin:'https://example.test',fetch:async(url,init)=>handler(new Request(url,{...init,headers:{...init.headers,Origin:'https://example.test',Authorization:'Bearer acceptance-session'}}),{})});
 const snapshot=await client.settings.settings();
 await client.settings.saveSettings({protocolVersion:1,commandId:'save-one',expectedVersion:snapshot.version,authorityEpoch:'epoch',section:'site',value:{name:'Saved',url:'https://example.test'}});
 const saved=await client.settings.settings();assert.equal(saved.sections.site.saved.value.name,'Saved');assert.equal(saved.sections.site.effective,null);
 await assert.rejects(client.settings.saveSettings({protocolVersion:1,commandId:'stale',expectedVersion:snapshot.version,authorityEpoch:'epoch',section:'site',value:{name:'Lost',url:'https://example.test'}}),error=>error.code==='conflict');
 const application=await client.settings.applySettings({protocolVersion:1,commandId:'apply-one',expectedVersion:saved.version,authorityEpoch:'epoch',section:'site',savedRevision:saved.sections.site.saved.revision,expectedEffectiveRevision:null});
 assert.equal(application.status,'applying');assert.equal((await client.settings.settings()).sections.site.effective,null);
 const reserved=await service.settings();await service.completeApplication({protocolVersion:1,applicationId:application.id,expectedVersion:reserved.version,authorityEpoch:'epoch',outcome:'applied',receiptId:'confirmed-runtime-receipt'});
 assert.equal((await client.settings.settings()).sections.site.effective.value.name,'Saved');
 assert.equal((await handler(new Request('https://example.test/api/sitekit/management/settings'),{})).status,401);
 db.close();
}
console.log('Installed management browser port + gateway + D1 SQLite: both authority profiles save/apply, conflict, confirmed effect and authentication passed.');
