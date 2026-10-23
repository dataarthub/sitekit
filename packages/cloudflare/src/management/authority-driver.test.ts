import {expect,it} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {createAuthorityRecord,createAuthorityService,createAuthorityExecutor} from '@alneas/sitekit/management';
import {sqliteBinding} from '../marketing/testing.test.js';
import {managementSchemaSql} from './store.js';
import {authoritySchemaSql,initializeAuthority,createD1AuthorityStore} from './authority-store.js';
import {createAuthorityDeliveryDriver} from './authority-driver.js';
it('retains an uncertain exact delivery permit while closing and reconciles it without another publish',async()=>{
 const db=new DatabaseSync(':memory:');try{db.exec(managementSchemaSql+authoritySchemaSql);const database=sqliteBinding(db),scope={tenantId:'t',siteId:'s'};db.prepare('INSERT INTO sitekit_management_admission VALUES(?,?,?,?,?)').run('t','s','server','grant',1);await initializeAuthority(database,createAuthorityRecord({scope,owner:'standalone',epoch:'one'}));
 const peer={inspect:async()=>({revision:'source',identity:'site',blocked:false}),preflight:async()=>{},freeze:async()=>{throw Error('not needed')},page:async()=>({items:[],next:null}),import:async()=>({id:'ready',hash:'a'.repeat(64)}),activate:async()=>{}};
 const control=createAuthorityService({scope,store:createD1AuthorityStore({database,scope,subject:'server'}),authorize:async()=>({allowed:true,version:'grant'}),peers:{standalone:peer,eaos:peer},verifyPermit:async(_p,proof)=>proof==='durable-reconciliation'}),executor=createAuthorityExecutor({scope,owner:'standalone',control,proof:async()=> 'durable-reconciliation'});
 let publishes=0,reconciles=0;const driver=createAuthorityDeliveryDriver({epoch:'one',executor,driver:{publish:async()=>{publishes++;return {status:'unknown'}},reconcile:async()=>{reconciles++;return {status:'published',externalId:'original-remote'}}}}),context={attemptId:'attempt-one',account:{id:'account',platform:'facebook',externalId:'1',name:'Page',token:'token',expiresAt:'2099-01-01T00:00:00Z'},job:{id:'job',version:2,accountId:'account',platform:'facebook',text:'Text',status:'publishing',createdAt:'2026-01-01T00:00:00Z',attempt:1}} as const;
 await driver.publish(context,async()=>{});expect((await control.status()).unknownPermits).toBe(1);let s=await control.status();s=await control.plan({commandId:'plan',expectedVersion:s.version,authorityEpoch:'one',target:'eaos'});s=await control.advance({commandId:'close',expectedVersion:s.version,transferId:s.transferId!});expect(s.active).toBe(false);
 await expect(driver.publish(context,async()=>{})).rejects.toThrow();expect(publishes).toBe(1);expect((await driver.reconcile(context)).status).toBe('published');expect(reconciles).toBe(1);expect((await control.status()).openPermits).toBe(0);
 }finally{db.close()}
});
