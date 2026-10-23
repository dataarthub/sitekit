import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createManagementSettingsService, createSettingsRecord } from '@alneas/sitekit/management';
for (const kind of ['standalone', 'eaos']) {
 const db = new DatabaseSync(':memory:');
 try {
  db.exec("CREATE TABLE settings(tenant TEXT,site TEXT,version TEXT,epoch TEXT,payload TEXT,PRIMARY KEY(tenant,site)); CREATE TABLE admission(version TEXT,allowed INTEGER); INSERT INTO admission VALUES('grant-1',1)");
  const scope = { tenantId: 'tenant', siteId: 'site' };
  const record = createSettingsRecord({ scope, authority: { kind, epoch: 'epoch-1', status: 'active' }, values: { site: { name: 'Example', url: 'https://example.com' }, localization: { defaultLocale: 'en', locales: ['en'], prefixStrategy: 'never', timezone: 'UTC' }, reporting: { currency: 'USD' } } });
  db.prepare('INSERT INTO settings VALUES(?,?,?,?,?)').run('tenant','site',record.snapshot.version,'epoch-1',JSON.stringify(record));
  const store = {
   async read(s) { const row=db.prepare('SELECT payload FROM settings WHERE tenant=? AND site=?').get(s.tenantId,s.siteId);return row?JSON.parse(row.payload):null; },
   async compareAndSwap(i) { return db.prepare('UPDATE settings SET version=?,epoch=?,payload=? WHERE tenant=? AND site=? AND version=? AND epoch=? AND EXISTS(SELECT 1 FROM admission WHERE version=? AND allowed=1)').run(i.next.snapshot.version,i.next.snapshot.authority.epoch,JSON.stringify(i.next),i.scope.tenantId,i.scope.siteId,i.expectedVersion,i.expectedAuthorityEpoch,i.expectedPermissionVersion).changes===1; },
  };
  const make = () => createManagementSettingsService({ scope, store, authorize: async () => ({ allowed: true, version: 'grant-1' }), verifyApplication: async () => false });
  const service=make(),initial=await service.settings();
  const command={protocolVersion:1,commandId:'save-1',expectedVersion:initial.version,authorityEpoch:'epoch-1',section:'site',value:{name:'Saved only',url:'https://example.com'}};
  const receipt=await service.saveSettings(command);assert.deepEqual(await make().saveSettings(command),receipt);
  const saved=await make().settings();assert.equal(saved.sections.site.saved.value.name,'Saved only');assert.equal(saved.sections.site.effective,null);
  await assert.rejects(service.saveSettings({...command,commandId:'stale'}),e=>e.code==='conflict');
 } finally { db.close(); }
}
console.log('Installed public management contract: both owner profiles, real SQLite CAS, service-recreation replay and saved/effective separation passed');
