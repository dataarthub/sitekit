import {expect,it} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {sqliteBinding} from '../marketing/testing.test.js';
import {createSettingsRecord} from '@alneas/sitekit/management';
import {createD1ManagementSettingsStore,initializeD1ManagementSettings,managementSchemaSql} from './store.js';
import {createManagedSiteRuntime} from './managed.js';
it('uses common settings operations under fresh EAOS authority and never completes an unproven application',async()=>{
 const sql=new DatabaseSync(':memory:');try{
  sql.exec(managementSchemaSql);const db=sqliteBinding(sql),scope={tenantId:'tenant',siteId:'site'};
  await initializeD1ManagementSettings(db,createSettingsRecord({scope,authority:{kind:'eaos',epoch:'first',status:'active'},values:{site:{name:'Original',url:'https://site.test'},localization:{defaultLocale:'ja',locales:['ja'],prefixStrategy:'never',timezone:'UTC'},reporting:{currency:'JPY'}}}));
  sql.prepare('INSERT INTO sitekit_management_admission VALUES(?,?,?,?,?)').run('tenant','site','editor','grant',1);
  let enabled=true;let checks=0;const runtime=createManagedSiteRuntime({scope,userId:'editor',authorityEpoch:'first',kind:'human',origin:'https://site.test',settingsStore:createD1ManagementSettingsStore(db,'editor'),authorize:async()=>{checks++;return {allowed:enabled,version:'grant'};},activation:{apply:async()=>null,verify:async()=>false},measurement:async()=>{throw Error('Not configured');}});
  const s=await runtime.provider.settings.settings();
  await runtime.provider.settings.saveSettings({protocolVersion:1,commandId:'save',expectedVersion:s.version,authorityEpoch:'first',section:'site',value:{name:'Saved',url:'https://site.test'}});
  const saved=await runtime.provider.settings.settings();expect(saved.sections.site.effective).toBeNull();
  const a=await runtime.provider.settings.applySettings({protocolVersion:1,commandId:'apply',expectedVersion:saved.version,authorityEpoch:'first',section:'site',savedRevision:saved.sections.site.saved.revision,expectedEffectiveRevision:null});expect(a.status).toBe('applying');
  await expect(runtime.run()).rejects.toMatchObject({code:'forbidden'});
  enabled=false;await expect(runtime.provider.settings.settings()).rejects.toMatchObject({code:'forbidden'});expect(checks).toBeGreaterThan(4);
  expect((await runtime.fetch(new Request('https://site.test/api/sitekit/management/settings'))).status).toBe(403);
 }finally{sql.close();}
});
it('rejects a standalone record rather than using it as an EAOS fallback',async()=>{
 const scope={tenantId:'tenant',siteId:'site'};const record=createSettingsRecord({scope,authority:{kind:'standalone',epoch:'first',status:'active'},values:{site:{name:'Site',url:'https://site.test'},localization:{defaultLocale:'ja',locales:['ja'],prefixStrategy:'never',timezone:'UTC'},reporting:{currency:'JPY'}}});
 const runtime=createManagedSiteRuntime({scope,userId:'editor',authorityEpoch:'first',kind:'human',origin:'https://site.test',settingsStore:{read:async()=>record,compareAndSwap:async()=>{throw Error('Must not write');}},authorize:async()=>({allowed:true,version:'grant'}),activation:{apply:async()=>null,verify:async()=>false},measurement:async()=>{throw Error('Must not access');}});
 await expect(runtime.provider.settings.settings()).rejects.toMatchObject({code:'conflict'});
 await expect(runtime.provider.marketing.report({from:'2026-10-01T00:00:00Z',to:'2026-10-02T00:00:00Z',timezone:'UTC',currency:'JPY'})).rejects.toMatchObject({code:'conflict'});
});
