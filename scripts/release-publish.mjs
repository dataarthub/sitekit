// Subsequent releases only. First registration and account-side trust are maintainer prerequisites.
import assert from 'node:assert/strict';
import {packageRoot,recoveryContext,recoverySelection,authenticateOriginal,authenticateProducer,validateRecoveryBundle,authenticateStageSelection} from './release-recovery.mjs';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {digest,readBundle,registry,requiredTags,verifyBundleIdentity} from './release-bundle-core.mjs';
import { recordDeployments } from './release-deployments.mjs';
import { resolveStagingRun, assertCompletionContext } from './release-evidence.mjs';
import { releaseContext, releaseTarget, assertReleaseSelection } from './release-context.mjs';
function parseVersion(value){
 assert.equal(typeof value,'string','Invalid SemVer');
 const match=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(value);
 assert(match,'Invalid SemVer');const pre=match[4]?.split('.')??[];
 assert(pre.every(part=>!/^\d+$/.test(part)||part==='0'||!part.startsWith('0')),'Invalid numeric prerelease');
 return {numbers:match.slice(1,4).map(BigInt),pre};
}
export function compareVersions(left,right){
 const a=parseVersion(left),b=parseVersion(right);
 for(let i=0;i<3;i++)if(a.numbers[i]!==b.numbers[i])return a.numbers[i]>b.numbers[i]?1:-1;
 if(!a.pre.length||!b.pre.length)return a.pre.length===b.pre.length?0:a.pre.length?-1:1;
 for(let i=0;i<Math.max(a.pre.length,b.pre.length);i++){
  if(a.pre[i]===undefined)return -1;if(b.pre[i]===undefined)return 1;
  const x=a.pre[i],y=b.pre[i];if(x===y)continue;
  const nx=/^\d+$/.test(x),ny=/^\d+$/.test(y);
  if(nx&&ny)return BigInt(x)>BigInt(y)?1:-1;
  if(nx!==ny)return nx?-1:1;return x>y?1:-1;
 }
 return 0;
}
export function planTarget(artifact,state){
 parseVersion(artifact.version);
 assert(state?.name===artifact.name&&state.versions&&Object.keys(state.versions).length,'Package must already be publicly registered; first registration or inaccessible state blocks OIDC release');
 assert(state['dist-tags']&&typeof state['dist-tags']==='object','Missing public channel state');
 const tags=requiredTags(artifact.version);
 for(const tag of tags){const current=state['dist-tags'][tag];if(current!==undefined)assert(compareVersions(current,artifact.version)<=0,'Newer npm channel blocks release: '+tag);}
 const existing=state.versions[artifact.version];
 if(existing)assert.equal(existing.dist?.integrity,artifact.integrity,'Existing version integrity differs from reviewed archive');
 return {publish:!existing,tags:tags.filter(tag=>state['dist-tags'][tag]!==artifact.version)};
}
export function assertWriteEnvironment(env,phase='complete'){
 assert.equal(env.GITHUB_ACTIONS,'true','Publication requires GitHub Actions');
 assert.equal(env.GITHUB_REPOSITORY,'dataarthub/sitekit','Unexpected publishing repository');
 assert(['stage','complete'].includes(phase),'Invalid release phase');
 if(phase==='stage'&&env.RECOVER_RELEASE)recoveryContext(env);
 else {
  assert.equal(env.GITHUB_EVENT_NAME,phase==='stage'?'release':'workflow_dispatch','Release event stages; manual dispatch only completes');
  if(phase==='stage'){const target=releaseTarget((env.GITHUB_REF??'').replace(/^refs\/tags\//,''));assert.equal(env.GITHUB_REF,'refs/tags/'+target.tag);assert.equal(env.GITHUB_WORKFLOW_REF,'dataarthub/sitekit/.github/workflows/publish.yml@refs/tags/'+target.tag);}else {assert(!env.RECOVER_RELEASE,'Completion cannot request recovery');assertCompletionContext(env);}
 }
 assert(env.GITHUB_WORKFLOW_REF?.startsWith('dataarthub/sitekit/.github/workflows/publish.yml@'),'Unexpected publishing workflow');
 assert.match(env.GITHUB_SHA??'',/^[a-f0-9]{40}$/,'Missing Actions commit');
 assert(['true','false'].includes(env.RELEASE_REPOSITORY_PRIVATE),'Missing or invalid repository visibility');
 assert(env.ACTIONS_ID_TOKEN_REQUEST_URL&&env.ACTIONS_ID_TOKEN_REQUEST_TOKEN,'Actions OIDC unavailable');
 assert(!env.NODE_AUTH_TOKEN&&!env.NPM_TOKEN&&!env.NPM_CONFIG_TOKEN&&!env.npm_config_token,'Static npm credentials are forbidden');
}
function selectedTargets(manifest) {
 assert(Array.isArray(manifest.targets)&&manifest.targets.length,'Missing reviewed target selection');
 assert(new Set(manifest.targets).size===manifest.targets.length,'Duplicate selected targets');
 return manifest.targets.map(name=>{assert(['@alneas/sitekit','@alneas/sitekit-cloudflare'].includes(name),'Unapproved publication target');const artifact=manifest.artifacts.find(a=>a.name===name);assert(artifact,'Selected target missing archive');return artifact;}).sort((a,b)=>Number(a.name.endsWith('-cloudflare'))-Number(b.name.endsWith('-cloudflare')));
}
export async function executeStage(manifest,{readState,verifyArtifact,write,checkPrerequisite}) {
 const targets=selectedTargets(manifest);
 // Preflight every target and dependent registry prerequisite before the first submission.
 for(const artifact of targets){const plan=planTarget(artifact,await readState(artifact.name));if(plan.publish&&artifact.name.endsWith('-cloudflare'))await checkPrerequisite(artifact);if(!plan.publish)await verifyArtifact(artifact);}
 for(const artifact of targets){
  let plan=planTarget(artifact,await readState(artifact.name));
  if(plan.publish){
   if(artifact.name.endsWith('-cloudflare'))await checkPrerequisite(artifact);
   plan=planTarget(artifact,await readState(artifact.name));
   if(plan.publish)await write('stage',artifact,'staged');
  }else await verifyArtifact(artifact);
 }
}
export async function executeRelease(manifest,{readState,verifyArtifact,write,checkPrerequisite}) {
 const targets=selectedTargets(manifest);
 // Approval and exact public bytes for ALL targets precede any consumer-channel mutation.
 for(const artifact of targets){
  assert(!planTarget(artifact,await readState(artifact.name)).publish,'Awaiting npm approval/public propagation; completion cannot publish');
  if(artifact.name.endsWith('-cloudflare'))await checkPrerequisite(artifact);
  await verifyArtifact(artifact);
 }
 for(const artifact of targets){
  for(const tag of requiredTags(artifact.version)){
   if(artifact.name.endsWith('-cloudflare'))await checkPrerequisite(artifact);
   const fresh=planTarget(artifact,await readState(artifact.name));
   assert(!fresh.publish,'Approved version disappeared');
   if(fresh.tags.includes(tag))await write('tag',artifact,tag);
  }
  const final=planTarget(artifact,await readState(artifact.name));
  assert(!final.publish&&final.tags.length===0,'Release channels remain incomplete');
 }
}
export function npmWriteArgs(action,artifact,tag,directory,repositoryPrivate){
 if(action==='stage'){
  assert(['true','false'].includes(repositoryPrivate),'Missing or invalid repository visibility');
  return ['stage','publish',join(directory,artifact.archive),'--ignore-scripts',repositoryPrivate==='true'?'--provenance=false':'--provenance','--workspaces=false','--access','public','--tag','staged','--registry='+registry];
 }
 assert.equal(action,'tag','Direct npm publication is forbidden');
 assert(requiredTags(artifact.version).includes(tag),'Unapproved consumer channel');
 return ['dist-tag','add',artifact.name+'@'+artifact.version,tag,'--registry='+registry];
}
export async function waitForApproval(manifest,readState,{now=()=>performance.now(),sleep=delay=>new Promise(resolve=>setTimeout(resolve,delay)),timeout=60_000,interval=10_000}={}){
 const targets=selectedTargets(manifest),deadline=now()+timeout;
 while(now()<deadline){
  let ready=true;
  for(const artifact of targets){
   const remaining=deadline-now();if(remaining<=0)throw Error('Awaiting npm approval/public propagation');
   const plan=planTarget(artifact,await readState(artifact.name,remaining));
   if(plan.publish)ready=false;
  }
  if(ready)return;
  const remaining=deadline-now();if(remaining>0)await sleep(Math.min(interval,remaining));
 }
 throw Error('Awaiting npm approval/public propagation');
}
export function failureState(error){
 const message=String(error?.message??'');
 if(message.includes('Awaiting npm approval'))return 'approval-pending';
 if(message.includes('Newer npm channel'))return 'superseded';
 if(/integrity differs|integrity mismatch|archive differs|SHA-256 mismatch|SHA-512 mismatch/i.test(message))return 'content-mismatch';
 if(/expired/i.test(message))return 'evidence-expired';
 if(message.includes('npm operation failed'))return 'npm-operation-ambiguous';
 return 'evidence-or-prerequisite-blocked';
}
export async function publicJson(path,timeout=30_000){
 const response=await fetch(registry+'/'+path,{redirect:'error',headers:{accept:'application/json'},signal:AbortSignal.timeout(Math.max(1,Math.floor(Math.min(timeout,30_000))))});
 assert(response.ok,'Public npm metadata unavailable; absence/access must be investigated before release');
 return response.json();
}
export function withNpmConfig(callback,environment=process.env){
 const directory=mkdtempSync(join(tmpdir(),'sitekit-release-npm-'));
 const user=join(directory,'user.npmrc'),global=join(directory,'global.npmrc');
 try{
  writeFileSync(user,'',{mode:0o600});writeFileSync(global,'',{mode:0o600});
  return callback({...environment,NPM_CONFIG_USERCONFIG:user,NPM_CONFIG_GLOBALCONFIG:global,NPM_CONFIG_LOGLEVEL:'silent',NPM_CONFIG_LOGS_MAX:'0',NODE_AUTH_TOKEN:'',NPM_TOKEN:''});
 }finally{rmSync(directory,{recursive:true,force:true});}
}
function npm(args){
 try{return withNpmConfig(env=>execFileSync('npm',args,{encoding:'utf8',stdio:'pipe',env}));}
 catch{throw Error('npm operation failed; stop writes and inspect public registry state read-only before retrying (credential output suppressed)');}
}

async function main(){
 const phase=process.argv[2];assert(['stage','complete'].includes(phase),'Usage: release-publish.mjs stage|complete --bundle directory');
 if(phase==='complete')assertCompletionContext(process.env);
 assertWriteEnvironment(process.env,phase);
 const index=process.argv.indexOf('--bundle');assert(index>=0&&process.argv[index+1],'Missing --bundle');
 const directory=resolve(process.argv[index+1]),controlRoot=resolve(fileURLToPath(new URL('..',import.meta.url))),root=packageRoot(controlRoot);
 let manifest,evidence,selection;
 if(phase==='stage'){
  const recovery=process.env.RECOVER_RELEASE?await recoverySelection(controlRoot,root):null;
  selection=recovery??releaseContext({root});
  manifest=await readBundle(directory,root);assertReleaseSelection(manifest,selection);
  if(recovery)validateRecoveryBundle(manifest,{candidate:recoveryContext(),control:process.env.GITHUB_SHA,run:Number(process.env.GITHUB_RUN_ID),attempt:Number(process.env.GITHUB_RUN_ATTEMPT)});
  else assert.equal(manifest.commit,process.env.GITHUB_SHA,'Actions commit differs from reviewed bundle');
  assert.deepEqual(manifest.staging,{runId:Number(process.env.GITHUB_RUN_ID),attempt:Number(process.env.GITHUB_RUN_ATTEMPT)},'Bundle staging identity differs');
 }else{
  evidence=await resolveStagingRun(process.env.STAGED_RUN);
  const saved=JSON.parse(await readFile(join(root,'.verification/resolved-release.json'),'utf8'));
  assert.deepEqual(evidence,saved,'Original staging evidence changed');
  manifest=JSON.parse(await readFile(join(directory,'release.json'),'utf8'));
  const targets=['core','cloudflare'].map(kind=>{
   const meta=JSON.parse(execFileSync('git',['show',evidence.commit+':packages/'+kind+'/package.json'],{cwd:root,encoding:'utf8'}));
   return {kind,name:meta.name,version:meta.version};
  });
  await verifyBundleIdentity(manifest,{directory,expectedCommit:evidence.commit,targets});
  assert.deepEqual(manifest.staging,{runId:evidence.runId,attempt:evidence.attempt},'Bundle belongs to another staging run/attempt');
  assertReleaseSelection(manifest,evidence);
  if(evidence.recovery)validateRecoveryBundle(manifest,{candidate:evidence.recovery,control:evidence.controlCommit,run:evidence.runId,attempt:evidence.attempt});
 }

 assert.equal(manifest.repository,'https://github.com/dataarthub/sitekit','Unexpected bundle repository');
 // Read-only packed audit verifies the exact handed-off bytes; no install/build is run here.
 if(phase==='stage')execFileSync(process.execPath,[join(controlRoot,'scripts/release-bundle.mjs'),'verify','--bundle',directory],{stdio:'inherit'});
 assert.equal(npm(['--version']).trim(),'11.21.0','Use the reviewed OIDC-capable npm version');
 assert.equal(process.versions.node.split('.')[0],'24','Use the reviewed Node 24 runtime');
 const readState=(name,timeout)=>publicJson(encodeURIComponent(name),timeout);
 const verifyArtifact=async artifact=>{
  const state=await readState(artifact.name);assert.equal(state.versions?.[artifact.version]?.dist?.integrity,artifact.integrity,'Registry integrity mismatch');
  const url=new URL(state.versions[artifact.version].dist.tarball);assert.equal(url.origin,registry,'Unexpected tarball origin');
  const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(60000)});assert(response.ok,'Registry archive unavailable');
  assert.equal(digest(Buffer.from(await response.arrayBuffer())).sha256,artifact.sha256,'Delivered archive differs from reviewed bytes');
 };
 const options={readState,verifyArtifact,checkPrerequisite:async()=>{
  const meta=phase==='stage'?JSON.parse(await readFile(join(root,'packages/cloudflare/package.json'),'utf8')):JSON.parse(execFileSync('git',['show',evidence.commit+':packages/cloudflare/package.json'],{cwd:root,encoding:'utf8'}));
  const range=meta.peerDependencies?.['@alneas/sitekit'];assert(range,'Missing core prerequisite');
  const resolved=JSON.parse(npm(['view','@alneas/sitekit@'+range,'version','--json','--registry='+registry]));
  const versions=Array.isArray(resolved)?resolved:[resolved];assert(versions.length&&versions.every(v=>typeof v==='string'),'Core prerequisite is unavailable');
  const publicCore=await readState('@alneas/sitekit');assert(versions.some(v=>publicCore.versions?.[v]),'Core prerequisite is not publicly readable');
 },write:async(action,artifact,tag)=>{
  assertWriteEnvironment(process.env,phase);
  if(phase==='stage')await authenticateStageSelection(selection);
  if(phase==='stage'&&process.env.RECOVER_RELEASE){await authenticateOriginal(recoveryContext());await authenticateProducer(recoveryContext());}
  if(phase==='complete')assert.deepEqual(await resolveStagingRun(process.env.STAGED_RUN),evidence,'Original staging attempt/artifact changed');
  npm(npmWriteArgs(action,artifact,tag,directory,process.env.RELEASE_REPOSITORY_PRIVATE));
  console.log(action+': '+artifact.name+'@'+artifact.version+' ('+tag+')');
 }};
 if(phase==='stage')await executeStage(manifest,options);else { await waitForApproval(manifest,readState); await executeRelease(manifest,options); await recordDeployments(manifest); }
 console.log(phase==='stage'?'Verified archives submitted or already public; human npm approval and completion remain separate.':'Selected approved versions, exact registry archives and required channels verified');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){main().catch(error=>{console.error('Release state: '+failureState(error)+'. No automatic write retry; inspect original evidence and public registry state. Credential-bearing diagnostics suppressed.');process.exitCode=1;});}
