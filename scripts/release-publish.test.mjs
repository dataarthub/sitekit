import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {existsSync,readFileSync} from 'node:fs';
import {compareVersions,planTarget,assertWriteEnvironment,executeRelease,executeStage,withNpmConfig} from './release-publish.mjs';
const artifact={name:'@alneas/sitekit',version:'0.2.0',integrity:'sha512-reviewed'};
const state=(extra={})=>({name:artifact.name,versions:{'0.1.0':{}},'dist-tags':{latest:'0.1.0',beta:'0.1.0'},...extra});
test('semver orders numeric prereleases, release and build identity',()=>{
 const versions=['0.2.0-alpha','0.2.0-alpha.2','0.2.0-alpha.10','0.2.0-beta','0.2.0','1.0.0'];
 for(let i=1;i<versions.length;i++)assert(compareVersions(versions[i-1],versions[i])<0);
 assert.equal(compareVersions('1.0.0+a','1.0.0+b'),0);
 for(const version of ['01.0.0','1.0.0-01','v1.0.0','1.0.0-'])assert.throws(()=>compareVersions(version,'1.0.0'));
});
test('preflight publishes absent version with beta then latest',()=>assert.deepEqual(planTarget(artifact,state()),{publish:true,tags:['beta','latest']}));
test('preflight resumes matching version without republishing',()=>{
 const existing={...state().versions,[artifact.version]:{dist:{integrity:artifact.integrity}}};
 assert.deepEqual(planTarget(artifact,state({versions:existing,'dist-tags':{beta:artifact.version,latest:'0.1.0'}})),{publish:false,tags:['latest']});
});
test('preflight refuses inaccessible, initial, wrong-content and rollback states',()=>{
 for(const remote of [null,{},state({versions:{}}),state({name:'other'}),state({'dist-tags':{latest:'0.3.0'}}),state({'dist-tags':{beta:'0.3.0'}}),state({versions:{[artifact.version]:{dist:{integrity:'different'}}}})])assert.throws(()=>planTarget(artifact,remote));
});
test('stable versions require latest only',()=>assert.deepEqual(planTarget({...artifact,version:'1.0.0'},state({'dist-tags':{beta:'2.0.0',latest:'0.1.0'}})),{publish:true,tags:['latest']}));
test('write path requires Actions OIDC context and no static token',()=>{
 assert.throws(()=>assertWriteEnvironment({}));
 const env={GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REPOSITORY:'dataarthub/sitekit',GITHUB_WORKFLOW_REF:'dataarthub/sitekit/.github/workflows/release.yml@refs/heads/main',ACTIONS_ID_TOKEN_REQUEST_URL:'https://example.test',ACTIONS_ID_TOKEN_REQUEST_TOKEN:'secret',GITHUB_SHA:'a'.repeat(40)};
 assert.doesNotThrow(()=>assertWriteEnvironment(env));
 assert.throws(()=>assertWriteEnvironment({...env,NODE_AUTH_TOKEN:'static'}));
 assert.throws(()=>assertWriteEnvironment({...env,GITHUB_REPOSITORY:'other/repo'}));
});

test('conflicting second target blocks every write',async()=>{
 const cloud={...artifact,name:'@alneas/sitekit-cloudflare'};let writes=0;
 await assert.rejects(executeStage({targets:[artifact.name,cloud.name],artifacts:[artifact,cloud]},{readState:async name=>state({name,'dist-tags':{latest:name===cloud.name?'0.9.0':'0.1.0'}}),write:async()=>writes++}));
 assert.equal(writes,0);
});
test('a newer tag racing after publication aborts without further writes',async()=>{
 const current=state({versions:{[artifact.version]:{dist:{integrity:artifact.integrity}}}});let writes=0;
 await assert.rejects(executeRelease({targets:[artifact.name],artifacts:[artifact]},{readState:async()=>current,write:async()=>{writes++;current.versions[artifact.version]={dist:{integrity:artifact.integrity}};current['dist-tags'].latest='0.9.0';},verifyArtifact:async()=>{}}));
 assert.equal(writes,1);
});
test('a failed write stops the release without automatic retry',async()=>{
 let writes=0;
 await assert.rejects(executeStage({targets:[artifact.name],artifacts:[artifact]},{readState:async()=>state(),write:async()=>{writes++;throw Error('ambiguous response');}}));
 assert.equal(writes,1);
});

test('matching existing bytes resume tags without publication',async()=>{
 const current=state({versions:{[artifact.version]:{dist:{integrity:artifact.integrity}}},'dist-tags':{beta:artifact.version,latest:'0.1.0'}});const writes=[];
 await executeRelease({targets:[artifact.name],artifacts:[artifact]},{readState:async()=>current,verifyArtifact:async()=>{},write:async(action,a,tag)=>{writes.push([action,tag]);current['dist-tags'][tag]=a.version;}});
 assert.deepEqual(writes,[['tag','latest']]);
});
test('adapter tag repair still requires its core prerequisite',async()=>{
 const cloud={...artifact,name:'@alneas/sitekit-cloudflare'};let writes=0;
 const current=state({name:cloud.name,versions:{[cloud.version]:{dist:{integrity:cloud.integrity}}}});
 await assert.rejects(executeRelease({targets:[cloud.name],artifacts:[cloud]},{readState:async()=>current,verifyArtifact:async()=>{},checkPrerequisite:async()=>{throw Error('missing core');},write:async()=>writes++}));
 assert.equal(writes,0);
});

test('isolated npm configs are distinct, empty, usable by real CLI, and cleaned',()=>{
 let user,global;
 withNpmConfig(env=>{
  user=env.NPM_CONFIG_USERCONFIG;global=env.NPM_CONFIG_GLOBALCONFIG;
  assert.notEqual(user,global);
  assert.equal(readFileSync(user,'utf8'),'');assert.equal(readFileSync(global,'utf8'),'');
  assert.match(execFileSync('npm',['--version'],{env,encoding:'utf8',stdio:'pipe'}).trim(),/^\d+\.\d+\.\d+$/);
 });
 assert(!existsSync(user));assert(!existsSync(global));
});
test('isolated npm configs clean up after a CLI failure',()=>{
 let user;
 assert.throws(()=>withNpmConfig(env=>{user=env.NPM_CONFIG_USERCONFIG;throw Error('command failed');}));
 assert(!existsSync(user));
});
test('workflow transfers only explicit release files including hidden handoff directory',()=>{
 const workflow=readFileSync(new URL('../.github/workflows/release.yml',import.meta.url),'utf8');
 const upload=workflow.split('uses: actions/upload-artifact@v4')[1].split('  stage:')[0];
 assert.match(upload,/include-hidden-files: true/);
 assert.match(upload,/\.verification\/handoff\/release\.json/);
 assert.match(upload,/\.verification\/handoff\/\*\.tgz/);
 const paths=upload.split('path: |')[1].split('if-no-files-found:')[0].trim().split('\n').map(s=>s.trim());
 assert.deepEqual(paths,['.verification/handoff/release.json','.verification/handoff/*.tgz','.verification/handoff/*.notes.md']);
});
