import {expect,it} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {sqliteBinding} from '../marketing/testing.test.js';
import {createSettingsRecord,createManagementSettingsService,parseSettingsValues} from '@alneas/sitekit/management';
import {initializeD1ManagementSettings,managementSchemaSql,createD1ManagementSettingsStore} from '../management/store.js';
import {grantSchemaSql,setStandaloneGrant} from './grants.js';
import {runtimeSchemaSql,runStandaloneSettings,readStandaloneRuntime,runnerSubject} from './runtime.js';
import {socialStateSchemaSql} from './social/store.js';
import {renderStandalonePage} from './render.js';
import type {StandaloneConfiguration} from './types.js';
it('keeps saves inactive, applies actual rendered values and resumes an existing effect receipt',async()=>{
 const db=new DatabaseSync(':memory:');try{
 const binding=sqliteBinding(db),scope={tenantId:'tenant',siteId:'site'};
 db.exec(managementSchemaSql+grantSchemaSql+runtimeSchemaSql+socialStateSchemaSql);
 const initialValues=parseSettingsValues({site:{name:'Before',url:'https://site.test'},localization:{defaultLocale:'ja',locales:['ja'],prefixStrategy:'never',timezone:'Asia/Tokyo'},reporting:{currency:'JPY'}});
 const config:StandaloneConfiguration={scope,initialValues,origin:'https://site.test',startedAt:'2026-01-01T00:00:00Z',access:{issuer:'https://team.cloudflareaccess.com',audience:'app'},pages:[{locale:'ja',path:'/',title:'Home',body:'Welcome'}]};
 const original=createSettingsRecord({scope,authority:{kind:'standalone',epoch:'first',status:'active'},values:initialValues});await initializeD1ManagementSettings(binding,original);
 const grant=await setStandaloneGrant(binding,scope,{subject:runnerSubject,kind:'service',enabled:true,operations:['readSettings','saveSettings','applySettings','readApplication','completeApplication','run']},null);
 const service=createManagementSettingsService({scope,store:createD1ManagementSettingsStore(binding,runnerSubject),authorize:async()=>({allowed:true,version:grant.version}),verifyApplication:async()=>false});
 await service.saveSettings({protocolVersion:1,commandId:'save',expectedVersion:original.snapshot.version,authorityEpoch:'first',section:'site',value:{name:'Applied name',url:'https://site.test'}});
 expect((await readStandaloneRuntime(binding,scope)).site).toBeUndefined();
 for(const section of ['site','localization'] as const){const s=await service.settings();await service.applySettings({protocolVersion:1,commandId:'apply-'+section,expectedVersion:s.version,authorityEpoch:'first',section,savedRevision:s.sections[section].saved.revision,expectedEffectiveRevision:null});}
 expect(await runStandaloneSettings(binding,config)).toBe(2);expect(await runStandaloneSettings(binding,config)).toBe(0);
 const runtime=await readStandaloneRuntime(binding,scope);const response=renderStandalonePage(new Request('https://site.test/'),runtime,config.pages);
 expect(response.status).toBe(200);expect(await response.text()).toContain('Applied name');
 expect((await service.settings()).sections.site.effective?.value.name).toBe('Applied name');
 expect(Number(db.prepare('SELECT count(*) c FROM sitekit_standalone_effects').get()!.c)).toBe(2);
 // Simulate death after the atomic target activation but before common completion.
 const row=db.prepare('SELECT payload FROM sitekit_management_settings').get()!;const record=JSON.parse(String(row.payload));
 const app=record.applications.find((a:any)=>a.view.section==='site');delete app.view.receiptId;delete app.view.completedAt;app.view.status='applying';record.snapshot.sections.site.application=structuredClone(app.view);record.snapshot.sections.site.effective=null;
 db.prepare('UPDATE sitekit_management_settings SET payload=?').run(JSON.stringify(record));
 expect(await runStandaloneSettings(binding,config)).toBe(1);expect(Number(db.prepare('SELECT count(*) c FROM sitekit_standalone_effects').get()!.c)).toBe(2);
 }finally{db.close();}
});
it('keeps OAuth query parameters out of standard automatic telemetry',async()=>{
 const {readFile}=await import('node:fs/promises');
 const config=JSON.parse(await readFile(new URL('../../../../examples/standalone/wrangler.jsonc',import.meta.url),'utf8'));
 expect(config.observability.redact_query_string).toBe(true);
});
it.each(['always','default-unprefixed'] as const)('preserves exact manifest paths with %s locale routing',async(prefixStrategy)=>{
 const runtime=parseSettingsValues({site:{name:'Site',url:'https://site.test'},localization:{defaultLocale:'en',locales:['en','ja'],prefixStrategy,timezone:'Asia/Tokyo'},reporting:{currency:'JPY'}});
 const pages=['/','/about/','/contact'].flatMap(path=>['en','ja'].map(locale=>({locale,path,title:locale+path,body:'Welcome'})));
 for(const path of ['/','/about/','/contact']){
  const response=renderStandalonePage(new Request('https://site.test/ja'+path),runtime,pages);
  expect(response.status).toBe(200);
  expect(await response.text()).toContain(`href="/ja${path}"`);
  const english=renderStandalonePage(new Request('https://site.test'+(prefixStrategy==='always'?'/en':'')+path),runtime,pages);
  expect(english.status).toBe(200);
 }
 expect(renderStandalonePage(new Request('https://site.test/ja/about'),runtime,pages).status).toBe(404);
});
