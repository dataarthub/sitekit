import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { createSettingsRecord, createManagementSettingsService } from '@alneas/sitekit/management';
import { sqliteBinding } from '../marketing/testing.test.js';
import { createD1ManagementSettingsStore, initializeD1ManagementSettings, managementSchemaSql } from './store.js';
import { createManagementHandler } from './handler.js';
const scope={tenantId:'tenant',siteId:'site'};
const record=()=>createSettingsRecord({scope,authority:{kind:'standalone',epoch:'first',status:'active'},values:{site:{name:'Original',url:'https://site.test'},localization:{defaultLocale:'ja',locales:['ja'],prefixStrategy:'never',timezone:'Asia/Tokyo'},reporting:{currency:'JPY'}}});
it('persists drafts across a database reopen and fences permission revocation atomically',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'sitekit-management-')); const file=join(dir,'state.db'); let db=new DatabaseSync(file);
 try {
 db.exec(managementSchemaSql); let binding=sqliteBinding(db); const initial=record(); await initializeD1ManagementSettings(binding,initial);
 db.prepare('INSERT INTO sitekit_management_admission VALUES(?,?,?,?,?)').run('tenant','site','editor','grant-v1',1);
 let service=createManagementSettingsService({scope,store:createD1ManagementSettingsStore(binding,'editor'),authorize:async()=>({allowed:true,version:'grant-v1'}),verifyApplication:async()=>false});
 await service.saveSettings({protocolVersion:1,commandId:'one',expectedVersion:initial.snapshot.version,authorityEpoch:'first',section:'site',value:{name:'Saved',url:'https://site.test'}});
 db.close(); db=new DatabaseSync(file); binding=sqliteBinding(db);
 service=createManagementSettingsService({scope,store:createD1ManagementSettingsStore(binding,'editor'),authorize:async()=>({allowed:true,version:'grant-v1'}),verifyApplication:async()=>false});
 const saved=await service.settings(); expect(saved.sections.site.saved.value.name).toBe('Saved'); expect(saved.sections.site.effective).toBeNull();
 db.prepare('UPDATE sitekit_management_admission SET version=?,allowed=0').run('revoked');
 await expect(service.saveSettings({protocolVersion:1,commandId:'two',expectedVersion:saved.version,authorityEpoch:'first',section:'site',value:{name:'Lost',url:'https://site.test'}})).rejects.toMatchObject({code:'conflict'});
 expect((await service.settings()).sections.site.saved.value.name).toBe('Saved');
 }finally{ db.close(); rmSync(dir,{recursive:true}); }
});
it('requires verified identity and exact mutation origin before resolving the backend',async()=>{
 let resolutions=0;
 const handler=createManagementHandler({origin:'https://site.test',session:async()=>{resolutions++;return null;}});
 expect((await handler(new Request('https://site.test/api/sitekit/management/settings'),{})).status).toBe(401);
 expect((await handler(new Request('https://site.test/api/sitekit/management/settings/save',{method:'POST',headers:{Origin:'https://foreign.test'}}),{})).status).toBe(403);
 expect(resolutions).toBe(1);
});
it('rejects a provider bound to another site before returning marketing data',async()=>{
 let called=false;
 const h=createManagementHandler({origin:'https://site.test',session:async()=>({scope,authorize:async()=>true,provider:{settings:{context:async()=>({protocolVersion:1,scope:{tenantId:'tenant',siteId:'foreign'},authority:{kind:'standalone',epoch:'first',status:'active'},capabilities:{settings:{available:true},measurement:{available:true},socialPublishing:{available:true}},permissions:{readSettings:{allowed:true},readApplication:{allowed:true},saveSettings:{allowed:true},applySettings:{allowed:true}},asOf:'2026-10-23T00:00:00Z'})},marketing:{accounts:async()=>{called=true;return[];}}} as any})});
 expect((await h(new Request('https://site.test/api/sitekit/management/accounts'),{})).status).toBe(403);expect(called).toBe(false);
});
it('serves safe context and marketing when settings capability and reads are denied',async()=>{
 const context={protocolVersion:1,scope,authority:{kind:'standalone',epoch:'first',status:'active'},capabilities:{settings:{available:false,reason:'forbidden'},measurement:{available:true},socialPublishing:{available:true}},permissions:{readSettings:{allowed:false,reason:'forbidden'},readApplication:{allowed:false,reason:'forbidden'},saveSettings:{allowed:false,reason:'forbidden'},applySettings:{allowed:false,reason:'forbidden'}},asOf:'2026-10-23T00:00:00Z'};
 const h=createManagementHandler({origin:'https://site.test',session:async()=>({scope,authorize:async op=>op==='read',provider:{settings:{context:async()=>context},marketing:{accounts:async()=>[]}} as any})});
 expect((await h(new Request('https://site.test/api/sitekit/management/context'),{})).status).toBe(200);
 expect((await h(new Request('https://site.test/api/sitekit/management/accounts'),{})).status).toBe(200);
 expect((await h(new Request('https://site.test/api/sitekit/management/settings'),{})).status).toBe(403);
});
