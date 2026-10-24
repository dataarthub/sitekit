// Maintained control code for fixed, never-submitted Release candidates only.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {executionIdentity,inputHash,requireSource} from './workflow-supply/public/quality.mjs';

export const candidates=Object.freeze({'core-0.2.0':Object.freeze({
 id:'core-0.2.0',releaseId:423034956,tag:'sitekit-core-v0.2.0',
 sourceCommit:'068e02f749d184dd021629e30f91840b74cbfe1d',originalRunId:40141818246,originalAttempt:1,
 failedStep:'Project: Prepare and test exact release archives',
 preStageFailures:Object.freeze([Object.freeze({run:40143941241,attempt:1,control:'2957f2d2baf150dbff4e25a64cf14446c66a851d',step:'Project: Authenticate source and execute fresh Node 24 checks'})]),
})});
const repository='dataarthub/sitekit',workflow='.github/workflows/publish.yml';
const git=(root,args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',timeout:10_000}).trim();
export function readEvent(env=process.env){return JSON.parse(readFileSync(env.GITHUB_EVENT_PATH,'utf8'));}
export function recoveryContext(env=process.env,event=readEvent(env)){
 assert(env.GITHUB_ACTIONS==='true'&&env.GITHUB_REPOSITORY===repository,'Owning Actions repository required');
 assert(env.GITHUB_EVENT_NAME==='workflow_dispatch'&&env.GITHUB_REF==='refs/heads/main','Recovery dispatch requires main');
 assert.equal(env.GITHUB_WORKFLOW_REF,`${repository}/${workflow}@refs/heads/main`);
 const {recover_release='',staged_run=''}=event.inputs??{};
 assert(Object.hasOwn(candidates,recover_release)&&staged_run==='','Reviewed exclusive recovery input required');
 if(env.RECOVER_RELEASE!==undefined)assert.equal(env.RECOVER_RELEASE,recover_release);
 return candidates[recover_release];
}
export function packageRoot(controlRoot,env=process.env){
 const root=resolve(controlRoot);
 if(!env.PUBLISH_PACKAGE_ROOT)return root;
 assert(env.GITHUB_WORKSPACE,'Workspace identity required');
 assert.equal(root,resolve(env.GITHUB_WORKSPACE,'control'),'Fixed control checkout required');
 assert.equal(resolve(env.PUBLISH_PACKAGE_ROOT),resolve(env.GITHUB_WORKSPACE,'source'),'Fixed source checkout required');
 return resolve(env.PUBLISH_PACKAGE_ROOT);
}
export function validateOriginal({candidate:c,run,release,ref,jobs,artifacts}){
 assert(run?.id===c.originalRunId&&run.run_attempt===c.originalAttempt&&run.event==='release'&&run.path===workflow&&run.head_sha===c.sourceCommit&&run.head_branch===c.tag&&run.status==='completed'&&run.conclusion==='failure'&&run.repository?.full_name===repository&&run.head_repository?.full_name===repository,'Original failed run changed');
 assert(release?.id===c.releaseId&&release.tag_name===c.tag&&release.target_commitish===c.sourceCommit&&release.draft===false&&release.prerelease===false,'Original Release changed');
 assert(ref?.object?.type==='commit'&&ref.object.sha===c.sourceCommit,'Original lightweight tag changed');
 assert(artifacts?.total_count===0&&Array.isArray(artifacts.artifacts)&&artifacts.artifacts.length===0,'Original run already produced an archive');
 assert(Array.isArray(jobs?.jobs)&&jobs.total_count<=100,'Ambiguous original jobs');
 const verify=jobs.jobs.filter(j=>j.name==='verify'),stage=jobs.jobs.filter(j=>j.name==='stage');
 assert(verify.length===1&&verify[0].status==='completed'&&verify[0].conclusion==='failure','Original verification changed');
 const failed=verify[0].steps?.filter(s=>s.conclusion==='failure');
 assert(failed?.length===1&&failed[0].name===c.failedStep&&failed[0].status==='completed','Failure was outside the reviewed pre-stage step');
 assert(stage.length===1&&stage[0].status==='completed'&&stage[0].conclusion==='skipped','Original stage job must remain skipped');
 return c;
}
export function validateProducer(c,run,runs){
 assert(Number.isSafeInteger(run?.id)&&run.id>0&&run.run_attempt===1&&run.event==='workflow_dispatch'&&run.head_branch==='main'&&run.path===workflow&&run.display_title==='Recover '+c.id&&/^[a-f0-9]{40}$/.test(run.head_sha)&&run.repository?.full_name===repository&&run.head_repository?.full_name===repository,'Invalid recovery producer');
 assert(Array.isArray(runs)&&runs.length<=100,'Ambiguous recovery history');
 const retired=new Set((c.preStageFailures??[]).map(f=>f.run));
 assert(!retired.has(run.id),'Retired pre-stage failures cannot rerun');
 const selected=runs.filter(r=>r.display_title==='Recover '+c.id&&!retired.has(r.id)).sort((a,b)=>a.id-b.id);
 assert(selected.length===1&&selected[0].id===run.id,'Recovery candidate already used; never repeat an ambiguous submission');
 return run;
}
export async function authenticateOriginal(c,{request}={}){
 request??=(await import('./release-evidence.mjs')).githubRequest;
 const [run,release,ref,jobs,artifacts]=await Promise.all([
  request(`/actions/runs/${c.originalRunId}`),request(`/releases/${c.releaseId}`),request(`/git/ref/tags/${c.tag}`),
  request(`/actions/runs/${c.originalRunId}/attempts/${c.originalAttempt}/jobs?per_page=100`),request(`/actions/runs/${c.originalRunId}/artifacts?per_page=100`),
 ]);
 validateOriginal({candidate:c,run,release,ref,jobs,artifacts});
 return {candidate:c,release};
}
export async function authenticateStageSelection(selection,{request}={}){
 request??=(await import('./release-evidence.mjs')).githubRequest;
 const release=await request(`/releases/${selection.releaseId}`);
 assert(release?.id===selection.releaseId&&release.tag_name===selection.tag&&release.draft===false&&release.prerelease===false,'Live Release identity changed');
 let ref=await request(`/git/ref/tags/${selection.tag}`);
 for(let depth=0;ref.object?.type==='tag'&&depth<5;depth++)ref=await request(`/git/tags/${ref.object.sha}`);
 assert(ref.object?.type==='commit'&&ref.object.sha===selection.commit,'Live release tag source changed');
}
export async function authenticateProducer(c,{request,env=process.env,runId=Number(env.GITHUB_RUN_ID)}={}){
 request??=(await import('./release-evidence.mjs')).githubRequest;
 await authenticatePreStageFailures(c,{request});
 const [run,history]=await Promise.all([request(`/actions/runs/${runId}`),request('/actions/workflows/publish.yml/runs?event=workflow_dispatch&per_page=100')]);
 assert(history.total_count<=100,'Recovery history exceeds bounded inspection');
 validateProducer(c,run,history.workflow_runs);
 if(runId===Number(env.GITHUB_RUN_ID))assert(run.head_sha===env.GITHUB_SHA&&run.run_attempt===Number(env.GITHUB_RUN_ATTEMPT),'Control source/attempt changed');
 return run;
}
export function validatePreStageFailure({failure:f,candidate:c,run,jobs,artifacts}){
 assert(run?.id===f.run&&run.run_attempt===f.attempt&&run.head_sha===f.control&&run.event==='workflow_dispatch'&&run.head_branch==='main'&&run.path===workflow&&run.display_title==='Recover '+c.id&&run.status==='completed'&&run.conclusion==='failure'&&run.repository?.full_name===repository&&run.head_repository?.full_name===repository,'Reviewed pre-stage failure changed');
 assert(artifacts?.total_count===0&&Array.isArray(artifacts.artifacts)&&artifacts.artifacts.length===0,'Prior recovery produced an artifact; inspect staging instead');
 assert(Array.isArray(jobs?.jobs)&&jobs.total_count<=100,'Ambiguous prior recovery jobs');
 const verify=jobs.jobs.filter(j=>j.name==='verify'),stage=jobs.jobs.filter(j=>j.name==='stage');
 assert(verify.length===1&&verify[0].status==='completed'&&verify[0].conclusion==='failure','Prior verification did not fail');
 const failed=verify[0].steps?.filter(s=>s.conclusion==='failure');
 assert(failed?.length===1&&failed[0].name===f.step&&failed[0].status==='completed','Prior failure was outside the reviewed pre-stage step');
 assert(stage.length===1&&stage[0].status==='completed'&&stage[0].conclusion==='skipped','Prior recovery stage must remain skipped');
}
export async function authenticatePreStageFailures(c,{request}={}){
 request??=(await import('./release-evidence.mjs')).githubRequest;
 const failures=c.preStageFailures??[];
 assert(Array.isArray(failures)&&failures.length<=10&&new Set(failures.map(f=>f.run)).size===failures.length,'Invalid pre-stage failure inventory');
 for(const f of failures){
  assert(Number.isSafeInteger(f.run)&&f.run>0&&Number.isSafeInteger(f.attempt)&&f.attempt>0&&/^[a-f0-9]{40}$/.test(f.control)&&typeof f.step==='string'&&f.step.length>0,'Invalid fixed pre-stage failure');
  const [run,jobs,artifacts]=await Promise.all([request(`/actions/runs/${f.run}`),request(`/actions/runs/${f.run}/attempts/${f.attempt}/jobs?per_page=100`),request(`/actions/runs/${f.run}/artifacts?per_page=100`)]);
  validatePreStageFailure({failure:f,candidate:c,run,jobs,artifacts});
 }
}
export function freshContext(controlRoot,root,env=process.env){
 return {source:git(root,['rev-parse','HEAD']),control:git(controlRoot,['rev-parse','HEAD']),run:Number(env.GITHUB_RUN_ID),attempt:Number(env.GITHUB_RUN_ATTEMPT)};
}
export function validateFresh(fresh,ctx){
 for(const k of ['source','control','run','attempt'])assert.equal(fresh?.[k],ctx[k],`Fresh verification ${k} changed`);
 assert(fresh.status==='passed'&&Array.isArray(fresh.nodes)&&fresh.nodes.length===2,'Both fresh runtime checks required');
 assert.deepEqual(fresh.nodes.map(n=>n.major).sort(),[24,26]);
 for(const node of fresh.nodes){
  for(const k of ['source','control','run','attempt'])assert.equal(node[k],ctx[k]);
  assert(node.status==='passed'&&new RegExp(`^v${node.major}\\.`).test(node.identity?.node)&&typeof node.identity?.image==='string'&&node.identity.image.length>0&&node.identity.bun==='1.4.0'&&/^[a-f0-9]{64}$/.test(node.input),'Invalid fresh runtime proof');
 }
}
export function readFresh(controlRoot,root,env=process.env){
 const ctx=freshContext(controlRoot,root,env);
 const proof={...ctx,status:'passed',nodes:[24,26].map(major=>JSON.parse(readFileSync(join(root,'.verification',`release-fresh-node${major}.json`),'utf8')))};
 validateFresh(proof,ctx);
 for(const node of proof.nodes)assert.equal(node.input,inputHash(root),'Source inputs changed after fresh checks');
 return proof;
}
export function validateRecoveryBundle(manifest,{candidate,control,run,attempt}){
 assert.deepEqual(manifest.recovery?.candidate,candidate,'Bundle recovery candidate changed');
 assert.equal(manifest.commit,candidate.sourceCommit);
 assert.deepEqual(manifest.release,{id:candidate.releaseId,tag:candidate.tag});
 assert.deepEqual(manifest.staging,{runId:run,attempt});
 validateFresh(manifest.recovery.freshVerification,{source:candidate.sourceCommit,control,run,attempt});
}
export async function recoverySelection(controlRoot,root,env=process.env){
 const c=recoveryContext(env),{release}=await authenticateOriginal(c);
 await authenticateProducer(c,{env});
 assert.equal(git(controlRoot,['rev-parse','HEAD']),env.GITHUB_SHA,'Control checkout differs from dispatch');
 assert.equal(git(root,['rev-parse','HEAD']),c.sourceCommit,'Original source checkout required');
 assert.equal(git(root,['status','--porcelain']),'','Original source must stay clean');
 const {validateReleaseEvent}=await import('./release-context.mjs');
 return validateReleaseEvent({event:{action:'published',repository:{full_name:repository},release},commit:c.sourceCommit,tagCommit:git(root,['rev-parse',c.tag+'^{commit}']),onMain:spawnSync('git',['merge-base','--is-ancestor',c.sourceCommit,'refs/remotes/origin/main'],{cwd:root}).status===0,manifests:Object.fromEntries(['core','cloudflare'].map(kind=>[kind,JSON.parse(readFileSync(join(root,'packages',kind,'package.json'),'utf8'))]))});
}
export async function runFreshVerification(controlRoot,root){
 const ctx=freshContext(controlRoot,root);
 // Authenticate original successful CI; image-only drift cannot replace fresh execution below.
 await requireSource(root,{imagePolicy:'authenticate'});
 const major=Number(process.versions.node.split('.')[0]);assert([24,26].includes(major));
 const directory=join(root,'.verification');mkdirSync(directory,{recursive:true});
 const file=join(directory,`release-fresh-node${major}.json`);
 writeFileSync(file,JSON.stringify({...ctx,status:'running'})+'\n',{mode:0o600});
 const before=inputHash(root);
 const run=spawnSync('bun',['run','release:check'],{cwd:root,stdio:'inherit',env:{...process.env,NODE_PATH:''},timeout:600000});
 assert(!run.error&&run.status===0,'Fresh source verification failed');
 assert.equal(git(root,['status','--porcelain']),'','Source verification changed original source');
 assert.equal(inputHash(root),before,'Original inputs changed during checks');
 writeFileSync(file,JSON.stringify({...ctx,major,status:'passed',input:before,identity:executionIdentity(root)})+'\n',{mode:0o600});
 console.log(`Fresh Node ${major} checks passed for fixed original source.`);
}
