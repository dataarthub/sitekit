import assert from 'node:assert/strict';
import {cp,mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
const root=resolve(import.meta.dirname,'..'),temporary=await mkdtemp(join(tmpdir(),'alneas-example-'));
async function run(args,cwd,extra={}){const child=Bun.spawn(args,{cwd,env:{...process.env,NPM_CONFIG_USERCONFIG:'/dev/null',...extra},stdout:'pipe',stderr:'pipe'});const out=await new Response(child.stdout).text(),err=await new Response(child.stderr).text();assert.equal(await child.exited,0,out+'\n'+err);}
let server;
try{
 await run(['bun','run','build'],root);
 const archive=join(temporary,'core.tgz');await run(['bun','pm','pack','--ignore-scripts','--filename',archive],join(root,'packages/core'));
 const site=join(temporary,'site');await cp(join(root,'examples/basic'),site,{recursive:true});
 const p=JSON.parse(await readFile(join(site,'package.json'),'utf8'));p.dependencies['@alneas/sitekit']='file:'+archive;await writeFile(join(site,'package.json'),JSON.stringify(p));
 await run(['npm','install','--ignore-scripts','--no-audit','--no-fund'],site);
 await run(['npm','run','build'],site,{SITE_SNAPSHOT_URL:''});
 const file=await readFile(join(site,'dist/index.html'),'utf8');assert(file.includes('Hello from ALNEAS'));
 const snapshot=await readFile(join(site,'snapshot.json'),'utf8');let reads=0;
 server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(){reads++;return new Response(snapshot,{headers:{'Content-Type':'application/json'}})}});
 await run(['npm','run','build'],site,{SITE_SNAPSHOT_URL:server.url.href});
 assert.equal(reads,1);assert.equal(await readFile(join(site,'dist/index.html'),'utf8'),file);
 console.log('npm-installed example built identical HTML from file and managed-compatible HTTP snapshot.');
}finally{server?.stop(true);await rm(temporary,{recursive:true,force:true});}
