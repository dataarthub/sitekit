// Explicit optional browser acceptance; no production session or external provider is used.
import {spawn,spawnSync} from 'node:child_process';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
const root=resolve(import.meta.dirname,'..');
const scratch=await mkdtemp(join(tmpdir(),'management-browser-'));
await mkdir(join(root,'.verification/public-management/web'),{recursive:true});
const env={...process.env,SITEKIT_MANAGEMENT_TEST_DB:join(scratch,'state.db'),SITEKIT_MANAGEMENT_TEST_PORT:process.env.SITEKIT_MANAGEMENT_TEST_PORT??'4388'};
let server;
function run(command,args){const p=spawnSync(command,args,{cwd:root,env,stdio:'inherit'});assert.equal(p.status,0,command+' '+args.join(' '));}
try {
 run('bun',['scripts/build-core.mjs']);run('bun',['scripts/build-cloudflare.mjs']);
 run('bun',['build','scripts/fixtures/management/client.tsx','--target=browser','--outdir','.verification/public-management/web']);
 server=spawn('node',['scripts/fixtures/management/host.mjs'],{cwd:root,env,stdio:['ignore','pipe','inherit']});
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('fixture startup timeout')),10000);server.once('exit',code=>{clearTimeout(timer);reject(Error('fixture exit '+code));});server.stdout.once('data',()=>{clearTimeout(timer);resolve();});});
 run('node',['scripts/fixtures/management/acceptance.mjs']);
 run('node',['scripts/fixtures/management/regressions.mjs']);
}finally{server?.kill();await rm(scratch,{recursive:true,force:true});}
