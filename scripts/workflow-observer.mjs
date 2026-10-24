import assert from 'node:assert/strict';
import {readFile,writeFile,appendFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {resolveStagingRun,githubRequest} from './release-evidence.mjs';
import {verifyBundleIdentity,digest,registry} from './release-bundle-core.mjs';
import {assertReleaseSelection} from './release-context.mjs';
import {observeApproval,requestCompletionOnce} from './workflow-supply/public/approval.mjs';
assert(process.env.GITHUB_ACTIONS==='true'&&process.env.GITHUB_REPOSITORY==='dataarthub/sitekit'&&process.env.GITHUB_EVENT_NAME==='workflow_run','Trusted default-branch approval observer required');
assert.equal(process.env.GITHUB_WORKFLOW_REF,'dataarthub/sitekit/.github/workflows/complete-approved.yml@refs/heads/main');assert.equal(process.env.GITHUB_RUN_ATTEMPT,'1','Inspect uncertain dispatch before any observer retry');
const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,'utf8')),r=event.workflow_run;
assert(r?.event==='release'&&r.path==='.github/workflows/publish.yml'&&r.conclusion==='success'&&r.head_repository?.full_name==='dataarthub/sitekit','Untrusted staging event');
const evidence=await resolveStagingRun(r.id);assert.equal(evidence.attempt,r.run_attempt,'Stale observer event');const original=await githubRequest('/actions/runs/'+evidence.runId);evidence.createdAt=original.created_at;
assert(Number.isFinite(Date.parse(evidence.createdAt)));
if(process.argv[2]==='resolve'){await writeFile('.verification/observed-release.json',JSON.stringify(evidence)+'\n');await appendFile(process.env.GITHUB_OUTPUT,`run=${evidence.runId}\nartifact=${evidence.artifactId}\n`);}
else{
 const manifest=JSON.parse(await readFile('.verification/handoff/release.json','utf8'));const root=resolve(import.meta.dirname,'..');
 const targets=['core','cloudflare'].map(kind=>{const meta=JSON.parse(execFileSync('git',['show',evidence.commit+':packages/'+kind+'/package.json'],{cwd:root,encoding:'utf8'}));return {kind,name:meta.name,version:meta.version};});
 await verifyBundleIdentity(manifest,{directory:resolve('.verification/handoff'),expectedCommit:evidence.commit,targets});assertReleaseSelection(manifest,evidence);assert.deepEqual(manifest.staging,{runId:evidence.runId,attempt:evidence.attempt});
 const artifacts=manifest.artifacts.filter(a=>manifest.targets.includes(a.name));assert(artifacts.length===manifest.targets.length);
 const readVersion=async(a,left)=>{const response=await fetch(`${registry}/${encodeURIComponent(a.name)}/${encodeURIComponent(a.version)}`,{redirect:'error',signal:AbortSignal.timeout(Math.max(1,Math.floor(Math.min(left,30000))))});if(response.status===404)return null;assert(response.ok,'Registry read unavailable');return response.json();};
 const state=await observeApproval(artifacts,{readVersion,verifyArtifact:async(a,left)=>{const v=await readVersion(a,left);assert(v?.dist?.integrity===a.integrity);const url=new URL(v.dist.tarball);assert.equal(url.origin,registry);const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(Math.max(1,Math.floor(Math.min(left,30000))))});assert(response.ok);assert.equal(digest(Buffer.from(await response.arrayBuffer())).sha256,a.sha256);},revalidate:async()=>{const current=await resolveStagingRun(r.id);const {createdAt,...saved}=evidence;assert.deepEqual(current,saved,'Original staging evidence changed');},dispatch:()=>requestCompletionOnce(evidence,{request:githubRequest})});
 console.log(state);if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,`${state}: staging run ${r.id}. If approval finishes later, complete publish.yml with staged_run=${r.id}; never stage again.\n`);
}
