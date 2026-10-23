import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { createManagementSettingsService, createSettingsRecord, settingsSectionStatus, ManagementFault } from './index.js';
import type { SettingsRecord, ManagementSettingsStore, SettingsOperation, SettingsSnapshot } from './index.js';
const scope = { tenantId: 'tenant', siteId: 'site' };
const values = { site: { name: 'Site', url: 'https://example.com' }, localization: { defaultLocale: 'en', locales: ['en'], prefixStrategy: 'never', timezone: 'UTC' }, reporting: { currency: 'USD' } };
const databases: DatabaseSync[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });
function setup(kind: 'standalone' | 'eaos') {
 const db = new DatabaseSync(':memory:'); databases.push(db);
 db.exec("CREATE TABLE settings(tenant TEXT, site TEXT, version TEXT, epoch TEXT, payload TEXT, PRIMARY KEY(tenant,site)); CREATE TABLE admission(version TEXT, allowed INTEGER); INSERT INTO admission VALUES('grant-1',1)");
 const initial = createSettingsRecord({ scope, authority: { kind, epoch: 'epoch-1', status: 'active' }, values });
 db.prepare('INSERT INTO settings VALUES(?,?,?,?,?)').run(scope.tenantId, scope.siteId, initial.snapshot.version, 'epoch-1', JSON.stringify(initial));
 const store: ManagementSettingsStore = {
  async read(s) { const row = db.prepare('SELECT payload FROM settings WHERE tenant=? AND site=?').get(s.tenantId, s.siteId); return row ? JSON.parse(String(row.payload)) as SettingsRecord : null; },
  async compareAndSwap(input) { return db.prepare('UPDATE settings SET version=?,epoch=?,payload=? WHERE tenant=? AND site=? AND version=? AND epoch=? AND EXISTS(SELECT 1 FROM admission WHERE version=? AND allowed=1)').run(input.next.snapshot.version, input.next.snapshot.authority.epoch, JSON.stringify(input.next), input.scope.tenantId, input.scope.siteId, input.expectedVersion, input.expectedAuthorityEpoch, input.expectedPermissionVersion).changes === 1; },
 };
 let allow = true, proof = true;
 const calls: SettingsOperation[] = [];
 const service = () => createManagementSettingsService({ scope, store, authorize: async request => { calls.push(request.operation); return { allowed: allow, version: 'grant-1' }; }, verifyApplication: async () => proof });
 return { db, store, service, calls, deny: () => { allow = false; db.prepare("UPDATE admission SET version='grant-2',allowed=0").run(); }, proof: (v: boolean) => { proof = v; } };
}
function save(snapshot: SettingsSnapshot, name = 'Changed', commandId = crypto.randomUUID()) { return { protocolVersion: 1 as const, commandId, expectedVersion: snapshot.version, authorityEpoch: snapshot.authority.epoch, section: 'site' as const, value: { name, url: 'https://example.com' } }; }
function apply(snapshot: SettingsSnapshot, commandId = crypto.randomUUID()) { return { protocolVersion: 1 as const, commandId, expectedVersion: snapshot.version, authorityEpoch: snapshot.authority.epoch, section: 'site' as const, savedRevision: snapshot.sections.site.saved.revision, expectedEffectiveRevision: snapshot.sections.site.effective?.revision ?? null }; }
describe.each(['standalone', 'eaos'] as const)('%s common settings policy (real SQLite store-port fixture, not native host acceptance)', kind => {
 it('saves a draft, recreates the service, and applies only a verified captured revision', async () => {
  const f = setup(kind), p = f.service(), start = await p.settings();
  expect(settingsSectionStatus(start.sections.site)).toBe('not_applied');
  const saved = await p.saveSettings(save(start));
  let current = await f.service().settings();
  expect(current.sections.site.saved.value.name).toBe('Changed'); expect(current.sections.site.effective).toBeNull(); expect(current.sections.site.saved.revision).toBe(saved.savedRevision);
  const request = await p.applySettings(apply(current));
  current = await p.settings(); expect(settingsSectionStatus(current.sections.site)).toBe('applying');
  await p.saveSettings(save(current, 'Newer draft'));
  current = await p.settings();
  f.proof(false);
  const complete = { protocolVersion: 1 as const, applicationId: request.id, expectedVersion: current.version, authorityEpoch: 'epoch-1', outcome: 'applied' as const, receiptId: 'host-receipt' };
  await expect(p.completeApplication(complete)).rejects.toMatchObject({ code: 'unavailable' });
  f.proof(true); await p.completeApplication(complete);
  current = await f.service().settings();
  expect(current.sections.site.saved.value.name).toBe('Newer draft'); expect(current.sections.site.effective?.value.name).toBe('Changed');
  expect(current.sections.site.effective?.revision).toBe(saved.savedRevision); expect(settingsSectionStatus(current.sections.site)).toBe('not_applied');
  expect((await p.application(request.id)).status).toBe('applied');
 });
 it('permits exactly one concurrent editor and never retries or merges a losing write', async () => {
  const f = setup(kind), start = await f.service().settings();
  const results = await Promise.allSettled([f.service().saveSettings(save(start, 'One')), f.service().saveSettings(save(start, 'Two'))]);
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  expect(results.find(r => r.status === 'rejected')).toMatchObject({ reason: { code: 'conflict' } });
 });
 it('replays persisted command receipts and rejects a changed payload or command kind', async () => {
  const f = setup(kind), p = f.service(), command = save(await p.settings(), 'Original', 'request-1');
  const receipt = await p.saveSettings(command); const after = await p.settings();
  expect(await f.service().saveSettings(command)).toEqual(receipt); expect((await p.settings()).version).toBe(after.version);
  await expect(p.saveSettings({ ...command, value: { ...command.value, name: 'Different' } })).rejects.toMatchObject({ code: 'conflict' });
  await expect(p.applySettings(apply(after, 'request-1'))).rejects.toMatchObject({ code: 'conflict' });
 });
 it('checks current authorization for reads, writes, status and even an identical replay', async () => {
  const f = setup(kind), p = f.service(), command = save(await p.settings()); await p.saveSettings(command); f.deny();
  await expect(p.settings()).rejects.toMatchObject({ code: 'forbidden' });
  await expect(p.saveSettings(command)).rejects.toMatchObject({ code: 'forbidden' });
  await expect(p.application('fake')).rejects.toMatchObject({ code: 'forbidden' });
  expect(f.calls).toContain('saveSettings');
 });
 it('rejects permission revocation while reading, and does not trust browser flags', async () => {
  const f = setup(kind), start = await f.service().settings(); let calls = 0;
  const p = createManagementSettingsService({ scope, store: f.store, authorize: async () => ({ allowed: ++calls === 1, version: 'grant-1' }), verifyApplication: async () => true });
  await expect(p.saveSettings(save(start))).rejects.toMatchObject({ code: 'forbidden' });
  await expect(f.service().saveSettings({ ...save(start), permissions: { allowed: true } } as never)).rejects.toMatchObject({ code: 'invalid' });
  expect((await f.service().settings()).version).toBe(start.version);
 });
 it('rejects stale saved/effective versions, another pending apply and stale authority epochs', async () => {
  const f = setup(kind), p = f.service(), start = await p.settings();
  await expect(p.saveSettings({ ...save(start), authorityEpoch: 'old' })).rejects.toMatchObject({ code: 'conflict' });
  await expect(p.applySettings({ ...apply(start), savedRevision: 'old' })).rejects.toMatchObject({ code: 'conflict' });
  await expect(p.applySettings({ ...apply(start), expectedEffectiveRevision: 'old' })).rejects.toMatchObject({ code: 'conflict' });
  const request = await p.applySettings(apply(start)); const current = await p.settings();
  expect(await p.applySettings(apply(start, request.commandId))).toEqual(request);
  await expect(p.applySettings(apply(current))).rejects.toMatchObject({ code: 'conflict' });
  await expect(p.completeApplication({ protocolVersion: 1, applicationId: request.id, expectedVersion: current.version, authorityEpoch: 'old', outcome: 'applied', receiptId: 'proof' })).rejects.toMatchObject({ code: 'conflict' });
 });
 it('does not let a stale completion overwrite a newer operation, including after failure', async () => {
  const f = setup(kind), p = f.service(), request = await p.applySettings(apply(await p.settings()));
  let current = await p.settings();
  const completion = { protocolVersion: 1 as const, applicationId: request.id, expectedVersion: current.version, authorityEpoch: 'epoch-1', outcome: 'failed' as const, receiptId: 'rejection-proof', errorCode: 'rejected' as const };
  await p.completeApplication(completion); current = await p.settings();
  expect(settingsSectionStatus(current.sections.site)).toBe('failed');
  const next = await p.applySettings(apply(current));
  await expect(p.completeApplication({ ...completion, outcome: 'applied', receiptId: 'late-proof', errorCode: undefined } as never)).rejects.toBeInstanceOf(ManagementFault);
  expect((await p.settings()).sections.site.application?.id).toBe(next.id);
 });
 it('fences an authority change at the durable CAS boundary', async () => {
  const f = setup(kind), start = await f.service().settings();
  const store: ManagementSettingsStore = { read: s => f.store.read(s), compareAndSwap: async input => {
   const current = (await f.store.read(scope))!; current.snapshot.authority.epoch = 'epoch-2'; current.snapshot.version = 'new-owner-version';
   f.db.prepare('UPDATE settings SET version=?,epoch=?,payload=?').run(current.snapshot.version, current.snapshot.authority.epoch, JSON.stringify(current));
   return f.store.compareAndSwap(input);
  } };
  const p = createManagementSettingsService({ scope, store, authorize: async () => ({ allowed: true, version: 'grant-1' }), verifyApplication: async () => true });
  await expect(p.saveSettings(save(start))).rejects.toMatchObject({ code: 'conflict' });
  expect((await f.service().settings()).sections.site.saved.value.name).toBe('Site');
 });
 it('passes proposed destination settings to live admission and denies cross-site accounts', async () => {
  const f = setup(kind), current = await f.service().settings();
  const p = createManagementSettingsService({ scope, store: f.store, authorize: async r => ({ allowed: r.section !== 'social' || !r.value || !('accountIds' in r.value) || !r.value.accountIds.includes('foreign-account'), version: 'grant-1' }), verifyApplication: async () => true });
  await expect(p.saveSettings({ protocolVersion: 1, commandId: 'foreign-destination', expectedVersion: current.version, authorityEpoch: current.authority.epoch, section: 'social', value: { enabled: true, requiresApproval: true, accountIds: ['foreign-account'] } })).rejects.toMatchObject({ code: 'forbidden' });
 });
 it('rechecks permission after asynchronous receipt verification and keeps the request pending', async () => {
  const f = setup(kind), request = await f.service().applySettings(apply(await f.service().settings())); let authorized = true;
  const current = await f.service().settings();
  const p = createManagementSettingsService({ scope, store: f.store, authorize: async () => ({ allowed: authorized, version: 'grant-1' }), verifyApplication: async () => { authorized = false; return true; } });
  await expect(p.completeApplication({ protocolVersion: 1, applicationId: request.id, expectedVersion: current.version, authorityEpoch: current.authority.epoch, outcome: 'applied', receiptId: 'verified-but-revoked' })).rejects.toMatchObject({ code: 'forbidden' });
  expect((await f.service().application(request.id)).status).toBe('applying'); expect((await f.service().settings()).sections.site.effective).toBeNull();
 });
 it('rejects stale completion versions without losing an existing verified receipt', async () => {
  const f = setup(kind), p = f.service(), request = await p.applySettings(apply(await p.settings())); const current = await p.settings();
  await p.saveSettings(save(current, 'New draft'));
  const completion = { protocolVersion: 1 as const, applicationId: request.id, expectedVersion: current.version, authorityEpoch: current.authority.epoch, outcome: 'applied' as const, receiptId: 'proof' };
  await expect(p.completeApplication(completion)).rejects.toMatchObject({ code: 'conflict' });
  const done = await p.completeApplication({ ...completion, expectedVersion: (await p.settings()).version });
  expect(await f.service().completeApplication(completion)).toEqual(done);
 });
 it('bounds persisted UTF-8 bytes and fails rather than silently evicting replay receipts', async () => {
  const f = setup(kind), current = (await f.store.read(scope))!;
  current.commands = Array.from({ length: 250 }, (_, i) => ({ commandId: 'c-' + i, operation: 'saveSettings' as const, fingerprint: 'あ'.repeat(1500), receipt: { commandId: 'c-' + i, version: 'v-' + i, section: 'site' as const, savedRevision: 's-' + i } }));
  f.db.prepare('UPDATE settings SET payload=?').run(JSON.stringify(current));
  await expect(f.service().settings()).rejects.toMatchObject({ code: 'unavailable' });
 });
 it('rejects permission revocation at the persistence boundary', async () => {
  const f = setup(kind), start = await f.service().settings();
  const store: ManagementSettingsStore = { read: s => f.store.read(s), compareAndSwap: async input => { f.deny(); return f.store.compareAndSwap(input); } };
  const p = createManagementSettingsService({ scope, store, authorize: async () => ({ allowed: true, version: 'grant-1' }), verifyApplication: async () => true });
  await expect(p.saveSettings(save(start))).rejects.toMatchObject({ code: 'conflict' });
  const stored = await f.store.read(scope); expect(stored!.snapshot.sections.site.saved.value.name).toBe('Site');
 });
 it('rejects malformed truthy CAS acknowledgements for both save and apply', async () => {
  const f = setup(kind), start = await f.service().settings();
  const store: ManagementSettingsStore = { read: s => f.store.read(s), compareAndSwap: async () => ({ ok: false }) as never };
  const p = createManagementSettingsService({ scope, store, authorize: async () => ({ allowed: true, version: 'grant-1' }), verifyApplication: async () => true });
  await expect(p.saveSettings(save(start))).rejects.toMatchObject({ code: 'unavailable' });
  await expect(p.applySettings(apply(start))).rejects.toMatchObject({ code: 'unavailable' });
 });
 it('rejects an apply receipt retargeted to a different valid application', async () => {
  const f = setup(kind), p = f.service(), command = apply(await p.settings(), 'apply-site'); await p.applySettings(command);
  const current = await p.settings();
  const other = await p.applySettings({ ...apply(current, 'apply-report'), section: 'reporting', savedRevision: current.sections.reporting.saved.revision, expectedEffectiveRevision: null });
  const record = (await f.store.read(scope))!;
  const saved = record.commands.find(c => c.commandId === command.commandId)!; (saved.receipt as { id: string }).id = other.id;
  f.db.prepare('UPDATE settings SET payload=?').run(JSON.stringify(record));
  await expect(p.applySettings(command)).rejects.toMatchObject({ code: 'unavailable' });
  await expect(p.settings()).rejects.toMatchObject({ code: 'unavailable' });
 });
 it('fails closed on foreign or malformed persisted records and paused writes', async () => {
  const f = setup(kind), p = f.service(), current = await f.store.read(scope); expect(current).not.toBeNull();
  current!.snapshot.scope.siteId = 'foreign'; f.db.prepare('UPDATE settings SET payload=?').run(JSON.stringify(current));
  await expect(p.settings()).rejects.toMatchObject({ code: 'unavailable' });
  current!.snapshot.scope.siteId = scope.siteId; current!.snapshot.authority.status = 'paused'; f.db.prepare('UPDATE settings SET payload=?').run(JSON.stringify(current));
  await expect(p.saveSettings(save(current!.snapshot))).rejects.toMatchObject({ code: 'unavailable' });
  current!.snapshot.sections.site.saved.value = { name: 42 } as never; f.db.prepare('UPDATE settings SET payload=?').run(JSON.stringify(current));
  await expect(p.settings()).rejects.toMatchObject({ code: 'unavailable' });
 });
});
