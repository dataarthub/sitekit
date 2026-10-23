import {expect,it} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {sqliteBinding} from '../marketing/testing.test.js';
import {parseSettingsValues,createManagementSettingsService} from '@alneas/sitekit/management';
import {createStandaloneBootstrapSql} from './bootstrap.js';
import {readStandaloneGrant,setStandaloneGrant} from './grants.js';
import {createD1ManagementSettingsStore} from '../management/store.js';
import {runStandaloneSettings,readStandaloneRuntime,runnerSubject} from './runtime.js';
import type {StandaloneConfiguration} from './types.js';
for(const race of ['authority','grant','version'] as const)it('fences actual runtime activation against a '+race+' change at the SQL boundary',async()=>{
 const db=new DatabaseSync(':memory:');try{
 const binding=sqliteBinding(db),scope={tenantId:'tenant',siteId:'site'};
 const config:StandaloneConfiguration={scope,origin:'https://site.test',startedAt:'2026-01-01T00:00:00Z',access:{issuer:'https://team.cloudflareaccess.com',audience:'app'},pages:[{locale:'ja',path:'/',title:'Home',body:'Body'}],initialValues:parseSettingsValues({site:{name:'Site',url:'https://site.test'},localization:{defaultLocale:'ja',locales:['ja'],prefixStrategy:'never',timezone:'UTC'},reporting:{currency:'JPY'}})};
 db.exec(createStandaloneBootstrapSql(config,['editor']));const grant=(await readStandaloneGrant(binding,scope,'editor'))!;
 const service=createManagementSettingsService({scope,store:createD1ManagementSettingsStore(binding,'editor'),authorize:async()=>({allowed:true,version:grant.version}),verifyApplication:async()=>false});const s=await service.settings();
 await service.applySettings({protocolVersion:1,commandId:'one',expectedVersion:s.version,authorityEpoch:s.authority.epoch,section:'site',savedRevision:s.sections.site.saved.revision,expectedEffectiveRevision:null});
 let touched=false;
 const raced={...binding,batch:async(statements:Parameters<typeof binding.batch>[0])=>{
  if(!touched){touched=true;
   if(race==='grant'){const runner=(await readStandaloneGrant(binding,scope,runnerSubject))!;await setStandaloneGrant(binding,scope,{...runner,enabled:false},runner.version);}
   else {const row=db.prepare('SELECT payload FROM sitekit_management_settings').get()!;const record=JSON.parse(String(row.payload));record.snapshot.version=crypto.randomUUID();if(race==='authority')record.snapshot.authority={kind:'eaos',status:'active',epoch:'changed'};db.prepare('UPDATE sitekit_management_settings SET version=?,epoch=?,payload=?').run(record.snapshot.version,record.snapshot.authority.epoch,JSON.stringify(record));}
  }
  return binding.batch(statements);
 }};
 await expect(runStandaloneSettings(raced,config)).rejects.toMatchObject({code:'conflict'});
 expect(await readStandaloneRuntime(binding,scope)).toEqual({});expect(Number(db.prepare('SELECT count(*) c FROM sitekit_standalone_effects').get()!.c)).toBe(0);
 }finally{db.close();}
});
