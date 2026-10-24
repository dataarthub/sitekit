// Explicit two-root adapter consumed by the reviewed shared conformance contract.
import assert from 'node:assert/strict';
import {appendFileSync,readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {packageRoot,recoveryContext,authenticateOriginal,authenticateProducer,recoverySelection,runFreshVerification,validateFresh} from './release-recovery.mjs';
import {releaseContext} from './release-context.mjs';
import {resolveStagingRun} from './release-evidence.mjs';
import {requireSource} from './workflow-supply/public/quality.mjs';

const controlRoot=resolve(import.meta.dirname,'..');
const git=(root,...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',timeout:10000}).trim();
async function main(){
 const mode=process.argv[2],env=process.env;
 assert(['select','fresh','writer'].includes(mode));
 assert(env.GITHUB_ACTIONS==='true'&&env.GITHUB_REPOSITORY==='dataarthub/sitekit','Owning Actions repository required');
 assert.equal(git(controlRoot,'rev-parse','HEAD'),env.GITHUB_SHA,'Fixed control checkout required');
 if(mode==='select'){
  let selected;
  if(env.RECOVER_RELEASE){const c=recoveryContext();await authenticateOriginal(c);await authenticateProducer(c);selected={commit:c.sourceCommit,kind:'core'};}
  else selected=releaseContext({root:controlRoot});
  assert(env.GITHUB_OUTPUT);appendFileSync(env.GITHUB_OUTPUT,`source=${selected.commit}\nkind=${selected.kind}\n`);return;
 }
 const root=packageRoot(controlRoot);
 assert.notEqual(root,controlRoot,'Release verification requires separate control/source roots');
 assert.equal(git(root,'status','--porcelain'),'','Original source must stay clean');
 let selection,evidence;
 if(env.RECOVER_RELEASE)selection=await recoverySelection(controlRoot,root);
 else if(env.GITHUB_EVENT_NAME==='release')selection=releaseContext({root});
 else {
  assert.equal(mode,'writer','Manual completion cannot execute source tests');
  evidence=await resolveStagingRun(env.STAGED_RUN);
  assert.equal(git(root,'rev-parse','HEAD'),evidence.commit,'Completion source checkout differs from original producer');
 }
 if(selection)assert.equal(git(root,'rev-parse','HEAD'),selection.commit);
 if(mode==='fresh'){await runFreshVerification(controlRoot,root);return;}
 // Writers authenticate the original source proof without claiming current-image test execution.
 await requireSource(root,{imagePolicy:'authenticate'});
 const manifest=JSON.parse(readFileSync(join(root,'.verification/handoff/release.json'),'utf8'));
 if(manifest.freshVerification){
  validateFresh(manifest.freshVerification,{source:manifest.commit,control:evidence?.controlCommit??(evidence?.commit??env.GITHUB_SHA),run:evidence?.runId??Number(env.GITHUB_RUN_ID),attempt:evidence?.attempt??Number(env.GITHUB_RUN_ATTEMPT)});
 }else assert(evidence&&!evidence.recovery,'Fresh runtime proof required for new staging');
 console.log('Original source and immutable fresh runtime proof authenticated; writer ran no source tests.');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
