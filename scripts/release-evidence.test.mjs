import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveStagingRun } from './release-evidence.mjs';
const sha = 'a'.repeat(40);
function fixture(change = () => {}) {
  const data = {
    workflow: { id: 7 },
    run: { id: 123, workflow_id: 7, run_attempt: 1, path: '.github/workflows/release.yml', event: 'workflow_dispatch', status: 'completed', conclusion: 'success', head_branch: 'main', head_sha: sha, head_repository: { full_name: 'dataarthub/sitekit' } },
    jobs: { total_count: 2, jobs: [{ name: 'verify', status: 'completed', conclusion: 'success' }, { name: 'stage', status: 'completed', conclusion: 'success' }] },
    artifacts: { total_count: 1, artifacts: [{ id: 456, name: 'verified-npm-release-123-1', expired: false, expires_at: '2099-01-01T00:00:00Z', digest: 'sha256:' + 'b'.repeat(64), workflow_run: { id: 123, head_sha: sha } }] },
  };
  change(data);
  return async path => path.endsWith('/release.yml') ? data.workflow : path.includes('/jobs?') ? data.jobs : path.includes('/artifacts?') ? data.artifacts : data.run;
}
test('resolves exact successful source, attempt and immutable artifact from GitHub rather than caller labels', async () => {
  const evidence = await resolveStagingRun('123', { request: fixture() });
  assert.equal(evidence.commit, sha); assert.equal(evidence.artifactId, 456); assert.equal(evidence.attempt, 1);
});
test('rejects failed/newer attempts, wrong workflow/repository/event/branch, skipped staging and expired or ambiguous artifacts', async () => {
  for (const change of [
    d => { d.run.conclusion = 'failure'; }, d => { d.run.run_attempt = 2; }, d => { d.run.workflow_id = 9; },
    d => { d.run.head_repository.full_name = 'fork/repo'; }, d => { d.run.event = 'pull_request'; },
    d => { d.run.head_branch = 'feature'; }, d => { d.jobs.jobs[1].conclusion = 'skipped'; },
    d => { d.artifacts.artifacts[0].expired = true; }, d => { d.artifacts.artifacts[0].workflow_run.head_sha = 'c'.repeat(40); },
    d => { d.artifacts.artifacts.push({ ...d.artifacts.artifacts[0], id: 457 }); },
  ]) await assert.rejects(resolveStagingRun('123', { request: fixture(change) }));
  await assert.rejects(resolveStagingRun('../other', { request: fixture() }));
});
