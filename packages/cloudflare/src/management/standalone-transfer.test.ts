import {expect,it} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {createSettingsRecord} from '@alneas/sitekit/management';
import {sqliteBinding} from '../marketing/testing.test.js';
import {standaloneSchemaSql} from '../standalone/bootstrap.js';
import {createStandaloneTransferData,transferBusinessSchemaSql} from './standalone-transfer.js';
it('preserves saved and effective history, raw measurement identity and revocations through a durable pause/adoption',async()=>{
 const a=new DatabaseSync(':memory:'),b=new DatabaseSync(':memory:');try{a.exec(standaloneSchemaSql+transferBusinessSchemaSql);b.exec(standaloneSchemaSql+transferBusinessSchemaSql);
 const scope={tenantId:'t',siteId:'s'},record=createSettingsRecord({scope,authority:{kind:'standalone',epoch:'one',status:'active'},values:{site:{name:'Saved',url:'https://site.test'},localization:{defaultLocale:'ja',locales:['ja'],prefixStrategy:'never',timezone:'UTC'},reporting:{currency:'JPY'}}});
 a.prepare('INSERT INTO sitekit_management_settings VALUES(?,?,?,?,?)').run('t','s',record.snapshot.version,'one',JSON.stringify(record));
 a.prepare('INSERT INTO sitekit_marketing_records(tenant_id,site_id,kind,record_id,fingerprint,write_id,occurred_at) VALUES(?,?,?,?,?,?,?)').run('t','s','event','event-1','exact-fingerprint','write-1','2026-01-01T00:00:00Z');
 a.prepare('INSERT INTO sitekit_marketing_revocations VALUES(?,?,?,?)').run('t','s','forgotten-hash','2026-01-02T00:00:00Z');
 const source=createStandaloneTransferData({database:sqliteBinding(a),scope,startedAt:'2025-01-01T00:00:00Z'}),target=createStandaloneTransferData({database:sqliteBinding(b),scope,startedAt:'2026-01-01T00:00:00Z'}),items=(await source.read())!;
 await source.pause('move',items);await source.pause('move',items);expect(JSON.parse((a.prepare('SELECT payload FROM sitekit_management_settings').get() as any).payload).snapshot.authority.status).toBe('paused');
 const incoming=structuredClone(items);const root=incoming.find(i=>i.kind==='settings')!.value as any;root.snapshot.authority={kind:'standalone',epoch:'two',status:'active'};root.snapshot.version='new-version';
 await target.activate('move',incoming,'two');await target.activate('move',incoming,'two');expect(b.prepare('SELECT fingerprint,write_id FROM sitekit_marketing_records').get()).toEqual({fingerprint:'exact-fingerprint',write_id:'write-1'});
 expect(b.prepare('SELECT COUNT(*) AS n FROM sitekit_marketing_revocations').get()).toEqual({n:1});expect((await target.read())!.find(i=>i.kind==='coverage')!.value).toEqual({startedAt:'2025-01-01T00:00:00Z'});
 await expect(target.activate('other',incoming,'three')).rejects.toMatchObject({code:'conflict'});
 }finally{a.close();b.close()}
});
