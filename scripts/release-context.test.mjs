import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { releaseContext, releaseTarget, validateReleaseEvent, assertReleaseSelection } from './release-context.mjs';
const sha = 'a'.repeat(40);
const fixture = () => ({ event: { action: 'published', repository: {full_name:'dataarthub/sitekit'}, release:{id:17,tag_name:'sitekit-core-v0.2.0',draft:false,prerelease:false} }, commit:sha, tagCommit:sha, onMain:true, manifests:{core:{name:'@alneas/sitekit',version:'0.2.0',repository:{url:'git+https://github.com/dataarthub/sitekit.git'},publishConfig:{access:'public',registry:'https://registry.npmjs.org'}},cloudflare:{name:'@alneas/sitekit-cloudflare',version:'0.3.0',repository:{url:'git+https://github.com/dataarthub/sitekit.git'},publishConfig:{access:'public',registry:'https://registry.npmjs.org'}}} });
test('published package Release selects only its own stable version and source',()=>{
 const input=fixture();const core=validateReleaseEvent(input);assert.equal(core.kind,'core');assert.equal(core.commit,sha);assert.equal(core.releaseId,17);
 input.event.release.tag_name='sitekit-cloudflare-v0.3.0';assert.equal(validateReleaseEvent(input).name,'@alneas/sitekit-cloudflare');
 for(const tag of ['v0.1.0','sitekit-core-v0.2.0-beta','sitekit-core-v01.2.0','other-v0.2.0','sitekit-core-v0.2.0\n'])assert.throws(()=>releaseTarget(tag));
});
test('draft/prerelease/non-published/fork/moved tags/off-main/mismatched versions block staging',()=>{
 for(const mutate of [i=>{i.event.action='edited';},i=>{i.event.release.draft=true;},i=>{i.event.release.prerelease=true;},i=>{i.event.repository.full_name='fork/repo';},i=>{i.tagCommit='b'.repeat(40);},i=>{i.onMain=false;},i=>{i.manifests.core.version='0.1.0';},i=>{i.event.release.id=0;},i=>{i.manifests.core.publishConfig.registry='https://example.test';}]){const input=fixture();mutate(input);assert.throws(()=>validateReleaseEvent(input));}
});
test('original Release binding rejects substitutions and extra selected targets',()=>{
 const selected=validateReleaseEvent(fixture());const manifest={commit:sha,release:{id:17,tag:'sitekit-core-v0.2.0'},targets:['@alneas/sitekit'],artifacts:[{name:'@alneas/sitekit',version:'0.2.0'}]};
 assert.doesNotThrow(()=>assertReleaseSelection(manifest,selected));
 for(const mutate of [m=>{m.release.id=18;},m=>{m.release.tag='sitekit-cloudflare-v0.2.0';},m=>{m.targets.push('@alneas/sitekit-cloudflare');},m=>{m.artifacts[0].version='0.1.0';}]){const m=structuredClone(manifest);mutate(m);assert.throws(()=>assertReleaseSelection(m,selected));}
});

test('real Git selection peels annotated tags and rejects a moved release tag',()=>{
 const root=mkdtempSync(join(tmpdir(),'sitekit-release-selection-'));
 try{
  const input=fixture();
  for(const [kind,meta] of Object.entries(input.manifests)){mkdirSync(join(root,'packages',kind),{recursive:true});writeFileSync(join(root,'packages',kind,'package.json'),JSON.stringify(meta));}
  const git=(...args)=>execFileSync('git',['-c','core.hooksPath=/dev/null','-c','commit.gpgsign=false','-c','user.name=Example','-c','user.email=example@example.test',...args],{cwd:root,encoding:'utf8',stdio:'pipe'}).trim();
  git('-c','init.templateDir=','init','--quiet','--initial-branch=main');git('add','packages');git('commit','--quiet','-m','fixture');
  const commit=git('rev-parse','HEAD');git('update-ref','refs/remotes/origin/main',commit);git('tag','-a','sitekit-core-v0.2.0','-m','reviewed');
  const path=join(root,'event.json');writeFileSync(path,JSON.stringify(input.event));
  const env={GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'dataarthub/sitekit',GITHUB_EVENT_NAME:'release',GITHUB_EVENT_PATH:path,GITHUB_SHA:commit,GITHUB_REF:'refs/tags/sitekit-core-v0.2.0',GITHUB_WORKFLOW_REF:'dataarthub/sitekit/.github/workflows/publish.yml@refs/tags/sitekit-core-v0.2.0'};
  assert.equal(releaseContext({root,env}).commit,commit);
  git('commit','--allow-empty','--quiet','-m','later');const later=git('rev-parse','HEAD');git('checkout','--quiet','--detach',commit);git('tag','-f','sitekit-core-v0.2.0',later);
  assert.throws(()=>releaseContext({root,env}),/tag must resolve/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
