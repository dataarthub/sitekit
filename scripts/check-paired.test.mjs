import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { verifySide, verifyPair } from './check-paired.mjs';

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'paired-maintenance-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const git = (root, ...args) => {
    const result = spawnSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', '-c', 'init.templateDir=', ...args], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
  };
  const plans = {}, pair = { schemaVersion: 1, taskId: 'fixture-task', sides: {}, checks: [{ name: 'compatibility', command: [process.execPath, '-e', 'process.exit(0)'] }], delivery: { public: 'pending', private: 'pending' } };
  for (const side of ['public', 'private']) {
    const root = join(dir, side); mkdirSync(root);
    git(root, 'init', '-q'); git(root, 'config', 'user.email', 'fixture@example.invalid'); git(root, 'config', 'user.name', 'Fixture');
    writeFileSync(join(root, 'source.txt'), 'version one\n'); git(root, 'add', '.'); git(root, 'commit', '-qm', 'initial');
    const plan = join(dir, side + '-plan.json'), receipt = join(dir, side + '-receipt.json');
    plans[side] = { schemaVersion: 1, taskId: pair.taskId, side, revision: git(root, 'rev-parse', 'HEAD'), impact: { decision: 'changed', rationale: 'Updated supported behavior', reviewedBy: 'maintainer' }, checks: [{ name: 'local', command: [process.execPath, '-e', 'process.exit(0)'] }] };
    writeFileSync(plan, JSON.stringify(plans[side])); pair.sides[side] = { root, plan, receipt };
  }
  const save = side => writeFileSync(pair.sides[side].plan, JSON.stringify(plans[side]));
  const run = side => verifySide({ ...pair.sides[side], output: pair.sides[side].receipt });
  return { dir, git, plans, pair, save, run };
}

test('public verification runs with no private checkout or coordination record', t => {
  const f = fixture(t); rmSync(f.pair.sides.private.root, { recursive: true });
  f.run('public'); assert.ok(existsSync(f.pair.sides.public.receipt));
});
test('both verified sides plus compatibility pass with independent pending delivery', t => {
  const f = fixture(t); f.run('public'); f.run('private');
  assert.deepEqual(verifyPair(f.pair).delivery, { public: 'pending', private: 'pending' });
  f.pair.delivery.public = 'delivered';
  assert.equal(verifyPair(f.pair).delivery.private, 'pending');
});
test('missing side, inaccessible repository and missing receipt cannot complete', t => {
  const f = fixture(t); f.run('public');
  assert.throws(() => verifyPair(f.pair));
  const incomplete = structuredClone(f.pair); delete incomplete.sides.private;
  assert.throws(() => verifyPair(incomplete));
  f.run('private'); rmSync(f.pair.sides.private.root, { recursive: true });
  assert.throws(() => verifyPair(f.pair));
});
test('changed committed revision, dirty tracked and untracked inputs invalidate evidence', t => {
  const f = fixture(t); f.run('public'); f.run('private');
  const root = f.pair.sides.private.root;
  writeFileSync(join(root, 'untracked.txt'), 'new'); assert.throws(() => verifyPair(f.pair)); rmSync(join(root, 'untracked.txt'));
  writeFileSync(join(root, 'source.txt'), 'changed'); assert.throws(() => verifyPair(f.pair));
  f.git(root, 'add', '.'); f.git(root, 'commit', '-qm', 'changed'); assert.throws(() => verifyPair(f.pair));
});
test('plan changes and receipt task, side, revision or result tampering fail', t => {
  const f = fixture(t); f.run('public'); f.run('private');
  const path = f.pair.sides.public.receipt, original = readFileSync(path, 'utf8');
  for (const mutate of [r => r.taskId = 'other', r => r.side = 'private', r => r.revision = 'a'.repeat(40), r => r.checks = [], r => r.checks[0].status = 'failed', r => r.planSha256 = 'b'.repeat(64)]) {
    const receipt = JSON.parse(original); mutate(receipt); writeFileSync(path, JSON.stringify(receipt)); assert.throws(() => verifyPair(f.pair));
  }
  writeFileSync(path, original); f.plans.public.checks[0].command = [process.execPath, '-e', 'process.exit(1)']; f.save('public'); assert.throws(() => verifyPair(f.pair));
});
test('failed rerun removes previous passing receipt; command failure cannot pass', t => {
  const f = fixture(t); f.run('public');
  f.plans.public.checks[0].command = [process.execPath, '-e', 'process.exit(7)']; f.save('public');
  assert.throws(() => f.run('public')); assert.equal(existsSync(f.pair.sides.public.receipt), false);
});
test('empty checks, skipped results, unavailable executable and timeouts fail', t => {
  const f = fixture(t);
  for (const checks of [[], [{ name: 'missing', command: ['no-such-paired-check-executable'] }], [{ name: 'timeout', command: [process.execPath, '-e', 'setTimeout(()=>{}, 10000)'], timeoutMs: 25 }]]) {
    f.plans.public.checks = checks; f.save('public'); assert.throws(() => f.run('public'));
  }
});
test('no-change requires rationale and review; still runs actual checks', t => {
  const f = fixture(t); f.plans.private.impact.decision = 'no-change'; f.save('private'); f.run('private'); f.run('public'); assert.ok(verifyPair(f.pair));
  for (const key of ['rationale', 'reviewedBy']) {
    const old = f.plans.private.impact[key]; f.plans.private.impact[key] = ''; f.save('private'); assert.throws(() => f.run('private')); f.plans.private.impact[key] = old;
  }
});
test('broken compatibility and absent compatibility selection reject whole-task completion', t => {
  const f = fixture(t); f.run('public'); f.run('private');
  f.pair.checks[0].command = [process.execPath, '-e', 'process.exit(1)']; assert.throws(() => verifyPair(f.pair));
  f.pair.checks = []; assert.throws(() => verifyPair(f.pair));
});
test('commands that modify checked sources cannot produce a passing receipt', t => {
  const f = fixture(t); f.plans.public.checks[0].command = [process.execPath, '-e', "require('node:fs').writeFileSync('source.txt','mutation')"]; f.save('public');
  assert.throws(() => f.run('public')); assert.equal(existsSync(f.pair.sides.public.receipt), false);
});
test('real CLI rejects incomplete input with no sensitive source echoed', t => {
  const f = fixture(t); const path = join(f.dir, 'pair.json'); writeFileSync(path, JSON.stringify(f.pair));
  const result = spawnSync(process.execPath, [new URL('./check-paired.mjs', import.meta.url).pathname, 'pair', path], { encoding: 'utf8' });
  assert.notEqual(result.status, 0); assert.match(result.stderr, /failed/); assert.ok(!result.stderr.includes(f.dir));
});
test('real public CLI creates a receipt and restricted CLI verifies both sides', t => {
  const f = fixture(t); const cli = join(f.dir, 'standalone-checker.mjs');
  copyFileSync(new URL('./check-paired.mjs', import.meta.url), cli);
  for (const side of ['public', 'private']) {
    const entry = f.pair.sides[side];
    const result = spawnSync(process.execPath, [cli, 'side', entry.root, entry.plan, entry.receipt], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }
  const path = join(f.dir, 'pair.json'); writeFileSync(path, JSON.stringify(f.pair));
  const result = spawnSync(process.execPath, [cli, 'pair', path], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(result.stdout).development, 'verified');
});
test('a private consumer failing against a changed public API blocks coordination', t => {
  const f = fixture(t), root = f.pair.sides.public.root;
  writeFileSync(join(root, 'api.json'), JSON.stringify({ exports: ['newApi'] })); f.git(root, 'add', '.'); f.git(root, 'commit', '-qm', 'API change');
  f.plans.public.revision = f.git(root, 'rev-parse', 'HEAD'); f.save('public'); f.run('public'); f.run('private');
  f.pair.checks = [{ name: 'consumer compatibility', command: [process.execPath, '-e', "const api=JSON.parse(require('node:fs').readFileSync(process.argv[1]));if(!api.exports.includes('oldApi'))process.exit(1)", join(root, 'api.json')] }];
  assert.throws(() => verifyPair(f.pair), /Required command failed/);
});
test('project-supplied adoption check rejects unpublished or nonexact dependencies', t => {
  const f = fixture(t), dependency = join(f.dir, 'dependency.json'); f.run('public'); f.run('private');
  const check = "const d=JSON.parse(require('node:fs').readFileSync(process.argv[1]));if(d.published!==true || d.constraint!==d.version)process.exit(1)";
  f.pair.checks = [{ name: 'registry adoption fixture', command: [process.execPath, '-e', check, dependency] }];
  for (const state of [{ published: false, version: '1.2.0', constraint: '1.2.0' }, { published: true, version: '1.2.0', constraint: '^1.2.0' }]) {
    writeFileSync(dependency, JSON.stringify(state)); assert.throws(() => verifyPair(f.pair), /Required command failed/);
  }
  writeFileSync(dependency, JSON.stringify({ published: true, version: '1.2.0', constraint: '1.2.0' })); assert.ok(verifyPair(f.pair));
});
test('checks cannot mutate either repository during coordination', t => {
  const f = fixture(t); f.run('public'); f.run('private');
  f.pair.checks = [{ name: 'bad compatibility tool', command: [process.execPath, '-e', "require('node:fs').writeFileSync(process.argv[1],'changed')", join(f.pair.sides.private.root, 'source.txt')] }];
  assert.throws(() => verifyPair(f.pair), /Clean tracked/);
});
test('invalid, skipped and duplicate selections fail instead of reducing required coverage', t => {
  const f = fixture(t);
  for (const checks of [[{ name: 'empty', command: [] }], [{ name: 'x', command: [process.execPath] }, { name: 'x', command: [process.execPath] }]]) {
    f.plans.public.checks = checks; f.save('public'); assert.throws(() => f.run('public'));
  }
  f.plans.public.checks = [{ name: 'local', command: [process.execPath, '-e', 'process.exit(0)'] }]; f.save('public'); f.run('public'); f.run('private');
  const path = f.pair.sides.public.receipt, receipt = JSON.parse(readFileSync(path)); receipt.checks[0].status = 'skipped'; writeFileSync(path, JSON.stringify(receipt)); assert.throws(() => verifyPair(f.pair));
});
test('one checkout cannot masquerade as both public and private repositories', t => {
  const f = fixture(t); f.run('public');
  f.pair.sides.private.root = f.pair.sides.public.root;
  f.plans.private.revision = f.plans.public.revision; f.save('private'); f.run('private');
  assert.throws(() => verifyPair(f.pair), /Distinct/);
});
test('coordination revalidates receipts after compatibility commands', t => {
  const f = fixture(t); f.run('public'); f.run('private');
  f.pair.checks = [{ name: 'receipt mutation', command: [process.execPath, '-e', "require('node:fs').rmSync(process.argv[1])", f.pair.sides.private.receipt] }];
  assert.throws(() => verifyPair(f.pair));
});

test('receipt output through a directory alias cannot delete repository source', t => {
  const f = fixture(t), alias = join(f.dir, 'alias');
  symlinkSync(f.pair.sides.public.root, alias, 'junction');
  assert.throws(() => verifySide({ ...f.pair.sides.public, output: join(alias, 'source.txt') }));
  assert.equal(readFileSync(join(f.pair.sides.public.root, 'source.txt'), 'utf8'), 'version one\n');
});
test('receipt output cannot delete the side plan addressed through an alias', t => {
  const f = fixture(t), alias = join(f.dir, 'plans-alias'); symlinkSync(f.dir, alias, 'junction');
  const entry = f.pair.sides.public;
  assert.throws(() => verifySide({ root: entry.root, plan: join(alias, 'public-plan.json'), output: entry.plan }));
  assert.ok(existsSync(entry.plan));
});
test('dirty submodule inputs fail despite repository ignore-submodules settings', t => {
  const f = fixture(t), root = f.pair.sides.private.root;
  f.git(root, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', f.pair.sides.public.root, 'dependency');
  f.git(root, 'commit', '-qm', 'add dependency fixture');
  f.git(root, 'config', 'submodule.dependency.ignore', 'all');
  f.plans.private.revision = f.git(root, 'rev-parse', 'HEAD'); f.save('private'); f.run('private');
  writeFileSync(join(root, 'dependency', 'source.txt'), 'dirty submodule');
  assert.throws(() => f.run('private'), /Clean tracked/);
});
test('failed checks expose only a safe step identifier, exit status and signal', t => {
  const f = fixture(t), entry = f.pair.sides.public;
  f.plans.public.checks.push({ name: 'typecheck', command: [process.execPath, '-e', "console.error('PRIVATE-STDERR');process.exit(7)"] }); f.save('public');
  const result = spawnSync(process.execPath, [new URL('./check-paired.mjs', import.meta.url).pathname, 'side', entry.root, entry.plan, entry.receipt], { encoding: 'utf8' });
  assert.equal(result.status, 1); assert.match(result.stderr, /"step":2/); assert.match(result.stderr, /"check":"typecheck"/); assert.match(result.stderr, /"status":7/);
  assert.ok(!result.stderr.includes('PRIVATE-STDERR')); assert.ok(!result.stderr.includes(f.dir));
  f.plans.public.checks[1].name = '/private/SECRET\u001b[31m'; f.save('public');
  const unsafe = spawnSync(process.execPath, [new URL('./check-paired.mjs', import.meta.url).pathname, 'side', entry.root, entry.plan, entry.receipt], { encoding: 'utf8' });
  assert.match(unsafe.stderr, /"step":2/); assert.ok(!unsafe.stderr.includes('SECRET')); assert.ok(!unsafe.stderr.includes('\u001b'));
});
test('deadline kills a grandchild even when its direct launcher ignores SIGTERM', async t => {
  const f = fixture(t), pidFile = join(f.dir, 'grandchild.pid'), heartbeat = join(f.dir, 'heartbeat'); let pid;
  const grandchild = "const fs=require('node:fs');process.on('SIGTERM',()=>{});setInterval(()=>fs.writeFileSync(process.argv[1],String(Date.now())),20)";
  const launcher = "const cp=require('node:child_process');const fs=require('node:fs');const c=cp.spawn(process.execPath,['-e',process.argv[2],process.argv[3]],{stdio:'ignore'});fs.writeFileSync(process.argv[1],String(c.pid));process.on('SIGTERM',()=>{});setInterval(()=>{},1000)";
  f.plans.public.checks = [{ name: 'nested-worker', command: [process.execPath, '-e', launcher, pidFile, grandchild, heartbeat], timeoutMs: 1000 }]; f.save('public');
  try {
    assert.throws(() => f.run('public'));
    pid = Number(readFileSync(pidFile, 'utf8'));
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.ok(existsSync(heartbeat), 'grandchild must actually have run before timeout');
    const before = readFileSync(heartbeat, 'utf8'); await new Promise(resolve => setTimeout(resolve, 200));
    assert.equal(readFileSync(heartbeat, 'utf8'), before, 'timed-out descendant must stop writing');
    assert.equal(existsSync(f.pair.sides.public.receipt), false);
  } finally { if (pid) try { process.kill(pid, 'SIGKILL'); } catch {} }
});
test('successful launcher cannot leave a background worker running', async t => {
  const f = fixture(t), pidFile = join(f.dir, 'background.pid'), heartbeat = join(f.dir, 'heartbeat'); let pid;
  const child = "const fs=require('node:fs');fs.writeFileSync(process.argv[1],'started');setInterval(()=>fs.writeFileSync(process.argv[1],String(Date.now())),20)";
  const launcher = "const cp=require('node:child_process');const fs=require('node:fs');const c=cp.spawn(process.execPath,['-e',process.argv[2],process.argv[3]],{stdio:'ignore'});fs.writeFileSync(process.argv[1],String(c.pid));setTimeout(()=>process.exit(0),300)";
  f.plans.public.checks = [{ name: 'background-worker', command: [process.execPath, '-e', launcher, pidFile, child, heartbeat] }]; f.save('public');
  try {
    f.run('public'); pid = Number(readFileSync(pidFile, 'utf8'));
    await new Promise(resolve=>setTimeout(resolve,100)); assert.ok(existsSync(heartbeat));
    const before=readFileSync(heartbeat,'utf8');await new Promise(resolve=>setTimeout(resolve,200));
    assert.equal(readFileSync(heartbeat,'utf8'),before,'background descendant must stop writing');
  } finally { if(pid) try {process.kill(pid,'SIGKILL');} catch {} }
});
test('timeout and signal failures retain sanitized machine-readable diagnostics', t => {
  const f=fixture(t), entry=f.pair.sides.public, cli=new URL('./check-paired.mjs',import.meta.url).pathname;
  for(const [command,timeoutMs,reason,signal] of [
    [[process.execPath,'-e','setInterval(()=>{},1000)'],100,'timeout','SIGKILL'],
    [[process.execPath,'-e',"process.kill(process.pid,'SIGTERM')"],1000,'signal','SIGTERM'],
  ]) {
    f.plans.public.checks=[{name:'bounded-check',command,timeoutMs}];f.save('public');
    const result=spawnSync(process.execPath,[cli,'side',entry.root,entry.plan,entry.receipt],{encoding:'utf8'});
    assert.equal(result.status,1);
    const detail=JSON.parse(result.stderr.trim().split('\n').at(-1));
    assert.equal(detail.stage,'local');assert.equal(detail.step,1);assert.equal(detail.reason,reason);assert.equal(detail.signal,signal);assert.equal(detail.status,null);
    assert.equal(existsSync(entry.receipt),false);
  }
});
