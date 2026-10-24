import test from 'node:test';
import assert from 'node:assert/strict';
import {candidates, recoveryContext, validateOriginal, validateProducer, validateFresh, packageRoot,validateRecoveryBundle} from './release-recovery.mjs';
import {resolveStagingRun} from './release-evidence.mjs';
const c=candidates['core-0.2.0'];
const owner={full_name:'dataarthub/sitekit'};
const env={GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:owner.full_name,GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/main',GITHUB_WORKFLOW_REF:owner.full_name+'/.github/workflows/publish.yml@refs/heads/main'};
const event={inputs:{recover_release:c.id,staged_run:''}};
const fixture=()=>({candidate:c,run:{id:c.originalRunId,run_attempt:c.originalAttempt,event:'release',path:'.github/workflows/publish.yml',head_sha:c.sourceCommit,head_branch:c.tag,status:'completed',conclusion:'failure',repository:owner,head_repository:owner},release:{id:c.releaseId,tag_name:c.tag,target_commitish:c.sourceCommit,draft:false,prerelease:false},ref:{object:{type:'commit',sha:c.sourceCommit}},artifacts:{total_count:0,artifacts:[]},jobs:{total_count:2,jobs:[{name:'verify',status:'completed',conclusion:'failure',steps:[{name:'Project: Prepare and test exact release archives',status:'completed',conclusion:'failure'}]},{name:'stage',status:'completed',conclusion:'skipped'}]}});
test('only the catalogued main-only exclusive recovery input may stage',()=>{
 assert.equal(recoveryContext(env,event),c);
 for(const inputs of [{},{recover_release:'unknown'},{recover_release:'__proto__'},{recover_release:'constructor'},{recover_release:c.id,staged_run:'1'}])assert.throws(()=>recoveryContext(env,{inputs}));
 for(const patch of [{GITHUB_REF:'refs/heads/other'},{GITHUB_EVENT_NAME:'release'},{GITHUB_REPOSITORY:'fork/sitekit'},{GITHUB_WORKFLOW_REF:'dataarthub/sitekit/.github/workflows/other.yml@refs/heads/main'}])assert.throws(()=>recoveryContext({...env,...patch},event));
});
test('original failed Release/run/tag/no-output/skipped-writer bindings fail closed',()=>{
 assert.equal(validateOriginal(fixture()),c);
 for(const mutate of [x=>x.run.run_attempt++,x=>x.run.head_sha='b'.repeat(40),x=>x.run.repository=undefined,x=>x.release.id++,x=>x.release.target_commitish='main',x=>x.release.draft=true,x=>x.ref.object.sha='c'.repeat(40),x=>x.ref.object.type='tag',x=>x.artifacts.total_count++,x=>x.artifacts.artifacts.push({}),x=>x.jobs.total_count=101,x=>x.jobs.jobs[1].conclusion='success',x=>x.jobs.jobs.push(x.jobs.jobs[1]),x=>x.jobs.jobs[0].steps[0].name='Unknown step']){const x=fixture();mutate(x);assert.throws(()=>validateOriginal(x));}
});
test('one recovery producer may run once, with no ambiguous prior submission',()=>{
 const p={id:90,run_attempt:1,event:'workflow_dispatch',head_branch:'main',path:'.github/workflows/publish.yml',display_title:'Recover '+c.id,head_sha:'d'.repeat(40),repository:owner,head_repository:owner};
 assert.equal(validateProducer(c,p,[p]),p);
 assert.throws(()=>validateProducer(c,{...p,run_attempt:2},[p]));
 assert.throws(()=>validateProducer(c,p,[{...p,id:89},p]));
 assert.equal(validateProducer(c,p,[{...p,id:89,display_title:'Complete unrelated run'},p]),p);
 assert.throws(()=>validateProducer(c,p,[]));
 assert.throws(()=>validateProducer(c,{...p,display_title:'Other'},[p]));
});
test('fresh proof binds source, control, producer and both real runtime checks',()=>{
 const ctx={source:c.sourceCommit,control:'d'.repeat(40),run:90,attempt:1};
 const f={...ctx,status:'passed',nodes:[24,26].map(major=>({major,status:'passed',...ctx,identity:{node:`v${major}.1.0`,image:'ubuntu24:1',bun:'1.4.0'},input:'a'.repeat(64)}))};
 validateFresh(f,ctx);
 for(const mutate of [x=>x.source='b'.repeat(40),x=>x.control='b'.repeat(40),x=>x.attempt++,x=>x.nodes.pop(),x=>x.nodes[0].status='failed',x=>x.nodes[0].identity.node='v26.1.0',x=>x.nodes[0].source='b'.repeat(40),x=>x.nodes[0].input='']){const x=structuredClone(f);mutate(x);assert.throws(()=>validateFresh(x,ctx));}
});
test('control and package roots are fixed separate siblings, never arbitrary paths',()=>{
 assert.equal(packageRoot('/workspace/control',{GITHUB_WORKSPACE:'/workspace',PUBLISH_PACKAGE_ROOT:'/workspace/source'}),'/workspace/source');
 for(const [root,packagePath] of [['/workspace','/workspace/source'],['/workspace/control','/tmp/other'],['/workspace/control','/workspace/control']])assert.throws(()=>packageRoot(root,{GITHUB_WORKSPACE:'/workspace',PUBLISH_PACKAGE_ROOT:packagePath}));
 assert.equal(packageRoot('/normal',{}),'/normal');
});
test('completion retains original source while authenticating the recovery control producer',async()=>{
 const original=fixture(),control='d'.repeat(40),run={id:90,workflow_id:7,run_attempt:1,event:'workflow_dispatch',head_branch:'main',path:'.github/workflows/publish.yml',display_title:'Recover '+c.id,head_sha:control,repository:owner,head_repository:owner,status:'completed',conclusion:'success'};
 const request=async path=>{
  if(path===`/actions/runs/${c.originalRunId}`)return original.run;
  if(path.includes(`/actions/runs/${c.originalRunId}/attempts/`))return original.jobs;
  if(path===`/actions/runs/${c.originalRunId}/artifacts?per_page=100`)return original.artifacts;
  if(path.startsWith('/releases/'))return original.release;
  if(path.startsWith('/git/ref/'))return original.ref;
  if(path==='/actions/workflows/publish.yml')return {id:7};
  if(path.startsWith('/actions/workflows/'))return {total_count:1,workflow_runs:[run]};
  if(path.startsWith('/compare/'))return {status:'ahead'};
  if(path.includes('/jobs?'))return {total_count:2,jobs:['verify','stage'].map(name=>({name,status:'completed',conclusion:'success'}))};
  if(path.includes('/artifacts?'))return {total_count:1,artifacts:[{id:91,name:'verified-npm-release-90-1',expired:false,expires_at:'2099-01-01T00:00:00Z',digest:'sha256:'+'a'.repeat(64),workflow_run:{id:90,head_sha:control}}]};
  return run;
 };
 const evidence=await resolveStagingRun(90,{request});
 assert.equal(evidence.commit,c.sourceCommit);assert.equal(evidence.controlCommit,control);assert.deepEqual(evidence.recovery,c);
 await assert.rejects(resolveStagingRun(90,{request:async path=>path.includes('/artifacts?')&&path.includes(String(c.originalRunId))?{total_count:1,artifacts:[{}]}:request(path)}));
 const ctx={source:c.sourceCommit,control,run:90,attempt:1};
 const manifest={commit:c.sourceCommit,release:{id:c.releaseId,tag:c.tag},staging:{runId:90,attempt:1},recovery:{candidate:c,freshVerification:{...ctx,status:'passed',nodes:[24,26].map(major=>({...ctx,major,status:'passed',input:'a'.repeat(64),identity:{node:`v${major}.1.0`,image:'ubuntu24:1',bun:'1.4.0'}}))}}};
 validateRecoveryBundle(manifest,{candidate:c,control,run:90,attempt:1});
 for(const mutate of [m=>m.recovery.candidate.releaseId++,m=>m.recovery.freshVerification.control='b'.repeat(40),m=>m.staging.attempt++,m=>m.commit=control]){const m=structuredClone(manifest);mutate(m);assert.throws(()=>validateRecoveryBundle(m,{candidate:c,control,run:90,attempt:1}));}
});
test('stage rechecks the live Release and peeled tag source immediately before submission',async()=>{
 const {authenticateStageSelection}=await import('./release-recovery.mjs');
 const selection={releaseId:c.releaseId,tag:c.tag,commit:c.sourceCommit};
 const request=async path=>path.startsWith('/releases/')?fixture().release:fixture().ref;
 await authenticateStageSelection(selection,{request});
 await assert.rejects(authenticateStageSelection(selection,{request:async path=>path.startsWith('/releases/')?{...fixture().release,draft:true}:fixture().ref}));
 await assert.rejects(authenticateStageSelection(selection,{request:async path=>path.startsWith('/releases/')?fixture().release:{object:{type:'commit',sha:'e'.repeat(40)}}}));
});
