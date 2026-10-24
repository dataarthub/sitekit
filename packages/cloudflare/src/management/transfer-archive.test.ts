import {expect,it} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {sqliteBinding} from '../marketing/testing.test.js';
import {authoritySchemaSql} from './authority-store.js';
import {createD1TransferArchive} from './transfer-archive.js';
import {createSecretBox} from '../standalone/social/secrets.js';
it('encrypts staged pages durably, binds scope and preserves the first idempotent write',async()=>{
 const db=new DatabaseSync(':memory:');try{db.exec(authoritySchemaSql);const scope={tenantId:'t',siteId:'s'},database=sqliteBinding(db),secrets=createSecretBox({currentKeyId:'one',keys:{one:new Uint8Array(32).fill(7)}});
 const archive=createD1TransferArchive({database,scope,owner:'standalone',secrets});await archive.write('move','page-0',{token:'private-value'});
 const raw=db.prepare('SELECT payload FROM sitekit_transfer_snapshots').get() as {payload:string};expect(raw.payload).not.toContain('private-value');
 expect(await archive.write('move','page-0',{token:'different'})).toEqual({token:'private-value'});
 expect(await createD1TransferArchive({database,scope,owner:'standalone',secrets}).read('move','page-0')).toEqual({token:'private-value'});
 await archive.write('move','page-0',{phase:'active'},true);expect(await archive.read('move','page-0')).toEqual({phase:'active'});
 const foreign=createD1TransferArchive({database,scope,owner:'eaos',secrets});await expect(foreign.read('move','page-0')).rejects.toThrow();
 }finally{db.close()}
});
