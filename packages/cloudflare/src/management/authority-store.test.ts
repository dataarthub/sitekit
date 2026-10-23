import {expect,it} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {sqliteBinding} from '../marketing/testing.test.js';
import {createAuthorityRecord,createAuthorityService} from '@alneas/sitekit/management';
import {managementSchemaSql} from './store.js';
import {authoritySchemaSql,initializeAuthority,createD1AuthorityStore} from './authority-store.js';
it('persists control and permit CAS atomically and rejects a revoked native admission generation',async()=>{
 const db=new DatabaseSync(':memory:');try{db.exec(managementSchemaSql+authoritySchemaSql);const binding=sqliteBinding(db),scope={tenantId:'tenant',siteId:'site'};db.prepare('INSERT INTO sitekit_management_admission VALUES(?,?,?,?,?)').run('tenant','site','server','grant',1);
 const record=createAuthorityRecord({scope,owner:'standalone',epoch:'one'});expect(await initializeAuthority(binding,record)).toBe(true);expect(await initializeAuthority(binding,record)).toBe(false);
 const store=createD1AuthorityStore({database:binding,scope,subject:'server'}),service=createAuthorityService({scope,store,authorize:async()=>({allowed:true,version:'grant'}),peers:{},verifyPermit:async()=>true});
 const p=await service.issue({id:'work',owner:'standalone',epoch:'one',operation:'save',fingerprint:'hash'});expect(p.created).toBe(true);expect((await store.read())?.openPermits).toEqual(['work']);
 db.prepare('UPDATE sitekit_management_admission SET allowed=0,version=?').run('revoked');await expect(service.finish({id:'work',outcome:'completed',proof:'proof'})).rejects.toMatchObject({code:'conflict'});
 expect((await store.permit('work'))?.status).toBe('open');expect((await store.read())?.openPermits).toEqual(['work']);
 }finally{db.close();}
});
