import test from 'node:test';
import assert from 'node:assert/strict';
import { executeStage, executeRelease, npmWriteArgs } from './release-publish.mjs';
const artifact = { name: '@alneas/sitekit', version: '0.2.0', integrity: 'sha512-reviewed', archive: 'core.tgz' };
const manifest = { targets: [artifact.name], artifacts: [artifact] };
const state = () => ({ name: artifact.name, versions: { '0.1.0': {} }, 'dist-tags': { beta: '0.1.0', latest: '0.1.0' } });
const approved = () => ({ ...state(), versions: { '0.1.0': {}, [artifact.version]: { dist: { integrity: artifact.integrity } } }, 'dist-tags': { staged: artifact.version, beta: '0.1.0', latest: '0.1.0' } });
test('stage submits only reviewed bytes on the inspection tag and never promotes consumer channels', async () => {
  const writes = [];
  await executeStage(manifest, { readState: async () => state(), verifyArtifact: async () => assert.fail('Unapproved bytes are not public'), write: async (...args) => writes.push(args) });
  assert.deepEqual(writes, [['stage', artifact, 'staged']]);
  const args = npmWriteArgs('stage', artifact, 'staged', '/owned/bundle', 'false');
  assert.deepEqual(args.slice(0, 2), ['stage', 'publish']);
  assert(args.includes('--ignore-scripts') && args.includes('--provenance') && args.includes('--workspaces=false'));
  assert.throws(() => npmWriteArgs('publish', artifact, 'beta', '/owned/bundle'));
});
test('completion before approval stops every write and cannot stage or publish', async () => {
  let writes = 0;
  await assert.rejects(executeRelease(manifest, { readState: async () => state(), verifyArtifact: async () => {}, write: async () => writes++ }), /approval/);
  assert.equal(writes, 0);
});
test('completion verifies all selected public archives before any tag write and can repair tags idempotently', async () => {
  const cloud = { ...artifact, name: '@alneas/sitekit-cloudflare', archive: 'cloud.tgz' };
  const selected = { targets: [cloud.name, artifact.name], artifacts: [artifact, cloud] };
  const remote = new Map([artifact, cloud].map(a => [a.name, { ...approved(), name: a.name }]));
  const events = [];
  const options = { readState: async name => remote.get(name), checkPrerequisite: async () => {}, verifyArtifact: async a => events.push('verify:' + a.name), write: async (action, a, tag) => { assert.equal(action, 'tag'); assert(events.includes('verify:' + artifact.name) && events.includes('verify:' + cloud.name)); events.push('tag'); remote.get(a.name)['dist-tags'][tag] = a.version; } };
  await executeRelease(selected, options);
  assert.equal(events.filter(x => x === 'tag').length, 4);
  await executeRelease(selected, options);
  assert.equal(events.filter(x => x === 'tag').length, 4);
});
test('failed or ambiguous staging is never retried automatically', async () => {
  let writes = 0;
  await assert.rejects(executeStage(manifest, { readState: async () => state(), write: async () => { writes++; throw Error('ambiguous'); } }));
  assert.equal(writes, 1);
});
test('unavailable adapter prerequisites block staging before even the core is submitted', async () => {
  const cloud = { ...artifact, name: '@alneas/sitekit-cloudflare' }; let writes = 0;
  await assert.rejects(executeStage({ targets: [artifact.name, cloud.name], artifacts: [artifact, cloud] }, { readState: async name => ({ ...state(), name }), checkPrerequisite: async () => { throw Error('core not public'); }, write: async () => writes++ }));
  assert.equal(writes, 0);
});
test('approval propagation uses bounded read-only polling and fails at its deadline', async () => {
  const { waitForApproval } = await import('./release-publish.mjs');
  let clock = 0, reads = 0;
  await waitForApproval(manifest, async () => ++reads < 3 ? state() : approved(), { now: () => clock, sleep: async delay => { clock += delay; }, timeout: 100, interval: 10 });
  assert.equal(reads, 3);
  await assert.rejects(waitForApproval(manifest, async () => state(), { now: () => clock, sleep: async delay => { clock += delay; }, timeout: 20, interval: 10 }), /Awaiting npm approval/);
  const before = reads;
  await assert.rejects(waitForApproval(manifest, async () => { reads++; throw Error('registry unavailable'); }, { now: () => clock }), /registry unavailable/);
  assert.equal(reads, before + 1);
});
test('a selected already-public archive must pass byte verification before any new stage submission', async () => {
  const cloud = { ...artifact, name: '@alneas/sitekit-cloudflare' }; let writes = 0;
  await assert.rejects(executeStage({ targets: [artifact.name, cloud.name], artifacts: [artifact, cloud] }, { readState: async name => name === cloud.name ? { ...approved(), name } : state(), checkPrerequisite: async () => {}, verifyArtifact: async () => { throw Error('delivered bytes mismatch'); }, write: async () => writes++ }));
  assert.equal(writes, 0);
});
test('fractional monotonic request budgets produce valid bounded AbortSignals', async () => {
  const { publicJson } = await import('./release-publish.mjs');
  const previous = globalThis.fetch;
  try {
    globalThis.fetch = async (_url, options) => { assert(options.signal instanceof AbortSignal); return { ok: true, json: async () => state() }; };
    assert.equal((await publicJson('fixture', 12.5)).name, artifact.name);
  } finally { globalThis.fetch = previous; }
});

test('private staging disables unsupported provenance, public staging requires it, and unknown visibility blocks writes', () => {
  const privateArgs = npmWriteArgs('stage', artifact, 'staged', '/owned/bundle', 'true');
  assert(privateArgs.includes('--provenance=false'));
  assert(!privateArgs.includes('--provenance'));
  const publicArgs = npmWriteArgs('stage', artifact, 'staged', '/owned/bundle', 'false');
  assert(publicArgs.includes('--provenance'));
  assert(!publicArgs.includes('--provenance=false'));
  for (const value of [undefined, '', 'unknown', true, false]) {
    assert.throws(() => npmWriteArgs('stage', artifact, 'staged', '/owned/bundle', value), /repository visibility/);
  }
  assert.deepEqual(npmWriteArgs('tag', artifact, 'latest', '/owned/bundle', 'true'), npmWriteArgs('tag', artifact, 'latest', '/owned/bundle', 'false'));
});
