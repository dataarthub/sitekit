import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveStagingRun } from './release-evidence.mjs';
const sha = 'a'.repeat(40);
test('archive preparation receives its own read-only source-evidence credential', () => {
  const project = JSON.parse(readFileSync(new URL('./workflow-project/roles.json', import.meta.url), 'utf8'));
  const verify = project.publish.jobs.verify;
  const prepare = verify.steps.find(step => /(?:bun run release:prepare|release-bundle\.mjs prepare)/.test(step.run??''));
  assert(prepare, 'Archive preparation step must exist');
  assert.equal(prepare.env?.GITHUB_TOKEN, '${{ github.token }}', 'Step-scoped credentials do not carry over from require-source');
  assert.deepEqual(verify.permissions, {contents: 'read', actions: 'read'});
  assert.equal(prepare.env?.NODE_AUTH_TOKEN, undefined, 'Verification must not need registry write credentials');
});
function fixture(change = () => {}) {
  const data = {
    workflow: { id: 7 },
    release: {id:17,tag_name:'sitekit-core-v0.2.0',draft:false,prerelease:false},
    ref: {object:{type:'tag',sha:'d'.repeat(40)}},
    tag: {object:{type:'commit',sha}},
    compare: {status:'ahead'},
    run: { id: 123, workflow_id: 7, run_attempt: 1, path: '.github/workflows/publish.yml', event: 'release', status: 'completed', conclusion: 'success', head_branch: 'sitekit-core-v0.2.0', head_sha: sha, head_repository: { full_name: 'dataarthub/sitekit' } },
    jobs: { total_count: 2, jobs: [{ name: 'verify', status: 'completed', conclusion: 'success' }, { name: 'stage', status: 'completed', conclusion: 'success' }] },
    artifacts: { total_count: 1, artifacts: [{ id: 456, name: 'verified-npm-release-123-1', expired: false, expires_at: '2099-01-01T00:00:00Z', digest: 'sha256:' + 'b'.repeat(64), workflow_run: { id: 123, head_sha: sha } }] },
  };
  change(data);
  return async path => path.startsWith('/releases/tags/') ? data.release : path.startsWith('/git/ref/tags/') ? data.ref : path.startsWith('/git/tags/') ? data.tag : path.startsWith('/compare/') ? data.compare : path.endsWith('/publish.yml') ? data.workflow : path.includes('/jobs?') ? data.jobs : path.includes('/artifacts?') ? data.artifacts : data.run;
}
test('resolves exact successful source, attempt and immutable artifact from GitHub rather than caller labels', async () => {
  const evidence = await resolveStagingRun('123', { request: fixture() });
  assert.equal(evidence.commit, sha); assert.equal(evidence.artifactId, 456); assert.equal(evidence.attempt, 1); assert.deepEqual(evidence.release,{id:17,tag:'sitekit-core-v0.2.0'});
});
test('rejects failed/newer attempts, wrong workflow/repository/event/branch, skipped staging and expired or ambiguous artifacts', async () => {
  for (const change of [
    d => { d.run.conclusion = 'failure'; }, d => { d.run.run_attempt = 2; }, d => { d.run.workflow_id = 9; },
    d => { d.run.head_repository.full_name = 'fork/repo'; }, d => { d.run.event = 'pull_request'; },
    d => { d.run.head_branch = 'feature'; }, d => { d.run.event='workflow_dispatch'; },
    d => { d.release.draft=true; }, d => { d.release.prerelease=true; }, d => { d.tag.object.sha='e'.repeat(40); }, d => { d.compare.status='diverged'; }, d => { d.jobs.jobs[1].conclusion = 'skipped'; },
    d => { d.artifacts.artifacts[0].expired = true; }, d => { d.artifacts.artifacts[0].workflow_run.head_sha = 'c'.repeat(40); },
    d => { d.artifacts.artifacts.push({ ...d.artifacts.artifacts[0], id: 457 }); },
  ]) await assert.rejects(resolveStagingRun('123', { request: fixture(change) }));
  await assert.rejects(resolveStagingRun('../other', { request: fixture() }));
});
