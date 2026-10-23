import assert from 'node:assert/strict';
import {verifyFilePath,verifyPackages,verifyPackedManifest,verifyPackedExports} from './boundary.mjs';
import {mkdtemp,mkdir,writeFile,readFile,rm,copyFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {captureProcess} from './process-capture.mjs';
import {selectedArchives} from './release-bundle-core.mjs';
const root=resolve(import.meta.dirname,'..'),temporary=await mkdtemp(join(tmpdir(),'alneas-npm-consumer-'));
function run(command,args,cwd=root){return captureProcess(command,args,{cwd,env:{...process.env,NPM_CONFIG_USERCONFIG:'/dev/null',NODE_PATH:''}});}
try{
 const selected=await selectedArchives(root,undefined,join(temporary,'selected'));
 let core,adapter;
 if(selected){
  const entries=[];
  for(const source of [selected.core,selected.cloudflare]){
   const filename=source.split('/').at(-1);await copyFile(source,join(temporary,filename));
   const files=run('tar',['-tzf',source]).trim().split('\n').map(path=>({path:path.replace(/^package\//,'')}));entries.push({filename,files});
  }
  [core,adapter]=entries;
 }else{
  run('bun',['run','build:all']);
  core=JSON.parse(run('npm',['pack','--ignore-scripts','--json','--pack-destination',temporary],join(root,'packages/core')))[0];
  adapter=JSON.parse(run('npm',['pack','--ignore-scripts','--json','--pack-destination',temporary],join(root,'packages/cloudflare')))[0];
 }
 for(const p of [core,adapter]){
  const paths=p.files.map(f=>f.path);assert(paths.includes('LICENSE'));assert(paths.includes('CHANGELOG.md'));assert(paths.includes('THIRD_PARTY_NOTICES.json'));
  assert(paths.some(p=>p.endsWith('.d.ts')));for(const path of paths)verifyFilePath(path,p===adapter?'cloudflare':'core');
  const meta=JSON.parse(run('tar',['-xOzf',join(temporary,p.filename),'package/package.json']));verifyPackedManifest(meta);verifyPackedExports(meta,paths);
  if(p===core)for(const file of ['llms.txt','llms-full.txt','skills/sitekit/SKILL.md'])assert(paths.includes(file),`Missing consumer guidance: ${file}`);
  assert.equal(run('tar',['-xOzf',join(temporary,p.filename),'package/LICENSE']),await readFile(join(root,'LICENSE'),'utf8'));
  console.log(`${meta.name}: npm packed manifest, exports, license and file boundary verified`);
  verifyPackages(run('tar',['-xOzf',join(temporary,p.filename)]),'npm packed contents');
 }
 const consumer=join(temporary,'consumer');await mkdir(consumer);
 await writeFile(join(consumer,'package.json'),JSON.stringify({private:true,type:'module',dependencies:{'@alneas/sitekit':'file:'+join(temporary,core.filename),'@alneas/sitekit-cloudflare':'file:'+join(temporary,adapter.filename),astro:'7.3.3'}}));
 run('npm',['install','--ignore-scripts','--no-audit','--no-fund'],consumer);
 await writeFile(join(consumer,'smoke.mjs'),`import {SiteKitError} from '@alneas/sitekit/errors';import schema from '@alneas/sitekit/schema.json' with {type:'json'};if(schema.title!=='SiteKit site configuration'||!(new SiteKitError('SK_CONFIG_INVALID','probe') instanceof Error))throw Error('Missing error/schema exports');import {defineSite} from '@alneas/sitekit/config';import {createSiteAstroConfig} from '@alneas/sitekit/build';import {parseCloudflareSnapshotManifest} from '@alneas/sitekit-cloudflare';const c=await createSiteAstroConfig(defineSite({id:'example',content:{snapshot:{siteId:'example',revision:1,posts:[],assets:[]}}}),()=>({site:'https://example.com'}));if(c.output!=='static'||typeof parseCloudflareSnapshotManifest!=='function')throw Error('Invalid npm exports');`);
 run('node',['smoke.mjs'],consumer);
 await writeFile(join(consumer,'types.ts'),`import {SiteKitError,type SiteKitErrorCode} from '@alneas/sitekit/errors';const code:SiteKitErrorCode='SK_REVISION_MISMATCH';const failure:Error=new SiteKitError(code,'probe');void failure;import {defineSite,type SiteDefinition} from '@alneas/sitekit/config';import {createSiteAstroConfig} from '@alneas/sitekit/build';import type {CloudflareD1Database} from '@alneas/sitekit-cloudflare';const site:SiteDefinition=defineSite({id:'example',content:{snapshot:{siteId:'example',revision:1,posts:[],assets:[]}}});const config=await createSiteAstroConfig(site,()=>({site:'https://example.com'}));let database:CloudflareD1Database|undefined;void [config,database];`);
 run(resolve(root,'node_modules/.bin/tsc'),['--noEmit','--skipLibCheck','--target','ES2022','--module','NodeNext','--moduleResolution','NodeNext','types.ts'],consumer);
 const lock=await readFile(join(consumer,'package-lock.json'),'utf8');assert(!lock.includes('@dataarthub/'));
 console.log('Selected npm archives, npm install, Node ESM exports, declarations and package file allowlist passed.');
}finally{await rm(temporary,{recursive:true,force:true});}
